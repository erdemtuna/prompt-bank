# Release notes and release preparation

Use commit trailers to record release-facing changes when the commit is created:

```text
Release-Note-Type: improvement
Release-Note: Added answer-first output guidance to analytical prompts.
```

`Release-Note` is a user-facing change statement. A commit may contain several
`Release-Note` trailers; they appear in declaration order. Use
`Release-Note: skip` by itself to omit an internal-only commit.

Put every trailer in one contiguous paragraph at the end of the commit message,
without blank lines between trailers. Only that single terminal trailer block
is parsed. An earlier `Release-Note` paragraph is ignored when a later trailer
block (for example, `Co-authored-by`) ends the message. Indented continuation
lines remain supported for multiline trailer values.

`Release-Note-Type` is optional and defaults to `improvement`. A commit may have
at most one type, which applies to all of its notes:

| Value | Release section |
| --- | --- |
| `feature` | New features |
| `improvement` | Improvements |
| `fix` | Fixes |
| `docs` | Documentation |
| `internal` | Internal changes |

Unknown values appear under **Other changes**; multiple type trailers are
rejected. Use `internal` only for user-visible operational or packaging impact.
Co-author and Copilot session trailers do not affect release notes.

For a direct or squash commit without a `Release-Note`, the commit subject is
used under **Other changes**. This fallback is intentionally allowed, but often
produces implementation-oriented text. Prefer:

```text
Release-Note: Fixed stale prompt controls remaining active after a workflow change.
```

over a subject such as `Refactor applicability state`. If a change has no
user-visible effect, use `Release-Note: skip`.

Keep `main` linear. Release-note generation reads its first-parent history, so
direct and squash commits work naturally. If a merge commit is unavoidable, the
merge commit itself must include structured `Release-Note` metadata; a merge
without it is rejected instead of publishing a generic merge subject.

## Prepare a release

From a clean local `main`, run:

```bash
npm run release:prepare -- X.Y.Z
```

The command fetches `origin` and tags, requires local `main` to equal
`origin/main`, and requires a stable target version newer than the current
version. It then:

1. Captures the current `HEAD` as the end of the release-note range.
2. Synchronizes `package.json`, both root version entries in
   `package-lock.json`, `src-tauri/Cargo.toml`, and the root Prompt Bank package
   entry in `src-tauri/Cargo.lock`.
3. Generates `docs/releases/vX.Y.Z.md` from the previous reachable stable tag
   through the captured `HEAD`.
4. Validates the versions and generated release notes.
5. Stops with all changes uncommitted and untagged, and prints the follow-up
   validation, commit, and tag commands.

The generated Markdown has no separate notes-specific review. Inspect it as
part of the normal release-preparation diff, run the printed checks, and obtain
the normal explicit commit and release approval. Commit the synchronized
version files and release note together (using `Release-Note: skip` for that
preparation commit), then tag that exact commit and push the tag.

Generation refuses to overwrite an existing release-note file. Regeneration
requires an explicit range head so the selected history cannot change
implicitly. To regenerate notes for an existing tag, run:

```bash
npm run release:notes -- --version X.Y.Z --head vX.Y.Z --force
```

To regenerate during active release preparation before tagging, run:

```bash
npm run release:notes -- --version X.Y.Z --head HEAD --force
```

After the tag is pushed, the Release workflow validates the committed version
and note file, recreates any stale draft, and builds every installer. It compares
the draft body with the committed Markdown and publishes automatically only
after validation and all installer builds succeed. A failed check leaves the
release unpublished.
