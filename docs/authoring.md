# Authoring prompts

This guide shows how to write a Prompt Bank prompt. For the exact rules, see `schema.md`, which is the normative contract. This page is the friendly version.

## Where prompts live

The same prompt format works in three places, and Prompt Bank shows them together with a source label:

- Built in: `prompts/<category>/` in this repository, bundled with the app.
- Global: `~/.prompt-bank/<category>/`, your personal set, read at runtime.
- Folder: `<a folder you open>/.prompt-bank/<category>/`, read at runtime when you open that folder.

Global and folder prompts stay on your machine and are never committed or bundled. The rest of this guide applies to all three.

## The shape of a prompt

Every prompt is a single Markdown file under a `<category>/` folder in one of the locations above. It has YAML frontmatter, then the template body.

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

## Dropdowns and sliders

Use a dropdown when the prompt needs exactly one workflow or behavior:

```yaml
variables:
  - name: delivery
    label: Delivery
    control: select
    default: conversation
    choices:
      - id: conversation
        label: Conversation only
      - id: report
        label: HTML report
```

Use a slider for an ordered scale:

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

Both controls require at least two choices and a default choice id. Include value-specific instructions with `{{#when}}` blocks:

```markdown
{{#when delivery conversation}}
Answer inline and create no artifact.
{{/when}}
{{#when delivery report}}
Create an HTML report and return its path.
{{/when}}
```

A `{{#when}}` tag may contain several variable-choice pairs. Every pair must match:

```markdown
{{#when purpose technicalDesign technicalScope frontend}}
Describe frontend interaction states and component boundaries.
{{/when}}
```

That is an AND condition. For OR behavior, repeat separate blocks with the same content. Do not nest conditional blocks. Use checkboxes only when several independent sections may be included together.

## Conditional controls

Add `visible_when` when a variable or option is irrelevant outside another selection. Add `enabled_when` when an option should remain visible but unavailable:

```yaml
variables:
  - name: purpose
    label: Purpose
    control: select
    default: general
    choices:
      - id: general
        label: General analysis
      - id: technicalDesign
        label: Technical design
  - name: technicalScope
    label: Technical scope
    control: select
    default: infer
    visible_when:
      purpose: [technicalDesign]
    choices:
      - id: infer
        label: Infer
      - id: frontend
        label: Frontend
      - id: backend
        label: Backend
      - id: fullStack
        label: Full-stack
options:
  - id: uiMockups
    label: UI mockups
    visible_when:
      purpose: [technicalDesign]
    enabled_when:
      technicalScope: [frontend, fullStack]
```

Predicate keys are ANDed; values in one array are alternatives. References must name declared select or slider variables and declared choices. A control cannot refer to itself, and applicability dependencies cannot form a cycle. When both predicates exist, visibility is evaluated first.

Hidden select and slider controls keep their stored selection for later restoration. Variables that fail `enabled_when` also keep their value while remaining visible and disabled. Both states are inactive: any `{{#when}}` block that references one evaluates false. Hidden or disabled options are effectively false and their stale checked state is cleared. Re-enabling an option does not silently check it again. Required inputs and model placeholders inside inactive paths do not block copying.

## Optional focus blocks

Options are additive toggles that include or omit a block of the prompt at copy time. Declare them under `options`, then wrap the matching block with `{{#option id}} ... {{/option}}`. Every declared option must be used, and any prompt with options must include an `{{#allOptionsDisabled}} ... {{/allOptionsDisabled}}` fallback for when all options are off.

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

Hidden and disabled option blocks are left out of the copied text. They do not add instructions to avoid a topic. The `{{#allOptionsDisabled}}` fallback considers only visible options: it renders when at least one option is visible and every visible option is effectively false. It does not render when no option is visible. Keep mandatory guidance outside optional blocks, and do not nest conditional blocks.

A conditional block tag that sits on its own line is treated as a control line and removed cleanly, so stacked blocks read as a tight list and a disabled block leaves no gap behind. Spacing follows your own blank lines: put a blank line between two blocks in the template to keep a blank line between them when both are enabled. Line endings are normalized, so prompts render the same on Windows, macOS, and Linux.

## Model roles and preset labels

Two built in placeholders insert a descriptive model label chosen in the interface. Use `{{model}}` for the general model and `{{rubberDuckModel}}` for an alternative or reviewer model. Do not declare variables named `model` or `rubberDuckModel`. Set `model_default` to a preset id from `model-presets.yaml` to preselect one.

When a preset declares `contexts` or `reasoning`, the interface shows a context dropdown and a reasoning slider beside that model and folds the choices into the same placeholder, so a prompt written as `{{model}}` can copy as `GPT-5.6 Terra 1M context medium reasoning` without any change to the template. See `schema.md` for the preset format.

Use `model_roles` to explain what each active placeholder means for this prompt:

```markdown
---
id: plan-example
title: Plan Example
category: planning
description: Demonstrates the model placeholder
model_default: gpt-5-6-sol
model_roles:
  model:
    label: Approved execution model
    description: Used by approved implementation workers.
  rubberDuckModel:
    label: Planning and review model
    description: Used to critique the plan and review execution waves.
variables:
  - name: goal
    description: The goal to plan for
    required: true
---

Plan for {{goal}}. Design it for {{model}} to execute, then have {{rubberDuckModel}} critique the plan.
```

Only the `model` and `rubberDuckModel` role keys are supported, and each needs a label and description. Role metadata changes the model-card presentation only. Preset labels and roles are copy guidance; Prompt Bank never calls a model or routes work.

## Composer order

The composer groups visible controls in this order:

1. **Workflow** — selects and sliders.
2. **Focus areas** — additive options, including visible disabled options with an availability explanation.
3. **Model guidance** — active model roles, with model, context, and reasoning together.
4. **Context** — text and textarea inputs.
5. **Raw template**.

The ordering helps authors understand the composed text. It does not execute any workflow.

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
- A select or slider with missing choices, an invalid default, or an unknown `{{#when}}` value.
- An invalid compound condition or an unknown, cyclic, or self-referential applicability predicate.
- A prompt that declares options but has no `{{#allOptionsDisabled}}` fallback.
- Incomplete or unsupported `model_roles` metadata.
- A `model_default` that does not match a preset id.

Keep prompts generic. Do not include personal, employer, or proprietary content.
