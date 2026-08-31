// Regression test for G16: `extractScopes`'s anonymous-function-assignment detector ("a function
// on the right of an assignment is named by its left side") tested the right-hand node's TYPE with
// an unbounded substring regex `/function|arrow|lambda|func_literal|closure/`. PHP names a plain
// function-CALL node `function_call_expression` — the substring `function` matches — so
// `$expected = json_decode($y);` was misread as an anonymous function assignment, creating a
// phantom `method` scope named `$expected` (the sigil-prefixed variable), since a call node has no
// `name` field and the anonymity guard is vacuously true.
//
// Word-bounding alone does not fix this: `function_call_expression`'s own segments are
// `function`/`call`/`expression`, so a word-bounded match still fires on it. The real
// distinguishing signal is structural: a genuine lambda/closure/function-literal has a BODY to
// execute; a call expression does not. Fixed by requiring both the word-bounded type match AND a
// real body.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';

async function scopesOf(ext, src) {
  const p = await getParser(ext); const b = bindingFor(p._g); const tree = p.parse(src);
  return extractScopes('X' + ext, tree, b, p._g);
}

test('PHP: a plain function call assigned to a variable is not turned into a phantom method scope', async () => {
  const scopes = await scopesOf('.php', '<?php $expected = json_decode($y); ?>');
  const phantom = scopes.find(s => s.name === '$expected');
  assert.equal(phantom, undefined, `expected no scope named $expected, got ${JSON.stringify(scopes.map(s => [s.kind, s.name, s.nt]))}`);
});

test('PHP: a real anonymous function assigned to a variable is still extracted (regression control)', async () => {
  const scopes = await scopesOf('.php', '<?php $fn = function () { return 1; }; ?>');
  const fn = scopes.find(s => s.name === '$fn' && s.nt === 'anonymous_function');
  assert.ok(fn, `expected an extracted anonymous-function scope named $fn, got ${JSON.stringify(scopes.map(s => [s.kind, s.name, s.nt]))}`);
});

test('PHP: a real arrow function assigned to a variable is still extracted (regression control)', async () => {
  const scopes = await scopesOf('.php', '<?php $fn = fn($a) => $a; ?>');
  const fn = scopes.find(s => s.name === '$fn' && s.nt === 'arrow_function');
  assert.ok(fn, `expected an extracted arrow-function scope named $fn, got ${JSON.stringify(scopes.map(s => [s.kind, s.name, s.nt]))}`);
});

test('JS: a real anonymous function assigned to a const is still extracted (regression control, cross-language)', async () => {
  const scopes = await scopesOf('.js', 'const f = () => { return 1; };\n');
  const fn = scopes.find(s => s.name === 'f');
  assert.ok(fn, `expected an extracted anonymous-function scope named f, got ${JSON.stringify(scopes.map(s => [s.kind, s.name, s.nt]))}`);
});
