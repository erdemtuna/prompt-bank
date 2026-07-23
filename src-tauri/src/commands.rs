use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, State, Window};
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

/// Read the global prompt set from the resolved home. Needs no arguments and no
/// registry access, so it takes no lock.
#[tauri::command]
pub fn read_global_prompts() -> Result<GlobalPrompts, CommandError> {
    let dir = resolve_global_dir()?;
    let files = read_markdown_tree(&dir, &ReadLimits::default())?;
    Ok(GlobalPrompts { files })
}

/// List the remembered workspaces from the registry.
#[tauri::command]
pub fn list_workspaces(state: State<'_, AppState>) -> Result<Vec<WorkspaceSummary>, CommandError> {
    let _guard = state.registry_lock.lock().unwrap();
    let registry = load_registry(&registry_file()?)?;
    Ok(registry.workspaces.iter().map(WorkspaceSummary::from).collect())
}

/// Open the native folder picker from Rust, register the chosen folder, and read
/// its prompts. This is the only command that adds a workspace. Returns `None`
/// when the user cancels the dialog.
#[tauri::command]
pub fn pick_workspace(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<OpenedWorkspace>, CommandError> {
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = picked
        .into_path()
        .map_err(|_| CommandError::new("io", "The selected folder path is not valid."))?;
    let canonical =
        std::fs::canonicalize(&path).map_err(|err| CommandError::from(PromptFsError::Io(err)))?;
    let canonical_str = canonical.to_string_lossy().to_string();
    let label = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(DEFAULT_LABEL)
        .to_string();

    let id = {
        let _guard = state.registry_lock.lock().unwrap();
        let file = registry_file()?;
        let mut registry = load_registry(&file)?;
        let id = upsert_workspace(&mut registry, &canonical_str, &label, Some(now_seconds()));
        save_registry(&file, &registry)?;
        id
    };

    let files = read_workspace_prompts(&canonical)?;
    Ok(Some(OpenedWorkspace { workspace_id: id, label, files }))
}

/// Open a workspace that is already in the registry, addressed by its opaque id.
/// The registered target is re-verified on every open, so a moved or swapped
/// folder is refused rather than read.
#[tauri::command]
pub fn open_workspace(
    state: State<'_, AppState>,
    id: String,
) -> Result<OpenedWorkspace, CommandError> {
    let record = {
        let _guard = state.registry_lock.lock().unwrap();
        let file = registry_file()?;
        let mut registry = load_registry(&file)?;
        let record = find_by_id(&registry, &id)
            .ok_or_else(|| CommandError::new("not_found", "That workspace is not in the recents list."))?
            .clone();

        let current = std::fs::canonicalize(&record.path)
            .map_err(|err| CommandError::from(PromptFsError::Io(err)))?;
        if current.to_string_lossy() != record.path {
            return Err(CommandError::new("moved", "The workspace folder has moved or changed."));
        }

        upsert_workspace(&mut registry, &record.path, &record.label, Some(now_seconds()));
        save_registry(&file, &registry)?;
        record
    };

    let files = read_workspace_prompts(Path::new(&record.path))?;
    Ok(OpenedWorkspace { workspace_id: record.id, label: record.label, files })
}

/// Forget a workspace by id and return the updated recents list.
#[tauri::command]
pub fn remove_workspace(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<WorkspaceSummary>, CommandError> {
    let _guard = state.registry_lock.lock().unwrap();
    let file = registry_file()?;
    let mut registry = load_registry(&file)?;
    registry_remove(&mut registry, &id);
    save_registry(&file, &registry)?;
    Ok(registry.workspaces.iter().map(WorkspaceSummary::from).collect())
}

/// Set the window title from Rust, so no window permission is exposed to the
/// frontend. The frontend passes the desired title (for example the active tab's
/// folder name).
#[tauri::command]
pub fn set_window_title(window: Window, title: String) {
    let _ = window.set_title(&title);
}
