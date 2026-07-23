use std::fmt;
use std::path::PathBuf;

/// Errors returned by the pure core. Messages never include file contents, and
/// only include a path where it is safe and useful for diagnosis.
#[derive(Debug)]
pub enum PromptFsError {
    Io(std::io::Error),
    /// A `PROMPT_BANK_HOME` override that is not an absolute path.
    NotAbsolute(PathBuf),
    /// No home directory could be resolved and no override was given.
    NoHome,
    /// A symlink was encountered where one is not allowed (root, entry, or the
    /// registry file). Symlinks are rejected rather than followed.
    Symlink(PathBuf),
    NotADirectory(PathBuf),
    /// A file was not valid UTF-8.
    NonUtf8(String),
    /// A walked entry resolved outside the canonical root.
    Escapes(PathBuf),
    FileTooLarge { path: String, limit: u64 },
    TotalTooLarge { limit: u64 },
    TooManyFiles { limit: usize },
    TooManyEntries { limit: usize },
    PathTooLong { path: String, limit: usize },
    /// Directory nesting exceeded the depth limit.
    TooDeep { limit: usize },
    /// The registry file declared a version this build does not understand. The
    /// registry is left untouched (fail closed).
    UnknownRegistryVersion(u32),
    Json(serde_json::Error),
}

impl fmt::Display for PromptFsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PromptFsError::Io(err) => write!(f, "filesystem error: {err}"),
            PromptFsError::NotAbsolute(path) => {
                write!(f, "PROMPT_BANK_HOME must be an absolute path: {}", path.display())
            }
            PromptFsError::NoHome => write!(f, "could not resolve a home directory"),
            PromptFsError::Symlink(path) => {
                write!(f, "symlinks are not allowed: {}", path.display())
            }
            PromptFsError::NotADirectory(path) => {
                write!(f, "not a directory: {}", path.display())
            }
            PromptFsError::NonUtf8(path) => write!(f, "file is not valid UTF-8: {path}"),
            PromptFsError::Escapes(path) => {
                write!(f, "entry escapes the workspace root: {}", path.display())
            }
            PromptFsError::FileTooLarge { path, limit } => {
                write!(f, "file exceeds the {limit} byte limit: {path}")
            }
            PromptFsError::TotalTooLarge { limit } => {
                write!(f, "prompts exceed the {limit} byte aggregate limit")
            }
            PromptFsError::TooManyFiles { limit } => {
                write!(f, "more than {limit} prompt files")
            }
            PromptFsError::TooManyEntries { limit } => {
                write!(f, "more than {limit} directory entries")
            }
            PromptFsError::PathTooLong { path, limit } => {
                write!(f, "path exceeds the {limit} character limit: {path}")
            }
            PromptFsError::TooDeep { limit } => {
                write!(f, "directory nesting exceeds the {limit} level limit")
            }
            PromptFsError::UnknownRegistryVersion(version) => {
                write!(f, "unsupported registry version {version}")
            }
            PromptFsError::Json(err) => write!(f, "registry is not valid JSON: {err}"),
        }
    }
}

impl std::error::Error for PromptFsError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            PromptFsError::Io(err) => Some(err),
            PromptFsError::Json(err) => Some(err),
            _ => None,
        }
    }
}

/// A stable machine-readable kind, so the desktop crate can map errors to a
/// structured DTO without string parsing.
impl PromptFsError {
    pub fn kind(&self) -> &'static str {
        match self {
            PromptFsError::Io(_) => "io",
            PromptFsError::NotAbsolute(_) => "not_absolute",
            PromptFsError::NoHome => "no_home",
            PromptFsError::Symlink(_) => "symlink",
            PromptFsError::NotADirectory(_) => "not_a_directory",
            PromptFsError::NonUtf8(_) => "non_utf8",
            PromptFsError::Escapes(_) => "escapes_root",
            PromptFsError::FileTooLarge { .. } => "file_too_large",
            PromptFsError::TotalTooLarge { .. } => "total_too_large",
            PromptFsError::TooManyFiles { .. } => "too_many_files",
            PromptFsError::TooManyEntries { .. } => "too_many_entries",
            PromptFsError::PathTooLong { .. } => "path_too_long",
            PromptFsError::TooDeep { .. } => "too_deep",
            PromptFsError::UnknownRegistryVersion(_) => "unknown_registry_version",
            PromptFsError::Json(_) => "json",
        }
    }

    /// A stable, path-free message safe to surface to the frontend. The `Display`
    /// impl may include a path for local logs; this never does.
    pub fn user_message(&self) -> &'static str {
        match self {
            PromptFsError::Io(_) => "A filesystem error occurred while reading prompts.",
            PromptFsError::NotAbsolute(_) => "PROMPT_BANK_HOME must be an absolute path.",
            PromptFsError::NoHome => "Could not resolve a home directory.",
            PromptFsError::Symlink(_) => "A symlink was found where it is not allowed.",
            PromptFsError::NotADirectory(_) => "The prompt path is not a directory.",
            PromptFsError::NonUtf8(_) => "A prompt file is not valid UTF-8.",
            PromptFsError::Escapes(_) => "A prompt file escapes the workspace folder.",
            PromptFsError::FileTooLarge { .. } => "A prompt file is too large.",
            PromptFsError::TotalTooLarge { .. } => "The prompts exceed the total size limit.",
            PromptFsError::TooManyFiles { .. } => "There are too many prompt files.",
            PromptFsError::TooManyEntries { .. } => "There are too many files in the folder.",
            PromptFsError::PathTooLong { .. } => "A prompt path is too long.",
            PromptFsError::TooDeep { .. } => "The prompt folder is nested too deeply.",
            PromptFsError::UnknownRegistryVersion(_) => "The workspace list has an unsupported version.",
            PromptFsError::Json(_) => "The workspace list is not valid JSON.",
        }
    }
}
