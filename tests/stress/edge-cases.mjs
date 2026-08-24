#!/usr/bin/env node
// Edge-case stress: builds hostile little repositories and runs grain on each. The contract under test is
// "degrade, never crash; never lie": every query must exit 0 (or 2 for the explicit no-index case), print an
// honest answer, and stamp it.   node tests/stress/edge-cases.mjs <workDir>
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, symlinkSync, existsSync, cpSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(here, '..', '..', 'plugins', 'grain', 'bin', 'grain.mjs');
const FIXTURE = resolve(here, '..', 'fixtures', 'build-fixture.mjs');
const work = process.argv[2]; if (!work) { console.error('usage: edge-cases.mjs <workDir>'); process.exit(2); }
rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
const env = { ...process.env, GIT_AUTHOR_NAME: 'e', GIT_AUTHOR_EMAIL: 'e@x', GIT_COMMITTER_NAME: 'e', GIT_COMMITTER_EMAIL: 'e@x', GIT_AUTHOR_DATE: '2025-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2025-01-01T00:00:00Z' };
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const grain = (cwd, ...a) => { const r = spawnSync('node', [BIN, ...a], { cwd, encoding: 'utf8', timeout: 300_000 }); return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), signal: r.signal }; };
const results = [];
function expect(name, cwd, args, pred) { const r = grain(cwd, ...args); const ok = (() => { try { return pred(r); } catch { return false; } })();
  results.push({ name, args: args.join(' '), ok, code: r.code, out: r.out.slice(0, 600), err: r.err.slice(-400) });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} :: grain ${args.join(' ')} → exit ${r.code}${r.signal ? ' signal ' + r.signal : ''}\n     ${r.out.split('\n').slice(0, 3).join('\n     ')}${r.err ? '\n     [stderr] ' + r.err.split('\n').slice(-2).join(' | ') : ''}`); }
const fixtureAt = dir => { execFileSync('node', [FIXTURE, dir], { stdio: 'pipe' }); return dir; };
const stamped = r => /as of ([0-9a-f]{7}|no-git)/.test(r.out);

// 1. empty git repo (no commits)
{ const d = join(work, 'empty'); mkdirSync(d); git(d, 'init', '-q', '-b', 'main');
  expect('empty repo: status exits 0 and explains', d, ['status'], r => r.code === 0 && stamped(r));
  expect('empty repo: where answers with an empty map', d, ['where', 'handler'], r => r.code === 0 && /no lexical match|no strong conventions/.test(r.out)); }
// 2. repo with commits but no code files
{ const d = join(work, 'nocode'); mkdirSync(d); git(d, 'init', '-q', '-b', 'main'); writeFileSync(join(d, 'README.md'), '# hi\n'); git(d, 'add', '-A'); git(d, 'commit', '-qm', 'docs');
  expect('no code: status', d, ['status'], r => r.code === 0 && /0 conventions/.test(r.out) && stamped(r));
  expect('no code: check on a non-code file', d, ['check', 'README.md'], r => r.code !== 0 || /no scopes|no grammar|unsupported/.test(r.out + r.err)); }
// 3. shallow clone of the fixture
{ const src = fixtureAt(join(work, 'fixture-src')); const d = join(work, 'shallow'); execFileSync('git', ['clone', '-q', '--depth', '1', 'file://' + src, d], { env });
  expect('shallow clone: history unavailable, nothing established, still answers', d, ['status'], r => r.code === 0 && /shallow/.test(r.out + r.err) && stamped(r));
  expect('shallow clone: where still gives placement', d, ['where', 'guard'], r => r.code === 0 && /src\/guards/.test(r.out)); }
// 4. symlinked directory + symlinked file inside the tree (must not loop or double count)
{ const d = fixtureAt(join(work, 'symlinks')); symlinkSync(join(d, 'src'), join(d, 'src-link')); symlinkSync(join(d, 'src', 'core', 'handler.ts'), join(d, 'src', 'core', 'handler-link.ts')); git(d, 'add', '-A'); git(d, 'commit', '-qm', 'symlinks');
  expect('symlinks: index does not crash', d, ['status'], r => r.code === 0 && stamped(r));
  expect('symlinks: check through a symlink path', d, ['check', 'src-link/handlers/order.handler.ts'], r => r.code === 0 || /outside|no such/.test(r.err)); }
// 5. a 5 MB generated-looking JS file and a 2 MB minified file (oversize gates) + non-UTF8 bytes + CRLF
{ const d = fixtureAt(join(work, 'hostile-files')); mkdirSync(join(d, 'src', 'big'));
  writeFileSync(join(d, 'src', 'big', 'huge.ts'), 'export const x = [' + Array.from({ length: 200000 }, (_, i) => `{ id: ${i}, name: "n${i}" }`).join(',\n') + '];\n');
  writeFileSync(join(d, 'src', 'big', 'bundle.min.js'), 'var a=' + 'x'.repeat(2_000_000) + ';');
  writeFileSync(join(d, 'src', 'core', 'latin1.ts'), Buffer.concat([Buffer.from('// caf'), Buffer.from([0xe9]), Buffer.from('\nexport function latin1(a: string) { return a; }\n')]));
  writeFileSync(join(d, 'src', 'core', 'crlf.ts'), 'export class Crlf {\r\n  run(a: string) {\r\n    return a;\r\n  }\r\n}\r\n');
  writeFileSync(join(d, 'src', 'core', 'weird name (1).ts'), 'export function weird() { return 1; }\n');
  git(d, 'add', '-A'); git(d, 'commit', '-qm', 'hostile');
  expect('hostile files: index survives 5 MB / minified / latin1 / CRLF / spaces', d, ['status'], r => r.code === 0 && stamped(r));
  expect('hostile files: check a CRLF file', d, ['check', 'src/core/crlf.ts'], r => r.code === 0 && /scopes/.test(r.out));
  expect('hostile files: check a latin1 file', d, ['check', 'src/core/latin1.ts'], r => r.code === 0);
  expect('hostile files: check a path with spaces and parens', d, ['check', 'src/core/weird name (1).ts'], r => r.code === 0); }
// 6. mass rename (directory move) then query — rename continuity in the replay
{ const d = fixtureAt(join(work, 'renames')); git(d, 'mv', 'src/handlers', 'src/commands'); git(d, 'commit', '-qm', 'move handlers to commands');
  expect('mass rename: where finds the new directory', d, ['where', 'handler'], r => r.code === 0 && /src\/commands/.test(r.out));
  expect('mass rename: check on a moved file keeps its evidence', d, ['check', 'src/commands/dispute.handler.ts'], r => r.code === 0 && /@Handler/.test(r.out)); }
// 7. only test files (mining-excluded) → below the partition floor → silence, honestly
{ const d = join(work, 'tests-only'); mkdirSync(join(d, 'test'), { recursive: true }); git(d, 'init', '-q', '-b', 'main');
  for (let i = 0; i < 40; i++) writeFileSync(join(d, 'test', `t${i}.test.ts`), `describe('t${i}', () => { it('x', () => { expect(1).toBe(1); }); });\n`);
  git(d, 'add', '-A'); git(d, 'commit', '-qm', 'tests');
  expect('tests-only: status says 0 conventions, exit 0', d, ['status'], r => r.code === 0 && /0 conventions/.test(r.out)); }
// 8. submodule inside the tree (must be skipped, not descended)
{ const sub = fixtureAt(join(work, 'sub-src')); const d = fixtureAt(join(work, 'with-submodule'));
  try { execFileSync('git', ['-C', d, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', 'file://' + sub, 'vendor-sub'], { env, stdio: 'pipe' }); git(d, 'commit', '-qm', 'submodule');
    expect('submodule: index does not descend into it', d, ['status'], r => r.code === 0 && stamped(r)); } catch (e) { results.push({ name: 'submodule', ok: true, note: 'skipped: ' + String(e.message).split('\n')[0] }); } }
// 9. nested package roots: two packages each under the 300-scope floor → merged `_repo`; and one above → its own partition
{ const d = fixtureAt(join(work, 'monorepo')); mkdirSync(join(d, 'packages', 'api'), { recursive: true }); mkdirSync(join(d, 'packages', 'web'), { recursive: true });
  writeFileSync(join(d, 'packages', 'api', 'package.json'), '{"name":"api"}'); writeFileSync(join(d, 'packages', 'web', 'package.json'), '{"name":"web"}');
  for (let i = 0; i < 30; i++) { writeFileSync(join(d, 'packages', 'api', `svc${i}.ts`), `export class Svc${i} { run(a: number) { return a; } stop() { return 0; } }\n`); writeFileSync(join(d, 'packages', 'web', `view${i}.tsx`), `export function View${i}(p: { a: number }) { return <div>{p.a}</div>; }\n`); }
  git(d, 'add', '-A'); git(d, 'commit', '-qm', 'monorepo');
  expect('monorepo: small packages merge into the repo bucket without crashing', d, ['status'], r => r.code === 0 && stamped(r));
  expect('monorepo: where on a small package still answers', d, ['where', 'view'], r => r.code === 0); }
// 10. concurrent queries on a cold index (two processes racing to build)
{ const d = fixtureAt(join(work, 'race'));
  const a = spawnSync('node', [BIN, 'status'], { cwd: d, encoding: 'utf8' }); // warm one first is NOT what we want — run two cold in parallel via shell
  rmSync(join(d, '.grain'), { recursive: true, force: true });
  const r = spawnSync('sh', ['-c', `node "${BIN}" status > a.txt 2>a.err & node "${BIN}" where guard > b.txt 2>b.err; wait; cat a.txt b.txt`], { cwd: d, encoding: 'utf8' });
  const ok = r.status === 0 && (r.stdout.match(/as of [0-9a-f]{7}/g) || []).length === 2;
  results.push({ name: 'race: two cold queries in parallel both answer', ok, out: r.stdout.slice(0, 400) }); console.log(`${ok ? 'ok  ' : 'FAIL'} race: two cold queries in parallel both answer`); }
// 11. detached HEAD and a tag checkout
{ const d = fixtureAt(join(work, 'detached')); git(d, 'checkout', '-q', 'HEAD~2');
  expect('detached HEAD: answers and stamps', d, ['status'], r => r.code === 0 && stamped(r)); }
// 12. --no-refresh with no index at all
{ const d = fixtureAt(join(work, 'noindex'));
  expect('no index + --no-refresh: explicit NO INDEX, exit 2', d, ['where', 'x', '--no-refresh'], r => r.code === 2 && /NO INDEX/.test(r.out)); }
// 13. check on a file that exists in the worktree but not in HEAD (brand-new file) and on a deleted file
{ const d = fixtureAt(join(work, 'newfile')); writeFileSync(join(d, 'src', 'guards', 'brand-new.guard.ts'), "import type { CanActivate } from '../core/guard';\nexport class BrandNewGuard implements CanActivate {\n  canActivate(ctx: unknown): boolean { return true; }\n}\n");
  expect('new untracked file: check works and is +dirty', d, ['check', 'src/guards/brand-new.guard.ts'], r => r.code === 0 && /\+dirty$/.test(r.out));
  rmSync(join(d, 'src', 'guards', 'order.guard.ts'));
  expect('deleted file: check reports no such file, exit 1', d, ['check', 'src/guards/order.guard.ts'], r => r.code === 1 && /no such file/.test(r.err)); }
// 14. path outside the repo
{ const d = fixtureAt(join(work, 'outside'));
  expect('outside path: refused with exit 1', d, ['check', '../empty/README.md'], r => r.code === 1 && /outside/.test(r.err)); }
// 15. non-git directory with code
{ const d = join(work, 'plain'); cpSync(join(work, 'fixture-src'), d, { recursive: true }); rmSync(join(d, '.git'), { recursive: true }); rmSync(join(d, '.grain'), { recursive: true, force: true });
  expect('no git: answers, stamped no-git, 0 conventions spoken', d, ['status'], r => r.code === 0 && /no-git/.test(r.out) && /0 conventions/.test(r.out)); }

const failed = results.filter(r => !r.ok);
writeFileSync(join(work, 'results.json'), JSON.stringify(results, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} edge cases ok${failed.length ? ' — FAILED: ' + failed.map(f => f.name).join('; ') : ''}`);
process.exit(failed.length ? 1 : 0);
