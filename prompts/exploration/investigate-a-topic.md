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
    label: API/data-flow diagram
    description: Show contracts and movement of data across boundaries.
    default: false
    visible_when:
      purpose: [technicalDesign]
---

Investigate the topic below.

Intent:
{{intent}}

Ground every claim in something you actually read. When you state how the system behaves, cite the file and symbol you are reading it from. When you cannot verify something, say so instead of filling the gap with a plausible guess. A confident wrong answer here is worse than an admitted unknown.

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
- Parallel agents: split the investigation into genuinely independent threads and give each one to a {{model}} agent with a standalone brief. Name the repository, exact scope, and expected report. Use parallel work for deep or independent threads, not simple lookups. Synthesize the results and report empty or contradictory threads plainly.
{{/option}}

{{#when purpose general}}
- Purpose: report what you found, what it means, and the strongest next step without forcing the result into brainstorming or a build design.
{{/when}}
{{#when purpose brainstorm}}
- Brainstorm: map the option space, including non-obvious directions. Keep promising paths open rather than narrowing to one. For each, give the tradeoff that actually decides it. Close with a short pursue, park, or drop decision set.
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

{{#option systemArchitecture}}
- System architecture: include a static structural view of the major components, modules, or services, their responsibilities, boundaries, and static dependencies. Emphasize who owns or depends on whom. Do not use this view for runtime message order or data payload movement. Decompose a component further only where a boundary materially affects the design. If the design changes an existing system, distinguish added, changed, and removed parts; for a greenfield system, show only the proposed architecture and do not invent an existing baseline.
{{/option}}
{{#option uiMockups}}
- UI mockups: include low-fidelity mockups for the important default, loading, empty, error, and narrow-width states. Keep them tied to the proposed interaction rather than visual polish.
{{/option}}
{{#option stateDiagram}}
- State diagram: include a diagram of meaningful states, transitions, guards, and failure or recovery paths.
{{/option}}
{{#option sequenceDiagram}}
- Sequence diagram: include a diagram showing participant ownership, runtime message order, asynchronous boundaries, timing where relevant, and failure responses.
{{/option}}
{{#option activityWorkflowDiagram}}
- Activity/workflow diagram: include a diagram showing actors, process steps, decisions, branches, alternate paths, and completion conditions. Use it for process and decision flow, not runtime message order or timing.
{{/option}}
{{#option apiDataFlowDiagram}}
- API/data-flow diagram: include a diagram showing contracts, trust boundaries, transformations, storage, and movement of data.
{{/option}}
{{#allOptionsDisabled}}
- Optional focus: work directly in the current session and return the requested result without additional optional sections.
{{/allOptionsDisabled}}

{{#when purpose technicalDesign}}
- Technical-design coherence: when multiple artifacts are included, keep component and participant names, boundaries, and granularity consistent. If a System architecture diagram is included, use its component names and boundaries as the shared vocabulary. Do not repeat the same information across diagrams; each artifact must add a viewpoint the others do not.
- Design outcome: explain how the strongest direction fits the existing system, what it would take to build, and whether to proceed, narrow the scope, or stop.
{{/when}}

Be clear about three separate things: what you found, what you infer from it, and what you recommend. Do not blur them together.

Surface every open question with enough context for a decision. Then stop.

Do not implement anything unless implementation is explicitly requested.
