---
name: grain
description: Ask the repository about its own conventions BEFORE writing code. Use whenever you are about to create a source file, add a class/function/handler/command/component/test, are unsure where something belongs, or want to know how a kind of change has been done here before — `grain where <intent>` names the directory, the group and the exemplar to copy; `grain obligation <path>` names what a new file there has historically had to come with; `grain how <intent>` cites the past commits that did something like it; `grain what <words>` reports what a concept already is here; `grain check <file>` shows where your change departs from the local norm; `grain completeness <file>` names co-changing files before you call a change done. Statistical answers from this repo's code and full git history; tells you which exemplar to open, never blocks.
---

# grain — ask the repository which exemplar to copy

grain has mined this repository's syntax trees and whole git history into a model of what is *practiced* here: the
groups of similar code, where they live, what they import, extend, decorate, return, how they are named, which
files historically change together, the recurring shapes of past commits, and the values (enum members, string
literals) that travel together. It does not replace reading one good exemplar — it replaces guessing which one,
and it catches the departure you would not have noticed.

## Run it

From the repository root, through Bash:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" <command> …
```

Run it as-is from the session's working directory — **no leading `cd`** (the sandbox may refuse the `cd`, and grain finds
the repository root itself; `--repo <path>` points it at another checkout). Every answer ends with `as of <sha>` (the
commit the model was computed from); `+dirty` means the file you asked about was read from your uncommitted worktree. A missing or stale index builds/refreshes itself before answering
(full history once, incremental afterwards) — let a slow first run finish.

## Four questions

Everything below reduces to four questions. Each has a command you can ask directly, and — for three of them — a
moment where grain already asks it for you, unbidden:

| Question | Ask | Grain already asks it |
|---|---|---|
| Where does this belong, and what's expected there? | `where <intent>` — once, with the repo's own words | before you `Write` a new file (placement note, from the path alone) |
| How has a change like this actually been done here before? | `how <intent>` — cites real commits, not a guess | before your prompt is even read, when it resembles a certified shape or clearly matches past changes (see below) |
| What already IS this concept in this codebase? | `what <words>` — declarations, values, spread, siblings, commit mentions | nothing automatic — this one is always a deliberate call |
| Does my change conform to the local norm? | `check <file>` / `check` (whole change) / `review` | after every edit, and before a `git commit` runs |

Not a trigger for any of these: reading, investigating, answering questions, touching config or docs.

## The voice rule

Every line grain prints as a claim carries one of four voices, marked identically in every command, so you never
have to infer authority from wording:

- **practiced** — the statistical claim, unmarked (`methods here always call \`validate()\` — 91% of 120`). The
  default; the only voice allowed to carry no marker at all.
- **decided** — a maintainer's committed override, `decision <typ> (<who> <when>): …` (a catalog listing in
  `report`/`rules` adds the id: `decision <typ> (id <8-hex>, <who> <when>): …`). The numbers may still disagree —
  that is the point. Follow it anyway and say in one line that you did.
- **example** — one real historical instance, `example (<sha>[ <YYYY-MM>]): "…"` (date present on `how`'s commit
  citations, sha-only on a history-mention line), never a certified convention.
  Follow the files it names, not the words in the message.
- **map** — `map: …`, a structural overview of where things live, not an assertion about how they are written.

**Silence is not approval.** A hook saying nothing after an edit, a read, or your own prompt means grain had
nothing certified to add — not that it reviewed your work and found it clean. Never re-run a command just to
confirm a silent edit, and never report silence to a user as "verified against the repository's conventions."

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
- Every card opens with an `in: <module>` line (its dependency layer and how many modules depend on it, once the
  architecture graph has one — see `map` below) and a **`superposition:`** line: the members laid on top of each
  other, the skeleton they share, the slot each fills differently, the skewed ones, the fleet's age. `a new member
  comes with:` is the recipe for a new instance. `twin: structurally the same as «B» …` on a group card names a
  role group elsewhere in the repo with the same shape, possibly under a different name.
- An `example (<sha>): "…"` line (the old "history bridge") means your word never appears in the code,
  but a commit saying it touched the listed files. Follow the files, not the word.
- **Retrieval miss ≠ freedom.** If every hit lands somewhere unrelated to what you are writing, that is a miss.
  Re-ask once with an exact identifier or decorator from the file you expect to edit; if that misses too, open the
  nearest sibling of that file and copy it.
- **"No strong convention here beyond placement"** means grain could not certify a convention at its acceptance
  floor. It is *not* evidence that the neighbours vary. Open the listed exemplar.

## How to ask `how`

`how <intent words>` answers by example, not by rule: which past commits look like the change you are about to
make, and which files a change like that actually touched, ranked `k/K` (K = how many of the cited commits touched
that file). When your intent clearly matches a recurring, certified shape of past commits, the answer opens with
that shape's cells (`"<label>" (n changes): <cell> (k of n) · …`) before the examples — a certified pattern, not
one anecdote. Zero matches falls back to `where`'s own compact map, whole and unmodified — nothing is invented.
Cite the commits it names as evidence, not as instructions to follow verbatim.

## How to ask `what`

`what <words>` is the concept card: what a word or phrase already IS here, distinct from `where` ("where should
new code go") and `how` ("what did past changes look like"). One card: `defined:` (declarations matching the
words), `values:` (enum members / string literals from the value index that match), `spread:` (which modules
carry it), `siblings:` (other values from the same enum/switch/object), `changes:` (commit mentions, with a
pointer to `how` for the shape), `used by:` (file-level fan-in). Ask it before extending an existing concept, to
see everything grain already knows about it in one place.

## How to read `check`

- Deviations **in your change** come first, each with `n/N established` evidence, the preference gap in bits, and
  exemplars. `100% of 29` is a rule — follow it or say in one line why not. `85% of 240` is a tendency.
- `In this file, \`x\` (line N) conforms.` names a neighbour in the same file to copy; `(held since …, last reinforced …)`
  says how old and how alive the rule is; `not to copy:` on a `where` card names the members that deviate. A note
  ending `deviants get fixes N× more often` means leaving this one uncorrected has a measured, historical cost.
- **Pre-existing** deviations (scopes you did not touch) are folded into one line. They are not yours to fix;
  `--all` lists them if you are asked to.
- **Zero deviations is not a review.** If the "conforms to" list is empty or grain says no convention governs the
  file, grain knows nothing certified about this kind of file here — say that, or say nothing; never report it to the
  user as "verified against the repository's conventions".
- **`missing from your change:`** at the end names what your change is missing, not what it broke: a co-change
  partner this repo's history usually touches alongside the files you changed (the only source a single-file
  `check <file>` shows) — plus, for `check`'s whole-change form and `review`, a companion file a new
  marker-carrier usually comes with, a sibling value (`kin:`) the rest of an enum/set has that yours does not, and
  a cell of a certified change shape (`change shape:`) your change leaves untouched. Silence means nothing is
  missing — there is no "(complete)" line to look for.
- `decision waiver (<who> <when>): …` on a deviation means a maintainer excused this ONE scope from this ONE
  convention — the departure is deliberate, say so, and do not "fix" it.
- "This is the local default of this directory — the wider package's norm differs here" means a neighbourhood
  habit, not a package-wide law.
- Partitions are style regions cut from the directory tree by compression, not by names — `examples/` or a test tree
  usually ends up its own region and its facts stay scoped there (`local (examples/)`), but nothing is filtered by
  name. If the only exemplar you get lives in an examples or test region and you are writing product code, prefer a
  sibling in source and say so.
- `check` with no file argument, and `review`, both mean "my whole uncommitted change" — one aggregated pass,
  highest-stakes findings first. Run it when you consider a unit of work done, not just the last file you touched.

## grain also speaks unbidden

Six hooks run mid-task, all silent on failure, none ever block:

- **Before you `Write` a new file**, its path is checked against where its name-kin already live — a
  `[grain] placement:` note names the kin directory with counts, weaker rival kin with theirs. It arrives while
  changing the directory is still free: weigh it before writing, and if you place deliberately elsewhere, say so
  in one line.
- **After every `Edit`/`Write`/`MultiEdit`**, the file is re-checked and grain injects `[grain]` findings ONLY when
  it has something on the lines you touched — deviations, maintainer decisions, architecture crossings, a
  placement note — plus, on its own line and capped to 3 partners, the other files this repo's own history shows
  reliably changing together with the one you just touched. That co-change line can fire even when nothing else
  does.
- **Before an `Edit`/`MultiEdit` lands**, the same co-change evidence for the file about to be touched arrives
  ahead of the edit, while touching both halves of an established pair in one pass is still cheap. It shares its
  repeat-suppression with the post-edit line above, so you see the pair named once, not twice, in one turn.
- **After you `Read`** a file, if it is itself one of a convention's known deviants, grain says so once — "don't
  copy that part" — and points at a conforming sibling elsewhere. Silence means either the file conforms, or it
  is a deviant no fact ranks as a top-5 example worth citing.
- **Before your prompt is even read**, grain checks it against the repository's own history of past changes; if it
  strongly resembles a certified change shape or clearly matches how a recognizable kind of change has been done
  here before, it injects the certified shape's cells and the places such a change touched — silently, on
  everything else.
- **Before a `git commit` runs** (in a Bash tool call), grain reviews the whole staged (or, for `-a`, worktree)
  change ahead of the commit — the same report `review` would print, budget-capped.

**A host with no prompt-submission hook gets none of the `how`-hook behavior above** (confirmed for Codex CLI at
the time of writing). Where this integration cannot inject anything before your prompt is read, start every task
by asking `grain how <query>` yourself before writing code.

## Maintainer commands

- **`report [--top N]`** / **`status`** — the model overview: size, freshness, signal verdict, top conventions with
  trends and ages, the measured architecture (modules, dependencies, cycles), the `check` feedback rate (notes
  acted on vs. ignored after warning), and a `== health ==` section flagging conventions worth a decision: costly
  deviations, rejected alternatives, conventions carried mostly by agent-authored code, under-adopted shapes,
  conventions with several waivers already, dead steers. Every health line ends with a suggested `grain decide …`
  — text, never an executed command.
- **`rules [--out <file>]`** — the same data as `report`, rendered as a standalone Markdown document stamped with
  the commit, for a maintainer or a coding tool with no terminal and no grain plugin. `grain rules > CONVENTIONS.md`
  already works without a flag.
- **`decide steer <path>#<name> --surfaces <pid,…> [--instead-of <pid,…>] --note "…"`** — record a maintainer
  decision: promote one property of one exemplar repo-wide, in the committed `.grain/seeds.jsonl`. Capped at half
  the real population (it cannot invent a convention nobody has written). When the user says "from now on prefer
  X" / "we are moving to Y", offer to record it as a `decide steer` instead of editing files by hand.
- **`decide boundary <from> --never-imports <to> --note "…"`** — an architecture decision: new imports crossing it
  are flagged at edit time.
- **`decide waive <path>#<name> --on <pid> --note "…"`** — excuse ONE named scope from ONE convention: `check`
  reports the departure as deliberate instead of an accusation, and the counts still report it as non-conforming.
  Refuses when the name is ambiguous — pick the exact scope grain lists.
- **`decide list`** / **`decide rm <id>`** — the decisions in force / withdraw one.
- **`status --json` / `report --json` / `export`** — the same answers as data, for harnesses and training
  pipelines, not for a conversation. `export` dumps the whole model — every convention with its sites, anchors,
  trends, groups, markers, co-change, certified change shapes, structural twins — see `docs/reference.md` for the
  schema.

`decide` is the current name; `seed add | add-boundary | list | rm` is the same command under its original name —
same records, same effect.

## Developer commands

- **`explain <file> [--minbits N] [--top N]`** — only when the explicit question is "what is local versus global
  around this file": the full lattice with no acceptance cut (`NORM` = accepted, `obs` = below the gate). Large;
  not for a small edit. (`spectrum` is the same command under its original name.)
- **`selftest [--json]`** — plants synthetic deviations into conforming exemplars and reports how many this repo's
  own model catches: a public, repeatable number for this repository, not a claim taken on faith.
  **`selftest --how [--last N]`** — a leave-one-out check of `how`'s own precision/recall at predicting a past
  commit's files, against a grep baseline, over the last N real commits; a validation procedure, not something to
  run mid-task.
- **`map [--json]`** — a structural overview: dependency layers from leaves to top, the repo's top concepts where
  commit messages and code vocabulary agree, the certified change shapes, and how many maintainer decisions are in
  force. Good for orienting in an unfamiliar repository before asking anything more specific.
- **`refresh [--full]`** — rebuild the index now (every query already auto-refreshes).
- **`completeness <file…>`** — ask about files BEFORE editing them, or check several files against each other at
  once: the other files this repo's own commit history shows reliably co-changing with the ones given. This is the
  same evidence `check`/`how`'s `missing: co-change:` line and the co-change hooks above already surface for an
  active change; call it directly when there is no change yet to attach it to.

grain informs; it never blocks. No embeddings, no model calls, no network. A convention is a majority, not a
virtue, and uncommitted changes never feed the norm.
