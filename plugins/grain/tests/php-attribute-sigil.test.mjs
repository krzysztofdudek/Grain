// Ticket 054b — PHP's `#[Attr]` attribute syntax was never recognized as a decoration: `extractScopes`'s
// decoration-attribution walk (`take()`, core.mjs) tested a candidate node's text with a sigil regex that only
// accepted `@` (Java/Python/C# decorators) and `[` (C# attributes), never PHP's `#[Attr]` form — so a real
// Symfony codebase with 6,305 PHP attributes mined ZERO `auto.deco:` facts and produced `"conventions": []` on
// every PHP partition (§054, disease 2 of 3 — see .system/decisions.md's
// `zero-conventions-is-three-diseases-not-lambda` and .system/issues/054*/log.md; disease measured, not
// hypothesized, by widening the sigil in a trial run: 0 -> 37 attribute facts on the ticket's own planted-omission
// case, `SecretsFooCommand.php` omitting `#[AsCommand]` among ~30 peers that all carry it).
//
// tree-sitter-php's own grammar already names the node `attribute_list`, already matched by the pre-existing
// `/decorator|annotation|attribute_list/` node-type vocabulary in `bindingFor` — only the TEXT-sigil test in
// `take()` needed widening, the same way §043 widened it for Solidity's sigil-less modifiers. `#[` joins `@` and
// `[` as a decoration sigil there: a character-pattern widening, not a `if (lang === 'php')` special case.
//
// Storage/display follow the SAME "self-delimiting sigil" convention `[Route]` (C#) already used — a stored deco
// that already carries its own wrapping sigil renders as-is; `@` is reconstructed only for the sigil-less-in-
// storage `@Test` (Java/Kotlin) case. `decoSigiled`/`decoLabel` (core.mjs) now recognize `#[` alongside `[`, and
// every site that used to test `d.startsWith('[')` alone (pred-pid construction, marker labels/pids, "also @X"
// observations, export.mjs's marker JSON) now goes through them — otherwise a PHP attribute would round-trip as
// the double-sigiled `@#[AsCommand]`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');

const scopesOf = async (ext, src) => {
  const p = await getParser(ext);
  const g = p._g;
  const b = bindingFor(g);
  const t = p.parse(src);
  const out = extractScopes('f' + ext, t, b, g)
    .filter(s => s.kind !== 'file')
    .map(s => ({ kind: s.kind, name: s.name, decos: s.decos }));
  t.delete();
  return out;
};

// ---- extraction: a PHP `#[Attr]` attribute is now read the same way a Java `@Test`/C# `[Route]` already is ----
test('054b: a PHP `#[Attr(...)]` attribute above a class is extracted as a decoration', async () => {
  const got = await scopesOf(
    '.php',
    `<?php

namespace App\\Command;

#[AsCommand(name: 'app:widget:alpha')]
class AlphaCommand extends Command
{
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        return Command::SUCCESS;
    }
}
`
  );
  const cls = got.find(s => s.kind === 'type' && s.name === 'AlphaCommand');
  assert.ok(cls, `expected a type scope named AlphaCommand: ${JSON.stringify(got)}`);
  // rendered exactly as written, like `[Route]` (C#) and unlike bare-stored `@Test` (Java) — §054b
  assert.deepEqual(
    cls.decos,
    ['#[AsCommand]'],
    `expected the #[AsCommand] attribute read as a decoration: ${JSON.stringify(cls)}`
  );
});

test('054b: a PHP class with no attribute still extracts cleanly with an empty decos list', async () => {
  const got = await scopesOf(
    '.php',
    `<?php

namespace App\\Command;

class SecretsFooCommand extends Command
{
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        return Command::SUCCESS;
    }
}
`
  );
  const cls = got.find(s => s.kind === 'type' && s.name === 'SecretsFooCommand');
  assert.ok(cls, `expected a type scope named SecretsFooCommand: ${JSON.stringify(got)}`);
  assert.deepEqual(cls.decos, []);
});

// ---- end to end: the convention is learnable, and the planted omission is flagged as a deviation ----
// A Symfony-shaped repo of console-command classes, all carrying `#[AsCommand(name: '...')]` above the class
// declaration, in one directory (`src/Command/`) — same shape and proportions as the ticket's own real-world
// measurement (~30 peers, one omitting it). Built with a scripted, backdated history (three waves) so the
// convention is established by HEAD, exactly the technique `solidity-modifiers.test.mjs` (§043) used for the
// same class of bug (a sigil `take()` didn't recognize yet).
let tmp, repo;
const NAMES = [
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa',
  'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon',
  'Phi', 'Chi', 'Psi', 'Omega', 'Ash', 'Birch', 'Cedar', 'Dune', 'Elm', 'SecretsFoo',
];
const H = `<?php

namespace App\\Command;

use Symfony\\Component\\Console\\Attribute\\AsCommand;
use Symfony\\Component\\Console\\Command\\Command;
use Symfony\\Component\\Console\\Input\\InputInterface;
use Symfony\\Component\\Console\\Output\\OutputInterface;

`;
// note: the attribute is written BARE (no parentheses/arguments). A role's structural-shape template also counts
// node-type occurrences INSIDE a scope's own direct content (crossing into a nested method body is a separate,
// scope-bounded concern) — `#[AsCommand(name: '...')]`'s own `argument` node would otherwise be the class's ONLY
// occurrence of that node type, so stripping the attribute would incidentally also flip an unrelated
// `auto.shape:argument` structural fact and the planted omission below would show 2 deviations instead of the one
// this test is about. The dedicated unit test above already covers the WITH-arguments form.
const cmdSrc = name =>
  H +
  `#[AsCommand]
class ${name}Command extends Command
{
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        return Command::SUCCESS;
    }
}
`;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-php-attr-'));
  repo = join(tmp, 'r');
  mkdirSync(repo);
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'F', GIT_AUTHOR_EMAIL: 'f@x',
    GIT_COMMITTER_NAME: 'F', GIT_COMMITTER_EMAIL: 'f@x',
    TZ: 'UTC', HOME: repo,
  };
  const g = (a, x = {}) =>
    execFileSync('git', ['-C', repo, ...a], { env: { ...env, ...x }, stdio: ['ignore', 'pipe', 'pipe'] });
  const w = (rel, c) => {
    const p = join(repo, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, c);
  };
  let day = 0;
  const T0 = Date.UTC(2024, 0, 15, 12, 0, 0);
  const commit = m => {
    day += 60;
    const d = new Date(T0 + day * 86400000).toISOString();
    g(['add', '-A']);
    g(['commit', '-q', '-m', m], { GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d });
  };
  g(['init', '-q', '-b', 'main']);
  g(['config', 'commit.gpgsign', 'false']);
  for (const [a, b] of [[0, 10], [10, 20], [20, 30]]) {
    for (const n of NAMES.slice(a, b)) w(`src/Command/${n}Command.php`, cmdSrc(n));
    commit('feat: wave');
  }
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' });
  assert.equal(st.status, 0, st.stdout + st.stderr);
});
after(() => rmSync(tmp, { recursive: true, force: true }));

test('054b: `#[AsCommand]` certifies as a convention of its own', () => {
  const model = JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));
  const facts = model.partitions.flatMap(p => p.facts);
  const f = facts.find(x => x.pid === 'auto.deco:#[AsCommand]' && x.exp === 'true');
  assert.ok(f, `no accepted #[AsCommand] convention: ${JSON.stringify(facts.map(x => x.pid))}`);
  assert.equal(f.share, 1);
  assert.ok(f.sraw >= 5, `population too small to be a convention: ${f.sraw}`);
});

test('054b: a peer that omits the attribute is flagged by check as a known deviation', () => {
  // planted as an uncommitted edit — the shape `check`/`review` are made to catch, same technique §043 used
  const f = join(repo, 'src/Command/SecretsFooCommand.php');
  const src = readFileSync(f, 'utf8');
  const attrLine = `#[AsCommand]\n`;
  assert.ok(src.includes(attrLine));
  writeFileSync(f, src.replace(attrLine, ''));

  const chk = spawnSync('node', [BIN, 'check', 'src/Command/SecretsFooCommand.php'], {
    cwd: repo,
    encoding: 'utf8',
  });
  assert.equal(chk.status, 0, chk.stderr);
  // at least one known deviation in the change, and it must be the `#[AsCommand]` marker itself — never the
  // exact count: this fixture is deliberately so uniform (the attribute is the ONLY thing that varies across
  // members) that the attribute's own AST nodes also surface as a structural-shape "practiced" convention
  // (`auto.shape:attribute`) alongside the marker one (`auto.deco:#[AsCommand]`) — two independent surfaces
  // correctly reporting the same real omission, not a double-count bug.
  // "known deviation(s)" only appears when a new-scope disclosure is ALSO pending (§010-c) — SecretsFooCommand is
  // an already-known (sticky) member here, so the plain "deviation(s)" wording is the correct one to expect.
  assert.match(chk.stdout, /[1-9]\d* deviation\(s\) in your change/, chk.stdout);
  assert.match(chk.stdout, /types here are annotated with `#\[AsCommand\]`/, chk.stdout);
  assert.match(
    chk.stdout,
    /`SecretsFooCommand`[^\n]*is not annotated with `#\[AsCommand\]`/,
    chk.stdout
  );

  const rev = spawnSync('node', [BIN, 'review'], { cwd: repo, encoding: 'utf8' });
  assert.equal(rev.status, 0, rev.stderr);
  assert.match(rev.stdout, /[1-9]\d* finding\(s\)/, rev.stdout);
  assert.match(rev.stdout, /SecretsFooCommand/, rev.stdout);
  assert.match(rev.stdout, /#\[AsCommand\]/, rev.stdout);
});
