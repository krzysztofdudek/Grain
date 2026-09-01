# 003 · Brand-new code that should belong to a group is never checked against that group's conventions

**Status:** RESOLVED + SHIPPED (disclosure A1/A2/B/C, verified independently, 1477/1477)
**Found by:** field test, independently in TWO repos (Java/spring-petclinic, Python/flask), 2026-09-01
**Severity:** high for the primary use case — an agent WRITING NEW CODE is exactly who this tool is for

## Symptom

`check`/`review` catch deviations in code that already exists (or in an edit to an existing member of a group),
but a NEWLY ADDED scope that clearly ought to join an established group sails through with 0 deviations.

- **Python/flask**: added a new method to `Blueprint` shaped almost identically to `add_url_rule` (same params,
  same `self.record(lambda ...)` body) but missing the `@setupmethod` decorator that 12/12 members of the
  `setupmethod+add+app` group carry. `check` → **0 deviations**, twice (once sloppy/untyped, once as a careful
  type-hinted near-clone). Removing `@setupmethod` from the EXISTING `add_url_rule` instead was caught perfectly.
- **Java/spring-petclinic** (same shape, different symptom): a new handler omitting the established interface
  entirely was never flagged — naming violations were caught, "you forgot the interface" was not.
- **C#/CleanArchitecture** reported the identical gap independently: a new handler not implementing
  `IRequestHandler` produced no finding, because a file that does not structurally match a group is excluded from
  that group's checks rather than flagged as a near-member that is missing the defining trait.

## Root cause (hypothesis — CONFIRM before fixing)

Group membership is decided by clustering over the scope's own feature bag. A new scope missing the group's
defining trait (the decorator / the interface) is, by that very fact, not similar enough to be assigned to the
group — so it is judged only against the trivial partition-wide baseline ("89% of all methods lack this rare
decorator"), which it passes. The convention is unenforceable exactly on the code that most needs it.

This is a design gap, not a typo: fixing it means deciding how a "near-member" is recognised without inventing a
new tuned threshold. Note the codebase's constitutional rule — evidence is codelength, `CFG.lambda` is THE loss
constant, `minRaw`/`minEff` are compute short-circuits only. Any proposal that adds a new tuned similarity
threshold contradicts that rule and needs an explicit, written justification (or a different design).

## Expected

A new scope that matches an established group on most of its defining features but misses one or a few should be
reported as a candidate member missing that trait — with the same evidence discipline as every other finding
(n of N, the exemplar to copy), and with honest silence when the resemblance is too weak to claim.

## Acceptance

Fixture: a group of N members all carrying a distinctive trait; a newly added scope matching them on everything
else but missing the trait → a finding naming the trait and an exemplar. A genuinely unrelated new scope in the
same file → still silent (no false accusation).

---

## Resolution (2026-09-01) — independent Opus opinion, measured on three live repos

**Verdict: do NOT ship near-member detection. Ship disclosure.** Every candidate design was built and measured;
all failed. Full reasoning in this session's transcript; the decisive points:

### The mechanism is confirmed, and sharper than this issue's hypothesis

Two roads, one destination (`_all` baseline):
- **Rich feature bags (Python methods)**: the newcomer IS confidently assigned — to the *complementary* group.
  flask's r32 (11 undecorated Blueprint methods) and r33 (12 decorated) are split BY the marker, so a scope
  missing it is actively pulled into r32. `add_url_alias` → r32 at m1=0.667, `amb` false. Not a fallback.
- **Thin bags (C#/Java types)**: dropping the interface drops half the membership evidence
  (`DeleteContributorValidator` m1=0.714 → `ArchiveContributorValidator` m1=0.286), below `CFG.minMemb` 0.35 →
  `amb` true → no role fact governs.

Anchors: `core.mjs:462` (role bag), `:743` (`featW`, `dec:`/`sup:`/`ret:` weigh 3×), `:817-828` (`assignAll`,
`amb` rule), `:2013` (`checkFile` re-runs `assignAll`), `:2022-2024` (role resolution), `:2028` (governance).

### The finding underneath: marker tautologies

Share of role-scoped facts sitting on a pid whose feature is IN the group's own medoid bag — i.e. the marker that
formed the group at 3× weight, so unanimity is guaranteed by construction:

| partition | tautologies / role facts |
|---|---|
| flask `src` | 9 / 11 (82%) |
| flask `tests` | 18 / 33 (55%) |
| CleanArchitecture `src` | 2 / 2 |
| CleanArchitecture MinimalClean | 1 / 1 |
| spring-petclinic `src` | 2 / 6 (33%) |

**The same single fact makes these conventions loud and structurally unenforceable.** A second kind of vacuity
beside the structural-contrast null model the constitution already names — and unlike that one, grain speaks it.

### Four designs built and rejected on measured precision

| design | result |
|---|---|
| (a) counterfactual re-assignment (add marker to bag, re-run `assignAll`) | **542 hits / 1515 scopes = 36%** on flask; accuses r32's own medoid `register` (m1=1.000). Rejected. |
| (b) structural-template fit (`profiles[r].req`) | newcomer satisfies **7 of top-8 role templates**, incl. «property+max+form». Templates are generic Python. Zero discrimination. Rejected. |
| (c) marker-carrier profile (`markerObs`, 2/3) | newcomer scores 3.2 bits — **tied with 24 other non-carriers**. Carrier set too heterogeneous. Rejected. |
| (d) clone-sibling fact union (r32/r33 already pass `assignAll:824`'s 0.6 twin test) | **33 notes / 913 scopes on flask, all 33 false**; ~3% precision, swinging 0%→3.6%→11.7% across repos. Rejected. |

### Why it cannot work — the honest boundary

A second NEW method (`reset_deferred_state`, unrelated job/name/body) produces an **identical** feature bag
signature to the true near-member: both m1=0.667 (r32), m2=0.533 (r33), `amb` false. And on the best body-level
evidence available (the 15 predicates cleanly separating r33 from r32):

```
add_url_alias                 15/15   <- the true near-member
reset_deferred_state          15/15   <- unrelated new method
summarize_registration_state  12/15   <- an established r32 member
```

**13 of those 15 predicates are negative** ("no `for_statement`", "no `else_clause`", "no comment"). A short new
function satisfies negative evidence for free. C# mirrors this: true near-member m1=0.286 vs unrelated
`ContributorAuditFormatter` 0.250 — **0.036 of Jaccard apart.**

> grain can say "you are missing X" only if it can independently establish "you are one of these". Its only
> membership evidence is the feature bag, and X is 3 of that bag's ~9–11 weight units — for a C# type, half of it.
> **Membership and the trait are the same measurement, and a measurement cannot be evidence for a claim about
> itself.** Not a threshold problem; no constant fixes it.

### The evidence exists and grain correctly refuses it

`GRAIN_DBG` on a fresh flask learn, for the r33 cell that WOULD separate (the `self.record(...)` statement shape,
12/12 in r33 vs 4/11 in r32):
```
raw=12 neff=9.5 data=12.7 bits=-2.0 idxCost=13
```
12.7 bits of genuine compression, eaten by a repo-wide index cost of 13. `core.mjs:894` discards it — correctly.

### What ships instead (A/B/C below), and what a real fix would take

A real fix needs BOTH: (1) hierarchical index cost — a second-stage certification asking "which other surfaces
does this certified group hold unanimously?", hypothesis space |pids| per group rather than |cells| per repo,
dropping idxCost 13→~8 and certifying that cell at ~+3 bits; AND (2) something making POSITIVE evidence carry the
claim, since (1) alone still rates `reset_deferred_state` 15/15. (1) is a deliberate change to the constitution's
index-cost accounting, not a patch. Deferred, not forgotten.

**Uncertainty, as stated by the opinion:** three repos; spring-petclinic's reported shape could NOT be reproduced
(its `src` certifies no interface convention at all) — treat that one field report as unconfirmed. Tautology
shares are a measured range, not a law. The C# `namesuffix` signal was not tested on Java/TypeScript.

---

## Fourth independent confirmation (round 3, TypeScript/nest, 2026-09-01) — and a false alarm worth recording

nest is grain's **best-case language** (classes, decorators as the central idiom, interfaces, explicit return
types — all three of `featW`'s 3×-weighted signals present in abundance). The limitation reproduced there anyway:

> a new `bad.service.ts`/`BadService` missing `@Injectable` scored only **0.20–0.25** against the archetype
> (floor 0.35) and was judged "unclassified" — while the *identical* omission on an **existing** classified member
> was caught precisely ("17/17 established types conform… tried 7×, reverted 7× — a rejection, not an
> alternative", preference gap 5.13 bits).

That is now four independent confirmations across four languages (flask, CleanArchitecture, spring-petclinic,
nest) — including the one language where every clustering signal favours grain. It closes the question of whether
the limit is a language-fit artefact: **it is not.** It is inherent, exactly as the measured design opinion
concluded.

**The false alarm:** the tester reported "0 deviations reported, hook silent", which reads as the 003-B/010
disclosure having failed. **It had not.** Reproduced directly on a warm repo:

```
check … · governed by 0 convention(s) · 0 known deviation(s) in your change, 0 pre-existing, 2 unclassified scope(s)
[grain] `zzProbeAlpha` (line 1), `zzProbeBeta` (line 2) are new to the index —
        matched no group (best 0.00, floor 0.35). Judged against the package baseline only.
```

and `check-hook` forwards exactly that line as `additionalContext`. So the headline qualifier (010(c)), the
collapsed multi-scope line (010(a)) and the hook path all work. The tester saw the word "unclassified" — i.e. they
*did* receive the disclosure — and meant that the hook stayed silent about the missing `@Injectable`
specifically, which is the accepted, documented limitation rather than a defect.

Recorded because the same wording will recur: **"the hook was silent" about a near-member trait is expected;
"the hook printed nothing at all" for a new scope would be a real regression.** The two must not be conflated when
triaging future field reports.
