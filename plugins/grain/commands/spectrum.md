---
description: Show the full local-to-global convention lattice around one file (no acceptance cut)
argument-hint: <path to a source file> [--minbits N] [--top N]
allowed-tools: Bash(node:*)
---
## grain spectrum: $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" spectrum $ARGUMENTS`

Summarize the lattice above top-down (the file's groups → its directories → package-wide): `NORM` rows
are accepted conventions, `obs` rows are observations below the acceptance gate, and `← THIS FILE
DEVIATES` marks where this file differs. Keep it compact; point at the rows that matter for what the
user is doing. Quote the trailing `as of <sha>` line.
