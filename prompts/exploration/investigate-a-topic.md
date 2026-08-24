---
id: investigate-a-topic
title: Investigate a Topic
category: exploration
description: Investigate a question or an area of a codebase deeply before deciding what to build.
model_default: gpt-5-6-sol
model_roles:
  model:
    label: Investigation model
    description: Used by parallel investigation agents.
variables:
  - name: purpose
    label: Purpose
    description: The decision this investigation should support
    control: select
    default: technicalDesign
    choices:
      - id: general
        label: General analysis
      - id: brainstorm
        label: Brainstorm
      - id: technicalDesign
        label: Technical design
  - name: technicalScope
    label: Technical scope
    description: The affected technical surface when the purpose is technical design
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
  - name: analysisDepth
    label: Analysis depth
    description: How broadly and deeply to investigate before returning
    control: slider
    default: focused
    choices:
      - id: brief
        label: Brief
      - id: focused
        label: Focused
      - id: deep
        label: Deep
  - name: intent
    description: The question, topic, or outcome to investigate
    required: false
    default: Use the current conversation, prior analysis, and repository state.
options:
  - id: parallelAgents
    label: Parallel agents
    description: Split the investigation across agents working on separate threads.
  - id: systemArchitecture
    label: System architecture
    description: Show major parts, responsibilities, boundaries, and static dependencies.
    default: false
    visible_when:
      purpose: [technicalDesign]
  - id: uiMockups
    label: UI mockups
    description: Include mockups for important interface states.
    default: false
    visible_when:
      purpose: [technicalDesign]
    enabled_when:
      technicalScope: [frontend, fullStack]
  - id: stateDiagram
    label: State diagram
    description: Show meaningful states and transitions.
    default: false
    visible_when:
      purpose: [technicalDesign]
  - id: sequenceDiagram
    label: Sequence diagram
    description: Show the order of interactions across participants.
    default: false
    visible_when:
      purpose: [technicalDesign]
  - id: activityWorkflowDiagram
    label: Activity/workflow diagram
    description: Show actors, decisions, branches, and process paths.
    default: false
    visible_when:
      purpose: [technicalDesign]
  - id: apiDataFlowDiagram
    label: Data flow and trust boundaries
    description: Show evidence-backed data movement, transformations, stores, and trust boundaries.
    default: false
    visible_when:
      purpose: [technicalDesign]
---

Investigate the topic below.

Intent:
{{intent}}

Ground every claim in something you actually read. When you state how the system behaves, cite the file and symbol you are reading it from. When you cannot verify something, say so instead of filling the gap with a plausible guess. A confident wrong answer here is worse than an admitted unknown.

Lead with the result, recommendation, or decision implication. Put evidence next to the claim it supports, distinguish material uncertainty from established facts, and use informative headings that state a conclusion, precise question, or reader task. Use connected prose for mechanisms and reasoning, tables only for repeated multidimensional comparison, numbered lists only when order matters, and bullets only for genuinely discrete items. Omit empty sections, duplicated summaries, chronological research narration, and source dumps.

{{#when analysisDepth brief}}
- Depth: inspect the minimum evidence needed to answer confidently, keep the result concise, and avoid expanding into adjacent questions.
{{/when}}
{{#when analysisDepth focused}}
- Depth: trace the relevant implementation paths, tests, and prior decisions far enough to explain the behavior and its meaningful tradeoffs.
{{/when}}
{{#when analysisDepth deep}}
- Depth: follow the topic across subsystem boundaries, history, edge cases, and competing explanations. Reconcile conflicting evidence before recommending a direction.
{{/when}}

{{#option parallelAgents}}
- Parallel agents: split the investigation into genuinely independent threads and give each one to an agent{{#model model}} using {{model}}{{/model}} with a standalone brief. Name the repository, exact scope, and expected report. Use parallel work for deep or independent threads, not simple lookups. Synthesize the results and report empty or contradictory threads plainly.
{{/option}}

{{#when purpose general}}
- Opening — executive summary: begin with scope, principal findings, conclusion, strongest next step, and any material limitation. This is the only opening summary. Then report only the evidence, mechanism, alternatives, and implications needed to support it, without forcing the result into brainstorming or a build design.
{{/when}}
{{#when purpose brainstorm}}
- Opening — option map: begin with the promising directions, decisive tradeoffs, and current pursue, park, or drop outcomes. Do not force one recommendation. Then develop the evidence, mechanisms, alternatives, and implications needed to test that map, including non-obvious directions.
{{/when}}
{{#when purpose technicalDesign technicalScope infer}}
- Design scope — infer: determine the affected technical surface from inspected evidence. State the inferred boundaries, ownership, and assumptions in prose.
{{/when}}
{{#when purpose technicalDesign technicalScope frontend}}
- Design scope — frontend: cover interaction states, feature modules, shared state, design system boundaries, client services, accessibility, responsiveness, and integration boundaries.
{{/when}}
{{#when purpose technicalDesign technicalScope backend}}
- Design scope — backend: cover domains, services, APIs, queues, storage, integrations, failure handling, observability, and security or ownership boundaries.
{{/when}}
{{#when purpose technicalDesign technicalScope fullStack}}
- Design scope — full-stack: cover clients and backend components, contract ownership, state ownership, end-to-end boundaries, failure handling, and delivery sequencing.
{{/when}}
{{#when purpose technicalDesign}}
- Opening — decision brief: begin with the decision required, recommended direction, criteria, alternatives, decisive tradeoff, risks, confidence, and whether to proceed, narrow, defer, or stop. This is the only opening summary.
- Diagram house rules: when one or more diagram artifacts is selected, state the single question each diagram answers, keep one grammar and abstraction level, and use only evidence-backed elements and relationships. Put missing facts in an adjacent `Unresolved` list outside the diagram. Treat 8–12 primary elements as a preferred overview range, never a minimum; split above 15 unless that would break one coherent scenario. Use one dominant reading direction, render and inspect the result, and simplify and rerender when labels, crossings, clipping, density, direction, or text readability are weak.
- Diagram legend: keep element kind, change status, and epistemic status separate. Mark change status in text as `[Existing]`, `[Added]`, `[Changed]`, or `[Removed]`; use neutral gray, blue, amber, and pale gray only as redundant visual reinforcement. Append `[Uncertain]` and use a dashed element border for unverified elements. Dashed relationships remain reserved for asynchronous flow and never mean uncertainty. Avoid decorative icons, gradients, shadows, and unlabeled color. Use one shared legend when notation is unchanged.
{{/when}}

{{#option systemArchitecture}}
- System architecture: use conservative Mermaid flowchart syntax with C4 Container semantics, not Mermaid's experimental C4 grammar. Use stadium nodes for human actors, rounded rectangles for external systems, rectangles for deployable containers or services, cylinders for persistent stores, and labelled subgraphs for system, ownership, or trust boundaries. Use `-->` for synchronous interactions and `-.->` for asynchronous messages; every relationship must be directed and use a verb phrase that reads source-to-target. Show each container's type and one-line responsibility. Use a separate Component zoom only when one container needs decomposition; do not mix levels or use this view for runtime order or payload movement. For a greenfield system show only proposed `[Added]` elements; otherwise use the canonical change statuses.
{{/option}}
{{#option uiMockups}}
- UI mockups: include low-fidelity mockups for the important default, loading, empty, error, and narrow-width states. Keep them tied to the proposed interaction rather than visual polish.
{{/option}}
{{#option stateDiagram}}
- State diagram: use Mermaid state syntax with states, initial and final markers, and transitions labelled `event [guard] / action` where those parts exist. Include meaningful failure and recovery paths.
{{/option}}
{{#option sequenceDiagram}}
- Sequence diagram: use Mermaid sequence syntax for one scenario, with participants or lifelines and ordered messages. Use `->>` for synchronous calls, `-)` for asynchronous sends, and `-->>` for returns. Label every call, send, return, failure, and timeout with concise semantics.
{{/option}}
{{#option activityWorkflowDiagram}}
- Activity/workflow diagram: use Mermaid flowchart syntax with activity semantics: start and end, action nodes, decision or merge diamonds, and labelled branch conditions. Unlabelled control edges are allowed only when the next action is unambiguous. Include alternate paths and completion conditions; do not use this view for runtime message order or timing.
{{/option}}
{{#option apiDataFlowDiagram}}
- Data flow and trust boundaries: use Mermaid flowchart syntax with rectangles carrying `Producer`, `Consumer`, or `Transform` type text; cylinders for persistent stores; rounded rectangles for external systems; and labelled subgraphs for trust boundaries. Use `-->` for synchronous data movement and `-.->` for asynchronous movement. Label every movement with the data, source-to-target action, and API, protocol, authentication, or mode when relevant.
{{/option}}
{{#allOptionsDisabled}}
- Optional focus: work directly in the current session and return the requested result without additional optional sections.
{{/allOptionsDisabled}}

{{#when purpose technicalDesign}}
- Technical-design coherence: when multiple artifacts are included, keep container, participant, state, activity, data entity, and boundary names consistent. If a System architecture diagram is included, use its container names and boundaries as the shared vocabulary for sequence, state, activity, and data-flow views. Do not repeat the same information across diagrams; each artifact must answer a different question.
- Design implications: after the supporting analysis, explain what the opening recommendation would require to build, which existing boundaries it changes, and what evidence or condition would reverse it. Do not restate the decision brief.
{{/when}}

Be clear about three separate things: what you found, what you infer from it, and what you recommend. Do not blur them together.

Surface every open question with enough context for a decision. Then stop.

Do not implement anything unless implementation is explicitly requested.
