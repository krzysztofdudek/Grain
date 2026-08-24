---
description: Record a maintainer decision that steers future code toward a pattern (a committed seed in .grain/seeds.jsonl)
argument-hint: <path>#<scope name> [--surfaces <pid,…>] [--note "why"] [--topic "words an intent would use"] [--weight N]
allowed-tools: Bash(node:*)
---
## grain seed add: $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" seed add $ARGUMENTS`

If grain listed the scope's surfaces instead of recording a seed, show the user that list and ask which property
they want promoted (grain refuses to guess); when the decision replaces an existing pattern, also pass
`--instead-of <pid,…>` naming the retired surface (one the exemplar does NOT carry) — that is what lets `check`
flag new code still written the old way and marks the old rule `superseded` in every answer. Re-run with
`--surfaces <pid,…>`, optional `--instead-of`, and a `--note` that says why (an ADR, an issue, a sentence).
When a seed was recorded: tell the user that `.grain/seeds.jsonl` and `.grain/decisions.jsonl` are meant to be
committed, that the next query re-mines with it, and what the decision does — a capped pseudo-count (half the real
population at most; it cannot declare a pattern nobody has written) that prints as `steer (maintainer decision)` on
`where` cards, in `check` and in the session hook, beside how far practice has caught up (`adopted by 11 of 235`).
`grain seed list` / `grain seed rm <id>` manage the decisions; existing carriers of the retired pattern are a
"transition in progress", never flagged as the caller's fault.
