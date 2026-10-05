use std::fs;
use std::io::Write;
use std::path::Path;

use crate::errors::PromptFsError;

pub(crate) fn write_atomic_bytes(path: &Path, bytes: &[u8]) -> Result<(), PromptFsError> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => {
            return Err(PromptFsError::Symlink(path.to_path_buf()));
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(PromptFsError::Io(error)),
    }
    let parent = path
        .parent()
        .ok_or_else(|| PromptFsError::NotADirectory(path.to_path_buf()))?;
    fs::create_dir_all(parent).map_err(PromptFsError::Io)?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(PromptFsError::Io)?;
    temporary.write_all(bytes).map_err(PromptFsError::Io)?;
    temporary
        .persist(path)
        .map_err(|error| PromptFsError::Io(error.error))?;
    Ok(())
}
