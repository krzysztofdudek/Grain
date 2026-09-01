# Work log — 022

## Determination: (a) — real accidental bug, since inception

`STRUCT_PID = /^auto\.(has|stshape|varshape|first1|ret|arity)/` (core.mjs) is unanchored, so its `ret`
alternative prefix-matches `auto.returns:X` (declared return TYPE) as well as `auto.ret` (return-SHAPE: the
first return statement's own child node type — `identifier`, `call_expression`, `bare`). Confirmed with a direct
regex probe: `STRUCT_PID.test('auto.returns:error')` === `true` before the fix.

Evidence for "accidental, not deliberate":
- The file's own comment above `STRUCT_PID` describes the family as "node-type presence, statement shapes, first
  statement, return SHAPE, arity, local-variable shape" — return TYPE is not in that list.
- `isBool` (core.mjs) lists `returns` alongside `extends`/`deco`/`ptype` — real semantic/domain booleans, none of
  which are in `STRUCT_PID`'s alternation. `auto.returns:` was always meant to sit with those, not with `ret`.
- `git blame` on the `STRUCT_PID` line: only ever touched by 13e5136 (promoting a `mine()`-local `const STRUCT`
  to a shared export) — the regex text itself is byte-identical before and after that promotion. Traced further:
  the identical regex (as local `const STRUCT`) already existed in the very first commit of the plugin, 16fa901
  ("grain: the convention and architecture oracle, as a standalone plugin"), which ALSO already contained
  `auto.returns:` (line ~302 of that commit's core.mjs) — both facts coexisted from day one, so this collision
  shipped with the plugin's first commit and was never a deliberate later routing decision.
- No test anywhere asserted the old (broken) behavior (no test checked that `auto.returns:` fails to certify at
  `_all:`), so nothing was relying on it as a feature.

Consequence confirmed directly: `mine()`'s `_all:` filter (`out.filter(f => !STRUCT_PID.test(f.pid) || (!f.cid.startsWith('_all') && ...))`)
dropped every `auto.returns:X` fact scoped to `_all:*`, so a repo-wide "methods here declare a return type of X"
convention could never certify, in any language, since inception — exactly as reported. `where`/`export`'s marker
path (core.mjs, reads `s.rets` directly) is confirmed unaffected, as the reporting agent suspected but did not verify.

## Fix

Anchored `STRUCT_PID` with a lookahead so `ret`/`varshape`/`first1`/`arity` only match as the WHOLE bare pid, and
`has`/`stshape` only match when colon-suffixed:

```
export const STRUCT_PID = /^auto\.(has|stshape|varshape|first1|ret|arity)(?=:|$)/;
```

Verified against every real `auto.*` pid in the codebase (`auto.has:`, `stshape:`, `varshape`, `first1`, `ret`,
`arity`, `returns:`, `call:`, `deco:`, `extends:`, `ptype:`, `imp:`, `lex:`, `nameshape`, `namesuffix`,
`memberorder`, `ctorshape`, `dir1`, `mod`, `mods`, `modsize`, `modexport`, `moddirshape`, `modfileshape`,
`filebirth`, `filenameshape`, `shape`) — the fix flips exactly `auto.returns:*` (and the pathological
`auto.retention`/`auto.retXYZ`, neither of which exist in the codebase) from matching to not matching; every
other pid's classification is unchanged.

Added inline comment at the definition site recording the collision and why `ret`/`returns` are different facts.

## Test

`plugins/grain/tests/struct-pid-returns-boundary.test.mjs` (new, 3 cases):
1. `STRUCT_PID` still matches every intended structural pid (bare and `:`-suffixed).
2. `STRUCT_PID` no longer matches `auto.returns:*`.
3. `mine()` end-to-end: 28/30 methods with `auto.returns:error` (K=2 boolean gate, bound 28.5/31 = 0.919 ≥ 0.875)
   now produces an accepted fact at `cid === '_all:method'`, `exp === 'true'` — pinning that a repo-wide
   declared-return-type convention can certify.

All 3 pass. Full suite green (see shared start/end counts reported to team lead).

## Blast-radius check (per the investigation ask)

No existing test relied on the old behavior; no test needed updating. No newly-certified fact in the existing
test fixtures looked wrong — the only test-suite-visible effect is the new test itself. A real-repo check would
show more `auto.returns:` facts certifying repo-wide across every language now that C# also produces `rets`
(021) — that is the intended, not incidental, effect.

## Follow-up needed (not done here — instructed not to touch config.mjs)

This changes `model.json`'s fact content for previously-indexed repos with no change to extraction (`EXTR_V`
unaffected — `mine()` runs downstream of already-extracted scopes). `MODEL_V` should be bumped so a stale cached
model.json gets relearned with the fixed classification. Reported to team lead; not applied here.
