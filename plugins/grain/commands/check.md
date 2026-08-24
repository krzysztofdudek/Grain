---
description: Ask the repo how a file sits against the local norm (deviations with evidence and exemplars)
argument-hint: <path to a source file>
allowed-tools: Bash(node:*)
---
## grain check: $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" check $ARGUMENTS`

Explain the answer above in the user's terms: which conventions govern the file, which it deviates from
(with the `n/N established` evidence, the exemplars, and the locality note when present), and which it
already conforms to. Do not edit anything unless asked. If the answer is `+dirty`, mention that the
uncommitted version was read. Quote the trailing `as of <sha>` line.
