// GM-4 — drift and nucleation as an MDL change point on birth order (docs/mathematics.md, "Drift and nucleation").
// The detector reads only the history rows a model already has: `H.lc` (a scope's lifecycle) and `H.vev` (its value
// events). These tests hand it synthetic rows, so every number below is exact.
//
// Arithmetic the assertions lean on, −log2 KT(a ones, b zeros) = −log2[Γ(a+½)Γ(b+½) / (π·Γ(a+b+1))], one commit
// weighing one unit shared by its births:
//   40 ones then 4 zeros, one commit each, 43 boundaries: KT(40,4) − KT(40,0) − KT(0,4) − log2 43 = 11.62 bits of gain
//   the same 44 births with the 4 zeros spread evenly: −2.77, no split pays for itself
//   20 ones then 2 zeros, one commit each: 3.46, above an index cost of 1 bit and below one of 8
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changePointFor, settleChangePoints } from '../engine/weights.mjs';
import { factNotes } from '../engine/core.mjs';

const DAY = 86400;
// one scope per birth: `vals[i]` is the value it was born with, `days[i]` the day of the commit that bore it
function world(vals, days) {
  const ps = [],
    lc = new Map(),
    vev = new Map();
  vals.forEach((v, i) => {
    const s = { rel: `src/h${i}.ts`, kind: 'class', name: `H${i}` };
    ps.push(s);
    const key = `${s.rel}#class#${s.name}`;
    lc.set(key, { path: s.rel, first: days[i] * DAY, last: days[i] * DAY });
    vev.set(key, [{ ts: days[i] * DAY, author: 'a', agent: false, val: { deco: v ? ['X'] : [], sup: [] } }]);
  });
  const fact = {
    pid: 'auto.deco:@X',
    exp: 'true',
    alphabet: ['true', 'false'],
    conform: vals.map((v, i) => (v ? i : -1)).filter(i => i >= 0),
    deviants: vals.map((v, i) => (v ? -1 : i)).filter(i => i >= 0).map(gi => ({ gi })),
  };
  return { fact, ps, H: { lc, vev } };
}
const settle = (...ws) => {
  const cands = ws.map(({ fact, ps, H }) => ({ f: fact, cp: changePointFor(fact, ps, H) }));
  settleChangePoints(cands);
  return cands.map(c => c.f);
};

test('a run of new births without the value, one per commit, is a certified change point and nucleates the new value', () => {
  const vals = [...Array(40).fill(true), ...Array(4).fill(false)];
  const days = vals.map((_, i) => i);
  const w = world(vals, days);
  const cp = changePointFor(w.fact, w.ps, w.H);
  assert.equal(cp.tau, 40);
  assert.ok(Math.abs(cp.gain - 11.62) < 0.01, `gain ${cp.gain}`);
  const [f] = settle(w);
  assert.deepEqual(f.trend.shares.map(s => [s.share, s.n]), [[1, 40], [0, 4]]);
  assert.equal(f.trend.nucleating, 'false');
  assert.equal(f.trend.fading, true);
  assert.equal(f.trend.since, 40 * DAY);
  assert.equal(f.suppressedValue, 'false');
  assert.match(factNotes(f), /trend 100>0%/);
});

test('the same births with the departures spread evenly carry no change point', () => {
  const vals = Array.from({ length: 44 }, (_, i) => !(i % 11 === 10));
  const days = vals.map((_, i) => i);
  const w = world(vals, days);
  const cp = changePointFor(w.fact, w.ps, w.H);
  assert.ok(cp.gain <= 0, `gain ${cp.gain}`);
  const [f] = settle(w);
  assert.equal(f.trend.shares.length, 1);
  assert.equal(f.trend.nucleating, null);
  assert.equal(f.trend.fading, false);
  assert.equal(f.suppressedValue, undefined);
});

test('births in one commit are never split, whatever their order inside it', () => {
  const vals = [...Array(40).fill(true), ...Array(4).fill(false)];
  const w = world(vals, Array(44).fill(0));
  const cp = changePointFor(w.fact, w.ps, w.H);
  assert.equal(cp.gain, 0);
  assert.equal(cp.born, undefined);
});

test('one commit is one observation: a burst of deviant births in a single commit does not make a change point', () => {
  // 40 conforming births one commit each, then ONE commit bearing 11 deviant births, then 3 conforming commits —
  // counted per birth the burst would be a regime; counted per commit it is one departure among 44 commits
  const vals = [...Array(40).fill(true), ...Array(11).fill(false), true, true, true];
  const days = [...Array.from({ length: 40 }, (_, i) => i), ...Array(11).fill(40), 41, 42, 43];
  const w = world(vals, days);
  const cp = changePointFor(w.fact, w.ps, w.H);
  assert.ok(cp.gain <= 0, `gain ${cp.gain}`);
});

test('a convention that strengthens has a change point but is neither fading nor nucleating', () => {
  const vals = [...Array(6).fill(false), ...Array(40).fill(true)];
  const days = [0, 1, 2, 3, 4, 5, ...Array.from({ length: 40 }, (_, i) => 6 + Math.floor(i / 4))];
  const [f] = settle(world(vals, days));
  assert.equal(f.trend.shares.length, 2);
  assert.deepEqual(f.trend.shares.map(s => s.share), [0, 1]);
  assert.equal(f.trend.fading, false);
  assert.equal(f.trend.nucleating, null);
  assert.equal(f.trend.attractor, 'true');
});

test('the index cost is paid once over every fact that had a boundary: a weak cut stops certifying as candidates grow', () => {
  const weak = () => world([...Array(20).fill(true), false, false], Array.from({ length: 22 }, (_, i) => i));
  const [alone] = settle(weak(), weak());
  assert.equal(alone.trend.shares.length, 2, 'two candidates: an index cost of 1 bit');
  const many = settle(...Array.from({ length: 129 }, weak));
  assert.ok(many.every(f => f.trend.shares.length === 1), '129 candidates: an index cost of 8 bits');
});

test('a scope without a readable birth value is left out, and a fact with none has no trend', () => {
  const w = world([true, true], [0, 1]);
  for (const evs of w.H.vev.values()) evs[0].val = null;
  assert.equal(changePointFor(w.fact, w.ps, w.H), null);
});
