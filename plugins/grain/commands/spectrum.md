---
description: Alias of `explain` under its original name — same command, same output
argument-hint: <path to a source file> [--minbits N] [--top N]
allowed-tools: Bash(node:*)
---
## grain spectrum: $ARGUMENTS

!`node -e "const f=process.argv[1];if(!require('fs').existsSync(f)){console.error('grain: '+f+' is not reachable from this environment (a host path inside a container?), so grain did not run');process.exit(0)}const r=require('child_process').spawnSync(process.execPath,process.argv.slice(1),{stdio:'inherit'});process.exit(r.status===null?1:r.status)" "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" spectrum $ARGUMENTS`

`spectrum` is `explain` under its original name — same command, same output. See `explain.md` for how to read the
lattice above.
