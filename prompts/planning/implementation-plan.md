---
id: implementation-plan
title: Implementation Plan
category: planning
description: Turn an agreed goal into an ordered plan with waves, review gates, and success criteria.
model_default: gpt-5-6-sol
variables:
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
options:
  - id: riskAnalysis
    label: Risks
    description: Main failure modes and how the plan avoids them.
  - id: validationSteps
    label: Validation
    description: Concrete checks that prove each wave actually worked.
  - id: parallelWaves
    label: Parallel waves
    description: Arrange independent work to run concurrently in separate worktrees.
  - id: docsAndConfig
    label: Docs and config
    description: Documentation, configuration, and migration work the change implies.
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

{{#when executionTarget currentSession}}
- Approved execution: design the waves for the current coordinator to implement directly in this session. Keep ownership and handoffs simple, but preserve the review gates and dependency order.
{{/when}}
{{#when executionTarget nativeSubagents}}
- Approved execution: design implementation waves for native {{model}} subagents managed by the current coordinator. State each agent brief, dependencies, allowed scope, completion contract, and the evidence the coordinator must review before advancing.
{{/when}}
{{#when executionTarget independentSessions}}
- Approved execution: design implementation waves for independent Copilot CLI sessions. Do not launch them while creating this plan. For every session, state its repository, worktree, branch, standalone brief, allowed scope, dependencies, completion contract, result location, merge order, model/context/reasoning settings, and recovery or resume instructions. Give concurrent sessions separate worktrees so they cannot collide. Keep the current coordinator responsible for reviewing results, merging completed waves, and advancing dependencies.
{{/when}}

{{#option riskAnalysis}}
- Risks: list the main failure modes, which wave each one threatens, the earliest signal that it is happening, and how to back out.
{{/option}}
{{#option validationSteps}}
- Validation: for each wave, give the concrete checks that prove it worked. Prefer commands and observable outcomes over "verify it works". State what a failing check looks like.
{{/option}}
{{#option parallelWaves}}
- Parallel waves: arrange waves so they either touch disjoint files or run concurrently in separate git worktrees, and include a map of which waves run at the same time and where they merge back. Two waves that edit the same file do not run in parallel.
{{/option}}
{{#option docsAndConfig}}
- Docs and config: include documentation, configuration, migrations, and rollout steps as real work in the waves that create the need for them, not as a cleanup wave at the end.
{{/option}}
{{#allOptionsDisabled}}
- Keep the plan lean: ordered waves, what each one changes, and how you know it is done.
{{/allOptionsDisabled}}

Before you present the plan, have {{rubberDuckModel}} agents critique it from different angles and fold in what holds up.

Then surface every open question and uncertain assumption to me, with enough context that I can actually decide. Do not bury them in a list at the end. Resolve them into the plan itself once I answer.

Present the final plan with the wave breakdown, the review gates, the success criteria for each wave, and the success criteria for the whole change.

Do not start implementing until I approve the plan.
