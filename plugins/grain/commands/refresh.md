---
description: Rebuild the grain index for this repo now (queries auto-refresh; use after a history rewrite)
argument-hint: [--full]
allowed-tools: Bash(node:*)
---
## grain refresh $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" refresh $ARGUMENTS`

Confirm the rebuild to the user with the freshness line and the model size from the output above.
