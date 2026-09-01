# 008 · Ambiguous members dilute role cells at half weight, vetoing unanimous group facts

**Status:** RESOLVED — measured across 9 repos, change REJECTED with evidence; half-weight shown derivable (0.557 responsibility) and documented in mathematics.md
**Found by:** opinion-003-near-member, measured on live flask, 2026-09-01
**Severity:** medium — silently suppresses real, certifiable group conventions

## Symptom

A role cell whose established members are UNANIMOUS can fail certification because ambiguous members ride into the
cell at half weight and dilute the counts. Measured on a fresh flask learn (`GRAIN_DBG`):

```
[dbg] r33:method auto.stshape:expression_statement(call(attribute,argument_list))
      raw=12 neff=9.5 data=12.7 bits=-2.0 counts={"true":8,"false":1.5} sraw={"true":12,"false":0}
```

`sraw` is unanimous (12 true / 0 false). `counts` is diluted (`true:8, false:1.5`) — the 1.5 "false" is ambiguous
members entering the role cell at half weight (`core.mjs:849`).

**With ambiguous members excluded the same cell computes to +3.0 bits and WOULD certify.**

## Relationship to the m15/G9 fix

m15's G9 fix already corrected role-cell established/share counts to exclude ambiguous members — but only on the
PRINTED side. The WEIGHTED side (what feeds `counts` → `data` → `bits`) was deliberately left as-is. This issue is
about whether that asymmetry is right: a handful of ambiguous non-carriers can veto a group's genuinely unanimous
co-travelling fact.

## Also observed, possibly the larger hole

**225 of 493 assignments in flask's `src` partition are ambiguous (`-1`)** — those scopes are governed by NO role
fact at all, only by `_all`. That is a much wider silence than issue 003 describes, and it is not obviously
intended.

## What this issue is NOT

Not a request to simply exclude ambiguous members from the weighted side. That is a real change to the acceptance
mathematics (it would make more facts certify, repo-wide) and needs the same measured, adversarial treatment the
J-series tickets got: what NEW facts appear across a corpus, are they true, and does anything false start
speaking. Half-weighting was presumably a deliberate hedge against exactly that.

## Acceptance (if pursued)

A measured before/after across ≥3 real repos: how many additional facts certify, sampled for correctness by hand.
Ship only if the added facts are true. Otherwise document the half-weight choice and its cost in mathematics.md.

---

## Resolution (2026-09-01): measured across nine repositories — DO NOT SHIP. The premise was wrong.

**The single number:** over **4350 ambiguous scopes in eight repositories, the mean rank-1 responsibility
`m1/(m1+m2)` is 0.557** (0.533 over the gap disjunct alone). The `0.5` in `mine()` **is that responsibility,
rounded conservatively down** — a soft-assignment mixture weight, not a hedge someone picked. What looked like an
arbitrary constant turned out to be derivable, which inverts this issue's framing.

**Prior art found:** the spec (`§8.5`) carries a binding weight-index table — role cells use
`w(s,q)·(ambiguous ? 0.5 : 1)`, `_all` uses `w(s,q)`. Present since the first commit (16fa901), untouched by
m15/G9 (which changed only `rw` and `gi` on the same call). So the asymmetry was a **recorded rule with no
recorded reason** — which is why measuring was right rather than stopping at "it's deliberate". The measurement
produced the reason, and it is now in `docs/mathematics.md`.

### It is churn, not growth: +110 / −31, and the 31 are all TRUE

257 → 336 facts (+30.7%), `exp` changed nowhere. On express the fact set is nearly *replaced* (+14/−12). Every one
of the 31 dropped is a true `share = 1.0` fact the engine speaks today — `gin render|r1
auto.ptype:http.ResponseWriter` (11/11), `gin _repo|r3 auto.call:engine` (10/10), `axum r67 auto.call:Router::new`
(9/9), `express test/acceptance|r4 auto.call:request` (9/9).

### The tautology hypothesis is REFUTED — it makes facts LESS informative

I asked specifically whether half-weighting was suppressing the *non-tautological* facts. **The opposite:**
39 of the 110 added (35.5%) are marker tautologies vs 31.5% in the existing set; only 30.0% are domain-tier vs
44.4% of the base. Domain share **falls** 44.4% → 40.2%, tautology share **rises** 31.5% → 34.5%.

### Something false does start speaking

`express test/req.secure.js:38` gains *"named callbacks here call `it`"* — role 80's other members are
`describe(...)` blocks; this one is an `it(...)` callback pulled in by name similarity. Under the current
behaviour the ambiguous members' **disagreement** corroborated the lone unambiguous deviant and kept the cell
under the bar.

> **Ambiguous disagreement is a signal that the group boundary is wrong** — and here it was the only thing
> stopping a wrong fact from speaking.

Also `flask scaffold.py:284#_method_route` gains *"methods here are annotated with `@setupmethod`"* — it is the
private helper the 15 decorated shortcuts delegate to and must not carry the decorator; and the governing fact is
itself a marker tautology, so exclusion promotes a report-suppressed tautology into a live accusation against
correct code.

### The decisive counter-example, hand-read

`gin _repo|r3`: 10 unambiguous members in `ginS/gins.go`, all `func X(...) gin.IRoutes { return engine().X(...) }`.
Reading the file: **all 25 functions call `engine()`, the ambiguous ones included.** Excluding them kills the true
fact "10 of 10". That is destruction of true, agreeing evidence — not a purity gain.

Population statistics behind it: ambiguous members agree with their cell's established majority **91.4% of
weight** (vs 95.8% for unambiguous; **95.9%** inside unanimous cells, which are 83.9% of all role cells) and carry
**29.2%** of a cell's weight. Exclusion discards nearly a third of observed data to close a 4.4-point gap.

### The narrower rule also fails

"Exclude only where the established side is unanimous": +99 / **−27** — barely better, because the drops come
*precisely from unanimous cells* where ambiguous mass was supporting, the exact case it was meant to protect.
Rejected, and it adds a case split with nothing behind it.

### If ever reopened, the direction is the opposite one

Sensitivity sweep (5 repos): **w=0 → 304, w=0.25 → 240, w=0.5 → 231, w=0.75 → 237, w=1.0 → 243.** Every non-zero
weight sits in 231–243; w=0 is a discontinuity (`neff` collapses, taking the BIC penalty with it — a different
regime). **Full weight (w=1) is the only alternative with better information yield** (+28/−15, 54% of added are
domain-tier vs 30% for exclusion) and it deletes a constant. Still not recommended — 0.5 is the measured
responsibility and w=1 credits a half-belonging scope as a full member — but it is the direction worth
revisiting, and it is the *opposite* of what this issue proposed. Recorded so nobody re-derives it.

### On the 225/493 observation

Corpus-wide **5683 of 11661 role-eligible scopes (48.7%) are ambiguous** (39.3% gin → 64.6% spring-petclinic);
flask's 45.6% is unremarkable. Spec §8.7 pre-answers it: *"the dominant silence mechanism in practice… a stated,
measured property, not a defect."* If worth narrowing, it is a **clustering** question (`ambGap`, `minMemb`, the
medoid set, the feature bag), not an acceptance-mathematics one. Measured, not acted on.

**Deliverable: no engine change.** `docs/mathematics.md` gains "Groups, and the ambiguous member's half vote" —
the mechanism, the 0.557 derivation, and the measured cost in *both* directions, including this issue's own flask
veto alongside the gin `engine()` fact that exclusion would silence.
