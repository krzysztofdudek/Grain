// §061 (instrument A, petclinic corpus) — a catch/finally clause has no name field of its own in any shipped
// grammar (a catch/finally block is anonymous by nature: it is not a named declaration). `extractScopes`'
// blockScope still gives such a clause a `.name` — borrowed from its enclosing method/type ("named after its
// owner") — purely so the clause survives as its own mined population instead of being swept up by the
// anonymous-scope filter (`all[i].name === '<anon>'` in the model-building pipeline). That is a legitimate
// internal mechanism, but every render site that turned it into "`${kind}` `${name}`" text SPOKE it as though
// `name` were the clause's OWN declared name — reproduced on PetController.java, whose catch clause was reported
// as though a catch block were itself named `findOwner`.
//
// Fix (core.mjs): two exported helpers, `scopeNamed`/`scopeBacktick`, render a catch/finally scope as
// "<kind> in `<enclosing>`" everywhere a scope used to render as "<kind> `<name>`" — honest about the name being a
// LOCATION, never the clause's own identity. Every render site that named a scope this way (`checkFile`'s
// deviation/waiver/steer text, `groupDeviations`' aggregated text, `report`/`rules`' exemplar and deviant
// listings) now goes through one of the two helpers. A genuine declaration (kind !== catch/finally) renders
// exactly as before — neither helper changes a single character of that path.
//
// A second, independent leak lived in `whatCmd`'s own "declarations" surface: the file-card branch already
// excluded catch/finally members ("a catch block is named after its owner — on a card it would shadow the
// method itself"), but the group/marker-card branch — which pools every non-file/module kind together
// (`induceRoles`) — had no such guard, so a query for the ENCLOSING declaration's name could surface its
// unrelated catch/finally twin as a second, fabricated "declaration" at a different line. Fixed with the
// identical guard.
//
// This is deliberately NOT a fix to the extraction data itself: `s.name` for a catch/finally scope is left
// exactly as before (still borrowed, still used for `skeyR` identity/clustering/ordinal-disambiguation) — only
// how it is SPOKEN to a human changes. That keeps every other consumer (role clustering, waiver/steer name
// lookup, `EXTR_V`-tracked extraction output) untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getParser,
  bindingFor,
  extractScopes,
  mine,
  checkFile,
  whatCmd,
  scopeNamed,
  scopeBacktick,
} from '../engine/core.mjs';

// ===== extraction: the borrowed-name mechanism itself, unchanged by this fix =====

test('extraction: a Java catch/finally clause borrows its enclosing scope\'s name, never its own', async () => {
  const src = `package pkg;
public class PetController {
  public void findOwner() {
    try {
      doWork();
    } catch (Exception e) {
      handleSilently(e);
    } finally {
      cleanup();
    }
  }
  private void doWork() {}
  private void handleSilently(Exception e) {}
  private void cleanup() {}
}
`;
  const p = await getParser('.java');
  const b = bindingFor(p._g);
  const tree = p.parse(src);
  const scopes = extractScopes('PetController.java', tree, b, p._g);
  const byKindName = (kind, name) => scopes.find(s => s.kind === kind && s.name === name);
  // the SAME physical catch_clause is walked once per enclosing body-bearing ancestor (class AND method both
  // contain it), so it shows up borrowing BOTH names — a separate, pre-existing double-counting fact this ticket
  // does not touch, but real, and worth the director's attention (flagged in the ticket log).
  assert.ok(byKindName('catch', 'PetController'), 'the catch clause also borrows the enclosing TYPE\'s name');
  assert.ok(byKindName('catch', 'findOwner'), 'the catch clause borrows the enclosing METHOD\'s name');
  assert.ok(byKindName('finally', 'findOwner'), 'the finally clause borrows the enclosing METHOD\'s name too');
  // never its own: no shipped grammar's catch/finally node has a name field of its own (checked directly against
  // node-types.json for every grammar this repo ships — cpp/c_sharp/groovy/java/javascript/typescript/tsx/scala/
  // solidity/go/zig all have none; ruby's `rescue`/python's `except_clause` bind the exception TYPE/variable, not
  // the clause's own identity, the same binding-vs-declaration distinction `ownerFor`/named-return handling draw
  // elsewhere in this file) — so the clause is never independently named "catch" or "finally" verbatim.
  assert.equal(byKindName('catch', 'catch'), undefined);
  assert.equal(byKindName('finally', 'finally'), undefined);
});

test('extraction: the same anonymous-clause mechanism holds for Python (a second grammar)', async () => {
  const src = `def find_owner():
    try:
        do_work()
    except Exception as e:
        handle_silently(e)
    finally:
        cleanup()
`;
  const p = await getParser('.py');
  const b = bindingFor(p._g);
  const tree = p.parse(src);
  const scopes = extractScopes('owner.py', tree, b, p._g);
  assert.ok(scopes.find(s => s.kind === 'catch' && s.name === 'find_owner'));
  assert.ok(scopes.find(s => s.kind === 'finally' && s.name === 'find_owner'));
});

// ===== the render fix: honest phrasing, and only for the kinds that need it =====

test('scopeNamed/scopeBacktick: a catch/finally scope reads as a location, never as its own name', () => {
  const c = { kind: 'catch', name: 'findOwner' };
  const fin = { kind: 'finally', name: 'findOwner' };
  assert.equal(scopeNamed(c), 'catch in `findOwner`');
  assert.equal(scopeNamed(fin), 'finally in `findOwner`');
  assert.equal(scopeBacktick(c), 'catch in `findOwner`');
  // a real declaration is completely unaffected — same text as before this fact existed
  const m = { kind: 'method', name: 'findOwner' };
  assert.equal(scopeNamed(m), 'method `findOwner`');
  assert.equal(scopeBacktick(m), '`findOwner`');
});

// 29 conforming catch-kind scopes (call logger.error), 1 deviant — a real `_all:catch` fact via mine(), the
// same technique alt-marker.test.mjs uses for `_all:method`/`_all:type` conventions.
function catchPopulation() {
  const ps = [];
  for (let k = 0; k < 29; k++)
    ps.push({
      kind: 'catch', rel: `src/Other${k}.java`, name: `m${k}`, line: 1, endLine: 3,
      sup: [], decos: [], rets: [], preds: { 'auto.call:logger.error': 'true' },
    });
  ps.push({
    kind: 'catch', rel: 'src/Deviant.java', name: 'dm', line: 1, endLine: 3,
    sup: [], decos: [], rets: [], preds: { 'auto.call:logger.error': 'false' },
  });
  return ps;
}

test('checkFile: PetController.java\'s catch clause is never reported as if `findOwner`/`PetController` were its own name', async () => {
  const JAVA_SRC = `package pkg;
public class PetController {
  public void findOwner() {
    try {
      doWork();
    } catch (Exception e) {
      handleSilently(e);
    }
  }
  private void doWork() {}
  private void handleSilently(Exception e) {}
}
`;
  const ps = catchPopulation();
  const { facts } = mine(ps, { assign: new Map(), amb: new Set() }, () => 1, [], null, null, {});
  const f = facts.find(x => x.pid === 'auto.call:logger.error' && x.cid === '_all:catch');
  assert.ok(f, 'sanity: the catch-blocks-call-logger.error convention must be accepted for this fixture');
  const factExport = {
    cid: f.cid, kind: f.kind, pid: f.pid, exp: f.exp, parentExp: f.parentExp,
    counts: f.counts, srawCounts: f.srawCounts, alphabet: f.alphabet, raw: f.raw, sraw: f.sraw,
    share: +f.srawShare.toFixed(3), bpi: +f.bpi.toFixed(2), tau: f.tau, nSurfaces: f.nSurfaces, siblings: f.siblings,
    exemplars: f.conform.slice(0, 3).map(gi => ({ rel: ps[gi].rel, line: ps[gi].line, endLine: ps[gi].endLine, name: ps[gi].name })),
    deviantsN: Math.max(0, Math.round(f.sraw * (1 - f.srawShare))),
  };
  const vocab = {
    NT: [], CALL: ['logger.error'], IMP: [], EXT: [], SHAPE: [], DECO: [], RET: [], PT: [],
    DNT: null, ENT: null, RNT: null, PNT: null, LEX: {},
  };
  const model = { pkgs: ['.'], partitions: [{ name: '_root', vocab, medoids: [], assignments: {}, facts: [factExport] }] };
  const r = await checkFile({ model, root: process.cwd(), rel: 'src/PetController.java', content: JAVA_SRC, exemplarOk: () => true });
  assert.equal(r.msgs.length, 2, 'the deviation fires once per ancestor the clause is walked under (class + method)');
  for (const m of r.msgs) {
    // the exact fabrication instrument A caught: "Your catch `findOwner` …" reads as though a catch BLOCK were
    // itself named `findOwner`. Must never appear, for either borrowed name.
    assert.doesNotMatch(m.text, /Your catch `[^`]+`/, 'must never claim the borrowed name as the catch clause\'s own');
    // the honest replacement: the borrowed name is spoken as a location, not an identity
    assert.match(m.text, /Your catch in `(findOwner|PetController)` \(line 6\)/);
    // the "Nearest conforming exemplar"/"See:" lines carry the identical fix for the CONFORMING population's names
    assert.doesNotMatch(m.text, /exemplar: \S+ `m0`/, 'must not present the exemplar\'s borrowed name bare either');
    assert.match(m.text, /exemplar: \S+ catch in `m0`/);
  }
});

// ===== the second leak: whatCmd's group/marker-card declarations must not surface the borrowed name either =====

test('whatCmd: a catch clause\'s borrowed name never surfaces as a second "declaration" of its enclosing method', () => {
  const part = {
    name: '_root',
    files: ['pkg/PetController.java'],
    // a role/marker group mixes every non-file/module kind together (§induceRoles) — exactly how a catch-kind
    // member ends up sharing a "group" card with its enclosing method's real declaration
    assignments: {
      'pkg/PetController.java#method#findOwner': 0,
      'pkg/PetController.java#catch#findOwner': 0,
      'pkg/PetController.java#method#findPet': 0,
    },
    medoids: [{ feats: ['tok:find', 'tok:owner'], label: 'findOwner' }],
    facts: [],
    markers: {},
    fileScopes: {
      'pkg/PetController.java': [
        ['method', 'findOwner', 10, 20],
        ['catch', 'findOwner', 15, 18],
        ['method', 'findPet', 30, 36],
      ],
    },
  };
  const model = { partitions: [part], pkgs: ['.'], cochange: [], edges: [], pathsAll: [], filesAll: [] };
  const res = whatCmd({ model, H: null, query: 'findOwner', exemplarOk: () => true, rawScopes: [] });
  assert.deepEqual(
    res.defined.map(d => [d.kind, d.name, d.line]),
    [['method', 'findOwner', 10]],
    'only the real method declaration is reported — never a second, catch-kind entry at the clause\'s own line'
  );
});
