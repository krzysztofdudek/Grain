# Work log — 005: `how`'s "places touched" is a flat union across all matched commits

## Diagnosis
Confirmed the issue's own diagnosis: `howCmd` (core.mjs, ~line 2699-2707) aggregates places by a raw commit
count `k` (one increment per matched commit that touched the current path), then sorts `places` by `k` desc,
tie-broken alphabetically by `rel`. The per-match `score` computed earlier in the same function (line ~2680-2683)
was already discarded by this point — never read again. The matcher/scoring itself (IDF-weighted token overlap,
0.34 weak-match floor, `matches` array) was NOT touched.

## Consumers checked before changing anything
- `core.mjs:2711` (`howCmd` itself): `places.filter(p => p.exists)` — reads `.exists`, not `.k`. Unaffected.
- `core.mjs:2891` (`howEval`, the §J2.3 gate): `places.filter(p => p.k >= 1)` then builds a `Set` from `.rel` —
  order-independent, so a places[] reorder cannot change this gate's P/R/F1 output. `k`'s own value/meaning is
  read here and must stay a raw count.
- `grain.mjs:838` (`how-hook`): `places.filter(p => p.k >= 2)`, then renders in `places[]`'s own array order
  (no re-sort of its own) before `lines.slice(0, 6)` truncates. `k`'s value/meaning must stay a raw count here too,
  since it gates which places speak unsolicited; a places[] reorder changes only which ones make the top-6 cut
  after the `k>=2` filter, which is the point of the fix.
- No other file reads `howCmd`'s `places` (`what`/`map` do not consume it).

## Design chosen
Added a new `weights` Map, built in the exact same loop and dedup as `counts` (one accumulation per contributing
match, current-path-deduped), summing each contributing match's own `score` instead of incrementing by 1. Added
a new `weight` field to each place object (`+weights.get(rel).toFixed(3)`), and changed the places sort to
`weight desc, then k desc, then rel asc` (previously `k desc, then rel asc`).

Chose "weight `k` by contributing scores, rank by that weight" (both options the issue offered, since ranking
*is* what the weight is for) over filtering weak matches out of the aggregate entirely, because filtering would
either invent a new score cutoff (forbidden — CFG's own comment collapsed six thresholds into one on purpose) or
reuse the matcher's 0.34 floor for a different job (deciding aggregate membership) than the one it already does
(deciding match membership). Weighted ranking needs no new constant: it is a sum of scores the matcher already
computed.

`k`/`of` are UNCHANGED in value and meaning (still the raw commit count) — only the sort order changed. This
keeps `howEval`'s gate and `how-hook`'s `k >= 2` filter's semantics exactly as they were; both were re-verified
by test after the fix.

## Tests — written first, confirmed RED, then GREEN
File: `plugins/grain/tests/how-places-weighting.test.mjs`

1. **Ranking fixture**: one STRONG commit (`"alpha bravo rollout"`, carries both query tokens → score exactly
   1.0) and one WEAK commit (`"alpha only tweak"`, carries one of two tokens → score ≈0.398, computed by hand:
   idf(alpha)=log2(2.5)≈1.3219 shared by both commits, idf(bravo)=log2(4)=2 carried only by strong;
   score=1.3219/3.3219=0.39799→0.398 rounded), touching DISJOINT file sets. Weak's files are named
   `src/aaa/weak{1,2}.ts` (alphabetically first) and strong's `src/zzz/strong{1,2}.ts` (alphabetically last) —
   deliberately so the OLD k-then-alpha sort visibly gets it backwards (both places are 1/2, tied on k, so the
   old code falls through to alphabetical order and puts the weak match's files first). RED before the fix:
   ```
   ✖ (1) the strong match's files rank above the weak match's disjoint files, despite sorting alphabetically after them
     AssertionError: the strong match's files must rank first, got order:
     ["src/aaa/weak1.ts","src/aaa/weak2.ts","src/zzz/strong1.ts","src/zzz/strong2.ts"]
   ```
   GREEN after the fix (strong's files rank first in both `--json` `places[]` and the plain-text rendering).

2. **Matcher-unchanged guard**: reads `howCmd` directly (imported from `core.mjs`) over the model+history the
   CLI run already built in the fixture's cache, and asserts `matches[]` (sha + score) is exactly
   `[{strong, score:1}, {weak, score:0.398}]`. Note: `grain how --json`'s own CLI projection (`cmdHow`, grain.mjs
   line ~181) drops `score` from `matches[]` entirely — see "nearby, not fixed" below — so this test cannot read
   score through the CLI JSON and calls `howCmd` in-process instead, over the real model.json/history.json the
   CLI run already produced. This test passed both before and after the fix (as expected — the aggregation change
   never touches `matches`/scoring), confirming the fix is downstream-only.

3. **`how-hook`'s `k >= 2` filter regression guard**: a fixture with two full-score (1.0) matches sharing one file
   (`src/shared/thing.ts`, k=2) plus one file each of their own (k=1). After the fix, the hook still speaks (two
   matches ≥0.5 clears the `strong` gate), still shows `src/shared/thing.ts (2/2)`, and still excludes both k=1
   files. Passed before AND after the fix (a genuine regression guard, not a RED→GREEN case — `k`'s value/meaning
   is untouched).

## Full suite
`node --test 'plugins/grain/tests/**/*.test.mjs'` → **1471/1471** (baseline 1465 + 6 new tests here and in 007).

## Revert/restore verification (mandatory process, no git stash/checkout used)
Manually reverted the `howCmd` hunk via `Edit` (back to raw `counts`-only aggregation, old sort). Re-ran
`how-places-weighting.test.mjs`: test (1) failed with the exact RED shown above, tests (2)/(3) still passed
(confirming they are guards, not RED→GREEN cases for this fix). Restored the fix via `Edit`; all 3 tests green
again.

## Nearby, not fixed (reporting only)
`grain how --json` (and MCP `grain_how`, which returns the identical payload) never exposes `matches[].score` —
`cmdHow` (grain.mjs line ~181) explicitly projects `{ sha, ts, msg, files }` only, even though `howCmd`'s real
return value carries `score` and both `howEval` and `how-hook` read it internally. An external consumer of the
documented JSON contract (or the new `places[].weight` field this fix adds) has no way to see the score
`weight` was derived from. Not touched — out of scope for 005/007, and touching the JSON contract is exactly the
kind of judgment call this dispatch said not to make unilaterally.
