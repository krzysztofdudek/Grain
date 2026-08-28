---
description: Ask the repo about your WHOLE change at once — one aggregated report over every file touched since the last commit
argument-hint: [--staged | --range <a>..<b> | --worktree] [--json]
allowed-tools: Bash(node:*)
---
## grain review $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" review $ARGUMENTS`

Relay the answer above to the user: one section per file that has a finding (a maintainer decision your
change departs from, an architecture hit, a placement note, or a deviation in that file's OWN changed
lines — pre-existing deviations outside your change are excluded, same as `check`), ordered highest-stakes
first, plus one line naming any file this repo's own history says usually comes with a change like this
but that you have not touched. A file with nothing to say is not listed — that is not the same as
approval. If every file is silent, the report says so explicitly rather than printing nothing. With no
flags this covers every uncommitted change AND untracked new file (the natural "my whole change so far");
`--staged` narrows to what is staged, `--range <a>..<b>` asks about a specific range of commits instead of
the worktree. Do not edit anything unless asked. Quote the trailing `as of <sha>` line.
