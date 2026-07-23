use prompt_bank_core::{
    find_by_id, load_registry, remove_workspace, save_registry, upsert_workspace, workspace_id,
    PromptFsError, Registry, REGISTRY_VERSION,
};
use tempfile::tempdir;

#[test]
fn missing_registry_loads_as_empty() {
    let dir = tempdir().unwrap();
    let registry = load_registry(&dir.path().join("workspaces.json")).unwrap();
    assert_eq!(registry.version, REGISTRY_VERSION);
    assert!(registry.workspaces.is_empty());
}

#[test]
fn save_then_load_roundtrips() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("workspaces.json");
    let mut registry = Registry::default();
    let id = upsert_workspace(&mut registry, "/home/u/proj", "proj", Some("2026".into()));

    save_registry(&path, &registry).unwrap();
    let loaded = load_registry(&path).unwrap();

    assert_eq!(loaded, registry);
    assert_eq!(find_by_id(&loaded, &id).unwrap().label, "proj");
}

#[test]
fn upsert_deduplicates_by_path_and_is_stable() {
    let mut registry = Registry::default();
    let first = upsert_workspace(&mut registry, "/home/u/proj", "proj", None);
    let second = upsert_workspace(&mut registry, "/home/u/proj", "renamed", None);

    assert_eq!(first, second);
    assert_eq!(registry.workspaces.len(), 1);
    assert_eq!(registry.workspaces[0].label, "renamed");
    assert_eq!(first, workspace_id("/home/u/proj"));
}

#[test]
fn remove_by_id_works() {
    let mut registry = Registry::default();
    let id = upsert_workspace(&mut registry, "/a", "a", None);

    assert!(remove_workspace(&mut registry, &id));
    assert!(registry.workspaces.is_empty());
    assert!(!remove_workspace(&mut registry, &id));
}

#[test]
fn unknown_version_fails_closed_without_overwrite() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("workspaces.json");
    std::fs::write(&path, r#"{"version":999,"workspaces":[]}"#).unwrap();

    let err = load_registry(&path).unwrap_err();
    assert!(matches!(err, PromptFsError::UnknownRegistryVersion(999)), "{err:?}");

    let raw = std::fs::read_to_string(&path).unwrap();
    assert!(raw.contains("999"), "the registry file must be left untouched");
}

#[test]
fn malformed_json_is_rejected() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("workspaces.json");
    std::fs::write(&path, "{not json").unwrap();

    let err = load_registry(&path).unwrap_err();
    assert!(matches!(err, PromptFsError::Json(_)), "{err:?}");
}

#[cfg(unix)]
#[test]
fn symlinked_registry_is_rejected() {
    use std::os::unix::fs::symlink;
    let dir = tempdir().unwrap();
    let real = dir.path().join("real.json");
    std::fs::write(&real, r#"{"version":1,"workspaces":[]}"#).unwrap();
    let link = dir.path().join("workspaces.json");
    symlink(&real, &link).unwrap();

    let err = load_registry(&link).unwrap_err();
    assert!(matches!(err, PromptFsError::Symlink(_)), "{err:?}");
}
