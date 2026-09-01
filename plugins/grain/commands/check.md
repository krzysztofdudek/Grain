---
description: Ask the repo how a file — or your whole uncommitted change — sits against the local norm (deviations with evidence and exemplars)
argument-hint: [<path to a source file>] [--staged | --range <a>..<b> | --worktree] [--json]
allowed-tools: Bash(node:*)
---
## grain check: $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" check $ARGUMENTS`

With a file argument: explain the answer above in the user's terms — which conventions govern the file, which it
deviates from (with the `n/N established` evidence, the preference gap in bits, the exemplars, and the locality
note when present), which it already conforms to, and any `missing from your change:` block at the end (a
co-change partner this repo's history usually touches alongside this file — the only source a single-file check
can show; silence means none cleared the confidence floor). A `decision waiver (…): …` line means a maintainer
excused this one departure deliberately; say so, do not "fix" it.

With no file argument (same as `review`): one section per file that has a finding, ordered highest-stakes first,
plus one `missing from your change:` block for the whole set — now also a missing companion for a new
marker-carrier, a sibling value, or a certified change-shape cell your change leaves untouched, none of which a
single-file check can see. A file with nothing to say is not listed — that is not the same as approval; if every
file is silent, the report says so explicitly. With no flags this covers every uncommitted change AND untracked
new file; `--staged` narrows to what is staged, `--range <a>..<b>` asks about a specific range of commits instead
of the worktree.

Do not edit anything unless asked. If the answer is `+dirty`, mention that the uncommitted version was read.
Quote the trailing `as of <sha>` line.
