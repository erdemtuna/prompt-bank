---
id: refactor-code
title: Refactor Code
category: code
description: Restructure existing code toward a stated outcome without changing what it does.
variables:
  - name: target
    description: Files, modules, or symbols to refactor
    required: true
  - name: outcome
    description: What the refactor should achieve
    required: true
  - name: invariants
    description: Behavior and interfaces that must not change
    required: false
    default: Preserve all observable behavior and every public interface.
options:
  - id: readability
    label: Readability
    description: Clearer names, smaller units, less duplication.
  - id: testability
    label: Testability
    description: Separate side effects so the logic can be tested directly.
  - id: performance
    label: Performance
    description: Remove unnecessary work without changing results.
    default: false
  - id: deadCode
    label: Dead code
    description: Remove code nothing reaches anymore.
    default: false
---

Refactor the code below.

Target:
{{target}}

Desired outcome:
{{outcome}}

Invariants that must not change:
{{invariants}}

Read the target and its callers before changing anything. A refactor that compiles but breaks a caller is not a refactor.

Establish how the current behavior is verified before you start. If the target has no test coverage, say so and tell me what you are relying on instead, because without it neither of us can tell a refactor from a rewrite.

{{#option readability}}
- Readability: clearer names, smaller units, less duplication, and fewer things a reader has to hold in their head at once. Do not trade a real abstraction for a shorter file.
{{/option}}
{{#option testability}}
- Testability: separate side effects from decisions so the logic can be tested without standing up the world. Push input and output to the edges.
{{/option}}
{{#option performance}}
- Performance: remove unnecessary work, repeated computation, and avoidable allocation. Say what you expect to improve and how it could be measured. Do not trade clarity for a gain you cannot demonstrate.
{{/option}}
{{#option deadCode}}
- Dead code: remove code nothing reaches. Prove it is unreachable by searching for callers, including dynamic ones, before deleting it.
{{/option}}
{{#allOptionsDisabled}}
- Make a balanced pass across naming, structure, and safety, and keep the change small enough to review.
{{/allOptionsDisabled}}

Keep behavior identical. Do not fix unrelated bugs you notice along the way: list them separately so I can decide.

For each meaningful change, say what you changed and why in one line. Finish by stating how you verified that behavior is unchanged.
