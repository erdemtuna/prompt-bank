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
model_roles:
  model:
    label: Investigation model
    description: Used by parallel investigation agents.
variables:
  - name: topic
    description: The topic to investigate
    required: true
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
  - id: uiMockup
    label: UI mockup
    default: false
    visible_when:
      purpose: [technicalDesign]
    enabled_when:
      technicalScope: [frontend, fullStack]
---

Investigate {{topic}}.

{{#when purpose technicalDesign technicalScope frontend}}
Describe the frontend design.
{{/when}}

{{#option uiMockup}}
Include a UI mockup.
{{/option}}

{{#allOptionsDisabled}}
Continue without optional artifacts.
{{/allOptionsDisabled}}
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
- For generic prompt variables, `select` is one mutually exclusive value and `slider` is a discrete slider for one value from an ordered scale. Both require at least two `choices` and a `default` that matches one choice id.
- Each choice requires an `id` and may include `label` and `value`. The id controls conditions. Direct `{{variableName}}` interpolation copies `value` when present, otherwise `label`; it never copies the internal id accidentally.
- Choice ids use variable-name syntax: start with a letter or underscore, then contain only letters, numbers, and underscores.
- Use `{{#when variableName choiceId}}...{{/when}}` for text that belongs to one selected value.
- Add more variable-choice pairs to one `{{#when}}` tag for an AND condition: `{{#when purpose technicalDesign technicalScope frontend}}...{{/when}}`. Use repeated sequential blocks for OR behavior. Nested blocks remain unsupported.
- Variables and options may declare `visible_when` and `enabled_when`. Each field maps declared select or slider variable names to arrays of declared choice ids.
- Multiple predicate keys are AND conditions. Multiple values for one key are OR conditions.
- Applicability references cannot target the control itself, form a cycle, reference a free-form variable, or name an unknown variable or choice.
- Visibility is evaluated before enabled state. A control may declare both predicates.
- A hidden variable is removed from the composer, while a variable that fails `enabled_when` remains visible and disabled. Both are inactive in composition. Select and slider variables retain their stored selection for later restoration, but every `{{#when}}` clause that references an inactive variable evaluates false.
- A hidden or disabled option has an effective value of false and stale checked state is cleared. Making it available again does not silently restore the old checked state.
- Required fields, placeholders, option blocks, and model placeholders inside inactive paths do not block copying.
- A variable referenced only by a condition or applicability predicate still appears in the composer when its own applicability permits it.
- Prompts may include `options`, an array of optional focus toggles. Each option object must include `id` and `label`, and may include `description` and a boolean `default` or `defaultEnabled`.
- Option IDs use variable-name syntax: start with a letter or underscore, then contain only letters, numbers, and underscores. Prefer descriptive camelCase IDs such as `frontendFocus`, `backendFocus`, or `crossTopicConcerns`.
- Options are enabled by default when `default` and `defaultEnabled` are omitted.
- Use `{{#option optionId}}...{{/option}}` in the Markdown body for a self-contained block that should be included only when that option is enabled.
- Use `{{#allOptionsDisabled}}...{{/allOptionsDisabled}}` for prompt-specific fallback text when at least one option is visible and every visible option is effectively false. A state with no visible options does not render the fallback.
- Disabled option blocks are omitted from the copied prompt. They do not add instructions to avoid or deprioritize that topic.
- Keep mandatory safety, quality, and workflow instructions outside optional blocks.
- Conditional blocks must be self-contained. Nested option, all-options-disabled, or value-condition blocks are not supported.
- `{{model}}` is a built-in placeholder populated from the selected general model preset.
- `{{rubberDuckModel}}` is a built-in placeholder populated from the selected alternative model preset for rubber-duck or reviewer agents.
- Frontmatter may declare `model_roles.model` and `model_roles.rubberDuckModel`, each with a non-empty `label` and `description`. Roles change presentation only; they do not route work or invoke a model.
- Built-in placeholder names are reserved. Do not declare prompt variables named `model` or `rubberDuckModel`.
- Preserve direct/operator tone: tell the agent what to do, what to avoid, and what to return.
- Preserve operational instructions as text. Do not remove or soften workflow, gate, agent, tool, or model-call wording when that wording is intended for whoever receives the copied prompt.
- Do not add schema fields that imply Prompt Bank executes prompts, starts workflows, evaluates gates, invokes agents, or calls models.

## Typed controls, applicability, and value blocks

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

### Conditional applicability

Use `visible_when` to remove an irrelevant control from both the form and active composition. Use `enabled_when` when the control should remain visible but unavailable until another selection permits it.

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
  - id: uiMockup
    label: UI mockup
    visible_when:
      purpose: [technicalDesign]
    enabled_when:
      technicalScope: [frontend, fullStack]
```

The `technicalScope` selection is stored while hidden, but it is inactive: a `{{#when technicalScope frontend}}` block does not render until the variable is visible. A variable that fails `enabled_when` behaves the same way while remaining visible and disabled. The UI mockup stays visible for technical design, is enabled only for frontend or full-stack scope, and is effectively false otherwise. When an option becomes hidden or disabled, Prompt Bank clears its stale checked state.

Predicates may combine keys. This option is visible only for technical design at focused or deep analysis depth:

```yaml
visible_when:
  purpose: [technicalDesign]
  analysisDepth: [focused, deep]
```

The keys are ANDed; `focused` and `deep` are alternatives for `analysisDepth`.

### Compound value conditions

A value block can require several selections:

```markdown
{{#when purpose technicalDesign technicalScope frontend}}
Describe frontend interaction states and component boundaries.
{{/when}}
```

Every variable-choice pair must match. Use separate sequential blocks for OR behavior. Do not nest value, option, or fallback blocks.

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

Hidden and disabled option blocks are omitted from the copied prompt. The fallback considers only visible options, renders only when that visible set is non-empty and every member is effectively false, and does not render when no option is visible.

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

## Model roles and defaults

Use `gpt-5-6-sol` by default. Choose a different preset only when the prompt clearly requires a different model profile.

Model presets live in `model-presets.yaml` and are descriptive copy guidance only. They label the copied prompt text for the user; they are not routing, provider, or execution configuration.

Prompts may give each active model group a role-specific first-field label and description through authoring metadata:

```yaml
model_roles:
  model:
    label: Approved execution model
    description: Used by approved implementation workers.
  rubberDuckModel:
    label: Planning and review model
    description: Used to critique plans and review execution waves.
```

Only `model` and `rubberDuckModel` are supported. Each role requires both fields. Metadata is shown only when the corresponding placeholder is active. It does not change interpolation, execute a prompt, select a provider, or route work.

A preset may declare `contexts` and `reasoning`, each a list of variants with a kebab-case `id` and a `label`. The composer shows both context and reasoning as dropdowns, preserving each list's declared order. The copied text becomes the model label, context label, and reasoning label joined by spaces. Use `default_context` and `default_reasoning` to preselect a variant; without them the first entry wins. This presentation does not change the preset format or the discrete sliders declared by generic prompt variables with `control: slider`.

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

## Composer hierarchy

The composer presents active authoring controls in this order:

1. **Workflow** — visible select and discrete slider variables.
2. **Focus areas** — visible options; options that fail `enabled_when` remain visible and disabled with an availability explanation.
3. **Model guidance** — active `model` and `rubberDuckModel` groups whose first model-field labels use prompt-specific roles when declared.
4. **Context** — visible text and textarea variables.
5. **Raw template**.

Model, context, and reasoning choices belong to one model-guidance group; context and reasoning use dropdowns. This hierarchy is presentation for composing copied text. Prompt Bank remains copy-only and does not run the described workflow.
