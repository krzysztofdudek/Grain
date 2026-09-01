# 036 log

Root cause confirmed by reading `core.mjs`'s `whatCmd` (~line 3119, pre-fix): `defined.sort(byRelThenLine).splice(12)`
ran BEFORE `exactLocal = defined.some(d => d.name.toLowerCase() === q.toLowerCase())`. The sort key was path/line,
not relevance, so on a query with heavy token collision the real exact-name declaration could sort past position
12 and get spliced away before `exactLocal` ever saw it — manufacturing a false "external/vendor" verdict for a
type declared locally.

## Fix

`engine/core.mjs`, `whatCmd`:
- `exactLocal` is now computed over the FULL `defined` array, before `.splice(12)`.
- `defined`'s sort now hoists an exact-name match to the front (ties otherwise keep the old rel/line order — JS
  Array#sort is stable), so the true answer is not merely counted correctly but actually appears in the capped
  display list, not some other colliding entry.

## Other consumers of the truncated `defined` list, checked

- `!defined.length` gate for the "genuinely absent" branch (~line 3204): safe. `splice(12)` can only remove items
  past index 11; it can never turn an originally non-empty array into an empty one, so this boolean is unaffected
  by which specific items got cut.
- `spreadFiles`/`spread` module aggregation (~3147): a display aggregate over the capped list, same as before this
  fix and before 032 — informational, not a verdict. Not the same conflation.
- `usedBy` fan-in (~3176): picks the top-3-by-declaration-count files FROM the capped list. In a heavy-collision
  case the true busiest file(s) could still be alphabetically outside the first 12 and get missed, understating
  `usedBy.files`. Same general "display cap → numeric understatement" class 032 already accepted as a known
  limitation of the cap itself, not the "confidently wrong boolean verdict" class this ticket fixes. Not touched.
- `howCmd`'s archetype-shape lookup (~2996-2998) calls `whatCmd` and builds `qCells` from the (capped) `defined` +
  (uncapped) `values` file sets, feeding a 0.34 score threshold for certified-shape matching. Same family (a
  capped list feeding a decision) but a fuzzy score, not a hard yes/no claim about the repo — lower severity,
  reported but not changed; the exact-match-first sort change incidentally makes this slightly more accurate too
  (the file with the exact declaration is now preferentially retained).

## Tests

New file `tests/what-exactlocal-truncation.test.mjs`: 12 colliding declarations (`C01Interceptor`..`C12Interceptor`,
paths sorting alphabetically before the real one) + 1 real `Interceptor` declaration whose path sorts last (13
colliding declarations total, matching the acceptance criterion). Confirmed load-bearing by hand-reverting the fix
via Edit (all 3 assertions failed exactly as predicted — `C01Interceptor` shown instead of `Interceptor`, real
declaration missing) and restoring via Edit. Existing regression guard `tests/what-external-types.test.mjs` (032's
own fixture) still green.

Result: `tests/what-exactlocal-truncation.test.mjs` (4/4), `tests/what-external-types.test.mjs` (4/4),
`tests/what-exact-match.test.mjs` (6/6), `tests/what-command.test.mjs` all green.
