---
id: summarize-a-source
title: Summarize a Source
category: writing
description: Summarize a document or article for a reader who has to act on it.
variables:
  - name: source
    description: The text, document, or link to summarize
    required: true
  - name: reader
    description: Who the summary is for and what they need from it
    required: false
    default: a busy reader who needs the gist and anything that affects them
  - name: length
    description: How long the summary should be
    required: false
    default: a short paragraph
options:
  - id: keyPoints
    label: Key points
    description: A short list of the points that carry the argument.
  - id: implications
    label: Implications
    description: What follows from this for the reader.
  - id: openQuestions
    label: Open questions
    description: What the source leaves unresolved.
    default: false
  - id: quotes
    label: Quotes
    description: A few exact lines worth keeping.
    default: false
---

Summarize the source below.

Source:
{{source}}

Reader: {{reader}}.
Length: {{length}}.

Represent the source accurately. Keep the key facts, names, and numbers, and keep any qualification the author put on a claim: a hedged finding reported as a certain one is a misquote. Do not add analysis, agreement, or disagreement of your own in the summary itself.

If the source is unclear, self contradictory, or does not actually support its own headline, say so plainly rather than tidying it into something coherent.

{{#option keyPoints}}
- Key points: the handful of points that actually carry the argument, in the order that makes them easiest to follow. Not every point, just the load bearing ones.
{{/option}}
{{#option implications}}
- Implications: what follows from this for the reader, kept clearly separate from what the source itself claims. Label it as your inference.
{{/option}}
{{#option openQuestions}}
- Open questions: what the source raises but does not resolve, and what a reader would need to know before acting on it.
{{/option}}
{{#option quotes}}
- Quotes: a few exact lines worth keeping, quoted verbatim with enough context to be fair to the author.
{{/option}}
{{#allOptionsDisabled}}
- Give a faithful summary at the requested length, and nothing else.
{{/allOptionsDisabled}}

Lead with the summary. Note anything important you could not read or verify.
