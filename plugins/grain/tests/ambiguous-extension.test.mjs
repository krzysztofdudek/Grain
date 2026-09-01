// Issue 040, second half — `.h` names two languages, and the map could only name one.
//
// `EXT2GRAMMAR` sent every `.h` to the C grammar, which has no `class`, no `namespace` and no templates at all.
// leveldb keeps its entire public API in `.h`, so 47 of its 56 headers failed to parse and `what Comparator`
// could not name the interface at include/leveldb/comparator.h:20 — nothing there was ever extracted. Measured
// both ways: 319 scopes / 45 types under C, 515 / 163 under C++.
//
// The fix does not write down which projects use `.h` for what. `parseFile` asks BOTH grammars the extension may
// denote and keeps the one that actually parsed the bytes — the same instinct as §018 phase 2, where a macro
// body's re-parse is kept only if the grammar accepts it. Three properties, pinned below:
//
//   1. The grammar decides. No name list, no project detection, no content sniffing beyond "did this parse".
//   2. No new tuned constant. "Strictly fewer failures" compares two parses of the same bytes; there is no ratio,
//      threshold or minimum anywhere in it.
//   3. The DECLARED mapping wins ties — the load-bearing one. C++ is very nearly a syntactic superset of C, so a
//      genuine C header usually parses cleanly under both; if ties migrated, real C projects would silently move
//      onto C++ node types and every predicate derived from node-types.json would change under them. Measured on
//      redis and curl: 117 headers tie, and every one stays C.
//
// Why a declared sibling rather than a search over all 23 grammars: php, yaml and properties accept arbitrary
// text and therefore "parse cleaner" than any real grammar on anything — measured, php beat C on 20 of leveldb's
// 56 headers, 75 errors down to 0. A search is not merely slower, it is wrong.
//
// Why only `.h`: measured across 5.6k files of 17 extensions in 20 repositories. `.h` — 384 of 1011 strictly
// cleaner under C++. `.c` — 30 of 1240, every one a jemalloc header where BOTH grammars fail badly and C++ merely
// fails less (210 → 200 errors); noise, excluded. `.cc` — 2 of 565, same character. Every other extension
// measured (`.ts` `.tsx` `.js` `.mjs` `.jsx` `.json` `.yaml` `.yml` `.toml` `.gradle` `.hpp` `.cpp` `.scala`
// `.groovy`) — zero. `ext_alt_is_only_the_measured_one` below holds that conclusion to the config.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFile, getParser, extractScopes, bindingFor } from '../engine/core.mjs';
import { EXT_ALT, EXT2GRAMMAR, GRAMMARS } from '../engine/config.mjs';

const chosen = async (ext, src) => { const { p, tree } = await parseFile(ext, src); const g = p._g; tree.delete(); return g; };
const scopesOf = async (ext, src) => { const { p, tree } = await parseFile(ext, src);
  const out = extractScopes('f' + ext, tree, bindingFor(p._g), p._g).filter(s => s.kind !== 'file')
    .map(s => ({ kind: s.kind, name: s.name })); tree.delete(); return out; };
// the same failure measure `parseFile` uses, restated here so the tests can assert the ARITHMETIC of a case
// (a tie, a strict win) rather than only its outcome
const errsOf = async (ext, src) => { const p = await getParser(ext); const t = p.parse(src);
  let n = 0; const st = [t.rootNode];
  while (st.length) { const x = st.pop(); if (x.isError || x.isMissing) n++; if (x.hasError) for (const c of x.children) st.push(c); }
  t.delete(); return n; };

test('040: the ambiguous-extension list is exactly the one measured, and names a shipped grammar', () => {
  assert.deepEqual(EXT_ALT, { '.h': 'cpp' });
  for (const [ext, g] of Object.entries(EXT_ALT)) {
    assert.ok(EXT2GRAMMAR[ext], `${ext} is not in the extension map at all`);
    assert.ok(GRAMMARS.includes(g), `${ext}'s alternative ${g} is not a shipped grammar`);
    assert.notEqual(EXT2GRAMMAR[ext], g, `${ext}'s alternative is its own declared grammar`); }
  // `.c` and `.cc` were measured and deliberately excluded — both only ever moved on noise
  assert.equal(EXT_ALT['.c'], undefined);
  assert.equal(EXT_ALT['.cc'], undefined);
});

test('040: a C++ header the C grammar cannot parse is read with the C++ grammar', async () => {
  const src = 'template <typename T>\nclass Box {\n public:\n  T get() { return v_; }\n private:\n  T v_;\n};\n';
  assert.equal(await errsOf('.h', src), 3);   // C fails
  assert.equal(await errsOf('.cc', src), 0);  // C++ does not — a strict win, so the alternative is taken
  assert.equal(await chosen('.h', src), 'cpp');
  assert.deepEqual(await scopesOf('.h', src), [{ kind: 'type', name: 'Box' }, { kind: 'method', name: 'get' }]);
});

test('040: a plain C header stays on the C grammar', async () => {
  const src = 'struct Point { int x; int y; };\nint add(int a, int b);\n';
  assert.equal(await errsOf('.h', src), 0); // clean under the declared grammar — the alternative is never consulted
  assert.equal(await chosen('.h', src), 'c');
});

// The load-bearing tie-break. Both grammars fail identically here, so there is no evidence either way and the
// declared mapping keeps the file. Without this, "fewer OR EQUAL failures" would migrate every C header that ties.
test('040: a tie keeps the declared grammar, even when BOTH grammars fail', async () => {
  const src = 'struct S { int x; };\n@@@\nint f(void);\n';
  assert.equal(await errsOf('.h', src), 2);
  assert.equal(await errsOf('.cc', src), 2); // equal, not fewer
  assert.equal(await chosen('.h', src), 'c');
});

test('040: a tie keeps the declared grammar when both parse CLEANLY too', async () => {
  // C's error recovery is forgiving enough to accept this without complaint, so it ties at zero and stays C.
  // That is the conservative side of the trade, and it is the side that protects real C projects.
  const src = 'namespace n {\nclass Foo {\n public:\n  void run();\n};\n}\n';
  assert.equal(await errsOf('.h', src), 0);
  assert.equal(await errsOf('.cc', src), 0);
  assert.equal(await chosen('.h', src), 'c');
});

test('040: an extension with no second reading is never re-parsed', async () => {
  for (const [ext, src] of [['.c', 'int add(int a, int b) { return a + b; }\n'],
                            ['.py', 'def f():\n    return 1\n'],
                            ['.cc', 'class A { public: void run() {} };\n']])
    assert.equal(await chosen(ext, src), EXT2GRAMMAR[ext]);
});

test('040: the choice is a property of the CONTENT, so one repo can hold both readings of `.h`', async () => {
  // the case that makes the per-file decision necessary rather than a per-repo one: redis ships C headers and a
  // Qt (C++) adapter header side by side, and both are `.h`
  assert.equal(await chosen('.h', 'struct Point { int x; };\nint add(int a, int b);\n'), 'c');
  assert.equal(await chosen('.h', 'class A {\n public:\n  A() : x_(0) {}\n private:\n  int x_;\n};\n'), 'cpp');
});
