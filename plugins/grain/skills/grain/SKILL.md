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
| you wrote or edited a file | usually nothing: grain checked it already (see the hooks below) — run `check <file>` yourself only for `--all`, `--json`, or when you need the full picture including pre-existing deviations |

Not a trigger: reading, investigating, answering questions, touching config or docs.

## grain also speaks unbidden

Two hooks run without being asked. **Before you `Write` a new file**, its path is checked against where its
name-kin already live — a `[grain] placement:` note names the kin directory with counts, and weaker rival kin with
theirs ("the leading count is the one to argue with"). It arrives while changing the directory is still free: weigh
it before writing, and if you place deliberately elsewhere, say so in one line. **After every edit**, the file is
re-checked and grain injects `[grain]` findings ONLY when it has something on the lines you touched — deviations,
maintainer decisions, architecture crossings. **Silence after an edit is not approval** — it means nothing
certified was violated; it is not a review. Never re-run `check` just to confirm a silent edit.

## How to phrase `where`

Use the repository's own vocabulary, not yours: the decorator you expect (`click.command`, `Injectable`), the base
type (`MethodView`, `IRequest`), the file or function name you would look for (`response json`, `cli routes`), the
directory word (`middleware`, `extract`). Hits come in four kinds — **group** (similar code, with its conventions),
**marker** (`@decorator` / `extends X` / `returns X` — where its carriers live), **directory**, **file** (with the
matching functions inside it). There is no test/example special-casing: code is code, and a test file CAN out-rank the
source it tests when it matches your words better — for a source change, take the source hit even when it sits second
or third.

- **One `where` per intent.** If it prints the compact map, grain has no lexical hit: pick the closest entry
  yourself and open its files. Do not re-ask with synonyms.
- **`note: the top hit matches only «word» of your N words`** at the top means the ranking is driven by a fraction of
  your query — verify before building on it.
- A **`superposition:`** line on a group card is the members laid on top of each other: the skeleton they share, the
  slot each fills differently (`one slot is per-instance — e.g. \`AdminController\``), the skewed ones (`Get` 6/9),
  and the fleet's age (`held since … · N new in 180d`). `a new member comes with:` names what to create alongside
  (a same-stem companion, the registering file).
- A **`history bridge:`** line means your word never appears in the code, but commits that say it touched the listed
  files — cited with an example subject and sha. Follow the files, not the word.
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
- Partitions are style regions cut from the directory tree by compression, not by names — `examples/` or a test tree
  usually ends up its own region and its facts stay scoped there (`local (examples/)`), but nothing is filtered by
  name. If the only exemplar you get lives in an examples or test region and you are writing product code, prefer a
  sibling in source and say so.

## The other commands

- `spectrum <file>` — only when the explicit question is "what is local versus global around this file": the full
  lattice with no acceptance cut (`NORM` = accepted, `obs` = below the gate). Large; not for a small edit.
- `status` / `report [--top N]` — model size, freshness, a signal verdict ("sparse model — expect placement, not
  shape"), top conventions with trends, and the **measured architecture**: modules, directed dependencies, cycles
  (`where` directory cards carry `depends on:` / `used by:`). `check` now enforces this at edit time: an import that
  creates the FIRST edge between two modules, closes a dependency cycle, or crosses a committed boundary decision
  (`grain seed add-boundary <from> --never-imports <to>`) is said with the established alternative path. Treat a
  `[grain] architecture:` line as a design question to raise, not a lint error to silence.
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
