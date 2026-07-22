---
id: plan-a-task
title: Plan a Task
category: planning
description: Turn a goal into an ordered plan with optional risk, validation, and docs sections.
model_default: gpt-5-6-sol
variables:
  - name: goal
    description: The goal to plan for
    required: true
  - name: constraints
    description: Constraints the plan must respect
    required: false
    default: none stated
  - name: successCriteria
    description: How to know the goal is met
    required: false
    default: Define reasonable success criteria from the goal.
options:
  - id: includeRisks
    label: Risks
    description: Add a short risks section
  - id: includeValidation
    label: Validation
    description: Add how to validate each step
  - id: includeDocs
    label: Documentation
    description: Add what documentation to update
---

Create a plan for the goal below.

Goal:
{{goal}}

Constraints:
{{constraints}}

Success criteria:
{{successCriteria}}

Design the plan for {{model}} to execute. Break it into ordered steps with clear checkpoints.

{{#option includeRisks}}
Include a short risks section with the main failure modes and how to avoid them.
{{/option}}

{{#option includeValidation}}
Include how to validate each step, with concrete checks.
{{/option}}

{{#option includeDocs}}
Include what documentation to update as part of the work.
{{/option}}

{{#allOptionsDisabled}}
Keep the plan focused on the ordered steps and their checkpoints.
{{/allOptionsDisabled}}
