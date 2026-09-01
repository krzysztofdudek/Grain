---
description: Alias of `check` with no file argument — one aggregated report over your whole uncommitted change
argument-hint: [--staged | --range <a>..<b> | --worktree] [--json]
allowed-tools: Bash(node:*)
---
## grain review $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" review $ARGUMENTS`

`review` is `check` with no file argument, under its original name — same command, same output. See `check.md`
for how to read the answer above.
