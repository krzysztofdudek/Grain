---
description: Mine a PROPOSED Yggdrasil `.yggdrasil/` architecture graph for this repository — nodes, relations and rules with evidence — into a staging directory for a human to review and move in
argument-hint: [<out-dir>] [--full] [--json <path>] [--holdout <YYYY-MM-DD>]
allowed-tools: Bash(node:*)
---
## grain propose: $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" propose $ARGUMENTS`

The run above wrote a **proposal**, never a graph: everything lands in `<out-dir>` (default
`.yggdrasil-proposal/`, self-ignoring so it can never be committed by accident) and the repository's own
`.yggdrasil/` is never touched. Moving it in is the human's decision.

Relay the report as it stands — every line already carries a number or a path. Its three parts:

- **architecture** — node types, nodes, relations and dependency cycles. This is the part that loads; a cycle
  count above zero is declared on purpose, and `REFACTOR-BACKLOG.md` lists them.
- **enforced** — the rules a real `yg drill` proved on this repository's own code (zero false alarms, at least
  one caught violation each) AND that came from a convention grain itself certified. Nothing stands between the
  maintainer and turning these on. When no Yggdrasil CLI was found, this says so and nothing is enforced — do
  not present drafts as if they were.
- **candidates** — advisory rules first: the same drill result, but the convention sits below grain's own
  certification bound, so it is real evidence, not yet law — turning it on is the maintainer's refactor
  decision. Then, below them, older-style candidates: drafts the same drill caught a violation with but that are
  held back anyway. Strongest evidence first within each group. Everything else (prose rules, rules nothing can
  violate, finer type alternatives) stays on disk and is summarised in one counted line; `--full` prints all of
  it.

Do not edit any file, do not move the proposal into `.yggdrasil/`, and do not run `yg check --approve` unless
the user asks. If the user wants the numbers as data, re-run with `--json <path>`.
