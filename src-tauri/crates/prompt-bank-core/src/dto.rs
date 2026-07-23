use serde::Serialize;

use crate::errors::PromptFsError;
use crate::prompt_fs::PromptFile;
use crate::registry::WorkspaceRecord;

/// The global prompt set returned to the frontend.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalPrompts {
    pub files: Vec<PromptFile>,
}

/// One remembered workspace, without file contents, for the recents surface.
/// `display_path` is the user's own local path, shown only in their app.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub id: String,
    pub label: String,
    pub display_path: String,
    pub last_opened: Option<String>,
}

impl From<&WorkspaceRecord> for WorkspaceSummary {
    fn from(record: &WorkspaceRecord) -> Self {
        WorkspaceSummary {
            id: record.id.clone(),
            label: record.label.clone(),
            display_path: record.path.clone(),
            last_opened: record.last_opened.clone(),
        }
    }
}

/// An opened folder workspace and its prompts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedWorkspace {
    pub workspace_id: String,
    pub label: String,
    pub files: Vec<PromptFile>,
}

/// A structured, path-free error returned to the frontend. `kind` is stable for
/// programmatic handling; `message` never contains an absolute path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub kind: String,
    pub message: String,
}

impl CommandError {
    pub fn new(kind: &str, message: &str) -> Self {
        CommandError { kind: kind.to_string(), message: message.to_string() }
    }
}

impl From<PromptFsError> for CommandError {
    fn from(err: PromptFsError) -> Self {
        CommandError { kind: err.kind().to_string(), message: err.user_message().to_string() }
    }
}
