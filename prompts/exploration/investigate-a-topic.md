---
id: investigate-a-topic
title: Investigate a Topic
category: exploration
description: Investigate a question or an area of a codebase deeply before deciding what to build.
model_default: gpt-6-1-sol
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

Ground system-behavior claims in inspected files and symbols. Distinguish findings, inference, uncertainty, and recommendation; admit unverifiable gaps.

Open with the direct answer or decision implication in one or two natural sentences, not a formal brief. Keep evidence beside its claim and related reasoning in connected paragraphs. Use headings, lists, and tables only when their structure helps.

{{#when analysisDepth brief}}
- Depth: limit evidence collection to the minimum needed to answer confidently; do not expand into adjacent questions.
{{/when}}
{{#when analysisDepth focused}}
- Depth: follow the relevant implementation and decision paths, including tests and prior decisions that materially explain the behavior or tradeoffs.
{{/when}}
{{#when analysisDepth deep}}
- Depth: expand across subsystem boundaries, history, edge cases, and competing explanations. Reconcile conflicting evidence before recommending a direction.
{{/when}}

{{#option parallelAgents}}
- Parallel agents: split the investigation into genuinely independent threads and give each one to an agent{{#model model}} using {{model}}{{/model}} with a standalone brief. Name the repository, exact scope, and expected report. Use parallel work for deep or independent threads, not simple lookups. Synthesize the results and report empty or contradictory threads plainly.
{{/option}}

{{#when purpose general}}
- General analysis: focus on the principal findings, their implication, the strongest next step, and any material limitation. Include only the evidence, mechanism, alternatives, and consequences needed to support them; do not force the answer into brainstorming or a build design.
{{/when}}
{{#when purpose brainstorm}}
- Brainstorm: focus on promising and non-obvious directions, decisive tradeoffs, and the current pursue, park, or drop state. Do not force one recommendation; include the evidence and implications needed to test the options.
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
- Technical design: focus on the decision, recommended direction, decisive tradeoff, risks, confidence, and a proceed, narrow, defer, or stop outcome. Explain criteria and alternatives only when they affect that position.
- Diagram integrity: use evidence-backed elements and one decision question, grammar, and abstraction level per selected view. Keep names and boundaries consistent, inspect host-native rendering before claiming validity, and keep unknowns outside diagrams or mark material uncertainty as `[Uncertain]` with a dashed element border. Apply change-status labels only when material; dashed relationships mean asynchronous flow.
- Artifact overlap: omit a selected view only when another preserves its material entities, relationships, order, states, boundaries, failures, and uncertainty. Name and justify the substitute; otherwise include both.
{{/when}}

{{#option systemArchitecture}}
- System architecture: use conservative Mermaid flowchart syntax with C4 Container semantics, not experimental C4 grammar. Represent people as stadiums, external systems as rounded rectangles, deployable containers or services as rectangles, persistent stores as cylinders, and system, ownership, or trust boundaries as labelled subgraphs. Use directed, source-to-target verb relationships: `-->` for synchronous interaction and `-.->` for asynchronous messages. Give each container its type and one-line responsibility. Put decomposition in a separate Component zoom; do not mix levels or use this view for runtime order or payload movement.
{{/option}}
{{#option uiMockups}}
- UI mockups: use low-fidelity views tied to the proposed interaction, not visual polish. Include only states with materially different behavior, risk, or recovery; do not add default, loading, empty, error, or narrow-width variants unless they are materially distinct.
{{/option}}
{{#option stateDiagram}}
- State diagram: use Mermaid state syntax with UML state meanings, initial and final markers, and `event [guard] / action` transition labels where those parts exist. Include material failure and recovery paths.
{{/option}}
{{#option sequenceDiagram}}
- Sequence diagram: use Mermaid sequence syntax for one scenario with participants or lifelines and ordered messages. Use `->>` for synchronous calls, `-)` for asynchronous sends, and `-->>` for returns; label calls, sends, returns, failures, and timeouts with concise semantics.
{{/option}}
{{#option activityWorkflowDiagram}}
- Activity/workflow diagram: use Mermaid flowchart syntax with UML activity meanings: start and end, actions, decision or merge diamonds, and labelled branch conditions. Leave a control edge unlabelled only when its next action is unambiguous. Include material alternate paths and completion conditions; do not use this view for runtime message order or timing.
{{/option}}
{{#option apiDataFlowDiagram}}
- Data flow and trust boundaries: use Mermaid flowchart syntax with typed `Producer`, `Consumer`, or `Transform` rectangles, cylinders for persistent stores, rounded rectangles for external systems, and labelled trust-boundary subgraphs. Use `-->` for synchronous and `-.->` for asynchronous data movement. Label each movement with its data, source-to-target action, and relevant API, protocol, authentication, or mode.
{{/option}}
{{#allOptionsDisabled}}
- Optional focus: work directly in the current session and return the requested result without additional optional sections.
{{/allOptionsDisabled}}

{{#when purpose technicalDesign}}
- Design implications: explain what the recommendation would require to build, which existing boundaries it changes, and what evidence or condition would reverse it, without restating the opening position.
{{/when}}

Stop when adequately supported. Include mechanisms, alternatives, failure modes, consequences, and uncertainty only when material; omit empty sections, research narration, source dumps, and closing recaps. Surface decision-relevant open questions with context.

Do not implement unless explicitly requested.
