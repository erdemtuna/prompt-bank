---
id: summarize-text
title: Summarize Text
category: writing
description: Summarize a block of text for a chosen audience and length.
variables:
  - name: sourceText
    description: The text to summarize
    required: true
  - name: audience
    description: Who the summary is for
    required: false
    default: a general reader
  - name: length
    description: Desired length of the summary
    required: false
    default: a short paragraph
---

Summarize the text below clearly and accurately.

Text:
{{sourceText}}

Write the summary for this audience: {{audience}}.
Target length: {{length}}.

Preserve the original meaning, keep key facts and names, and do not add new claims.
