// Issue 040 — a C/C++ declaration carrying an unparsed token between its keyword and its name (an export or
// visibility macro: `class LEVELDB_EXPORT Comparator {`) was not extracted as the type it is, and on the C
// grammar the MACRO's own token was recorded as the declaration's name.
//
// The grammar's own view, which decides the shape of the fix. Neither grammar can parse a macro sitting between
// `class`/`struct` and the name — there is nothing in the source that says the token is a macro — so both
// RECOVER, and they recover the same way: as a function definition whose "return type" is the keyword plus the
// token and whose "function name" is the real class name.
//
//   class LEVELDB_EXPORT Comparator { … };     (tree-sitter-cpp)
//     function_definition {type=class_specifier «class LEVELDB_EXPORT», declarator=identifier «Comparator»,
//                          body=compound_statement}
//
// So the real name is already in the declarator, where `scopeName` reads it, and the macro token is only ever the
// bodyless specifier's own `name` — which nothing reads. The fix does not look for a macro and names none: it
// observes that a scope the grammar names through a `declarator` field, whose declarator chain declares no
// `parameters` anywhere, is not a callable at all — a callable's name and its parameter list come from the same
// declarator, so a chain without one never spelled a function. Where such a node's `type` field holds a BODY-LESS
// type-declaring specifier it is a type, named by its declarator; anything else is a construct the grammar could
// not recover a name for (a range-for's loop variable) and is recorded not at all, only walked into.
//
// Structurally confined to C and C++ by the grammars themselves: they are the only two of the 23 shipped
// node-types.json that declare a scope node with both a `body` and a `declarator` field, so no other language can
// move. `no_other_grammar_declares_a_declarator_named_scope` below holds that claim to the grammars.
//
// Note on `.h`: the extension map sends `.h` to the C grammar, so a C++ header's `class` declarations are parsed
// by a grammar with no `class` keyword. That is a separate defect (reported to the maintainer, not fixed here);
// what this file pins is that the macro token stops being recorded as a NAME under either grammar, and that under
// the C++ grammar the real name and kind are recovered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, extractScopes, bindingFor } from '../engine/core.mjs';
import { GRAMMARS, GRAMMAR_DIR } from '../engine/config.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const scopesOf = async (ext, src) => {
  const p = await getParser(ext); const g = p._g; const b = bindingFor(g);
  const t = p.parse(src); const out = extractScopes('f' + ext, t, b, g).filter(s => s.kind !== 'file')
    .map(s => ({ kind: s.kind, name: s.name, nt: s.nt }));
  t.delete(); return out; };

// ---- trigger 1: an export macro before the class name (leveldb's entire public API) ----
test('040/1: a class carrying an export macro is extracted as a TYPE under its own name, not the macro\'s', async () => {
  const got = await scopesOf('.cc', `namespace n {
class EXPORT_ME Comparator {
 public:
  virtual ~Comparator();
  virtual int Compare(const Slice& a) const = 0;
};
}
`);
  assert.deepEqual(got, [{ kind: 'type', name: 'Comparator', nt: 'function_definition' }]);
});

test('040/1b: the same holds for a struct — the shape is the keyword, not the word `class`', async () => {
  const got = await scopesOf('.cc', 'struct EXPORT_ME Options {\n  int block_size;\n};\n');
  assert.deepEqual(got, [{ kind: 'type', name: 'Options', nt: 'function_definition' }]);
});

// ---- trigger 2: a trailing attribute macro on a method (Clang thread-safety annotations) ----
test('040/2: a trailing attribute macro on a method leaves the class and its real methods intact', async () => {
  const got = await scopesOf('.cc', `class DBImpl {
 public:
  void CompactMemTable() EXCLUSIVE_LOCKS_REQUIRED(mutex_);
  Status Recover(VersionEdit* edit) EXCLUSIVE_LOCKS_REQUIRED(mutex_);
  void Ok() { return; }
};
`);
  assert.deepEqual(got, [
    { kind: 'type', name: 'DBImpl', nt: 'class_specifier' },
    { kind: 'method', name: 'Ok', nt: 'function_definition' }]);
});

// ---- trigger 3: a template class (independent of macros) ----
test('040/3: a template class is extracted as a type with its members', async () => {
  const got = await scopesOf('.cc', `template <typename Key, class Comparator>
class SkipList {
 public:
  explicit SkipList(Comparator cmp);
  void Insert(const Key& key) { rep_.push(key); }
  bool Contains(const Key& key) const { return rep_.has(key); }
};
`);
  assert.deepEqual(got, [
    { kind: 'type', name: 'SkipList', nt: 'class_specifier' },
    { kind: 'method', name: 'Insert', nt: 'function_definition' },
    { kind: 'method', name: 'Contains', nt: 'function_definition' }]);
});

// ---- the load-bearing negative: the macro's own token is never a scope NAME ----
// Under the C grammar this is the whole visible symptom, and it is the one `.h` actually reaches: `class` is not
// a keyword there, so the grammar reads `class` as a return type and the MACRO as the declarator — the file then
// contributed a declaration named after the macro and none named after the class. Which macro spellings land that
// way is a property of the C parser's error recovery, not of the macro (`MYLIB_EXPORT` reproduces it, `LIB_API`
// recovers differently and binds the class name); this fixture uses one that does, so the test is not vacuous.
// Both grammars are checked, because `.h` reaches the C one and `.cc`/`.hpp` the C++ one.
test('040: the macro token is never itself recorded as a scope name, under either C or C++', async () => {
  const src = `class MYLIB_EXPORT Comparator {
 public:
  virtual ~Comparator();
  virtual void Shorten(std::string* s) const = 0;
};
`;
  for (const ext of ['.h', '.cc']) {
    const names = (await scopesOf(ext, src)).map(s => s.name);
    assert.ok(!names.includes('MYLIB_EXPORT'), `${ext}: macro token recorded as a scope name: ${JSON.stringify(names)}`);
  }
  // and under the C++ grammar the real declaration is recovered, not merely dropped
  assert.deepEqual(await scopesOf('.cc', src), [{ kind: 'type', name: 'Comparator', nt: 'function_definition' }]);
});

test('040: a trailing attribute macro on a bodiless method declaration names nothing', async () => {
  const names = (await scopesOf('.cc', `class DBImpl {
  void CompactMemTable() EXCLUSIVE_LOCKS_REQUIRED(mutex_);
};
`)).map(s => s.name);
  assert.ok(!names.includes('EXCLUSIVE_LOCKS_REQUIRED'), JSON.stringify(names));
});

// ---- controls: nothing that IS a callable moves ----
test('040: ordinary functions, constructors, destructors and conversion operators stay methods', async () => {
  const got = await scopesOf('.cc', `int add(int a, int b) { return a + b; }
struct S {
  S() { }
  ~S() { }
  operator int() { return 1; }
};
`);
  assert.deepEqual(got, [
    { kind: 'method', name: 'add', nt: 'function_definition' },
    { kind: 'type', name: 'S', nt: 'struct_specifier' },
    { kind: 'method', name: 'S', nt: 'function_definition' },
    { kind: 'method', name: '<anon>', nt: 'function_definition' },   // ~S(), named by a destructor_name
    { kind: 'method', name: '<anon>', nt: 'function_definition' }]); // operator int(), named by an operator_cast
});

test('040: a function whose RETURN type is a body-less struct specifier is still a method, not a type', async () => {
  // `Point make() { … }` has the same body-less type specifier in its `type` field as `struct EXPORT_ME Options`,
  // and is told apart by the one thing that distinguishes them: it has a parameter list.
  const got = await scopesOf('.cc', 'struct Point { int x; };\nstruct Point make() { return Point(); }\n');
  assert.deepEqual(got, [
    { kind: 'type', name: 'Point', nt: 'struct_specifier' },
    { kind: 'method', name: 'make', nt: 'function_definition' }]);
});

test('040: a range-for loop variable is no longer recorded as a method of its own', async () => {
  const got = await scopesOf('.cc', 'void g(Map& m) { for (auto kv : m) { h(kv); } }\n');
  assert.deepEqual(got, [{ kind: 'method', name: 'g', nt: 'function_definition' }]);
});

// ---- the boundary: three macro shapes this fix does NOT reach, pinned so the limit is visible ----
// All three are shapes where the macro is not merely BESIDE a declaration but STANDS IN for one, so the grammar
// has nothing left that distinguishes it from the real thing. Measured on leveldb: the export/visibility family
// this fix removes accounted for 17 macro-named scopes (LEVELDB_EXPORT ×14, LOCKABLE ×2, SCOPED_LOCKABLE ×1),
// all now gone; 240 remain, and they are these shapes.
test('040 boundary: a macro that expands to a whole definition is still named after the macro', async () => {
  // `TEST_F(DBTest, Empty) { … }` is, to the grammar, a function named TEST_F taking two parameters and having a
  // body. Nothing about it differs from a real function definition, so no field-driven rule can tell them apart.
  // 230 of leveldb's remaining 240 are this (TEST_F ×177, TEST ×52, TEST_P ×1).
  assert.deepEqual(await scopesOf('.cc', 'TEST_F(DBTest, Empty) {\n  ASSERT_TRUE(db_ != nullptr);\n}\n'),
    [{ kind: 'method', name: 'TEST_F', nt: 'function_definition' }]);
});

test('040 boundary: a trailing attribute macro on a method WITH a body takes that method\'s name', async () => {
  // The grammar splits the method in two: a bodiless `field_declaration` carrying the real signature (not a
  // scope — no body), and a `function_definition` pairing the MACRO's declarator with the real body. Telling
  // that apart from an in-class constructor (also a `function_definition` with no return type) needs the
  // declarator's name compared against the enclosing class's, which is a different kind of rule from this one.
  // 10 of leveldb's remaining 240 are this. The bodiless form — a header declaration — is already benign above.
  assert.deepEqual(await scopesOf('.cc', `class X {
  void Remove(const std::string& f)
      EXCLUSIVE_LOCKS_REQUIRED(mutex_) {
    map_.erase(f);
  }
};
`), [{ kind: 'type', name: 'X', nt: 'class_specifier' },
     { kind: 'method', name: 'EXCLUSIVE_LOCKS_REQUIRED', nt: 'function_definition' }]);
});

test('040 boundary: an EMPTY-bodied macro-decorated class still names the macro', async () => {
  // With no members, `class MYLIB_EXPORT Empty {};` parses cleanly as a variable declaration — a body-less
  // `class_specifier` named MYLIB_EXPORT, and `Empty {}` as an init_declarator. That body-less specifier is
  // indistinguishable from the genuine forward declaration in the next assertion, which grain extracts on
  // purpose. Does not occur in leveldb (all 14 of its LEVELDB_EXPORT classes have members).
  assert.deepEqual(await scopesOf('.cc', 'class MYLIB_EXPORT Empty {\n};\n'),
    [{ kind: 'type', name: 'MYLIB_EXPORT', nt: 'class_specifier' }]);
  assert.deepEqual(await scopesOf('.cc', 'class Slice;\n'),
    [{ kind: 'type', name: 'Slice', nt: 'class_specifier' }]); // the shape it cannot be told apart from
});

// ---- confinement: the rule cannot reach any other language ----
test('040: no grammar but C and C++ declares a scope node named through a `declarator` field', () => {
  const declaratorNamed = [];
  for (const g of GRAMMARS) {
    const nt = JSON.parse(readFileSync(join(GRAMMAR_DIR, `tree-sitter-${g}.node-types.json`), 'utf8'));
    if (nt.some(n => { const f = n.fields || {}; return f.body && !f.name && f.declarator; })) declaratorNamed.push(g);
  }
  assert.deepEqual(declaratorNamed.sort(), ['c', 'cpp']);
});
