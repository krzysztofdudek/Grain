---
description: Rebuild the grain index for this repo now (queries auto-refresh; use after a history rewrite)
argument-hint: [--full]
allowed-tools: Bash(node:*)
---
## grain refresh $ARGUMENTS

!`node -e "const f=process.argv[1];if(!require('fs').existsSync(f)){console.error('grain: '+f+' is not reachable from this environment (a host path inside a container?), so grain did not run');process.exit(0)}const r=require('child_process').spawnSync(process.execPath,process.argv.slice(1),{stdio:'inherit'});process.exit(r.status===null?1:r.status)" "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" refresh $ARGUMENTS`

Confirm the rebuild to the user with the freshness line and the model size from the output above.
