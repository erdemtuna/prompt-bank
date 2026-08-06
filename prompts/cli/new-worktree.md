---
id: new-worktree
title: New Worktree
category: cli
kind: command
description: Copy a command to create a git worktree so parallel work cannot collide in one checkout.
variables:
  - name: branch
    description: Branch to create for this worktree
    required: true
  - name: baseBranch
    description: Branch to start from
    required: false
    default: main
  - name: worktreeRoot
    description: Directory to place the worktree in, beside the repository
    required: false
    default: ../worktrees
---

git fetch origin && git worktree add -b {{branch}} {{worktreeRoot}}/{{branch}} origin/{{baseBranch}} && cd {{worktreeRoot}}/{{branch}}
