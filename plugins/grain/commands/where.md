---
description: Ask the repo where things like <intent> live, what is expected there, and which exemplar to copy
argument-hint: <intent words, e.g. "http handler for orders">
allowed-tools: Bash(node:*)
---
## grain where: $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" where $ARGUMENTS`

Relay the answer above to the user faithfully: the place(s) with their shares, the expectations with their
evidence (`n% of N`), the exemplars as clickable `path:line`, and the co-change hints. If grain printed the
compact map instead of a hit, pick the closest entry yourself, say which one and why, and offer to re-ask
with its words. "No strong convention" is a valid answer — say so plainly. Quote the trailing
`as of <sha>` line.
