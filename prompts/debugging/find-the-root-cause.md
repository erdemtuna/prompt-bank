---
id: find-the-root-cause
title: Find the Root Cause
category: debugging
description: Trace a bug to its actual cause with evidence, before anything gets fixed.
model_default: gpt-5-6-sol
variables:
  - name: symptom
    description: What goes wrong, and what you expected instead
    required: true
  - name: reproduction
    description: How to trigger it
    required: false
    default: Work out a reliable reproduction from the symptom and the repository.
  - name: scope
    description: Where to look
    required: false
    default: current repository
options:
  - id: recentChanges
    label: Recent changes
    description: Check whether a recent commit introduced this.
  - id: relatedCallSites
    label: Related call sites
    description: Find other places with the same latent bug.
  - id: regressionTest
    label: Regression test
    description: Write a test that fails now and passes after the fix.
---

Find the root cause of the problem below.

Symptom:
{{symptom}}

Reproduction:
{{reproduction}}

Scope:
{{scope}}

Work in this order, and do not skip ahead:

1. Reproduce it, or state exactly why you cannot. Everything after this is guesswork until you can trigger the problem on demand.
2. Narrow it down. Find the smallest input, state, or code path that still shows the symptom.
3. Explain the mechanism. Say precisely how the code produces this behavior, citing the file and line where it goes wrong.
4. Prove it. Show why this cause explains the whole symptom, including any detail that looks incidental.

Separate the root cause from the symptom, and from the place the error surfaced. The line that throws is usually not the line that is wrong. If you find a plausible cause that does not explain everything you observed, keep going.

{{#option recentChanges}}
- Recent changes: check whether this is a regression. Look at the history of the files on the failing path and identify the change that introduced it, or rule that out and say the bug was always there.
{{/option}}
{{#option relatedCallSites}}
- Related call sites: once you know the mechanism, find every other place in the codebase with the same mistake. A bug that appears once in a pattern usually appears more than once.
{{/option}}
{{#option regressionTest}}
- Regression test: write a test that fails against the current code for the right reason. Confirm it fails now, and that it would pass once the cause is removed. A test that passes before the fix is not a regression test.
{{/option}}
{{#allOptionsDisabled}}
- Report the cause and the minimal change that would remove it.
{{/allOptionsDisabled}}

Report the root cause, the evidence, the blast radius, and the minimal fix. If more than one cause is plausible, rank them and say what would distinguish them.

Do not apply the fix until I confirm the diagnosis.
