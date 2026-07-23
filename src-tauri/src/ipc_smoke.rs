//! Native IPC smoke test using Tauri's mock runtime. This exercises the real
//! commands end to end over the IPC path, against real fixture directories, so
//! the async command wiring, managed state, and DTO serialization are proven on
//! this machine. It compiles the desktop crate (which needs the webview
//! libraries), so it runs locally, not in the headless CI, which covers the pure
//! core crate instead.

use std::fs;

use serde_json::{json, Value};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{mock_builder, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::WebviewWindowBuilder;

use prompt_bank_core::{save_registry, upsert_workspace, Registry, REGISTRY_FILE};

fn build_app() -> tauri::App<tauri::test::MockRuntime> {
    mock_builder()
        .manage(crate::state::AppState::new())
        .invoke_handler(tauri::generate_handler![
            crate::commands::read_global_prompts,
            crate::commands::list_workspaces,
            crate::commands::open_workspace,
            crate::commands::remove_workspace,
            crate::commands::set_window_title,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build the mock app")
}

fn request(cmd: &str, body: Value) -> InvokeRequest {
    InvokeRequest {
        cmd: cmd.into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: "tauri://localhost".parse().unwrap(),
        body: InvokeBody::Json(body),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.to_string(),
    }
}

fn valid_prompt(id: &str, title: &str, category: &str) -> String {
    format!("---\nid: {id}\ntitle: {title}\ndescription: A {title} prompt\ncategory: {category}\n---\nBody for {id}.")
}

#[test]
fn commands_read_global_and_folder_prompts_over_ipc() {
    let home = tempfile::tempdir().unwrap();
    std::env::set_var("PROMPT_BANK_HOME", home.path());

    fs::create_dir_all(home.path().join("writing")).unwrap();
    fs::write(home.path().join("writing/g.md"), valid_prompt("g", "G", "writing")).unwrap();

    let workspace = tempfile::tempdir().unwrap();
    fs::create_dir_all(workspace.path().join(".prompt-bank/review")).unwrap();
    fs::write(workspace.path().join(".prompt-bank/review/f.md"), valid_prompt("f", "F", "review")).unwrap();

    // Register the workspace directly so the test has an id to open.
    let canonical = fs::canonicalize(workspace.path()).unwrap();
    let canonical_str = canonical.to_str().unwrap().to_string();
    let mut registry = Registry::default();
    let id = upsert_workspace(&mut registry, &canonical_str, "ws", None);
    save_registry(&home.path().join(REGISTRY_FILE), &registry).unwrap();

    let app = build_app();
    let webview = WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();

    // read_global_prompts returns the one global prompt.
    let global: Value = tauri::test::get_ipc_response(&webview, request("read_global_prompts", json!({})))
        .unwrap()
        .deserialize()
        .unwrap();
    assert_eq!(global["files"].as_array().unwrap().len(), 1);
    assert_eq!(global["files"][0]["relativePath"], "writing/g.md");

    // list_workspaces returns the registered workspace.
    let list: Value = tauri::test::get_ipc_response(&webview, request("list_workspaces", json!({})))
        .unwrap()
        .deserialize()
        .unwrap();
    assert_eq!(list.as_array().unwrap().len(), 1);
    assert_eq!(list[0]["id"], id);
    assert_eq!(list[0]["label"], "ws");

    // open_workspace reads the folder's .prompt-bank tree.
    let opened: Value = tauri::test::get_ipc_response(&webview, request("open_workspace", json!({ "id": id })))
        .unwrap()
        .deserialize()
        .unwrap();
    assert_eq!(opened["workspaceId"], id);
    assert_eq!(opened["files"].as_array().unwrap().len(), 1);
    assert_eq!(opened["files"][0]["relativePath"], "review/f.md");

    // remove_workspace empties the recents list.
    let after: Value = tauri::test::get_ipc_response(&webview, request("remove_workspace", json!({ "id": id })))
        .unwrap()
        .deserialize()
        .unwrap();
    assert_eq!(after.as_array().unwrap().len(), 0);

    std::env::remove_var("PROMPT_BANK_HOME");
}
