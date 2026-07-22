# Prompt Bank

Validated prompts, composed locally, copied anywhere.

Prompt Bank is a local, file based, copy only prompt library with a small web interface. Store prompts as Markdown, fill their variables and optional sections, preview the composed text, then copy it into any tool. There is no account, no backend, and no model call. Prompt Bank does not send your prompt content anywhere; it leaves the app only when you copy it to your clipboard.

![The Prompt Bank interface](docs/screenshot.png)

## Why Prompt Bank

- Local and private. Everything runs in your browser from static files, and the app makes no network request once it has loaded.
- Copy only. Prompt Bank renders and copies text. It never executes a prompt, calls a model, or runs a workflow.
- Structured and validated. Prompts are Markdown files with a small, checked schema, so a broken prompt is caught before you use it.
- Composable. Declare variables, optional focus toggles, and model preset labels, and the composed text updates live.
- Bring your own prompts. Drop your own Markdown files into the library and they gain the same interface.

## Requirements

Node 20.19 or newer within the Node 20 line, or Node 22.12 or newer. The pinned version is in `.node-version`.

## Quick start

```bash
npm install
npm run dev
```

Open the printed local address, usually http://127.0.0.1:5173.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local dev server. |
| `npm run validate` | Validate every prompt file and the model presets. |
| `npm test` | Run the unit tests. |
| `npm run build` | Type check and build the static site. |
| `npm run e2e` | Run the local Playwright and Axe checks. |
| `npm run check` | Validate, test, and build in one step. |

## Bring your own prompts

Add a Markdown file under `prompts/<category>/` and it appears in the library with full support for variables, optional focus toggles, model preset labels, live preview, and copy. Nothing else is required. The example prompts that ship with the repo are only a starting point, so replace them with your own.

A minimal prompt looks like this:

```markdown
---
id: my-prompt
title: My Prompt
category: writing
description: What this prompt is for
variables:
  - name: topic
    description: The subject to write about
    required: true
---

Write a short note about {{topic}}.
```

Run `npm run validate` to check your prompt. See the authoring guide in `docs/authoring.md` for variables, optional focus blocks, model presets, and command snippets, and see `schema.md` for the full contract.

## How it works

Prompt Bank is a React and Vite single page app. At build time it reads every Markdown file under `prompts/` and the labels in `model-presets.yaml`, and bundles them into a static site. The composer substitutes your inputs into the template, applies the enabled focus blocks, and copies the result to your clipboard. There is no backend, and Prompt Bank does not transmit your prompt content. It leaves the app only through the clipboard copy that you trigger.

## Accessibility

The interface is keyboard reachable, labels its controls, wires validation messages to their fields, and meets common contrast expectations. The local `npm run e2e` checks include an automated accessibility pass.

## Project layout

| Path | Purpose |
| --- | --- |
| `prompts/<category>/*.md` | The prompt templates. |
| `model-presets.yaml` | Descriptive model preset labels. |
| `schema.md` | The full prompt file contract. |
| `docs/authoring.md` | A task oriented authoring guide. |
| `src/` | The React and Vite application. |
| `scripts/validate.ts` | The prompt and preset validator. |
| `tests/` | The local Playwright and Axe suite. |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short, keep prompts free of personal or proprietary content, keep ids stable, and run `npm run validate` before you open a pull request.

## Security

Prompt Bank has no backend and stores nothing. Command snippets are copied as plain text and are never executed by the app. If you find a security concern, please report it privately through the repository security advisories, or open an issue if it is not sensitive.

## License

Prompt Bank is released under the MIT License. See [LICENSE](LICENSE). Bundled fonts are covered by the SIL Open Font License 1.1; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

