---
description: Mine a PROPOSED Yggdrasil `.yggdrasil/` architecture graph for this repository — nodes, relations and rules with evidence — into a staging directory for a human to accept with `yg adopt`
argument-hint: [<out-dir>] [--full] [--json <path>] [--holdout <YYYY-MM-DD>]
allowed-tools: Bash(node:*)
---
## grain propose: $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" propose $ARGUMENTS`

The run above wrote a **proposal**, never a graph: everything lands in `<out-dir>` (default
`.yggdrasil-proposal/`, self-ignoring so it can never be committed by accident) and the repository's own
`.yggdrasil/` is never touched. Accepting it is `yg adopt`'s job (`yg adopt <out-dir> --dry-run` previews it,
`yg adopt <out-dir>` installs it) and the human's decision, never something to run unasked.

Relay the report as it stands — every line through `next:` already carries a number or a path. Its three
parts, then the handshake:

- **architecture** — node types, nodes, relations and dependency cycles. This is the part that loads; a cycle
  count above zero is declared on purpose, and `REFACTOR-BACKLOG.md` lists them. The node-type count is broken
  down by the LEVEL each cut came from, because no single level is right everywhere: a partition, a module, a
  directory, a domain directory, or the layout alone. Every candidate at a level this run did not activate is
  in `alternatives.md`, grouped by level and carrying the same numbers, so the user can choose a different
  level for one subtree without re-running anything.
- **enforced** — the rules a real `yg drill` proved on this repository's own code (zero false alarms, at least
  one caught violation each) AND that came from a convention grain itself certified. Nothing stands between the
  maintainer and turning these on. Each one says how many sites already break it today, and the proposal sets
  the branch changes are measured against so those sites are reported as warnings until a change reaches them —
  where the repository offered no branch to derive, the report says so and the first check blocks on all of
  them. When no Yggdrasil CLI was found, this says so and nothing is enforced — do
  not present drafts as if they were.
- **candidates** — advisory rules first: the same drill result, but the convention sits below grain's own
  certification bound, so it is real evidence, not yet law — turning it on is the maintainer's refactor
  decision. Then, below them, older-style candidates: drafts the same drill caught a violation with but that are
  held back anyway. Strongest evidence first within each group. Everything else (prose rules, rules nothing can
  violate, finer type alternatives) stays on disk and is summarised in one counted line; `--full` prints all of
  it.
- **the handshake** — the `next:` line names the real transaction: `yg adopt <out-dir> --dry-run` to preview,
  `yg adopt <out-dir>` to accept. When a Yggdrasil CLI resolved, everything printed after `next:` is Yggdrasil's
  own dry-run summary, verbatim — components, rules by status, and **"Already broken N sites"**, the cost of
  accepting today. Relay that block as-is too; it is not grain's prose to paraphrase. When no CLI resolved, the
  line there instead says what `yg adopt` would report once one does.

The "on disk, not above" line also names why a convention was skipped as not a rule at all — a value that is
one of the grammar's own node type names rather than anything a developer wrote
(`parser-node-type-as-identifier`), or one that IS a real declared type parameter of the site it was measured
on — not a domain type at all (`generic-type-parameter-as-domain-type`) — and how many
proposed types host no aspect and take part in no relation ("types with no law", also listed in `PROPOSAL.md`):
real coverage, but nothing there is a rule yet. A row measured within a role-group cluster narrower than the
directory it would otherwise enforce, and that cannot be scoped to that cluster exactly, shows up among the
drafts as `cluster-narrower-than-scope` rather than being enforced against files the measurement never looked
at.

Do not edit any file, do not run `yg adopt` (dry-run or real) or `yg check --approve` yourself, unless the user
asks — the run above may already have shown a real `yg adopt --dry-run` preview, which is read-only and writes
nothing, but accepting a proposal for real is the user's decision alone. If the user wants the numbers as data,
re-run with `--json <path>`.
