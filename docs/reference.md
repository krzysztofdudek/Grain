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
| `propose [<out-dir>]` | `--full`, `--json <path>`, `--holdout <YYYY-MM-DD>` | a PROPOSED Yggdrasil `.yggdrasil/` architecture graph for this repository, written to `<out-dir>` (default `.yggdrasil-proposal/`); the report names the architecture, the rules a real `yg drill` proved, and the candidates, with `--full` for every draft it kept back; see the proposal contract below |
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

## The proposal contract

`grain propose [<out-dir>]` writes a proposed `.yggdrasil/` graph to `<out-dir>` — `PROPOSAL.md`,
`REFACTOR-BACKLOG.md`, `alternatives.md`, `sizing.json` and the `.yggdrasil/` tree itself.
`<out-dir>/proposal.json` prints `schema: "grain-proposal/1"`.

**The out-dir defaults to `.yggdrasil-proposal/` at the repository root and is never the repository's own
`.yggdrasil/`** — the command refuses that path outright. A proposal is a staging tree a human reads, edits and
moves in; nothing installs it. The directory is written with its own ignore file (`*`, the same self-ignoring
form `.grain/`'s own uses for the cache) the first time it appears, so a proposal under review never shows up as
an untracked change and can never be committed by accident. Naming `.yggdrasil-proposal/` in the repository's
top-level ignore list as well is fine; nothing in grain requires it.

The same renderer is also driven by the measurement instrument `node tests/stress/propose.mjs <repo> <out-dir>`,
which adds `--score <repo>` (compare against a hand-written graph, both directions) and `--family-candidates
<out.json>`. The instrument and the command write byte-identical trees — the renderer lives in
`plugins/grain/engine/propose.mjs` and neither surface has a rendering path of its own.

**What the command prints** is deliberately short (ruling `propose-default-is-quiet`), and every line of it
carries a number or a path: the architecture (node types, nodes, relations, dependency cycles), the aspects that
EARNED `status: enforced` from a real drill with what each one checks and its drill numbers, and the
CANDIDATES — drafts that the same real drill caught at least one violation with, strongest evidence first. A
candidate is a definition, not a cut-off: it is exactly the bar `no-catch-rules-stay-draft` sets for a rule to
be doing anything at all, so with no drill there are no candidates and the report says that instead of ranking
drafts nobody has judged. Everything else (prose aspects, no-catch drafts, finer type alternatives, conventions
skipped as not a rule) is written to disk exactly as before and summarised in one counted line naming the file
that holds it; `--full` prints all of it. `--json <path>` writes the same report as a
`schema: "grain-propose/1"` document built in the same pass, so the two cannot disagree. When no Yggdrasil CLI
resolves (`YG_BIN`, or `yg` on PATH) nothing is drilled, nothing is enforced, and the report says so in place of
the enforced list. **The schema is a published,
versioned interface exactly like `grain-export/1` above**: Yggdrasil's own `yg check`/`yg drill`/`yg advise`
read the `.yggdrasil/` tree this renderer writes, and Horde's `node.mjs show` reads `charter.md` from it — a
shape change here is a breaking change for both neighbours, made deliberately and versioned, never as a side
effect of a refactor. **Fields are added freely without bumping the schema number**; only a change to an
EXISTING field's shape needs `grain-proposal/2` (has not happened yet). 094/097/098's existing output is
untouched by this contract — nothing already there was renamed or removed to make room for it.

`proposal.json` top level: `schema, engine, extractor, instrument, repo, asOf, files, counts, schemaNotes,
evidence`. `schema`/`engine`/`extractor` mirror `grain-export/1`'s own fields (the same `ENGINE_VERSION`/
`EXTR_V` constants) — a proposal names the engine build that produced it without a consumer re-deriving that
from the export it was rendered from. `instrument: "propose/1"`, `repo` and `asOf` are 094's original fields,
unchanged. `evidence[]` is the full audit trail: one row per emitted element (`kind`: `type` | `relations` |
`deny` | `node` | `charter` | `aspect`), `id` naming the element, `evidence` the exact prose a human reads on
the file itself, plus `kind`-specific structured detail (an `aspect` row carries `enumerator`/`identifier`/
`expected`/`host`, plus — ticket 102 — `status` and `draftReason`, see below). `schemaNotes` explains each field
the way `grain-export/1`'s own does — read it there for the exact, current wording.

### What "enforced" means in a proposal (ticket 102)

Every element this renderer writes starts as a candidate, never a claim: no type carries `enforce: strict`
(Yggdrasil's bidirectional-coverage flag — a `yg-architecture.yaml` node-type field, unrelated to the aspect
`status` below despite the name), and every aspect starts `status: draft`. What changes is which aspects EARN
their way out of draft, and how a consumer is told why one has not:

- **Prose never leaves draft.** An aspect that ships `content.md` (no template renders its convention's class as
  a syntax-tree check) needs a configured LLM reviewer to produce a verdict at all, and this renderer never
  assumes one exists. Ticket 101 measured prose's sense rate under a keyless gate at 0% (1305 of 1671 proposed
  aspects on a 17-repository corpus) — a judgment call is a candidate for a human decision, never a rule this
  renderer ships as enforceable. `draftReason: "prose-unenforceable-keyless"`.
- **A deterministic check (`check.mjs`) is judged by a REAL `yg drill`.** When `YG_BIN` resolves to a built
  Yggdrasil CLI, this renderer stages the `.yggdrasil/` tree it JUST wrote into a throwaway copy and runs
  `yg drill --aspect <id>` for every check that shipped a corpus — the same measurement a maintainer would run
  by hand, not a claim this script computes on its own. A check that comes back with zero FALSE-ALARMs and at
  least one caught `violates-*` case is promoted: its `yg-aspect.yaml` is rewritten `status: enforced`, and a
  plain `yg check` on the delivered proposal enforces it immediately, no further review needed to turn it on.
  Everything else stays draft, with one of two reasons:
  - `draftReason: "file-scope-approximation-fa"` — the drill found at least one FALSE-ALARM. Ticket 101 §8.1
    traced every remaining FALSE-ALARM in its whole corpus to one shape: the convention's own subject is a
    SYMBOL inside a file (a method, a type) while Yggdrasil reviews the check per FILE, and a drill corpus cut
    from a sample of sites mislabels the file. Ruling `drill-fa-labelling-is-acceptance-not-defect`: this is
    accepted as a corpus-labelling artifact, not chased as a defect — the fix is to demote the rule, not
    relabel the corpus, and 0 FALSE-ALARMs is not a matter of taste; it is the only value at which a keyless CI
    never blocks a legitimately clean change.
  - `draftReason: "no-catch"` — zero FALSE-ALARMs, but also zero caught `violates-*` cases. Ruling
    `no-catch-rules-stay-draft`: a rule nothing can ever be shown to violate does not enforce architecture,
    whatever else is true of it — 125 of 366 deterministic aspects in ticket 101's corpus were exactly this.
  - `draftReason: null` with no verdict at all means the aspect was never verified this run — no `YG_BIN`
    resolvable, or the check shipped no drill corpus to run. This is not one of the three reasons above: it says
    nothing about the check's quality, only that nobody has looked yet. This was every deterministic aspect's
    fate before ticket 102 — the only regression-proof default when Yggdrasil is not available to ask.

`counts.aspectsActive` / `counts.aspectsDraft` / `counts.aspectsByDraftReason` (a count per reason above) and
`counts.aspectsVerified` / `counts.aspectsVerifiedAgainst` (how many deterministic aspects a real drill actually
judged, and against which Yggdrasil binary — `null` when `YG_BIN` did not resolve) summarize this split for the
whole run; `evidence[]`'s own `aspect` rows and each aspect's `provenance.json` (below) carry it per element.

**What an adopter actually gets, in plain terms**: `status: enforced` means a deterministic rule that survived a
real drill on this repository's own code with zero false alarms and at least one caught violation — nothing
between the maintainer and turning this rule on today. Everything else — every prose aspect, every check that
false-alarmed or caught nothing, every check nobody has verified yet — is a candidate: worth reading, not worth
trusting sight unseen. Adopting a proposal means reviewing the drafts, not merely running `yg check --approve` on
the enforced set and calling the rest done.

**Per-aspect `provenance.json`** — `.yggdrasil/aspects/<id>/provenance.json`, one per rendered aspect, same
field set as the law-loop measurement's own (ticket 097): `aspectId, conventionId, origin, enumeratorClass,
identifier, expected, partition, share, n, deviating, asOf, cutSha, cutDate, repo, reviewer, note`. A live
`propose` run has no hold-out cut of its own, so `cutSha` is `asOf` (HEAD) and `cutDate` is `null` — the two
differ only in provenance, never in the fields carried.

**Three fields ADDED here (ticket 102), additive per the rule above — not shared with law-loop.mjs's own replay
provenance, which describes a held-out cut rather than a live run with a real `.yggdrasil/` tree on disk**:
`status` (`"active"` | `"draft"` — Grain's own two-value vocabulary, distinct from the three Yggdrasil-schema
values the aspect's `yg-aspect.yaml` itself carries; `"active"` there is written as `status: enforced`),
`draftReason` (one of `"prose-unenforceable-keyless"` | `"file-scope-approximation-fa"` | `"no-catch"`, or `null`
when `status` is `"active"` or the aspect was never verified this run), and `scopeApproximation`
(`"file-from-symbol"` when the convention's own subject — `a.kind`, grain's `unitOf` domain: `method` | `type` |
`catch` | `finally` | `case` — is a symbol living inside a file rather than the file itself, `null` for a
file/module-level convention where the check's unit and the convention's subject are the same thing). This flag
is set independently of drill results — a symbol-scoped check can still earn `enforced` if its own drill comes
back clean; the flag explains WHY a FALSE-ALARM would happen here if one ever does, it does not by itself demote
anything.

**Per-node `charter.md`** — `.yggdrasil/model/<node>/charter.md`, beside `yg-node.yaml`, one per proposed node
(including organizational ones). Rendered the way a `where` card reads a directory to a human: what lives here
(files, extensions, nested groups), depends on / used by (module edges with resolved-import counts in both
directions), certified conventions (share, n conforming/deviating, exemplars to copy — `path:line`), sub-gate
candidates (evidence below the certification bound, not yet law), co-change partners (aggregated from `.grain`'s
own file-level co-change up to node granularity), sizing (the node's own row from `sizing.json`), and the `asOf`
sha. Every line carries a number or a path; a section with nothing to report says so rather than being omitted.
Horde's `node.mjs show <node>` reads this file verbatim — no schema of its own beyond "a markdown file at that
path".

**`sizing.json`** (ticket 098) is unchanged by this contract — see its own header comment in
`plugins/grain/engine/propose.mjs` for the field-by-field explanation; every `charter.md` quotes its own node's row from
it rather than duplicating the numbers.

**The `.family-candidates.json` adapter** — the instrument's `--family-candidates <out.json>` writes a SEPARATE file
(not part of `proposal.json`) in the exact shape Yggdrasil's `yg advise` already reads (`parseFamilyCandidates`,
`advise-nominations.ts`): `{v: 1, ts, families: [{id, language, members, fittedPredicate: {kind, value},
scopeFilesDraft, evidence: {clusterSize, tightness}}]}`. `ts` MUST be a parseable calendar instant (Yggdrasil's
freshness gate runs `Date.parse` on it and silently drops the whole file otherwise) — grain's own `asOf` is a git
sha, so this adapter uses the export's `indexedAt` instead. A "family without a law" in grain's own terms is a
role group (093/094's structural cluster within a partition) that clears the same size floor Yggdrasil's own
offline miner uses (`FAMILY_MIN_MEMBERS = 5`, stated in `plugins/grain/engine/propose.mjs`) and carries no certified
convention of its own — whether that group ended up as a finer `-content` alternative (a subset of its host
type) or, when the group coincides with its whole host type, was cut directly as an active type with no
alternative offered. Dropping the file into an existing `.yggdrasil/` at `.family-candidates.json` and running
`yg advise` there makes Yggdrasil nominate the family with zero code changes on Yggdrasil's side —
`plugins/grain/tests/seams.test.mjs` proves this against a real `yg` binary and against Yggdrasil's own
planted-family precision fixtures.
