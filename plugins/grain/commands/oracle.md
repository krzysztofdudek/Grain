---
description: Keep the difference between the graph grain proposed and the graph you accepted, and score the proposal against it — precision and recall on the same measures grain is held to on hand-written graphs
argument-hint: record [--proposal <dir>] [--graph <dir>] [--name <n>] [--out <dir>] [--yes] | score <name-or-dir> [--json]
allowed-tools: Bash(node:*)
---
## grain oracle: $ARGUMENTS

!`node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" oracle $ARGUMENTS`

Two subcommands, one idea. `grain propose` writes a graph; a human reads it, changes it, and accepts a
different one with `yg adopt`. The **difference between those two** says exactly where grain was right and
where a maintainer disagreed — which is what a measurement oracle is. `record` keeps that difference;
`score` turns it into precision and recall.

**`record` never writes on the first run.** It prints what it would store, and where, and stops. The user
re-runs it with `--yes` if that is what they want. This is not a formality to skip: the record describes
their architecture — the path of every tracked file, what they called each part of it, and the identifiers
their rules police — and publishing it is their decision alone. Relay the plan and **wait**. Do not add
`--yes` on their behalf, and do not choose a destination for them: outside this plugin's own fixtures there
is no default, and `--out <dir>` is the user's choice.

What a record carries: both graphs' node types, nodes, mappings, relations, ports and rule statuses; the
tracked paths each of those selects, expanded once against the real repository; and the identifiers each
mechanical rule polices. What it does not carry: file contents, prose, charters, drill corpora, commit
history, author names. Because the file sets are already expanded, `score` needs no checkout — an adopter
whose code is private can still contribute the oracle.

**`score` reports both directions at both granularities**, on the same bar (a match at Jaccard ≥ 0.5 over
file sets) the four hand-written oracles are scored with, so a fifth oracle is comparable to the first four
rather than being a second scale. Read the lines as they print:

- **node types** and **nodes** — recall is how much of the accepted graph the proposal found; precision is
  how much of the proposal survived into it. The parenthetical lines name the denominators, because a node
  that maps no file of its own is not scored either way.
- **relations** — scored only between the nodes both graphs agree on; the line says how many declared
  relations fall outside that set and are therefore scored neither way. Quote that caveat with the number.
- **rules** — how many of the accepted graph's mechanical rules some draft named, and what became of the
  drafts. When no draft appears in the accepted graph under its own name, the command says so: that graph was
  not grown from that proposal, and the row is a comparison of two independent sets, not a review.
- **correction** — merged, split, renamed, dropped, added. This is the human's own editing, counted.

A low number here is a finding, not a failure to explain away: report it as it stands. `--json` emits the
whole score with the correction attached, for a memo or a table.
