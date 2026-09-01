# 044 — measurement log

## Part 0 — adjudication design, PRE-REGISTERED (written before any twin pair was looked at)

Recorded 2026-09-01, before running the engine on any corpus repo. Engine snapshot: working tree at
`plugins/grain` (HEAD 601aa23 + uncommitted release work), copied read-only to
`<scratch>/i044/grain` and run from the copy — `plugins/grain/engine/` is never written.

### Unit of measurement

One **health row of the twin kind** in `grain report` = one entry of `model.twins`. That is what the reader
sees and must individually refute:

```
«A» (partA) and «B» (partB) are structurally the same shape[, named `*x`/`*y` there]
  → grain decide steer <path>#<name> --surfaces <pid> --note "duplicate of «B» in partB — unify or document why both exist"
```

The claim being judged is the row **as rendered**, i.e. the actionable instruction — not the weaker,
literally-true observation "these two templates anti-unify". A row can be structurally true and still be bad
advice; the reader's cost is paid on the instruction.

### The rubric for REAL (fixed here; not revised after seeing data)

> A twin row is **REAL** if a competent maintainer of that repo, shown the two groups' members side by side,
> would say: *"yes — these two sets implement the same logic; either one should call the other, or they should
> share a helper / be generated from one template, or there should be a written reason they are separate."*
>
> A twin row is **NOISE** if the thing the two groups have in common is explained by the language or by generic
> control flow rather than by the code's job — i.e. if the honest answer to "what do these two share?" is only
> a syntactic fact: *"both return an expression"*, *"both take a `*testing.T` and call one helper"*, *"both are
> one-line getters"*, *"both are a two-statement constructor"*.
>
> **Tie-break: an unsure pair counts REAL.** The bias is deliberately toward the tool, so the precision figure
> reported here is an *upper bound* on precision and therefore a *conservative* estimate of any noise problem.

### Procedure (fixed here)

1. Build the model on each corpus repo from the engine copy; capture `model.twins` plus, per pair, both role
   groups' full member lists (`part.assignments` → `part.fileScopes` → source ranges).
2. **Hand verdict first.** For each sampled pair, render a fixed card: the two group labels/partitions, and up
   to 3 member bodies from each side, truncated to 40 lines. Record REAL/NOISE against the rubric above. The
   card deliberately does NOT show the mechanical signals below, so the hand verdict cannot be anchored by them.
3. **Mechanical signals computed afterward**, per pair, never shown before the verdict is recorded:
   - **S1 content overlap** — Jaccard of the two groups' *content vocabulary*: identifier tokens and called
     function names harvested from member source, minus that language's keywords, minus tokens of length ≤ 2.
     "Do the bodies share meaningful token content beyond the skeleton?"
   - **S2 skeleton size** — the pair's `shared` node count and the *rendered common core*
     `skRender(skAu(A._tpl, B._tpl))`. This is the direct test of issue question 2.
   - **S3 co-change** — over the repo's history, the fraction of A-side files that ever land in a commit
     together with a B-side file. Evidence a reader accepts, per the brief.
   - **S4 locality** — same partition; same top-level directory.
   - **S5 name-stem overlap** — do member name stems (trailing digits/width suffixes dropped) intersect?
     `extract_16`/`extract_20` intersect; `_squareBigger`/`_unsafeAccess` do not.
4. Report: precision per repo with sample sizes and how the sample was drawn; precision as a function of S2;
   agreement of each mechanical signal with the hand verdict.

### Sampling (fixed here)

If a repo emits ≤ 25 twin rows, adjudicate **all** of them. Otherwise adjudicate a **uniform random sample of
25** drawn with a fixed seed from the full row list (seed = repo name), reported as such. Sampling is uniform
over rows, NOT stratified by `shared`, so the per-repo precision figure is an unbiased estimate of what the
reader meets; the precision-vs-skeleton-size breakdown is a secondary cut of the same sample.

### What would count as each outcome

- **Surface earns its place**: precision high enough that a reader refuting the misses costs less than losing
  the hits. Stated in advance as ≥ 0.7 — the same majority-share proportion the twin gate itself uses (2/3),
  rounded up, so the bar is not invented for this measurement.
- **Evidenced negative**: precision measured, cause identified, no change — the §008/§031/§037 precedent.
- **Defect**: precision low AND the cause is a population/rendering fault that can be fixed without a new
  tuned constant.


---

## Part 1 — corpus and reproduction

Six repos, six languages, each cloned fresh (`git clone --local`) so no other agent's `.grain/` was touched.
Model built by `ensureFresh(… want:'force')` from the engine COPY.

| repo | language | HEAD | commits | `model.twins` | rendered health rows | health rows total |
|---|---|---|---|---|---|---|
| openzeppelin-contracts | Solidity | 6c703c9a | 4193 | 393 | **83** | 83 |
| gin | Go | dcaa429 | 2007 | 143 | **76** | 96 |
| flask | Python | d318b683 | 5556 | 50 | **27** | 34 |
| telescope.nvim | Lua | 40aedd8 | 1529 | 2 | 0 | 4 |
| leveldb | C++ | 7ee830d | 447 | 2 | 0 | 0 |
| spring-petclinic | Java | 818c413 | 1042 | 0 | 0 | 0 |

**The field report reproduces exactly: 83 twin rows on OpenZeppelin.** On OZ every single health row is a twin
row; on gin and flask twins are 79% of the section.

`model.twins` is 4.7× the rendered count on OZ. The 393 → 83 reduction is NOT a relevance filter: it is
`roleExemplar` failing to find a role-defining fact with an exemplar to anchor the `grain decide steer` on
(`core.mjs:3634-3642`). A pair with no anchor is silently dropped. `export` publishes all 393.

## Part 2 — precision (question 1)

Sample drawn per the pre-registration: uniform, seeded by repo name, 25 rendered rows per repo. Hand verdicts
recorded from cards that showed only the claim and the member bodies — no `shared`, no coverage, no common core,
no co-change. Signals computed afterward.

| repo | precision | 95% Wilson CI | sample |
|---|---|---|---|
| openzeppelin-contracts (Solidity) | **9/25 = 0.36** | [0.20, 0.55] | 25 of 83 |
| gin (Go) | **1/25 = 0.04** | [0.01, 0.20] | 25 of 76 |
| flask (Python) | **8/25 = 0.32** | [0.17, 0.52] | 25 of 27 |
| **aggregate** | **18/75 = 0.24** | **[0.16, 0.35]** | 75 of 186 |

Both field reports are confirmed and neither was pessimistic: Go measures at 96% noise against the tester's
"~90%", and the tie-break in the rubric was set to favour the tool.

### Distinct findings, not distinct rows

Precision understates the problem, because the accepted rows are not independent. The gate is pairwise over
role groups, so ONE templated family becomes O(k²) rows:

- **33 of OZ's 83 rows** have both sides entirely inside `contracts/utils/Packing.sol` — 6 width groups
  (`extract_16/20/22/24/28/32`, likewise `replace_*` and `pack_*`) pairing up. Real, and it is one fact.
- **6 of flask's 27** are the `my_reverse` / `boolean` template-filter fixtures mirrored between
  `tests/test_blueprints.py` and `tests/test_templating.py`. Real, and it is one fact.

So OZ's ~30 true rows carry roughly two distinct findings, and flask's ~9 carry about three.

## Part 3 — is the similarity a near-empty skeleton? (question 2)

**Yes, and the mechanism is measurable.** Rendered common cores, `skRender(skAu(A._tpl, B._tpl))`:

```
gin, «binding+for+form» / «debug+print+test», shared=10, cov=0.56:
  function_declaration(⟨·⟩ parameter_list(parameter_declaration(t pointer_type(qualified_type(testing T))))
                       block(statement_list(…×6)))

flask, «to» / «init», shared=7, cov=0.64:
  function_definition(⟨·⟩ parameters(self typed_parameter(⟨·⟩ type(⟨·⟩)) …) type(⟨·⟩) block(…×3))

OZ, «access+unsafe» / «block+number+clock», shared=8, cov=0.57:
  function_definition(⟨·⟩ … visibility state_mutability return_type_definition(parameter(type_name(⟨·⟩) …))
                      function_body(statement(⟨·⟩) …))
```

The gin core is `func X(t *testing.T) { … }` and nothing else. The flask core is "an annotated method on `self`".
The OZ core is "a Solidity function with a visibility, a mutability and a named return". The tester's
"amounts to *returns an expression*" was, if anything, generous.

Contrast the accepted-and-real OZ core at shared=57, which carries actual body content — the
`if (offset > N) revert OutOfRangeAccess()` guard, the named `self`/`offset`/`result` parameters, the assembly block.

### Precision as a function of skeleton size

| `shared` band | OZ | gin | flask | precision in band (sample) |
|---|---|---|---|---|
| ≥ 28 | 35 rows | 0 | 0 | 8/8 = 1.00 (all OZ) |
| 16–27 | 12 | 2 | 0 | 0/2 |
| 12–15 | 10 | 21 | 1 | 0/7 |
| 8–11 | 26 | 52 | 14 | 8/45 = 0.18 |
| < 8 | 0 | 1 | 12 | 2/13 = 0.15 |

**And this is exactly why a minimum-size threshold is the wrong answer, as the brief said.** gin's ENTIRE
population lives at 6–23 and flask's at 5–12. Any floor that clears gin's noise deletes gin and flask whole,
including flask's 8 true rows. Size is not the variable.

### The population is the variable

The gate is `shared > (A.shared − shared) + (B.shared − shared)` — a purely *within-pair* relative test. It
asks "does the shared core outweigh the two remainders", against an implicit null of zero. But two arbitrary
functions **in the same language** already share their whole declaration syntax, so the null is not zero.

Measured directly — the shared core of every same-root pair in the twin pool, accepted or not:

| repo | root | pairs | min | **median** | max | median `shared` of ACCEPTED rows |
|---|---|---|---|---|---|---|
| gin | `function_declaration` | 861 | 3 | **10** | 53 | **10** |
| flask | `function_definition` | 465 | 2 | **3** | 12 | 10 |
| OZ | `function_definition` | 5778 | 1 | **7** | 80 | 26 |

**In Go the accepted twins sit exactly at the median of the null distribution.** The gate is admitting pairs
that are perfectly typical of "any two Go role groups" — no evidence of duplication whatsoever. That is the
whole 0.04. flask and OZ sit further above their own nulls, and their precision is correspondingly higher
(0.32, 0.36). Precision tracks the distance from the repo's own null, and the gate never measures it.

`profileOf`'s `shared >= 6` floor was calibrated for the *within-group* claim, where members are already known
to be similar and the template summarises them. `twinsOf` reuses those same profiles for a *between-group*
claim, where the correct baseline is different and is never consulted. **That is the population fault.**

### Tested correction (no new constant), and why it is not enough

Subtracting the measured per-root median from the shared core —
`shared − median(root) > (A.shared − shared) + (B.shared − shared)` — uses only a statistic of the population
the gate already ranges over, so it introduces no tuned constant:

| repo | precision before | after | rows before → after | true rows lost |
|---|---|---|---|---|
| OZ | 0.36 | 0.67 | 83 → 47 | 1 of 9 |
| gin | 0.04 | 0.00 | 76 → 2 | 1 of 1 |
| flask | 0.32 | 0.50 | 27 → 14 | 2 of 8 |
| aggregate | 0.24 | **0.56** | 186 → 63 | 4 of 18 |

Real improvement, and it confirms the diagnosis. But 0.56 is still under the 0.70 bar pre-registered above, it
zeroes Go outright, and it loses 22% of the true hits. **Not shippable on this evidence.**

## Part 4 — mechanical signals vs the hand verdict

Computed after the verdicts were fixed. Full table: `<scratch>/i044/out/all.signals.json`.

| signal | behaviour on the 75-row sample |
|---|---|
| **S1 content Jaccard** of member-body vocabulary | best continuous separator: ≥0.2 keeps 17 of 18 REAL and 4 NOISE (0.81 precision) — but it is a new tuned constant, and it is fitted to these same 75 verdicts |
| **S2 skeleton size** | see above — separates within OZ, useless across repos |
| **S3 co-change** | **no signal.** NOISE rows reach 288 co-changing commits (both groups live in `context.go`); REAL rows range 0–51. At file granularity it measures "same file", not "same logic". |
| **S4 same partition** | weak: 15/18 REAL but also 33/57 NOISE |
| **S5 shared name stem** between members | **11/11 precision, 11/18 recall** — every row with a shared stem was REAL; every NOISE row had none. Note the polarity: the engine currently annotates the opposite (`namedDifferently`, when the dominant suffixes DIFFER). Fitted post-hoc to these verdicts; would need an independent test set. |

## Part 5 — is the list capped? (question 3)

**No, nowhere.**

- `healthRows` returns every row; `report` prints all of them (`core.mjs:3777-3779`). **83 lines on OZ**, 23% of
  the whole 356-line report, and 100% of the health section.
- `rules` uses the same uncapped `healthRows` (`core.mjs:3865`) — **`grain rules` writes 83 "unify or document
  why both exist" instructions into the committed CONVENTIONS.md.**
- `--top N` does not touch health rows: `report --top 3` still emits all 83.
- `export` publishes `model.twins` verbatim — **393 on OZ**, uncapped.
- `TWIN_PROFILE_CAP = 200` caps the *input pool*, not the output; it dropped 69 profiles on OZ and still yielded 393 pairs.

The one thing that *does* reduce the list is `roleExemplar` failing to find an anchor — an accident of fact
availability, not relevance. §039's lesson applies in mirror image: there a cap silently changed an answer;
here the absence of one lets a quadratic expansion of two facts fill an entire section.

## Part 6 — recommendation

**Remove the twin case from `healthRows` (health signal 5, `core.mjs:3634-3642`). Keep everything else.**

This is a deletion. **It introduces no new tuned constant, and removes none.**

- `model.twins` stays, unchanged — the export schema is a published interface (§adoption review) and is not touched.
- The per-group-card line `twin: structurally the same as «B» (part), named `*X` there` (`core.mjs:2951-2954`)
  stays. It is the right home for this evidence: it is a **structural observation**, not a duplicate accusation;
  it is naturally capped at one per group (`model.twins.find`); and it appears only when the reader has already
  asked about that group. Verified live on gin:
  `twin: structurally the same as «get+set+test» (_root), named `*Slice` there`.

What changes for the reader: OZ's `report` loses its health section entirely (83 of 83 rows were twins) and its
`rules` output loses 83 instructions; gin's health section goes 96 → 20; flask's 34 → 7. The Packing.sol finding
survives on the Packing group's own card, once, instead of 33 times.

Why not the alternatives:

- **Leave it and disclose the rate** — a disclosure does not stop `grain rules` writing 83 unrefuted instructions
  into a committed document, and does not stop the section burying its own true content. §008/§031/§037 shipped
  as evidenced negatives because those surfaces were defensible once measured; 0.24 aggregate and 0.04 on Go is
  not that.
- **Ship the population correction** — measured, principled, constant-free, and still only 0.56 with Go at zero.
  Worth recording as the diagnosis; not worth shipping as the fix.
- **A minimum skeleton size** — measured and rejected above: it deletes two of the three languages entirely.

If the maintainer prefers to keep the actionable row, the honest minimum is the population correction of Part 3
plus the S5 name-stem requirement of Part 4 — but S5 is fitted to these 75 verdicts and would need an
independent sample before anyone should trust it.

## Artifacts

- Engine snapshot (read-only copy): `<scratch>/i044/grain/`
- Per-repo dumps with full member bodies: `<scratch>/i044/out/{oz,gin,flask,…}.json`
- Seeded samples and the blind adjudication cards: `<scratch>/i044/out/*.{sample.json,cards.txt}`
- Hand verdicts, fixed before signals were computed: `<scratch>/i044/verdicts.json`
- Signals and null distributions: `<scratch>/i044/out/*.{signals,base}.json`

Nothing under `plugins/grain/` was written.

---

## Part 7 — the change, proven red/green before landing

Approved 2026-09-01: delete health signal 5; keep `model.twins`, the export schema, and the group card's
`twin:` line. Prepared in the scratchpad only — `plugins/grain/` is still untouched at the time of writing.

Two arms, both repo-shaped copies of the working tree (the shared fixture lives at the repo root, so a bare
`plugins/grain` copy fails 12 unrelated tests for want of `tests/fixtures/build-fixture.mjs` — an artifact of
the harness, not of the change; the first arm layout hit exactly that and was rebuilt):

- `armRED` — engine byte-identical to the live tree (`md5 ac73c2fe…`), amended tests
- `armGREEN` — same tree with the deletion applied

### Full suite, both arms

| arm | tests | pass | fail |
|---|---|---|---|
| **GREEN** (deletion applied) | 1805 | **1805** | **0** |
| **RED** (engine unmodified) | 1805 | 1800 | **5 — every one a §044 assertion** |

The five RED failures are exactly the deletion's claims and nothing else:

```
not ok  158 - twins: report's health section carries no twin row (§044 — measured 0.24 precision, removed)
not ok  459 - (§044) a twin pair renders NO health row, even with both role anchors resolvable
not ok 1701 - (a) report: a model carrying twins emits NO health row about them, while other health signals still render
not ok 1702 - (a2) report: a model whose ONLY health input is twins renders no health section at all
not ok 1703 - (b) rules: the generated CONVENTIONS.md carries no twin instruction, and still carries the other health rows
```

### New file: `tests/twins-not-a-health-row.test.mjs`

Six tests, deliberately in two halves — the second half is the guard that must hold in BOTH arms, because a
guard that only passes after the change guards nothing. Verified: RED runs it 3 fail / 3 pass.

| test | RED | GREEN | what it pins |
|---|---|---|---|
| (a) report emits no twin row, other health signals still render | fail | pass | the deletion is real AND surgical — the cost row still renders, so `== health ==` itself still works |
| (a2) a model whose only health input is twins renders no section at all | fail | pass | no empty `== health — 0 signals ==` heading left behind |
| (b) `rules` carries no twin instruction, keeps the other rows | fail | pass | the committed CONVENTIONS.md path, which is where the 83 rows actually hurt |
| (c) **both arms** — `model.twins` still certifies the pair; `export.twins` is that array verbatim, same field names | pass | pass | the published interface is untouched |
| (d) **both arms** — `where`'s card still prints the `twin:` observation, and never the deleted instruction | pass | pass | the evidence keeps a home |
| (d2) **both arms** — a card carries at most one twin line | pass | pass | the surviving surface is bounded, unlike the quadratic row list |

### Existing tests that assert the health row today, and what changes

Only two, both intended contract changes; every other twin test passes untouched in both arms.

1. **`tests/health-section.test.mjs`** — `twins and dead-steer rows render with real, resolvable exemplars`
   asserted the row's presence. Split in two: `dead-steer rows render with real, resolvable exemplars` (the
   half unaffected by this change, green in both arms) and a new `(§044) a twin pair renders NO health row,
   even with both role anchors resolvable`, which additionally asserts the `r0:`/`r1:` anchors and the `twins`
   field are STILL on the fixture — so the absence is provably a rendering decision, not a missing input.
   The file header's list of composed fields drops twins, with the reason.

2. **`tests/cross-check-export-parity.test.mjs`** — its data-driven table routed `twins[] → report (== health ==)`.
   That renderer no longer exists, so the row is re-pointed to `where (group card `twin:`)` and
   `extractTwinHealthLine` becomes `extractTwinCardLine`. The parity claim is honest about what the card can
   say: it names ONE partner per group (`model.twins.find`), so the test asserts the named side is a partner
   export agrees on and that the printed suffix is one of that pair's `namedDifferently` tokens — not that the
   card happens to pick the same pair the test did. A second test was added beside it asserting report and
   `rules` carry no twin row, so a future export extension cannot quietly re-add the renderer.

### No documentation change is required — checked, not assumed

`docs/reference.md`, `docs/mathematics.md`, `README.md` and `SKILL.md` never describe a twin health row. What
they do describe stays true: `model.twins` and its acceptance rule (§mathematics "Structural twins"), the
`twins` export field, and `where`'s group-card line (`SKILL.md:77`). `docs/reference.md:26` describes the
health section generically ("conventions worth a decision") and never enumerates the eight signals.

### Version bump: none — demonstrated, not argued

`ENGINE_VERSION`/`EXTR_V` gate the extraction cache and `MODEL_V` gates the model schema; this edit touches
neither, and bumping either would force a pointless re-parse or re-learn. Shown directly on gin:

```
RED engine, fresh cache:                    76 twin rows
GREEN engine, SAME cache, --no-refresh:      0 twin rows
model.twins in that same cache file:       143 entries, untouched
```

A user with a warm cache gets the new rendering with no rebuild, and the model on disk is unchanged. That is
the definition of render-only.

### Landing

`<scratch>/i044/apply-044.mjs <path to engine/core.mjs>` performs the edit by CONTENT anchor, never by line
number — it refuses loudly if the block has drifted (other agents are editing `core.mjs`), and is idempotent.
Verified to reproduce armGREEN's `core.mjs` byte-for-byte from the live file. Line anchors will still be
re-derived against the live file at landing time rather than trusted from this snapshot.

### Part 7a — re-derived against current live (baseline drift)

Re-derived after the C++/Solidity agent's partial landing. The delta is invariant:

| arm | tests | pass | fail |
|---|---|---|---|
| **GREEN** | 1823 | **1823** | **0** |
| **RED** | 1823 | 1818 | **the same 5 §044 assertions** |

1823 = the live base of 1815 plus this ticket's 8 (6 new tests, 1 split of `twins and dead-steer rows`, 1 added
absence guard in the parity file), which confirms 1815 independently.

Where the drift actually was, since it changes what re-derivation costs: `engine/core.mjs` is **byte-identical**
to the earlier snapshot (`ac73c2fe…`, 4108 lines) — the Solidity `modifier_invocation` derivation (`core.mjs:114-124`)
and the C++ body-less-specifier derivation (`core.mjs:394-398`) had already landed *before* that snapshot was
taken, so both arms already carried them. The 1797 → 1815 move came entirely from two NEW test files,
`tests/decorated-declarations.test.mjs` and `tests/solidity-modifiers.test.mjs`. The apply anchor was re-checked
against the live file and still matches exactly once.

That is a happy accident of timing, not a reason to trust snapshots: the `.h` grammar-mapping change is still to
come and will move `core.mjs`. So re-derivation is now one command, `<scratch>/i044/rebuild-arms.sh`, which
rebuilds both arms from live, applies the deletion by content anchor, and drops in the three test files. It
carries a **clobber guard**: the two amended test files are whole-file replacements, so the script refuses if
either has changed upstream since it was amended (bases pinned in `amendment-bases.md5`) rather than silently
overwriting a teammate's edit.

### Landed — fix/044

Worktree base had drifted further than expected: `fix/044` branched from `601aa23` (pre-0.3.0), one release
behind `main`'s `509e786`. Rebased onto `509e786` first (fast-forward, no replay needed) — `health-section.test.mjs`
and `cross-check-export-parity.test.mjs` did not exist at all before that rebase, so the md5 check would have
been meaningless without it.

md5 check against live files at `509e786`: both matched `amendment-bases.md5` exactly
(`e7392a53b47ab94aaf08fd5d975f0bb9`, `f137084a2c139a2d43a96eddb7466b32`) — no drift, amended files applied as-is.

`apply-044.mjs` applied cleanly against `engine/core.mjs` (one match, no refusal). Dropped in the two amended
test files and the new `twins-not-a-health-row.test.mjs`.

Verified red→green directly rather than trusting the snapshot: reverted only `core.mjs` to HEAD, ran the three
affected test files — 22/27 pass, the exact 5 §044 assertions failing (twins health row in `report`'s text
render, `report --json`, twins-only model, and `rules`' `CONVENTIONS.md`, plus the cross-check parity guard).
Reapplied `apply-044.mjs` — byte-identical patch both times — all 27/27 green. Full suite: 1833/1833 (base 1825
+ 8 from this ticket, matching the earlier 1815→1823 delta pattern).

`config.mjs` untouched, no version bump (render-only, per the earlier `--no-refresh` proof). Committed on
`fix/044`.
