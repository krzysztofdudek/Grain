// Marker families as alternatives — a field report found a false accusation: `methods here are annotated with
// [ProducesResponseType] — 162/167 established`, with the 5 "deviants" flagged as non-conforming, but all 5 actually
// carry `[Produces(..., Type=...)]` — an equally valid, equally deliberate way to declare the same thing (an HTTP
// response type). Grain has no name-based way to know these two attributes mean the same thing, and must never be
// given one ("kod to kod" — see config.mjs's EXCL/MINE_EXCL ruling) — but it CAN notice, purely statistically, that
// two same-family markers (decorator / supertype / declared return type) behave like ALTERNATIVES on a population:
// they almost never both appear on the same scope, and together they cover nearly everyone either one covers alone.
//
// `altMarkerFor(f, ps)` (core.mjs) is the detector: given an accepted "carries X" fact, it looks at what X's
// deviants carry INSTEAD, in the same marker family, and accepts a candidate alternative only if it (a) clears the
// same >=3-carriers bar any marker must clear repo-wide, (b) covers a 2/3 supermajority of the deviants (the same
// dominance bar `placementHit` uses), and (c) is rare (<10%, mine()'s own absence-boundary floor) among the fact's
// OWN conforming population — i.e. a real two-way split, not overlap/noise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes, mine, altMarkerFor, topDeviants, verbalize, checkFile } from '../engine/core.mjs';

// 167 methods, `_all:method` cell only: 162 carry `[ProducesResponseType]`, 5 carry `[Produces]` instead — the field
// report's exact shape. `extraConformDeco(k)` optionally adds a second deco to the k-th conforming member (test 3).
function fieldPopulation({ nConform = 162, nDeviant = 5, deviantDecos = () => ['[Produces]'], extraConformDeco = () => null } = {}) {
  const ps = [];
  for (let k = 0; k < nConform; k++) { const extra = extraConformDeco(k);
    ps.push({ kind: 'method', rel: `src/c${k}.cs`, name: `C${k}`, line: 1,
      decos: extra ? ['[ProducesResponseType]', extra] : ['[ProducesResponseType]'], sup: [], rets: [],
      preds: { 'auto.deco:[ProducesResponseType]': 'true' } }); }
  for (let k = 0; k < nDeviant; k++) ps.push({ kind: 'method', rel: `src/d${k}.cs`, name: `D${k}`, line: 1,
    decos: deviantDecos(k), sup: [], rets: [], preds: { 'auto.deco:[ProducesResponseType]': 'false' } });
  return ps;
}
function mineFact(ps) {
  const { facts } = mine(ps, { assign: new Map(), amb: new Set() }, () => 1, [], null, null, {});
  return facts.find(f => f.pid === 'auto.deco:[ProducesResponseType]' && f.cid === '_all:method');
}

test('the field case: [Produces] is detected as the alternative to [ProducesResponseType]', () => {
  const ps = fieldPopulation();
  const f = mineFact(ps);
  assert.ok(f, 'the deco fact must be accepted');
  assert.equal(f.exp, 'true');
  assert.equal(f.deviants.length, 5);
  const alt = altMarkerFor(f, ps);
  assert.deepEqual(alt, { pid: 'auto.deco:[Produces]', name: '[Produces]', n: 5, ofDeviants: 5 });
});

test('negative: deviants with no common alternative marker do not fire, and the deviant list is untouched', () => {
  const ps = fieldPopulation({ deviantDecos: () => [] }); // genuinely unexplained deviants — no other marker at all
  const f = mineFact(ps);
  assert.ok(f);
  assert.equal(altMarkerFor(f, ps), null);
  assert.equal(topDeviants(f, ps).length, 5, 'the real deviations must still be there for `check`/`where` to print');
});

test('negative: a candidate common on the CONFORMING population too (not a clean two-way split) does not fire', () => {
  // 30 of the 162 conforming members ALSO carry `[Produces]` alongside `[ProducesResponseType]` — 30/162 ≈ 18.5%,
  // above mine()'s 10% absence-boundary floor, so `[Produces]` reads as an unrelated common companion tag, not a split
  const ps = fieldPopulation({ extraConformDeco: k => (k < 30 ? '[Produces]' : null) });
  const f = mineFact(ps);
  assert.ok(f);
  assert.equal(altMarkerFor(f, ps), null);
});

test('negative: an alternative held by only 1-2 deviants total (< 3 carriers repo-wide) does not fire', () => {
  const ps = fieldPopulation({ nConform: 165, nDeviant: 2 }); // both deviants carry [Produces]; 2 carriers < 3
  const f = mineFact(ps);
  assert.ok(f);
  assert.equal(f.deviants.length, 2);
  assert.equal(altMarkerFor(f, ps), null);
});

test('verbalize() renders an altMarker fact as a two-way split naming both markers and their counts', () => {
  const ps = fieldPopulation();
  const f = mineFact(ps);
  const factExport = { cid: f.cid, kind: f.kind, pid: f.pid, exp: f.exp, sraw: f.sraw,
    deviantsN: Math.max(0, Math.round(f.sraw * (1 - f.srawShare))), altMarker: altMarkerFor(f, ps) };
  assert.equal(factExport.deviantsN, 5);
  const text = verbalize(factExport, ['C0']);
  assert.equal(text, 'methods here are annotated with `[ProducesResponseType]` (162) or `[Produces]` (5)');
});

async function csScope(name, decoOfFoo) {
  const src = `
public class FooController {
    ${decoOfFoo}
    public IActionResult Foo() { return Ok(); }

    [Produces(200, Type = typeof(BarResponse))]
    public IActionResult Bar() { return Ok(); }

    public IActionResult Baz() { return Ok(); }
}
`;
  const p = await getParser('.cs'); const b = bindingFor(p._g); const tree = p.parse(src);
  return { src, scopes: extractScopes('Foo.cs', tree, b, p._g) };
}

test('checkFile: a scope carrying the documented alternative is not a false accusation; a genuine deviant still is', async () => {
  const { src } = await csScope('Foo.cs', '[ProducesResponseType(200, Type = typeof(FooResponse))]');
  const ps = fieldPopulation();
  const f = mineFact(ps);
  const factExport = { cid: f.cid, kind: f.kind, pid: f.pid, exp: f.exp, parentExp: f.parentExp,
    counts: f.counts, srawCounts: f.srawCounts, alphabet: f.alphabet, raw: f.raw, sraw: f.sraw,
    share: +f.srawShare.toFixed(3), bpi: +f.bpi.toFixed(2), tau: f.tau, nSurfaces: f.nSurfaces, siblings: f.siblings,
    exemplars: f.conform.slice(0, 3).map(gi => ({ rel: ps[gi].rel, line: ps[gi].line, name: ps[gi].name })),
    deviantsN: Math.max(0, Math.round(f.sraw * (1 - f.srawShare))), deviants: topDeviants(f, ps), held: null,
    altMarker: altMarkerFor(f, ps) };
  assert.ok(factExport.altMarker, 'sanity: the alt marker must fire for this fixture');
  const vocab = { NT: [], CALL: [], IMP: [], EXT: [], SHAPE: [], DECO: ['[ProducesResponseType]'], RET: [], PT: [],
    DNT: null, ENT: null, RNT: null, PNT: null, LEX: {} };
  const model = { pkgs: ['.'], partitions: [{ name: '_root', vocab, medoids: [], assignments: {}, facts: [factExport] }] };
  const r = await checkFile({ model, root: process.cwd(), rel: 'Foo.cs', content: src, exemplarOk: () => true });
  const byScope = name => r.msgs.find(m => m.scope === name);
  assert.equal(byScope('Foo'), undefined, 'Foo carries the established marker — conforms');
  assert.equal(byScope('Bar'), undefined, 'Bar carries the documented alternative [Produces] — must NOT read as a false accusation');
  assert.ok(byScope('Baz'), 'Baz carries neither marker — a genuine deviation must still be flagged');
});
