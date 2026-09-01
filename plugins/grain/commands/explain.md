---
description: Show the full local-to-global convention lattice around one file (no acceptance cut)
argument-hint: <path to a source file> [--minbits N] [--top N]
allowed-tools: Bash(node:*)
---
## grain explain: $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" explain $ARGUMENTS`

Summarize the lattice above top-down (the file's groups → its directories → package-wide): `NORM` rows are
accepted conventions, `obs` rows are observations below the acceptance gate, and `← THIS FILE DEVIATES` marks
where this file differs. Keep it compact; point at the rows that matter for what the user is doing. Only reach
for this when the explicit question is "what is local versus global around this file" — it is large, and not the
right tool for a small edit (`check` is). Quote the trailing `as of <sha>` line.
