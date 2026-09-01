// cross-check-hook-agreement.test.mjs — THE INVARIANT: a hook's injected [grain] text must never claim something
// the direct command it stands for does not claim about the SAME repo state. check-hook.test.mjs, edit-hook.test.mjs,
// commit-hook.test.mjs, read-hook.test.mjs, how-hook.test.mjs and completeness-hook.test.mjs each test ONE hook in
// isolation; nothing anywhere asserts a hook AGREES with the command whose answer it is unbidden-echoing. This file
// is that cross-check, for every hook⇄command pair that has one:
//
//   check-hook  (PostToolUse, no findings)  vs  `check <file> --json`        — containment (hook filters+caps)
//   commit-hook (PreToolUse on git commit)  vs  `review --staged --json`     — containment, same reason
//   edit-hook / check-hook co-change line   vs  `completeness <file>`        — exact partner+evidence containment,
//                                                                               PLUS the §J6.4 shared cochange:<rel>
//                                                                               suppression key, both fire orders
//   how-hook    (UserPromptSubmit)          vs  `how --json` / `howCmd`      — containment; `how --json` drops
//                                                                               `score` (ticket 009), so the score
//                                                                               gate is verified via `howCmd` direct
//   session-context (SessionStart)          vs  `status`/`report`/`map`     — exact count/fact agreement
//
// House pattern (dateEnv/gitIn/wIn/grainIn/initRepo, tmpdir fixtures) is spectrum-role-deviation.test.mjs's; the
// per-hook stdin/stdout harness (JSON payload in, hookSpecificOutput.additionalContext out) is check-hook.test.mjs's
// / edit-hook.test.mjs's own `hook()` idiom, reused verbatim as `hookCall()` below rather than re-invented.
//
// Containment, not equality, throughout: every hook here caps/truncates (check-hook's speak.slice(0,8), edit/check-
// hook's cc.slice(0,3), how-hook's lines.slice(0,6), commit-hook's capReviewLines) — so the assertion is always
// "everything the hook says is also said by the command", anchored on the command's own (JSON) statement/pid/file
// substance, never on incidental whole-line formatting the hook and the command are free to render differently.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { howCmd } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const wIn = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grainIn = (repo, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const initRepo = name => { const tmp = mkdtempSync(join(tmpdir(), name)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, {}, 'init', '-q', '-b', 'main'); gitIn(repo, {}, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };
// the hook stdin/stdout harness every existing hook test file already uses — one JSON payload in, one trimmed
// stdout + exit code out. Named `hookCall` (not `hook`) only because this file calls several DIFFERENT hooks.
const hookCall = (cmd, payload, cwd, extra = []) => { const r = spawnSync('node', [BIN, cmd, ...extra], { cwd, encoding: 'utf8', input: JSON.stringify(payload) });
  return { out: (r.stdout || '').trim(), err: r.stderr, code: r.status }; };
const seenPath = repo => join(repo, '.grain', 'cache', 'hook-seen.json');
const resetSeen = repo => rmSync(seenPath(repo), { force: true });
const resetWorktree = repo => { gitIn(repo, {}, 'checkout', '-q', 'HEAD', '--', '.'); gitIn(repo, {}, 'clean', '-qfd', '-e', '.grain'); };

// ===================================================================================================================
describe('check-hook agrees with `check <file>` — containment on deviations, honesty on the clean/nothing-pending case', () => {
  let tmp, repo;
  const handler = (i, deco = true) => `${deco ? '@Handler()\n' : ''}export class Handler${i}Handler {\n  run() {\n    return ${i};\n  }\n}\n`;
  before(() => {
    ({ tmp, repo } = initRepo('grain-xcheck-agree-check-'));
    const d1 = dateEnv('2026-01-10T12:00:00Z');
    for (let i = 0; i < 30; i++) wIn(repo, `src/handlers/Handler${i}.ts`, handler(i)); // establishes @Handler()
    gitIn(repo, d1, 'add', '-A'); gitIn(repo, d1, 'commit', '-qm', 'add handlers');
    const d2 = dateEnv('2026-03-01T12:00:00Z'); // pushes HEAD's date past freshDays so the convention is "established"
    wIn(repo, 'NOTES.md', 'notes\n'); gitIn(repo, d2, 'add', 'NOTES.md'); gitIn(repo, d2, 'commit', '-qm', 'notes');
    const st = grainIn(repo, ['status']); assert.equal(st.code, 0, st.err);
    assert.doesNotMatch(st.out, /: 0 conventions/, `sanity: @Handler() must be established: ${st.out}`);
  });
  after(() => rmSync(tmp, { recursive: true, force: true }));

  test('a certified deviation: every check-hook finding is a substring-match of a `check <file> --json` deviationsInChange statement', () => {
    resetSeen(repo);
    wIn(repo, 'src/handlers/Handler0.ts', handler(0, false)); // decorator dropped, uncommitted (dirty)
    try {
      const j = JSON.parse(grainIn(repo, ['check', 'src/handlers/Handler0.ts', '--json']).out);
      assert.ok(j.deviationsInChange.length >= 1, `fixture precondition: check --json must report a deviation: ${JSON.stringify(j)}`);
      const h = hookCall('check-hook', { cwd: repo, tool_name: 'Edit', tool_input: { file_path: join(repo, 'src/handlers/Handler0.ts') } }, repo);
      assert.equal(h.code, 0, h.err);
      assert.notEqual(h.out, '', 'fixture precondition: check-hook must actually speak on this deviation');
      const ctx = JSON.parse(h.out).hookSpecificOutput.additionalContext;
      for (const dev of j.deviationsInChange) {
        const statement = dev.statement.split('\n')[0]; // check-hook's own `speak` carries checkFile's identical g.text
        assert.ok(ctx.includes(statement), `check-hook must carry (a substring of) check's own deviation statement "${statement}":\n${ctx}`);
      }
    } finally { wIn(repo, 'src/handlers/Handler0.ts', handler(0, true)); }
  });

  test('the honest-negative converse: 0 deviationsInChange and nothing dirty in `check --json` means check-hook must inject no deviation claim', () => {
    resetSeen(repo);
    // Handler0.ts was restored to conforming content in the previous test's `finally` — byte-identical to HEAD
    const j = JSON.parse(grainIn(repo, ['check', 'src/handlers/Handler0.ts', '--json']).out);
    assert.equal(j.deviationsInChange.length, 0, `fixture precondition: must be genuinely clean: ${JSON.stringify(j)}`);
    assert.equal(j.dirty, false, 'fixture precondition: nothing pending — file must exactly match HEAD');
    const h = hookCall('check-hook', { cwd: repo, tool_name: 'Edit', tool_input: { file_path: join(repo, 'src/handlers/Handler0.ts') } }, repo);
    assert.equal(h.code, 0, h.err);
    assert.equal(h.out, '', 'a genuinely clean, non-dirty file — check-hook must stay silent, never claim a deviation');
  });
});

// ===================================================================================================================
describe('commit-hook agrees with `review --staged` — containment on a staged deviation', () => {
  let tmp, repo;
  const handler = (i, deco = true) => `${deco ? '@Handler()\n' : ''}export class Handler${i}Handler {\n  run() {\n    return ${i};\n  }\n}\n`;
  before(() => {
    ({ tmp, repo } = initRepo('grain-xcheck-agree-commit-'));
    const d1 = dateEnv('2026-01-10T12:00:00Z');
    for (let i = 0; i < 30; i++) wIn(repo, `src/handlers/Handler${i}.ts`, handler(i));
    gitIn(repo, d1, 'add', '-A'); gitIn(repo, d1, 'commit', '-qm', 'add handlers');
    const d2 = dateEnv('2026-03-01T12:00:00Z');
    wIn(repo, 'NOTES.md', 'notes\n'); gitIn(repo, d2, 'add', 'NOTES.md'); gitIn(repo, d2, 'commit', '-qm', 'notes');
    const st = grainIn(repo, ['status']); assert.equal(st.code, 0, st.err);
  });
  after(() => rmSync(tmp, { recursive: true, force: true }));

  test('a staged deviation: every commit-hook finding is a substring-match of `review --staged --json`\'s own deviationsInChange for the SAME file', () => {
    resetSeen(repo);
    wIn(repo, 'src/handlers/Handler0.ts', handler(0, false));
    gitIn(repo, {}, 'add', 'src/handlers/Handler0.ts');
    const rj = JSON.parse(grainIn(repo, ['review', '--staged', '--json']).out);
    const finding = rj.findings.find(f => f.file === 'src/handlers/Handler0.ts');
    assert.ok(finding && finding.deviationsInChange.length >= 1, `fixture precondition: review --staged must report a deviation for Handler0.ts: ${JSON.stringify(rj)}`);
    const h = hookCall('commit-hook', { cwd: repo, tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' } }, repo);
    assert.equal(h.code, 0, h.err);
    assert.notEqual(h.out, '', 'fixture precondition: commit-hook must actually speak on this staged deviation');
    const ctx = JSON.parse(h.out).hookSpecificOutput.additionalContext;
    for (const dev of finding.deviationsInChange) {
      const statement = dev.statement.split('\n')[0];
      assert.ok(ctx.includes(statement), `commit-hook must carry review --staged's own deviation statement "${statement}":\n${ctx}`);
    }
  });
});

// ===================================================================================================================
describe('edit-hook / check-hook co-change agrees with `completeness <file>`, and the two hooks share ONE cochange:<rel> suppression key', () => {
  let tmp, repo;
  before(() => {
    ({ tmp, repo } = initRepo('grain-xcheck-agree-cochange-'));
    wIn(repo, 'src/pair-a.ts', 'export const a = () => 0;\n');
    wIn(repo, 'src/pair-b.ts', 'export const b = () => 0;\n');
    wIn(repo, 'src/hub.ts', 'export const hub = () => 0;\n');
    for (const p of ['p1', 'p2', 'p3', 'p4']) wIn(repo, `src/${p}.ts`, `export const ${p} = () => 0;\n`);
    gitIn(repo, {}, 'add', '-A'); gitIn(repo, {}, 'commit', '-qm', 'base');
    for (let i = 1; i <= 8; i++) { wIn(repo, 'src/pair-a.ts', `export const a = () => ${i};\n`); wIn(repo, 'src/pair-b.ts', `export const b = () => ${i};\n`); gitIn(repo, {}, 'add', '-A'); gitIn(repo, {}, 'commit', '-qm', `pair change ${i}`); }
    for (let i = 1; i <= 8; i++) { wIn(repo, 'src/hub.ts', `export const hub = () => ${i};\n`); for (const p of ['p1', 'p2', 'p3', 'p4']) wIn(repo, `src/${p}.ts`, `export const ${p} = () => ${i};\n`); gitIn(repo, {}, 'add', '-A'); gitIn(repo, {}, 'commit', '-qm', `hub change ${i}`); }
    const st = grainIn(repo, ['status']); assert.equal(st.code, 0, st.err);
  });
  after(() => rmSync(tmp, { recursive: true, force: true }));

  const partnersFromCompleteness = rel => { const out = grainIn(repo, ['completeness', rel]).out;
    const re = /- (\S+) \(co-changed in (\d+)\/(\d+) commits\)/g; const partners = new Map(); let m;
    while ((m = re.exec(out))) partners.set(m[1], { sup: +m[2], commits: +m[3] }); return partners; };
  const partnersFromHookText = text => { const re = /(\S+\.ts) \(co-changed in (\d+)\/(\d+) commits\)/g;
    const partners = new Map(); let m; while ((m = re.exec(text))) partners.set(m[1], { sup: +m[2], commits: +m[3] }); return partners; };

  test('edit-hook names exactly the established partner `completeness <file>` reports, with matching evidence numbers', () => {
    resetSeen(repo);
    const cmdPartners = partnersFromCompleteness('src/pair-a.ts');
    assert.ok(cmdPartners.has('src/pair-b.ts'), `fixture precondition: completeness must report the pair: ${[...cmdPartners.keys()]}`);
    const h = hookCall('edit-hook', { cwd: repo, tool_name: 'Edit', tool_input: { file_path: join(repo, 'src/pair-a.ts') } }, repo);
    assert.equal(h.code, 0, h.err);
    const hookPartners = partnersFromHookText(JSON.parse(h.out).hookSpecificOutput.additionalContext);
    assert.ok(hookPartners.size > 0, 'fixture precondition: edit-hook must actually speak');
    for (const [file, ev] of hookPartners) {
      assert.ok(cmdPartners.has(file), `edit-hook named a partner (${file}) that completeness <file> does not report`);
      assert.deepEqual(ev, cmdPartners.get(file), `edit-hook's evidence numbers for ${file} must match completeness's own`);
    }
  });

  test('the cap: edit-hook\'s <=3 partners for a 4-partner hub are all present in completeness\'s own (uncapped-at-3) list — no invented partner', () => {
    resetSeen(repo);
    const cmdPartners = partnersFromCompleteness('src/hub.ts');
    assert.ok(cmdPartners.size >= 4, `fixture precondition: hub.ts must have 4 established partners: ${[...cmdPartners.keys()]}`);
    const h = hookCall('edit-hook', { cwd: repo, tool_name: 'Edit', tool_input: { file_path: join(repo, 'src/hub.ts') } }, repo);
    const hookPartners = partnersFromHookText(JSON.parse(h.out).hookSpecificOutput.additionalContext);
    assert.equal(hookPartners.size, 3, 'fixture precondition: the 3-partner cap must actually be exercised here');
    for (const [file, ev] of hookPartners) {
      assert.ok(cmdPartners.has(file), `edit-hook named a partner (${file}) completeness does not report`);
      assert.deepEqual(ev, cmdPartners.get(file));
    }
  });

  test('suppression order A (check-hook then edit-hook): check-hook speaks first and agrees with completeness; edit-hook is then silenced by the shared key', () => {
    resetSeen(repo);
    const cmdPartners = partnersFromCompleteness('src/pair-a.ts');
    const c1 = hookCall('check-hook', { cwd: repo, tool_name: 'Edit', tool_input: { file_path: join(repo, 'src/pair-a.ts') } }, repo);
    assert.equal(c1.code, 0, c1.err);
    assert.match(c1.out, /edits like this also touch/, 'check-hook must actually speak the co-change line first');
    const hookPartners = partnersFromHookText(JSON.parse(c1.out).hookSpecificOutput.additionalContext);
    assert.ok(hookPartners.size > 0);
    for (const [file, ev] of hookPartners) { assert.ok(cmdPartners.has(file)); assert.deepEqual(ev, cmdPartners.get(file)); }
    const e2 = hookCall('edit-hook', { cwd: repo, tool_name: 'Edit', tool_input: { file_path: join(repo, 'src/pair-a.ts') } }, repo);
    assert.equal(e2.code, 0, e2.err);
    assert.equal(e2.out, '', 'edit-hook must be silenced by check-hook\'s shared cochange:<rel> key');
    const seen = JSON.parse(readFileSync(seenPath(repo), 'utf8'));
    assert.ok(seen['cochange:src/pair-a.ts'], 'the shared suppression key must be present in .grain/cache/hook-seen.json');
  });

  test('suppression order B (edit-hook then check-hook): edit-hook speaks first and agrees with completeness; check-hook is then silenced by the shared key', () => {
    resetSeen(repo);
    const cmdPartners = partnersFromCompleteness('src/pair-a.ts');
    const e1 = hookCall('edit-hook', { cwd: repo, tool_name: 'Edit', tool_input: { file_path: join(repo, 'src/pair-a.ts') } }, repo);
    assert.equal(e1.code, 0, e1.err);
    assert.match(e1.out, /also touch/, 'edit-hook must actually speak the co-change line first');
    const hookPartners = partnersFromHookText(JSON.parse(e1.out).hookSpecificOutput.additionalContext);
    assert.ok(hookPartners.size > 0);
    for (const [file, ev] of hookPartners) { assert.ok(cmdPartners.has(file)); assert.deepEqual(ev, cmdPartners.get(file)); }
    const c2 = hookCall('check-hook', { cwd: repo, tool_name: 'Edit', tool_input: { file_path: join(repo, 'src/pair-a.ts') } }, repo);
    assert.equal(c2.code, 0, c2.err);
    // pair-a.ts carries no other convention finding in this fixture, so full suppression of co-change means full silence
    assert.equal(c2.out, '', 'check-hook must be silenced by edit-hook\'s shared cochange:<rel> key');
    const seen = JSON.parse(readFileSync(seenPath(repo), 'utf8'));
    assert.ok(seen['cochange:src/pair-a.ts'], 'the shared suppression key must be present in .grain/cache/hook-seen.json');
  });
});

// ===================================================================================================================
describe('how-hook agrees with `how --json` (places/shape); howCmd direct (score visible — ticket 009 hides it from --json) proves the >=0.5/>=2 gate is real', () => {
  // duplicated from how-hook.test.mjs's own buildFixture, on the same principle that file's own header states: every
  // assertion here is about which commits cluster and what a query's own words land on, so this file owns every
  // commit message and file name too, rather than importing a fixture another file might change out from under it.
  const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
  const Cap = s => s[0].toUpperCase() + s.slice(1);
  const HANDLERS = ['create', 'cancel', 'ship', 'refund', 'archive', 'restore', 'split', 'merge'];
  const STATUSES = ['Pending', 'Approved', 'Rejected', 'Escrowed', 'Settled', 'Voided', 'Frozen', 'Lapsed'];
  const NOISE = [
    ['alpha', 'util', ['compress', 'inflate']], ['beta', 'helper', ['schedule', 'cancelTimer']],
    ['gamma', 'client', ['dial', 'hangup']], ['delta', 'guard', ['permit', 'refuse']],
    ['epsilon', 'mapper', ['flatten', 'nest']], ['zeta', 'runner', ['spawn', 'reap']],
  ];
  const writeStatuses = (dir, names) => {
    wIn(dir, 'src/enums/order-status.enum.ts', `export class OrderStatus {\n${names.map(x => `  static ${x}(): string { return '${x}'; }`).join('\n')}\n}\n`);
    wIn(dir, 'src/dto/order.dto.ts', `export class OrderDto {\n  id = '';\n  known(): boolean { return [${names.map(x => `'${x}'`).join(', ')}].includes(this.id); }\n}\n`);
    wIn(dir, 'tests/fixtures/order.fixture.ts', `${names.map(x => `export function make${x}Order(): { id: string } { return { id: '${x}' }; }`).join('\n')}\n`);
    wIn(dir, 'tests/order.test.ts', `export function checkOrders(): boolean { return [${names.map(x => `make${x}Order()`).join(', ')}].every(o => o.id.length > 0); }\n`); };
  function buildFixture(dir) {
    let day = 0;
    const commit = msg => { day += 2; const d = new Date(T0 + day * 86400000).toISOString();
      gitIn(dir, {}, 'add', '-A');
      execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d } }); };
    wIn(dir, 'src/core/base.ts', `export class Base {\n  id(): string { return ''; }\n  kind(): string { return 'base'; }\n}\n`);
    writeStatuses(dir, ['Draft']); commit('core scaffolding');
    const writeHandler = n => {
      wIn(dir, `src/handlers/${n}.handler.ts`, `export class ${Cap(n)}Handler {\n  handle(input: string): string { return input + '${n}'; }\n  name(): string { return '${n}'; }\n}\n`);
      wIn(dir, `src/dto/${n}.dto.ts`, `export class ${Cap(n)}Dto {\n  payload = '';\n  valid(): boolean { return this.payload.length > 0; }\n  render(): string { return this.payload; }\n}\n`);
      wIn(dir, `tests/${n}.test.ts`, `export function test${Cap(n)}(): boolean { return true; }\nexport function bench${Cap(n)}(): number { return 1; }\n`); };
    const grown = ['Draft'];
    for (let i = 0; i < 8; i++) {
      writeHandler(HANDLERS[i]); commit(`add handler ${HANDLERS[i]}`);
      grown.push(STATUSES[i]); writeStatuses(dir, grown); commit(`add status ${STATUSES[i].toLowerCase()}`);
      if (i < NOISE.length) { const [g, suf, ms] = NOISE[i];
        wIn(dir, `src/${g}/${g}.${suf}.ts`, `export class ${Cap(g)}${Cap(suf)} {\n${ms.map((m2, k) => `  ${m2}(v: number): number { return v + ${k}; }`).join('\n')}\n}\n`);
        commit(`rework ${g} ${suf} internals`); } } }

  let tmp, repo;
  before(() => {
    tmp = mkdtempSync(join(tmpdir(), 'grain-xcheck-agree-how-'));
    repo = join(tmp, 'fixture'); mkdirSync(repo, { recursive: true });
    gitIn(repo, {}, 'init', '-q', '-b', 'main'); gitIn(repo, {}, 'config', 'commit.gpgsign', 'false');
    buildFixture(repo);
    const st = grainIn(repo, ['status']); assert.equal(st.code, 0, st.err);
  });
  after(() => rmSync(tmp, { recursive: true, force: true }));

  test('a certified-shape prompt: how-hook\'s certified cells and places all appear in `how --json`\'s own shape/places for the identical query', () => {
    resetSeen(repo);
    const h = hookCall('how-hook', { cwd: repo, hook_event_name: 'UserPromptSubmit', prompt: 'please add status', prompt_source: 'user_input' }, repo);
    assert.equal(h.code, 0, h.err);
    assert.notEqual(h.out, '', 'fixture precondition: how-hook must actually speak for this prompt');
    const ctx = JSON.parse(h.out).hookSpecificOutput.additionalContext;
    const cliJson = JSON.parse(grainIn(repo, ['how', 'please add status', '--json', '--top', '3']).out);
    assert.ok(cliJson.shape, `fixture precondition: how --json must report a certified shape: ${JSON.stringify(cliJson)}`);
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(ctx, new RegExp(`certified shape "${esc(cliJson.shape.label)}"`), `hook's shape label must match how --json's own: ${ctx}`);
    for (const c of cliJson.shape.cells) assert.match(ctx, new RegExp(`\\(${c.k} of ${cliJson.shape.n}\\)`), `hook must carry cell ${c.cell}'s own k/n from how --json: ${ctx}`);
    for (const p of cliJson.places.filter(pl => pl.k >= 2)) // how-hook's own gate: `places.filter(p => p.k >= 2)`
      if (ctx.includes(p.rel)) assert.match(ctx, new RegExp(`${esc(p.rel)} \\(${p.k}/${p.of}\\)`), `place ${p.rel}'s own k/of must match how --json's: ${ctx}`);
  });

  test('the gate is real: howCmd direct (score visible) shows THIS query fires the hook via the certified-shape disjunct, not a fabricated strong-match count — and `how --json` (score hidden, ticket 009) computes over the IDENTICAL match set', () => {
    resetSeen(repo);
    const model = JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));
    const history = JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'history.json'), 'utf8'));
    const direct = howCmd({ model, H: { fps: history.fps || [] }, query: 'please add status', top: 3, msgOf: null, shapes: true, exemplarOk: () => true });
    // how-hook's own gate (grain.mjs): `certified = shape && shape.cells.some(c => c.certified)`; `strong =
    // matches.filter(m => m.score >= 0.5).length >= 2`; speaks iff `certified || strong`. `how --json` cannot show
    // which disjunct fired (ticket 009 drops `score` entirely) — howCmd direct can, and here it shows scores of
    // ~0.405 (BELOW the 0.5 strong-match floor), so `certified` — not `strong` — is what the hook is really acting
    // on for this query; a hook that claimed "strong match evidence" here would be claiming something false.
    const certified = !!(direct.shape && (direct.shape.cells || []).length);
    const strong = direct.matches.filter(m => m.score >= 0.5).length >= 2;
    assert.ok(certified || strong, `neither disjunct of the hook's own gate holds — the hook should not have spoken: ${JSON.stringify(direct.matches.map(m => ({ sha: m.sha, score: m.score })))}`);
    assert.equal(certified, true, `fixture precondition: this query is meant to exercise the CERTIFIED disjunct specifically (scores alone must not already justify speaking): ${JSON.stringify(direct.matches.map(m => m.score))}`);
    assert.equal(strong, false, `fixture precondition: scores must stay below the strong-match floor here, so the earlier test's "certified shape" line is verifiably NOT smuggling in strong-match evidence instead: ${JSON.stringify(direct.matches.map(m => m.score))}`);
    const cliJson = JSON.parse(grainIn(repo, ['how', 'please add status', '--json', '--top', '3']).out);
    assert.deepEqual(cliJson.matches.map(m => m.sha).sort(), direct.matches.map(m => m.sha).sort(),
      'how --json and howCmd direct must compute over the identical match set (only the score field is hidden by --json, per ticket 009) — the certified/strong gate the hook applies is checking real, visible-if-you-look evidence, not a different computation');
  });

  test('honest silence agrees too: an unmatched prompt is silent in the hook AND has zero matches in `how --json`', () => {
    resetSeen(repo);
    const h = hookCall('how-hook', { cwd: repo, hook_event_name: 'UserPromptSubmit', prompt: 'totally unrelated banana spaceship', prompt_source: 'user_input' }, repo);
    assert.equal(h.code, 0, h.err);
    assert.equal(h.out, '');
    const cliJson = JSON.parse(grainIn(repo, ['how', 'totally', 'unrelated', 'banana', 'spaceship', '--json']).out);
    assert.equal(cliJson.matches.length, 0, `fixture precondition: how --json must also find nothing: ${JSON.stringify(cliJson)}`);
  });
});

// ===================================================================================================================
describe('session-context agrees with `status`/`report`/`map` on repo-wide counts', () => {
  let tmp, repo;
  before(() => {
    ({ tmp, repo } = initRepo('grain-xcheck-agree-sessctx-'));
    wIn(repo, 'packages/core/util.ts', 'export const util = () => 1;\n');
    wIn(repo, 'packages/infra/db.ts', "import { util } from '../core/util';\nexport const db = () => util();\n");
    wIn(repo, 'apps/a/main.ts', "import { util } from '../../packages/core/util';\nimport { db } from '../../packages/infra/db';\nexport const a = () => util() + db();\n");
    gitIn(repo, {}, 'add', '-A'); gitIn(repo, {}, 'commit', '-qm', 'base');
    const st = grainIn(repo, ['status']); assert.equal(st.code, 0, st.err);
  });
  after(() => rmSync(tmp, { recursive: true, force: true }));

  test('files/groups/conventions: session-context\'s own ready-state numbers equal `status --json`\'s', () => {
    const h = hookCall('session-context', { cwd: repo }, repo);
    assert.equal(h.code, 0, h.err);
    const text = JSON.parse(h.out).hookSpecificOutput.additionalContext;
    const m = /: (\d+) files, (\d+) groups, (\d+) conventions in source code/.exec(text);
    assert.ok(m, `expected the ready-state line in session-context: ${text}`);
    const st = JSON.parse(grainIn(repo, ['status', '--json']).out);
    assert.equal(+m[1], st.files, 'files count must match status --json');
    assert.equal(+m[2], st.signal.groups, 'groups count must match status --json');
    assert.equal(+m[3], st.signal.facts, 'conventions count must match status --json');
  });

  test('architecture: session-context\'s module/dependency/cycle counts equal `report`\'s == architecture == header; layer count equals `map`\'s own layers', () => {
    const h = hookCall('session-context', { cwd: repo }, repo);
    const text = JSON.parse(h.out).hookSpecificOutput.additionalContext;
    const am = /Architecture \(measured\): (\d+) modules, (\d+) dependencies, (\d+) cycle\(s\), (\d+) layer\(s\)/.exec(text);
    assert.ok(am, `fixture precondition: session-context must report a graph: ${text}`);
    const reportOut = grainIn(repo, ['report']).out;
    const rm = /== architecture — (\d+) modules · (\d+) directed dependencies · (\d+) cycle\(s\) ==/.exec(reportOut);
    assert.ok(rm, `fixture precondition: report must print the architecture header: ${reportOut}`);
    assert.equal(am[1], rm[1], 'module count must agree with report'); assert.equal(am[2], rm[2], 'dependency count must agree with report'); assert.equal(am[3], rm[3], 'cycle count must agree with report');
    const mapOut = grainIn(repo, ['map']).out;
    const layerCount = (mapOut.match(/layer \d+/g) || []).length;
    assert.equal(+am[4], layerCount, 'layer count must agree with map\'s own layers: line');
  });

  test('honest absence agrees too: a repo with no module graph omits the Architecture line in session-context, matching report\'s own omission of == architecture ==', () => {
    const { tmp: tmp2, repo: repo2 } = initRepo('grain-xcheck-agree-sessctx-none-');
    try {
      wIn(repo2, 'README.md', 'hello\n');
      gitIn(repo2, {}, 'add', '-A'); gitIn(repo2, {}, 'commit', '-qm', 'base');
      const st2 = grainIn(repo2, ['status']); assert.equal(st2.code, 0, st2.err);
      const h = hookCall('session-context', { cwd: repo2 }, repo2);
      assert.equal(h.code, 0, h.err);
      const text = JSON.parse(h.out).hookSpecificOutput.additionalContext;
      assert.doesNotMatch(text, /Architecture \(measured\)/, 'no module graph — session-context must not claim one');
      const reportOut = grainIn(repo2, ['report']).out;
      assert.doesNotMatch(reportOut, /== architecture —/, 'fixture precondition: report must also have nothing to say about architecture');
    } finally { rmSync(tmp2, { recursive: true, force: true }); }
  });
});
