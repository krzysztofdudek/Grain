---
name: grain
description: Ask the repository about its own conventions BEFORE writing code, through the grain MCP tools. Use whenever you are about to create a source file, add a class/function/handler/command/component/test, are unsure where something belongs, or want to know how a kind of change has been done here before — `grain_where` names the directory, the group and the exemplar to copy; `grain_obligation` names what a new file at a path has historically had to come with; `grain_how` cites the past commits that did something like it; `grain_what` reports what a concept already is here; `grain_check` shows where your change departs from the local norm; `grain_completeness` names co-changing files before you call a change done; `grain_propose` mines a whole proposed Yggdrasil architecture graph for a repository that has none. Statistical answers from this repo's code and full git history; tells you which exemplar to open, never blocks. With no grain_* tools in the session, the same commands run through the CLI.
---

# grain — ask the repository which exemplar to copy

grain has mined this repository's syntax trees and whole git history into a model of what is *practiced* here: the groups of similar code, where they live, what they import, extend, decorate, return, how they are named, which files historically change together, the recurring shapes of past commits, and the values (enum members, string literals) that travel together. It does not replace reading one good exemplar — it replaces guessing which one, and it catches the departure you would not have noticed.

## Call it through its MCP tools

Installed as a plugin, grain starts an MCP server named `grain` by itself, and every command of the CLI is a tool: `grain_` and the command's name, a subcommand joined with `_`. They are the same commands run by the CLI itself, not a second implementation, so a tool's answer is the CLI's answer. Every tool's description opens by saying whether it writes (`WRITES …`) or not (`Read-only`).

- Questions mid-task: `grain_where`, `grain_obligation`, `grain_how`, `grain_what`, `grain_check`, `grain_completeness`.
- The model and the conventions: `grain_status`, `grain_report`, `grain_rules`, `grain_map`, `grain_export`, `grain_explain`.
- The architecture graph: `grain_propose`, `grain_advise`, `grain_oracle_record`, `grain_oracle_score`.
- Maintainer decisions: `grain_decide_steer`, `grain_decide_boundary`, `grain_decide_waive`, `grain_decide_list`, `grain_decide_rm`.
- Upkeep and measurement: `grain_refresh`, `grain_selftest`, `grain_version`, and `grain_help`, which returns the CLI's usage text every tool is generated from.

A tool takes the command's arguments and flags as fields:

- each argument under its name: `query` (`grain_where`, `grain_how`, `grain_what`), `path` (`grain_obligation`), `file` (`grain_check`, `grain_explain`), `files`, a list (`grain_completeness`), `out-dir` (`grain_propose`), `name-or-dir` (`grain_oracle_score`), `target` (`grain_decide_steer`, `grain_decide_waive`), `from` (`grain_decide_boundary`), `id` (`grain_decide_rm`);
- each flag under its own name without the dashes (`top`, `map-rows`, `instead-of`, `never-imports`, …); a flag that takes no value is `true`; a number may be given as a number or its text;
- `json: true` answers with the JSON `--json` prints, as one block (on `grain_propose`, `json` is instead the absolute path the report is written to);
- every tool takes `repo`, the repository as an absolute path, and `no-refresh` and `no-history`.

Paths: a field the CLI resolves against its working directory (`repo`, `out`, `content`, `graph`, `proposal`, `family-candidates`, `out-dir`, propose's `json`) must be absolute, because the server does not run in your working directory; a relative one is refused. A path inside the repository (`file`, `path`, `files`, a `target`) may be absolute or relative to the repository root. `grain_check`'s `as` and `grain_decide_boundary`'s `from` and `never-imports` are relative to the repository root as written.

**Which repository a call reaches:** its `repo` field; without it, the one found from the directory the host started the server in — the session's project — and the answer then ends with a block naming it. When you work in another checkout (a worktree, a second repository), pass `repo` on every call.

The answer is the text the CLI prints and ends with `as of <sha>` (the commit the model was computed from); `+dirty` means the file you asked about was read from your uncommitted worktree. What the CLI says on stderr (a build's progress, a refusal) comes as a second block, or in `_meta` with `json: true`. A refusal the CLI reports (a file that does not exist, a decision it will not record) comes back as an error result with its message; a missing or wrong field is refused before anything runs. A missing or stale index builds or refreshes itself before answering (full history once, incremental afterwards): let a slow first call finish. A call that runs past its limit (10 minutes, 60 for `grain_propose` and `grain_selftest`) is stopped and says so.

A hook or an answer that names a command in its CLI form means the matching tool: `grain obligation <path>` is `grain_obligation { path: "<path>" }`, `grain review` is `grain_check` with no `file`, `grain check <file>` is `grain_check { file: "<file>" }`.

## Four questions

Everything below reduces to four questions. Each has a tool you can call directly, and — for three of them — a moment where grain already asks it for you, unbidden:

| Question | Ask | Grain already asks it |
|---|---|---|
| Where does this belong, and what's expected there? | `grain_where { query: "<intent>" }` — once, with the repo's own words | before you `Write` a new file (placement note, from the path alone) |
| How has a change like this actually been done here before? | `grain_how { query: "<intent>" }` — cites real commits, not a guess | before your prompt is even read, when it resembles a certified shape or clearly matches past changes (see below) |
| What already IS this concept in this codebase? | `grain_what { query: "<words>" }` — declarations, values, spread, siblings, commit mentions | nothing automatic — this one is always a deliberate call |
| Does my change conform to the local norm? | `grain_check { file: "<file>" }`, or `grain_check` with no `file` for the whole change | after every edit, and before a `git commit` runs |

Not a trigger for any of these: reading, investigating, answering questions, touching config or docs.

## The voice rule

Every line grain prints as a claim carries one of four voices, marked identically in every answer, so you never have to infer authority from wording:

- **practiced** — the statistical claim, unmarked (`methods here always call \`validate()\` — 91% of 120`). The default; the only voice allowed to carry no marker at all.
- **decided** — a maintainer's committed override, `decision <typ> (<who> <when>): …` (a catalog listing in `grain_report`/`grain_rules` adds the id: `decision <typ> (id <8-hex>, <who> <when>): …`). The numbers may still disagree — that is the point. Follow it anyway and say in one line that you did.
- **example** — one real historical instance, `example (<sha>[ <YYYY-MM>]): "…"` (date present on `grain_how`'s commit citations, sha-only on a history-mention line), never a certified convention. Follow the files it names, not the words in the message.
- **map** — `map: …`, a structural overview of where things live, not an assertion about how they are written.

**Silence is not approval.** A hook saying nothing after an edit, a read, or your own prompt means grain had nothing certified to add — not that it reviewed your work and found it clean. Never call a tool again just to confirm a silent edit, and never report silence to a user as "verified against the repository's conventions."

## How to phrase `grain_where`

Use the repository's own vocabulary in `query`, not yours: the decorator you expect (`click.command`, `Injectable`), the base type (`MethodView`, `IRequest`), the file or function name you would look for (`response json`, `cli routes`), the directory word (`middleware`, `extract`). Hits come in four kinds — **group** (similar code, with its conventions), **marker** (`@decorator` / `extends X` / `returns X` — where its carriers live), **directory**, **file** (with the matching functions inside it). There is no test/example special-casing: code is code, and a test file CAN out-rank the source it tests when it matches your words better — for a source change, take the source hit even when it sits second or third.

- **One `grain_where` per intent.** If it answers with the compact map, grain has no lexical hit: pick the closest entry yourself and open its files. Do not re-ask with synonyms.
- **`note: the top hit matches only «word» of your N words`** at the top means the ranking is driven by a fraction of your query — verify before building on it.
- Every card opens with an `in: <module>` line (its dependency layer and how many modules depend on it, once the architecture graph has one — see `grain_map` below) and a **`superposition:`** line: the members laid on top of each other, the skeleton they share, the slot each fills differently, the skewed ones, the fleet's age. `a new member comes with:` is the recipe for a new instance. `twin: structurally the same as «B» …` on a group card names a role group elsewhere in the repo with the same shape, possibly under a different name.
- An `example (<sha>): "…"` line (the old "history bridge") means your word never appears in the code, but a commit saying it touched the listed files. Follow the files, not the word.
- **Retrieval miss ≠ freedom.** If every hit lands somewhere unrelated to what you are writing, that is a miss. Re-ask once with an exact identifier or decorator from the file you expect to edit; if that misses too, open the nearest sibling of that file and copy it.
- **"No strong convention here beyond placement"** means grain could not certify a convention at its acceptance floor. It is *not* evidence that the neighbours vary. Open the listed exemplar.

Same moment, what a new file must come with: `grain_obligation { path: "<the path you are about to create>" }`.

## How to ask `grain_how`

`grain_how { query: "<intent words>" }` answers by example, not by rule: which past commits look like the change you are about to make, and which files a change like that actually touched, ranked `k/K` (K = how many of the cited commits touched that file). When your intent clearly matches a recurring, certified shape of past commits, the answer opens with that shape's cells (`"<label>" (n changes): <cell> (k of n) · …`) before the examples — a certified pattern, not one anecdote. Zero matches falls back to `grain_where`'s own compact map, whole and unmodified — nothing is invented. Cite the commits it names as evidence, not as instructions to follow verbatim.

## How to ask `grain_what`

`grain_what { query: "<words>" }` is the concept card: what a word or phrase already IS here, distinct from `grain_where` ("where should new code go") and `grain_how` ("what did past changes look like"). One card: `defined:` (declarations matching the words), `values:` (enum members / string literals from the value index that match), `spread:` (which modules carry it), `siblings:` (other values from the same enum/switch/object), `changes:` (commit mentions, with a pointer to `grain_how` for the shape), `used by:` (file-level fan-in). Ask it before extending an existing concept, to see everything grain already knows about it in one place.

## How to read `grain_check`

- Deviations **in your change** come first, each with `n/N established` evidence, the preference gap in bits, and exemplars. `100% of 29` is a rule — follow it or say in one line why not. `85% of 240` is a tendency.
- `In this file, \`x\` (line N) conforms.` names a neighbour in the same file to copy; `(held since …, last reinforced …)` says how old and how alive the rule is; `not to copy:` on a `grain_where` card names the members that deviate. A note ending `edits to deviants were fixes N× as often` says that, in this repository's history, edits to code that broke this rule were fix commits more often than edits elsewhere. It is an association, not proof that the deviation caused the fixes.
- **Pre-existing** deviations (scopes you did not touch) are folded into one line. They are not yours to fix; `all: true` lists them if you are asked to.
- **Zero deviations is not a review.** If the "conforms to" list is empty or grain says no convention governs the file, grain knows nothing certified about this kind of file here — say that, or say nothing; never report it to the user as "verified against the repository's conventions".
- **`missing from your change:`** at the end names what your change is missing, not what it broke: a co-change partner this repo's history usually touches alongside the files you changed (the only source a single-file check shows) — plus, for the whole-change check, a companion file a new marker-carrier usually comes with, a sibling value (`kin:`) the rest of an enum/set has that yours does not, and a cell of a certified change shape (`change shape:`) your change leaves untouched. Silence means nothing is missing — there is no "(complete)" line to look for.
- `decision waiver (<who> <when>): …` on a deviation means a maintainer excused this ONE scope from this ONE convention — the departure is deliberate, say so, and do not "fix" it.
- "This is the local default of this directory — the wider package's norm differs here" means a neighbourhood habit, not a package-wide law.
- Partitions are style regions cut from the directory tree by compression, not by names — `examples/` or a test tree usually ends up its own region and its facts stay scoped there (`local (examples/)`), but nothing is filtered by name. If the only exemplar you get lives in an examples or test region and you are writing product code, prefer a sibling in source and say so.
- `grain_check` with no `file` means "my whole uncommitted change" (the CLI's `review`) — one aggregated pass, highest-stakes findings first. `staged: true` limits it to what is staged, `range` to a commit range. Call it when you consider a unit of work done, not just on the last file you touched, and `grain_completeness { files: [ … ] }` with the files you touched, for co-changing files you may have missed.

## grain also speaks unbidden

Six hooks run mid-task, all silent on failure, none ever block:

- **Before you `Write` a new file**, its path is checked against where its name-kin already live — a `[grain] placement:` note names the kin directory with counts, weaker rival kin with theirs. It arrives while changing the directory is still free: weigh it before writing, and if you place deliberately elsewhere, say so in one line.
- **After every `Edit`/`Write`/`MultiEdit`**, the file is re-checked and grain injects `[grain]` findings ONLY when it has something on the lines you touched — deviations, maintainer decisions, architecture crossings, a placement note — plus, on its own line and capped to 3 partners, the other files this repo's own history shows reliably changing together with the one you just touched. That co-change line can fire even when nothing else does.
- **Before an `Edit`/`MultiEdit` lands**, the same co-change evidence for the file about to be touched arrives ahead of the edit, while touching both halves of an established pair in one pass is still cheap. It shares its repeat-suppression with the post-edit line above, so you see the pair named once, not twice, in one turn.
- **After you `Read`** a file, if it is itself one of a convention's known deviants, grain says so once — "don't copy that part" — and points at a conforming sibling elsewhere. Silence means either the file conforms, or it is a deviant no fact ranks as a top-5 example worth citing.
- **Before your prompt is even read**, grain checks it against the repository's own history of past changes; if it strongly resembles a certified change shape or clearly matches how a recognizable kind of change has been done here before, it injects the certified shape's cells and the places such a change touched — silently, on everything else.
- **Before a `git commit` runs** (in a Bash tool call), grain reviews the whole staged (or, for `-a`, worktree) change ahead of the commit — the same report `grain_check` with no `file` gives, budget-capped.

The hooks speak in the CLI's words (`grain review`, `grain obligation <path>`); call the matching tool.

**A host with no prompt-submission hook gets none of the `grain_how`-hook behavior above** (confirmed for Codex CLI at the time of writing). Where this integration cannot inject anything before your prompt is read, start every task by calling `grain_how` yourself before writing code.

## Maintainer tools

- **`grain_report`** (`top`) / **`grain_status`** — the model overview: size, freshness, signal verdict, top conventions with trends and ages, the measured architecture (modules, dependencies, cycles), the check feedback rate (notes acted on vs. ignored after warning), and a `== health ==` section flagging conventions worth a decision: deviations whose edits were fixes more often, rejected alternatives, under-adopted shapes, conventions with several waivers already, dead steers. Every health line ends with a suggested `grain decide …` — text, never an executed command; the decide tools below record one.
- **`grain_rules`** (`out`, `top`) — the same data as `grain_report`, rendered as a standalone Markdown document stamped with the commit, for a maintainer or a coding tool with no terminal and no grain plugin. Without `out` it answers with the document; with `out` (an absolute path) it writes it there.
- **`grain_decide_steer { target: "<path>#<name>", surfaces: "<pid,…>", instead-of: "<pid,…>", note: "…" }`** — record a maintainer decision: promote one property of one exemplar repo-wide, in the committed `.grain/seeds.jsonl`. Capped at half the real population (it cannot invent a convention nobody has written). When the user says "from now on prefer X" / "we are moving to Y", offer to record it as a steer instead of editing files by hand.
- **`grain_decide_boundary { from: "<dir>", never-imports: "<dir>", note: "…" }`** — an architecture decision: new imports crossing it are flagged at edit time.
- **`grain_decide_waive { target: "<path>#<name>", on: "<pid>", note: "…" }`** — excuse ONE named scope from ONE convention: a check reports the departure as deliberate instead of an accusation, and the counts still report it as non-conforming. Refuses when the name is ambiguous — pick the exact scope grain lists.
- **`grain_decide_list`** / **`grain_decide_rm { id: "<id>" }`** — the decisions in force / withdraw one. Every decide tool also takes `author`.
- **`grain_status`, `grain_report` with `json: true`, and `grain_export`** — the same answers as data, for harnesses and training pipelines, not for a conversation. `grain_export` answers with the whole model as one JSON document — every convention with its sites, anchors, trends, groups, markers, co-change, certified change shapes, structural twins (`max-sites`, `no-anchors`, `compact`; `out` writes it to a file instead) — see `docs/reference.md` for the schema. It is large: prefer `grain_map`, `grain_report` or `grain_advise` when one of them answers the question.

The CLI still accepts `seed add | add-boundary | list | rm`, the original name of `decide`: same records, same effect. The tools carry only the `decide` names.

## Developer tools

- **`grain_explain { file: "<file>" }`** (`minbits`, `top`) — only when the explicit question is "what is local versus global around this file": the full lattice with no acceptance cut (`NORM` = accepted, `obs` = below the gate). Large; not for a small edit.
- **`grain_selftest`** — plants synthetic deviations into conforming exemplars and reports how many this repo's own model catches: a public, repeatable number for this repository, not a claim taken on faith. `how: true` (with `last`) is a leave-one-out check of `grain_how`'s own precision/recall at predicting a past commit's files, against a grep baseline, over the last N real commits; `where`, `obligation`, `extract`, `null` and `cochange` measure the others (`runs`, `seed`). A validation procedure, not something to call mid-task.
- **`grain_map`** — a structural overview: dependency layers from leaves to top, the repo's top concepts where commit messages and code vocabulary agree, the certified change shapes, and how many maintainer decisions are in force. Good for orienting in an unfamiliar repository before asking anything more specific.
- **`grain_propose`** (`out-dir`, `full`, `json`, `holdout`, `family-candidates`, `no-family-candidates`) — for a repository with no `.yggdrasil/` yet: mine one. Writes a PROPOSED Yggdrasil architecture graph — node types, nodes, relations, dependency cycles and mined rules, each with the evidence that produced it — into `out-dir` (an absolute directory; default `.yggdrasil-proposal/` at the repository root, self-ignoring; the repository's own `.yggdrasil/` is never written). The default report is short on purpose: the architecture with its counts, the rules a real `yg drill` proved on this repository's own code (zero false alarms, at least one caught violation), and the candidates that came close; everything else is on disk and summarised in one counted line, with `full: true` to print it. With no Yggdrasil CLI (`YG_BIN`, or `yg` on PATH) nothing can be drilled, so nothing is enforced and the report says so. It is a proposal: a human reviews it and moves it in. Never move it in, and never run `yg check --approve`, unbidden. It also writes `.family-candidates.grain.json` beside the graph (`<out-dir>/.yggdrasil/`): groups of structurally uniform files no rule covers, which `yg advise` names as rules to draft once `yg adopt` has installed the file. `family-candidates` (an absolute path) writes it elsewhere (a repository that adopted earlier points it at its own `.yggdrasil/`), `no-family-candidates: true` writes none. Rebuilding a proposal is slow on a large repository.
- **`grain_oracle_record`** (`proposal`, `graph`, `name`, `out`, `yes`) / **`grain_oracle_score { name-or-dir: "<name>" }`** — after a proposal has been read and a graph accepted, the difference between the two is a measurement oracle. `grain_oracle_record` keeps it (both graphs' structure, the tracked paths each element selects, and the correction: what was merged, split, renamed, dropped, added); `grain_oracle_score` reports precision and recall in both directions on the same Jaccard >= 0.5 bar the hand-written oracles are scored with. `grain_oracle_record` answers with what it would store and where and writes NOTHING without `yes: true` — relay that plan and wait, never pass `yes: true` for the user and never pick a destination for them. It stores structure and paths, never file contents, so scoring later needs no checkout.
- **`grain_advise`** (`json`, `graph`) — the other direction from `grain_propose`: for a repository that ALREADY has a `.yggdrasil/`, what its own history and imports say about it. Two findings, at very different weights. A place a finer cut beats on its own evidence **is** advice: one node owns a pile that is not one thing, and the report names the node, its size and the directories on offer. Places that change together are **not** advice and are deliberately not listed — measured on four hand-written graphs, that evidence names almost nothing and what it names the graph usually already connects, so the report prints the count, how many are unconnected, how concentrated they are, and what share of all pairs of places are connected anyway. Relay those as numbers; never turn one into "add a relation here". `json: true` hands over the whole document if the user wants the data. It writes nothing and never touches the graph.
- **`grain_refresh`** (`full`) — rebuild the index now (every call already refreshes it as needed).
- **`grain_completeness { files: ["<file>", …] }`** — ask about files BEFORE editing them, or check several files against each other at once: the other files this repo's own commit history shows reliably co-changing with the ones given. This is the same evidence the `missing: co-change:` line of `grain_check` and `grain_how` and the co-change hooks above already surface for an active change; call it directly when there is no change yet to attach it to.
- **`grain_version`** — the engine, extractor and grammar versions.

grain informs; it never blocks. No embeddings, no model calls, no network. A convention is a majority, not a virtue, and uncommitted changes never feed the norm.

## The CLI, when the tools are not there

A session with no `grain_*` tools — the skill copied into an agent's skill directory rather than installed as a plugin, a host without MCP, a subagent its host gave no MCP tools — runs the same commands through the CLI, with the same answers:

```
node "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" <command> …
```

Run it through Bash, as-is from the session's working directory — **no leading `cd`** (the sandbox may refuse the `cd`, and grain finds the repository root itself; `--repo <path>` points it at another checkout). A tool call maps onto the command line one to one: the tool's name without `grain_` and with `_` as a space is the command (`grain_decide_steer` is `decide steer`), each argument field is a positional argument in the order `grain help` shows, and each flag field is `--<field>` (`--json`, `--top 5`, `--never-imports src/db`). A path on the command line may be relative to where the CLI runs. `grain_check` with no `file` is `check` with no argument, or `review`.

If that file does not exist where the command runs, the path belongs to another machine: VS Code attached to a dev container, for one, hands the agent the host's install path, which the container cannot see. Find the copy this environment has: the directory this `SKILL.md` was read from, two levels up, plus `bin/grain.mjs`, when that exists here; otherwise search once, `find ~ /workspaces -path '*grain/bin/grain.mjs' 2>/dev/null | head -1`, and use the absolute path it gives for the rest of the session. If there is no copy at all, say so; grain informs and never blocks, so the work goes on without it.
