# Authoring prompts

This guide shows how to write a Prompt Bank prompt. For the exact rules, see `schema.md`, which is the normative contract. This page is the friendly version.

## The shape of a prompt

Every prompt is a single Markdown file under `prompts/<category>/`. It has YAML frontmatter, then the template body.

```markdown
---
id: unique-kebab-id
title: Human readable title
category: writing
description: Short description of when to use this prompt
variables:
  - name: topic
    description: What the caller should provide
    required: true
    default: Optional prefilled value
---

Prompt body with a {{topic}} placeholder.
```

Required frontmatter fields are `id`, `title`, `description`, and `category`. Keep `id` stable, unique, and kebab case, because links and habits depend on it. The `category` is a free label, so use a clear folder level intent such as `writing`, `code`, or `review`.

## Variables

Declare every placeholder that appears in the body, except the built in `model` and `rubberDuckModel` placeholders. A placeholder looks like `{{topic}}`. Its name must start with a letter or underscore and contain only letters, numbers, and underscores.

```yaml
variables:
  - name: sourceText
    description: The text to summarize
    required: true
  - name: audience
    description: Who the summary is for
    required: false
    default: a general reader
```

Use a `default` for stable, repeated values. Do not default a value that should force a real decision.

## Optional focus blocks

Options are toggles that include or omit a block of the prompt at copy time. Declare them under `options`, then wrap the matching block with `{{#option id}} ... {{/option}}`. Every declared option must be used, and any prompt with options must include an `{{#allOptionsDisabled}} ... {{/allOptionsDisabled}}` fallback for when all options are off.

```markdown
---
id: review-example
title: Review Example
category: review
description: Demonstrates optional focus blocks
options:
  - id: correctnessFocus
    label: Correctness
  - id: securityFocus
    label: Security
variables:
  - name: changes
    description: The changes to review
    required: true
---

Review {{changes}}.

{{#option correctnessFocus}}
Check correctness: logic, edge cases, and tests.
{{/option}}

{{#option securityFocus}}
Check security: validation, authorization, and secrets.
{{/option}}

{{#allOptionsDisabled}}
Do a general review across correctness and security.
{{/allOptionsDisabled}}
```

Disabled option blocks are left out of the copied text. They do not add instructions to avoid a topic. Keep mandatory guidance outside optional blocks, and do not nest conditional blocks.

## Model preset labels

Two built in placeholders insert a descriptive model label chosen in the interface. Use `{{model}}` for the general model and `{{rubberDuckModel}}` for an alternative or reviewer model. Do not declare variables named `model` or `rubberDuckModel`. Set `model_default` to a preset id from `model-presets.yaml` to preselect one.

```markdown
---
id: plan-example
title: Plan Example
category: planning
description: Demonstrates the model placeholder
model_default: gpt-5-6-sol
variables:
  - name: goal
    description: The goal to plan for
    required: true
---

Plan for {{goal}}. Design it for {{model}} to execute.
```

The labels are copy guidance only. Prompt Bank never calls a model.

## Command snippets

Use `kind: command` when the copied text is a shell command rather than a prompt. The interface changes its labels, but it still only copies text.

```markdown
---
id: open-example
title: Open Example
category: cli
kind: command
description: Copy a shell ready command
variables:
  - name: path
    description: Shell ready path
    required: false
    default: .
---

cd {{path}} && git status --short
```

## Validate

Run the validator before you commit:

```bash
npm run validate
```

Common errors it catches:

- A placeholder in the body that is not declared in `variables`.
- A malformed placeholder such as `{{bad-name}}` or `{{ }}`.
- A duplicate `id` or a duplicate variable name.
- A prompt that declares options but has no `{{#allOptionsDisabled}}` fallback.
- A `model_default` that does not match a preset id.

Keep prompts generic. Do not include personal, employer, or proprietary content.
