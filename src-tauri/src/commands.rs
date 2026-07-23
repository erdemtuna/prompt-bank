use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, Window};
use tauri_plugin_dialog::DialogExt;

use prompt_bank_core::{
    find_by_id, load_registry, read_markdown_tree, remove_workspace as registry_remove,
    resolve_global_dir, save_registry, upsert_workspace, PromptFile, PromptFsError, ReadLimits,
    REGISTRY_FILE,
};

use crate::dto::{CommandError, GlobalPrompts, OpenedWorkspace, WorkspaceSummary};
use crate::state::AppState;

const DEFAULT_LABEL: &str = "workspace";

fn registry_file() -> Result<PathBuf, CommandError> {
    Ok(resolve_global_dir()?.join(REGISTRY_FILE))
}

/// Read the `.prompt-bank` tree inside a workspace root. Only that subtree is
/// read; Markdown elsewhere in the workspace is never touched.
fn read_workspace_prompts(root: &Path) -> Result<Vec<PromptFile>, CommandError> {
    let dir = root.join(".prompt-bank");
    Ok(read_markdown_tree(&dir, &ReadLimits::default())?)
}

fn now_seconds() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0)
        .to_string()
}

/// Convert a canonical path to a String, rejecting non-UTF-8 rather than lossily
/// replacing characters, so the registry never stores an ambiguous path that
/// could fail to reopen or deduplicate.
fn path_to_string(path: &Path) -> Result<String, CommandError> {
    path.to_str()
        .map(|value| value.to_string())
        .ok_or_else(|| CommandError::new("non_utf8_path", "The folder path contains unsupported characters."))
}

/// Read the global prompt set from the resolved home. Needs no arguments and no
/// registry access, so it takes no lock. Runs off the main thread.
#[tauri::command]
pub async fn read_global_prompts() -> Result<GlobalPrompts, CommandError> {
    tauri::async_runtime::spawn_blocking(|| {
        let dir = resolve_global_dir()?;
        let files = read_markdown_tree(&dir, &ReadLimits::default())?;
        Ok(GlobalPrompts { files })
    })
    .await
    .map_err(|_| CommandError::new("panic", "Reading the global prompts stopped unexpectedly."))?
}

/// List the remembered workspaces from the registry.
#[tauri::command]
pub async fn list_workspaces(app: AppHandle) -> Result<Vec<WorkspaceSummary>, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _guard = state.registry_lock.lock().unwrap();
        let registry = load_registry(&registry_file()?)?;
        Ok(registry.workspaces.iter().map(WorkspaceSummary::from).collect())
    })
    .await
    .map_err(|_| CommandError::new("panic", "Reading the workspace list stopped unexpectedly."))?
}

/// Open the native folder picker from Rust, read the chosen folder's prompts, and
/// only then register it. This is the only command that adds a workspace. Returns
/// `None` when the user cancels. The blocking dialog and traversal run off the
/// main thread.
#[tauri::command]
pub async fn pick_workspace(app: AppHandle) -> Result<Option<OpenedWorkspace>, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(picked) = app.dialog().file().blocking_pick_folder() else {
            return Ok(None);
        };
        let path = picked
            .into_path()
            .map_err(|_| CommandError::new("io", "The selected folder path is not valid."))?;
        let canonical =
            std::fs::canonicalize(&path).map_err(|err| CommandError::from(PromptFsError::Io(err)))?;
        let canonical_str = path_to_string(&canonical)?;
        let label = canonical
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(DEFAULT_LABEL)
            .to_string();

        // Read first, so a rejected or unreadable folder is never added to recents.
        let files = read_workspace_prompts(&canonical)?;

        let state = app.state::<AppState>();
        let _guard = state.registry_lock.lock().unwrap();
        let file = registry_file()?;
        let mut registry = load_registry(&file)?;
        let id = upsert_workspace(&mut registry, &canonical_str, &label, Some(now_seconds()));
        save_registry(&file, &registry)?;

        Ok(Some(OpenedWorkspace { workspace_id: id, label, files }))
    })
    .await
    .map_err(|_| CommandError::new("panic", "Opening the folder stopped unexpectedly."))?
}

/// Open a workspace already in the registry, addressed by its opaque id. The
/// registered target is re-verified on every open, and the prompts are read
/// before `last_opened` is updated, so a moved or unreadable folder is refused
/// and does not appear freshly opened. The registry lock is released before the
/// traversal.
#[tauri::command]
pub async fn open_workspace(app: AppHandle, id: String) -> Result<OpenedWorkspace, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let record = {
            let state = app.state::<AppState>();
            let _guard = state.registry_lock.lock().unwrap();
            let registry = load_registry(&registry_file()?)?;
            find_by_id(&registry, &id)
                .ok_or_else(|| CommandError::new("not_found", "That workspace is not in the recents list."))?
                .clone()
        };

        let current = std::fs::canonicalize(&record.path)
            .map_err(|err| CommandError::from(PromptFsError::Io(err)))?;
        if path_to_string(&current)? != record.path {
            return Err(CommandError::new("moved", "The workspace folder has moved or changed."));
        }

        let files = read_workspace_prompts(Path::new(&record.path))?;

        {
            let state = app.state::<AppState>();
            let _guard = state.registry_lock.lock().unwrap();
            let file = registry_file()?;
            let mut registry = load_registry(&file)?;
            upsert_workspace(&mut registry, &record.path, &record.label, Some(now_seconds()));
            save_registry(&file, &registry)?;
        }

        Ok(OpenedWorkspace { workspace_id: record.id, label: record.label, files })
    })
    .await
    .map_err(|_| CommandError::new("panic", "Opening the workspace stopped unexpectedly."))?
}

/// Forget a workspace by id and return the updated recents list.
#[tauri::command]
pub async fn remove_workspace(app: AppHandle, id: String) -> Result<Vec<WorkspaceSummary>, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let _guard = state.registry_lock.lock().unwrap();
        let file = registry_file()?;
        let mut registry = load_registry(&file)?;
        registry_remove(&mut registry, &id);
        save_registry(&file, &registry)?;
        Ok(registry.workspaces.iter().map(WorkspaceSummary::from).collect())
    })
    .await
    .map_err(|_| CommandError::new("panic", "Updating the workspace list stopped unexpectedly."))?
}

/// Set the window title from Rust, so no window permission is exposed to the
/// frontend. The frontend passes the desired title (for example the active tab's
/// folder name).
#[tauri::command]
pub fn set_window_title(window: Window, title: String) {
    let _ = window.set_title(&title);
}
