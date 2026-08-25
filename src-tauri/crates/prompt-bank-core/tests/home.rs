use std::path::PathBuf;

use prompt_bank_core::{resolve_global_dir_with, PromptFsError};

fn absolute_fixture(name: &str) -> PathBuf {
    std::env::current_dir().unwrap().join("test-fixtures").join(name)
}

#[test]
fn absolute_override_is_honored() {
    let override_dir = absolute_fixture("prompts");
    let dir =
        resolve_global_dir_with(Some(override_dir.clone()), Some(absolute_fixture("home"))).unwrap();
    assert_eq!(dir, override_dir);
}

#[test]
fn relative_override_is_rejected() {
    let err = resolve_global_dir_with(
        Some(PathBuf::from("relative/dir")),
        Some(absolute_fixture("home")),
    )
    .unwrap_err();
    assert!(matches!(err, PromptFsError::NotAbsolute(_)), "{err:?}");
}

#[test]
fn default_is_home_dot_prompt_bank() {
    let home = absolute_fixture("home");
    let dir = resolve_global_dir_with(None, Some(home.clone())).unwrap();
    assert_eq!(dir, home.join(".prompt-bank"));
}

#[test]
fn no_home_is_an_error() {
    let err = resolve_global_dir_with(None, None).unwrap_err();
    assert!(matches!(err, PromptFsError::NoHome), "{err:?}");
}
