---
description: A structural overview of the repo — dependency layers, top concepts, certified change shapes, decisions in force
allowed-tools: Bash(node:*)
---
## grain map

!`node -e "const f=process.argv[1];if(!require('fs').existsSync(f)){console.error('grain: '+f+' is not reachable from this environment (a host path inside a container?), so grain did not run');process.exit(0)}const r=require('child_process').spawnSync(process.execPath,process.argv.slice(1),{stdio:'inherit'});process.exit(r.status===null?1:r.status)" "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" map`

Relay the overview above: `layers:` (modules from leaves to top, by dependency depth — a leaf has nothing else in
this repo depending on how it is called), `concepts:` (the repo's own top vocabulary, where commit messages and
code agree), `changes:` (recurring certified shapes of past commits, each with how many changes fit it), and
`decisions:` (how many maintainer decisions are in force). Good for orienting in an unfamiliar repository before
asking anything more specific — treat it as a map, not a set of claims to cite as evidence on its own. Do not edit
anything unless asked. Quote the trailing `as of <sha>` line.
