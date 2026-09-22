---
description: grain report — the repository's top conventions with evidence and trends
argument-hint: [--top N]
allowed-tools: Bash(node:*)
---
## grain report $ARGUMENTS

!`node -e "const f=process.argv[1];if(!require('fs').existsSync(f)){console.error('grain: '+f+' is not reachable from this environment (a host path inside a container?), so grain did not run');process.exit(0)}const r=require('child_process').spawnSync(process.execPath,process.argv.slice(1),{stdio:'inherit'});process.exit(r.status===null?1:r.status)" "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" report $ARGUMENTS`

Present the conventions above grouped by where they hold (group / directory / package-wide), each with its
`n% of N` evidence and trend. Do not editorialize about code quality — a convention is a majority, not a
virtue. Quote the trailing `as of <sha>` line.
