# 090 · where <path> is not parsed as a path — tokenize destroys path structure before the ranker sees it

**Status:** OPEN
**Found by:** 080 investigation, 2026-09-02
**Severity:** medium
**Class:** G

## Symptom

`grain where src/Domain/Constants/Roles.cs` is not answered as a question about a path. `cmdWhere`
(grain.mjs:466–470) does `args.join(' ')` and hands the result straight to `whereCmd` as intent words — it
never calls `relPath`, never checks for `/`, never asks whether the path exists. Inside `whereCmd`,
`tokenize` (core.mjs:461) replaces every non-alphanumeric run with a space, so the ranker receives the words
`src domain constant role cs`. The exact-name pin (core.mjs:7215–7225) strips `/` as well, collapsing the whole
path into the single token `srcdomainconstantsroles.cs`, which its own `length > 2` filter then discards — so
the pin structurally cannot fire on a path at all.

Ticket 080's literal ask was "`where` must answer for a directory that does not exist yet". It cannot, because
the input never arrives as a path. This is the routing half of 080; the mining half was measured and closed
(see below).

## Suspected area

`cmdWhere` (grain.mjs:466), `whereCmd` (core.mjs:7201), `tokenize` (core.mjs:461).

The path-aware machinery already exists and all of it already accepts a path that is **not** in the tree:

- `placementHit` (core.mjs:5803) — explicitly requires `!files.includes(rel)`; today reachable only from
  `check` and the check hook, never from `where`. Bails when the path has no file suffix (core.mjs:5806), so a
  bare directory path cannot enter it.
- `obligationFor` (core.mjs:2652) — "a path need not exist (the whole point)".
- `inLineForFile` (core.mjs:7193) — as of 080, hedges when the module holds no files.
- `partitionFor` / `refineModOf` — pure path functions.

So this is routing plus wording, not new extraction.

## What is NOT in scope

- **Mining what a new directory has historically been born with.** Measured and closed under 080:
  `.system/research/where-new-directory.md` §3. Five candidate directory-birth class keys over 792 real
  directory births in 10 repos; best arm reaches coverage 0.010 against ticket 073's own 0.08 acceptance floor
  (missed by 8×) and repo-macro precision@1 0.33 against its 0.80 bar, firing on 2 of 10 repos. When it fires
  it names repo furniture (`.gitignore`) and is wrong. Do not revive this without new evidence.
- **`changeArchetypes`.** Verified not to carry any directory-creation signal: `cellsOf` (core.mjs:5389–5406)
  reads only `fp.files`/`fp.scopes` and never `fp.added`.
- No new tuned constant, no name lists (080's standing constraint carries over).

## Acceptance

An instrument first — this changes a ranking, so it needs one before it ships. `whereEval`'s existing protocol
(core.mjs:8838) restricted to commits that ADDED a file is the natural ground truth: given the birth commit's
own message, does routing a path-shaped query through the path-aware machinery rank the true directory better
than today's word-soup path does, and better than the existing path-match baseline `whereEval` already carries?

Ship only if it beats both. Report coverage and repo-macro precision, not pooled precision alone
(`obligations-design.md` §3's standing correction).

Open question worth settling first, cheaply: trial-0.4.0 §4b records the agent **ignoring** a correct
structural pointer grain had already given it (`in: src/Domain/…`). If a correct answer in the current wording
does not change behaviour, better routing to the same wording may not either — that is an adoption experiment,
not a ranking one, and it is the cheaper of the two.
