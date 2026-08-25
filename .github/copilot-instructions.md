# Prompt Bank repository instructions

## Commands

- Install the pinned Node dependencies with `npm ci`. Supported Node versions are `^20.19.0 || >=22.12.0`.
- Run the normal validation, private-path guard, unit tests, type-check, and frontend build with `npm run check`.
- Validate built-in prompts, model presets, and every effective composition state with `npm run validate`.
- Validate another prompt tree with `npm run validate -- --prompt-root <path>`.
- Run all Vitest tests with `npm test`.
- Run one Vitest file with `npm test -- --run src/data/composer.test.ts`.
- Run one named Vitest test with:
  `npx vitest run src/data/composer.test.ts -t "omits optional model fragments"`
- Run all browser, responsive, screenshot, and Axe accessibility tests with `npm run e2e`.
- Run one Playwright file with `npx playwright test functional.spec.ts`.
- Run one named browser test with:
  `npx playwright test functional.spec.ts -g "context and reasoning selectors refine the composed model label"`
- Playwright starts its own strict-port Vite server on `127.0.0.1:4321`; do not start another server for test runs.
- Build the frontend and type-check with `npm run build`.
- Run the browser-only development app with `npm run dev`.
- Run or build the Tauri desktop app with `npm run desktop:dev` or `npm run desktop:build`.
- Test the headless Rust core with:
  `cargo test --manifest-path src-tauri/Cargo.toml -p prompt-bank-core --locked`
- Run one Rust core test with:
  `cargo test --manifest-path src-tauri/Cargo.toml -p prompt-bank-core missing_directory_is_empty --locked`
- On Windows PowerShell, if Cargo is not on `PATH`, invoke it as `& "$env:USERPROFILE\.cargo\bin\cargo.exe" ...`; the repository pins Rust 1.94.0 in `rust-toolchain.toml`.
- Run the full desktop crate tests with `cd src-tauri && cargo test`; unlike the pure core tests, these compile the Tauri/webview IPC smoke test and need native platform libraries.
- Run `npm run guard:private` after any path, workspace, fixture, or Git-boundary change.

## Architecture

Prompt Bank is a local, copy-only prompt composer with three prompt sources:

- **Built in** prompts are Markdown under `prompts/` and are bundled through Vite's eager raw imports.
- **Global** prompts come from `~/.prompt-bank/`, or the absolute `PROMPT_BANK_HOME` override.
- **Folder** prompts come only from the selected workspace's `.prompt-bank/` subtree.

The browser development app can show bundled prompts. The Tauri desktop path adds global prompts, native folder selection, remembered workspaces, and runtime version/window integration.

### Frontend data flow

- `src/App.tsx` owns desktop detection, global-source loading, workspace tabs, recent workspaces, refresh sequencing, and top-level filters.
- The Library tab combines built-in and global sources. A folder tab contains only that folder source; do not mix built-in/global prompts into folder tabs.
- `src/data/loaders.ts` parses each source independently, assigns provenance-qualified keys, resolves duplicate IDs deterministically within one source instance, keeps identical IDs from different sources, and sorts the library.
- `src/components/WorkspaceView.tsx` owns filtering and selected-prompt visibility. It deliberately preserves a selected prompt even when filters hide it.
- `src/components/Composer.tsx` owns workflow/context/option/model state, live preview, copy gating, keyboard copy, and responsive/accessibility presentation.
- `src/data/schemas.ts` is the parser and normative runtime contract for frontmatter, template blocks, applicability, model presets, and validation issues.
- `src/data/composer.ts` evaluates applicability, normalizes effective options, determines required/optional/inactive model roles, renders control blocks, substitutes values, and produces copy blockers.

Do not put template parsing rules in React components or UI state rules in prompt files. Keep parsing/evaluation in `src/data`, presentation in components, and authoritative authoring documentation in `schema.md`.

### Desktop and filesystem boundary

- `src/data/desktopClient.ts` is the typed frontend IPC adapter. Its DTOs mirror the golden Rust serialization tests; update TypeScript and Rust shapes together.
- `src-tauri/src/commands.rs` wraps the pure core in narrow Tauri commands and is the only layer that owns dialogs, windows, `AppHandle`, and runtime types.
- `src-tauri/crates/prompt-bank-core` owns home resolution, bounded Markdown traversal, path-safe DTOs, and the workspace registry. Keep this crate free of Tauri/webview dependencies so it remains headless-testable.
- Workspace records store canonical paths but expose opaque IDs to the frontend. Re-canonicalize and verify remembered paths every time they are opened.
- Registry writes are atomic and versioned. Unknown registry versions and symlinked registry files fail closed.
- The registry mutex protects only short read/write transactions; never hold it across folder dialogs, filesystem traversal, or IPC serialization.
- Filesystem reads accept only UTF-8 `.md` files, reject symlinks and root escapes, sort paths deterministically, and fail rather than truncate when limits are exceeded.
- User-facing `CommandError` values have stable kinds and path-free messages. Do not leak absolute local paths through IPC errors.

## Product and security boundaries

- Prompt Bank composes and copies text. Never add prompt execution, model/API calls, accounts, a backend, telemetry, command execution, or automatic workflow/agent invocation.
- Operational language inside a prompt remains copied text for the receiving tool; it is not Prompt Bank behavior.
- Never commit a `.prompt-bank` directory at any depth. Private global and folder prompts are user data, ignored by Git, and enforced by `scripts/check-private-paths.ts`.
- Built-in prompts must remain generic and free of personal, employer, proprietary, secret, real-name, and machine-specific content.
- Keep private filesystem access in Rust. The frontend should work with DTOs and opaque workspace IDs, not arbitrary paths.

## Prompt schema and composition conventions

- `schema.md` is normative; `docs/authoring.md` is explanatory. Update both when the authoring contract changes.
- Keep prompt IDs stable, unique, and kebab-case.
- Use select controls for mutually exclusive choices, sliders for ordered choices, and options only for independent additive sections.
- Applicability is evaluated before composition. Hidden or disabled options are effectively false; conditions referencing inactive variables do not render.
- Nested workflow blocks are unsupported. OR behavior uses repeated sequential blocks.
- An active direct `{{model}}` or `{{rubberDuckModel}}` placeholder makes that role required. A single-line `{{#model role}}...{{/model}}` fragment makes only that descriptor optional. Omit unused roles.
- If the same active role has direct and optional occurrences, required behavior wins.
- Put spaces, punctuation, and connectors that belong only to an optional model descriptor inside its model fragment.
- Every prompt with options needs a non-empty `{{#allOptionsDisabled}}` fallback, and every declared option must be used.
- Preserve direct/operator wording. Do not reinterpret workflow, gate, tool, model, or agent instructions as app behavior.
- `scripts/validate.ts` validates strict prompt collections and lazily enumerates effective states. The per-prompt safety limit is 4,096; do not replace it with raw Cartesian enumeration of hidden controls.
- The running app is more tolerant than strict validation: duplicate IDs inside one source resolve deterministically so a private folder cannot block the whole app. Keep that distinction intentional.

## Model and Composer conventions

- Model presets contain descriptive copy labels, context choices, and reasoning choices; they are not execution routing.
- Optional roles start at **No explicit model** and hide Context/Reasoning until a preset is selected.
- Track user model selection separately from a default injected by a required workflow branch. Returning to an optional branch must remove an injected default but preserve a genuine user choice.
- Keep `model` and `rubberDuckModel` state independent.
- Generic prompt sliders remain sliders; model Context and Reasoning are dropdowns.
- Hidden controls retain stored select/slider state for later restoration, while unavailable checked options are cleared and must not silently re-enable.

## UI conventions

- Reuse Fluent UI components, icons, portal tooltips, the existing Swiss theme, CSS variables, and `makeStyles`; do not introduce parallel UI primitives or one-off colors.
- Keep the Composer hierarchy: Workflow, Focus areas, active Model guidance, Context, then Raw template.
- Preserve keyboard access, programmatic names/descriptions, focus behavior, and Ctrl/Cmd+K and Ctrl/Cmd+Enter shortcuts.
- Responsive behavior is container-sensitive as well as viewport-sensitive. Preserve the tested Composer split at 707/708 px and model-field stacking based on rail width.
- For intentional visual changes, update only affected Playwright snapshots with `npx playwright test screenshots.spec.ts --update-snapshots`, inspect the images, then rerun the full browser suite.
- Tests are serial (`workers: 1`) because they share the Vite test server and screenshot environment.

## Testing boundaries

- Vitest includes `src/**/*.test.{ts,tsx}` and `scripts/**/*.test.ts`.
- Put parser/composer/application logic tests beside `src/data`; component DOM tests beside components; release/build script tests under `scripts`.
- Playwright covers end-to-end behavior, responsive geometry, workspaces, shortcuts, screenshots, external-network absence, and Axe checks.
- Rust core tests cover traversal, limits, registry, home resolution, and DTO JSON. Keep IPC smoke coverage in the desktop crate.
- When changing wire DTOs, update Rust golden serialization tests and the TypeScript DTO declarations together.
- When changing prompt controls or conditions, test composition semantics and effective matrix cardinality, not only rendered control presence.

## Release conventions

- Release preparation is deterministic and stops before commit, tag, or push: `npm run release:prepare -- X.Y.Z`.
- Keep versions synchronized across `package.json`, both root entries in `package-lock.json`, `src-tauri/Cargo.toml`, and the desktop package entry in `src-tauri/Cargo.lock`.
- Release notes live in `docs/releases/vX.Y.Z.md` and are generated from first-parent `main` commits since the previous lower SemVer tag.
- Prefer one contiguous terminal trailer block:
  `Release-Note-Type: feature|improvement|fix|docs|internal`
  and one or more `Release-Note: <user-facing change>` entries.
- Use `Release-Note: skip` by itself for internal-only commits. Commits without metadata fall back to their subject; merge commits must carry structured metadata.
- Follow `docs/releases/README.md` for regeneration and tag flow. Do not manually create a generic release body or enable GitHub-generated notes.
- The tag workflow validates version sources and the committed body, recreates stale drafts, builds all platform assets, and publishes only after canonical body equality and successful builds.
