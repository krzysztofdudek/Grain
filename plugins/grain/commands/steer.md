---
description: Alias of `decide steer` under its original name — record a maintainer decision that promotes a pattern repo-wide
argument-hint: <path>#<scope name> [--surfaces <pid,…>] [--note "why"] [--topic "words an intent would use"] [--weight N]
allowed-tools: Bash(node:*)
---
## grain seed add: $ARGUMENTS

!`node -e "const f=process.argv[1];if(!require('fs').existsSync(f)){console.error('grain: '+f+' is not reachable from this environment (a host path inside a container?), so grain did not run');process.exit(0)}const r=require('child_process').spawnSync(process.execPath,process.argv.slice(1),{stdio:'inherit'});process.exit(r.status===null?1:r.status)" "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" seed add $ARGUMENTS`

`seed add` is `decide steer` under its original name — same command, same records. See `decide.md` for how to
read and act on the answer above.
