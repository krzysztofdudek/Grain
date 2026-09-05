# The law loop, measured: can a mined rule reproduce a hand-written one in VERDICT?

**Question.** 093 measured what grain's model already HOLDS of a hand-written `.yggdrasil/`. 094 measured what
grain can WRITE. This measures the only thing that decides whether the law loop is worth building: do the rules
grain renders from mined practice **refuse the same things** the rules a maintainer wrote by hand refuse — with
a hold-out by time, so the rule and the drill are never the same data twice.

**The two bars were written before the run** (`law-loop-is-the-bet`, ticket 097):

1. at least **10 of the 20 "miner-miss" hand rules reproduced in verdict**;
2. **precision ≥ 0.80** on classes (a)+(b) of a 20-candidate sample, once the maintainer classifies it.

**Answer, in one line. Bar 1 FAILS, and not narrowly: 2 of 20.** On Yggdrasil, cut at 70% of its history
(`2591a3ad`, 470 commits held out), grain renders **49 executable candidate rules** from the at-cut export, cuts
**21 held-out corpora / 182 cases with hold-out integrity 21/21 = 1.000**, and reproduces **9 of the 45 drillable
hand rules in verdict — but only 2 of the 20 miner-miss target set**, against a bar of 10 and a corpus-imposed
ceiling of 15. Worse, when the reproducing candidate is additionally required to *govern any of the same files*,
**53 of the 55 reproducing (hand rule, candidate) pairs have a scope overlap of exactly zero files**: the
agreement is an accident of three- and four-case corpora, not a rule that means the same thing. The
"template as shape check" bet loses too — 40 superposition checks reach **1 of the 20 no-identifier rules** and
raise false alarms from 690 to 1701 on the same corpora.

**Bar 2 is not decided here by construction**: the 20-candidate sample is prepared with its evidence in §7 and
the maintainer classifies it. Its input pool is honest but small.

**This is a "not doing it, with numbers" result for B1 as specified.** §9 says which part of it is still worth
keeping, and it is not nothing: the hold-out machinery, the provenance record, and the `errs: under` finding.

---

## 1. Method

**The instrument.** `plugins/grain/tests/stress/law-loop.mjs` (848 lines), guarded by
`plugins/grain/tests/law-loop.test.mjs` (14 tests, on a real synthetic git repository with a planted rule and a
real cut). It reuses `propose.mjs` (094) for the renderer and the lattice, and `reconstruct.mjs` (093) for graph
reading, `when`/`mapping` expansion and the aspect-literal matcher. **Zero changes under `plugins/grain/engine/`.**
`/home/user/Yggdrasil` was read-only throughout: every clone, stage, corpus and `.grain/` cache was written under
a scratch directory, and the repository ends the run with `git status --short` empty and no `.grain/`.

**The cut.** `2591a3ad` (2026-06-19) — **commit 1094 of 1564** in chronological order, 69.9% of history.
**470 commits are held out.** The cut is a COMMIT, not a date, and the hold-out test is
`git merge-base --is-ancestor`, not a date comparison: Yggdrasil lands several commits a day, and a date test
puts every same-day commit on the wrong side. The guard test plants exactly that case and fails without it.

At the cut the repository has **1637 tracked files**; at HEAD (`5cca6b1`, 2026-09-01) it has **3019**. It nearly
doubled inside the held-out window, and §8 prices that.

**The pipeline, with wall times.**

| step | what runs | wall |
|---|---|---|
| clone at the cut, refs pruned so no post-cut commit is reachable | `git clone` + `checkout -B main <cut>` | < 1 s |
| `grain export` on the at-cut clone (the only thing the miner sees) | 9 597 blobs, 1 637 files, 8 partitions, **57 conventions** | **138 s** |
| `grain export` on the HEAD clone (used ONLY to label held-out cases) | 14 835 blobs, 2 290 files, 19 partitions, **149 conventions** | **~290 s** |
| render candidates from the at-cut export | `propose.mjs --subgate-per-partition 100000` | **9.5 s** |
| held-out corpora + provenance + I10 | `law-loop.mjs` | ~40 s |
| hand baseline: each hand rule on its own corpus | 45 `yg drill` | ~30 s |
| verdict reproduction: 89 candidates × 45 hand corpora = 4005 pairs | **89** merged-corpus `yg drill` | ~4 min |
| held-out sweep of the candidates | 21 `yg drill` | ~30 s |
| replay | 49 `yg simulate --max-commits 12`, 3 at a time | ~7 min (the whole run is **664.8 s**) |
| the degenerate control: fill every hand rule's verdict at HEAD | `yg check --approve --only-deterministic`, 3939 pairs, 0 reviewer calls | ~6 min |

A first version ran the verdict leg as one CLI call per (candidate, hand rule) pair. Measured at 2112 drill
results in 17 minutes it projected to **three hours**; merging the 45 hand corpora into one directory whose case
labels carry the owning rule (`violates-<hand slug>__<case>`) makes it **89 calls instead of 4005** with
identical arithmetic. That is why the run is minutes.

### 1.1 What "reproduced in verdict" means, and why it is NOT measured on the HEAD tree

The obvious comparison — run the hand check and the candidate check over the hand rule's attach set at HEAD and
compare refused sets — is **degenerate on this repository, and that is measured, not argued**. Filling every
deterministic verdict at HEAD (`yg check --approve --only-deterministic`, free and keyless) returns
**3939 of 3939 pairs satisfied**: every one of the 57 hand deterministic rules refuses **nothing** at HEAD.
Yggdrasil's own gate runs `yg check` on every commit, so of course it does. On that comparison every candidate
"agrees" with every hand rule, on the empty set. (The only error the fill reports is one unmapped file,
`.grain/.gitignore` — this instrument's own cache in the clone, not a fact about the repository.)

So the instrument scores where the maintainer has *already written down the answer*: each hand rule's own
**drill corpus**, a directory whose `violates-` / `satisfies-` prefixes are the maintainer's own verdicts.

> A candidate **reproduces a hand rule in verdict** when, drilled over that hand rule's own corpus, it refuses
> every `violates-` case and no `satisfies-` case — the same refused set on the same units — and the corpus has
> at least one `violates-` case. Agreeing on an empty refused set does not count, and the guard test asserts
> that it cannot.

**The ceiling this puts on bar 1, stated before the result.** 45 of the 57 deterministic hand aspects ship a
corpus with at least one `violates-` case. Of the **20 miner-miss rules, 15 are drillable**; five ship no corpus
at all (`instrument-import-fence`, `no-buildissuemessage-in-engine`, `portal/count-parity-via-reuse`,
`rules-artifact-names-single-source`, `runcheck-injected-input-parity`). The bar of 10/20 is therefore a bar of
**10 out of a reachable 15**.

All 45 hand rules pass their own corpus (**45/45, 0 MISS, 0 FALSE-ALARM**), so every failure below belongs to the
candidate and never to a broken oracle.

### 1.2 The hold-out, and invariant I10

Each rendered candidate gets a corpus cut from the **post-cut tree**:

1. expand the candidate's own `scope.files` predicate against HEAD's `git ls-files`;
2. keep only files whose git **first appearance** is a commit that is **not an ancestor of the cut**;
3. label each survivor from the **later measurement** — the HEAD export's `conformingSites`/`deviatingSites` for
   the same rule, or the HEAD sub-gate lattice's deviant list — **never from the candidate's own check**;
4. write `drills/{satisfies-*,violates-*}/…`, a `CORPUS.md` naming the cut sha, and `provenance.json`.

`provenance.json` carries `{aspectId, conventionId, origin, enumeratorClass, identifier, expected, partition,
share, n, deviating, asOf, cutSha, cutDate, reviewer}` — the record counsel-2 §2.3 asks of every generated rule
and the proposed meta-law would refuse one for lacking.

**I10 — hold-out integrity — is verified against git after the corpora are on disk, not asserted:**

| | |
|---|---|
| rendered candidates | 49 |
| candidates that found an independent later label | **21** |
| corpora with ≥ 1 case | **21** |
| cases | **182** |
| corpora whose every case post-dates the cut | **21 / 21** |
| **I10** | **1.000** (0 leaked cases) |

The 28 candidates with no corpus are the second finding of this section: **for more than half the rules grain
rendered at the cut, the practice they describe no longer exists as a certified convention or a sub-gate row at
HEAD**, so there is no independent later label to score them against. A rule mined on 70% of a repository's
history had, in the remaining 30%, stopped being a fact about that repository.

**What a held-out drill of a grain-rendered rule can and cannot show.** The label comes from grain's own later
measurement, so a passing case is evidence the **rendered template still reads the tree the way grain counted
it, on code the miner never saw** — template fidelity under distribution shift. It is NOT evidence that the rule
is a good rule. The rule's worth is measured against the hand law (§2), by replay (§5), and by the maintainer's
sample (§7). Stated because a drill number is easy to over-read.

### 1.3 Floors, named

Per `instrument-floors-allowed-if-stated-and-measured`:

| floor | value | what it costs, measured |
|---|---|---|
| `CASES_PER_SIDE` | 5 | the cap propose.mjs's own drill cutter already uses; bounds corpus size, not what is measured |
| `MIN_CASES` | 1 | a corpus with no case is reported absent, never drilled, never counted as a pass |
| `SUBGATE_PER_PARTITION` | **lifted** | **measured: 14 rendered candidates at the default 6, 49 with the cap lifted — the cap suppresses 35 of 49, 71%.** It is a READING cap (how much a maintainer is asked to look at) that was silently also a MEASUREMENT cap. `propose.mjs` now takes `--subgate-per-partition`; this run used it and says so. |

No threshold decides any verdict here: every gate is a contract (0 MISS / 0 FALSE-ALARM) or a count.

---

## 2. Verdict reproduction — the headline

| | count |
|---|---|
| deterministic hand aspects | 57 |
| — with a drillable corpus (≥ 1 `violates-` case) | **45** |
| hand rules passing their own corpus | 45 / 45 |
| candidates drilled against them | **89** (49 rendered + 40 superposition shape checks) |
| (candidate, hand rule) pairs | 4005 |
| hand rules reproduced in verdict by ≥ 1 candidate | **9 / 45** |

By 093's classification of the same 57 rules:

| class of hand rule | drillable | reproduced | which |
|---|---|---|---|
| **(a) miner miss** — the identifier is in the attach set, nothing in grain names it | 15 of 20 | **2** | `no-direct-fs`, `portal/no-node-imports-in-frontend` |
| (c) invisible by construction — the rule forbids an absence | 5 of 6 | 2 | `portal/no-network-egress`, `schema-bump-bookkeeping` |
| unmeasurable — the rule names no identifier at all | 14 of 20 | 3 | `e2e-public-surface`, `read-or-default-via-helper`, `source-no-raw-control-chars` |
| matched — grain's model already names the identifier | 11 of 11 | 2 | `atomic-write-contract`, `single-source-graph-queries` |

**Bar 1: 2 of 20. The bar was 10. It fails by a factor of five, and 15 was the ceiling.**

### 2.1 The 20 miner-miss rules, one row each

`bestJ` is the highest Jaccard between the candidate's refused set and the hand rule's, over all 89 candidates.

| hand rule | reproduced | bestJ | by |
|---|---|---|---|
| `instrument-import-fence` | — | — | no corpus (not drillable) |
| `no-buildissuemessage-in-engine` | — | — | no corpus |
| **`no-direct-fs`** | **YES** | 1.00 | `grain/source-cli-tests-unit/candidate-auto-imp-node-fs-promises` |
| `no-direct-minimatch` | no | 0.50 | `grain/source-cli-tests-e2e/partition-imp-node-path` |
| `no-nondeterminism-direct` | no | 0.67 | `grain-shape/source-cli-tests-e2e/cfg-path-superposition` |
| `no-shell-injection` | no | 0.60 | `grain-shape/source-cli-tests-e2e/reviewer-point-superposition` |
| `portal/approve-shells-cli-only` | no | 0.67 | `grain/source-cli-tests-e2e/candidate-auto-nameshape` |
| `portal/count-parity-via-reuse` | — | — | no corpus |
| `portal/every-spec-uses-playwright-chromium` | no | 0.50 | `grain/source-cli-tests-e2e/partition-filenameshape` |
| `portal/loadgraph-nosecrets-flag` | no | 0.50 | `grain/source-cli-tests-e2e/candidate-auto-imp-string` |
| `portal/loopback-only` | no | 0.50 | `grain/source-cli-tests-e2e/candidate-auto-imp-string` |
| `portal/no-lock-writer-import` | no | 0.50 | `grain/source-cli-tests-e2e/candidate-auto-imp-string` |
| **`portal/no-node-imports-in-frontend`** | **YES** | 1.00 | `grain/source-cli-tests-unit/candidate-auto-imp-node-fs` |
| `posix-paths-source` | no | 0.50 | `grain/source-cli-tests-e2e/candidate-auto-imp-string` |
| `progressive-tier-partition` | no | 0.56 | `grain/source-cli-tests-fixtures/candidate-auto-filenameshape` |
| `provider-redaction` | no | 0.67 | `grain/source-cli-tests-e2e/candidate-auto-imp-string` |
| `repo-check-gate-steps` | no | 0.50 | `grain/source-cli-src/partition-lex-quote` |
| `rules-artifact-names-single-source` | — | — | no corpus |
| `runcheck-injected-input-parity` | — | — | no corpus |
| `top-level-error-handler` | no | 0.50 | `grain/source-cli-tests-e2e/partition-filenameshape` |

### 2.2 The reproductions do not survive one more honest question

A rule that refuses the same three files as another rule is not the same rule unless it also *speaks about the
same files*. Expanding every reproducing candidate's `scope.files` against HEAD and intersecting it with the hand
rule's real attach set (types' `when` plus nodes' subtree cascade, Yggdrasil's own semantics):

| hand rule reproduced | best reproducing candidate | hand attach | candidate scope | files in common |
|---|---|---|---|---|
| `atomic-write-contract` | `…tests-unit/candidate-auto-imp-node-fs-promises` | 19 | 346 | **0** |
| `e2e-public-surface` | `…src/candidate-auto-returns-promise` | 146 | 347 | **0** |
| `no-direct-fs` | `…tests-unit/candidate-auto-imp-node-fs-promises` | 135 | 346 | **0** |
| `portal/no-network-egress` | `grain-shape/…/cfg-path-superposition` | 82 | 0 | **0** |
| `portal/no-node-imports-in-frontend` | `…tests-unit/candidate-auto-imp-node-fs` | 2 | 346 | **0** |
| `read-or-default-via-helper` | `grain-shape/…/aspect-verify-superposition` | 42 | 0 | **0** |
| `schema-bump-bookkeeping` | `…tests-e2e/candidate-auto-imp-string` | 3 | 133 | **0** |
| `single-source-graph-queries` | `grain-shape/…/group-superposition` | 82 | 0 | **0** |
| `source-no-raw-control-chars` | `…tests-unit/candidate-auto-filenameshape` | 959 | 346 | **346** |

**53 of the 55 reproducing (hand rule, candidate) pairs have zero files in common with the rule they reproduce.**
`no-direct-fs` — "code under `source/cli/src` must not import `node:fs` directly" — is "reproduced" by
"test files under `source/cli/tests/unit` do not import `node:fs/promises`": both are negative import rules, the
corpus has three cases, and they happen to agree on all three. The one pair with real overlap
(`source-no-raw-control-chars`, a no-identifier rule, reproduced by a file-NAME-shape rule) is not a semantic
match either.

**Read strictly — the candidate must both agree in verdict and govern some of the same code — the number for
bar 1 is 0 of 20.** Read as specified in the ticket it is 2 of 20. Both are far below 10, and the strict reading
is the one a maintainer would care about.

### 2.3 `errs: under` holds inside a rule's own scope and NOT outside it

094 measured 0 FALSE-ALARM across 237 drill cases on grain's own corpora and called `errs: under` a contract the
templates keep. Run the same 49 rendered checks over 45 **foreign** corpora and the picture changes:

| candidates | pass | MISS | FALSE-ALARM |
|---|---|---|---|
| 49 rendered checks × 45 hand corpora | 3892 | 3356 | **690** |
| 40 superposition shape checks × 45 hand corpora | 3207 | 1572 | **1701** |

**24 of the 49 rendered checks raise at least one false alarm** once they are pointed at files their `scope`
predicate excludes; the file-name-shape templates lead (80, 61, 61). This is not a defect in the templates —
Yggdrasil never runs a check outside its scope — but it does mean the `errs: under` claim is a claim about a
rule **inside its own scope**, and the 094 sentence should be read that way. On the candidates' own held-out
corpora (§4) the contract very nearly holds: **1 false alarm in 182 cases**.

---

## 3. The bet: a superposition template as a deterministic shape check

The bet (097 addendum item 4): the 20 hand rules that name no identifier cannot be reached by matching names,
but the export's role-group **superposition** (`profile.req` — the node types every member of the group holds in
common, with counts) is a SHAPE. Rendered as a check, it says: *every declaration of this kind in scope must
contain at least these node types, at least this many times.*

`renderShapeCheck` drops `id:<Name>` entries (those are names, not shape) and the skeleton's own root type, and
refuses to render a skeleton that asserts nothing beyond its root. On the at-cut export it produced **40 shape
checks from 101 role groups**.

| | |
|---|---|
| shape checks rendered | **40** |
| hand rules reproduced in verdict by a shape check | 4 |
| — of the **20 no-identifier** rules the bet targets | **1** (`read-or-default-via-helper`) |
| — of the 20 miner-miss rules | **0** |
| false alarms over the hand corpora | **1701** (vs 690 for the rendered name-based checks) |
| files in common between a reproducing shape check's scope and its hand rule | **0** |

**The bet loses, and it loses in the direction 094 predicted.** A role group is a set of SCOPES; a deterministic
check's unit is the FILE. A shape check therefore refuses a file for every declaration that is not a member of
the group, and it does so more than twice as often as the name-based templates. The one no-identifier rule it
reaches, it reaches with zero scope overlap.

The honest form of the conclusion: **a shape can be rendered, and it runs — but at file granularity the
superposition asserts something much broader than the group it came from, so it does not move a rule about shape
into reach.** The 20 no-identifier rules stay outside what mining can propose. `nameshape` and `filenameshape`
already work because their subject really is the whole file; the superposition's subject is not.

---

## 4. The held-out sweep — does a rendered check survive code the miner never saw?

21 corpora, every case a file born after `2591a3ad`, labelled by the HEAD measurement:

| | cases | pass | MISS | FALSE-ALARM | unrun | unsupported |
|---|---|---|---|---|---|---|
| held-out (cut sha `2591a3ad`) | **182** | **156** | **25** | **1** | 0 | 0 |

Compare 094's no-hold-out sweep on the same renderer: 237 cases, 208 pass, 29 MISS, 0 FALSE-ALARM. Held out, the
MISS rate is comparable (25/182 = 13.7% vs 29/237 = 12.2%) and **one** false alarm appears
(`grain/source-cli-tests-integration/candidate-auto-call-loadgraph`, on a file born after the cut). For an
`errs: under` rule MISS is the permitted direction, so the contract survives the hold-out almost intact —
**this is the one number in the report that comes out in the loop's favour**, and it is a statement about the
templates, not about the rules (§1.2).

---

## 5. Replay

`yg simulate <candidate> --node <n>` over the **12 most recent commits**, every one of them post-cut. Two arms,
because the first one does not work and that is itself the finding.

**Arm A — the candidate inside the proposal.** `yg simulate` resolves `--node` in the graph **committed at each
replayed commit**. A proposed node id has never existed in the pattern repo's history, so every commit comes back
`non-comparable`:

```
yg simulate grain/source-cli-src/candidate-auto-imp-node-path --node source/cli/src --max-commits 15
  ...  non-comparable   ↳ Node 'source/cli/src' not found.       (× 15)
Replayed 15 commits: ran-clean 0 · violations 0 · non-comparable 15
```

**A rule mined from a repository with no graph cannot be replayed at all.** On a brownfield adopter — the
`north-star-brownfield-miner` consumer this whole line of work is for — `simulate` is `non-comparable`
everywhere by construction, exactly as the counsel memo predicted, and the replay has to be Grain-side.
(The instrument's automated control arm is weaker than this manual one: it picked the proposal's first node,
`docs`, which happens to also exist in Yggdrasil's own graph, so it reported 0 non-comparable. The manual run
above, on a node id only the proposal has, is the honest control.)

**Arm B — the candidate overlaid on Yggdrasil's OWN graph, naming a real node.** This is the only configuration
in which a mined rule replays, and it needs a hand-written graph to borrow node ids from:

| | |
|---|---|
| candidates replayed | **49** |
| window | 12 commits, all post-cut |
| commit-runs | 588 (49 × 12) · `ran-clean` **504** · `non-comparable` **0** |
| candidates that caught anything | **7 of 49** |
| total catches | **1798** |
| survivorship caveat printed by the tool | yes, on every run |

**The catch count is not a good number, it is a loud one.** Two candidates account for 1522 of the 1798:
`grain/yggdrasil-aspects/candidate-auto-call-node-childforfieldname` (870) and `…/candidate-auto-call-report`
(652), both replayed on `graph-rules` at a scope Jaccard of 0.107 — a rule mined over `.yggdrasil/aspects` fired
on every rule script at every commit. The next three are file-name-shape and quote rules on
`cli/tests/fixtures` (168, 72) at Jaccard 1.00. **42 of the 49 candidates caught nothing at all across the
window.** Read against the loop's own ladder — "a candidate with no historical catch stays draft" — the replay
would leave 42 of 49 as drafts and promote the 7 loudest, which is the opposite of the selection a maintainer
wants.

---

## 6. Retirement — and a correction to counsel-2 §2.7

counsel-2 §2.7 says a GENERATED deterministic rule cannot be retired from `yg aspects --health`, because
deterministic catch/exposure never reaches the committed record. **Measured on this clone, that is half right,
and the half it gets wrong matters.**

| state of the working copy | deterministic rows carrying catch/exposure | rules labelled `decorative?` |
|---|---|---|
| fresh checkout (the committed state) | **0 of 57** — every row reads `—` | **3**, all of them LLM |
| after one free local `yg check --approve --only-deterministic` (3939 pairs, 0 reviewer calls) | **57 of 57** | **24** (21 deterministic + the same 3 LLM) |

So the health signal for a deterministic rule **does** exist — it costs one keyless local fill — but the
deterministic lock is gitignored, so the record is **per-machine and per-working-copy**, not committed and not
shared. counsel-2's conclusion survives for anything that has to be agreed between machines; its premise ("the
record does not exist") does not.

**The addendum's question — for the three `decorative?` rules `yg advise` names, does an auto-cut drill exist and
catch?**

| decorative? rule | kind | catch / exposure | in-repo drill cases | best auto-cut drill grain can offer |
|---|---|---|---|---|
| `portal/honest-state-never-collapsed` | llm | 0 / 30 | 2 | J = 0.000 — **none** |
| `provider-redaction-cascade` | llm | 0 / 114 | 2 | J = 0.000 — **none** |
| `silent-missing-files` | llm | 0 / 156 | 4 | J = 0.000 — **none** |

**No auto-cut drill exists for any of the three.** All three are LLM/prose rules; grain renders their kind as
prose, not as a `check.mjs`, so there is nothing free to drill, and drilling their own in-repo corpora would
BILL a reviewer — not done, and not something an automatic loop may do. The retirement half of B1 does not
reach the rules it was designed for.

Among the 21 deterministic rules that read `decorative?` after the local fill, **7 have a candidate whose scope
overlaps their attach set and that carries a held-out corpus** — the beginning of an auto-cut drill:
`e2e-public-surface` (J 0.911), `self-contained-references` (0.615), `source-no-raw-control-chars` (0.361),
and four more at 0.187. Only the first is tight enough to be worth a maintainer's minute, and §2.2 already says
what its candidate actually asserts.

---

## 7. The 20-candidate sample, for the maintainer

**Eleven** candidates survive their own held-out drill with **0 FALSE-ALARM** and have no hand counterpart.
Fewer than twenty, so the remaining nine rows are rendered candidates with **no held-out corpus**, labelled as
such with the reason — hiding the shortfall by shrinking the sample would hide the finding. `class` is blank:
the maintainer fills it with (a) miner miss, (b) graph debt, or (c) undecidable
(`oracle-is-fallible-report-disagreements-symmetrically`). Every row's corpus and `provenance.json` are on disk
under `<out>/corpora/` and `<out>/provenance/`.

| # | candidate rule | share | n / dev | scope @HEAD | born after cut | held-out cases | pass / MISS / FA | (a)/(b)/(c) |
|---|---|---|---|---|---|---|---|---|
| 1 | `tests/integration`: quote strings with **single quotes** | 1.000 | 23 / 0 | 68 | 31 | 5 | 5 / 0 / 0 | |
| 2 | `tests/e2e`: method names follow **`a(Ua)+`** | 0.815 | 502 / 114 | 133 | 53 | 10 | 10 / 0 / 0 | |
| 3 | `tests/unit`: do **not import `node:url`** | 0.799 | 179 / 45 | 346 | 123 | 10 | 10 / 0 / 0 | |
| 4 | `tests/unit`: do **not import `src/model/graph`** | 0.763 | 171 / 53 | 346 | 123 | 10 | 5 / 5 / 0 | |
| 5 | `tests/integration`: method names follow **`a(Ua)+`** | 0.758 | 47 / 15 | 68 | 31 | 10 | 9 / 1 / 0 | |
| 6 | `tests/e2e`: do **not call `copyFixture`** | 0.752 | 683 / 225 | 133 | 53 | 10 | 10 / 0 / 0 | |
| 7 | `tests/integration`: do **not import `src/relations/extractors/registry`** | 0.730 | 27 / 10 | 68 | 31 | 8 | 5 / 3 / 0 | |
| 8 | `tests/integration`: do **not import `src/relations/resolve-path`** | 0.730 | 27 / 10 | 68 | 31 | 8 | 5 / 3 / 0 | |
| 9 | `tests/e2e`: do **not import `l`** | 0.716 | 58 / 23 | 133 | 53 | 10 | 5 / 5 / 0 | |
| 10 | `tests/integration`: do **not import `src/relations/pass`** | 0.703 | 26 / 11 | 68 | 31 | 9 | 5 / 4 / 0 | |
| 11 | `tests/e2e`: do **not import `line`** | 0.679 | 55 / 26 | 133 | 53 | 8 | 5 / 3 / 0 | |
| 12 | `src`: quote strings with **single quotes** | 1.000 | 109 / 0 | 347 | 146 | — | no corpus¹ | |
| 13 | `src`: type names follow **`(Ua)+`** | 1.000 | 103 / 0 | 347 | 146 | — | no corpus¹ | |
| 14 | `tests/e2e`: quote strings with **single quotes** | 1.000 | 48 / 0 | 133 | 53 | — | no corpus¹ | |
| 15 | `tests/unit`: quote strings with **single quotes** | 1.000 | 119 / 0 | 346 | 123 | — | no corpus¹ | |
| 16 | `src`: indent with **2 spaces** | 0.964 | 110 / 6 | 347 | 146 | — | no corpus¹ | |
| 17 | `tests/fixtures`: do **not call `violations.push`** | 0.800 | 20 / 5 | 578 | 475 | — | no corpus¹ | |
| 18 | `tests/unit`: do **not call `rmSync`** | 0.800 | 8 / 2 | 346 | 123 | — | no corpus¹ | |
| 19 | `tests/integration`: do **not call `it`** | 0.796 | 152 / 39 | 68 | 31 | — | no corpus¹ | |
| 20 | `src`: do **not import `src/utils/posix`** | 0.794 | 162 / 42 | 347 | 146 | — | no corpus¹ | |

¹ *no held-out corpus: the rule has no counterpart in the later (HEAD) measurement, so no independent label
exists for a post-cut file. That is a fact about the rule — the practice it describes did not survive the
held-out window — as much as about the instrument.*

**What the instrument will NOT say about this table, and the maintainer must.** Rows 3, 4, 7, 8, 9, 10, 11 and
20 are all of the shape "files in X do not import Y" at a share between 0.68 and 0.80 — that is what a sub-gate
row looks like when a module is simply used by a minority of files, and several of them (`l`, `line`) name
identifiers that are not modules at all. Rows 1, 12, 14, 15, 16 are lexical house style. Rows 2, 5, 13 are name
shapes. Whether any of these is a RULE — something a maintainer would want refused — is precisely the judgement
this report is forbidden to make.

---

## 8. Confounds

1. **Yggdrasil's own gate.** The repository is green against its own rules at every commit — measured here as
   3939 of 3939 deterministic pairs satisfied at HEAD. That is why the verdict comparison had to move to the
   drill corpora, and it is why no "refused set on the working tree" number appears anywhere in this report.
2. **The cut leaves far less to mine.** At `2591a3ad` grain certifies **57 conventions across 8 partitions**;
   at HEAD it certifies **149 across 19**. The at-cut export is 38% of the HEAD export by convention count and
   the repository is 54% of its HEAD size. A cut at 70% of history is not a cut at 70% of the evidence.
3. **The reading cap was also a measurement cap.** At the shipped `SUBGATE_PER_PARTITION = 6` this run would
   have had 14 candidates instead of 49 and the headline would have been even lower — for a reason with nothing
   to do with mining. Measured and disclosed here; `propose.mjs` now exposes the override.
4. **Corpora are small.** The 45 hand corpora hold 162 case directories between them — a median of three cases
   per rule. Verdict equality on three cases is cheap, which is exactly why §2.2's scope-overlap column exists.
5. **Grammar coverage.** Every candidate and every hand rule here reads TypeScript through the same tree-sitter
   grammar. Nothing in this report says anything about a repository grain has no grammar for.
6. **The label for a held-out case comes from grain's own later measurement.** It is independent in TIME, not in
   method (§1.2). A drill number here is template fidelity, not rule quality.
7. **One repository, and it is the tool's own.** Everything above is "on Yggdrasil". The second-repository
   control counsel-2 §5 asks for does not exist yet.
8. **`yg simulate` could not replay a proposed rule on a proposed node at all** — see §5. The replay number that
   exists is the one obtained by overlaying candidates onto Yggdrasil's own graph, which a brownfield adopter,
   by definition, does not have.
9. **§6's `decorative?` count depends on a side effect of this run.** The instrument filled the clone's local
   deterministic lock before reading `aspects --health`, which is exactly what turned 3 `decorative?` rules into
   24. Both readings are given; neither is "the" number, and a fresh checkout gives the first.
10. **The replay window is 12 commits, not 40.** The first attempt used 40 and was killed at ~45 minutes of
   projected wall time on a contended machine. 12 is a shorter window on the same held-out side of the cut; it
   bounds the catch counts downward and does not change which candidates catch.
11. **The sample's pool is 11, not 20** (§7). Nine rows are candidates with no held-out corpus, labelled. Any
   precision computed on the full twenty mixes two populations, and the maintainer should say which they mean.

---

## 9. Verdict, against the bars

**Bar 1 — at least 10 of the 20 miner-miss hand rules reproduced in verdict: FAILED. 2 of 20** as the ticket
defines it, **0 of 20** if the reproducing candidate must also govern any of the same files. The ceiling
imposed by corpus availability was 15, so this is not a near miss against a hard ceiling; it is a wide miss
against a soft one.

**Bar 2 — sample precision ≥ 0.80 on (a)+(b): not decided here.** §7 hands the maintainer the sample with its
evidence and a blank class column. The pool it is drawn from is small, and that is part of the finding.

**The bet — a superposition template as a shape check: LOST.** 1 of 20 no-identifier rules, 0 of 20 miner-miss,
and 2.5× the false alarms of the name-based templates.

**What this means for B1 as a direction.** The law loop's premise is that mined practice, rendered as a
deterministic rule, converges on the law a maintainer would write. On the one repository where both sides exist,
it does not: the rules grain renders are true statements about the repository (156 of 182 held-out cases,
1 false alarm) that are simply **about different things** than the rules the maintainer wrote. The maintainer's
rules are overwhelmingly negative and specific — "never `node:fs` here", "never `Date.now` there",
"`unhandledRejection` must be handled in the entry point" — and they are negative *because a decision was made*,
not because a majority was observed. Grain sees majorities. Two of them coincided.

**What survives the failure and should be kept:**

- **The hold-out machinery works and is cheap.** I10 = 1.000 over 182 cases, verified against git rather than
  asserted, with a cut sha in every corpus id and a `provenance.json` on every generated rule. Any future
  version of this loop needs exactly this, and it is now built and guarded by a test that fails if the birth
  test drifts to a date comparison.
- **The sharpened `errs: under` statement** (§2.3): the contract is a property of a rule inside its own scope.
- **A correction to counsel-2 §2.7, measured** (§6). Its premise is wrong and its conclusion survives: a
  deterministic rule's catch/exposure DOES appear in `yg aspects --health`, after one free keyless local fill
  (0 of 57 rows before, 57 of 57 after; `decorative?` goes 3 → 24). But the deterministic lock is gitignored, so
  that record is per-working-copy and never shared — retirement that has to hold between machines still cannot
  rest on it. The Yggdrasil-side ticket the memo asks for should be phrased against the *committed* stream, not
  against a claim that the signal does not exist.
- **The negative itself.** "Rules about what a repository never does are not reachable from what it does" was
  already 093's boundary for 6 rules. This report extends it: even where the identifier IS present and grain
  could in principle name it, the rendered rule lands somewhere else. That is a finding about the shape of the
  gap, not a tuning problem, and it belongs in any adoption surface.

---

## 10. Reproducing this

```
S=<scratch>
# 1. clones: HEAD and at the cut (refs pruned so the miner cannot see past it)
git clone --no-checkout <yggdrasil> $S/ygg
git clone --no-checkout <yggdrasil> $S/ygg-at-cut && git -C $S/ygg-at-cut checkout -B main 2591a3ad

# 2. the two exports (the at-cut one is the only thing the miner sees)
node plugins/grain/bin/grain.mjs export --repo $S/ygg-at-cut --out $S/export-at-cut.json --compact --no-anchors
node plugins/grain/bin/grain.mjs export --repo $S/ygg        --out $S/export-head.json   --compact --no-anchors

# 3. the candidates, with the reading cap lifted
node plugins/grain/tests/stress/propose.mjs $S/ygg-at-cut $S/prop-at-cut \
  --export $S/export-at-cut.json --subgate-per-partition 100000

# 4. two stages: the proposal graph over the HEAD tree, and the candidates overlaid on Yggdrasil's own graph
#    (the second is the only configuration in which `yg simulate` can replay a mined rule at all)

# 5. the measurement
node plugins/grain/tests/stress/law-loop.mjs \
  --repo $S/ygg --hand-repo $S/ygg --stage $S/stage --replay-stage $S/stage-replay \
  --proposal $S/prop-at-cut --export-head $S/export-head.json --export-cut $S/export-at-cut.json \
  --out $S/loop --cut 2591a3ad --jobs 6 --max-commits 12 --json $S/loop.json
```

Guarded by `plugins/grain/tests/law-loop.test.mjs`. `plugins/grain` suite: **2231 tests, 0 fail**.
