---
description: Ask the repo which other files historically change together with the given file(s) — co-change, above a confidence floor
argument-hint: <path to a changed file> [<path> ...]
allowed-tools: Bash(node:*)
---
## grain completeness: $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" completeness $ARGUMENTS`

Relay the answer above to the user: each listed file is one this repo's own commit history shows
reliably changing together with the file(s) given, with its evidence (`co-changed in N/M commits`) —
a measured pattern from history, not a guess and not a lint rule. `no partner above N% co-change
confidence` is a valid answer: it means no partner cleared that floor (or this repo has no usable
history for these files), not that the change itself is finished or correct — never read it, or say
it, as "complete". This is the same check the post-edit hook already runs automatically after an edit;
call it directly here to ask about a file BEFORE you edit it, or to check several files against each
other at once. Do not edit anything unless asked. Quote the trailing `as of <sha>` line.
