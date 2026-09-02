---
description: What a NEW file under this path has historically required — obligations mined from git status alone, before the file is written
argument-hint: <path> [--top N]
allowed-tools: Bash(node:*)
---
## grain obligation: $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" obligation $ARGUMENTS`

Relay the answer above to the user. `<path>` need not exist — that is the point: ask BEFORE writing the file.
Two separate lists, never merged: "has come with" names files this repo's own history shows a genuine, specific
correlation with a NEW file of this path's (module, extension) class (e.g. a build manifest, a per-component
changelog, a generated API-signature file) — treat each as something this change likely also needs to touch.
"ambient" names files touched by almost every commit regardless of what kind it is (a top-level CHANGES file, a
lockfile) — background noise this repo happens to churn constantly, not a discovery about this specific class; do
not treat an ambient file as an obligation. A class with too little history, or none at all, says so plainly
rather than going silent with no explanation — that silence is itself the answer, not a bug. Do not edit anything
unless asked. Quote the trailing `as of <sha>` line.
