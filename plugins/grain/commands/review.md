---
description: Alias of `check` with no file argument — one aggregated report over your whole uncommitted change
argument-hint: [--staged | --range <a>..<b> | --worktree] [--json]
allowed-tools: Bash(node:*)
---
## grain review $ARGUMENTS

!`node -e "const f=process.argv[1];if(!require('fs').existsSync(f)){console.error('grain: '+f+' is not reachable from this environment (a host path inside a container?), so grain did not run');process.exit(0)}const r=require('child_process').spawnSync(process.execPath,process.argv.slice(1),{stdio:'inherit'});process.exit(r.status===null?1:r.status)" "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" review $ARGUMENTS`

`review` is `check` with no file argument, under its original name — same command, same output. See `check.md`
for how to read the answer above.
