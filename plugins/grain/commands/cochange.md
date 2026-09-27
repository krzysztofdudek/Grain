---
description: Which parts of a set of files or graph nodes change together more often than chance, and how well a proposed cut of them into parts follows the seams the history shows
argument-hint: [--files <path,…>] [--nodes <id,…>] [--level file|dir|node] [--partition <json|file>] [--graph <dir>] [--runs N] [--seed N] [--json]
allowed-tools: Bash(node:*)
---
## grain cochange: $ARGUMENTS

!`node -e "const f=process.argv[1];if(!require('fs').existsSync(f)){console.error('grain: '+f+' is not reachable from this environment (a host path inside a container?), so grain did not run');process.exit(0)}const r=require('child_process').spawnSync(process.execPath,process.argv.slice(1),{stdio:'inherit'});process.exit(r.status===null?1:r.status)" "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" cochange $ARGUMENTS`

The run above counted this repository's own commits. Relay what it found at the weight it has:

- **The pairs** are places that changed together more often than their own rates of change predict, counted per file, directory or graph node (`--level`). Each comes with the commits behind it. The line after the count says how many pairs the same count names on shuffled copies of this history, where every pair is false by construction; read the real count against it. A pair is evidence that the two places move together, not that they should be merged or connected.
- **The cut** (with `--partition`) says how many past commits that touched the parts stayed inside one part, and how many imports between the parts' files stay inside one part, each beside the same number for random cuts of the same files that follow the directory tree. A proposed cut that does no better than those random cuts does not follow the seams the history shows; say so plainly.

`--json` emits the `grain-cochange/1` document: every pair with both directions of the count, the null beside it, each part's evidence and the random-cut control.

It writes nothing. Do not change the graph or the plan on the strength of it without the user.
