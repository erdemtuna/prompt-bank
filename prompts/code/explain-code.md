---
id: explain-code
title: Explain Code
category: code
description: Explain what a piece of code does, matched to a reader level.
variables:
  - name: code
    description: The code to explain
    required: true
  - name: language
    description: Programming language, if known
    required: false
    default: auto detect
  - name: context
    description: Extra context about where this code runs
    required: false
    default: none
  - name: experienceLevel
    description: Reader experience level
    required: false
    default: intermediate
---

Explain the following code.

Code:
{{code}}

Language: {{language}}.
Reader experience level: {{experienceLevel}}.
Extra context: {{context}}.

Describe what the code does, then how it works step by step, and finally any edge cases or risks worth noting. Match the depth to the reader level.
