---
id: rewrite-for-clarity
title: Rewrite for Clarity
category: writing
description: Make a piece of writing clearer without turning it into someone else's voice.
variables:
  - name: draft
    description: The text to rewrite
    required: true
  - name: audience
    description: Who will read it
    required: false
    default: a general reader
  - name: voice
    description: How it should sound
    required: false
    default: Keep the author's existing voice.
options:
  - id: tighten
    label: Tighten
    description: Cut length without losing content.
  - id: plainLanguage
    label: Plain language
    description: Replace jargon and abstraction with concrete words.
  - id: structure
    label: Structure
    description: Reorder so the main point comes first.
  - id: showEdits
    label: Show the edits
    description: Explain what changed and why.
---

Rewrite the text below so it is clearer.

Text:
{{draft}}

Audience: {{audience}}.
Voice: {{voice}}.

Keep the author's meaning exactly. Do not add claims, examples, or conclusions that are not already there, and do not remove a point because it is awkwardly expressed. If something is unclear because the underlying thought is unclear, say so rather than smoothing it over: a fluent sentence that hides a confused idea is worse than the original.

{{#option tighten}}
- Tighten: cut the length without losing content. Remove throat clearing, hedges, and phrases that only restate the previous sentence. Preserve every distinct point.
{{/option}}
{{#option plainLanguage}}
- Plain language: replace jargon, abstract nouns, and passive constructions with concrete words. Keep terms of art that the audience genuinely uses.
{{/option}}
{{#option structure}}
- Structure: lead with the main point, then support it. Break walls of text into paragraphs that each carry one idea, and cut transitions that do no work.
{{/option}}
{{#option showEdits}}
- Show the edits: after the rewrite, list the substantive changes and the reason for each. Skip the trivial ones.
{{/option}}
{{#allOptionsDisabled}}
- Improve clarity and flow with a light touch, and change no more than you need to.
{{/allOptionsDisabled}}

Return the rewritten text first. Flag anything you were unsure how to interpret rather than guessing.
