---
id: review-working-tree-changes
title: Review Working Tree Changes
category: review
description: Review the changes you have made so far, before they become a commit or a pull request.
model_default: gpt-5-6-sol
variables:
  - name: context
    description: What changed, why, and any files or risk areas to weight
    required: false
    default: Review the uncommitted changes in the working tree, using the current conversation for intent.
options:
  - id: regressionRisk
    label: Regressions
    description: Behavior that used to work and may not anymore.
  - id: scopeCreep
    label: Scope creep
    description: Edits that go beyond what the task actually needed.
  - id: testCoverage
    label: Tests
    description: Whether the changed behavior is actually covered.
  - id: leftovers
    label: Leftovers
    description: Debug output, commented code, stray files, and placeholder text.
---

Review the changes we have made so far.

Context:
{{context}}

Start from the real diff, including new and deleted files. Untracked files count as part of the change.

Use {{rubberDuckModel}} reviewers as a second opinion on anything you are not certain about. You wrote or guided most of this code, so weight their disagreement rather than defending the original choice.

Look at these areas. If none is selected, do a brief general pass instead.

{{#option regressionRisk}}
- Regressions: behavior that worked before and may not now. Check callers of every changed signature, and anything that depended on the old shape, ordering, or timing.
{{/option}}
{{#option scopeCreep}}
- Scope creep: edits that were not required by the task. Flag opportunistic refactors, renames, and formatting churn that make the change harder to review than it needs to be.
{{/option}}
{{#option testCoverage}}
- Tests: whether the behavior that changed is actually covered, whether the new tests would fail if the change were reverted, and which uncovered path is riskiest.
{{/option}}
{{#option leftovers}}
- Leftovers: debug logging, commented out code, temporary files, placeholder strings, and anything committed by accident.
{{/option}}
{{#allOptionsDisabled}}
- General pass: correctness, clarity, and anything that should not be committed as is.
{{/allOptionsDisabled}}

Separate blockers from non blocking improvements. For each finding, give the file and line, the evidence you are relying on, and the fix. Point out any assumption you made that you could not verify from the code.

Do not fix anything yet. Report first, and wait for me to choose what to address.
