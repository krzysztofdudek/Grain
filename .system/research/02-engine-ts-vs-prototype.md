# Prototype → TypeScript roots engine: every deliberate divergence, hardening and lesson

Source: Yggdrasil branch `claude/document-review-13yoty` — `source/cli/src/roots/*.ts`, `src/io/roots-*.ts`, `src/cli/roots.ts`,
`tests/unit/roots/*.test.ts`, `tests/e2e/cli-roots-*.test.ts`, compared against `planning/roots/prototype-roots2.mjs` (**P**).
Each item: **(a)** prototype, **(b)** TS and why, **(c)** RESULTS (changes what is mined) or ROBUST (robustness/determinism only),
**(d)** recommendation. Adoption status in grain is tracked in `../lessons-from-yggdrasil.md`.

## 0. Headline list — things that change *what gets mined*

1. `C`/index cost counted **once, repo-wide** (`mine.ts:990-996`), not per partition.
2. The vacuous filter is **one-sided** (only `expected=false`); P's symmetric form silently drops every all-true `_all` boolean ("the repo's most perfectly-followed conventions would be the only unmineable ones"; an all-true `_all` boolean accepts at n_eff=21).
3. Vacuous "complement has zero raw instances" evaluated **partition-wide across kinds**.
4. Booleans are **sparse + domain-aware**: `n_false = |domain ∩ members| − n_true`; a scope outside a surface's applicability domain is *undecidable*, never a silent "false". Boolean candidate universe from **domain intersection**, not observed bag keys.
5. Categorical alphabets are the **union across kinds** — a per-kind `.set()` had last-kind-wins and "annihilated the losing kind's facts entirely (verified)".
6. Acceptance and hook-eligibility are **separate**: gates 1–4 set `hookEligible=false` but never drop the fact; P `continue`s on all four.
7. Survived-raw is **fail-closed**: no age function ⇒ nothing survives (P's `ageFn ? … : true` "is the fail-OPEN shape this MUST NOT port as-is"). Hook-shaped instances are excluded from the survived population.
8. Ledger cap **actually applied** as `w(s,q)=min(base, 0.15)` per (scope, surface), applied *last*, with the §18.3 release rule. P only counts `hookShapedConform`.
9. Tautology skip (§7.3): a role cell never mines a surface whose overlap group is one of the role's `definingFeatureGroups`.
10. Real `role_lift` over behavior-class surfaces with decorative demotion; P's is a proxy.
11. Ambiguous scopes carry their rank-1 role via `ambiguousRank1` so they still join that role cell at half weight; P's persisted `-1` lost it.
12. History replay is a **set function** (per-record `preSha` comparison, no running `prevState`) — correct on branched history and what makes resume ≡ full ("a running previous-value map is not merely order-sensitive, it is WRONG on any branched history").
13. Clock = **HEAD** committer timestamp read outside the `--no-merges` walk; P uses the last walked commit, which is not HEAD when HEAD is a merge.
14. Partition-root markers: add `setup.cfg`, `*.csproj`, `*.sln`; a **root-level marker is a real partition with id `''`**; P skips root markers.
15. Degraded default weight is `noLifecycleWeight` 0.3, not 1.0.
16. P parses **vendored/excluded code blobs from history** (`EXCL` applied only to non-code paths at walk time); TS applies both gates before any fetch.

## 1. Extraction / binding

1.1 Binding derivation is pure, serializable, hashed (sorted arrays, per-grammar `bindingHash`, one cache shared by live and historical paths), and carries the grammar's node-type vocabulary so E3's domain is read literally. RESULTS via E3 domains.
1.2 Regexes identical: import `/import|include|use_declaration|require/` non-`_`; decorator `/decorator|annotation|attribute_list/`; heritage `/heritage|extends|implements|superclass|super_interfaces|base_|superclasses|argument_list/`; marker `/^[@[]/`; window `(loRow, bodyRow]`.
1.3 **ERROR/MISSING nodes skipped at the node, never the ancestor** (`hasError` would prune a whole class for one malformed method). RESULTS.
1.4 **Import nodes stop the walk**: nested `import_specifier`/`named_imports` re-match `/import/` and push spurious imports via the identifier fallback. RESULTS (import vocabulary).
1.5 Imports stay raw at extraction; normalization at enumeration. ROBUST.
1.6 Ordinals: anonymous scopes always `<anon><k>`; named overloads elide `#0`; counter keyed `${kind} ${name}` file-wide. ROBUST.
1.7 `stable_id = sha256(partitionId ␠ relPath ␠ kind ␠ qualifiedName ␠ arity)[:16]`; RawScope gains domain observables (`hasParameterList`, `hasReturnStatement`, `bodyStatementCount`, `grammarHasDecoratorTypes`, `grammarHasHeritageCandidacy`, `grammarNodeTypeVocabulary`).
1.8 Body walk: 4000-visit cap kept; the `isScope` no-descend guard is provably dead (a method has zero scope descendants by definition); shape depth / max statements / local-var sample are config.
1.10 Parse failure / oversize: byte gate (1 500 000) **and** a 40 000-line gate shared with the historical path; a throw degrades to a synthesized file-only scope. ROBUST.
1.11 File listing: gitignore-aware walk, two filters (`forMarkers` for package roots — never narrowed by `include`; `forParsing` for mining), registry-as-filter (never a parser throw). Built-in globs differ slightly from P (singular `fixture`/`benchmark` not excluded; `generated` only as a directory segment). Shipped **kotlin** grammar derives an *empty* scope set under the name+body rule.
1.12 Genericity is linted: engine files may not import `web-tree-sitter`, mention `.wasm` paths, or compare extension literals.

## 2. Enumerators / vocabulary

2.1 **Sparse booleans with applicability domains** (the central change): `emitBool` records the scope in `domains[surface]` and writes the key only when true; domains read from Appendix B literally (nameshape = named scopes, `<anon>` excluded; arity ⇐ `hasParameterList`; first1 ⇐ ≥1 statement; ret ⇐ has return; varshape ⇐ ≥2 locals; `has:<t>` ⇐ grammar vocabulary holds `t`; `call:`/`stshape:` ⇐ ≥1 body statement; `deco:` ⇐ grammar has decorator types; `extends:` ⇐ heritage candidacy; `imp:` ⇐ ≥1 import; E12 ⇐ ≥3 direct code files). Sparse ≡ dense property test. RESULTS (every `n_false`). **The single biggest semantic upgrade over the prototype.**
2.2 Vocabulary selection total-ordered (ties token-asc, survivors stored sorted), decorator support/topK explicit 8/40, import counts once per *file*, restricted to surviving partitions.
2.3 E7 `dirN` up to 3 segments; overlap-group map: nameshape/filenameshape/modfileshape→`name-tokens`, extends→`supertype`, deco→`decorator`, imp/dirN→`import-segments`.
2.4 Module scopes are partition-dependent "nearest-of" (nearest dir that is the partition root or has ≥3 direct code files); `moduleOfFile` derived from the same data.
2.5 Module-kind units never get lifecycle rows ⇒ no module fact is hook-eligible.

## 3. Roles

3.1 Determinism: eligible list sorted by `stableId`; buckets keyed with a separator and ordered by signature; medoid tie by minimum `stableId`; roles sorted `(partitionId, roleKey)`; byte-identical across input orders. P is filesystem-order dependent end to end (exemplars `conform.slice(0,3)` too). **Sort the file list.**
3.2 No "< 12 eligible" floor (P has one — harmless).
3.3 Role identity content-hashed: `roleKey = sha256(sorted member stableIds)[:12]`; `assignments[skeyR] = ambiguous ? '-1' : roleKey`; `ambiguousRank1`; file-role plurality (§8.9b); `definingFeatureGroups`; `ambiguityRate`.
3.4 `ownCount` = `tok.length + sup.length + dec.length` (per-category deduped), `imp:` excluded.
3.5 Clustering math is a faithful port (Lance–Williams, incremental DL cut, weighted medoids, clone-aware runner-up 0.6, gap 0.15, membership 0.35).
3.6 Real `role_lift` over behavior-class surfaces not in the role's defining groups, divisor `w_base`; `≤ 0` ⇒ decorative ⇒ role cells skipped at scoring but still counted in `C`. Identity surfaces (E1, E2, E7, E12) never feed lift.

## 4. Mining / acceptance gates

4.1 Counts are `Map`s (a mined value can be `__proto__`/`constructor`); seeds never in `members`; four accumulators per cell (`weighted`, `raw`, `survivedRaw`, `members`); serialized counts are **canonical decimal strings**.
4.3 `C` once, repo-wide, after the tautology skip; `candidateCountLog2` in the header.
4.4 Gate order: `nRaw<minRaw` skip; `nEff<minEff` skip; `bits<margin` skip; vacuous (one-sided, partition-wide) skip; then `hookEligible = !fallback ∧ (!placement ∨ role cell) ∧ fireable ∧ (nTotalRaw≥minRaw ∧ share≥2/3)` — flags only. τ tiers 2.5 / 3.5 / 4.5 (`has:`+`stshape:`). `isFireable = (n_e+½)/(n_r+½) ≥ 2^τ`.
4.5 `share` = weighted `nExpected/nEff`; survived counts are separate (`nConformRaw`/`nTotalRaw`); `deviantsN` = raw non-conformers. Never display the weighted one as "established".
4.7 Prune rules identical; dedup ties by **surface asc**; **cull** to `factCap` 400 per partition. Golden lesson: when every method body is uniform, dedup collapses all body surfaces into one lead — a test corpus needs a content split.
4.8 Seeds: match by `path` + `qualifiedName`; target `_all` + rank-1 role (ambiguous via `ambiguousRank1`); `weight ≤ 0` skipped; alphabets computed pre-seed; seeds never count toward raw/survived.
4.9 Directory contexts identical (≥25 and strictly fewer than the kind total); cell ids `_all:<kind>`, `<roleKey>:<kind>`, `d[<dir>]:<kind>`.
4.10 Worked-constant pins: S1 (role 30/600 → 82.2 bits), S2 (50/50 → 0), S3 (all-true `_all` accepts at 21, rejects at 20), S4, S5, `C=2^14 → 14`, 94.8%/τ=4.5 rejected; `isFireable(0,0,0)` true only because of the +½.
4.11 Model shape: honest degenerate values (`denyEligible: false`, `suppressedValue: null`); absent fields structurally absent, never `{}`; `agentShare` `null` = no history, `0` = agent-free population.

## 5. Weights / history replay

5.1 §9.1 transcribed line by line; new: dirty-working-tree branch (0.3), ledger cap applied, both day counts clamped at 0; real file-level rows persisted.
5.2 Ledger mark release: `stable_days ≥ 90` **and** `lastHumanCommitTs ≥ markDate + 14d`.
5.3 **Replay "touch" semantics — the biggest semantic fork**: P moves `last`/`mods`/`fix`/`churn` only when the body signature changes; TS touches every scope in a record's post-image on any commit. Recommendation: keep P's change-gated semantics (that is what "stability" means for a scope) but implement per-record, order-free.
5.4 Order-free fold: every record carries `preSha`; rename edges accumulated raw and closed **once at finish** in `(ts, sha)` order with immediate retargeting (no fixpoint loop — a rename-back cycle would spin); rows landing on one final key are merged.
5.5 Gates on lifecycle rows: gate 1 (exclusions) ⇒ nothing anywhere; gate 2 (parse filter + grammar) ⇒ no row of either level; oversize/unparseable/>300 KB ⇒ file-level row only; test files still count for co-change. **P's vendored-blob parsing is a real defect.**
5.6 Appearance cap (`lifecycleMaxAppearances` 200) decided per raw path, applied per final key after alias merge.
5.7 Git walk: `--date-order -z`, `%B` body, streamed; fix = `/^(fix|hotfix|bugfix)\b|(^|\s)revert(s|ed)?\b/i` over the body **or** `This reverts commit`; agent = author **or any `Co-Authored-By:` trailer**; author hash sha256. Empirical: `--reverse --date-order` does not deliver ascending timestamps; a resumed range is a set difference; `--max-count` caps by traversal order.
5.8 Degraded mode: no `.git`, shallow, or walk error ⇒ no `historyStats`, `agentShare: null`, every fact `hookEligible:false`, `lastIndexedSha: null`.
5.9 Co-change: raw accumulators persisted uncut; idempotent per sha; renames folded at finish; self-pairs dropped; sort `(sup desc, a asc, b asc)` before the cut; `conf` unrounded; coupling percentiles per file/module.
5.10 `agentShare` over finished lifecycle rows first seen within 120d; empty population ⇒ `null`, never `NaN`.
5.11 `historyStats` = properties of the history (identical cold/warm): never let "parsed this run" into the model.

## 6. Incremental index / resume / staleness / build lock / determinism

6.1 Six-file replay state under `.cache/history/`; `inputsHash` over schema ∥ extractor ∥ every grammar's binding hash ∥ history config; `decideWalkMode`: `--full` | windowing | no state | inputsHash mismatch | unreachable `lastIndexedSha` ⇒ full, else resume `sinceSha..HEAD`; `stateEpoch` written into all files, compared never re-derived; accumulators first, meta last (torn writes detected); any malformed row ⇒ whole state unusable ⇒ full walk. E2E: resume ≡ fresh `--full` byte-for-byte.
6.2 No-op short-circuit: eight *input* header fields equal + walk mode `resume` + empty range + blob cache present ⇒ "Already current", zero writes; `dirtyHash` excludes the store's own writes; `lastIndexedSha` written only when the walk ran.
6.3 Build lock: `O_EXCL` create with `{pid, createdAtMs}`; stale after 15 min; fresh lock retried every 100 ms up to 2 s then refused naming the holder; an unbreakable stale lock falls through to the bounded wait (a prior version spun at 100% CPU).
6.4 Canonical model write (deep-sorted keys, atomic); blob-cache hit and fresh miss byte-identical; double-index and cold-vs-warm controls.
6.5 Test discipline: deterministic git fixtures; goldens as builder spec **and** bundle; null control (shuffled labels ⇒ 0 role/locality facts); fail-closed control; mutation-kill tests per gate.

## 7. Blob cache

P: one JSONL keyed by sha only, last extension seen wins (the same blob at `.ts` and `.py` is parsed once under whichever came last), new `cat-file` process per 400-sha chunk. TS: `key = sha256(blobSha ␠ EXTRACTOR_VERSION ␠ per-grammar bindingHash)` — one record per (blob, grammar); sharded, canonical, atomic, per-record tolerant; skips recorded only for `oversize`/`unparseable`; `no-grammar`/`excluded` answered from the path; one long-lived `cat-file --batch` child.

## 8. CLI / status / output

`index [--full]` writes `{header, body}`; config block with ~90 keys, unknown key = hard error, scaffolded if absent; tolerant line readers for seeds/ledger/decisions; `status` plain-language, always exit 0, "N commits behind HEAD" from `meta.json`, windowing notice, shallow/no-git explanations; ETA line only if projected fetch > 60 s; exit non-zero only for config error, missing project, build lock held.

## 9. What the TS implementation does NOT have (no second implementation exists)

`check`/verdict path, verbalizer, trends/attractor/nucleation, calibration/DENY, exemplars, `report`, `completeness`, `mutate-test`, `spectrum`, `where`, `export-aspect`, seed tension, `stabilityDays`, coverage/debt, role re-induction, hooks/daemon, telemetry/session stores. All planned in the unbuilt R5 plan, whose decisions that correct the prototype's `check`:

- **D5 partition routing**: persist the decision function (roots → id, `fallback`, `null` = silent); `''` is a **live** partition id (root-level `package.json`) and never a sentinel.
- **D6**: hook-time enumeration reuses index functions with the **snapshot's vocabulary**; absent-but-in-domain boolean reads `'false'`; **not in the domain ⇒ `null` ⇒ skip**.
- **D7**: Δ = `log2((n_e+½)/(n_v+½))`, ⊥ ⇒ `log2(2n_e+1)`; τ is the fact's persisted `tau`.
- **D8**: evidence class = `nTotalRaw`, ties role < dir < `_all`.
- **D9**: `_repo`, `''` and `_root` all render `repo-wide`.
- **D4 exemplars**: non-ambiguous conformers ranked `(w·m1·centrality, w·m1, stable_id)` for role facts / `(w·centrality, w, stable_id)` otherwise; render-time re-validation is a memoized file-existence check.
- **D11**: bare `check` evaluates every scope in every dirty file.
- **D15**: compliance writes `{stableId, surface, date}` to the committed ledger.

## 10. Miscellaneous

`tokenize`/`nameShape` ported verbatim and shared with the replay; `historyConfigSubtree` = only `include/exclude/history` feed the resume hash; `AGENT_SHARE_WINDOW_DAYS = 120` fixed; role cells method/type only; `C` counts placement-on-`_all` candidates in both.

## 11. Recommended adoption order for the standalone engine

1. Domains + sparse booleans, alphabet union, domain-based boolean candidates, one-sided partition-wide vacuous filter, repo-wide `C`.
2. Accepted-vs-eligible split, fail-closed survived-raw, `nTotalRaw/nConformRaw/deviantsN` fields.
3. Determinism: sorted file list, stableId-sorted eligibility, signature-ordered buckets, tie-breaks everywhere, canonical decimal counts, canonical atomic model write.
4. Order-free replay with per-record `preSha`, finish-time alias closure, gates before any blob fetch, HEAD clock, real classifiers — and the explicit call on "touch" semantics.
5. Per-(sha, grammar) blob cache key with extractor-version bump discipline.
6. Ledger cap + release, dirty-tree weight, `roleKey`/`ambiguousRank1`, real `role_lift` + tautology skip.
7. When porting `check`: the R5 decisions in §9.
