---
id: compare-approaches
title: Compare Approaches
category: analysis
description: Weigh two or more approaches against real criteria and commit to a recommendation.
model_default: gpt-5-6-sol
variables:
  - name: decision
    description: The decision to make, and why it is being made now
    required: true
  - name: approaches
    description: The approaches to compare
    required: true
  - name: criteria
    description: What actually matters in this decision
    required: false
    default: correctness, simplicity, operational cost, and how hard it is to change later
options:
  - id: reversibility
    label: Reversibility
    description: What it costs to undo each choice later.
  - id: effort
    label: Effort
    description: Real cost to build, including the parts people forget.
  - id: maintenance
    label: Maintenance
    description: What each option is like to live with in a year.
  - id: steelman
    label: Steel-man
    description: Argue the strongest case for the option you did not pick.
---

Compare the approaches to the decision below.

Decision:
{{decision}}

Approaches:
{{approaches}}

Criteria:
{{criteria}}

Compare them against the criteria, not against a generic list of virtues. Where an approach wins, say by how much and on what evidence. Where the difference is negligible, say that instead of manufacturing a distinction.

Be concrete about where each one breaks down. Every approach has a case it handles badly; if you cannot name that case for an option, you have not understood it yet.

{{#option reversibility}}
- Reversibility: what it costs to back out of each choice in six months. Separate the ones that are a config change from the ones that need a migration or a rewrite. A cheap mistake and an expensive mistake do not deserve the same caution.
{{/option}}
{{#option effort}}
- Effort: the real cost to build each one, including tests, migration, documentation, and the work of retiring whatever it replaces. Say which estimate you are least confident in.
{{/option}}
{{#option maintenance}}
- Maintenance: what each option is like to live with once it is no longer new. Who has to understand it, what it makes harder, and what it drags along as a dependency.
{{/option}}
{{#option steelman}}
- Steel-man: have a rubber-duck reviewer{{#model rubberDuckModel}} using {{rubberDuckModel}}{{/model}} build the strongest honest case for whichever option you did not recommend, then answer it. If you cannot answer it, weaken your recommendation.
{{/option}}
{{#allOptionsDisabled}}
- Compare them on the stated criteria, and cover tradeoffs and risk.
{{/allOptionsDisabled}}

End with one recommendation, not a summary of both sides. Then state the specific conditions under which the other choice would be right, so I can tell whether those conditions apply to me.

If the decision genuinely does not matter, say so and tell me to pick either and move on.
