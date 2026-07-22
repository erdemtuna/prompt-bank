---
id: inspect-git-status
title: Inspect Git Status
category: cli
kind: command
description: Copy a shell command to show the working tree status and recent commits.
variables:
  - name: repositoryPath
    description: Shell ready path to the repository
    required: false
    default: .
---

cd {{repositoryPath}} && git status --short --branch && git --no-pager log --oneline -10
