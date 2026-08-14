---
id: implementation-plan
title: Implementation Plan
category: planning
description: Turn an agreed goal into an ordered plan with waves, review gates, and success criteria.
model_default: gpt-5-6-sol
model_roles:
  model:
    label: Approved execution model
    description: Used by approved implementation workers.
  rubberDuckModel:
    label: Planning and review model
    description: Used to critique the plan and review execution waves.
variables:
  - name: executionTarget
    label: Approved plan execution
    description: How implementation waves should run after the plan is approved
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
    description: Concrete checks and evidence that prove each wave worked.
  - id: operationsAndRollout
    label: Operations and rollout
    description: Observability, migration, deployment, rollback, and staged delivery.
    default: false
  - id: docsAndConfiguration
    label: Docs and configuration
    description: Documentation, configuration, and operator-facing changes.
    default: false
---

Create an implementation plan for the goal below.

Goal:
{{goal}}

Context:
{{context}}

Constraints:
{{constraints}}

Create and critique the plan in this session. Use native planning or review agents only where they genuinely improve the plan. The execution target below applies to implementation after approval, not to creation of the plan. Do not launch implementation work while planning.

Break the work into ordered waves rather than a flat list of steps. A wave is a group of changes that can be built and verified together. Each wave must state what it changes, which files it touches, what proves it worked, and what the next wave is allowed to assume.

Put a coordinator-owned review gate at the end of every wave. At each gate, use native {{rubberDuckModel}} reviewers to check the wave against its own success criteria before the next wave starts, and fix what they find before moving on. The point of the gate is to catch a wrong assumption while it is still one wave deep instead of letting it propagate.

Write each wave so it stands alone: name the repository, the branch, the exact scope, the files in scope, and what to report back, because whoever picks up a wave may have none of this conversation.

Reuse prior analysis and any existing mockups or diagrams. Do not recreate a rigorous technical-design report. When an implementation-critical artifact is missing, assign its creation or validation to the wave that first needs it.

{{#when executionTarget currentSession}}
- Approved execution: design the waves for the current coordinator to implement directly in this session. Keep ownership and handoffs simple, but preserve the review gates and dependency order.
{{/when}}
{{#when executionTarget nativeSubagents}}
- Approved execution: design implementation waves for native {{model}} subagents managed by the current coordinator. State each agent brief, dependencies, allowed scope, completion contract, and the evidence the coordinator must review before advancing.
{{/when}}
{{#when executionTarget independentSessions}}
- Approved execution: design implementation waves for independent Copilot CLI sessions using {{model}}. Do not launch them while creating this plan. For every session, state its repository, worktree, branch, standalone brief, allowed scope, dependencies, completion contract, result location, merge order, model/context/reasoning guidance, and recovery or resume instructions. Give concurrent sessions separate worktrees so they cannot collide. Keep the current coordinator responsible for reviewing results, merging completed waves, and advancing dependencies.
{{/when}}

{{#when technicalScope infer}}
- Technical scope — infer: derive the affected surfaces from the goal, context, and inspected repository evidence. Keep the plan lean, record the evidence behind the inference, and do not invent separate frontend or backend waves when the work does not require them.
{{/when}}
{{#when technicalScope frontend}}
- Technical scope — frontend: organize waves around interaction states, component boundaries, client state, accessibility, responsiveness, and service integration. Require browser or component-level evidence appropriate to each wave.
{{/when}}
{{#when technicalScope backend}}
- Technical scope — backend: organize waves around APIs, domain behavior, persistence, migrations, failure handling, security boundaries, observability, and data flow. Require contract and service-level evidence appropriate to each wave.
{{/when}}
{{#when technicalScope fullStack}}
- Technical scope — full-stack: separate frontend and backend ownership where useful, make contract ownership explicit, sequence integration before dependent work, and require end-to-end evidence at the wave that joins the surfaces.
{{/when}}
{{#when technicalScope fullStack executionTarget independentSessions}}
- Full-stack independent execution: keep contract-producing and contract-consuming sessions in dependency order, with an explicit integration owner and merge point.
{{/when}}

{{#option contractsAndIntegration}}
- Contracts and integration: identify contracts that change or must remain stable, assign an owner, state compatibility expectations, and place integration work after the required producers are verified.
{{/option}}
{{#option testsAndProof}}
- Tests and proof: for each wave, give concrete commands, checks, and observable outcomes. State what success and failure look like, and distinguish targeted proof from final regression coverage.
{{/option}}
{{#option operationsAndRollout}}
- Operations and rollout: include observability, migrations, deployment ordering, staged rollout, rollback, and compatibility windows in the waves that create those needs.
{{/option}}
{{#option docsAndConfiguration}}
- Docs and configuration: include documentation, configuration, examples, and operator-facing changes as real work in the waves that create the need, not as a cleanup wave at the end.
{{/option}}
{{#allOptionsDisabled}}
- Keep the plan lean: ordered waves, what each one changes, and how you know it is done.
{{/allOptionsDisabled}}

Before you present the plan, have {{rubberDuckModel}} agents critique it from different angles and fold in what holds up.

Then surface every open question and uncertain assumption with enough context for a decision. Do not bury them in a list at the end. Resolve answered questions into the plan itself.

Present the final plan with the wave breakdown, the review gates, the success criteria for each wave, and the success criteria for the whole change.

Do not start implementing until the plan is approved.
