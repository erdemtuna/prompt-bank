use std::fs;
use std::path::Path;

use prompt_bank_core::{read_markdown_tree, PromptFsError, ReadLimits};
use tempfile::tempdir;

fn write(path: &Path, contents: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    fs::write(path, contents).unwrap();
}

#[test]
fn missing_directory_is_empty() {
    let dir = tempdir().unwrap();
    let files = read_markdown_tree(&dir.path().join("nope"), &ReadLimits::default()).unwrap();
    assert!(files.is_empty());
}

#[test]
fn empty_directory_is_empty() {
    let dir = tempdir().unwrap();
    let files = read_markdown_tree(dir.path(), &ReadLimits::default()).unwrap();
    assert!(files.is_empty());
}

#[test]
fn reads_nested_markdown_with_forward_slash_paths_sorted() {
    let dir = tempdir().unwrap();
    write(&dir.path().join("b.md"), "second");
    write(&dir.path().join("nested/a.md"), "first");
    write(&dir.path().join("nested/skip.txt"), "ignored");

    let files = read_markdown_tree(dir.path(), &ReadLimits::default()).unwrap();
    let paths: Vec<_> = files.iter().map(|file| file.relative_path.as_str()).collect();
    assert_eq!(paths, vec!["b.md", "nested/a.md"]);
    assert_eq!(files[1].contents, "first");
}

#[test]
fn ignores_non_markdown_files() {
    let dir = tempdir().unwrap();
    write(&dir.path().join("keep.md"), "x");
    write(&dir.path().join("note.txt"), "x");
    write(&dir.path().join("README"), "x");

    let files = read_markdown_tree(dir.path(), &ReadLimits::default()).unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].relative_path, "keep.md");
}

#[test]
fn markdown_outside_the_prompt_bank_dir_is_never_read() {
    let workspace = tempdir().unwrap();
    write(&workspace.path().join(".prompt-bank/inside.md"), "inside");
    write(&workspace.path().join("outside.md"), "outside");

    let files =
        read_markdown_tree(&workspace.path().join(".prompt-bank"), &ReadLimits::default()).unwrap();
    let paths: Vec<_> = files.iter().map(|file| file.relative_path.as_str()).collect();
    assert_eq!(paths, vec!["inside.md"]);
}

#[test]
fn rejects_a_file_larger_than_the_limit() {
    let dir = tempdir().unwrap();
    write(&dir.path().join("big.md"), &"a".repeat(2048));
    let limits = ReadLimits { max_file_bytes: 1024, ..ReadLimits::default() };

    let err = read_markdown_tree(dir.path(), &limits).unwrap_err();
    assert!(matches!(err, PromptFsError::FileTooLarge { .. }), "{err:?}");
}

#[test]
fn rejects_more_files_than_the_limit() {
    let dir = tempdir().unwrap();
    for index in 0..5 {
        write(&dir.path().join(format!("p{index}.md")), "x");
    }
    let limits = ReadLimits { max_files: 3, ..ReadLimits::default() };

    let err = read_markdown_tree(dir.path(), &limits).unwrap_err();
    assert!(matches!(err, PromptFsError::TooManyFiles { .. }), "{err:?}");
}

#[test]
fn rejects_total_bytes_over_the_limit() {
    let dir = tempdir().unwrap();
    write(&dir.path().join("a.md"), &"a".repeat(600));
    write(&dir.path().join("b.md"), &"b".repeat(600));
    let limits =
        ReadLimits { max_file_bytes: 1024, max_total_bytes: 1000, ..ReadLimits::default() };

    let err = read_markdown_tree(dir.path(), &limits).unwrap_err();
    assert!(matches!(err, PromptFsError::TotalTooLarge { .. }), "{err:?}");
}

#[test]
fn rejects_too_many_entries() {
    let dir = tempdir().unwrap();
    for index in 0..8 {
        write(&dir.path().join(format!("p{index}.md")), "x");
    }
    let limits = ReadLimits { max_entries: 3, ..ReadLimits::default() };

    let err = read_markdown_tree(dir.path(), &limits).unwrap_err();
    assert!(matches!(err, PromptFsError::TooManyEntries { .. }), "{err:?}");
}

#[test]
fn rejects_a_relative_path_over_the_length_limit() {
    let dir = tempdir().unwrap();
    write(&dir.path().join("some/longish/name.md"), "x");
    let limits = ReadLimits { max_path_len: 5, ..ReadLimits::default() };

    let err = read_markdown_tree(dir.path(), &limits).unwrap_err();
    assert!(matches!(err, PromptFsError::PathTooLong { .. }), "{err:?}");
}

#[cfg(unix)]
#[test]
fn rejects_a_symlinked_root() {
    use std::os::unix::fs::symlink;
    let base = tempdir().unwrap();
    let real = base.path().join("real");
    fs::create_dir_all(&real).unwrap();
    write(&real.join("a.md"), "x");
    let link = base.path().join("link");
    symlink(&real, &link).unwrap();

    let err = read_markdown_tree(&link, &ReadLimits::default()).unwrap_err();
    assert!(matches!(err, PromptFsError::Symlink(_)), "{err:?}");
}

#[cfg(unix)]
#[test]
fn rejects_an_internal_symlinked_file() {
    use std::os::unix::fs::symlink;
    let dir = tempdir().unwrap();
    let target = tempdir().unwrap();
    write(&target.path().join("secret.md"), "secret");
    write(&dir.path().join("real.md"), "ok");
    symlink(target.path().join("secret.md"), dir.path().join("link.md")).unwrap();

    let err = read_markdown_tree(dir.path(), &ReadLimits::default()).unwrap_err();
    assert!(matches!(err, PromptFsError::Symlink(_)), "{err:?}");
}

#[cfg(unix)]
#[test]
fn rejects_a_symlinked_subdirectory_that_escapes() {
    use std::os::unix::fs::symlink;
    let dir = tempdir().unwrap();
    let outside = tempdir().unwrap();
    write(&outside.path().join("escape.md"), "escape");
    symlink(outside.path(), dir.path().join("sub")).unwrap();

    let err = read_markdown_tree(dir.path(), &ReadLimits::default()).unwrap_err();
    assert!(matches!(err, PromptFsError::Symlink(_)), "{err:?}");
}

#[test]
fn rejects_nesting_deeper_than_the_limit() {
    let dir = tempdir().unwrap();
    write(&dir.path().join("a/b/c/deep.md"), "x");
    let limits = ReadLimits { max_depth: 2, ..ReadLimits::default() };

    let err = read_markdown_tree(dir.path(), &limits).unwrap_err();
    assert!(matches!(err, PromptFsError::TooDeep { .. }), "{err:?}");
}
