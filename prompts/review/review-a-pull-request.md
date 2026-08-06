---
id: review-a-pull-request
title: Review a Pull Request
category: review
description: Multi-perspective PR review that returns findings with evidence, severity, and a fix.
model_default: gpt-5-6-sol
variables:
  - name: pullRequest
    description: Pull request URL, number, or branch to review
    required: true
    default: current PR
  - name: intent
    description: What the change is meant to achieve, and any known risk areas
    required: false
    default: Use the pull request description, the branch name, and the discussion so far.
options:
  - id: correctnessFocus
    label: Correctness
    description: Logic, edge cases, error handling, and test coverage.
  - id: securityFocus
    label: Security
    description: Input validation, authorization, injection, secrets, and unsafe defaults.
  - id: frontendFocus
    label: Frontend
    description: UI behavior, client state, accessibility, and design system fit.
    default: false
  - id: backendFocus
    label: Backend
    description: API contracts, data flow, persistence, and server side validation.
    default: false
---

Review the pull request: {{pullRequest}}.

Intent:
{{intent}}

Read the actual diff before forming an opinion. Do not review the description alone, and do not assume a file is unchanged because the description does not mention it.

Use {{model}} as the primary reviewer, and a set of {{rubberDuckModel}} reviewers as independent second opinions. Give each reviewer one of the perspectives below so they work from different angles, and add one reviewer who looks at the change holistically. Reserve them for genuinely separate threads of judgment, not for simple lookups. Reconcile their findings yourself, and say plainly when two reviewers disagree rather than averaging them away.

Review from these perspectives. If none is selected, do a general readiness pass instead.

{{#option correctnessFocus}}
- Correctness: logic errors, unhandled edge cases, error paths, concurrency and ordering assumptions, and whether the tests actually cover the behavior that changed.
{{/option}}
{{#option securityFocus}}
- Security: input validation, authorization and access control, injection and deserialization, secret handling, and defaults that are unsafe when a caller does nothing.
{{/option}}
{{#option frontendFocus}}
- Frontend: UI behavior and client state, loading and error states, accessibility, responsive behavior, and fit with the existing design system rather than new one-off primitives.
{{/option}}
{{#option backendFocus}}
- Backend: API contracts and compatibility, data flow and persistence, migrations, server side validation, error handling, and observability.
{{/option}}
{{#allOptionsDisabled}}
- General readiness: correctness, clarity, tests, and anything that would block a merge.
{{/allOptionsDisabled}}

Report every material finding with all five of these:

1. What you found, stated as a specific claim.
2. Where it is, as a file path and line or symbol.
3. Why it matters, in terms of user or operator impact.
4. Severity: blocker, should fix, or nit.
5. A concrete recommended fix.

Group the findings by severity, blockers first. Do not pad the review: if a perspective turned up nothing, say so in one line. Close with a clear merge recommendation and the single thing you are least sure about.

Do not push commits or change the pull request unless I explicitly ask.
