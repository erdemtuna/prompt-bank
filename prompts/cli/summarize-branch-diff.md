---
id: summarize-branch-diff
title: Summarize Branch Diff
category: cli
kind: command
description: Copy a command that prints what this branch changed relative to its base.
variables:
  - name: baseBranch
    description: Branch to compare against
    required: false
    default: origin/main
  - name: repositoryPath
    description: Shell ready path to the repository
    required: false
    default: .
---

cd {{repositoryPath}} && git --no-pager log --oneline --no-merges {{baseBranch}}..HEAD && git --no-pager diff --stat {{baseBranch}}...HEAD
