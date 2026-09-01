---
description: Ask the repo what <words> already IS here — declarations, values, spread, siblings, commit mentions, fan-in
argument-hint: <words naming a concept, e.g. "order status">
allowed-tools: Bash(node:*)
---
## grain what: $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" what $ARGUMENTS`

Relay the concept card above to the user: where it is declared (`defined:`, clickable `path:line`), any matching
indexed values and how many places they occur (`values:`), which modules carry it (`spread:`), sibling values from
the same enum/switch/object it belongs to (`siblings:`), how often commit messages mention it and when it was last
mentioned (`changes:` — point at `grain how` for the shape of those changes), and file-level fan-in (`used by:`). This is
"what already exists", not "where should new code go" (`where`) or "what did past changes touching it look like"
(`how`) — use it before extending an existing concept. No declarations or values found is a real answer (the map
line says so); do not treat it as an error. Do not edit anything unless asked. Quote the trailing `as of <sha>`
line.
