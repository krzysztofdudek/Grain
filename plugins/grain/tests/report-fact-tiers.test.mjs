// Regression test for a `report` presentation bug: facts are ordered purely by `bpi` (codelength gain per instance),
// and bpi does not correlate with population size or human relevance — a crisp SMALL sample (few members, no
// exceptions) can score a higher bpi than a crisp LARGE one, because KT's per-symbol cost shrinks as a sample grows.
// Confirmed by direct computation: a 10-member structural contrast (`auto.arity`, a group whose members all take 0
// parameters where the parent population's default is 1) can out-score a 30-member semantic convention
// (`auto.deco:@Handler`, a group whose members are all annotated) purely on bpi, even though the decorator is the
// kind of thing a maintainer chose and the arity contrast is the null model's own "structural facts speak only as a
// contrast" mechanism (STRUCT_PID in core.mjs) doing its job correctly — it is real evidence, just not a convention
// a reader should be pointed at with equal or higher prominence than an actual chosen pattern.
//
// Fixed in `report()` (core.mjs): the per-partition fact list is split into three tiers — domain/semantic facts
// (anything not STRUCT_PID and not `auto.lex:`) first as before, then a labeled "syntax-shape facts (structural, not
// a chosen convention):" block, then a labeled style-conventions block for the lexical family (already tail-of-list
// before this fix, now explicitly labeled too) — each under its own `--top` cap with its own honest "+N more" line,
// nothing hidden or deleted. `STRUCT_PID` was promoted from a `mine()`-local const to a shared export so `mine()`
// (the contrast gate) and `report()` (the presentation split) can never drift on what counts as "just syntax".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mine, report } from '../engine/core.mjs';

// A minimal synthetic model built directly from mine()'s output (no parsing/history needed — report() only ever
// consumes model.partitions[].facts, built the same way learn() builds them from mine()'s facts).
function tieredModel() {
  const ps = []; const assign = new Map(); const amb = new Set(); let i = 0;
  // group 0: 30 handler methods — a real, maintainer-chosen convention (@Handler on all of them)
  for (let k = 0; k < 30; k++) { ps.push({ kind: 'method', rel: `src/handlers/h${k}.ts`, name: `h${k}`, line: 1, preds: { 'auto.deco:@Handler': 'true', 'auto.arity': '1' } }); assign.set(i, 0); i++; }
  // filler population elsewhere: the parent (`_all`) baseline the group facts above and below are contrasted against
  for (let k = 0; k < 270; k++) { ps.push({ kind: 'method', rel: `src/other/o${k}.ts`, name: `o${k}`, line: 1, preds: { 'auto.deco:@Handler': 'false', 'auto.arity': '1' } }); i++; }
  // group 1: 10 legacy methods — a small, crisp STRUCT contrast (arity 0 vs the partition-wide default of 1)
  for (let k = 0; k < 10; k++) { ps.push({ kind: 'method', rel: `src/legacy/l${k}.ts`, name: `l${k}`, line: 1, preds: { 'auto.arity': '0', 'auto.deco:@Handler': 'false' } }); assign.set(i, 1); i++; }
  const { facts } = mine(ps, { assign, amb }, () => 1, [], null, null, {});
  const exportFacts = facts.sort((a, b) => b.bpi - a.bpi).map(f => ({
    cid: f.cid, kind: f.kind, pid: f.pid, exp: f.exp, share: +f.srawShare.toFixed(3), sraw: f.sraw, bpi: +f.bpi.toFixed(2),
    deviantsN: Math.max(0, Math.round(f.sraw * (1 - f.srawShare))),
    exemplars: f.conform.slice(0, 3).map(gi => ({ rel: ps[gi].rel, line: ps[gi].line, name: ps[gi].name })),
    held: null, trend: undefined, alphabet: f.alphabet, counts: f.counts }));
  return { partitions: [{ name: '_root', scopes: ps.length, medoids: [], files: [...new Set(ps.map(s => s.rel))], facts: exportFacts, templates: [] }], cochange: [], agentShare: null };
}

test('the bpi ordering bug is real: an unfixed sort would rank the 10-member structural contrast above the 30-member semantic convention', () => {
  // this documents WHY the fix is needed — it does not exercise report() (which already carries the fix)
  const ps = []; const assign = new Map(); let i = 0;
  for (let k = 0; k < 30; k++) { ps.push({ kind: 'method', rel: `h${k}`, name: `h${k}`, preds: { 'auto.deco:@Handler': 'true', 'auto.arity': '1' } }); assign.set(i, 0); i++; }
  for (let k = 0; k < 270; k++) { ps.push({ kind: 'method', rel: `o${k}`, name: `o${k}`, preds: { 'auto.deco:@Handler': 'false', 'auto.arity': '1' } }); i++; }
  for (let k = 0; k < 10; k++) { ps.push({ kind: 'method', rel: `l${k}`, name: `l${k}`, preds: { 'auto.arity': '0', 'auto.deco:@Handler': 'false' } }); assign.set(i, 1); i++; }
  const { facts } = mine(ps, { assign, amb: new Set() }, () => 1, [], null, null, {});
  const struct = facts.find(f => f.pid === 'auto.arity'); const semantic = facts.find(f => f.pid === 'auto.deco:@Handler' && f.cid.startsWith('r'));
  assert.ok(struct && semantic, 'both facts must be mined');
  assert.ok(struct.bpi > semantic.bpi, `expected the small structural contrast to out-score the large semantic one on raw bpi: struct=${struct.bpi} semantic=${semantic.bpi}`);
});

test('report() prints domain conventions before a labeled structural-shape block, never interleaved by bpi', () => {
  const model = tieredModel();
  const lines = report(model, { top: 15 });
  const text = lines.join('\n');
  const decoIdx = lines.findIndex(l => l.includes('annotated with `@Handler`'));
  const headingIdx = lines.findIndex(l => l.includes('syntax-shape facts (structural, not a chosen convention):'));
  const arityIdx = lines.findIndex(l => l.includes('take 0 parameter(s)'));
  assert.notEqual(decoIdx, -1, `expected the @Handler convention to be printed: ${text}`);
  assert.notEqual(headingIdx, -1, `expected the structural-shape heading: ${text}`);
  assert.notEqual(arityIdx, -1, `expected the arity contrast to be printed: ${text}`);
  assert.ok(decoIdx < headingIdx, `the semantic convention must print before the structural heading: ${text}`);
  assert.ok(headingIdx < arityIdx, `the structural fact must print after its own heading, not before it: ${text}`);
});

test('each tier caps and reports overflow independently under --top', () => {
  const model = tieredModel();
  const lines = report(model, { top: 0 });
  const text = lines.join('\n');
  // top:0 hides every fact in every tier, but each tier must still say honestly how many it left out (no silent caps)
  assert.match(text, /… and 2 more — run with --top 2 for all/, `domain tier must report its own overflow: ${text}`);
  const structHeadingIdx = lines.findIndex(l => l.includes('syntax-shape facts'));
  assert.notEqual(structHeadingIdx, -1, `structural heading must still show even with --top 0: ${text}`);
  assert.match(lines[structHeadingIdx + 1] || '', /… and 1 more — run with --top 1 for all/, `structural tier must report its own overflow right after its heading: ${text}`);
});
