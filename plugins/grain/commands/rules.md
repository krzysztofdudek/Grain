---
description: Generate a standalone Markdown document of this repo's established conventions, for a reader with no terminal and no grain plugin
argument-hint: [--out <file>] [--top N]
allowed-tools: Bash(node:*)
---
## grain rules $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" rules $ARGUMENTS`

This renders the SAME model `report` prints, as a Markdown document instead of context-window lines —
for a human maintainer, or a coding tool without this plugin installed. With `--out <file>` it writes
the file and answers with a short confirmation only; relay that confirmation, do not print the document
again. Without `--out` the document above IS the answer — relay it in full (or tell the user to redirect
it themselves: `grain rules > CONVENTIONS.md`). Every generated document opens with its own staleness
notice and the commit it was computed from — it is a snapshot, not a live query, and goes stale the
moment the code moves on. Do not edit anything unless asked.
