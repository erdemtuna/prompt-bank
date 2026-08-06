---
id: explain-a-codebase-area
title: Explain a Codebase Area
category: code
description: Understand an unfamiliar part of a codebase well enough to change it safely.
variables:
  - name: area
    description: Files, modules, or a question about where something happens
    required: true
  - name: goal
    description: What you are trying to do once you understand it
    required: false
    default: Understand it well enough to make a safe change.
  - name: level
    description: How much background to assume
    required: false
    default: Assume a competent engineer who is new to this codebase.
options:
  - id: entryPoints
    label: Entry points
    description: Where execution starts and how it reaches this code.
  - id: dataFlow
    label: Data flow
    description: How data is shaped and transformed on the way through.
  - id: gotchas
    label: Gotchas
    description: Assumptions and traps that are not obvious from reading.
  - id: changePoints
    label: Change points
    description: Where you would edit for common kinds of change.
---

Explain this part of the codebase.

Area:
{{area}}

What I want to do with it:
{{goal}}

{{level}}

Read the code before describing it. Do not infer behavior from names alone, because a function called validate may not validate. Where the code contradicts its own naming or comments, point that out: that gap is usually the most useful thing you can tell me.

Start with the shape of it in a few sentences, then go deeper.

{{#option entryPoints}}
- Entry points: where execution starts and how it reaches this code. Include the non obvious callers, such as event handlers, scheduled work, and anything wired up dynamically.
{{/option}}
{{#option dataFlow}}
- Data flow: what comes in, how it is shaped along the way, what goes out, and where it is persisted or cached. Name the types and where they are defined.
{{/option}}
{{#option gotchas}}
- Gotchas: assumptions that are not written down, ordering and timing requirements, shared mutable state, error paths that quietly swallow failures, and anything that would surprise someone editing this for the first time.
{{/option}}
{{#option changePoints}}
- Change points: for the common kinds of change here, which file you would edit, what else you would have to update to keep it consistent, and what would break if you forgot.
{{/option}}
{{#allOptionsDisabled}}
- Cover what this code does, how it fits the rest of the system, and what to be careful about.
{{/allOptionsDisabled}}

Cite the file and symbol for anything specific you claim. Say clearly which parts you verified and which parts are your best reading. Finish with the one thing most likely to trip me up.
