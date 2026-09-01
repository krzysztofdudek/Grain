# 010 · The new-scope disclosure (003-B) is honest but easy to miss — delivery undercuts it

**Status:** FIXED (all five: d/c/e/a/b; verified independently, 1482/1482)
**Found by:** retest round 1, C#/CleanArchitecture, 2026-09-01
**Severity:** medium — the content is right; the presentation defeats its purpose

## Context

003-B shipped a disclosure line for scopes the model has never seen, after a detector was rejected on
measurement. The retest verdict was **"honest but easy to miss, not noise"** — the signal is real, the delivery
is weak. Three distinct complaints, all actionable, in descending severity:

## (c) It prints AFTER the "0 deviations" headline — the worst one

Real output ordering on a handler omitting `IRequestHandler`:
```
... governed by 3 convention(s) · 0 deviation(s) in your change
[... other lines ...]
`ArchiveTodoItemCommandHandler` (line 10) is new to the index — nearest «IRequestHandler+command+handler» ...
```
Verbatim from the tester: *"a dev skimming for the deviation count could read '0 deviations', feel clear, and
never reach these lines. Would it have changed what I did? Only if I read past the headline."*

The headline is the summary a reader trusts. If grain is disclosing that its "0 deviations" is **not** a clean
bill of health for this scope, that qualification belongs where the 0 is stated, not below it. Candidate fix:
reflect new/undisclosed scopes in the headline itself (a count), so the summary line can never assert an
unqualified 0 while the disclosure is pending.

## (a) It fires 3× for conceptually one issue

The C# fixture produced one line each for the record, the class and the method of the same new handler —
"reading as repetition not reinforcement". A new file naturally contains several new scopes; one disclosure per
scope multiplies a single authoring decision.

Candidate: collapse per-file (or per-contiguous-new-region), naming the strongest/nearest group once with a
count of the scopes it covers, in the house `+N more` idiom. Cap already exists (8); the problem is not volume
but redundancy.

## (b) The disclaimer sentence is dense and academic

Current tail: *"Judged against the package baseline only — a new scope that omits a group's defining decorator or
base type is placed by that omission, and grain cannot tell it apart from a genuinely new kind of scope."*

Verdict: *"more hedge than nudge."* It is precisely true (it is the measured 003 finding restated) but it reads
as the tool defending itself rather than telling the reader what to do. The genuinely useful half — identified by
the tester — is the `(requires extends IRequestHandler)` clause, which lets a reader connect "nearest group
requires X, my score is 0.44" to "I am probably missing X."

Candidate: lead with the actionable half, shorten or drop the epistemics (they are already stated once, properly,
in docs/validation.md's Known boundaries — that is the right home for the full argument).

## Explicitly NOT in scope

Do not revive a near-member detector. Issue 003 rejected that on measurement (four designs; best precision 36%;
an unrelated new method scored identically to a true near-member). This issue is about presenting the disclosure
that replaced it — nothing about what it is allowed to claim.

## Acceptance

- A `check` run on a new file with several new scopes emits at most one disclosure per group, not one per scope.
- The headline summary cannot state an unqualified "0 deviations" while a new-scope disclosure is pending.
- The line leads with the actionable requirement; regression tests from 003 still pass unchanged.

---

## All three retesters weighed in — the sharpest finding is (d), from Python

Verdicts: **Java** "useful, not noise — keep it" (but "needs a beat to parse"). **C#** "honest but easy to miss."
**Python** "consolation prize, not a stopper — reads like boilerplate you skim past while your eye is on
'0 deviation(s)'." All three agree the CONTENT is right; all three fault the DELIVERY.

## (d) It leads with the nearest group even when that group is a meaningless catch-all — NEW, and the worst

Python/flask, verbatim: the line "never names the group — always the literal placeholder «group», never
'setupmethod+add+app' even though that label exists elsewhere in the same tool."

Diagnosis: the disclosure leads with `nearest`. On flask the nearest group to `add_url_alias` is r32 — the
*undecorated* Blueprint methods, 11 members, **0 conventions**, no meaningful label, so `medoids[idx]?.label`
falls back to the literal string `'group'`. The genuinely informative neighbour is the *next* one (r33,
«setupmethod+add+app», which requires the decorator). C# and Java did not hit this only because their nearest
group happened to be the meaningful one.

So "nearest" is the wrong thing to lead with. What a reader can act on is **the nearest group that actually
certifies something** — the one whose `requires ...` clause explains what is missing. That clause was already
identified by the C# tester as "the actually valuable bit."

Candidate fix: lead with the nearest group **that has ≥1 certified convention**, naming it and its requirement;
mention the unlabelled catch-all only if nothing else is near, and then say plainly that the nearest neighbours
carry no certified conventions. Never render a bare `«group»` placeholder as if it were a name.

## (e) No exemplar pointer

Python: "gives no file/line to go compare against, unlike the excellent existing-scope deviation message." The
deviation path already resolves a nearest conforming exemplar with `file:line` (that machinery is
`roleExemplar`/the `See:` line). A disclosure naming a group but not one member to open is strictly less useful
than every neighbouring message.

## Revised priority for the fix

1. **(d)** lead with the nearest *certifying* group; never print a bare `«group»`.
2. **(c)** the headline must not assert an unqualified "0 deviations" while a disclosure is pending.
3. **(e)** add the exemplar pointer, reusing the existing helper.
4. **(a)** collapse per-file rather than per-scope.
5. **(b)** shorten the epistemic tail; the full argument lives in docs/validation.md.

## Tester-supplied acceptance criterion (Python/flask, follow-up)

Verbatim, and adopted as this issue's definition of done:

> If it moved into/above the headline ("0 known deviations, 1 unclassified scope"), deduped per group-per-file,
> and named the actual group label instead of "«group»", I'd flip to Java's verdict.

Maps to (c), (a), (d) respectively. Note that `0 known deviations, 1 unclassified scope` qualifies the zero
**in place** rather than appending a caveat below it — that is the property that matters, more than the wording.

**Stronger reproduction for (a):** three new setup-style methods added in ONE edit (a single "add a family of
registration methods" decision) produced the near-identical paragraph three times back to back — and in that case
BOTH neighbours rendered as the bare `«group»` placeholder, so (d) and (a) compound: three repetitions of a line
that names nothing.

**Explicitly validated — do not change while fixing presentation:** the underlying signal is real and
well-calibrated. Verified to separate a true near-clone (0.67) from a genuinely unrelated helper (0.33, correctly
below the 0.35 floor). Scores and floor behavior are sound; only the rendering is at fault.
