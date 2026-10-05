# Development

[Back to the README](../README.md)

## Requirements

Use Node `^20.19.0 || >=22.12.0`. The repository pins its version in `.node-version`.

The desktop app also needs Rust through [rustup](https://rustup.rs), using the toolchain pinned in `rust-toolchain.toml`, and platform libraries:

**Windows:** the WebView2 runtime, included with Windows 11.

**macOS:** Xcode Command Line Tools.

**Linux:** `libwebkit2gtk-4.1-dev`, `build-essential`, `libxdo-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, and `librsvg2-dev`.

## Run locally

Install the pinned dependencies:

```bash
npm ci
```

Run the desktop app:

```bash
npm run desktop:dev
```

Or run the browser app with bundled prompts:

```bash
npm run dev
```

## Checks

`npm run check` validates prompts, model presets, release notes, and private paths, then runs unit tests and builds the frontend. Use `npm run e2e` for browser behaviour, responsive layouts, screenshots, and Axe checks. Playwright starts its own server on port 4321.

For narrower work, use `npm run validate`, `npm test`, or `npm run build`.

The Rust core can be tested without webview libraries:

```bash
cargo test --manifest-path src-tauri/Cargo.toml -p prompt-bank-core --locked
```

Full native IPC coverage needs the platform libraries:

```bash
cd src-tauri
cargo test --locked
```

## Build installers

```bash
npm run desktop:build
```

Build on the target operating system. Bundles appear under `src-tauri/target/release/bundle`: Windows produces `.exe` and `.msi`, macOS produces `.app` and `.dmg`, and Linux produces `.AppImage` and `.deb`.

Bundles are currently unsigned. Signing and macOS notarization are not part of the build setup yet.

On WSL, `linuxdeploy` can fail when mounted Windows directories remain in `PATH`. The existing AppImage workaround is:

```bash
PATH=$(printf '%s' "$PATH" | tr ':' '\n' | grep -v '^/mnt/' | paste -sd: -) npm run desktop:build
```

## Architecture

React and Vite provide the composer inside a Tauri window. Bundled Markdown and model presets are build assets. The desktop Rust core reads private prompts and owns favorite storage and the workspace registry; Tauri commands expose narrow DTOs to the frontend.

Keep parsing and composition rules in `src/data`, presentation in components, and private filesystem access in the pure `prompt-bank-core` crate. `src-tauri/src/commands.rs` owns dialogs and runtime integration. Private reads reject symlinks and enforce bounds, and IPC errors must not expose local paths.

Do not add prompt execution, model/API calls, accounts, a backend, or telemetry. Operational instructions inside a template remain copied text. Never track a `.prompt-bank` directory.

For contribution conventions, see [CONTRIBUTING.md](../CONTRIBUTING.md). For version preparation, release notes, tags, and automated platform builds, see the [release guide](releases/README.md).
