---
id: implementation-plan
title: Implementation Plan
category: planning
description: Turn an agreed goal into the smallest dependency-correct plan with appropriate checks.
model_default: gpt-6-1-sol
model_roles:
  model:
    label: Approved execution model
    description: Used by approved implementation workers.
  rubberDuckModel:
    label: Planning and review model
    description: Used to critique the plan and review material execution boundaries.
variables:
  - name: executionTarget
    label: Approved plan execution
    description: How implementation should run after the plan is approved
    control: select
    default: nativeSubagents
    choices:
      - id: currentSession
        label: Current session
      - id: nativeSubagents
        label: Native subagents
      - id: independentSessions
        label: Independent Copilot sessions
  - name: technicalScope
    label: Technical scope
    description: The technical surface the implementation plan should organize
    control: select
    default: infer
    choices:
      - id: infer
        label: Infer
      - id: frontend
        label: Frontend
      - id: backend
        label: Backend
      - id: fullStack
        label: Full-stack
  - name: goal
    description: What the work should achieve
    required: true
  - name: context
    description: Prior analysis, decisions, and repository details the plan should build on
    required: false
    default: Use the current conversation, prior analysis, and repository state.
  - name: constraints
    description: Constraints the plan must respect
    required: false
    default: none stated
options:
  - id: contractsAndIntegration
    label: Contracts and integration
    description: Ownership, compatibility, sequencing, and boundaries between components or systems.
  - id: testsAndProof
    label: Tests and proof
    description: Concrete checks and evidence that prove the implementation worked.
  - id: operationsAndRollout
    label: Operations and rollout
    description: Observability, migration, deployment, rollback, and staged delivery.
    default: false
  - id: docsAndConfiguration
    label: Docs and configuration
    description: Documentation, configuration, and operator-facing changes.
    default: false
  - id: pullRequestDelivery
    label: Pull request delivery
    description: Include pull-request creation and proof after approved implementation.
    default: false
---

Create an implementation plan for the goal below.

Goal:
{{goal}}

Context:
{{context}}

Constraints:
{{constraints}}

Create and critique the plan here, using planning or review agents only when useful. The target governs approved implementation, not planning; do not implement before approval.

Do not invent requirements, schema fields, timelines, versions, or work not supported by context or inspected evidence. Surface unresolved choices and keep dependent work provisional until they are decided.

Infer one sequence or multiple waves from dependency, concurrency, risk, migration, rollout, and irreversibility; use waves only when those boundaries help. For each sequence or wave use **Outcome**, **Work**, and **Done when**, with outcome-oriented wave headings. Done when combines the result, required checks, and any consumed handoff.

Add owner, dependencies, scope, worktree, risks, migration, rollout, or recovery only when execution changes. Keep target-specific details with their worker or session, and do not add separate proof, review, success, completion, or handoff sections.

Required checks must pass before dependent consumption, merges, migrations, rollout, irreversible changes, or another material boundary. Resolve blocking review findings before crossing it.

{{#when executionTarget currentSession}}
- Approved execution — current session: implement directly after approval. Omit ownership, handoff, and worktree details unless material.
{{/when}}
{{#when executionTarget nativeSubagents}}
- Approved execution — native subagents: use coordinator-managed native{{#model model}} {{model}}{{/model}} workers after approval. One worker is allowed. Give each a standalone brief, file scope, and Done when; keep needed dependencies, handoffs, result details, and recovery local. Isolate concurrent writers that could collide in separate worktrees.
{{/when}}
{{#when executionTarget independentSessions}}
- Approved execution — independent sessions: use independent Copilot CLI sessions{{#model model}} with {{model}}{{/model}} after approval; do not launch them while planning. State shared repository, model, coordinator, and base once. Keep each session's brief, scope, Done when, branch/worktree, result path, context/reasoning guidance, recovery, and needed dependencies or merge order together. If model, context, reasoning, or another execution setting is not established, leave it as an explicit decision instead of choosing a value. Give concurrent sessions separate worktrees; the coordinator reviews, merges, and advances dependencies.
{{/when}}

{{#when technicalScope infer}}
- Infer affected surfaces from context and inspected repository evidence; state assumptions and do not invent frontend or backend units.
{{/when}}
{{#when technicalScope frontend}}
- Cover relevant interaction, state, accessibility, responsiveness, component, and service boundaries.
{{/when}}
{{#when technicalScope backend}}
- Cover relevant API, domain, persistence, migration, failure, security, observability, and data-flow boundaries.
{{/when}}
{{#when technicalScope fullStack}}
- Split frontend and backend only when useful; own and verify changed contracts before consumers proceed, with end-to-end integration evidence.
{{/when}}
{{#when technicalScope fullStack executionTarget independentSessions}}
- Full-stack independent execution: keep contract-producing and contract-consuming sessions in dependency order, with an explicit integration owner and merge point.
{{/when}}

{{#option contractsAndIntegration}}
- Identify changed or stable contracts, ownership, compatibility, and producer-before-consumer order.
{{/option}}
{{#option testsAndProof}}
- Put commands, outcomes, failure signals, and targeted versus final coverage in Done when.
{{/option}}
{{#option operationsAndRollout}}
- Add observability, migration, deployment, staged rollout, compatibility, and rollback only where needed.
{{/option}}
{{#option docsAndConfiguration}}
- Keep needed docs, configuration, examples, and operator changes with the work that creates them.
{{/option}}
{{#option pullRequestDelivery}}
- After approved implementation, create the required pull requests and put regression-preventing test evidence in each description and a comment.
{{/option}}
{{#allOptionsDisabled}}
- No extra concerns selected.
{{/allOptionsDisabled}}

Reuse prior analysis and artifacts; validate a missing or stale implementation-critical artifact in the first work that needs it. Add Plan at a Glance or an execution/worktree map only when complexity, risk, concurrency, ordering, or handoffs require one.

Critique the plan from material perspectives, using separate review agents only when useful. Keep contextual questions beside affected work and integrate answers there. Stop when every requirement maps to Work and Done when evidence; do not add a second summary.
