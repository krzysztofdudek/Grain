// J5.7(b) — scope-level co-change: the SAME replay-time accumulator pattern history.mjs already uses for FILE
// pairs (`state.pairSup`/`state.fileCommits` → `H.cochange`), mirrored onto the SCOPE keys inside each commit's own
// `touched` set (§J2.1) — `state.scopePairSup`/`state.scopeCommits` → `H.scopeCochange`, finalized onto the model as
// `model.scopeCochange` (remapped through `currentPathOf`, §J4.1, at learn-time — `checkFile` never sees `H`).
//
// A scope only registers as "touched" in a commit when its BODY HASH changes (structure/calls/decorators/supertype,
// not literal values — see history-footprints.test.mjs's own note) or when it is BORN. Every fixture below changes
// the CALLED helper name each commit specifically to force that hash to move — a bare literal edit would silently
// produce zero touches past the birth commit and make every test here pass for the wrong reason.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadHistory } from '../engine/history.mjs';
import { CFG } from '../engine/config.mjs';
import { scopeLabel } from '../engine/core.mjs';

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const commitAll = (dir, msg, extraArgs = []) => { gitIn(dir, 'add', '-A'); gitIn(dir, 'commit', '-q', ...extraArgs, '-m', msg); };
const freshStore = dir => { const store = { dir: join(dir, 'cache'), historyPath: join(dir, 'cache', 'history.json') }; mkdirSync(store.dir, { recursive: true }); return store; };
const initRepo = dir => { mkdirSync(dir, { recursive: true }); gitIn(dir, 'init', '-q', '-b', 'main'); gitIn(dir, 'config', 'commit.gpgsign', 'false'); mkdirSync(join(dir, 'src'), { recursive: true }); };

// 9 commits: birth (both files) + 8 structural changes, each touching BOTH scopes together — clears cochangeMinSup
// (8) with margin. `helper${i}()` changes the CALLED name every commit so `bh` moves every time, not just at birth.
function buildPairFixture(dir, n = 9) {
  initRepo(dir);
  for (let i = 1; i <= n; i++) {
    writeFileSync(join(dir, 'src/pair-a.ts'), `export function validate() { helper${i}(); return 1; }\n`);
    writeFileSync(join(dir, 'src/pair-b.ts'), `export function schema() { helper${i}(); return 1; }\n`);
    commitAll(dir, `pair change ${i}`);
  }
}

let tmp;
before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-scopecochange-')); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('(b1) two scopes touched together across >= cochangeMinSup commits appear in H.scopeCochange with correct sup/commits', async () => {
  const gitdir = join(tmp, 'b1-repo'); buildPairFixture(gitdir);
  const { H } = await loadHistory({ gitdir, store: freshStore(join(tmp, 'b1-store')), log: () => {} });
  assert.ok(Array.isArray(H.scopeCochange), 'H.scopeCochange must exist and be an array');
  const pair = H.scopeCochange.find(p => [p.a, p.b].some(k => k.endsWith('#method#validate')) && [p.a, p.b].some(k => k.endsWith('#method#schema')));
  assert.ok(pair, `expected a scope-cochange pair between validate and schema: ${JSON.stringify(H.scopeCochange)}`);
  assert.equal(pair.sup, 9, `all 9 commits touch both scopes together: ${JSON.stringify(pair)}`);
  assert.equal(pair.commitsA, 9); assert.equal(pair.commitsB, 9);
  assert.equal(pair.conf, 1);
});

test('(b2) a commit whose touched scope-set exceeds CFG.scopePairCap contributes NO scope-cochange pairs at all (not partially)', async () => {
  const gitdir = join(tmp, 'b2-repo'); initRepo(gitdir);
  // 5 files x 45 functions = 225 distinct scope-keys touched per commit — over CFG.scopePairCap (200), but only 5
  // files (well under CFG.megaCap, 30) — this must be gated by its OWN cap, independent of the file-count cap.
  const FILES = 5, FUNCS = 45;
  assert.ok(FILES * FUNCS > CFG.scopePairCap, `fixture sanity: ${FILES * FUNCS} scope-keys must exceed CFG.scopePairCap (${CFG.scopePairCap})`);
  for (let commitI = 1; commitI <= 9; commitI++) {
    for (let f = 0; f < FILES; f++) {
      const body = Array.from({ length: FUNCS }, (_, k) => `export function mega${f}_${k}() { helper${commitI}(); return ${k}; }`).join('\n') + '\n';
      writeFileSync(join(gitdir, `src/mega${f}.ts`), body);
    }
    commitAll(gitdir, `mega change ${commitI}`);
  }
  // an ordinary, independent, UNDER-cap pair added in a separate set of commits — proves the mega-commit skip is
  // selective (this cap gates one commit's own pairing), not a global break of scope-cochange accumulation
  for (let i = 1; i <= 9; i++) {
    writeFileSync(join(gitdir, 'src/pair-a.ts'), `export function validate() { helper${i}(); return 1; }\n`);
    writeFileSync(join(gitdir, 'src/pair-b.ts'), `export function schema() { helper${i}(); return 1; }\n`);
    commitAll(gitdir, `pair change ${i}`);
  }

  const { H } = await loadHistory({ gitdir, store: freshStore(join(tmp, 'b2-store')), log: () => {} });
  const megaPairs = H.scopeCochange.filter(p => /mega\d+_\d+/.test(p.a) || /mega\d+_\d+/.test(p.b));
  assert.deepEqual(megaPairs, [], `the over-cap mega commits must contribute ZERO scope pairs: ${JSON.stringify(megaPairs)}`);
  const ordinary = H.scopeCochange.find(p => [p.a, p.b].some(k => k.endsWith('#method#validate')));
  assert.ok(ordinary, `the independent under-cap pair must still be present: ${JSON.stringify(H.scopeCochange)}`);
  assert.equal(ordinary.sup, 9);
});

test('(b3) a scope whose FILE was renamed mid-history resolves to its CURRENT path in model.scopeCochange, not the historical one', async () => {
  const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
  const gitdir = join(tmp, 'b3-repo'); initRepo(gitdir);
  // 30 filler carriers so a real partition forms and `learn()` actually runs the currentPathOf remap (matching
  // group-arch-norms.test.mjs / missing-renderer.test.mjs's own carrier-count convention)
  mkdirSync(join(gitdir, 'src/handlers'), { recursive: true });
  for (let i = 0; i < 30; i++) writeFileSync(join(gitdir, `src/handlers/H${i}.ts`), `@Handler()\nexport class H${i}Handler {\n  run() {\n    return ${i};\n  }\n}\n`);
  commitAll(gitdir, 'carriers');
  for (let i = 1; i <= 9; i++) {
    writeFileSync(join(gitdir, 'src/pair-a.ts'), `export function validate() { helper${i}(); return 1; }\n`);
    writeFileSync(join(gitdir, 'src/pair-b.ts'), `export function schema() { helper${i}(); return 1; }\n`);
    commitAll(gitdir, `pair change ${i}`);
  }
  mkdirSync(join(gitdir, 'src/moved'), { recursive: true });
  gitIn(gitdir, 'mv', 'src/pair-a.ts', 'src/moved/pair-a.ts');
  commitAll(gitdir, 'move pair-a into src/moved');

  const grain = args => spawnSync('node', [BIN, ...args], { cwd: gitdir, encoding: 'utf8' });
  const st = grain(['status']); assert.equal(st.status, 0, st.stdout + st.stderr);
  const m = JSON.parse(readFileSync(join(gitdir, '.grain', 'cache', 'model.json'), 'utf8'));

  const pair = m.scopeCochange.find(p => [p.a, p.b].some(k => k.endsWith('#method#validate')));
  assert.ok(pair, `expected the validate/schema scope pair in model.scopeCochange: ${JSON.stringify(m.scopeCochange)}`);
  const validateKey = [pair.a, pair.b].find(k => k.endsWith('#method#validate'));
  assert.equal(validateKey, 'src/moved/pair-a.ts#method#validate', `the renamed scope must resolve to its CURRENT path: ${JSON.stringify(pair)}`);
  assert.ok(!m.scopeCochange.some(p => p.a.startsWith('src/pair-a.ts#') || p.b.startsWith('src/pair-a.ts#')), 'the historical path must not also appear anywhere in model.scopeCochange');
});

test('(b4) determinism: incremental rebuild produces H.scopeCochange byte-identical (JSON.stringify) to a full rebuild of the same final history', async () => {
  const gitdir = join(tmp, 'b4-repo'); buildPairFixture(gitdir, 7);
  const storeIncr = freshStore(join(tmp, 'b4-store-incremental'));

  const first = await loadHistory({ gitdir, store: storeIncr, log: () => {} });
  assert.equal(first.mode, 'full');

  // two more co-touching commits — the incremental walk must fold them into the SAME scope-cochange accumulator
  for (let i = 8; i <= 9; i++) {
    writeFileSync(join(gitdir, 'src/pair-a.ts'), `export function validate() { helper${i}(); return 1; }\n`);
    writeFileSync(join(gitdir, 'src/pair-b.ts'), `export function schema() { helper${i}(); return 1; }\n`);
    commitAll(gitdir, `pair change ${i}`);
  }

  const second = await loadHistory({ gitdir, store: storeIncr, log: () => {} });
  assert.equal(second.mode, 'incremental');

  const full = await loadHistory({ gitdir, store: freshStore(join(tmp, 'b4-store-full')), log: () => {} });
  assert.equal(full.mode, 'full');
  assert.equal(JSON.stringify(second.H.scopeCochange), JSON.stringify(full.H.scopeCochange), 'incremental H.scopeCochange must equal full-rebuild H.scopeCochange byte for byte');
  assert.ok(second.H.scopeCochange.length > 0, 'fixture sanity: the pair must actually be present to make this comparison meaningful');
});

// ===== wiring into `check <file>` (real git-backed fixture, full CLI) =====

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp2, repo2;
before(() => {
  tmp2 = mkdtempSync(join(tmpdir(), 'grain-scopecochange-check-'));
  repo2 = join(tmp2, 'r'); mkdirSync(repo2);
  gitIn(repo2, 'init', '-q', '-b', 'main'); gitIn(repo2, 'config', 'commit.gpgsign', 'false');
  mkdirSync(join(repo2, 'src/handlers'), { recursive: true });
  for (let i = 0; i < 30; i++) writeFileSync(join(repo2, `src/handlers/H${i}.ts`), `@Handler()\nexport class H${i}Handler {\n  run() {\n    return ${i};\n  }\n}\n`);
  commitAll(repo2, 'carriers');
  for (let i = 1; i <= 9; i++) {
    writeFileSync(join(repo2, 'src/pair-a.ts'), `export function validate() { helper${i}(); return 1; }\n`);
    writeFileSync(join(repo2, 'src/pair-b.ts'), `export function schema() { helper${i}(); return 1; }\n`);
    commitAll(repo2, `pair change ${i}`);
  }
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo2, encoding: 'utf8' });
  assert.equal(st.status, 0, st.stdout + st.stderr);
});
after(() => { if (tmp2) rmSync(tmp2, { recursive: true, force: true }); });

test('(b1-render) `check src/pair-a.ts` prints a co-change (scopes): line naming both scopes', () => {
  const m = JSON.parse(readFileSync(join(repo2, '.grain', 'cache', 'model.json'), 'utf8'));
  const pair = m.scopeCochange.find(p => [p.a, p.b].some(k => k.endsWith('#method#validate')) && [p.a, p.b].some(k => k.endsWith('#method#schema')));
  assert.ok(pair, `expected the validate/schema pair in model.scopeCochange: ${JSON.stringify(m.scopeCochange)}`);
  const part = m.partitions.find(p => p.files.includes('src/pair-a.ts'));
  assert.ok(part, `expected a partition covering src/pair-a.ts: ${JSON.stringify(m.partitions.map(p => p.name))}`);

  const r = spawnSync('node', [BIN, 'check', 'src/pair-a.ts'], { cwd: repo2, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const expected = `co-change (scopes): \`validate\` ↔ \`schema\` in ${scopeLabel(part.name)} (${pair.sup}/${pair.commitsA})`;
  assert.ok(r.stdout.includes(expected), `expected the scope co-change line in check output:\n${expected}\n\ngot:\n${r.stdout}`);
});
