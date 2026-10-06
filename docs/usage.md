# Using Prompt Bank

[Back to the README](../README.md)

Prompt Bank composes text for you to paste into an AI tool. It never runs a prompt, invokes an agent, or calls a model.

## Prompt sources

The Library combines bundled prompts and your personal prompts from `~/.prompt-bank/`. Set `PROMPT_BANK_HOME` to an absolute path if you want a different personal library location.

Opening a folder creates a workspace tab containing only that folder's `.prompt-bank/` prompts. It does not mix in bundled or global prompts. Global and folder files are read by the desktop app; the browser app shows bundled prompts only.

Files remain ordinary Markdown. After editing them outside the app, press Refresh to reload.

## Compose and copy

Select a row to open its composer. Choose the workflow, focus areas, and any model guidance, then fill in the context. The preview updates as you make changes.

Copy stays unavailable when a required input or active model role is missing. Optional model roles begin at **No explicit model**. Selecting a model reveals its available context and reasoning choices.

Model labels are descriptive text, not execution settings. Required roles in the bundled prompts default to GPT-6.1 Sol; older preset IDs remain available. Your own prompts can declare a different default.

Vertical preview markers show additions relative to the initial composition; horizontal ticks show deletions. Hover or focus a marker to see which control caused the change. Markers do not enter the copied text.

Use Ctrl/Cmd+K to focus search and Ctrl/Cmd+Enter to copy. All, Favorites, and the categories share one navigation strip. Search and source filters narrow the chosen view without discarding the selected composition.

## Favorites

The star beside a row adds or removes a favorite without selecting that prompt or changing your inputs. Filled stars stay visible. Outline stars appear when you hover a row or move keyboard focus into it; on touch devices, select a row to reveal its star.

Choose Favorites beside All to show favorites across categories, or choose All or a category to leave Favorites. Search and source filters still apply, and category/title ordering is preserved. A folder favorite stays in its own workspace.

Desktop favorites store only prompt IDs, source information, and opaque workspace IDs in `~/.prompt-bank/favorites.json`, or the home selected by `PROMPT_BANK_HOME`. The versioned file is bounded to 1 MiB and 5,000 references. Updates are coordinated and atomic.

The browser stores bundled favorite references in its own origin storage. Browser and desktop favorites do not synchronize. Neither store contains prompt text, drafts, workflow choices, model selections, or filesystem paths.

Renaming a file preserves its favorite when its declared prompt ID stays the same. Changing that ID creates a new identity. Forgetting a folder leaves its references dormant; adding it again assigns a new workspace ID and does not reconnect its old favorites.

If a save fails, the change is temporary and marked **Not saved**. A bottom left popup offers Retry and Dismiss without moving the composer. Dismiss hides the popup, not the failure. The affected row keeps its unsaved status and Retry action. A valid prompt can still be copied.

Unavailable storage, corrupt files, and unsupported versions are reported rather than silently replaced.

## Writing a prompt

Save a file such as `writing/my-prompt.md` inside your personal or project prompt folder:

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

Start with the [authoring guide](authoring.md) or a bundled example under [prompts](../prompts). The complete contract is in [schema.md](../schema.md).
