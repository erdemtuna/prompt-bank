//! Pure core logic for Prompt Bank: reading private Markdown prompt trees,
//! resolving the global prompt home, and persisting the workspace registry.
//!
//! This crate has no Tauri, wry, or GTK dependency on purpose, so `cargo test`
//! runs on a headless runner with no webview libraries. The desktop crate wraps
//! these functions in narrow Tauri commands and owns all UI, window, and dialog
//! types.

pub mod errors;
pub mod home;
pub mod prompt_fs;
pub mod registry;

pub use errors::PromptFsError;
pub use home::{resolve_global_dir, resolve_global_dir_with};
pub use prompt_fs::{read_markdown_tree, PromptFile, ReadLimits};
pub use registry::{
    find_by_id, load_registry, remove_workspace, save_registry, upsert_workspace, workspace_id,
    Registry, WorkspaceRecord, REGISTRY_FILE, REGISTRY_VERSION,
};
