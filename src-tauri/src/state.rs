use std::sync::Mutex;

/// Shared application state. The mutex serializes registry reads and writes so a
/// concurrent pick and open cannot interleave; it is held only for the duration
/// of a single registry read plus write, never across the folder dialog, the
/// traversal, or IPC serialization.
pub struct AppState {
    pub registry_lock: Mutex<()>,
}

impl AppState {
    pub fn new() -> Self {
        Self { registry_lock: Mutex::new(()) }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
