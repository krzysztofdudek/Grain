// Regression test for issue 022: `STRUCT_PID`'s `ret` alternative had no word boundary, so the unanchored regex
// `/^auto\.(has|stshape|varshape|first1|ret|arity)/` matched `auto.returns:X` as a PREFIX of `ret` — the bare
// return-SHAPE pid (`auto.ret`, the first return statement's own child node type: `identifier`, `call_expression`,
// `bare`) swallowed the entirely different declared return-TYPE pid (`auto.returns:X`, a domain/semantic marker on
// par with `auto.extends:`/`auto.deco:`/`auto.ptype:`, none of which are in STRUCT_PID's family).
//
// Consequence: mine()'s `_all:` filter (core.mjs, `out.filter(f => !STRUCT_PID.test(f.pid) || ...)`) drops every
// STRUCT_PID-matching `_all:`-scoped fact, treating it as "just syntax, speaks only as a local contrast". Because
// `auto.returns:X` false-matched, a repo-wide "methods here declare a return type of `X`" convention could NEVER
// certify — only a local group/directory CONTRAST against the parent survived. This bug shipped with the plugin's
// very first commit (16fa901) and was invisible until 021 gave C# `rets` for the first time, at which point the
// missing repo-wide fact stood out. Confirmed accidental, not deliberate: `auto.returns:` is listed in `isBool`
// alongside `extends`/`deco`/`ptype` (real semantic booleans), and the file's own comment describes STRUCT_PID as
// exactly "node-type presence, statement shapes, first statement, return SHAPE, arity, local-variable shape" —
// return TYPE was never meant to be part of this family.
//
// Fixed by anchoring each alternative to either a `:`-suffixed family (`has`, `stshape`) or an exact bare pid
// (`varshape`, `first1`, `ret`, `arity`) via a `(?=:|$)` lookahead, so `ret` can no longer prefix-match `returns`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mine, STRUCT_PID } from '../engine/core.mjs';

test('STRUCT_PID matches every intended structural pid, bare and `:`-suffixed alike', () => {
  for (const pid of ['auto.has:call_expression', 'auto.stshape:if(else)', 'auto.varshape', 'auto.first1', 'auto.ret', 'auto.arity'])
    assert.ok(STRUCT_PID.test(pid), `expected STRUCT_PID to match ${pid}`);
});

test('STRUCT_PID no longer prefix-matches `auto.returns:` (the 022 bug)', () => {
  for (const pid of ['auto.returns:error', 'auto.returns:string', 'auto.returns:void'])
    assert.ok(!STRUCT_PID.test(pid), `expected STRUCT_PID NOT to match ${pid} (it is a declared return-TYPE fact, not return-SHAPE)`);
});

// mine() arithmetic (K=2 for boolean pids, per core.mjs's `bl` branch): 28 `true` + 2 `false` =>
// bound = (28 + 0.5) / (30 + 1) = 28.5 / 31 = 0.919 >= 1 - 1/CFG.lambda (0.875) ✓
test('a repo-wide declared-return-type convention now certifies at `_all:method` (022 fix)', () => {
  const ps = [];
  for (let i = 0; i < 28; i++) ps.push({ kind: 'method', rel: `src/svc/a${i}.go`, name: `m${i}`, line: 1, preds: { 'auto.returns:error': 'true' } });
  for (let i = 0; i < 2; i++) ps.push({ kind: 'method', rel: `src/svc/b${i}.go`, name: `n${i}`, line: 1, preds: { 'auto.returns:error': 'false' } });
  const { facts } = mine(ps, { assign: new Map(), amb: new Set() }, () => 1, [], null, null, {});
  const f = facts.find(x => x.pid === 'auto.returns:error' && x.cid === '_all:method');
  assert.ok(f, `expected an accepted _all:method auto.returns:error fact, got pids: ${JSON.stringify(facts.map(x => x.pid + '@' + x.cid))}`);
  assert.equal(f.exp, 'true');
});
