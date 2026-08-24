---
description: grain report — the repository's top conventions with evidence and trends
argument-hint: [--top N]
allowed-tools: Bash(node:*)
---
## grain report $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" report $ARGUMENTS`

Present the conventions above grouped by where they hold (group / directory / package-wide), each with its
`n% of N` evidence and trend. Do not editorialize about code quality — a convention is a majority, not a
virtue. Quote the trailing `as of <sha>` line.
