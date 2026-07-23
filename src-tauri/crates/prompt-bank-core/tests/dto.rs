// Golden serialization shapes for the IPC DTOs. The frontend adapter and its
// mock tests must match these exact camelCase shapes, so this is the shared
// contract between Rust and TypeScript.
use prompt_bank_core::{CommandError, GlobalPrompts, OpenedWorkspace, PromptFile, WorkspaceSummary};

#[test]
fn prompt_file_serializes_camel_case() {
    let file = PromptFile { relative_path: "review/foo.md".into(), contents: "body".into() };
    let json = serde_json::to_string(&file).unwrap();
    assert_eq!(json, r#"{"relativePath":"review/foo.md","contents":"body"}"#);
}

#[test]
fn global_prompts_shape() {
    let dto = GlobalPrompts {
        files: vec![PromptFile { relative_path: "a.md".into(), contents: "x".into() }],
    };
    let json = serde_json::to_string(&dto).unwrap();
    assert_eq!(json, r#"{"files":[{"relativePath":"a.md","contents":"x"}]}"#);
}

#[test]
fn opened_workspace_shape() {
    let dto = OpenedWorkspace { workspace_id: "ws1".into(), label: "proj".into(), files: vec![] };
    let json = serde_json::to_string(&dto).unwrap();
    assert_eq!(json, r#"{"workspaceId":"ws1","label":"proj","files":[]}"#);
}

#[test]
fn workspace_summary_shape() {
    let dto = WorkspaceSummary {
        id: "ws1".into(),
        label: "proj".into(),
        display_path: "/home/u/proj".into(),
        last_opened: Some("123".into()),
    };
    let json = serde_json::to_string(&dto).unwrap();
    assert_eq!(json, r#"{"id":"ws1","label":"proj","displayPath":"/home/u/proj","lastOpened":"123"}"#);
}

#[test]
fn workspace_summary_null_last_opened() {
    let dto = WorkspaceSummary {
        id: "ws1".into(),
        label: "proj".into(),
        display_path: "/home/u/proj".into(),
        last_opened: None,
    };
    let json = serde_json::to_string(&dto).unwrap();
    assert_eq!(json, r#"{"id":"ws1","label":"proj","displayPath":"/home/u/proj","lastOpened":null}"#);
}

#[test]
fn command_error_shape() {
    let err = CommandError::new("symlink", "A symlink was found where it is not allowed.");
    let json = serde_json::to_string(&err).unwrap();
    assert_eq!(json, r#"{"kind":"symlink","message":"A symlink was found where it is not allowed."}"#);
}
