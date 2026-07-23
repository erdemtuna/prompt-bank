//! Wire DTOs live in the pure `prompt-bank-core` crate so their exact JSON
//! shapes are unit tested on a headless runner and shared with the frontend.
//! This module re-exports them for the desktop commands.
pub use prompt_bank_core::{CommandError, GlobalPrompts, OpenedWorkspace, WorkspaceSummary};
