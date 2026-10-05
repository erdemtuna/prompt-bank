use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

use prompt_bank_core::{
    favorites::decode_favorites, read_favorites, set_favorite, CommandError, FavoriteSnapshot,
    FavoriteSource, FavoritesError, PromptReference, FAVORITES_FILE, MAX_FAVORITES_BYTES,
    MAX_FAVORITES_COUNT,
};
use tempfile::tempdir;

fn reference(source: FavoriteSource, workspace_id: Option<&str>, id: &str) -> PromptReference {
    PromptReference {
        source,
        workspace_id: workspace_id.map(str::to_owned),
        prompt_id: id.into(),
    }
}

#[test]
fn favorites_wire_shape_matches_frontend() {
    let snapshot = FavoriteSnapshot {
        version: 1,
        favorites: vec![reference(FavoriteSource::Builtin, None, "same-id")],
    };
    assert_eq!(
        serde_json::to_string(&snapshot).unwrap(),
        r#"{"version":1,"favorites":[{"source":"builtin","workspaceId":null,"promptId":"same-id"}]}"#
    );
    assert!(serde_json::from_str::<PromptReference>(
        r#"{"source":"builtin","promptId":"same-id"}"#
    )
    .is_err());
}

#[test]
fn missing_store_is_empty_and_does_not_create_the_directory() {
    let dir = tempdir().unwrap();
    let missing = dir.path().join("missing");
    assert_eq!(
        read_favorites(&missing).unwrap(),
        FavoriteSnapshot::default()
    );
    assert!(!missing.exists());
}

#[test]
fn add_remove_roundtrip_is_idempotent_and_source_qualified() {
    let dir = tempdir().unwrap();
    let refs = [
        reference(FavoriteSource::Builtin, None, "same-id"),
        reference(FavoriteSource::Global, None, "same-id"),
        reference(FavoriteSource::Folder, Some("ws1"), "same-id"),
        reference(FavoriteSource::Folder, Some("ws2"), "same-id"),
    ];
    for item in refs.iter().rev() {
        set_favorite(dir.path(), item.clone(), true).unwrap();
    }
    let snapshot = read_favorites(dir.path()).unwrap();
    assert_eq!(snapshot.favorites, refs);
    assert_eq!(
        set_favorite(dir.path(), refs[0].clone(), true).unwrap(),
        snapshot
    );
    let after = set_favorite(dir.path(), refs[0].clone(), false).unwrap();
    assert_eq!(after.favorites.len(), 3);
    assert_eq!(
        set_favorite(dir.path(), refs[0].clone(), false).unwrap(),
        after
    );
}

#[test]
fn corrupt_future_duplicate_and_extra_data_are_preserved() {
    let dir = tempdir().unwrap();
    let path = dir.path().join(FAVORITES_FILE);
    for raw in [
        "{bad json",
        r#"{"version":99,"futureData":true}"#,
        r#"{"version":1,"favorites":[],"controls":{"model":"private"}}"#,
        r#"{"version":1,"favorites":[{"source":"builtin","workspaceId":null,"promptId":"a"},{"source":"builtin","workspaceId":null,"promptId":"a"}]}"#,
    ] {
        fs::write(&path, raw).unwrap();
        assert!(set_favorite(
            dir.path(),
            reference(FavoriteSource::Builtin, None, "a"),
            true
        )
        .is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), raw);
    }
}

#[test]
fn rejects_invalid_references_without_writing_data() {
    let dir = tempdir().unwrap();
    for item in [
        reference(FavoriteSource::Builtin, Some("ws1"), "a"),
        reference(FavoriteSource::Folder, None, "a"),
        reference(FavoriteSource::Folder, Some("C:\\private"), "a"),
        reference(FavoriteSource::Global, None, "../private"),
    ] {
        assert!(matches!(
            set_favorite(dir.path(), item, true),
            Err(FavoritesError::InvalidReference)
        ));
    }
    assert!(!dir.path().join(FAVORITES_FILE).exists());
}

#[test]
fn enforces_byte_and_reference_limits() {
    let too_large = vec![b' '; MAX_FAVORITES_BYTES as usize + 1];
    assert!(matches!(
        decode_favorites(&too_large),
        Err(FavoritesError::TooLarge)
    ));
    let favorites = (0..MAX_FAVORITES_COUNT)
        .map(|index| reference(FavoriteSource::Builtin, None, &format!("prompt-{index}")))
        .collect::<Vec<_>>();
    let snapshot = FavoriteSnapshot {
        version: 1,
        favorites,
    };
    let bytes = serde_json::to_vec(&snapshot).unwrap();
    assert_eq!(
        decode_favorites(&bytes).unwrap().favorites.len(),
        MAX_FAVORITES_COUNT
    );
    let dir = tempdir().unwrap();
    fs::write(dir.path().join(FAVORITES_FILE), &bytes).unwrap();
    assert!(matches!(
        set_favorite(
            dir.path(),
            reference(FavoriteSource::Builtin, None, "extra"),
            true
        ),
        Err(FavoritesError::TooLarge)
    ));
    assert_eq!(fs::read(dir.path().join(FAVORITES_FILE)).unwrap(), bytes);
}

#[test]
fn favorites_lock_child() {
    let Ok(root) = std::env::var("PROMPT_BANK_TEST_FAVORITES_LOCK") else {
        return;
    };
    let file = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(std::path::Path::new(&root).join(".favorites.lock"))
        .unwrap();
    fs2::FileExt::lock_exclusive(&file).unwrap();
    println!("lock-ready");
    std::io::stdout().flush().unwrap();
    let mut release = String::new();
    std::io::stdin().read_line(&mut release).unwrap();
    drop(file);
    set_favorite(
        std::path::Path::new(&root),
        reference(FavoriteSource::Global, None, "child"),
        true,
    )
    .unwrap();
}

#[test]
fn a_separate_process_cannot_interleave_the_transaction() {
    let dir = tempdir().unwrap();
    let mut child = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "favorites_lock_child", "--nocapture"])
        .env("PROMPT_BANK_TEST_FAVORITES_LOCK", dir.path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());
    let mut line = String::new();
    loop {
        assert!(
            output.read_line(&mut line).unwrap() > 0,
            "lock helper exited before readiness"
        );
        if line.contains("lock-ready") {
            break;
        }
        line.clear();
    }
    let result = set_favorite(
        dir.path(),
        reference(FavoriteSource::Builtin, None, "a"),
        true,
    );
    child.stdin.take().unwrap().write_all(b"release\n").unwrap();
    assert!(child.wait().unwrap().success());
    assert!(matches!(result, Err(FavoritesError::Busy)), "{result:?}");
    set_favorite(
        dir.path(),
        reference(FavoriteSource::Builtin, None, "a"),
        true,
    )
    .unwrap();
    assert_eq!(
        read_favorites(dir.path()).unwrap().favorites,
        vec![
            reference(FavoriteSource::Builtin, None, "a"),
            reference(FavoriteSource::Global, None, "child")
        ]
    );
}

#[test]
fn errors_are_path_free() {
    let error = FavoritesError::Storage(prompt_bank_core::PromptFsError::Symlink(
        std::path::PathBuf::from("/private/favorites.json"),
    ));
    let dto = CommandError::from(error);
    assert_eq!(dto.kind, "symlink");
    assert!(!dto.message.contains("/private"));
}

#[cfg(unix)]
#[test]
fn rejects_symlinked_roots_data_and_locks() {
    use std::os::unix::fs::symlink;
    let dir = tempdir().unwrap();
    let real = dir.path().join("real");
    fs::create_dir(&real).unwrap();
    let root_link = dir.path().join("link");
    symlink(&real, &root_link).unwrap();
    assert!(read_favorites(&root_link).is_err());
    assert!(set_favorite(
        &root_link,
        reference(FavoriteSource::Builtin, None, "a"),
        true
    )
    .is_err());
    let outside = dir.path().join("outside.json");
    fs::write(&outside, r#"{"version":1,"favorites":[]}"#).unwrap();
    symlink(&outside, real.join(FAVORITES_FILE)).unwrap();
    assert!(read_favorites(&real).is_err());
    assert!(set_favorite(&real, reference(FavoriteSource::Builtin, None, "a"), true).is_err());
    assert!(!real.join(".favorites.lock").exists());
    fs::remove_file(real.join(FAVORITES_FILE)).unwrap();
    symlink(&outside, real.join(".favorites.lock")).unwrap();
    assert!(set_favorite(&real, reference(FavoriteSource::Builtin, None, "a"), true).is_err());
    assert_eq!(
        fs::read_to_string(&outside).unwrap(),
        r#"{"version":1,"favorites":[]}"#
    );
}
