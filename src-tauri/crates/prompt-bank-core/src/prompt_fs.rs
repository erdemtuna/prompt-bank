use std::fs::{self, File};
use std::io::Read;
use std::path::Path;

use serde::Serialize;
use walkdir::WalkDir;

use crate::errors::PromptFsError;

/// One prompt Markdown file read from disk, keyed by its path relative to the
/// tree root, with forward slash separators so the frontend key is stable across
/// platforms. Serializes to the IPC shape `{ relativePath, contents }`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptFile {
    pub relative_path: String,
    pub contents: String,
}

/// Bounds that make an untrusted prompt tree safe to read into memory and ship
/// over IPC. Every bound fails closed rather than truncating.
#[derive(Debug, Clone)]
pub struct ReadLimits {
    pub max_file_bytes: u64,
    pub max_total_bytes: u64,
    pub max_files: usize,
    pub max_entries: usize,
    pub max_depth: usize,
    pub max_path_len: usize,
}

impl Default for ReadLimits {
    fn default() -> Self {
        Self {
            max_file_bytes: 1024 * 1024,
            max_total_bytes: 32 * 1024 * 1024,
            max_files: 5_000,
            max_entries: 50_000,
            max_depth: 32,
            max_path_len: 1_024,
        }
    }
}

/// Read every `.md` file under `dir`, rejecting symlinks and anything that
/// escapes the canonical root, and enforcing the given limits.
///
/// A missing directory is treated as an empty source, not an error, so a
/// workspace without a `.prompt-bank` folder simply contributes nothing.
pub fn read_markdown_tree(dir: &Path, limits: &ReadLimits) -> Result<Vec<PromptFile>, PromptFsError> {
    let meta = match fs::symlink_metadata(dir) {
        Ok(meta) => meta,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(PromptFsError::Io(err)),
    };
    if meta.file_type().is_symlink() {
        return Err(PromptFsError::Symlink(dir.to_path_buf()));
    }
    if !meta.is_dir() {
        return Err(PromptFsError::NotADirectory(dir.to_path_buf()));
    }

    let root = fs::canonicalize(dir).map_err(PromptFsError::Io)?;

    let mut files: Vec<PromptFile> = Vec::new();
    let mut total_bytes: u64 = 0;
    let mut entry_count: usize = 0;

    let walker = WalkDir::new(&root)
        .follow_links(false)
        .max_depth(limits.max_depth.saturating_add(1))
        .sort_by_file_name();

    for entry in walker {
        let entry = entry.map_err(walkdir_to_err)?;

        if entry.depth() > limits.max_depth {
            return Err(PromptFsError::TooDeep { limit: limits.max_depth });
        }

        entry_count += 1;
        if entry_count > limits.max_entries {
            return Err(PromptFsError::TooManyEntries { limit: limits.max_entries });
        }

        let file_type = entry.file_type();
        if file_type.is_symlink() {
            return Err(PromptFsError::Symlink(entry.path().to_path_buf()));
        }
        if !file_type.is_file() {
            continue;
        }

        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }
        if !path.starts_with(&root) {
            return Err(PromptFsError::Escapes(path.to_path_buf()));
        }

        let relative = path
            .strip_prefix(&root)
            .map_err(|_| PromptFsError::Escapes(path.to_path_buf()))?;
        let relative_path = to_forward_slash(relative)
            .ok_or_else(|| PromptFsError::NonUtf8(relative.to_string_lossy().into_owned()))?;
        if relative_path.len() > limits.max_path_len {
            return Err(PromptFsError::PathTooLong {
                path: relative_path,
                limit: limits.max_path_len,
            });
        }

        let metadata = entry.metadata().map_err(walkdir_to_err)?;
        if metadata.len() > limits.max_file_bytes {
            return Err(PromptFsError::FileTooLarge {
                path: relative_path,
                limit: limits.max_file_bytes,
            });
        }

        let contents = read_bounded(path, limits.max_file_bytes, &relative_path)?;
        total_bytes += contents.len() as u64;
        if total_bytes > limits.max_total_bytes {
            return Err(PromptFsError::TotalTooLarge { limit: limits.max_total_bytes });
        }

        files.push(PromptFile { relative_path, contents });
        if files.len() > limits.max_files {
            return Err(PromptFsError::TooManyFiles { limit: limits.max_files });
        }
    }

    files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(files)
}

/// Read at most `max` bytes, failing closed if the file grew past the limit
/// since its metadata was checked, and requiring valid UTF-8.
fn read_bounded(path: &Path, max: u64, relative_path: &str) -> Result<String, PromptFsError> {
    let file = File::open(path).map_err(PromptFsError::Io)?;
    let mut buffer = Vec::new();
    file.take(max + 1)
        .read_to_end(&mut buffer)
        .map_err(PromptFsError::Io)?;
    if buffer.len() as u64 > max {
        return Err(PromptFsError::FileTooLarge {
            path: relative_path.to_string(),
            limit: max,
        });
    }
    String::from_utf8(buffer).map_err(|_| PromptFsError::NonUtf8(relative_path.to_string()))
}

fn to_forward_slash(relative: &Path) -> Option<String> {
    relative.to_str().map(|value| value.replace('\\', "/"))
}

fn walkdir_to_err(err: walkdir::Error) -> PromptFsError {
    let kind = err
        .io_error()
        .map(|io| io.kind())
        .unwrap_or(std::io::ErrorKind::Other);
    PromptFsError::Io(std::io::Error::new(kind, err.to_string()))
}
