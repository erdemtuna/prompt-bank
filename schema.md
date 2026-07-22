# Prompt File Contract

Each prompt is a single Markdown file with YAML frontmatter followed by the template body.

Prompt files are copy assets. The Prompt Bank app may parse metadata, substitute variables, preview the composed Markdown, and copy the result, but it must not execute the prompt body or treat operational wording as app behavior.

## Required format

```markdown
---
id: unique-kebab-case-id
title: Human-readable title
category: Any non-empty category label
description: Short description of when to use this prompt
kind: prompt
model_default: gpt-5-6-sol
variables:
  - name: variableName
    description: What the caller should provide
    required: true
    default: Optional prefilled value
options:
  - id: frontendFocus
    label: Frontend focus
    description: Include frontend-specific review guidance
    defaultEnabled: true
---

Prompt template body with {{variableName}} placeholders.
```

## Rules

- Use one prompt per `.md` file.
- Keep `id` stable, unique, and kebab-case.
- Set `category` to a non-empty folder-level intent when possible. Categories are labels and are not restricted to a fixed list.
- `kind` may be `prompt` or `command`. It defaults to `prompt`.
- Use `kind: command` for copy-only CLI snippets. Command prompts change copy and preview labels in the UI, but they are still only rendered and copied. Prompt Bank must not execute commands.
- Use `{{variableName}}` placeholder syntax only in the Markdown body. Whitespace inside the braces is allowed, for example `{{ variableName }}`.
- Placeholder names must start with a letter or underscore and contain only letters, numbers, and underscores. Malformed or unbalanced brace patterns such as `{{bad-name}}`, `{{foo.bar}}`, `{{ }}`, `{{{foo}}`, `{{foo}}}`, and `{{foo` fail validation.
- Every non-built-in placeholder in the body must be listed in `variables`.
- Variables may include `default` or `defaultValue`. Defaults prefill the composer and are copied into the rendered prompt unless the user edits them.
- Use defaults for stable, repeated operator values such as `current repository`, `main`, `current branch`, or standard validation guidance. Do not default values that should force a real decision, such as issue content, PR comments, approval summaries, or the main investigation intent.
- Prompts may include `options`, an array of optional focus toggles. Each option object must include `id` and `label`, and may include `description` and a boolean `default` or `defaultEnabled`.
- Option IDs use variable-name syntax: start with a letter or underscore, then contain only letters, numbers, and underscores. Prefer descriptive camelCase IDs such as `frontendFocus`, `backendFocus`, or `crossTopicConcerns`.
- Options are enabled by default when `default` and `defaultEnabled` are omitted.
- Use `{{#option optionId}}...{{/option}}` in the Markdown body for a self-contained block that should be included only when that option is enabled.
- Use `{{#allOptionsDisabled}}...{{/allOptionsDisabled}}` for prompt-specific fallback text when every option declared on that prompt is disabled.
- Disabled option blocks are omitted from the copied prompt. They do not add instructions to avoid or deprioritize that topic.
- Keep mandatory safety, quality, and workflow instructions outside optional blocks.
- Conditional blocks must be self-contained. Nested conditional blocks are not supported.
- `{{model}}` is a built-in placeholder populated from the selected general model preset.
- `{{rubberDuckModel}}` is a built-in placeholder populated from the selected alternative model preset for rubber-duck or reviewer agents.
- Built-in placeholder names are reserved. Do not declare prompt variables named `model` or `rubberDuckModel`.
- Preserve direct/operator tone: tell the agent what to do, what to avoid, and what to return.
- Preserve operational instructions as text. Do not remove or soften workflow, gate, agent, tool, or model-call wording when that wording is intended for whoever receives the copied prompt.
- Do not add schema fields that imply Prompt Bank executes prompts, starts workflows, evaluates gates, invokes agents, or calls models.

## Optional focus blocks

Use options for prompt-specific focus areas that can be included or omitted at copy time without changing the underlying template. Optional blocks should add useful guidance when enabled, but the prompt must remain valid when any or all options are disabled.

```markdown
---
id: review-example
title: Review example
category: review
description: Demonstrates optional focus blocks
model_default: gpt-5-6-sol
variables:
  - name: pullRequestUrl
    description: Pull request to review
    required: true
options:
  - id: frontendFocus
    label: Frontend focus
  - id: backendFocus
    label: Backend focus
    default: false
---

Review {{pullRequestUrl}} for correctness and high-confidence risks.

{{#option frontendFocus}}
Check UI state, accessibility, and client-side error handling.
{{/option}}

{{#option backendFocus}}
Check API behavior, persistence, authorization, and server-side validation.
{{/option}}

{{#allOptionsDisabled}}
Use a general review pass across the changed files.
{{/allOptionsDisabled}}
```

## Command snippets

Use `kind: command` when the copied text is intended for a terminal rather than an LLM prompt.

```markdown
---
id: open-repo
title: Open Repo
category: cli
kind: command
description: Copy a shell command to enter a repository and run a follow-up command.
variables:
  - name: repositoryPath
    description: Shell-ready path to the repository
    required: true
    default: /home/me/workspace/project
  - name: followUpCommand
    description: Command to run after changing into the repository
    required: false
    default: git status --short
---

cd {{repositoryPath}} && {{followUpCommand}}
```

Command snippets should be shell-ready after composition. Keep them explicit and copy-only; do not add schema fields that imply Prompt Bank runs the command.

## Model defaults

Use `gpt-5-6-sol` by default. Choose a different preset only when the prompt clearly requires a different model profile.

Model presets live in `model-presets.yaml` and are descriptive copy guidance only. They label the copied prompt text for the user; they are not routing, provider, or execution configuration. They should include:

```yaml
presets:
  - id: gpt-5-6-sol
    label: GPT-5.6 Sol extra high
    description: Best for complex planning, implementation, and review prompts.
```

Do not add provider routing, API configuration, temperature, or execution metadata to model presets.
