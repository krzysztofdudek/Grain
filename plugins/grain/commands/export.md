---
description: Dump the whole convention model as JSON (every convention with all its sites, anchors, trends, groups, markers, co-change) for pipelines and audits
argument-hint: [--out <file>] [--max-sites N] [--no-anchors]
allowed-tools: Bash(node:*)
---
## grain export: $ARGUMENTS

!`node -e "const f=process.argv[1];if(!require('fs').existsSync(f)){console.error('grain: '+f+' is not reachable from this environment (a host path inside a container?), so grain did not run');process.exit(0)}const r=require('child_process').spawnSync(process.execPath,process.argv.slice(1),{stdio:'inherit'});process.exit(r.status===null?1:r.status)" "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" export $ARGUMENTS`

Without `--out` the JSON is printed here and is large; prefer `--out <file>` and report the summary line (conventions,
groups, deviating sites, co-change pairs, size) and the `as of` stamp. The dump is what a training-data or audit
pipeline reads — do not summarise its contents to the user unless asked.
