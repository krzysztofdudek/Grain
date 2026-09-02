// Ticket 058 — `explain composer.json` reported PHP-shaped facts on a JSON manifest
// (`auto.imp:PHPUnit\Framework\TestCase = false`). A JSON file structurally cannot import a PHP class, so the
// `false` is vacuous — noise, not a fact — yet `applyVocab` (core.mjs) applied EVERY import token in the shared
// vocabulary (`vb.IMP`, built once per partition across ALL file-kind scopes regardless of grammar) to EVERY
// file-kind scope with no grammar check at all — unlike `auto.has:`/`auto.stshape:`, which already gate on
// `inGrammar(s, nt)` (a node type absent from the scope's own grammar bindings is left UNDECIDED, never `false`).
//
// Investigation (see .system/issues/058-cross-grammar-fact-leak/log.md and 054's Q2, which measured a DIFFERENT
// question — data grammars barely widen the repo-wide candidate count, `idxCost` inflation — and explicitly
// deferred this one: "§058's cross-grammar leak is a real bug about *what a cell says*"): `_all:`/directory cells
// DO pool every grammar's file-kind scopes together by `kind` alone (core.mjs `spectrum`'s cell-building loop,
// and `mine()`'s equivalent), so a cell's population is never grammar-filtered upstream — but a JSON/YAML/TOML/
// properties file (`bindingFor(g).data`, zero name+body scope types — the same flag J7.2 already uses to say
// these grammars carry no importable unit at all) can never itself resolve an import, so scoring it against
// another grammar's import vocabulary is always vacuously `false`.
//
// Fix (core.mjs `applyVocab`): a data-grammar file scope no longer receives ANY `auto.imp:` predicate — absent,
// not `false`, exactly the "undecidable" treatment `inGrammar` already gives an out-of-vocabulary node type.
// Scoped to `b.data` (code vs data), the minimum bar the ticket itself sets, not full same-grammar exclusion:
// unlike `auto.has:`, an import TOKEN is an open-vocabulary value with no grammar-owned catalog to check a scope's
// OWN grammar against, and JS/TS's real cross-extension import sharing (importing the same module from a sibling
// grammar-flavored file) is a legitimate case this fix deliberately leaves alone.
//
// Measured on this fixture (8 PHPUnit-importing PHP files + composer.json, one directory): BEFORE the fix,
// composer.json carried 1 vacuous `auto.imp:PHPUnit\Framework\TestCase = false` fact; AFTER, 0 — see test (1).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getParser, bindingFor, extractScopes, buildVocab, applyVocab, spectrum } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');

async function scopesOf(rel, src) {
  const p = await getParser(rel.slice(rel.lastIndexOf('.')));
  const b = bindingFor(p._g);
  const tree = p.parse(src);
  const out = extractScopes(rel, tree, b, p._g);
  tree.delete();
  return out;
}

const phpTestSrc = i => `<?php
namespace App\\Tests;

use PHPUnit\\Framework\\TestCase;
use App\\Service\\Foo${i};

class Test${i} extends TestCase {
    public function testSomething() {
        $this->assertTrue(true);
    }
}
`;

const composerJson = `{
  "name": "app/symfony-project",
  "require": {
    "php": ">=8.1",
    "symfony/console": "^6.0"
  }
}
`;

// ===========================================================================================================
// (1) UNIT LEVEL — the exact root cause: buildVocab/applyVocab, no repo/history/mine() machinery involved
// ===========================================================================================================
test('(1) a JSON file scope never receives an auto.imp: predicate drawn from a sibling PHP population', async () => {
  const all = [];
  for (let i = 0; i < 8; i++) all.push(...(await scopesOf(`tests/Test${i}.php`, phpTestSrc(i))));
  const jsonScopes = await scopesOf('composer.json', composerJson);
  all.push(...jsonScopes);

  const vocab = buildVocab(all, { deep: true });
  assert.ok(vocab.IMP.includes('PHPUnit\\Framework\\TestCase'), 'the fixture must actually produce a shared PHP import vocabulary to test against');

  for (const s of all) applyVocab(s, vocab);

  const jsonFile = jsonScopes.find(s => s.kind === 'file');
  const impFacts = Object.keys(jsonFile.preds).filter(k => k.startsWith('auto.imp:'));
  assert.deepEqual(impFacts, [], `composer.json must carry zero auto.imp: facts, got: ${JSON.stringify(impFacts)}`);

  // the PHP files themselves are unaffected — they still get the real fact
  const phpFile = all.find(s => s.kind === 'file' && s.g === 'php');
  assert.equal(phpFile.preds['auto.imp:PHPUnit\\Framework\\TestCase'], 'true', 'the fix must not suppress the fact for files whose OWN grammar can carry it');
});

test('(1b) a data grammar with no vocab overlap at all still gets zero auto.imp: keys (not just zero matches)', async () => {
  const all = [];
  for (let i = 0; i < 8; i++) all.push(...(await scopesOf(`tests/Test${i}.php`, phpTestSrc(i))));
  const yamlScopes = await scopesOf('.github/workflows/ci.yml', 'name: CI\non: push\n');
  all.push(...yamlScopes);
  const vocab = buildVocab(all, { deep: true });
  for (const s of all) applyVocab(s, vocab);
  const yamlFile = yamlScopes.find(s => s.kind === 'file');
  assert.deepEqual(Object.keys(yamlFile.preds).filter(k => k.startsWith('auto.imp:')), []);
});

// ===========================================================================================================
// (2) END TO END — `grain status` + `spectrum` (the literal engine behind `explain`, J1.4 byte-identical alias)
// on a real repo fixture: composer.json must never surface an auto.imp: row, at any bits cutoff
// ===========================================================================================================
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { mkdirSync(join(dir, dirname(rel)), { recursive: true }); writeFileSync(join(dir, rel), content); };
const grainIn = (repo, args) => spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' });
const modelIn = repo => JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));
const NO_CUTOFF = -1e9;

let tmp, repo;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-058-'));
  repo = join(tmp, 'r');
  mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main');
  gitIn(repo, 'config', 'commit.gpgsign', 'false');
  // 14, not 8: groupPartitions' own floor (core.mjs, ≥30 scopes to form a partition at all — a repo this size has
  // none to spare) needs the extra headroom for `spectrum` to have a partition to answer from in the first place;
  // the unit-level tests above call buildVocab/applyVocab directly and never hit that floor, so 8 is enough there.
  for (let i = 0; i < 14; i++) w(repo, `tests/Test${i}.php`, phpTestSrc(i));
  w(repo, 'composer.json', composerJson);
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-qm', 'the fixture: 14 PHPUnit test files + composer.json, same repo');
  const r = grainIn(repo, ['status']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('(2) explain/spectrum on composer.json never rows an auto.imp: predicate, at any bits cutoff', async () => {
  const model = modelIn(repo);
  const { rows, lines } = await spectrum({ model, root: repo, rel: 'composer.json', minBits: NO_CUTOFF });
  const impRows = rows.filter(r => r.pid.startsWith('auto.imp:'));
  assert.deepEqual(impRows, [], `composer.json must never be scored against an auto.imp: cell: ${JSON.stringify(impRows)}\nlines:\n${lines.join('\n')}`);
});

test('(3) the same predicate still rows normally for a PHP file in the same repo', async () => {
  const model = modelIn(repo);
  const { rows } = await spectrum({ model, root: repo, rel: 'tests/Test0.php', minBits: NO_CUTOFF });
  const impRow = rows.find(r => r.pid === 'auto.imp:PHPUnit\\Framework\\TestCase');
  assert.ok(impRow, `expected tests/Test0.php to still row its own real auto.imp: fact: ${JSON.stringify(rows.map(r => r.pid))}`);
  assert.equal(impRow.exp, 'true');
});
