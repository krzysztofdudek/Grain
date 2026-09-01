# Lessons-learned report: roots planning docs → standalone `grain` engine

Source: Yggdrasil branch `claude/document-review-13yoty`, `planning/roots/`. **SF** = `2026-08-17-yg-roots-spec-final.md` (v5.2,
**superseded**), **V6** = `2026-08-17-yg-roots-v6-spec.md` (normative for mechanism), **VR** = validation report, **AD** = emergent
addendum, **ID** = integration design (normative for product surface; ID wins over V6 on surface, V6 on internals), **PL** =
`yggdrasil-obraz-calosci.md`, **CL** = `CHANGELOG.md`, **PROTO** = `prototype-roots2.mjs` (md5 `bc9eec11…`, 790 lines).

## 0. Correction to the premise

"spec-final" is **not** the final spec: its header reads `SUPERSEDED by v6`. Lineage: v5 → probe (VR) → v5.2 (SF) → emergent test (AD) → **V6** → **ID**.

## 1. SF (v5.2) vs V6 — the delta

### 1.1 The three subsystems V6 replaced, with reasons
1. Hand-written predicate catalog (~50 rows / 4 languages, 22 families) → 12 generic enumerators over raw ASTs + paths with per-partition support-pruned vocabularies. Reason: the catalog capped discovery at what a human anticipated ("25 vs 5 role conventions on the same corpus").
2. Transform/witness registry with a safety ladder and "no witness ⇒ permanently mute" → agent-as-witness (the exemplar contrast is the witness) + optional recognizer pack that must never change a verdict.
3. 22 hand-assigned families for dedup/pooling → correlation dedup (conform-set Jaccard ≥ 0.9 → one FACT, 3.5–58× measured).

### 1.2 Section-by-section changes
- **Principles**: P6 genericity is a correctness property (lint-enforced); P1 gains the vacuous filter; P4's `arch_class` → structural-reach test; "roots does not rank or judge code quality. A convention is a majority, not a virtue."
- **I2a** gains deterministic vocabulary selection (support-then-count, `token asc` tie-break).
- **Packaging**: `node-types.json` must ship beside every grammar WASM; `bindingHash` in the header so a grammar upgrade invalidates the model rather than silently shifting features.
- **Config**: `history.full: true`, `maxCommits: 0`; `blobMaxBytes`; `dependabot` in `agentIdentities`; `enumerate` block (support nodeType 20 / call 8 / import 5 / supertype 4 / shape 15 / decorator 8; topK 30/80/60/30/40/40; shapeDepth 2, shapeMaxStatements 20, pathSegments 3, localVarSampleMax 20); `factCap`, `dedupJaccard 0.9`, `dirContextMinScopes 25`; `absenceGapBits 3.5`, `absenceGapBitsStructural 4.5`; `cochange{minSupport 8, minConfidence 0.75, maxPairs 5000}`; `roles{clusterSampleCap 700, minClusterSize 3, minOwnFeatures 2, cloneMedoidJaccard 0.6}`.
- **Lost from SF**: the effective-horizon rule `walk horizon = max(windowMonths, 2·calib.horizonDays/30 + 2)`. If grain ever windows history, keep it.
- **Extraction**: `EXT2GRAMMAR` the only per-language datum; binding derivation rules (scope = name+body; import/decorator/heritage regexes; `@`/`[` marker; attribution window `(loRow, bodyRow]`; kind by nesting); occurrence ordinals on every key; change signature includes decorators/supertypes/nameshape; vocabulary-stability step; no descent into nested scopes + 4000-node cap. Partitions add `go.mod`, `pom.xml`, `Cargo.toml` (and `*.csproj`/`*.sln`/`setup.cfg`); < 300 scopes merged ⇒ silent (J4). Exclusions: dropped language-specific globs; added `.yggdrasil/**` ("tool state polluted a dogfood run's `_root` partition"), `target`, `coverage`, `.next`, `fixtures`, `benchmarks`, `__mocks__`, `*.d.ts`, and `*.test.*`/`*.spec.*` for mining only.
- **Roles**: F(s) = `tok:` + `sup:` + `dec:` + `imp:` (decorators+supertypes "empirically load-bearing": ambiguity 39% vs 56–85%); `clusterSampleCap` on distinct feature bags; ambiguity weight `w·0.5`; clone-aware runner-up; **sticky roles** (detection 50% → 93%); role-conditioned speech is thin, `_all` carries the mass; `role_key` content-derived; labels display-only.
- **Norm model**: four numbered eligibility gates; fallback list gains `?`; placement barred from `_all` **and** directory cells; vacuous filter; correlation dedup; absence-τ tiers; `factCap` cull; **directory contexts** with `parentExp` locality line and redundant-refinement pruning; trends capped at 24 windows, cohort trends (report-only); DENY by structural reach; specificity governance (at most one fact per surface governs; smallest survived-raw class wins; ties role < directory < `_all`); compliance-closure `ignored` bounded once per session; exemplars from non-ambiguous members only.
- **Messaging**: T1 `{n}/{m} established {units} conform{hook_shaped_note}{seed_note}{stability_note}. Your … {deviation_phrase}{novelty}. See: p:l \`n\` · …`; verbalizer table (name shapes "named by example, never by the raw shape string"); ordering tie-break `surface asc`.
- **History**: entire history, `--reverse --raw --no-abbrev --no-merges -M`; blob AST cache keyed `blobSha∥extractorVersion∥bindingHash` storing raw ingredients; language from the historical path's extension, **content sniffing forbidden**; per-scope lifecycle via replay with rename continuity (94–96% coverage); clock = HEAD committer ts ("never `max(last_modified)`, never wall clock"); weights reshape the field (15 → 12 facts, 6 shared); co-change ≥ 2 changed files, cap by descending support, includes non-code files.
- **Calibration**: unavailable on every repo tested (no FACT reached 12 events).
- **Testing**: model-generated mutation operators with re-extraction validation, hermetic + unbudgeted run, denominator honesty (`unsupported` reported alongside); goldens must include a no-decorator language (Go) and an annotation language (Java).

### 1.3 Things v5.2 had that V6 lost or weakened
1. Layering semantics (`dir_layer`, `imports_layer_up`) — lost by design; `auto.imp:` + directory contexts partially cover it.
2. Call graph / coupling source — V6 redefines coupling from co-change partners; `centrality` in §9.11 has no definition of where it comes from.
3. `test_sibling` — orphan reference in the campaign score.
4. Fallback buckets — decide whether `auto.ret = bare` is a fallback.
5. Signature-shape role features — dropped (harmless).
6. Effective walk horizon rule.
7. Findings traceability (why the MAD gate, the universal witness fallback, leave-role-out baseline, the eligible-but-mute band [0.850, 0.861], lower-bound calibration were deleted).
8. The `w·m1` vs `_all` `w` caveat ("a declared plug-in estimate whose bias is absorbed by `param_cost`; do not 'fix' it").

## 2. Validation report — measured, failed, changed

Probe `roots-probe.mjs` (~330 lines, TS/TSX/JS only, ~14 heuristic predicates). Corpus: express, fastify (uniform and with 12-month history), typeorm, nest, immich, Yggdrasil (shallow 50-commit). Zero parse errors.

Validated: V1 shuffled-label null ⇒ 0 accepted role conventions everywhere; V2 eligibility gates mute non-majorities; V3 silence on conforming mature code; V4 dogfood discovered `imports.chalk=false` and `imports.web-tree-sitter=false` — both correspond to hand-authored aspects; V5 role-conditioned placement works; V6 perf (8 829 scopes ~4 s; role induction ≤ 350 ms/partition at N=700; `git log` over 752 commits = 46 ms); V7 weight shift is material (deviant instances 19 → 122 under survival weighting).

Found wrong → fixed: **F1** `_all` placement is nonsense (`dir_top=test` 0.84) → placement role-conditioned only; **F2** fallback buckets as `expected` (`file_name_style=other` 0.81) → never eligible; **F3** raw bits-per-instance ranking dominated by distributional facts → report ranks hook-eligible first.

Caveats: role ambiguity 47–83% with probe-grade bags; "most enforceable mass sits in `_all`"; per-partition `C` makes the probe more permissive than spec.

Addendum measurements: eligible→FACTs after dedup 339→42 / 486→80 / 231→24; ambiguity 39% with decorator+supertype features; vacuous filter 117→7 on a generated SDK; 0 null false positives at C up to 4 663. Seven refinements landed in V6.

Floor numbers: 65/0/0, 130/130 silence — with the qualifier that **5 of 7 models had no git history and the prototype treats everything as survived in that mode**; a borderline case at ratio 5.34 vs 5.66 required.

## 3. Integration design + addendum — decisions for a standalone tool

- **Stores**: committed `model.json` (a deliberate departure: every clone gets the model keyless), `seeds.jsonl`, `decisions.jsonl`, `ledger.jsonl` (`merge=union`); gitignored `.cache/` and `.state/`; header carries every determinism input. Risk: committed-model churn; fallback "gitignore the model and rebuild on clone — a one-line storage flip". **Exclude your own state dir from mining.**
- **Freshness**: `index` incremental by default; `--full` the determinism reference; no daemon; staleness compares `(headSha, configHash, seedsHash, rootsVersion, bindingHash)` only — never `ledgerHash`/`dirtyHash`; zero-write rule when inputs are unchanged.
- **Determinism**: clock read once; no wall-clock anywhere in the model body; sorted iteration; double-index CI gate; cache-state independence asserted.
- **Two regimes as product law**: unsolicited speech (check) gated/budgeted — precision over recall; solicited inquiry (`where`, `spectrum`) inverts the trade. "An `obs`-grade spectrum row entering the hook path is a defect by definition."
- **`where`**: lexical over role labels, medoid features, fact payload tokens, directory names — no embedding/RAG layer; compact-map fallback; card = directory histogram + facts with evidence + exemplars + co-change.
- **Exit codes**: every read surface exits 0; `check --exit-code 4` deliberately not ported.
- **Hook/skill UX**: protocol-first — at task start "if you don't know where a thing belongs, `where "<what you're adding>"`"; after editing "run `check <file>`; treat WARN as a teammate pointing at the house style — follow it or say why not"; before finishing, a completeness sweep. Hooks opt-in, print JSON before writing, probe-execute afterwards ("a silent ENOENT fail-open is the worst failure mode"). Budgets ≤ 3 per response, ≤ 12 WARN per session. No inline suppression markers in source.
- **Naming table**: never leak `FACT/pid/surface/Δ/τ/sticky`; say "convention", "package-wide (`pkg`)", "repo-wide", "local to `<dir>/`", "group «label»", "N of M established conform", "a newer pattern is emerging here — not flagged".
- **Genericity**: committed binding snapshot per grammar asserted in tests; golden repo per grammar with expected degradation stated up front.
- **Non-goals worth copying**: no `scaffold`; no recognizer pack until telemetry earns it; no LLM calls anywhere.
- **PL overview**: graph = "decided", roots = "practiced"; `where` at cold start, `check <file>` "whispers the local norm" after edits.

## 4. CHANGELOG — roots entries and their lessons

| Entry | Lesson |
|---|---|
| `yg roots index` / `status` shipped | Opt-in via presence of the config block; `index` on an unconfigured project scaffolds defaults printed first; `status` never fails a build; the snapshot is re-derivable and reviewable in a diff. |
| History-weighted evidence + incremental re-index | No history / shallow clone ⇒ every history-fed field absent, nothing claimed as established, `agentShare` stays `null` deliberately. Incremental: reads only commits since last run, never re-reads a seen blob; unchanged inputs ⇒ "already current", writes nothing; `--full` byte-identical; single-writer lock names the holding process; `status` reports how far behind HEAD honestly. |
| Engine dependency surface frozen | A deterministic rule enumerates every module the engine may import outside its directory, "ahead of a planned future extraction into a separate package" — the engine was being prepared for exactly the extraction grain is. |

## 5. Known defects of the prototype — with recommended fix

### 5.1 Correctness
- **D1 survived-raw fails OPEN without history** (`ageFn ? … : true`) → fail closed; `status` says "K conventions withheld".
- **D2 ledger weight cap never applied** → apply `min(base, 0.15)` last, or delete the field if no ledger.
- **D3 tautology filter missing** → skip (role, surface) when the surface's overlap group ∈ the role's defining groups.
- **D4 `C` counted per partition** → once, repo-wide.
- **D5 vocabulary tie-break missing in `learn`** → `token asc`.
- **D6 no cross-session closure / expected-flip filter in demotion** → implement or remove.
- **D7 `Object.prototype` key hazard** → null-prototype objects / `Map` on every read path incl. deserialized model.
- **D8 file scopes never get a role** → plurality rule or document spatial-only.
- **D9 stickiness key is `relPath#kind#name#k`, not `stable_id`** → same ordinal on both key spaces.

### 5.2 Fidelity
- D10 undocumented clustering floor (< 12) — specify.
- D11 `role_lift` proxy — compute the held-out DL difference.
- D12 dedup lead tie-break by `surface asc`.
- D13 trends: low-sample floor 4 vs 8; unweighted shares; attractor rule; foothold term; cohort trends.
- D14 stability days never computed.
- D15 no `factCap` cull.
- D16 exemplar selection by index order, no re-validation.
- D17 `(+seeded)`, `{unit_plural}`, per-row deviation phrase not rendered.
- D18 seed tension never computed.
- D19 author identity FNV hash; trailers not read; fix regex loose.
- D20 partition roots miss `*.csproj`/`*.sln`/`setup.cfg`.
- D21 `dirtyWeight` unimplemented.
- D22 calibration two-point rule.
- D23 DENY gate simplified — remove for a query tool.
- D24 message ordering without `surface asc`.

### 5.3 Infrastructure
- D25 blob cache one JSONL keyed by version only → sharded, keyed by extractor version + binding hash.
- D26 walk always full; no build lock.
- D27 rename aliases never persisted; no reaping.
- D28 session state race-prone.
- D29 incidents to stderr only.
- D30 no standing determinism harness.
- D31 single model file + state dir rather than the store triad.
- D32 `export-aspect` shells back into the prototype — out of scope.
- D33 ship `node-types.json` beside every WASM; include `.mts`/`.cts`; commit a binding snapshot per grammar.

### 5.4 Harness caveats
Decorator and name-shape operators rewrite every matching occurrence; name-shape detection counts any scope's message; the headline is over mutable cases — `unsupported` must always be reported; the harness must run hermetically and rethrow.

## 6. Condensed checklist for the grain engine
1. V6 + ID normative; SF only for the lost rationale.
2. Port the mining chain as-is (semantics frozen by the harness).
3. Fix before shipping `check`: D1, D3/D4, D5/D12/D24, D7, D9, D21.
4. Delete rather than half-implement what grain does not expose.
5. `status` honesty lines.
6. Exclude `.grain/**`; test patterns mining-only.
7. No wall-clock; HEAD clock; zero writes when unchanged; single-writer lock.
8. Agent-facing text: two regimes, the naming table, "a convention is a majority, not a virtue", the three protocol sentences.
