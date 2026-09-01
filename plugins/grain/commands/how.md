---
description: Ask the repo how a change like <intent> has actually been made here before — real past commits, not a guess
argument-hint: <intent words, e.g. "add a new order status"> [--top N]
allowed-tools: Bash(node:*)
---
## grain how: $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" how $ARGUMENTS`

Relay the answer above to the user: which past commits match the intent (cited by sha and date, an `example`
voice line — evidence, never an instruction to copy verbatim), which files a change like that touched and how
often (`k/K`), and — when the answer opens with a `certified shape "…"` line — that this is a recurring, certified
pattern of past commits, not one anecdote. A `missing from your change:` block at the end applies to the files
the matched commits touched, same as `check`. If grain fell back to the compact map (no past change matched), say
so plainly and use the map instead of inventing a match. Do not edit anything unless asked. Quote the trailing
`as of <sha>` line.
