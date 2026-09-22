---
description: Ask the repo what <words> already IS here — declarations, values, spread, siblings, commit mentions, fan-in
argument-hint: <words naming a concept, e.g. "order status">
allowed-tools: Bash(node:*)
---
## grain what: $ARGUMENTS

!`node -e "const f=process.argv[1];if(!require('fs').existsSync(f)){console.error('grain: '+f+' is not reachable from this environment (a host path inside a container?), so grain did not run');process.exit(0)}const r=require('child_process').spawnSync(process.execPath,process.argv.slice(1),{stdio:'inherit'});process.exit(r.status===null?1:r.status)" "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" what $ARGUMENTS`

Relay the concept card above to the user: where it is declared (`defined:`, clickable `path:line`), any matching
indexed values and how many places they occur (`values:`), which modules carry it (`spread:`), sibling values from
the same enum/switch/object it belongs to (`siblings:`), how often commit messages mention it and when it was last
mentioned (`changes:` — point at `grain how` for the shape of those changes), and file-level fan-in (`used by:`). This is
"what already exists", not "where should new code go" (`where`) or "what did past changes touching it look like"
(`how`) — use it before extending an existing concept. No declarations or values found is a real answer (the map
line says so); do not treat it as an error. Do not edit anything unless asked. Quote the trailing `as of <sha>`
line.
