---
description: What the work between two commits did to a territory — its files, its imports inside and across its edge, the undeclared dependencies between nodes, and how often the range crossed its edge
argument-hint: --from <sha> --to <sha> [--scope <id|path,…>] [--graph <dir>] [--json]
allowed-tools: Bash(node:*)
---
## grain measure: $ARGUMENTS

!`node -e "const f=process.argv[1];if(!require('fs').existsSync(f)){console.error('grain: '+f+' is not reachable from this environment (a host path inside a container?), so grain did not run');process.exit(0)}const r=require('child_process').spawnSync(process.execPath,process.argv.slice(1),{stdio:'inherit'});process.exit(r.status===null?1:r.status)" "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" measure $ARGUMENTS`

The run above built the model each of the two commits had, from that commit's own tree, and compared what it says about the territory (`--scope`: node ids of the graph and paths; the whole repository without it). Relay it as a before and an after, with the numbers:

- files, and the imports that stay inside the territory, leave it, and come into it, at each end;
- the dependencies between nodes that the graph does not declare, at each end, when there is a graph;
- how many of the range's commits touched the territory and how many of those also touched files outside it, beside the same share for the territory's own commits just before the range. More crossing than usual means the work reached across the territory's edge more than its changes usually do.

The first run on an old commit is slow, because that commit's model is built from scratch; it is kept, and a second run is fast. `--json` emits the `grain-measure/1` document. It writes nothing but the index.
