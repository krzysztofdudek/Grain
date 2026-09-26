---
description: Ask the repo which other files historically change together with the given file(s) — co-change, above a confidence floor
argument-hint: <path to a changed file> [<path> ...]
allowed-tools: Bash(node:*)
---
## grain completeness: $ARGUMENTS

!`node -e "const f=process.argv[1];if(!require('fs').existsSync(f)){console.error('grain: '+f+' is not reachable from this environment (a host path inside a container?), so grain did not run');process.exit(0)}const r=require('child_process').spawnSync(process.execPath,process.argv.slice(1),{stdio:'inherit'});process.exit(r.status===null?1:r.status)" "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" completeness $ARGUMENTS`

Relay the answer above to the user. Two separate lists, never merged: the main list names files this
repo's own commit history shows changing together with the file(s) given more often than they change
anyway, with its evidence (`co-changed in N/M commits`, M being the given file's own commits) — a measured, specific pattern, not a guess and not a lint rule. A
trailing "ambient" section (when present) names files touched by almost every commit regardless of
what else changed (a top-level CHANGES file, a lockfile) — background noise this repo happens to churn
constantly, not evidence tying it to the file(s) given; do not treat an ambient file as something this
specific change needs to touch. `no file changes with these more often than it changes anyway` is a valid answer for the
main list: it means no *specific* partner cleared the test (or this repo has no usable history for
these files), not that the change itself is finished or correct — never read it, or say it, as
"complete", even when an ambient section still follows it. This is the same check the post-edit hook
already runs automatically after an edit; call it directly here to ask about a file BEFORE you edit
it, or to check several files against each other at once. Do not edit anything unless asked. Quote the
trailing `as of <sha>` line.
