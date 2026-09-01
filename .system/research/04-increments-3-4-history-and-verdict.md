# Design decisions and lessons from Increments 3 (R4 history) and 4 (R5 verdict)

Source: Yggdrasil branch `claude/document-review-13yoty` — `planning/plugin/sp-plans/2026-08-20-increment-3-r4-history.md`
(`inc3`), `…/2026-08-22-increment-4-r5-verdict.md` (`inc4`; decisions D1–D27 incl. D13a/D26/D27; 17 review rounds),
`…/reviews/inc4-r12.md … inc4-r18-final.md`. `where` and `spectrum` are explicitly R7 non-goals in both plans; what transfers
is the index-time data they read, the verbalizer vocabulary, the locality/evidence phrasing, and the status honesty rules.
`check` maps onto R5's `yg roots check` with the session/telemetry/hook machinery removed.

One divergence kept in mind: R4 mines the working tree including dirty files (at `dirtyWeight` 0.3), whereas grain indexes
**HEAD only** — stricter and simpler; the `+dirty` marker is grain's own.

## 1. Numbered decisions, with a verdict for grain

### 1a. Increment 3 (R4) — D1–D17

| ID | Summary | grain |
|---|---|---|
| D1 Replay state location and contents | Under `.cache/history/`, holding **accumulators** (lifecycle, events, raw alias edges, raw co-change supports + per-file commit counts, meta with rosters), never finished products — persisting the cut form makes a later rename or a pair crossing `minSupport` unrecoverable. | Yes |
| D2 Resume means resuming the walk | Walk `lastIndexedSha..HEAD` only. Full-walk triggers: `--full`; missing/unparseable state; `inputsHash` mismatch; **unreachable `lastIndexedSha`**; windowing. A `full` verdict discards loaded state. Not a trigger: "range contains a commit older than `lastIndexedSha`" (would re-walk on every merge). | Yes, verbatim |
| D3 Windowing disables resume | Only if a window is exposed. | Partially |
| D4 `historyStats` carries only cache- and resume-independent numbers | `commits`, `events`, `blobs` (distinct SHAs resolved), `parsed`/`mb` over cache keys; run diagnostics to stderr only. | Yes |
| D5 Value events store the raw tuple + sha | Total sort key for every persisted list. | Lesson only |
| D6 History join key is `skeyR` | `relPath#kind#qualifiedName` (ordinal inside), never `stable_id`. | Yes |
| D7 `w(s,q)` per (scope, surface) | Ledger cap keyed `(stable_id, surface)`; `role_lift` divisor stays `w_base`. | Partially |
| D8 Goldens gain time depth via a trailing commit at day 400 | Without it every golden has `stable_days=0`, nothing survived, every MUST-mine assertion vacuous. | Yes — fixtures need a trailing commit ≥ `survivalFullDays` later |
| D9 Coverage/debt keys structurally absent, not zero | A written `0` asserts a falsehood. | Yes |
| D10 Version bump is the regeneration trigger | Never write migrations for derived state. | Yes |
| D11 Blob cache records = raw ingredients | Only expensive skips persisted; `no-grammar`/`excluded` answered from the path. | Yes |
| D12 Progress to stderr; model never sees it | >60 s projected ⇒ ETA line. | Yes |
| D13 A no-op index writes nothing | Short-circuit on eight input header fields + walk mode `resume` + empty range + cache present; runs before the lock. Drop `dirtyHash` for grain; add a builder/schema version. | Yes |
| D14 Blob cache shard layout | `<cache>/blobs/<2-hex>/<key>.json`. | Yes |
| D15 Replay state commits as a set | `stateEpoch` in every file; accumulators first, meta last; reader compares, never re-derives. | Yes for multi-file state |
| D16 The replay is a function of the commit **set** | "`--reverse --date-order` does not give ascending timestamps; resume range is a set difference; no linearization makes a running prev-value map correct on a branched DAG." Lifecycle fields are min/max/counters with `(ts, sha)` tie-breaks; closure, cap, cut at finish. | Yes, foundational |
| D17 Exclusions bind the historical path in two tiers | Gate 1 (built-ins + config): invisible entirely; gate-1 path is the post-image. Gate 2 (parse filter ∧ grammar): rostered and counted for co-change, never fetched. Test files count for co-change, never mined. | Yes |

### 1b. Increment 4 (R5) — D1–D27

| ID | Summary | grain |
|---|---|---|
| D1 Pure engine returns side effects as data | Pipeline `surfacesForFile → resolveRoles → evaluate → applyBudgetsAndDedup → render`; `evaluate` per partition in ascending id, concatenated, ordered once. | Partially |
| D3 Three additive snapshot fields; version bump | `exemplars`, `partitionRouting`, `commitsA`/`commitsB` on co-change rows; short-circuit tuple includes a builder version. A `stableId→scope` map was costed and refused (15 MB). | Yes |
| D4 §9.11 exemplar rule made total | Non-ambiguous conformers (fallback all); `m1` only on role facts; centrality = `couplingByFile/100` (absent map ⇒ 1; path absent ⇒ 0); rank `(w·m1·centrality, w·m1, stable_id)` / `(w·centrality, w, stable_id)`; top 3; **render-time re-validation = memoized file-existence check**; empty ⇒ message without `See:`. | Yes |
| D5 `partitionRouting` | Snapshot carries the decision function; `null` sentinel; `''` a **live id**; lookup replicates `keyFor`'s three arms. | Yes |
| D6 Hook-time enumeration reuses index functions with the snapshot's vocabulary | Absent-but-in-domain boolean ⇒ `'false'`; not in domain ⇒ `null` ⇒ skip. Gate −1 (file universe: regular file, not symlink, no nested project above, not gitignored) and gate 0 (`forParsing`). Silence on a file the index never mined. | Yes |
| D7 Δ, τ, posteriors read the snapshot | `Δ = log2((n_e+½)/(n_v+½))`, ⊥ ⇒ `log2(2n_e+1)`; τ is the fact's persisted `tau`; unseen ⇒ novelty note, capped. | Yes |
| D8 Specificity governance | Smallest `nTotalRaw`, ties role < directory < `_all`; `null` role ⇒ no role facts. | Yes |
| D9 Severity; labels | `_repo`, `''`, `'_root'` ⇒ `repo-wide`; else `package-wide (<id>)`. | Label rule yes |
| D11 Non-hook scope selection | Bare `check` evaluates every scope in every dirty file; `getDirtyFiles` `null` (not git) vs `[]` (clean). | Yes if offered |
| D13/D13a Telemetry | — | No (lessons in §5) |
| D14 Write order by torn-write direction | Print first, then append; a crash biases toward under-recording. | Principle |
| D16 Demotion placement | `status`/`report` are read surfaces that write nothing — a stray `mkdir` breaks the no-op snapshot test. | Rule |
| D17 Hook-time staleness is a cheap honest subset | `headSha` has **three states: equal, different, unreadable — cannot tell is not stale**. | Yes |
| D18 Fail-open boundary, harness rethrow via explicit option | Never crash the caller on a malformed model; one diagnostic line. | Partially |
| D19 Single ordering authority | `(severity desc, Δ desc, surface asc)`; order once. | Partially |
| D20 Directional co-change | Persisted `conf = max(confAB, confBA)` cannot recover direction; persist `commitsA`/`commitsB`; gate on `sup/commits<side> ≥ minConfidence`. | Yes |
| D22 What `status` gains | Withheld-conventions line; composition alarm in product English. | Partially |
| D23 Config keys | Consume the prototype's numbers verbatim; don't invent thresholds. | Yes |
| D25 Scaffold notice names the absolute path | | Yes |
| D26 Keys | `stableId` folds `arity` (not persisted) ⇒ not invertible from the snapshot — key stored records on `skeyR`; `factKey` is partition-blind. | Yes |

Owner questions: never prompt in auto-refresh (non-interactive callers); `agentShare` 120-day window is fixed.

### 1c. Invariants that are decisions
R4-I1 clock read once, no wall clock in the model · I2 incremental ≡ full byte-identical · I3 cold ≡ warm · I4 fail-closed without history · I6 historical grammar from the historical path's extension · I7 one key space (ordinals identical live/history) · I8 each blob parsed at most once ever · I9 advisory only, `status` always 0 · I10 degrade never abort; derived state may be lost, the product never silently · I11 derived state stays derived · I12 readers never take the lock and report "unknown" by omitting the line · I13 config verbatim · I16 deterministically ordered accumulation. R5-I1 never gates CI · I3 downgrade or silence, never upgrade · I5 snapshot fields total with stated orders · I6 hook-time enumeration ≡ index-time enumeration (proven by a harness) · I9 one ordering authority · I10 speech is gated, inquiry is not · I14 no internal vocabulary in user output · I15 absorbed faults ⇒ one debug line · I17 dormant without config, silent without evidence · I18 speech never re-enters the model.

## 2. Concrete algorithm fixes and defects

2.1 **Specificity governance**: evidence class is survived raw `nTotalRaw` — not weighted counts, not `deviantsN`; smallest wins; ties role < dir < `_all`; ambiguous/untyped arrive as `null` (never propagate `'-1'`); the selector is exported and called from every consumer ("called, not copied"); decorative-role engine filter deleted as unobservable.
2.2 **Sticky roles, three rungs**: rung 0 eligibility (kind ∈ {method,type} and `ownFeatureCount ≥ minOwnFeatures` — without it a one-feature scope receives a role whose smaller fact shadows the correct `_all` fact); rung 1 `assignments[skeyR]`; rung 2 classify against medoids rebuilt from the snapshot in `roleKey` order. Why sticky first: stripping a role-defining marker also strips the membership evidence. Accepted exposure: index and check classify in different medoid orders; confined to scopes new since the index.
2.3 **Fire-ability, Δ, τ, tiers, novelty**: K cancels; six hand-derived rows (`{true:3,false:0}` ⇒ 2.807; `{true:6,false:0}` ⇒ 3.700; absence `{false:20,true:1}` ⇒ 3.7726 fires at vocabulary τ 3.5, not at structural 4.5; |V|=4 ⊥ ⇒ 5.358 WARN-capped; share 2/3 ⇒ 0.737 no); τ must be the fact's persisted value; in-alphabet zero-count prices like ⊥ — only the flag differs.
2.4 **Out-of-domain is not a deviation**: `null` ⇒ skip, distinct from sparse `'false'`; the same three-state rule on every closure producer.
2.5 **Exemplars**: exclude role-ambiguous; `m1 = 1` for role-less scopes on `_all` facts would rank them above genuine members ⇒ `m1` only on role facts; re-validation = existence check memoized per run on `rel` (naive bound 3 × 400 `lstat`s per partition); empty surviving list ⇒ message without `See:`; fixtures need exemplars in files other than the subject's.
2.6 **Partition routing**: `''` is a live id; `'_root'` is a `fallback` field; order `(dir.length desc, dir asc)`; a detected root with no scopes carries the `_repo` bucket's outcome; module root = `(id==='_repo'||id==='_root') ? '' : id`; fixtures need ~600 scopes across two nested roots.
2.7 **Locality labels and contrast**: `local (<dir>/)`, `repo-wide`, `package-wide (<id>)`, medoid label for role facts; contrast predicate has **one home**: `parentExp !== null && parentExp !== expected` (`null !== expected` is true — the bare phrasing appends the line to every repo-wide message).
2.8 **Verbalizer**: one row per enumerator; unknown surface renders `{surface} = {value}` and fails a lint test; name shapes by example; `stshape` truncated at 60; notes independently switchable; `{unit_plural}` three-valued (the "directories" arm has no producer).
2.9 **Scope keys**: `skeyR` with ordinal inside; `stableId` not recomputable from the snapshot (arity not persisted); module units never get lifecycle rows ⇒ no module fact hook-eligible.
2.10 **Rename replay**: `-M` emits `R100`/`R087` — parse the letter, discard digits; raw edges during the fold, closure at finish in `(ts, sha)` order with immediate retargeting — **not** a fixpoint loop (`git mv a c; git mv c a` would never terminate); accepted approximations stated; `C` unreachable under `-M`; rename into an excluded prefix dropped whole; a pure `git mv` has identical pre/post shas.
2.11 **Merges, HEAD, clock**: walk `--no-merges`; HEAD read outside the walk (`rev-parse` + `log -1`); clock = HEAD committer timestamp; `lastIndexedSha` = HEAD even when HEAD is a merge (anchoring on the last non-merge re-applies commits); nothing downstream may assume arrival order.
2.12 **`T` and `D` records**: file-level touches only; `D` prunes no rows.
2.13 **Appearance-cap**: decided at finish over the total count, retroactively.
2.14 **Co-change**: non-merge commits with 2..30 files measured over gate-1 survivors; raw supports persisted; filter/sort/cut at finish; persist `commitsA`/`commitsB`; worked row `{sup:9, commitsA:9, commitsB:12}`: editing `a` ⇒ `9/9` names `b`; editing `b` ⇒ `9/12 = 0.75` names `a`; `commitsB:20` ⇒ nothing from `b`'s side; coupling percentile per file/module.
2.15 **Weights**: branch order is behaviour (no row 0.3; dirty 0.3; else `max(0.05, product)`; **then** the cap); hand table: 400 d human ⇒ 1.0; −10 d ⇒ 0.05; 60 d churned ⇒ 0.125; agent 60 d ⇒ 0.216667; agent 200 d ⇒ 1.0; release rule `stable_days ≥ 90 ∧ human touch ≥ markDate + 14`; survived predicate one home: `ageDays ≥ freshPenaltyDays ∧ ¬hookShaped`, false for everything without a lifecycle source.
2.16 **`historyStats`/`agentShare` honesty**: two rosters; `agentShare` empty population ⇒ `null` (guard the division — `JSON.stringify(NaN)` emits `null` silently).
2.17 **File universe and parse gates for `check`**: without gate 0 a test file, `dist/bundle.js`, `*.d.ts` parses and is measured against `_all` facts mined from production code ⇒ a WARN on a test file; gate −1 (gitignored, symlink, nested checkout — the predicate is not "contains `.git`"); existence filter (a `git mv` otherwise aborts the run); `--content/--as` gate matrix; every per-path test total.
2.18 **Regeneration on upgrade**: version bump + reader throwing on mismatch + short-circuit treating the throw as "no comparable header".
2.19 **Withheld-conventions predicate**: `hookEligible === false ∧ nTotalRaw < minInstancesRaw`; on a no-history repo this is every accepted fact — and saying so is the point.
2.20 **Degraded modes**: join `undefined`; constant weights; history-fed fields absent except `agentShare: null`; `lastIndexedSha` null; no replay state written.
2.21 **Single-file equivalence harness caveat**: a single-file run resolves a different module set than the whole-repo run; scope the harness to non-module units.

## 3. Incremental indexing and resume — everything said

3.1 Persisted: sharded blob cache keyed `(sha, extractorVersion, per-grammar bindingHash)`; six-file replay state, each with a total sort key and `stateEpoch`; `.build.lock`; committed `model.json` with `lastIndexedSha` (null in degraded modes). One long-lived `cat-file --batch` child; a warm run fetches **and** parses zero blobs.
3.2 `lastIndexedSha` unreachable = `git rev-parse --verify <sha>^{commit}` fails ⇒ full walk, state discarded wholesale; "the commit the history is indexed through"; a resumed walk that leaves `lastIndexedSha ≠ HEAD` is a bug.
3.3 Branch switches: merged older branch ⇒ resume works (set function); rebase/force-push/unrelated branch ⇒ unreachable ⇒ full walk; branch containing `lastIndexedSha` ⇒ resume; HEAD is a merge ⇒ next range empty ⇒ resume with zero commits; shallow ⇒ degraded; windowing ⇒ full; inputs mismatch ⇒ full walk but a warm cache fetches nothing (25 commits walked on stderr is the only observable).
3.4 Lock: `O_EXCL`, pid inside, stale after 15 min, fresh lock retried 100 ms up to 2 s then refused naming the pid; readers never take it; acquired after the no-op short-circuit; released in `finally`.
3.5 No-op short-circuit: four conditions; `model.json` bytes **and mtime** unchanged; the test snapshots every path incl. dot-directories; condition 2 is "`decideWalkMode` returns `resume`", not an enumeration of defects.
3.6 Torn/hostile state: absent dir, five of six files, any malformed line, epoch disagreement ⇒ `undefined` ⇒ full walk, never a partial resume; failed state write ⇒ one debug line, run continues; failed `model.json` write ⇒ real error.
3.7 What "stale" means: `status` reports commits read, "revisions of your code read from history" (never "files"), how far behind HEAD via `git rev-list --count <lastIndexedSha>..HEAD` from `meta.json` read best-effort (omit the line when state does not read cleanly), no-history/shallow/windowed/normal as four honest paragraphs; `headSha` three states; stale ⇒ proceed with one debug line; missing snapshot ⇒ silence; version mismatch ⇒ "could not be read — run `index`".
3.8 Determinism suite: (a) double `--full`; (b) resume vs fresh-clone `--full` with three prescribed commits (decorator-only change needing a cached pre-image; pair re-touch + rename in one commit; merge of an older side branch); (c) delete cache, re-index byte-identical, warm `--full` parses zero; (d) unreachable sha; (e) inputs mismatch; (f) three hostile-state shapes; (g) merge HEAD; (h) no-git and shallow; `inputsHash` composition one assertion per ingredient.
3.9 Uncommitted changes — grain's stricter rule: index HEAD's tree only; drop `dirtyHash`; `check <file>` reads worktree bytes against the committed vocabulary and marks `+dirty`.

## 4. Message and output format the query surface should reuse

4.1 **Check message**: three-beat deviation → evidence + scope → exemplar; "N of M established" plus share; notes; locality label; contrast only when `parentExp !== null && parentExp !== expected`; `See:` ≤ 3 exemplars, omitted when empty; ordering `(severity desc, Δ desc, surface asc)`. **Forbidden tokens in any human output**: `FACT`, `pid`, `surface=`, `factKey`, `roleKey`, `Δ`, `tau`, `_all`, `hook_shaped`, `d[`, `agentShare`, `package-wide ()`, `_root`, `_repo`, bare thresholds. Evidence numbers stay.
4.2 **Co-change note**: partners by descending directional confidence then path, ≤ 5, each with `{sup}/{commits}` — the same two numbers the gate used; partner must exist on disk.
4.3 **Status/report**: four honest history paragraphs; "K conventions withheld: no established instances yet"; composition alarm in product English with the percentage, never the key name; everything else byte-identical when no condition holds.
4.4 **Index chatter**: stderr only — one summary line per walking run; "already current" on a no-op; ETA when projected > 60 s; scaffold notice names the absolute path.
4.5 `where`/`spectrum` unspecified; reuse the evidence phrase, labels, exemplar rank, directional co-change, the `hookEligible`-vs-withheld distinction (inquiry may show non-eligible facts but must say why), the naming table; every printed number must be persisted or recomputable from the snapshot.

## 5. Anti-patterns the reviews repeatedly caught

- **Read-or-default / degrade-never-abort, on both sides**: every reader of derived state returns its empty answer on *any* read failure with one debug line; every writer of derived state swallows its own failure; a failed write of the product is a real error. Use `EISDIR` fixtures so the test runs under root.
- **Producer-derivability**: every field a stage returns must be constructible from its declared inputs; fix at the contract, never by an implementer widening under protest; iterate to fixpoint over every writer.
- **Branch totality**: for every value a consumer reads, enumerate present / `null` / gone / absent and give every state an outcome.
- **A killer that cannot fail**: a mutation that changes no observable reports coverage the plan does not have; delete the rule or record it as unkillable defence-in-depth.
- **A decision with no owning task**: text that lives only in a decisions block is not built.
- **Decision-vs-task drift**: after every amendment, grep every restatement.
- **Enumerations that go stale**: state the rule, not the list.
- **A sentinel that collides with a live value**: enumerate the value domain before choosing a sentinel.
- **Set functions versus arrival order**: every accumulated quantity is min/max/counter/set with a stated tie-break; the killer feeds the same records reversed and shuffled and asserts byte identity.
- **Run-dependent versus history-dependent numbers**: define every model-visible number as a property of the history.
- **Interaction pass**: for every pair of amended mechanisms, write one line on how they compose.
- **Verified at source, not argued**: claims about git tested on a fixture before being written; anchors re-located and drift reported.
- **Hand-derivable fixtures and exact boundaries**: every asserted number with its derivation; thresholds hit on the nose.
- **Passing for the wrong reason**: assert the antecedent; "exactly 3" not "at most 3"; controls that separate the mechanism from the floor.
- **One home per rule; called, not copied.**
- **Cannot-tell is not a value; absent is not zero.**
- **Internal vocabulary in user output**: a single forbidden-token test over the whole rendered corpus.
- **Stated order versus incidental order**: every persisted list has a total, stated key.
- **Layer purity as a correctness device**: engine modules take bytes, clocks, identities as parameters; every `stat`/read/clock has a named layer.
