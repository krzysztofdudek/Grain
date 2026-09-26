// The few references that hold a module cycle together (issue 266).
//
// A cycle's members say which modules reach each other; the cut says what to move. Pinned here: the cut is the
// minimum-weight feedback arc set by reference count (checked against every order of the members on small
// graphs), the file references behind each cut edge are named with their lines, the local search used above the
// exact bound is never better than the exact answer and says it is not proven smallest, and the text says the
// smallest cut is not necessarily the right one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../engine/config.mjs';
import { cycleCuts, cutPhrase } from '../engine/cycle-cut.mjs';
import { moduleGraph } from '../engine/relations.mjs';

const f = (from, to, n = 1, line = 1) => ({ from, to, kind: 'import', n, line });

test('a two-module cycle is held by its lighter direction, named down to file and line', () => {
  const files = ['cli/a.ts', 'cli/b.ts', 'portal/api.ts', 'portal/ui.ts'];
  const edges = [
    f('cli/a.ts', 'portal/api.ts', 7, 3),
    f('cli/b.ts', 'portal/ui.ts', 5, 9),
    f('portal/api.ts', 'cli/a.ts', 3, 27),
    f('portal/api.ts', 'cli/b.ts', 1, 4),
  ];
  const mg = moduleGraph(edges, files, []);
  assert.deepEqual(mg.cycles, [['cli', 'portal']]);
  const [c] = mg.cycleCuts;
  assert.equal(c.references, 16);
  assert.equal(c.cutReferences, 4);
  assert.equal(c.exact, true);
  assert.deepEqual(
    c.cut.map(e => [e.from, e.to, e.n]),
    [['portal', 'cli', 4]]
  );
  assert.deepEqual(
    c.cut[0].refs.map(r => `${r.file}:${r.line}`),
    ['portal/api.ts:27', 'portal/api.ts:4']
  );
  const txt = cutPhrase(c);
  assert.match(txt, /held together by 4 of its 16 references in 1 module edge — portal\/ → cli\/ \(4: portal\/api\.ts:27, portal\/api\.ts:4\)/);
  assert.match(txt, /the smallest cut that breaks it, not necessarily the right one/);
});

// every order of the members, the cheapest backward weight: the definition, by brute force
function bruteForce(members, medges) {
  let best = Infinity;
  const perm = (xs, pre) => {
    if (!xs.length) {
      const pos = new Map(pre.map((v, i) => [v, i]));
      let c = 0;
      for (const e of medges) if (pos.get(e.from) > pos.get(e.to)) c += e.n;
      best = Math.min(best, c);
      return;
    }
    xs.forEach((x, i) => perm(xs.slice(0, i).concat(xs.slice(i + 1)), pre.concat([x])));
  };
  perm(members, []);
  return best;
}
function randomGraphs(count, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out = [];
  for (let t = 0; t < count; t++) {
    const k = 3 + Math.floor(rnd() * 4);
    const members = Array.from({ length: k }, (_, i) => 'm' + i);
    const medges = [];
    for (let i = 0; i < k; i++)
      for (let j = 0; j < k; j++)
        if (i !== j && (j === (i + 1) % k || rnd() < 0.4)) medges.push({ from: members[i], to: members[j], n: 1 + Math.floor(rnd() * 9) });
    out.push({ members, medges });
  }
  return out;
}

test('the exact cut is the cheapest over every order of the members', () => {
  for (const { members, medges } of randomGraphs(60, 11)) {
    const [c] = cycleCuts([members], medges, [], x => x);
    assert.equal(c.exact, true);
    assert.equal(c.cutReferences, bruteForce(members, medges), JSON.stringify(medges));
    // removing the cut leaves no cycle: the order puts every remaining edge forwards
    const pos = new Map(c.order.map((v, i) => [v, i]));
    const cutKeys = new Set(c.cut.map(e => e.from + '>' + e.to));
    for (const e of medges) if (!cutKeys.has(e.from + '>' + e.to)) assert.ok(pos.get(e.from) < pos.get(e.to));
  }
});

test('above the exact bound the local search is never cheaper than the exact cut, and says it is not proven smallest', () => {
  const saved = CFG.fasExactMax;
  try {
    for (const { members, medges } of randomGraphs(40, 5)) {
      const [ex] = cycleCuts([members], medges, [], x => x);
      CFG.fasExactMax = 0;
      const [he] = cycleCuts([members], medges, [], x => x);
      CFG.fasExactMax = saved;
      assert.equal(he.exact, false);
      assert.ok(he.cutReferences >= ex.cutReferences);
      assert.match(cutPhrase(he), /not proven the smallest/);
    }
  } finally {
    CFG.fasExactMax = saved;
  }
});
