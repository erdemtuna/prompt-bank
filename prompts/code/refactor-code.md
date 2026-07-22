---
id: refactor-code
title: Refactor Code
category: code
description: Refactor code toward a desired outcome while preserving behavior.
variables:
  - name: code
    description: The code to refactor
    required: true
  - name: desiredOutcome
    description: What the refactor should achieve
    required: true
  - name: invariants
    description: Behavior or interfaces that must not change
    required: false
    default: Preserve all observable behavior and public interfaces.
options:
  - id: readability
    label: Readability
    description: Clearer names, smaller functions, less duplication
  - id: performance
    label: Performance
    description: Reduce unnecessary work without changing behavior
  - id: testability
    label: Testability
    description: Separate side effects and make units easy to test
---

Refactor the code below.

Code:
{{code}}

Desired outcome:
{{desiredOutcome}}

Invariants that must not change:
{{invariants}}

{{#option readability}}
Prioritize readability: clearer names, smaller functions, and less duplication.
{{/option}}

{{#option performance}}
Prioritize performance: reduce unnecessary work and allocations, without changing behavior.
{{/option}}

{{#option testability}}
Prioritize testability: separate side effects and make units easy to test.
{{/option}}

{{#allOptionsDisabled}}
Improve the code with a balanced pass across readability, structure, and safety.
{{/allOptionsDisabled}}

Preserve behavior. Explain each meaningful change briefly.
