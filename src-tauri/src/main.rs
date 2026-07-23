#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod dto;
mod state;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::read_global_prompts,
            commands::list_workspaces,
            commands::pick_workspace,
            commands::open_workspace,
            commands::remove_workspace,
            commands::set_window_title,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Prompt Bank desktop app");
}
