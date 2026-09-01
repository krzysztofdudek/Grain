---
description: Record a maintainer decision — steer (promote a pattern), boundary (forbid an import direction), or waive (excuse one scope) — or list/withdraw one
argument-hint: steer <path>#<name> --surfaces <pid,…> --note "…" | boundary <from> --never-imports <to> --note "…" | waive <path>#<name> --on <pid> --note "…" | list | rm <id>
allowed-tools: Bash(node:*)
---
## grain decide: $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" decide $ARGUMENTS`

`decide` records one of three kinds of maintainer decision in the committed `.grain/seeds.jsonl` (`decide` is the
current name; `seed add | add-boundary | list | rm` is the identical command under its original name):

- **`steer`** — if grain listed the scope's surfaces instead of recording anything, show the user that list and
  ask which property they want promoted (grain refuses to guess); when the decision replaces an existing pattern,
  also pass `--instead-of <pid,…>` naming the retired surface — that is what lets `check` flag new code still
  written the old way and marks the old rule superseded wherever it fires. Once recorded, it prints as
  `decision steer (<who> <when>): …` on `where` cards and in `check`, beside how far practice has caught up.
- **`boundary`** — an architecture decision: new imports crossing `<from> → <to>` are flagged from then on;
  existing crossings are reported as a transition, never as the caller's fault.
- **`waive`** — excuses exactly one named scope from exactly one convention (`--on <pid>`); `check` then reports
  the departure as `decision waiver (<who> <when>): …`, deliberate rather than an accusation, though the counts
  still report the scope as non-conforming. Refuses when `<path>#<name>` names more than one scope — re-run with
  the exact one grain lists.
- **`list`** / **`rm <id>`** — the decisions in force / withdraw one.

When a decision was recorded, tell the user that `.grain/seeds.jsonl` and `.grain/decisions.jsonl` are meant to be
committed and that the next query re-mines with it. Do not edit source files yourself unless asked — this command
only ever writes to `.grain/`.
