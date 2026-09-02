# Operational reference

Everything an operator or an integrator needs in one place: commands and flags, the voice rule every printed claim
follows, the `missing:` sources, the hooks and their payloads, the store on disk, the environment switches, the
cache version keys, and the export schema contract.

## Commands

All commands accept `--repo <path>` (act on another checkout), `--no-refresh` (answer from the existing index; a
stale one carries a STALE banner) and `--no-history` (skip the history layer for this invocation: no lifecycle
weights, no co-change, no `how`/`what`'s history-derived lines, faster on a huge repository; nothing counts as
established). Every answer ends with `as of <sha>`, plus `+dirty` when the file was read from an uncommitted
worktree.

| command | flags | answer |
| --- | --- | --- |
| `where <intent words>` | `--top N`, `--map-rows N`, `--json` | ranked cards (group, marker, directory, file) with conventions, exemplars, superposition, structural twins, co-change; a compact map when nothing matches lexically; an `example` voice line for words only the commits know |
| `how <intent words>` | `--top N`, `--json` | the past commits that look like the intent, cited as evidence (`example` voice), the files such a change touched (`k/K`), the certified change shape it matches if any, and a `missing:` block for those files; falls back to `where`'s compact map on zero matches |
| `what <words>` | `--json` | the concept card for a word or phrase: declarations, matching indexed values, spread across modules, commit mentions, file-level fan-in |
| `map` | `--json` | a structural overview: dependency layers (leaves to top), the repo's top concepts where commits and code agree, certified change shapes, how many maintainer decisions are in force |
| `obligation <path>` | `--top N`, `--json` | what a NEW file under this path's (module, extension) class has historically come with, and separately, which of the named companions are merely ambient (touched by almost every commit regardless) — `<path>` need not exist |
| `check [<file>]` | `--as <path>`, `--content <file>`, `--all`, `--staged`, `--range <a>..<b>`, `--worktree`, `--json` | with a file: deviations in your change with evidence and exemplars, pre-existing ones folded (`--all` lists), maintainer decisions departed from or waived, architecture notes, a placement note for a file the tree does not know, a `missing:` block (co-change only — see below). Without a file: the same aggregated over your whole uncommitted change, with the full `missing:` block (co-change, recipe, kin, change shape) for the whole set (alias `review`). `--as` judges content as if it lived at another path; `--content` reads the body from elsewhere |
| `review` | `--staged`, `--range <a>..<b>`, `--worktree`, `--json` | alias of bare `check` — one aggregated report over every file in the whole change (default: every uncommitted change plus untracked new files) — the same per-file findings as `check`, restricted to each file's own changed lines, plus one `missing:` block for the whole set |
| `completeness <file…>` | | files this repo's own commit history shows reliably changing together with the ones given, above a real directional confidence (`co-changed in N/M commits`) — the same co-change evidence `check`/`how`'s `missing:` block and the co-change hooks already surface for an active change, standalone for a file list that is not one |
| `explain <file>` | `--minbits N`, `--top N` | the full local to global lattice around one file, accepted NORM rows and below gate obs rows (alias `spectrum`) |
| `status` | `--json` | model size, signal verdict, freshness, history mode, agent share of young code, placement/check feedback rates |
| `report` | `--top N`, `--json` | top conventions with trends and ages, templates of the unclustered residue, drift, the module graph with cycles, boundaries, and a `== health ==` section of conventions worth a decision |
| `rules` | `--out <file>`, `--top N` | a generated Markdown document of established conventions over the same data `report` prints, stamped with the commit; no `--out` prints it to stdout (so `grain rules > CONVENTIONS.md` works) — for a reader with no terminal and no grain plugin |
| `export` | `--out <file>`, `--max-sites N`, `--compact`, `--no-anchors` | the whole model as data; see the schema contract below |
| `decide steer <path>#<name>` | `--surfaces <pid,…>`, `--instead-of <pid,…>`, `--note`, `--topic`, `--weight`, `--author` | record a maintainer decision; without `--surfaces` it refuses and lists the exemplar's properties (alias `seed add`) |
| `decide boundary <from>` | `--never-imports <to>`, `--note`, `--author` | an architecture decision; new imports crossing it are flagged at edit time (alias `seed add-boundary`) |
| `decide waive <path>#<name>` | `--on <pid>`, `--note`, `--author` | excuse one named scope from one convention; `check` reports the departure as deliberate, the counts still count it non-conforming |
| `decide list`, `decide rm <id>` | | the decisions in force; withdraw one (aliases `seed list`, `seed rm <id>`) |
| `selftest` | `--json` | plant synthetic deviations into conforming exemplars and report how many this repo's own model catches |
| `selftest --how` | `--last N`, `--json` | leave-one-out precision/recall/F1 of `how` predicting a past commit's files, against a grep baseline |
| `selftest --where` | `--last N`, `--json` | how `where` ranks the file a past commit added, from that commit's own message, against a path-match baseline |
| `selftest --obligation` | `--last N`, `--json` | leave-one-out coverage/precision of the birth-obligation table predicting what a past commit that added a file also touched, against a "hottest recent files" and a random-file null |
| `selftest --extract` | `--json` | per grammar, what fraction of the declarations a node-types.json-derived oracle sees does extraction actually record as a scope (recall), and what fraction of recorded scopes the oracle agrees are declarations (precision) |
| `refresh` | `--full` | rebuild now (queries auto-refresh anyway); `--full` re-walks the whole history |
| `version` | | engine, extractor and grammar versions |

The agent-authored share (`status`, `report`) classifies the commit author string of the last commit to touch each
surviving line against `AGENT_AUTHOR_RE`, over committed history only — it never sees the uncommitted worktree in
either direction (the norm is the accepted past), so a 0% or low reading means recent committers on that code weren't
tool-named authors, not that no AI-assisted work happened there.

A type name can legitimately appear at more than one declaration in the same file where a language allows arity- or
generic-parameter overloading (the same identifier naming genuinely distinct declarations); grain counts each as its
own scope, so repeated same-name entries in `where`/`check`/`export` output are expected there, not a bug.

### `disclosures[]` — every hedge the text answer carries, structured (§089)

`where`, `what`, `check` and `review`'s `--json` output each carry an additive `disclosures: [{ kind, text }]`
field: `text` is the identical sentence the text renderer prints for that same caveat, `kind` a stable identifier
for which one it is (`weak-answer`, `no-content-foothold`, `partial-word-coverage`, `ungrammared`, `honest-negative`,
`sparse-model`/`empty-model`/`no-source-partition`, `dirty-tree` for `where`/`what`; `blind-weak`, `gated`,
`ungrammared`, `blind` for `what`; `no-grammar`, `no-partition`, `parse-failed`, `parse-degraded` for `check`/
`review`, the last nested inside each `findings[]` entry alongside the rest of that file's own verdict). This closed
a real gap (escalation 20, ticket 089): before it, an agent or harness reading `--json` alone got the confident
ranked answer with none of the honesty the text answer next to it already carried — `where --json`'s top hit could
score high while the text run, on the identical query, was disclosing that the real text lives in a file grain has
no grammar for at all. Nothing existing changed shape; a command with no matching caveat carries an empty array,
never an absent key. `check`/`review`'s `disclosures[]` deliberately does not attempt every hedge line either
renders (see their own §089 comments in `grain.mjs`) — only the caveats backed by a flag the JSON already carried
as a boolean (`noGrammar`, `noPartition`, `parseFailed`, `hasError`), so text and JSON are guaranteed to speak from
the identical fact, never two hand-synced copies of one sentence.

## Voices

Every line grain prints as a claim carries exactly one of four voices (`voice(kind, text, meta)`, `core.mjs`),
marked identically in every command and document (`report`, `rules`, `where`, `check`, `how`, `what`, `map`, the
hooks). Headers, stamps and continuation lines (`in:`, `lives in:`, `depends on:`, `conforms to:`, `as of …`) are
structure, not claims, and carry no marker.

| voice | shape | meaning |
| --- | --- | --- |
| practiced | no marker — the plain statistical claim | the default; the only voice allowed to carry no marker at all |
| decided | `decision <typ> (<who> <when>): …` — a catalog row in `report`/`rules` adds the id: `decision <typ> (id <8-hex>, <who> <when>): …` | a maintainer's committed override (steer, boundary or waiver); the measured numbers may still disagree, and that is the point |
| example | `example (<sha>[ <YYYY-MM>]): "…"` — the date is present on `how`'s commit citations, sha-only on a history-mention line (`where`/`what`) | one real historical instance, cited by the commit it comes from, never a certified convention |
| map | `map: …` | a structural overview of where things live, not an assertion about how they are written |

A hook (`check-hook`, `read-hook`, `edit-hook`, `commit-hook`, `how-hook`) speaks only in the practiced or decided
voice — never example or map — so that `additionalContext` never injects an anecdote or a bare structural line as
if it were a certified claim. `session-context` (SessionStart) is the one exception: a one-time, general picture at
the start of a session, not a per-edit hook, so its architecture and concepts lines carry the map voice.

## `missing:` sources

`check`/`review`/`how` end with at most one `missing from your change:` block (`missingLines(model, files, {
sources, newFileScopes, changedScopes })`, `core.mjs`) — one renderer, one heading, a line per source that has
something to say; silence means no block at all, never an empty or "(complete)" one. Each caller passes only the
sources it can actually support:

| source | line | fires when | used by |
| --- | --- | --- | --- |
| `cochange` | `co-change: <file> (co-changed in k/N commits)` | a file this repo's history reliably changes together with the ones given is not in the change, above `cochangeMinConf` | `check <file>`, `review`, `how` (`completeness` reads the identical `cochangeData` through its own dedicated renderer, `completenessDirectional`, never through `missingLines`) |
| `recipe` | `recipe: a new <marker\|group> carrier here usually comes with a same-stem \`<pattern>\` companion (share% of n) — none in the change` / `… is registered in \`<file>\` (imports k of n carriers) — not touched` / `… is registered by a \`<pattern>\` file (k of n carriers) — not touched` | a new file in the change carries a marker/role whose established companion or registration file is absent | `review` only — needs a genuinely new file's own extracted scopes (`newFileScopes`), which a single-file `check` cannot supply |
| `kin` | `kin: \`V\`[ (added to \`Container\`)] — its siblings also appear in: <file>, … — not in your change` / `kin: <file> has no «B» counterpart (k of n members of «A» do)` | a changed value's container fails the certified co-travel norm (value half), or a role group's name-stem pairing with another role group has no member in the change (stem half) | `review` only — single-file `check <file>` gets `cochange` only |
| `shape` | `change shape: this change touches k of n certified cells of "<label>" — absent: <cell> (k' of n), …` | the change's own cell bag best-matches a certified change archetype (§mathematics) above `CFG.minMemb`, unambiguously (`CFG.ambGap` clear of the runner-up), and the archetype has certified cells the change does not touch (`k'`/`n` = that cell's own member count / the archetype's total members — the shared denominator every cell of one archetype reports against) | `review` only |

## Hooks

Registered by `hooks/hooks.json` (Claude Code) and `hooks/codex-hooks.json` (Codex, missing `UserPromptSubmit` —
see below). Two more registrations exist and carry ONLY the session start hook: `hooks/cursor-hooks.json` (Cursor,
which also uses a relative command path) and the plugin root `hooks.json` (Copilot); a Cursor or Copilot user
therefore gets none of the per-edit hooks below. All hooks are silent on any failure and never block; none of them
build or refresh an index — a stale or missing model/history cache is silence, not an error, resolved by the next
real query.

Five hooks share `hook-seen.json` (`seenGate(store, key, sigText)`, `grain.mjs`) under five keys (`check:<rel>`,
`how:<hash>`, `read:<rel>`, `commit:<hash>`, and `cochange:<rel>` — shared by check-hook's own post-edit co-change
line and edit-hook's pre-edit one, so whichever fires first in a turn suppresses the other) so they never overwrite
each other's suppression state, and each repeats an identical finding no more often than once per
`GRAIN_HOOK_TTL_MS` (default 15 minutes) — any change in the finding's content speaks again immediately.

- **SessionStart** runs `grain session-context`: what grain answers, the live index state, the architecture shape
  (module/dependency counts, dependency layers once the graph has any), the repo's top concepts, certified change
  shapes, and the maintainer decisions in force.
- **PreToolUse on Write** runs `grain check-hook --pre`: placement from the intended path alone, before the file
  exists — the strongest name-kin directory and weaker rivals, each with counts. No `permissionDecision`: the host
  delivers `additionalContext` regardless of it, so omitting it leaves the tool's own permission prompt untouched.
- **PostToolUse on Edit, Write and MultiEdit** runs `grain check-hook`: the edited file is re-checked and grain
  speaks only when it has findings on the touched lines (deviations, maintainer decisions, architecture crossings,
  a placement note), plus, capped to 3 partners on one line, files this repo's own history shows reliably
  co-changing with the one you just touched (`cochangeData`, above `cochangeMinConf`) — this line fires even when
  nothing else does. The whole set is capped at 8 lines.
- **PreToolUse on Edit and MultiEdit** runs `grain edit-hook`: the same co-change evidence as the
  post-edit line above, but delivered BEFORE the edit lands, while touching both halves of an established pair in
  one pass is still cheap. It shares its `cochange:<rel>` suppression key with check-hook's own post-edit
  co-change line — gated on the underlying data signature (which files, at what support), not either hook's own
  wording, so an `Edit` (which fires this hook, then check-hook, in the same turn) shows the pair once, not twice.
  Deliberately co-change only: the `kin` source needs a freshly-parsed new file's scopes, which an already-known
  file under `Edit` structurally never has.
- **PostToolUse on Read** runs `grain read-hook`: if the file just read is itself one of a convention's
  top-5-by-gap deviants, grain says so once — "don't copy that part" — naming the convention and pointing at a
  conforming sibling elsewhere (a different, still-existing file). Silence means the file conforms, or its
  deviation does not rank in that convention's top 5. Never parses the file; a pure model lookup.
- **UserPromptSubmit** runs `grain how-hook` (Claude Code only — see below): speaks only when the prompt
  itself either strongly matches a certified change archetype, or clearly resembles ≥2 past commits by the same
  intent-matching `how` itself uses (a stricter bar than an explicit `how` call gets, since this one is
  unsolicited). Injects the matched shape's certified cells and the places such a change touched. Suppressed by
  the matched commit set, not the prompt text, so two differently-worded prompts landing on the same evidence
  count as the same reminder. Only a prompt the user actually typed triggers it — a slash command, skill or
  sub-agent request is already a deliberate action and gets none of this.
- **PreToolUse on Bash matching a `git … commit`** runs `grain commit-hook`: reviews the whole staged
  change (or, when the command uses `-a`/`-am`/`--all`, the worktree diff, since nothing is staged yet at that
  point) ahead of the commit — the same report `review` would print, budget-capped to 5 file sections and 3
  `missing:` lines. Suppressed by the sorted file list, not the rendered text.

**A host with no `UserPromptSubmit` support gets no `how-hook` behavior** — confirmed for Codex CLI at the time of
writing, hence its absence from `hooks/codex-hooks.json`; `SKILL.md` tells the agent to call `grain how` itself on
such a host.

Hook payloads arrive on stdin as the host's JSON; paths are canonicalised through the deepest existing ancestor, so
macOS `/var` and `/private/var` symlinks cannot put a file outside its own repository.

**Placement feedback loop** (local only, nothing transmitted): a PreToolUse placement suggestion is remembered by
its name-kin suffix and token, not by the exact path warned about — the same exact path can only ever complete
as `deviated` (Pre and Post see the identical path; a suggestion is only ever "followed" by a DIFFERENT, corrective
write landing in the suggested directory). A later write matching that suffix/token resolves the suggestion as
`followed` (a corrective write landed in the suggested directory) or `deviated` (the flagged path was written
anyway); a write matching neither leaves it pending until it is pruned. `grain status` prints the cumulative count
(`placement notes followed: N of M (X%)`) once any outcome exists, and says nothing before that.

**Check feedback loop** (local only): the same shape as the placement loop above, over deviations instead
of placement. The first time `check`/`review` sees a deviation in the caller's change, it remembers it
(`.grain/cache/check-pending.json`); a later check of the same file resolves it as `acted` (the deviation is gone
entirely), `ignored` (it is still there and the file's content changed since — an edit happened and did not fix
it), or left pending (unchanged content — no chance to act yet). `grain status` prints `check notes acted on: a of
a+i (x%)` once any outcome exists; `report`'s health section names conventions with a high ignored count by
`partition::pid` (never by the raw, re-learn-unstable `cid`).

## MCP server

`bin/grain-mcp.mjs` is a long-lived [Model Context Protocol](https://modelcontextprotocol.io) server: the same
answers `where`/`how`/`what`/`check`/`status`/`report --json` already give, over stdio, for any MCP client — not
only Claude Code. It calls the same `cmd*` functions the CLI does, in-process, so it pays Node's startup cost once
for the whole session rather than once per call; unlike `bin/grain.mjs`, it is not re-exec'd under
`--liftoff-only` — a server answering many calls over its lifetime is better served by V8's optimising compiler
than by the low-memory single-shot mode a one-query-then-exit CLI invocation uses.

Launch it directly: `node "${CLAUDE_PLUGIN_ROOT}/bin/grain-mcp.mjs"` (or any absolute path to it). Claude Code
starts it automatically for this plugin via `.mcp.json` at the plugin root; any other MCP-speaking client can point
at the same binary by hand.

- **Transport**: stdio, newline-delimited JSON-RPC 2.0 — one message per line, none containing an embedded newline
  (MCP's stdio framing; not the `Content-Length`-prefixed framing LSP uses). Diagnostics go to stderr only; stdout
  carries protocol messages exclusively.
- **Protocol version**: `2025-06-18`.
- **Tools** (all read-only, all `{ repo?: string }`-scoped to default to the server's own working directory):
  - `grain_where { query: string, repo? }` — same as `where <query> --json`
  - `grain_how { query: string, top?: number, repo? }` — same as `how <query> --json`
  - `grain_what { query: string, repo? }` — same as `what <query> --json`
  - `grain_check { file?: string, repo? }` — same as `check <file> --json`; omit `file` for the whole uncommitted change (`review --json`)
  - `grain_status { repo? }` — same as `status --json`
  - `grain_report { repo?, top?: number }` — same as `report --top <top> --json`
- **Errors**: an unknown tool name or a missing/invalid required argument is a JSON-RPC protocol error (code
  `-32602`); a failure while answering (a bad `repo` path, a file that does not exist) comes back as a normal
  result with `isError: true` so the calling model can see and react to it. Neither kind ever crashes the server —
  it keeps answering later calls.
- Mutating commands (`decide`/`seed`, `refresh`) and `map`/`explain`/`selftest` (not part of the four-question read
  surface `where`/`how`/`what`/`check` answers) are deliberately not exposed; this is a read-only query surface
  over the questions an agent asks mid-task, not the whole CLI.

## The store

```text
<repo>/.grain/
  .gitignore        created by grain; ignores cache/
  .gitattributes    created by the first seed/decide command; merge=union for the two decision files
  seeds.jsonl       maintainer decisions (steers, boundaries, waivers), meant to be committed
  decisions.jsonl   the audit trail, meant to be committed
  cache/            disposable, rebuilt on demand
    model.json      the mined model (conventions, groups, templates, edges, affinity, change archetypes, twins, value concordance)
    meta.json       the four version keys, the indexed HEAD and build metadata
    history.json    the resumable history replay state (its own extractor/history version keys — see below)
    tree.json       HEAD's extraction cache, keyed by blob sha and path (scopes, skeletons, relation facts)
    blobs/          sharded per blob payloads the history replay fetched
    hook-seen.json  repeat suppression state shared by every unbidden hook, namespaced per hook (see Hooks above)
    check-pending.json    deviations `check`/`review` have flagged in a caller's change, awaiting resolution (pruned after GRAIN_HOOK_TTL_MS)
    check-outcomes.json   cumulative acted/ignored counts, and ignored counts per (partition, pid) — read by `grain status`/`report`
    placement-pending.json   suggestions PreToolUse made, awaiting the write that resolves them (pruned after GRAIN_HOOK_TTL_MS)
    placement-outcomes.json  cumulative counts of resolved suggestions (`followed`/`deviated`) — read by `grain status`
```

Deleting `cache/` is always safe; the next query rebuilds the same bytes.

## Environment

From `.env.example` and the engine:

| variable | effect |
| --- | --- |
| `GRAIN_V8=off` | disable the `--liftoff-only` re-exec; long builds get V8's optimiser and roughly 500 MB more RSS |
| `GRAIN_NO_REFRESH=1` | never auto-rebuild; stale answers carry a STALE banner |
| `GRAIN_DEBUG=1` | full stack traces on errors |
| `GRAIN_DBG=<substr>` | mining debug: print candidate cells whose surface id contains the substring |
| `GRAIN_GRAMMAR_DIR` | override the grammar directory |
| `GRAIN_HOOK_TTL_MS` | repeat suppression window for hook notes (default 15 minutes) |
| `GRAIN_PLUGIN_DIR`, `GRAIN_TRIAL_SETTINGS`, `GRAIN_YGG_DIR` | stress and vendoring tooling only |

## Cache version keys

A mismatch on any version key invalidates exactly the layer it names — never touched directly, only bumped in
`config.mjs` (each with a comment naming what changed and why) as the model or the extractor gains a field a
running query depends on. `grain version` prints the engine and extractor values currently in force; `config.mjs`'s
own inline comments are the authoritative, versioned changelog for every bump this project has made, and are more
reliable than any snapshot of specific values here.

| key | lives in | invalidates | bump when |
| --- | --- | --- | --- |
| `ENGINE_VERSION` | `meta.json`'s `engine` | everything (model, tree cache and history alike) | the engine version changes |
| `EXTR_V` | `meta.json`'s `extractor`, `history.json`'s `x` | the per-blob extraction cache and the history replay | anything about extraction changes (a new predicate, a new grammar, a changed scope shape) |
| `HIST_V` | `history.json`'s `h` (not `meta.json` — history freshness is checked against `history.json` directly, e.g. by `how-hook`, never against the model cache) | the replay state only (forces a full history re-walk, not a re-parse) | a per-scope or per-commit lifecycle field is added that only a fresh replay can backfill |
| `MODEL_V` | `meta.json`'s `model` | the mined model only (a re-learn, not a re-parse) | the model gains a field queries depend on |
| grammar stamp | `meta.json`'s `grammars` | everything parsed | a grammar wasm changes |

## The export schema contract

`grain export` prints `schema: "grain-export/1"`. **The schema is a published interface with a downstream consumer**:
a fine-tuning pipeline cuts training samples from it, masking the anchor lines for fill in the middle examples. Field
renames and semantic changes are breaking changes for that consumer; make them deliberately and versioned, never as a
side effect of a refactor. **Fields are added freely without bumping the schema number** — a consumer reading known
keys is unaffected by a new one; only a change to an EXISTING field's shape would need `grain-export/2` (has not
happened yet).

Top level: `schema, engine, extractor, repo, asOf, schemaNotes, indexedAt, history, summary, steers, boundaries,
waivers, edges, edgesTruncated, moduleGraph, archNorms, changeArchetypes, twins, moves, valueSiblings, partitions,
conventions, cochange`.

`waivers`: maintainer exceptions, one named scope excused from one surface (`pid`), recorded in `.grain/seeds.jsonl`.
Each entry: `id, path, name, pid, kind, line, partition, found` (plus `note`/`author`/`createdAt` when set). A waiver
only changes how `check` SPEAKS about that deviation — a decided voice instead of an accusation — it never enters
mining or weighting, and the scope still counts as governed and non-conforming in every other number here.
`found: false` means the named scope no longer exists at HEAD (inert, kept for audit).

`archNorms`: established layering per (source module, target module) pair — the same acceptance test (§mathematics)
as every other convention, applied to the module graph. Each entry: `from, to, exp` (`"true"` the module reaches the
target as established practice, `"false"` it does not), `ne, neff, share, bits`. A pair absent here cleared no
acceptance floor; that is silence, never a claim of `"false"`. The in-memory model's finer (role-group, module)
rows (`fromKind: "group"`) are excluded here — internal until there is a concrete consumer for that finer shape.

`changeArchetypes`: recurring, certified shapes of past commits (§mathematics, "Commit archetypes"). Each entry:
`id, label, n, cells, exemplars, toks`. `cells[]` carries the archetype's whole candidate cell bag, each with
`certified` — only certified cells make up `label` and count as the shape's actual claim; the rest exist so
`grain how`/`grain map` can match a query against the full bag.

`twins`: role groups whose superposition template anti-unifies with another group's exceeding the two sides'
non-shared remainders combined — the same code shape kept under two different names or directories. Each entry: `a, b` (each
`{part, role, label}`), `sim` (anti-unification coverage), and `namedDifferently` (present only when the two
groups' dominant name-token suffix differs).

`moves`: compressed historical rename affinity, `{ '<file-suffix>#<name-token>': { '<oldDir>→<newDir>': n } }` —
what placement advice cites when a supermajority of files born under a suffix/token have moved the same way, without
touching git history at query time.

`valueSiblings`: certified value concordance (§mathematics, "Value concordance") — one entry per container (an
enum, or a positionally-identified string set) with ≥2 surviving members, keyed by an opaque hash. Each entry:
`container` (the enum's name, or `null` for a positional string container), `members` (the surviving sibling value
keys), `norm` (present only when the co-travel itself cleared the acceptance floor: `{m, ne, neff, bits, full,
near}` — `full` names complete carriers, `near` names carriers missing exactly one member). The raw per-value place
index this is built from (`valueIndex`) is NOT exported — see `schemaNotes.valueSiblings`; `summary.valueIndexSize`
gives its size.

Each convention entry: `id, partition, context, unit, kind, feature (enumerator and argument), expected, negated,
packageWide, seeded, contested, statement, parentDefault, localContrast, alphabet, counts, established, share,
bitsPerInstance, gapThresholdBits, surfaces, siblings, trend, calibration, lifecycle, sites, exemplars,
conformingSites, deviatingSites (each with observed value, phrase, gap in bits, whether it fires, and the nearest
conforming exemplar), check` (a machine executable description of how to verify the convention on a new file).
`exemplars[].why` (a render-facing reason the first exemplar is canonical — see `schemaNotes.exemplars`) is
stripped from the exported copy; `grain report --json` (not a schema this contract covers) does not strip it — a
known, accepted asymmetry between the two JSON surfaces, not a bug to chase here.

**Not exported, and why**: `model.groupKin` (a partition's name-stem pairing between role groups, §mathematics
"Structural twins" neighbour concept) and `model.concepts` (the repo's top shared vocabulary) both feed a rendered
line (`missing: kin:`'s stem half, `map`'s `concepts:`) rather than a certified fact with its own evidence shape —
unlike `changeArchetypes`/`twins`/`valueSiblings`, there is no bounded, self-describing structure to publish beyond
the sentence itself, which `grain map`/`grain what`'s own `--json` already exposes where it applies. `model.moves`
IS exported (see above) despite the same rendering-only origin, because its shape (a rename-count map) is small,
stable and useful to a consumer independent of the sentence it produces.

Each partition: `name, label, kind, files, scopes, groups (with size, lift, implied companions and registration,
superposition profile, markers, defining tokens, members), directories, markers, conventions, templates` (the
unclustered residue templates, with skeleton, coverage, slots and exemplars).

`schemaNotes` inside the export carries the field by field explanation for a consumer that only has the file —
read it there for the exact, current wording; the summary above will drift as the export grows and `schemaNotes`
will not.

**Recipe for a CI PR comment**: `grain check --range <base>..<head> --json` (no file argument) runs the same code
path as `review --json` and carries `schema: "grain-check/1"` — a stable top-level key list (`asOf, files,
findings, cochangePartners, missing, schema`) suitable for a script to consume without re-deriving it from text.
Each item of `findings[]` that came from a parseable file carries its own `schema: "grain-check/1"` too (it is the
same object `check --json` on a single file returns); a `findings[]` item for a file with no grammar (placement
only) does not — a minor, known asymmetry, harmless since the aggregate's own top-level `schema` already identifies
the whole payload's shape. That same parseable-file item also carries `disclosures[]` (§089, see above) — a
degraded parse on a file review lists for another reason is disclosed there exactly like `check`'s own verdict for
that file, even when `review`'s own text collapses several such files into one aggregate line above its display cap.
