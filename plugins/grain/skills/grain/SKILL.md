---
name: grain
description: Ask the repository about its own conventions BEFORE writing code. Use whenever you are about to create a source file, add a class/function/handler/command/component/test, or are unsure where something belongs — `grain where <intent>` names the directory, the group and the exemplar to copy, with evidence; `grain check <file>` shows where your change departs from the local norm. Statistical answers from this repo's code and full git history; tells you which exemplar to open, never blocks.
---

# grain — ask the repository which exemplar to copy

grain has mined this repository's syntax trees and whole git history into a model of what is *practiced* here: the
groups of similar code, where they live, what they import, extend, decorate, return, how they are named, and which
files historically change together. One query tells you **which directory and which exemplar to open, and what
about it will surprise you**. It does not replace reading one good exemplar — it replaces guessing which one, and
it catches the departure you would not have noticed.

## Run it

From the repository root, through Bash:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" <command> …
```

Run it as-is from the session's working directory — **no leading `cd`** (the sandbox may refuse the `cd`, and grain finds
the repository root itself; `--repo <path>` points it at another checkout). Every answer ends with `as of <sha>` (the
commit the model was computed from); `+dirty` means the file you asked about was read from your uncommitted worktree. A missing or stale index builds/refreshes itself before answering
(full history once, incremental afterwards) — let a slow first run finish.

## When to ask

| Moment | Ask |
|---|---|
| about to create a source file, or unsure where something belongs | `where <intent>` — **once**, with the repo's own words |
| about to trust your prior about a familiar framework or template | `where <the marker you expect>` — grain's job is to tell you how *this* copy differs from the one you remember |
| you wrote or edited a file | `check <file>` — deviations in your change, with evidence and the exemplar to compare against |

Not a trigger: reading, investigating, answering questions, touching config or docs.

## How to phrase `where`

Use the repository's own vocabulary, not yours: the decorator you expect (`click.command`, `Injectable`), the base
type (`MethodView`, `IRequest`), the file or function name you would look for (`response json`, `cli routes`), the
directory word (`middleware`, `extract`). Hits come in four kinds — **group** (similar code, with its conventions),
**marker** (`@decorator` / `extends X` / `returns X` — where its carriers live), **directory**, **file** (with the
matching functions inside it). Source hits rank above tests/examples unless you ask for tests.

- **One `where` per intent.** If it prints the compact map, grain has no lexical hit: pick the closest entry
  yourself and open its files. Do not re-ask with synonyms.
- **`weak match:` at the top** means the best hit covers under half of the query's weight — a hint to verify, not a
  place to build on.
- **Retrieval miss ≠ freedom.** If every hit lands somewhere unrelated to what you are writing (all in `tests/`
  for a source change, all in one odd file), that is a miss. Re-ask once with an exact identifier or decorator from
  the file you expect to edit; if that misses too, open the nearest sibling of that file and copy it.
- **"No strong convention here beyond placement"** means grain could not certify a convention at its acceptance
  floor — usually the group is small. It is *not* evidence that the neighbours vary. Open the listed exemplar.

## How to read `check`

- Deviations **in your change** come first, each with `n/N established` evidence, the preference gap in bits, and
  exemplars. `100% of 29` is a rule — follow it or say in one line why not. `85% of 240` is a tendency.
- `In this file, \`x\` (line N) conforms.` names a neighbour in the same file to copy; `(held since …, last reinforced …)`
  says how old and how alive the rule is; `not to copy:` on a `where` card names the members that deviate.
- **Pre-existing** deviations (scopes you did not touch) are folded into one line. They are not yours to fix;
  `--all` lists them if you are asked to.
- **Zero deviations is not a review.** If the "conforms to" list is empty or grain says no convention governs the
  file, grain knows nothing certified about this kind of file here — say that, or say nothing; never report it to the
  user as "verified against the repository's conventions".
- "This is the local default of this directory — the wider package's norm differs here" means a neighbourhood
  habit, not a package-wide law.
- Exemplars under `examples/`, `templates/`, `scripts/` or a test tree are observations, not the house style;
  grain keeps them in their own partition, but if one is all you get, prefer a sibling in source.

## The other commands

- `spectrum <file>` — only when the explicit question is "what is local versus global around this file": the full
  lattice with no acceptance cut (`NORM` = accepted, `obs` = below the gate). Large; not for a small edit.
- `status` / `report [--top N]` — model size, freshness, a signal verdict ("sparse model — expect placement, not
  shape"), top conventions with trends, and the **measured architecture**: modules, directed dependencies, cycles
  (`where` directory cards carry `depends on:` / `used by:`). Before adding a cross-module import, check the graph —
  a dependency edge that does not exist yet is a boundary someone may be keeping.
- `refresh [--full]` — rebuild now (queries already auto-refresh).
- `check <file> --json` / `where --json` / `report --json` / `status --json` / `export --out <file>` — the same answers
  as data (for harnesses and training pipelines, not for a conversation).
- `seed add <path>#<name> --surfaces <pid,…> [--instead-of <pid,…>] --note "why"` · `seed list` · `seed rm <id>` — a
  **maintainer decision** recorded in the committed `.grain/seeds.jsonl`: it promotes one property of one exemplar,
  capped at half the real population (it cannot invent a convention nobody has written). Name what it replaces with
  `--instead-of` — then the retired rule is muted or marked `superseded` wherever it fires, and `check` reports code
  still carrying the retired pattern as departing from the decision (existing carriers are folded into one calm
  "transition in progress" line). When the user says "from now on prefer X" / "we are moving to Y", offer to record it
  as a seed instead of editing files by hand.

## Steers in answers

A line starting `steer (maintainer decision, <who> <when>)` on a `where` card, or `[grain] maintainer decision` in
`check`, is authority, not statistics: follow it even where the measured share beside it is still low, copy the
exemplar it names, and say in one line that you followed a recorded decision. It is the only place grain lets a
decision outrank the numbers, and it is labelled as exactly that.

grain informs; it never blocks. No embeddings, no model calls, no network. A convention is a majority, not a
virtue, and uncommitted changes never feed the norm.
