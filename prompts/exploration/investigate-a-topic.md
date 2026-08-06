---
id: investigate-a-topic
title: Investigate a Topic
category: exploration
description: Investigate a question or an area of a codebase deeply before deciding what to build.
model_default: gpt-5-6-sol
variables:
  - name: intent
    description: The question, topic, or outcome to investigate
    required: false
    default: Use the current conversation, prior analysis, and repository state.
options:
  - id: brainstormMode
    label: Brainstorm
    description: Explore the option space and the tradeoffs between directions.
    default: false
  - id: designMode
    label: Design
    description: Produce a technical design for the strongest direction.
  - id: parallelAgents
    label: Parallel agents
    description: Split the investigation across agents working on separate threads.
---

Investigate the topic below.

Intent:
{{intent}}

Ground every claim in something you actually read. When you state how the system behaves, cite the file and symbol you are reading it from. When you cannot verify something, say so instead of filling the gap with a plausible guess. A confident wrong answer here is worse than an admitted unknown.

{{#option parallelAgents}}
- Parallel agents: split the investigation into genuinely independent threads and give each one to a {{model}} agent with its own brief. Write each brief so it stands alone, naming the repository, the exact scope, and what to report back. Use them for deep or independent threads, not for simple lookups. Synthesize the results yourself, and tell me plainly if a thread came back empty or contradicted another.
{{/option}}
{{#option brainstormMode}}
- Brainstorm: map the option space, including directions I did not ask about. Keep the promising ones open rather than narrowing to one. For each, give the tradeoff that actually decides it. Close by asking which to pursue, which to park, and which to drop.
{{/option}}
{{#option designMode}}
- Design: present the architecture and technical design of the strongest direction, how it fits the existing system, and what it would take to build. Include a diagram where one carries the structure better than prose. Close by asking whether to build it, partially build it, or drop it.
{{/option}}
{{#allOptionsDisabled}}
- Keep it general: report what you found, what it means, and what you would do next.
{{/allOptionsDisabled}}

Be clear about three separate things: what you found, what you infer from it, and what you recommend. Do not blur them together.

Surface every open question to me with enough context to decide on it. Then stop.

Do not implement anything unless I explicitly ask.
