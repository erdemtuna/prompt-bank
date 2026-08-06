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

Break the work into ordered waves rather than a flat list of steps. A wave is a group of changes that can be built and verified together. Each wave must state what it changes, which files it touches, what proves it worked, and what the next wave is allowed to assume.

Put a review gate at the end of every wave. At each gate, have {{rubberDuckModel}} reviewers check the wave against its own success criteria before the next wave starts, and fix what they find before moving on. The point of the gate is to catch a wrong assumption while it is still one wave deep instead of letting it propagate.

Design the plan so it can be executed either by you directly or handed to {{model}} implementation agents. Write each wave so it stands alone: name the repository, the branch, the exact scope, the files in scope, and what to report back, because whoever picks up a wave may have none of this conversation.

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
