# 012 diagnosis log

Reproduced live on a fresh clone of spring-petclinic @ `818c413` (scratchpad, `.grain/cache/model.json` built via
`grain.mjs` cold run). `grain where "add a validator for a new form field"` → OwnerController.java,
VisitController.java, group `GetMapping+form+init`. `PetValidator.java` absent. `grain what "validator"` finds it
correctly. Byte-for-byte matches the ticket's report.

## 1. Is PetValidator a role group at all?

No. `model.json`'s `assignments` map:

```
PetValidator.java#type#PetValidator -> role -1
PetValidator.java#method#validate   -> role -1
```

Role `-1` = ungrouped/singleton — `PetValidator` clusters with nothing (it's the only Spring `Validator` in the
repo). So there is **no group card** for it, and `buildCards`'s `members.length < 3` floor (core.mjs:2615) is not
even reached — moot for a role that was never assigned.

But `buildCards` also emits a **file card** for every file in `part.files`, unconditionally (core.mjs:2666),
independent of role assignment. `PetValidator.java` gets one. Card construction is NOT the gap — confirmed by
dumping `buildCards(model)` directly: a `file` card exists, label
`src/main/java/.../owner/PetValidator.java`, carrying `validat:1` (its own name, max weight, from the filename)
plus path/doc tokens. This rules out (a).

## 2. Where does that card rank, and what beats it?

Ran `whereCmd`'s actual scoring (imported `buildCards`/`whereCmd` unmodified from core.mjs, real model, `top:50`
to see past the default cutoff). Query tokens after `QSTOP` filtering (`for`, `new`, `a` dropped): `{add, validat,
form, field}`. IDF over 141 cards:

| token | df | idf | share of idf budget |
|---|---|---|---|
| field | 2 | 6.160 | 35.8% |
| form | 10 | 3.916 | 22.7% |
| add | 12 | 3.672 | 21.3% |
| validat | 14 | 3.469 | 20.1% |

Full ranked list (score > 0, top 10 of 141):

```
0.7985  [file]  OwnerController.java        n=13
0.5852  [file]  VisitController.java        n=7
0.3874  [group] GetMapping+form+init        n=12
0.3341  [file]  PetController.java          n=13
0.3152  [file]  PetValidator.java           n=3   <-- rank #5, default top:3 cuts it
0.2275  [group] Test+form+name              n=24
0.2275  [file]  OwnerControllerTests.java   n=19
...
```

Per-card term contributions (cardWeight × idf):

- **OwnerController.java** (0.7985): `add:1×3.672=3.672` (from `addPaginationModel`) + `form:1×3.916=3.916` (from
  `initCreationForm`/`processCreationForm`/`initFindForm`) + `field:1×6.160=6.160` (from `setAllowedFields`). Zero
  contribution from `validat` — the card carries no such token at all.
- **VisitController.java** (0.5852): `form:1×3.916` + `field:1×6.160` (also has `setAllowedFields`).
- **PetValidator.java** (0.3152): `validat:1×3.469=3.469` (its own name — the one term that actually names the
  concept) + `form:0.5×3.916=1.958` (half weight, from a doc-comment token, TOKW.doc). Zero on `add`, zero on
  `field` — it simply never uses those words anywhere in its 3-scope surface.

**Confirmed: exactly the ticket's hypothesis.** `field` — 35.8% of the entire scoring budget on this query — is
carried by precisely two cards in the whole model (OwnerController.java, VisitController.java), both via the
Spring `@InitBinder`/`setAllowedFields(...)` data-binding allow-list idiom, which has nothing to do with
validation. It is rare (df=2) *because* it's an incidental word inside one unrelated method name, and rarity is
exactly what IDF rewards. `add` similarly rewards OwnerController for an unrelated `addPaginationModel` method.
Meanwhile `validat` — the query's actual semantic head — has a comparatively low IDF (df=14, mostly PetValidator's
*own* test files and a second, unrelated `ValidatorTests.java` for a different validator), so even a perfect,
full-weight self-name match can't outweigh three unrelated coincidental tokens split across the two controllers.

The one existing anti-coincidence safeguard (core.mjs:2799-2818, the `concentration >= 0.5` "cross-hit agreement"
check that suppresses a hit when one term did all the work) does **not** fire: `contributing = {add, form, field}`
(3 of 4 terms), and `concentration = max(weight)/total = 6.160/13.748 = 0.448 < 0.5`. It looks like broad,
multi-word coverage because the three coincidental tokens come from three *differently-named* methods on
OwnerController, not one — exactly the shape the safeguard was built to trust, not flag.

### Robustness check (this isn't a one-query fluke)

Every rephrasing that includes the literal word "field" gets hijacked the same way:

- `"add validation for a new pet field"` → OwnerController, VisitController (same `setAllowedFields` collision)
- `"validate a new field"` → OwnerController, VisitController
- `"add field validation logic"` → OwnerController, VisitController

Drop "field" and PetValidator surfaces cleanly:

- `"validator for pet"` → **group `Test+pet+validate` (100%), PetValidatorTests.java (100%), PetValidator.java
  (100%)** — a clean, correct top-3.
- `"validator"` (single word) → group `Test+pet+validate` (100%), PetValidatorTests.java (100%),
  ValidatorTests.java (100%) — all genuinely on-topic, but note: `PetValidator.java` itself (the main file, n=3
  scopes) loses the tie-break to its own tests (n=10, n=5) via the `b.n - a.n` sort key (core.mjs:2788), so even
  the "clean" single-word query doesn't surface the implementation file in the default top-3 — a secondary,
  smaller defect in the same tie-break logic, not a false positive (everything shown IS on-topic).

## 3. Classification: **(b) ranking bug**

Not (a): the card exists, is well-formed, and correctly carries the file's own name at maximum weight.
Not (c): this is not "the query genuinely describes the controller work." Grammatically "add a validator for a
new form field" has "a validator" as its direct object — the ask is to add/extend a Validator, which is exactly
PetValidator's role in this codebase (`PetController#initBinder` wires `new PetValidator()` into the binder). The
controllers only rank first because of two unrelated, coincidentally-rare tokens (`field` from an allow-list
method, `add` from a pagination helper), not because they're actually where form-field validation logic lives.
Rephrasing to avoid those two accidental collisions (`"validator for pet"`) recovers a clean, correct, 100%-match
answer — which is itself evidence that the mechanism, not the concept, is at fault: a repo-wide token-rarity
statistic is standing in for semantic relevance, and it has no defense against a rare word being rare for the
wrong reason.

## 4. What a fix would need

Candidate mechanism changes (not implemented, per constraint):

- **Down-weight scope MEMBER-name tokens relative to the file/type's OWN name.** Right now a method name
  (`setAllowedFields`) contributes at the identical `TOKW.name = 1` weight as the class's own name (core.mjs:2671
  vs. 2667). One incidental method out of 13 shouldn't out-vote the file's own identity. This is the most
  surgical candidate — it doesn't touch IDF or QSTOP, just which weight tier a token lands in.
- Alternative: scale a member-name token's contribution by how many DISTINCT members of the card carry it (a word
  used by 1 of 13 methods is weaker "aboutness" evidence than the file's own name, used by all of it) — more
  invasive, more surface area to regress.
- The `n`-based tie-break at equal score (core.mjs:2788) that buries `PetValidator.java` under its own tests on
  the single-word query is a separate, smaller fix (tie-break should not reward "more scopes" over "is the
  canonical implementation," e.g. prefer non-test files on a tie, or the file whose OWN name — not a member's —
  matched).

**Validation gap, stated plainly:** `where`'s ranking has no evaluation harness at all, labelled or otherwise.
`how` has one (`selftest --how`, §J2.3, docs/validation.md's "Match-by-example" section) because `how` answers
against real commits — the commit's own file list IS automatically-derived ground truth, no manual labelling
needed. `where` answers free-text intent against no comparably-derivable ground truth; grepped the repo
(`selftest`, `whereEval`, `tests/*.mjs`, docs/validation.md) and found no query→expected-file corpus, checked-in
or otherwise — only ad hoc "measured on X" comments narrating one-off manual checks during past development
(core.mjs's own header comments, e.g. line ~2662's express example). **Any ranking retune here is gated on first
building a labelled (repo, query, expected-card) corpus across several of the stress repos before it can be
evaluated as anything but eyeballing one query — which is exactly what the ticket's own constraint forbids doing
blind.** That corpus-building is separate, non-trivial work and changes who should own this fix and when: it is
not a same-day patch.

## 037 dependency — checked, not implicated

Read `whatCmd`'s `weakName` block (core.mjs:3227-3253) and its `qt.size >= 2` derivation, and the header comment
on the empty-vs-weak evidentiary asymmetry. That mechanism is `whatCmd`-only: it gates a *disclosure* about
declaration/value hits found via `coversQt`, and exists because `coversQt` degenerates for a single query token
into "any symbol containing this token" (birthday paradox). `whereCmd`'s scoring is a completely disjoint
pipeline — `buildCards` + a linear IDF-weighted token-overlap score over `toks` maps, no `coversQt`, no
`weakName`, no shared predicate or shared code path with `whatCmd`'s declaration matcher. The ranking-bug fix
scoped above (re-weighting `TOKW.name` for member-name tokens vs. file/type-name tokens, or the `n`-based
tie-break) touches neither `coversQt` nor `weakName` nor any single-token gate in `whatCmd`. **It does not
invalidate 037's ≥2-token derivation** — the two mechanisms share only the general theme "single/rare tokens are
weaker evidence," not any code, predicate, or module. The one `whereCmd`-side single-token observation in this
log (§2, the `n`-based tie-break burying `PetValidator.java` under its own tests on `where "validator"`) is a
separate, `where`-only tie-break defect, unrelated to `whatCmd`'s `weakName` gate.

---

# `where`'s evaluation harness — design, verdict, and the baseline 012 must move (`selftest --where`)

Written by the agent asked to decide whether an AUTOMATIC ground truth for `where` exists before building one.
The §4 conclusion above ("any ranking retune here is gated on first building a labelled corpus") is **overturned**:
an automatic ground truth does exist, it needs no hand-labelling, and it is now shipped as `grain selftest --where`.

## 1. The verdict on automatic ground truth: it exists, and it is the same substrate `how` already uses

`how` grades against a fact — a commit's own file list. The claim above was that free-text intent has no
comparable fact. It does. **A commit that ADDED a file is this repository's own recorded answer to the exact
question `where` asks.** The message says what was wanted; the file that resulted is where the answer landed and
what it looks like. Every such commit is one `(query, relevant file)` pair, labelled by the repository, at zero
labelling cost — and the label is not one person's opinion about where things *should* go, it is the recorded
decision about where this repository *does* put them.

That distinction disposes of the **survivorship objection** outright, and it is worth stating plainly because it
inverts the concern: grain is descriptive by constitution — "ask a repository about its own conventions", no
framework word lists, no external notion of good structure. `where` promises *"where do such things live"*, a fact
about this repository, never *"where should they live"*. Grading against where files actually landed is therefore
not a bias in the instrument; **it is the target the product itself declares.** A badly-structured repository
whose conventions are inconsistent lowers the achievable ceiling for every arm equally, and the baseline arm
absorbs exactly that — which is what a baseline is for.

The team lead's proposed variant (hide the added file, rebuild, ask where it goes) was examined and **rejected on
two independent grounds**. It costs a full `learn()` per candidate — `howEval` can hold a commit out by filtering
`fps`, but holding out a file means re-mining, ~100× per repository. And it saturates: petclinic is
package-by-feature, so `PetValidator.java`, `OwnerController.java` and `PetController.java` all live in one
directory — a placement-only metric scores 012's own failing query as a *hit*. Retrieval-without-holdout is
cheaper, sharper, and aligned with 012's own acceptance criterion ("`where` surfaces `PetValidator.java` in its
top hits"). It is retrieval, not prediction, and the harness says so.

## 2. Leakage, answered specifically

Deriving the query from the added file's own name is indeed the trap — but the trap is not that the *answer*
leaks (the file's location is never in the query). It is that the benchmark becomes **winnable by a trivial name
matcher**, which would reward a fix that only weights filenames harder. Three things control it, and none of them
is a query pre-processor (a harness that cleans the query measures a cleaner that does not ship):

1. **The query is the commit's own message tokens — `fp.toks`, byte-identical to what `howEval` feeds `how`.** Not
   the file's name. The two harnesses cannot drift on what an "intent" is. A side effect worth recording: because
   `fp.toks` are already stemmed, `whereCmd`'s exact-identifier pin (`qraw`, which forces score to 1 on a literal
   class name) almost never fires, so the single strongest leak channel is structurally mostly shut.
2. **A baseline arm that exploits the shortcut maximally**: every indexed path ranked by how many distinct query
   tokens its own path carries. If `where` cannot beat *that*, the card machinery is not earning its cost. (Content
   is deliberately not read, unlike `howEval`'s set-valued grep arm: ranking by content-token overlap ranks by
   file size, since a longer file contains more distinct words. That is an artifact, not a baseline.)
3. **A leak-free stratum**, reported beside the pooled numbers and never instead of them: the same scoring over
   only those candidates where NO born file's own name (`nameTokens`) shares a token with the query.

A stricter stratum — no query token anywhere in the truth *path*, directories included — was built and measured,
and it is **degenerate by construction**: a path-token ranker can never return a path containing none of the query
tokens, so the baseline scores exactly 0.00 on it in all 8 repositories (n=1–11). That is the honest bound: this
confound cannot be removed, only measured from both sides. It also settles which stratum to ship — the basename
one, which still leaves the baseline a real chance through directory names, and which does not quietly select
against well-organised repositories (a directory named for the concept is the convention working, not a leak).

## 3. The metric, and why not exact-match

Not exact-match: "where should this live" has several acceptable answers, so the metric is **rank-based**, over
`where`'s own ranked card list read to depth 10.

* **`hit@3`** — an answer that names the born file itself, within the product's own default `--top 3`.
* **`place@3`** — an answer that merely *contains* it: the directory card it sits under, or a role group / marker
  whose members include it (whose "carriers to copy" are then literally the new file's peers). `where` deliberately
  ranks a directory or group above a bare file (`rank()`, core.mjs), so scoring file cards alone would grade a
  design decision as a defect. The baseline gets the same generosity: a ranked path from the same directory.
* **`mrr`** — mean reciprocal rank to depth 10, so "just missed the cut" is distinguishable from "nowhere".
* `silent` counts candidates where `where` ranked nothing (a genuine no-match, or the concentration safeguard
  suppressing an untrustworthy top hit). Both still score 0, or the gate would be gameable by staying quiet on
  everything hard — the same rule `howEval` applies to its own no-match cases.

Truth is followed through later renames to the path the file carries at HEAD, and narrowed to `model.filesAll` —
a file grain never indexed has no card and no path either arm can rank, so grading it would measure the indexer,
not the ranking. Both arms are narrowed to that same universe (the mirror of `howEval` *widening* to `pathsAll`
for the same reason: neither arm may win or lose on index coverage). Birth comes from `H.lc`'s `newFile` flag,
which spans the whole history, so a file born in a bulk commit — never in `fps`, §J2.1's `megaCap` — is correctly
left out rather than mistaken for born at the first small commit that touches it. **Verified against `git show
--diff-filter=A` on five repositories: every one of the 296 derived births is a real add, and every apparent
mismatch was a rename correctly followed** (`ValidatorTest.java`→`ValidatorTests.java`,
`flask/config.py`→`src/flask/config.py`, `RequestValidationBehavior.cs`→`ValidationBehaviour.cs`).

No new tuned constant enters the product: `last` and the depth-10 read are evaluation parameters of the harness,
in the same category as `howEval`'s own `last = 100`, and nothing in `whereCmd`'s scoring was touched.

## 4. Baseline measurement — 8 repositories, 8 languages, engine 0.3.0

`grain selftest --where` (warm index; 0.3 s on petclinic to 2.1 s on axum, so this is a gate that can be run per
change, not a nightly job):

| repo | lang | n | silent | where hit@3 | base hit@3 | where MRR | base MRR | where place@3 | base place@3 |
|---|---|---|---|---|---|---|---|---|---|
| spring-petclinic | Java | 14 | 2 | 0.500 | 0.500 | 0.417 | 0.333 | 0.643 | 0.500 |
| flask | Python | 32 | 2 | 0.344 | 0.781 | 0.303 | 0.598 | 0.531 | 0.875 |
| express | JavaScript | 100 | 6 | 0.570 | 0.880 | 0.430 | 0.819 | 0.710 | 0.960 |
| gin | Go | 57 | 7 | 0.105 | 0.544 | 0.108 | 0.488 | 0.351 | 0.807 |
| CleanArchitecture | C# | 26 | 3 | 0.423 | 0.654 | 0.372 | 0.576 | 0.692 | 0.731 |
| Slim | PHP | 73 | 4 | 0.301 | 0.712 | 0.223 | 0.678 | 0.507 | 0.836 |
| sinatra | Ruby | 65 | 9 | 0.538 | 0.692 | 0.448 | 0.593 | 0.600 | 0.754 |
| axum | Rust | 100 | 13 | 0.380 | 0.700 | 0.294 | 0.578 | 0.530 | 0.730 |
| **median** | | | | **0.402** | **0.696** | **0.338** | **0.586** | **0.566** | **0.781** |

The same run, restricted to the leak-free stratum (the query does not contain the added file's own name):

| repo | unnamed n | where hit@3 | base hit@3 | where MRR | base MRR | where place@3 | base place@3 |
|---|---|---|---|---|---|---|---|
| spring-petclinic | 6 | 0.667 | 0.000 | 0.583 | 0.028 | 0.667 | 0.000 |
| flask | 10 | 0.300 | 0.400 | 0.233 | 0.250 | 0.500 | 0.700 |
| express | 39 | 0.462 | 0.795 | 0.333 | 0.739 | 0.641 | 0.923 |
| gin | 24 | 0.042 | 0.250 | 0.043 | 0.183 | 0.250 | 0.625 |
| CleanArchitecture | 7 | 0.286 | 0.286 | 0.119 | 0.250 | 0.571 | 0.429 |
| Slim | 14 | 0.071 | 0.143 | 0.045 | 0.107 | 0.571 | 0.357 |
| sinatra | 17 | 0.294 | 0.176 | 0.235 | 0.176 | 0.412 | 0.294 |
| axum | 50 | 0.360 | 0.480 | 0.262 | 0.300 | 0.580 | 0.520 |
| **median** | | **0.297** | **0.268** | **0.234** | **0.217** | **0.571** | **0.474** |

**Read honestly, three findings.**

**(a) Pooled, `where` loses to a trivial path-token ranker on every measure, in 7 of 8 repositories** (petclinic
ties on `hit@3` and wins the other two; it is also the smallest sample, n=14). The gap is large: median `hit@3`
0.402 vs 0.696, median MRR 0.338 vs 0.586. It survives the generous `place@3` reading (0.566 vs 0.781), so it is
not an artifact of grading a directory-first design on file cards. Silence explains little of it: even crediting
`where` with a hit on every `silent` candidate could raise gin's `hit@3` only from 0.105 to 0.120 and axum's from
0.380 to 0.437.

**(b) On the leak-free stratum the two arms are indistinguishable, with high variance.** `where` takes the median
on all three measures, but the baseline wins more head-to-heads on `hit@3` (5 of 8) and MRR (6 of 8), while
`where` wins `place@3` in 5 of 8. So: essentially all of the pooled gap in (a) is the name-matching shortcut, and
once it is removed, neither arm is ahead. That is the finding that keeps this harness from being a name-matching
benchmark — and the reason both strata must always be reported together. A fix that only weights filenames harder
would move (a) and leave (b) flat; a fix that improves ranking would move both.

**(c) The failure is ranking, not blindness — 012's diagnosis, at population scale.** Read to the FULL ranked card
list instead of depth 10, the born file appears somewhere in `where`'s ranking for **82–92% of candidates, at a
median rank of 2 to 8** (petclinic 11/14 @ 2 · flask 29/32 @ 5 · express 92/100 @ 3 · gin 45/57 @ 8 ·
CleanArchitecture 22/26 @ 4 · sinatra 52/65 @ 2 · axum 82/100 @ 4). The right card scores above zero and sits just
below the cut, almost every time. gin is the sharpest case and the same shape as `PetValidator`: for
«feat rend add bson protocol» → `render/bson.go`, the trivial ranker takes it at #1 while `where` puts it at #6.

## 5. What 012 should do with this

The block is lifted; a hand-labelled corpus is not needed and should not be built. Both candidate fixes in §4
above (down-weighting scope MEMBER-name tokens against the file/type's OWN name; the `n`-based tie-break) are now
falsifiable against numbers on 8 languages. **The number to move is the (c) gap: the born file is already in the
ranking — get it above the cut without breaking (b).** The pair to watch is `hit@3` *and* `place@3` on the
leak-free stratum: a fix that lifts pooled `hit@3` while leaving the leak-free stratum flat has bought nothing but
name matching. gin (0.105/0.351, worst) and express (n=100, best-powered) are the two repositories to judge on.
Deliberately not attempted here: retuning against a brand-new harness in the same breath is how a harness gets
shaped to bless one predetermined patch.

**Stated limitations, not hidden.** The candidate pool is bounded by "files added in non-bulk commits that survive
to HEAD" — 14 on petclinic, 26 on CleanArchitecture, so per-repository numbers there are noisy and only the
cross-repository pattern is worth reading. Commit messages carry furniture (`feat`, `test`, PR numbers) that a
user would never type; dropping numeric-only tokens was measured and moved gin's MRR by 0.006, so nothing is
stripped and the harness stays free of any preprocessing that does not ship. Files born before recorded history,
in bulk commits, or in a language with no shipped grammar are invisible to the instrument. And okhttp, the one
corpus repository whose clone has no readable history, correctly reports the "needs commit history" note rather
than a hollow zero.

## 6. Shipped

* `core.mjs` — `whereEval({ model, H, last })`, immediately after `howEval`, same shape and conventions; needs no
  filesystem access at all (path tokens only), so it takes no `root`.
* `grain.mjs` — `selftest --where [--last N] [--json]`, mirroring the `--how` branch including its
  no-history note; USAGE and the usage-error string updated.
* `tests/where-eval.test.mjs` — 10 tests over a purpose-built 8-commit fixture pinning the three properties of the
  truth derivation (bulk-commit births excluded, rename lineage followed to the HEAD path, deleted files never
  truth), the stratum split, the report shape, `--last`, the positional-argument refusal and the no-history path.
* `docs/reference.md` and `commands/selftest.md` — the command row and its description.
* No `MODEL_V` / `HIST_V` / `EXTR_V` bump: nothing persisted changes shape. Whether `ENGINE_VERSION` should move
  for a new CLI surface is a maintainer call — flagged, not applied. `docs/validation.md`'s "(N tests under engine
  0.3.0" count is now stale by this ticket's 10 tests; it is scoped by the version it names, and the file was left
  alone because other agents are editing it concurrently.

## 7. Follow-up: "the commit message leaks too" — tested three ways, and the premise does not hold

Raised mid-flight: a file-adding commit's message is usually "Add PetValidator", so the harness would grade
`where` on **exact-name recall**, which is not what 012 breaks on — and an instrument that cannot reproduce the
known bug is worse than none. The objection names the right hazard. It is also checkable rather than arguable, and
all three checks come back against it. **The query derivation is unchanged; here is why.**

### 7a. The acceptance condition, answered literally

The harness's own scoring predicates, run against the ticket's own query with `PetValidator.java` as truth:

```
«add a validator for a new form field»   1.OwnerController 2.VisitController 3.[group]GetMapping+form+init
                                          4.PetController 5.PetValidator (0.315)
                                          → hit@3 FAIL · place@3 FAIL
«add validation for a new pet field»      → hit rank 9 · hit@3 FAIL · place@3 FAIL
«validator for pet»                       → hit rank 3 · hit@3 PASS · place@3 PASS
```

The instrument scores 012's failing query as a **total failure on both metrics** — including `place@3`, because
`PetValidator` is role `-1` and the group that ranks third does not contain it — and scores the rephrasing §2
showed to work as a pass. It discriminates exactly the case the ticket is about, in the right direction. (Stated
precisely: that query is not itself a candidate — `PetValidator.java` predates the recorded footprints — so this
is the harness's *scoring frame* applied to it, not a row in the corpus. The population contains the same shape in
quantity; see 7b.)

### 7b. The refutation: the named half is the WORST half, not a green one

Splitting the same 8-repository run the other way — candidates where the message DOES contain the added file's own
name, i.e. precisely the "exact-name recall" the objection predicts would look green:

| repo | named n | where hit@3 | base hit@3 | where MRR | base MRR |
|---|---|---|---|---|---|
| spring-petclinic | 8 | 0.375 | 0.875 | 0.292 | 0.562 |
| flask | 22 | 0.364 | 0.955 | 0.334 | 0.756 |
| express | 61 | 0.639 | 0.934 | 0.492 | 0.871 |
| gin | 33 | 0.152 | 0.758 | 0.155 | 0.711 |
| CleanArchitecture | 19 | 0.474 | 0.789 | 0.465 | 0.696 |
| Slim | 59 | 0.356 | 0.847 | 0.266 | 0.814 |
| sinatra | 48 | 0.625 | 0.875 | 0.523 | 0.740 |
| axum | 50 | 0.400 | 0.920 | 0.326 | 0.855 |
| **median** | | **0.388** | **0.875** | **0.330** | **0.748** |

**`where` puts the file in the top 3 in 39% of the cases where the query literally contains that file's own
name** — against 88% for a path matcher. Exact-name recall is not saturated; it is the *worst-performing*
stratum and carries the largest gap to the baseline (0.487) in the whole measurement. Compare the leak-free half,
where `where` is narrowly ahead (0.297 vs 0.268): **the objection's prediction is exactly inverted by the data.**

The mechanism is 012's own, which is why this should be expected rather than surprising. A message that names its
file is a message with *more words* — the name plus the surrounding intent. Those surrounding words are precisely
the incidental-collision fodder §2 documents: more query mass for IDF to land on rare-for-the-wrong-reason tokens
elsewhere in the repository. Naming the file does not shorten the query to the name; it lengthens it, and every
added word is another chance for `setAllowedFields` to win. So this is a second, previously unmeasured face of the
same defect, not a different one — and it is a much larger effect than the single-query symptom suggested.

### 7c. Sensitivity: does the instrument respond to the lever §4 names?

The strongest form of the acceptance condition is not "does it see failures" but "can it tell this fix from no
fix". Probe run once and **reverted immediately** (§4's most surgical candidate: file-card member-name tokens
dropped from `TOKW.name` to the existing `TOKW.fact` tier — an existing weight, no new constant). Medians over the
same 8 repositories, and the reverted engine re-measured byte-identical to the pre-probe baseline:

| stratum | hit@3 | MRR | place@3 |
|---|---|---|---|
| pooled | +0.029 | +0.017 | +0.089 |
| named | **+0.099** | **+0.076** | **+0.124** |
| unnamed | +0.000 | −0.026 | −0.016 |

The instrument moves, so it can judge the fix. And it says something the pooled number alone would have hidden:
**the entire gain is in the named stratum, and the leak-free stratum is flat to slightly negative.** Read only the
pooled `+0.029` and that lever looks like a modest win worth shipping; read the split and it is a name-matching
improvement that buys nothing where names cannot help. On 012's own query it moves `PetValidator.java` from rank 5
to rank 4 — still outside `top:3`, still a FAIL. That is the stratification doing the exact job it was built for,
and it is the reason both strata must always be reported together. **No recommendation is made here on whether to
adopt that change; this was an instrument-validity measurement and the tree is back to HEAD's behaviour.**

### 7d. The escape hatches, and one that has not been named

- **LLM paraphrase of the diff** — rejected. `docs/validation.md`'s opening standard is that every number comes
  from a run that can be repeated; a generated corpus is not re-derivable by a user on their own repository and
  would make `where`'s gate un-runnable offline, which is the property that makes `selftest --how` credible. A
  frozen, checked-in corpus generated once would be honest if labelled as such, but it is then a fixed benchmark
  of twelve public repositories, not a gate anyone can run on their own code — a different artifact with a
  different claim, and not a substitute for this one.
- **Issue/PR text** — rejected. Not in the git objects, availability varies by repository, and it would make the
  harness network-dependent.
- **Deterministic token subtraction** (the option not named upstream: keep the candidate, but strip from the query
  every token appearing in the born file's own path — reproducible, offline, git-only, and non-leaking by
  construction). **Built and measured; rejected on the numbers.** It is the strict stratum of §2 in subtractive
  form, and it degenerates the same way: the surviving query is the residue after its head noun is removed
  ("Add PetValidator for pet form validation" → `{add, form}`), the baseline scores exactly 0.00 because a
  path-token ranker cannot return a path containing none of the query's tokens, and the candidate pool collapses
  to n=1–11 per repository. A harness with no baseline and single-digit n is not an instrument.

So the honest position: the leak cannot be removed by any reproducible derivation, only bounded and measured —
which is what the two strata plus the baseline arm do, and what 7b shows is sufficient to expose the defect rather
than hide it. Had 7b come back the other way, the right report would have been "this cannot be automated"; it did
not, and reporting it as one would have been the convenient conclusion, not the true one.

## 2026-09-02 03:25 — Track-2 result: fix/where-named (94a8bc9) lifts the NAMED stratum +0.184 hit@3 with the leak-free guard also up; decision where-named-volume-normalisation. Symbol-first lever unmeasurable on the harness → ticket 071. Leak-free remains a coverage boundary (decision where-leak-free-is-a-coverage-boundary).
