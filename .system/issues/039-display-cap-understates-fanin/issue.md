# 039 · Other consumers of the same display cap understate their counts

**Status:** FIXED (verified independently)
**Found by:** fix-036-035 agent while fixing 036, 2026-09-01 (flagged deliberately rather than fixed unprompted)
**Severity:** low-medium

## Context

036 was a display cap (`.splice(12)` on `whatCmd`'s `defined` list) feeding a **semantic verdict** — `exactLocal`,
which drove a confidently-wrong "external/vendor type" claim. That is fixed: `exactLocal` is now computed over the
full set before the cap, and an exact-name match is hoisted to the front so the true answer is also *shown*.

While fixing it the agent audited the other readers of that same capped list and found two more:

- `spreadFiles` / `usedBy` fan-in
- `howCmd`'s archetype-cover lookup (`core.mjs` ~2996)

**Why they were left alone:** these produce a numeric **understatement**, not a false boolean verdict. A count
that is too low is a lesser defect than a claim that is untrue, and fixing them was outside 036's scope. The
agent reported rather than fixing unprompted — the right call.

Also confirmed safe by the same audit: the `!defined.length` "genuinely absent" gate, since `splice(12)` cannot
empty a non-empty array.

## Why it still matters

`what`'s "used by: N files" reads as a measurement. If the real number is larger, a developer judging whether a
symbol is safe to change gets a systematically optimistic answer — the same class of quiet inaccuracy as 032's
original 4–8× undercount, just smaller and without the false verdict on top.

## What to do

Separate the display cap from the computed quantity everywhere it is read, the way 036 now does: count over the
full set, cap only what is rendered, and if the rendered list is truncated say so (`+N more` is already the house
idiom). Check whether the true count is even reachable at those call sites before designing — 036's fix was cheap
because the full array was still in scope; that may not hold here.

## Acceptance

`spreadFiles`/`usedBy` report the true count with the list still capped; `howCmd`'s archetype cover is computed
over the full set. A fixture with more than the cap's worth of hits proves both. 036's own guard stays green.

---

## Work log — 2026-09-01 (fix-031-037-039) — **FIXED**

Fixed, and **it does not belong with 037/031**: this is a counting defect, not a missing disclosure. Dispatched
with them on the hypothesis of one unifying rule; the honest answer is that 037 shares a mechanism with 018 while
039 shares one with 036. Treated separately, as the ticket itself allowed for.

### Worse than reported: the count was not understated, it was arbitrary

The ticket assessed these as "a numeric understatement, not a false boolean verdict" — a fair reading of the code,
but measurement contradicts it for `usedBy`. `usedBy` counts file-level edges into the **top 3 declaration files
ranked by hit count**, and that ranking ran over the capped list. The cap therefore changed *which files were
counted*, not just how many hits fed the ranking. Old vs new on real repos:

| repo | query | hits | used by (old → new) |
| --- | --- | --- | --- |
| okhttp | `Interceptor` | 117 | **6 → 74** |
| axum | `_into_response` | 171 | 2 → 17 |
| axum | `routes` | 98 | 17 → 25 |
| Slim | `routing` | 129 | **21 → 0** |
| okhttp | `writing` | 189 | **59 → 4** |
| flask | `template` | 86 | 16 → 2 |

It moved in **both directions**. The old number was answering a different question — "fan-in into whichever 3
files happened to hold the most hits among the alphabetically-first 12" — which is not a question anyone asked.
okhttp's `Interceptor`, its flagship public type, reported a fan-in of 6 files when the real figure is 74.

`spread` was a plain understatement as described: `Interceptor` 10 → 43 distinct files, `_into_response` 5 → 65,
`writing` 9 → 67.

### `howCmd`'s archetype cover was a semantic verdict, not a count

`howCmd` rebuilt `what`'s (a)∪(b) file set from `whatCmd`'s **returned** `defined`, which is the capped list. The
resulting `cover` ratio feeds a `score >= 0.34` gate. A truncated footprint pushes the ratio down, which can drop a
genuinely-matching archetype under the floor and **silence a certified shape entirely** — the same defect class as
036, not a milder one.

### The fix

`whatCmd` keeps `definedAll` (the full sorted list) before `splice(12)` and derives `spreadFiles` and `usedBy`
from it. It now returns `spreadFiles` and `definedTotal`, so `howCmd` consumes the uncapped set directly instead of
reconstructing it from a capped half — the comment there explaining why it had to rebuild is gone, along with its
premise. The rendered list stays capped at 12; the truncation is now stated with `+N more`, the house idiom the
ticket named. `cmdWhat` destructures the published fields by name, so neither new field reaches `what --json`.

Measured: **7.1% of the 1800-query corpus sample truncates** (127 queries), so this was not a rare corner.

### Acceptance, checked

Tests (8)–(10) in `plugins/grain/tests/what-weak-answer-disclosure.test.mjs` use a 30-declaration fixture across
three modules with importers: the cap holds at 12, `+N more` appears, `spread` totals above the cap, `used by`
reports real fan-in. 036's own guard (`what-exactlocal-truncation.test.mjs`) stays green.

Suite 1755 → 1767, all green. No `config.mjs` change and no `MODEL_V` bump — every change is read-time.

### Fixture note for whoever writes the next one

`tokenize` splits camelCase only at a lower→upper boundary, so a trailing digit fuses into the preceding token:
`PaymentHandler01` → `payment` / `handler01`, and a `payment handler` query then covers nothing. Cost a debugging
round; use alphabetic suffixes.
