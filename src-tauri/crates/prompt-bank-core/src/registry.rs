use std::fs;
use std::io::Write;
use std::path::Path;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::errors::PromptFsError;

pub const REGISTRY_VERSION: u32 = 1;
pub const REGISTRY_FILE: &str = "workspaces.json";

/// One remembered folder workspace. `path` is the canonical filesystem path and
/// `id` is an opaque, stable identifier derived from it, so the frontend never
/// holds or sends a raw path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkspaceRecord {
    pub id: String,
    pub path: String,
    pub label: String,
    #[serde(default)]
    pub last_opened: Option<String>,
}

/// The on-disk recents registry, versioned so an unknown future format fails
/// closed instead of being overwritten.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Registry {
    pub version: u32,
    #[serde(default)]
    pub workspaces: Vec<WorkspaceRecord>,
}

impl Default for Registry {
    fn default() -> Self {
        Self { version: REGISTRY_VERSION, workspaces: Vec::new() }
    }
}

/// Generate a fresh opaque id for a new workspace record. Ids are random and
/// persisted, so they are stable once assigned and collision-free, without
/// depending on any hash algorithm remaining stable across toolchains.
fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/// Load the registry, returning an empty one when the file does not exist. A
/// symlinked registry file is rejected, and an unknown version fails closed
/// without touching the file.
pub fn load_registry(path: &Path) -> Result<Registry, PromptFsError> {
    let meta = match fs::symlink_metadata(path) {
        Ok(meta) => meta,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Registry::default()),
        Err(err) => return Err(PromptFsError::Io(err)),
    };
    if meta.file_type().is_symlink() {
        return Err(PromptFsError::Symlink(path.to_path_buf()));
    }

    let raw = fs::read_to_string(path).map_err(PromptFsError::Io)?;
    let registry: Registry = serde_json::from_str(&raw).map_err(PromptFsError::Json)?;
    if registry.version != REGISTRY_VERSION {
        return Err(PromptFsError::UnknownRegistryVersion(registry.version));
    }
    Ok(registry)
}

/// Persist the registry atomically through a temp file in the same directory,
/// rejecting a symlinked target.
pub fn save_registry(path: &Path, registry: &Registry) -> Result<(), PromptFsError> {
    match fs::symlink_metadata(path) {
        Ok(meta) => {
            if meta.file_type().is_symlink() {
                return Err(PromptFsError::Symlink(path.to_path_buf()));
            }
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => return Err(PromptFsError::Io(err)),
    }

    let dir = path
        .parent()
        .ok_or_else(|| PromptFsError::NotADirectory(path.to_path_buf()))?;
    fs::create_dir_all(dir).map_err(PromptFsError::Io)?;

    let json = serde_json::to_string_pretty(registry).map_err(PromptFsError::Json)?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir).map_err(PromptFsError::Io)?;
    tmp.write_all(json.as_bytes()).map_err(PromptFsError::Io)?;
    tmp.write_all(b"\n").map_err(PromptFsError::Io)?;
    tmp.persist(path).map_err(|err| PromptFsError::Io(err.error))?;
    Ok(())
}

/// Insert or update a workspace, deduplicating by canonical path, and return its
/// stable id.
pub fn upsert_workspace(
    registry: &mut Registry,
    canonical_path: &str,
    label: &str,
    last_opened: Option<String>,
) -> String {
    if let Some(existing) = registry
        .workspaces
        .iter_mut()
        .find(|workspace| workspace.path == canonical_path)
    {
        existing.label = label.to_string();
        existing.last_opened = last_opened;
        return existing.id.clone();
    }

    let id = new_id();
    registry.workspaces.push(WorkspaceRecord {
        id: id.clone(),
        path: canonical_path.to_string(),
        label: label.to_string(),
        last_opened,
    });
    id
}

/// Remove a workspace by id, returning whether anything was removed.
pub fn remove_workspace(registry: &mut Registry, id: &str) -> bool {
    let before = registry.workspaces.len();
    registry.workspaces.retain(|workspace| workspace.id != id);
    registry.workspaces.len() != before
}

/// Look up a workspace record by opaque id.
pub fn find_by_id<'a>(registry: &'a Registry, id: &str) -> Option<&'a WorkspaceRecord> {
    registry.workspaces.iter().find(|workspace| workspace.id == id)
}
