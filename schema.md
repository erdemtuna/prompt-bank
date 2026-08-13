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
  - name: workflow
    label: Workflow
    control: select
    default: focused
    choices:
      - id: brief
        label: Brief
      - id: focused
        label: Focused
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
- Variables may set `control` to `text`, `textarea`, `select`, or `slider`. Omitting `control` preserves the existing automatic text-versus-textarea choice.
- `select` is for one mutually exclusive value. `slider` is for one value from an ordered scale. Both require at least two `choices` and a `default` that matches one choice id.
- Each choice requires an `id` and may include `label` and `value`. The id controls conditions. Direct `{{variableName}}` interpolation copies `value` when present, otherwise `label`; it never copies the internal id accidentally.
- Choice ids use variable-name syntax: start with a letter or underscore, then contain only letters, numbers, and underscores.
- Use `{{#when variableName choiceId}}...{{/when}}` for text that belongs to one selected value.
- A variable referenced only by a `{{#when}}` condition still appears in the composer. Required inputs and model placeholders inside inactive value blocks do not block copying.
- Prompts may include `options`, an array of optional focus toggles. Each option object must include `id` and `label`, and may include `description` and a boolean `default` or `defaultEnabled`.
- Option IDs use variable-name syntax: start with a letter or underscore, then contain only letters, numbers, and underscores. Prefer descriptive camelCase IDs such as `frontendFocus`, `backendFocus`, or `crossTopicConcerns`.
- Options are enabled by default when `default` and `defaultEnabled` are omitted.
- Use `{{#option optionId}}...{{/option}}` in the Markdown body for a self-contained block that should be included only when that option is enabled.
- Use `{{#allOptionsDisabled}}...{{/allOptionsDisabled}}` for prompt-specific fallback text when every option declared on that prompt is disabled.
- Disabled option blocks are omitted from the copied prompt. They do not add instructions to avoid or deprioritize that topic.
- Keep mandatory safety, quality, and workflow instructions outside optional blocks.
- Conditional blocks must be self-contained. Nested option, all-options-disabled, or value-condition blocks are not supported.
- `{{model}}` is a built-in placeholder populated from the selected general model preset.
- `{{rubberDuckModel}}` is a built-in placeholder populated from the selected alternative model preset for rubber-duck or reviewer agents.
- Built-in placeholder names are reserved. Do not declare prompt variables named `model` or `rubberDuckModel`.
- Preserve direct/operator tone: tell the agent what to do, what to avoid, and what to return.
- Preserve operational instructions as text. Do not remove or soften workflow, gate, agent, tool, or model-call wording when that wording is intended for whoever receives the copied prompt.
- Do not add schema fields that imply Prompt Bank executes prompts, starts workflows, evaluates gates, invokes agents, or calls models.

## Typed controls and value blocks

Use a select when the choices are mutually exclusive:

```markdown
---
id: execution-example
title: Execution Example
category: planning
description: Demonstrates one execution target
variables:
  - name: executionTarget
    label: Approved plan execution
    control: select
    default: nativeSubagents
    choices:
      - id: currentSession
        label: Current session
      - id: nativeSubagents
        label: Native subagents
      - id: independentSessions
        label: Independent sessions
        value: separate Copilot CLI sessions
---

{{#when executionTarget currentSession}}
Design the approved work for this session.
{{/when}}
{{#when executionTarget nativeSubagents}}
Design the approved work for native subagents.
{{/when}}
{{#when executionTarget independentSessions}}
Design the approved work for independent sessions.
{{/when}}

Execution target: {{executionTarget}}.
```

The condition compares the stored choice id. The final interpolation above copies `separate Copilot CLI sessions` for `independentSessions`, because that choice supplies `value`.

Use a slider for a small ordered scale:

```yaml
variables:
  - name: depth
    label: Analysis depth
    control: slider
    default: focused
    choices:
      - id: brief
        label: Brief
      - id: focused
        label: Focused
      - id: deep
        label: Deep
```

The slider moves through the choices in declaration order. It is not a free numeric range.

## Optional focus blocks

Use options for independent, additive focus areas that can be included or omitted at copy time. Do not use multiple options to imitate a radio group; use a select variable instead. Optional blocks should add useful guidance when enabled, but the prompt must remain valid when any or all options are disabled.

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

Model presets live in `model-presets.yaml` and are descriptive copy guidance only. They label the copied prompt text for the user; they are not routing, provider, or execution configuration.

A preset may declare `contexts` and `reasoning`, each a list of variants with a kebab-case `id` and a `label`. The composer shows context as a dropdown and ordered reasoning variants as a slider. The copied text becomes the model label, context label, and reasoning label joined by spaces. Use `default_context` and `default_reasoning` to preselect a variant; without them the first entry wins.

```yaml
presets:
  - id: gpt-5-6-terra
    label: GPT-5.6 Terra
    contexts:
      - id: standard
        label: ""
      - id: 1m
        label: 1M context
    default_reasoning: medium
    reasoning:
      - id: none
        label: no reasoning
      - id: minimal
        label: minimal reasoning
      - id: low
        label: low reasoning
      - id: medium
        label: medium reasoning
      - id: high
        label: high reasoning
      - id: xhigh
        label: extra high reasoning
      - id: max
        label: max reasoning
```

Selecting the 1M context and extra high reasoning above copies `GPT-5.6 Terra 1M context extra high reasoning`, while the default selection copies `GPT-5.6 Terra 1M context medium reasoning`. Presets that declare neither list keep working as a plain label with no extra controls.

Do not add provider routing, API configuration, temperature, or execution metadata to model presets.
