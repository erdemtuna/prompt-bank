---
id: compare-approaches
title: Compare Approaches
category: analysis
description: Weigh two approaches against decision criteria and recommend one.
variables:
  - name: problem
    description: The problem or decision to make
    required: true
  - name: approachA
    description: The first approach
    required: true
  - name: approachB
    description: The second approach
    required: true
  - name: decisionCriteria
    description: What matters most in the decision
    required: false
    default: correctness, simplicity, performance, and maintainability
---

Compare two approaches to the problem below.

Problem:
{{problem}}

Approach A:
{{approachA}}

Approach B:
{{approachB}}

Decision criteria:
{{decisionCriteria}}

Compare the two approaches against the criteria. Cover tradeoffs, risks, and effort. End with a clear recommendation, and state the conditions under which the other option would be the better choice.
