---
description: Plant synthetic deviations into conforming exemplars and report how many this repo's own model catches (or evaluate `how`, `where` or extraction itself against a naive baseline/oracle)
argument-hint: [--json] | --how [--last N] [--json] | --where [--last N] [--json] | --extract [--json] | --null [--runs N] [--json]
allowed-tools: Bash(node:*)
---
## grain selftest: $ARGUMENTS

!`node -e "const f=process.argv[1];if(!require('fs').existsSync(f)){console.error('grain: '+f+' is not reachable from this environment (a host path inside a container?), so grain did not run');process.exit(0)}const r=require('child_process').spawnSync(process.execPath,process.argv.slice(1),{stdio:'inherit'});process.exit(r.status===null?1:r.status)" "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" selftest $ARGUMENTS`

This is a validation procedure, not something to run mid-task. Plain `selftest` plants a synthetic violation into
a real conforming exemplar for every mined convention and reports how many `check` actually catches
(`<detected>/<plantable> planted deviations caught`), how many false fires, and how many mutations were
unsupported (the mutation broke the parse, or the fact never governed that exemplar to begin with — neither counts
as a miss). `selftest --how [--last N]` instead runs a leave-one-out check of `how`'s own precision/recall/F1 at
predicting a past commit's files from its message, against a naive grep baseline, over the last N real commits.
`selftest --where [--last N]` runs the sibling check for `where`: over the last N commits that ADDED a file, it
asks how `where` ranks that file — and the place holding it — from the commit's own message, against a baseline
that ranks paths by how many of the same words they contain. It reports the pooled numbers and, beside them, the
same numbers over only the commits whose message does NOT contain the added file's own name — the half no name
matcher can win.
`selftest --extract` checks extraction itself, per grammar: an oracle derived from the grammar's own node-types.json
(every named node type with a `name` field, or a C/C++-style `declarator`, and a body-shaped child — no language or
keyword named anywhere) says what a declaration looks like; recall is the fraction of the oracle's candidates that
extraction actually recorded as a scope, precision is the fraction of extraction's recorded scopes the oracle agrees
are declarations. A grammar with no such node type at all (JSON/YAML/TOML) is reported as a boundary, not a score.
`--json` adds the first 10 misses (a declaration the oracle sees that extraction did not record) and 10 extras
(a scope extraction recorded that the oracle does not consider a declaration), each as `file:line name`.
`selftest --null [--runs N]` measures false certifications: every family of claims is run again on a copy of the
repository's own evidence with the link it claims destroyed and its marginals kept (role labels and directory placements dealt out again,
import sets dealt out among files, the commit × file matrix swap-randomised, commit messages dealt out among
commits, value-set members dealt out among the files declaring the set, fix commits dealt out among all edits), and it reports, per family, how many claims survive that (mean and maximum over the runs) beside the real
count. Anything certified under the null is false by construction. Each run costs two full learn passes.
Relay the numbers as reported; do not round them further or editorialize about whether they are "good enough" —
that is a maintainer judgment, not something to assert on grain's behalf.
