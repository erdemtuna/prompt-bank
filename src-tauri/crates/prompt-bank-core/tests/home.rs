use std::path::PathBuf;

use prompt_bank_core::{resolve_global_dir_with, PromptFsError};

#[test]
fn absolute_override_is_honored() {
    let dir = resolve_global_dir_with(
        Some(PathBuf::from("/opt/prompts")),
        Some(PathBuf::from("/home/u")),
    )
    .unwrap();
    assert_eq!(dir, PathBuf::from("/opt/prompts"));
}

#[test]
fn relative_override_is_rejected() {
    let err = resolve_global_dir_with(
        Some(PathBuf::from("relative/dir")),
        Some(PathBuf::from("/home/u")),
    )
    .unwrap_err();
    assert!(matches!(err, PromptFsError::NotAbsolute(_)), "{err:?}");
}

#[test]
fn default_is_home_dot_prompt_bank() {
    let dir = resolve_global_dir_with(None, Some(PathBuf::from("/home/u"))).unwrap();
    assert_eq!(dir, PathBuf::from("/home/u/.prompt-bank"));
}

#[test]
fn no_home_is_an_error() {
    let err = resolve_global_dir_with(None, None).unwrap_err();
    assert!(matches!(err, PromptFsError::NoHome), "{err:?}");
}
