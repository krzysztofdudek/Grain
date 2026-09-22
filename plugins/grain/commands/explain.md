---
description: Show the full local-to-global convention lattice around one file (no acceptance cut)
argument-hint: <path to a source file> [--minbits N] [--top N]
allowed-tools: Bash(node:*)
---
## grain explain: $ARGUMENTS

!`node -e "const f=process.argv[1];if(!require('fs').existsSync(f)){console.error('grain: '+f+' is not reachable from this environment (a host path inside a container?), so grain did not run');process.exit(0)}const r=require('child_process').spawnSync(process.execPath,process.argv.slice(1),{stdio:'inherit'});process.exit(r.status===null?1:r.status)" "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" explain $ARGUMENTS`

Summarize the lattice above top-down (the file's groups → its directories → package-wide): `NORM` rows are
accepted conventions, `obs` rows are observations below the acceptance gate, and `← THIS FILE DEVIATES` marks
where this file differs. Keep it compact; point at the rows that matter for what the user is doing. Only reach
for this when the explicit question is "what is local versus global around this file" — it is large, and not the
right tool for a small edit (`check` is). Quote the trailing `as of <sha>` line.
