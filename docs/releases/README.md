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

Preparation requires the GitHub CLI on PATH with existing read access to the repository. It makes bounded, read-only GitHub requests; it does not log in, change permissions, or publish anything. Normal development checks and historical release-note generation remain offline.

After a PR push, inspect the exact commit with `npm run ci:status -- <commit-sha>`. Address failed platform checks before the release handoff. For a new release, merge first and wait for CI on the resulting main commit, not just the PR's earlier SHA.

From clean local `main`, optionally inspect readiness before preparation:

```bash
npm run release:preflight -- X.Y.Z
```

Use `npm --silent run release:preflight -- X.Y.Z --json` for a compact report containing the source SHA, versions, predecessor, and CI evidence. Preflight may fetch origin/tags but does not change working-tree files. Then run:

```bash
npm run release:prepare -- X.Y.Z
```

Preparation invokes the same preflight every time; a previous successful report is not a bypass. It fetches `origin` and tags, requires clean attached `main` to equal `origin/main`, and requires a stable target newer than the synchronized current version. It then:

1. Selects the newest published stable SemVer release across GitHub pages, excluding drafts/prereleases. Its tag must exist locally, be in main's ancestry, and match the predecessor selected by the note generator.
2. Requires the latest applicable CI run/attempt for the exact source SHA to succeed, including frontend validation/build and both Linux and Windows Rust jobs.
3. Rechecks repository and remote main state after online queries. Missing, pending, failed, canceled, skipped, malformed, unauthenticated, or unavailable evidence fails before any working-tree writes.
4. Captures the verified `HEAD` as the end of the release-note range and synchronizes `package.json`, both root version entries in
   `package-lock.json`, `src-tauri/Cargo.toml`, and the root Prompt Bank package
   entry in `src-tauri/Cargo.lock`.
5. Generates `docs/releases/vX.Y.Z.md` from the verified predecessor
   through the captured `HEAD`.
6. Validates the versions and generated release notes.
7. Stops with all changes uncommitted and untagged, and prints the follow-up
   validation, commit, and tag commands.

If the newest published stable tag is outside main's ancestry, stop and investigate the release history. Do not silently fall back to an older release, move historical tags, or handwrite a replacement body. This new preparation policy does not invalidate or rewrite historical release notes.

The generated Markdown has no separate notes-specific review. Inspect it as
part of the normal release-preparation diff, run the printed checks, and obtain
the normal explicit commit and release approval. Commit the synchronized
version files and release note together (using `Release-Note: skip` for that
preparation commit), then tag that exact commit and push main plus its tag atomically.
Keep attribution in the same terminal trailer block:

```text
Release-Note: skip
Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>
```

Push main and the preparation tag together after approval:

```bash
git push --atomic origin main refs/tags/vX.Y.Z
```

If the push fails, inspect the state rather than forcing either ref.

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

## Warm native dependency caches

For a release candidate, the **Warm native dependency caches** workflow can be dispatched explicitly on main:

```bash
gh workflow run warm-native-cache.yml --ref main
```

It rejects other refs, installs dependencies with read-only repository access, and compiles all four platform targets through Tauri with `--no-bundle` and locked Cargo inputs. It creates no installers, release, or installation update and uses no publishing secrets.

Warming and release jobs share platform-specific dependency cache identities, including separate macOS Intel and Apple Silicon keys. Application workspace crates are not cached. Release builds still compile current sources, produce every installer, and retain the canonical-body and all-platform publication gates.

Caches saved only on a release-specific ref are not a reliable baseline for a later release. Main-scoped warming addresses that visibility problem. Cargo manifest/version changes can also produce an exact-key miss while a compatible dependency restore still helps; the job summaries report the exact-hit flag, not a claim that every false value means a cold build.

Warming is optional and manual-only. Do not dispatch it automatically or treat it as replacement CI. Verify cache restoration and native build results on the first authorized run before claiming a speed improvement.
