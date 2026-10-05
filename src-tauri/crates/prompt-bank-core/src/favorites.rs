use std::collections::BTreeSet;
use std::fs::{self, File, OpenOptions};
use std::io::Read;
use std::path::{Path, PathBuf};

use fs2::FileExt;
use serde::{Deserialize, Deserializer, Serialize};

use crate::atomic_file::write_atomic_bytes;
use crate::errors::PromptFsError;

pub const FAVORITES_FILE: &str = "favorites.json";
pub const FAVORITES_VERSION: u32 = 1;
pub const MAX_FAVORITES_BYTES: u64 = 1024 * 1024;
pub const MAX_FAVORITES_COUNT: usize = 5000;
const FAVORITES_LOCK: &str = ".favorites.lock";

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FavoriteSource {
    Builtin,
    Global,
    Folder,
}

fn nullable_string<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(deserializer)
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PromptReference {
    pub source: FavoriteSource,
    #[serde(deserialize_with = "nullable_string")]
    pub workspace_id: Option<String>,
    pub prompt_id: String,
}

impl PromptReference {
    pub fn validate(&self) -> Result<(), FavoritesError> {
        let slug = !self.prompt_id.is_empty()
            && self.prompt_id.split('-').all(|part| {
                !part.is_empty()
                    && part
                        .bytes()
                        .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
            });
        let scope = match self.source {
            FavoriteSource::Builtin | FavoriteSource::Global => self.workspace_id.is_none(),
            FavoriteSource::Folder => self.workspace_id.as_ref().is_some_and(|id| {
                !id.is_empty()
                    && id
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
            }),
        };
        if !slug || !scope {
            return Err(FavoritesError::InvalidReference);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FavoriteSnapshot {
    pub version: u32,
    pub favorites: Vec<PromptReference>,
}

impl Default for FavoriteSnapshot {
    fn default() -> Self {
        Self {
            version: FAVORITES_VERSION,
            favorites: Vec::new(),
        }
    }
}

#[derive(Debug)]
pub enum FavoritesError {
    Storage(PromptFsError),
    InvalidReference,
    InvalidData,
    Json,
    UnknownVersion,
    TooLarge,
    Busy,
}

impl FavoritesError {
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Storage(error) => error.kind(),
            Self::InvalidReference | Self::InvalidData => "invalid_favorite",
            Self::Json => "json",
            Self::UnknownVersion => "unknown_favorites_version",
            Self::TooLarge => "favorites_too_large",
            Self::Busy => "favorites_busy",
        }
    }

    pub fn user_message(&self) -> &'static str {
        match self {
            Self::Storage(_) => "Favorites storage could not be accessed.",
            Self::InvalidReference => "The favorite reference is invalid.",
            Self::InvalidData => "Favorites data is invalid.",
            Self::Json => "Favorites data is not valid JSON.",
            Self::UnknownVersion => "Favorites have an unsupported version.",
            Self::TooLarge => "Favorites exceed the storage limit.",
            Self::Busy => "Favorites storage is busy. Try again.",
        }
    }
}

impl std::fmt::Display for FavoritesError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.user_message())
    }
}

impl std::error::Error for FavoritesError {}

impl From<PromptFsError> for FavoritesError {
    fn from(error: PromptFsError) -> Self {
        Self::Storage(error)
    }
}

fn io(error: std::io::Error) -> FavoritesError {
    FavoritesError::Storage(PromptFsError::Io(error))
}

fn validate_root(root: &Path, create: bool) -> Result<Option<PathBuf>, FavoritesError> {
    if !root.is_absolute() {
        return Err(PromptFsError::NotAbsolute(root.to_path_buf()).into());
    }
    match fs::symlink_metadata(root) {
        Ok(meta) if meta.file_type().is_symlink() => {
            return Err(PromptFsError::Symlink(root.to_path_buf()).into());
        }
        Ok(meta) if !meta.is_dir() => {
            return Err(PromptFsError::NotADirectory(root.to_path_buf()).into());
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(io(error)),
    }
    if !root.exists() {
        if !create {
            return Ok(None);
        }
        fs::create_dir_all(root).map_err(io)?;
    }
    let canonical = fs::canonicalize(root).map_err(io)?;
    let meta = fs::symlink_metadata(root).map_err(io)?;
    if meta.file_type().is_symlink() {
        return Err(PromptFsError::Symlink(root.to_path_buf()).into());
    }
    Ok(Some(canonical))
}

fn regular_file(path: &Path) -> Result<bool, FavoritesError> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => {
            Err(PromptFsError::Symlink(path.to_path_buf()).into())
        }
        Ok(meta) if !meta.is_file() => Err(FavoritesError::InvalidData),
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(io(error)),
    }
}

pub fn decode_favorites(bytes: &[u8]) -> Result<FavoriteSnapshot, FavoritesError> {
    if bytes.len() as u64 > MAX_FAVORITES_BYTES {
        return Err(FavoritesError::TooLarge);
    }
    let value: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|_| FavoritesError::Json)?;
    match value.get("version").and_then(serde_json::Value::as_u64) {
        Some(version) if version != u64::from(FAVORITES_VERSION) => {
            return Err(FavoritesError::UnknownVersion);
        }
        Some(_) => {}
        None => return Err(FavoritesError::InvalidData),
    }
    let mut snapshot: FavoriteSnapshot =
        serde_json::from_value(value).map_err(|_| FavoritesError::InvalidData)?;
    if snapshot.favorites.len() > MAX_FAVORITES_COUNT {
        return Err(FavoritesError::TooLarge);
    }
    let mut seen = BTreeSet::new();
    for reference in &snapshot.favorites {
        reference.validate()?;
        if !seen.insert(reference) {
            return Err(FavoritesError::InvalidData);
        }
    }
    snapshot.favorites.sort();
    Ok(snapshot)
}

pub fn read_favorites(root: &Path) -> Result<FavoriteSnapshot, FavoritesError> {
    let Some(root) = validate_root(root, false)? else {
        return Ok(FavoriteSnapshot::default());
    };
    let path = root.join(FAVORITES_FILE);
    if !regular_file(&path)? {
        return Ok(FavoriteSnapshot::default());
    }
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(io)?
        .take(MAX_FAVORITES_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(io)?;
    decode_favorites(&bytes)
}

struct FavoriteLock {
    file: File,
    locked: bool,
}

impl FavoriteLock {
    fn release(&mut self) -> Result<(), FavoritesError> {
        FileExt::unlock(&self.file).map_err(io)?;
        self.locked = false;
        Ok(())
    }
}

impl Drop for FavoriteLock {
    fn drop(&mut self) {
        if self.locked {
            let _ = FileExt::unlock(&self.file);
        }
    }
}

pub fn set_favorite(
    root: &Path,
    reference: PromptReference,
    favorite: bool,
) -> Result<FavoriteSnapshot, FavoritesError> {
    reference.validate()?;
    let root = validate_root(root, true)?.ok_or(FavoritesError::InvalidData)?;
    regular_file(&root.join(FAVORITES_FILE))?;
    let lock_path = root.join(FAVORITES_LOCK);
    regular_file(&lock_path)?;
    // Keep the lock on a stable file; atomic replacement changes the JSON file's inode.
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&lock_path)
        .map_err(io)?;
    regular_file(&lock_path)?;
    FileExt::try_lock_exclusive(&lock).map_err(|error| {
        if error.raw_os_error() == fs2::lock_contended_error().raw_os_error() {
            FavoritesError::Busy
        } else {
            io(error)
        }
    })?;
    let mut guard = FavoriteLock { file: lock, locked: true };
    let result = update_locked_favorite(&root, reference, favorite);
    // Explicit unlock also releases Unix locks shared with descriptors inherited by a child.
    guard.release()?;
    result
}

fn update_locked_favorite(
    root: &Path,
    reference: PromptReference,
    favorite: bool,
) -> Result<FavoriteSnapshot, FavoritesError> {
    let mut snapshot = read_favorites(root)?;
    let present = snapshot.favorites.contains(&reference);
    if present == favorite {
        return Ok(snapshot);
    }
    snapshot.favorites.retain(|item| item != &reference);
    if favorite {
        snapshot.favorites.push(reference);
    }
    if snapshot.favorites.len() > MAX_FAVORITES_COUNT {
        return Err(FavoritesError::TooLarge);
    }
    snapshot.favorites.sort();
    let bytes = serde_json::to_vec(&snapshot).map_err(|_| FavoritesError::InvalidData)?;
    if bytes.len() as u64 > MAX_FAVORITES_BYTES {
        return Err(FavoritesError::TooLarge);
    }
    write_atomic_bytes(&root.join(FAVORITES_FILE), &bytes)?;
    Ok(snapshot)
}
