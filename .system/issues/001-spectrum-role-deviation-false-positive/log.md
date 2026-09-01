# Work log — 001 spectrum role deviation false positive

- Read issue.md, read `spectrum()` (core.mjs ~2280-2333). Confirmed root cause exactly as described: `mine3`
  (core.mjs:2324, pre-fix) filters `fileScopes` only by `kind`, never by role, even when `cid` is role-conditioned
  (`r<N>:kind`). `roleOf(s, i)` (line 2297) already exists and is what the cell construction (line 2304) uses.

- Tried to reproduce the exact bug on the repo's own shared fixture (`tests/fixtures/build-fixture.mjs`, used by
  `answer-grammar.test.mjs`). It DOES reproduce the mechanism (an `auto.namesuffix` role row for `r5:type`/`r6:type`
  gets falsely flagged `← THIS FILE DEVIATES` because the sibling Command/Handler pair in one file contaminates
  each other's row) — but no role-conditioned fact is ACCEPTED into `part.facts` there (each verb splits Command
  into its own ~7-8 member sub-role, too small/costly under `mine()`'s idxCost to certify), so it can't pin the
  `[NORM]`-row + `isNorm=true` shape the issue and acceptance criteria specifically need (and can't test the
  `check`/`spectrum` agreement contract, since `check` only ever governs off accepted facts).

- Built a custom fixture instead (Command class `extends Command` + Handler class, no extends, same file — the
  literal C# shape) and tried to get `induceRoles` to naturally accept a role-conditioned `auto.extends:Command`
  fact at various sizes (5, 20 entities). Never got there — 0 conventions both times; role-conditioned facts appear
  numerically hard to clear the idxCost/MDL bar even when the underlying population is a clean, unanimous 100%.
  Gave up on natural mining for this one fact and used the same poisoning technique already established in this
  suite (`cross-file-exemplar.test.mjs`, `answer-grammar.test.mjs`): run a real `grain status` on a real fixture,
  then directly inject the one role assignment + one fact under test into the freshly-mined `model.json`. Every
  scope, extraction and predicate value in the tests is still real (real TypeScript, really parsed) — only the role
  NUMBER and the fact's presence are asserted directly, standing in for what a much larger real Command population
  would have made `mine()` accept on its own.

- Fixture: 8 paired Command+Handler files, 6 Command-only "Extra" files (to keep `_all:`/`d[...]:` majority a clean
  14/24 true, never a 50/50 tie), 1 "Rogue" file whose Command does NOT extend Command (genuine deviation).

- Wrote `plugins/grain/tests/spectrum-role-deviation.test.mjs` FIRST (4 tests). Ran against unmodified code:

  RED (exact output):
  ```
  ✖ (1) THE REPORTED FALSE POSITIVE: ... — dev:true, expected false
    AssertionError: OrderCommand itself extends Command — OrderHandler (a different role, legitimately not
    extending anything) must not contaminate this row: {"cid":"r1:type","pid":"auto.extends:Command","exp":"true",
    "share":0.933...,"n":15,"bits":-2.10...,"isNorm":true,"dev":true,"has":true,"grp":0,"depth":0}
    true !== false
  ✔ (2) genuine deviation still fires — passed even pre-fix (unaffected by the bug)
  ✖ (3) check and spectrum agree — AssertionError: spectrum must not contradict check on the same file. true !== false
  ✔ (4) _all:/d[...] rows unaffected — passed even pre-fix
  tests 4, pass 2, fail 2
  ```

- Applied the fix, core.mjs (the row-construction loop inside `spectrum`, was lines 2323-2325, now):
  ```js
  const isNorm = part.facts.some(f => f.cid === cid && f.pid === pid && f.exp === exp);
  const roleMatch = /^r(\d+):/.exec(cid);
  const mine3 = fileScopes.filter(s => s.kind === kind && s.preds[pid] !== undefined && (!roleMatch || roleOf(s, ps.indexOf(s)) === +roleMatch[1])).map(s => s.preds[pid]);
  const dev = mine3.some(v => v !== exp);
  ```
  `roleMatch` is null for `_all:`/`d[...]:` cids, so those rows are untouched (`!roleMatch` short-circuits, no
  extra `roleOf`/`indexOf` cost paid for them). For `r<N>:` cids, `mine3` now only includes file scopes whose
  resolved role (via the SAME `roleOf`/`ps.indexOf` pattern already used at line 2298 for `myRoles`) equals N.

- Ran the new test file again: GREEN, all 4 pass.

- `d[...]:` case: confirmed already correct, no change made. Reasoning + empirical confirmation: `fileScopes` is
  already `ps.filter(s => s.rel === rel)` — every scope in it shares the exact same `rel`, and `myDirs` is built
  from that same `rel`'s own path segments, so every scope in the file is under every `d[...]` ancestor directory
  it appears in. Test (4) also directly asserts the `d[src/handlers]:type` row still flags the file, both before
  and after the fix — no behavior change there.

- Full suite: `node --test 'plugins/grain/tests/**/*.test.mjs'` → **1453/1453 passing** (1449 baseline + 4 new).
  No existing test's expectations changed as a result of this fix.

- Nothing left broken or suspicious found nearby during this work (the shared `build-fixture.mjs` repro above is
  reported in the SendMessage report as a secondary observation — role-conditioned facts seem to have a
  surprisingly hard time clearing `mine()`'s acceptance bar in general, independent of this bug — worth someone
  else's attention but out of this ticket's scope).
