use std::env;
use std::path::PathBuf;

use crate::errors::PromptFsError;

/// Resolve the global prompt directory. `PROMPT_BANK_HOME`, when set, overrides
/// the default and must be an absolute path. Otherwise the default is
/// `<home>/.prompt-bank`.
pub fn resolve_global_dir() -> Result<PathBuf, PromptFsError> {
    let override_value = env::var_os("PROMPT_BANK_HOME").map(PathBuf::from);
    resolve_global_dir_with(override_value, dirs::home_dir())
}

/// The pure form used by tests: no environment or platform lookups.
pub fn resolve_global_dir_with(
    override_value: Option<PathBuf>,
    home_dir: Option<PathBuf>,
) -> Result<PathBuf, PromptFsError> {
    if let Some(path) = override_value {
        if !path.is_absolute() {
            return Err(PromptFsError::NotAbsolute(path));
        }
        return Ok(path);
    }
    let home = home_dir.ok_or(PromptFsError::NoHome)?;
    Ok(home.join(".prompt-bank"))
}
