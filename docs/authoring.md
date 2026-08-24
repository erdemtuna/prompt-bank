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

Use a discrete slider for an ordered scale:

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

These are generic prompt-variable controls. A variable with `control: slider` remains a discrete slider. Both controls require at least two choices and a default choice id. Include value-specific instructions with `{{#when}}` blocks:

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

Two built in placeholders insert a descriptive model label chosen in the interface. Use `{{model}}` for the general model and `{{rubberDuckModel}}` for an alternative or reviewer model. Do not declare variables named `model` or `rubberDuckModel`. A direct placeholder is required. Set `model_default` to a preset id from `model-presets.yaml` to preselect required roles.

When a preset declares `contexts`, the interface shows a Context dropdown beside that model; when it declares `reasoning`, the interface shows a Reasoning dropdown. The interface folds the declared choices into the same placeholder, so a prompt written as `{{model}}` can copy as `GPT-5.6 Terra 1M context medium reasoning` without any change to the template. The declared choice order, defaults, and preset YAML format are unchanged. See `schema.md` for the preset format.

To leave model choice to Copilot CLI by default, wrap only the descriptor and its connector in a model fragment:

```markdown
Use native{{#model model}} `{{model}}`{{/model}} investigation agents.
Employ reviewers{{#model rubberDuckModel}} using `{{rubberDuckModel}}`{{/model}}.
```

The model dropdown starts at **No explicit model**, the fragment is omitted, and Context and Reasoning stay hidden. Selecting a preset restores only the fragment. Keep the fragment on one line with exactly one matching placeholder. It may appear inside an option, all-options-disabled, or value-condition block, but it cannot contain another placeholder or block.

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

Plan for {{goal}}. Design it for workers{{#model model}} using {{model}}{{/model}} to execute, then have reviewers{{#model rubberDuckModel}} using {{rubberDuckModel}}{{/model}} critique the plan.
```

Only the `model` and `rubberDuckModel` role keys are supported, and each needs a label and description. The role label appears as the first model-field label rather than a separate card heading, and its description remains available with that field. If a role is active only through optional fragments, its dropdown includes **No explicit model** and each role can be selected independently. Role metadata changes presentation only. Preset labels and roles are copy guidance; Prompt Bank never calls a model or routes work.

## Composer order

The composer groups visible controls in this order:

1. **Workflow** — selects and discrete sliders declared by prompt variables.
2. **Focus areas** — additive options, including visible disabled options with an availability explanation.
3. **Model guidance** — active model roles, with the role as the first model-field label. Optional roles start at **No explicit model**; Context and Reasoning appear after selecting a preset.
4. **Context** — text and textarea inputs.
5. **Raw template**.

The ordering helps authors understand the composed text. It does not execute any workflow.

## Design an answer-first output

For user-facing analytical prompts, define an observable output contract instead of asking for something merely "clear" or "professional":

- Put the result, recommendation, or decision implication first, then the reasons and adjacent evidence.
- Use informative headings that state a conclusion, precise question, or reader task. Avoid generic headings that force readers to inspect every section.
- Give explanatory paragraphs one controlling idea in the first sentence. Do not force that rule onto tables, findings, captions, or short status blocks.
- Distinguish observed evidence, inference, assumption, uncertainty, and recommendation without mechanically labelling every sentence.
- Use connected prose for mechanisms, causality, interpretation, and argument; tables for repeated multidimensional comparison; numbered lists only for order; and bullets only for genuinely discrete items.
- Omit empty sections, duplicated summaries, chronological research diaries, and source dumps. Preserve meaningful tradeoffs, counterevidence, failure modes, and edge cases.

Match the structure to the workflow. A compact review needs one readiness block followed by findings, while an analytical conversation may need a purpose-specific executive summary, option map, or decision brief. One purpose-specific opening satisfies the answer-first requirement; do not add a second generic executive summary.

## Author semi-formal diagrams

Choose the view from the question the diagram must answer, and keep one abstraction level per diagram:

| Question | View and notation |
| --- | --- |
| What deployable parts exist and how do they depend on one another? | C4-style Container view using conservative Mermaid flowchart syntax. Use a separate Component zoom for one container. |
| What happens in one runtime scenario? | Mermaid sequence syntax with participants and ordered synchronous, asynchronous, and return messages. |
| How does one entity move between states? | Mermaid state syntax with transitions labelled `event [guard] / action` where applicable. |
| How does a process branch and complete? | Mermaid flowchart syntax with activity semantics: actions, decisions or merges, and branch conditions. |
| How does data cross transformations, stores, and trust boundaries? | Mermaid flowchart syntax showing producers, consumers, transformations, persistent stores, boundaries, and directed movement. Put API, protocol, authentication, and sync or async mode on relationships. |

State the single question before drawing. Use only evidence-backed entities and relationships, put missing facts under `Unresolved`, and never invent elements to fill a diagram. Treat 8–12 primary elements as a preferred range for naturally sized overviews, not a minimum; split above 15 unless one coherent scenario would be damaged, and explain that exception. Give elements a type and short responsibility where the grammar supports it, label directed relationships with source-to-target semantics, use text as well as color for status, and avoid decorative icons, gradients, shadows, and unlabeled color.

Keep three dimensions separate. Element kind is communicated by shape and type text: stadium for a human actor, rounded rectangle for an external system, rectangle for a container, service, producer, consumer, or transformation, cylinder for a persistent store, and labelled subgraph for a system, ownership, or trust boundary. Change status is written as `[Existing]`, `[Added]`, `[Changed]`, or `[Removed]`, with neutral gray, blue, amber, or pale gray only as redundant reinforcement. Epistemic uncertainty is written as `[Uncertain]` and may use a dashed element border. Do not use a dashed relationship to mean uncertainty.

For architecture and data flow, use `-->` for synchronous interaction or movement and `-.->` for asynchronous messages or movement. For sequence diagrams, use `->>` for synchronous calls, `-)` for asynchronous sends, and `-->>` for returns. Put unresolved facts in an adjacent list outside the diagram, not in an invented node.

Render and inspect every requested diagram before delivery. Check abstraction, reading direction, relationship labels, crossings, clipping, density, and text size; simplify and rerender when needed. Syntax validity alone is not visual validation. These rules synthesize [UML as Sketch](https://martinfowler.com/bliki/UmlAsSketch.html), [C4 diagram](https://c4model.com/diagrams) and [notation](https://c4model.com/diagrams/notation) guidance, [Mermaid's experimental C4 limitations](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/docs/syntax/c4.md), and [IBM MermaidSeqBench](https://research.ibm.com/publications/mermaidseqbench-an-evaluation-benchmark-for-llm-to-mermaid-sequence-diagram-generation). The output guidance similarly draws on [Nielsen Norman Group's scanning research](https://www.nngroup.com/articles/how-users-read-on-the-web/), the [Microsoft Writing Style Guide](https://learn.microsoft.com/en-us/style-guide/scannable-content/), the [Google developer style guide](https://developers.google.com/style/paragraph-structure), [ODNI ICD 203](https://archive.dni.gov/files/documents/ICD/ICD-203.pdf), and [Diátaxis explanation guidance](https://diataxis.fr/explanation/).

For a self-contained HTML report, every generated diagram must be embedded as inline SVG. A pre-existing local image artifact, such as a screenshot, may be embedded as PNG. Do not rasterize a generated diagram to PNG.

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
- A malformed, multiline, mismatched, nested, or empty optional model fragment.

Keep prompts generic. Do not include personal, employer, or proprietary content.
