---
description: Plant synthetic deviations into conforming exemplars and report how many this repo's own model catches (or evaluate `how` or `where` against a naive baseline)
argument-hint: [--json] | --how [--last N] [--json] | --where [--last N] [--json]
allowed-tools: Bash(node:*)
---
## grain selftest: $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" selftest $ARGUMENTS`

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
Relay the numbers as reported; do not round them further or editorialize about whether they are "good enough" —
that is a maintainer judgment, not something to assert on grain's behalf.
