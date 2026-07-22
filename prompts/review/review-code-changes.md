---
id: review-code-changes
title: Review Code Changes
category: review
description: Review a code change from selected perspectives with a second opinion.
model_default: gpt-5-6-sol
variables:
  - name: changes
    description: The diff, patch, or description of the changes
    required: true
  - name: intent
    description: What the change is trying to achieve
    required: false
    default: Infer the intent from the changes.
options:
  - id: correctnessFocus
    label: Correctness
    description: Logic, edge cases, error handling, and tests
  - id: securityFocus
    label: Security
    description: Input validation, authorization, injection, and secrets
  - id: accessibilityFocus
    label: Accessibility
    description: Semantics, labels, keyboard access, and contrast
---

Review the code changes below.

Changes:
{{changes}}

Intent:
{{intent}}

Use {{model}} as the primary reviewer and {{rubberDuckModel}} as an independent second reviewer.

{{#option correctnessFocus}}
Check correctness: logic errors, edge cases, error handling, and test coverage.
{{/option}}

{{#option securityFocus}}
Check security: input validation, authorization, injection, secrets, and unsafe defaults.
{{/option}}

{{#option accessibilityFocus}}
Check accessibility: semantics, labels, keyboard access, and color contrast.
{{/option}}

{{#allOptionsDisabled}}
Do a general review across correctness, security, and readability.
{{/allOptionsDisabled}}

For each finding, give the issue, why it matters, and a suggested fix.
