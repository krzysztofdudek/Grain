// CROSS-CHECK: two independent honesty properties of grain's answers.
//
// (1) THE STAMP TELLS THE TRUTH, EVERYWHERE. grain's own help text says "Every answer ends with
// `as of <sha>[+dirty]`." This file tests that literally, one test per command, over one shared fixture.
//
// RULING (project orchestrator; supersedes this file's original "judgment call" — the reasoning below is the
// decided project semantics, not a local guess): the stamp says what the answer was COMPUTED FROM. `as of <sha>`
// means "computed from sha." Therefore `+dirty` may only mean ONE thing: "this answer incorporates your
// uncommitted edits" — exactly `check`'s existing meaning, since `check` reads the worktree directly. Consequences,
// all encoded below:
//   (a) `explain`/`spectrum` stamping `+dirty` while rendering HEAD-cached data (ticket 013) is not a discharge of
//       013's acceptance criterion — it is a FALSE claim under this stamp's own semantics. The strict reading this
//       file always used for 013 stands; the two 013 tests below are unchanged.
//   (b) The 8 commands that never say `+dirty` (where/how/what/map/status/report/rules/completeness) are CORRECT
//       AS-IS under this semantics — none of them reads the worktree, so none of them may claim to have
//       incorporated it. The FORBIDDEN FIX is "add +dirty to those 8 call sites": that would propagate the exact
//       same false claim 013 has, to 8 more commands. This file is shaped to go RED, not green, if that fix ships:
//       each of the 8 gets a `!includes('+dirty')` clause that must stay green forever, paired with a `notEqual`
//       clause that demands the REAL gap get closed instead — on a dirty tree, a HEAD-reading command owes some
//       OTHER, not-yet-designed, distinct disclosure (ticket 024(c), re-scoped from this file's own findings;
//       024(a) is the doc/help-text over-promise "every answer ends with ... [+dirty]", 024(b) is explain's false
//       claim, cross-referenced with 013).
// Given (a)+(b), the property loop below is asymmetric on purpose: `check` keeps a plain "dirty ⇒ +dirty"
// assertion (truthful, unchanged in spirit); the 8 HEAD-readers get a two-clause assertion (never claim +dirty —
// green forever; but a dirty tree must still look visibly different somehow — red until 024(c) ships a real
// marker); `explain` gets a conditional ("if it claims +dirty, the content had better actually differ") instead of
// a blanket "must claim +dirty", because demanding the claim outright would have been demanding the false claim.
//
// (2) FRESHNESS (ticket .temp/issues/013-explain-ignores-worktree/issue.md, OPEN at the time this test was
// written, and still open as of the ruling above). `explain`/`spectrum` mine a file's scopes from the HEAD-indexed
// tree cache, not the worktree — `checkFile` (used by `check`) reads the worktree directly. So a file mid-edit can
// make `check` see a live deviation while `explain` keeps reporting the committed, pre-edit shape with no
// indication anything is stale. 013's acceptance: "with a real uncommitted deviation in a file: `explain` either
// reports it (like `check` does) or carries a visible staleness marker. A clean worktree behaves exactly as
// today. Test both directions." Per the ruling above, bare `+dirty` does NOT count as that marker — it is spoken
// for as "incorporates the edit," which explain's HEAD-only content does not do. Both 013 tests below are
// therefore RED while the bug is open, unchanged from this file's original encoding.
//
// FIXTURE NOTE (invariant 2's "sharper case" and the explain-conditional test): reproducing a CERTIFIED,
// role-conditioned NORM fact (`auto.extends:Command`) from mine()'s own heuristics on a fixture this small is
// unreliable — the same problem tests/spectrum-role-deviation.test.mjs documents and solves the same way: real
// TypeScript, really parsed and really clustered, with just the one role assignment and the one NORM fact
// asserted directly onto the freshly mined model (standing in for what a much larger real Command population
// would make mine() accept on its own). The PAIRED/EXTRA naming and commandSrc/handlerSrc shape below are
// deliberately the same shape that file uses.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { partitionFor } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const wIn = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grainIn = (repo, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const initRepo = name => { const tmp = mkdtempSync(join(tmpdir(), name)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, {}, 'init', '-q', '-b', 'main'); gitIn(repo, {}, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };
const modelPathOf = repo => join(repo, '.grain', 'cache', 'model.json');
const loadModel = repo => JSON.parse(readFileSync(modelPathOf(repo), 'utf8'));
const saveModel = (repo, model) => writeFileSync(modelPathOf(repo), JSON.stringify(model));
const tailOf = (s, n = 240) => JSON.stringify(s.slice(-n));

// ===================================================================================================
// INVARIANT 1 — "the stamp tells the truth, everywhere": one plain fixture, real content, 3 commits.
// ===================================================================================================
let tmp1, repo1, sha1;
before(() => {
  ({ tmp: tmp1, repo: repo1 } = initRepo('grain-stamp-truth-'));
  wIn(repo1, 'src/util.js', `export function add(a, b) {\n  return a + b;\n}\nexport function sub(a, b) {\n  return a - b;\n}\n`);
  wIn(repo1, 'src/main.js', `import { add } from './util.js';\nexport function run() {\n  return add(1, 2);\n}\n`);
  const d1 = dateEnv('2026-01-01T10:00:00Z');
  gitIn(repo1, d1, 'add', '-A'); gitIn(repo1, d1, 'commit', '-qm', 'init: util + main');

  wIn(repo1, 'src/util.js', `export function add(a, b) {\n  return a + b;\n}\nexport function sub(a, b) {\n  return a - b;\n}\nexport function mul(a, b) {\n  return a * b;\n}\n`);
  const d2 = dateEnv('2026-01-05T10:00:00Z');
  gitIn(repo1, d2, 'add', '-A'); gitIn(repo1, d2, 'commit', '-qm', 'util: add mul');

  wIn(repo1, 'src/api.js', `export function fetchUser(id) {\n  return { id, name: 'user' + id };\n}\nexport function fetchOrder(id) {\n  return { id, total: 42 };\n}\n`);
  wIn(repo1, 'src/config.js', `export const BASE_URL = 'https://example.com';\nexport function getConfig() {\n  return { url: BASE_URL };\n}\n`);
  const d3 = dateEnv('2026-01-10T10:00:00Z');
  gitIn(repo1, d3, 'add', '-A'); gitIn(repo1, d3, 'commit', '-qm', 'add api + config');

  assert.equal(grainIn(repo1, ['status']).code, 0);
  sha1 = gitIn(repo1, {}, 'rev-parse', 'HEAD').slice(0, 7); // matches engine/grain.mjs's own `short()` exactly
});
after(() => { if (tmp1) rmSync(tmp1, { recursive: true, force: true }); });

// every HEAD-reading command grain ships — none of these reads any specific file's worktree content, so under the
// ruling above none of them may ever claim +dirty. What they DO owe, on a dirty tree, is SOME distinct, visible
// disclosure (024(c), not yet designed) — encoded here as "must not render byte-identical to the clean run."
const DIRTY_FILE = 'src/util.js';
const DIRTY_SUFFIX = '\n// an uncommitted, harmless note\n';
const HEAD_READERS = [
  { name: 'where <intent>', args: ['where', 'add'] },
  { name: 'how <intent>', args: ['how', 'add'] },
  { name: 'what <words>', args: ['what', 'add'] },
  { name: 'map', args: ['map'] },
  { name: 'status', args: ['status'] },
  { name: 'report', args: ['report'] },
  { name: 'rules', args: ['rules'] },
  { name: 'completeness <file>', args: ['completeness', DIRTY_FILE] },
];

for (const { name, args } of HEAD_READERS) {
  test(`stamp truth · \`grain ${name}\`: HEAD-reader never claims +dirty; a dirty tree must be visibly disclosed (024(c), RED until the marker is designed)`, () => {
    const cleanRes1 = grainIn(repo1, args);
    const cleanRes2 = grainIn(repo1, args); // determinism guard — without this, the notEqual clause below could pass on incidental noise instead of a real disclosure
    assert.equal(cleanRes1.code, 0, `grain ${args.join(' ')} (clean) exited ${cleanRes1.code}: ${cleanRes1.err}`);
    assert.equal(cleanRes2.code, 0, `grain ${args.join(' ')} (clean, 2nd run) exited ${cleanRes2.code}: ${cleanRes2.err}`);
    assert.equal(cleanRes1.out, cleanRes2.out, `two consecutive clean runs must be byte-identical (deterministic) — got ${tailOf(cleanRes1.out)} vs ${tailOf(cleanRes2.out)}`);
    assert.match(cleanRes1.out, new RegExp(`as of ${sha1}`), `clean run must carry "as of ${sha1}" — got ${tailOf(cleanRes1.out)}`);
    assert.ok(!cleanRes1.out.includes('+dirty'), `a clean worktree must never claim +dirty — got ${tailOf(cleanRes1.out)}`);

    let dirtyRes;
    try {
      const before2 = readFileSync(join(repo1, DIRTY_FILE), 'utf8');
      wIn(repo1, DIRTY_FILE, before2 + DIRTY_SUFFIX);
      dirtyRes = grainIn(repo1, args);
    } finally { gitIn(repo1, {}, 'checkout', '--', DIRTY_FILE); }
    assert.equal(dirtyRes.code, 0, `grain ${args.join(' ')} (dirty) exited ${dirtyRes.code}: ${dirtyRes.err}`);

    // (a) the forbidden-fix guard — must stay green forever. RULING: +dirty means "this answer incorporates your
    // uncommitted edits." This command never reads DIRTY_FILE's worktree content, so it may never claim +dirty,
    // dirty tree or not.
    assert.ok(!dirtyRes.out.includes('+dirty'),
      `ruling violation: \`grain ${args.join(' ')}\` is a HEAD-reader (it never reads ${DIRTY_FILE}'s worktree content) yet its stamp claimed +dirty on a dirty tree — that would be the FALSE claim the ruling forbids, not a fix. Got ${tailOf(dirtyRes.out)}`);
    // (b) the real gap (024c) — expected RED today: some OTHER, not-yet-designed marker should distinguish a
    // dirty tree from a clean one for this command; today the two runs are byte-identical.
    assert.notEqual(dirtyRes.out, cleanRes1.out,
      `024(c): a dirty tree (uncommitted edit to ${DIRTY_FILE}) produced output byte-identical to the clean run — \`grain ${args.join(' ')}\` has no distinct disclosure yet for "the tree you're answering about has uncommitted changes elsewhere." Got ${tailOf(dirtyRes.out)}`);
  });
}

test('stamp truth · `grain check <file>`: a dirty tree it actually reads must say +dirty (truthful — check reads the worktree)', () => {
  const args = ['check', DIRTY_FILE];
  const cleanRes = grainIn(repo1, args);
  assert.equal(cleanRes.code, 0, `grain ${args.join(' ')} (clean) exited ${cleanRes.code}: ${cleanRes.err}`);
  assert.match(cleanRes.out, new RegExp(`as of ${sha1}`), `clean run must carry "as of ${sha1}" — got ${tailOf(cleanRes.out)}`);
  assert.ok(!cleanRes.out.includes('+dirty'), `a clean worktree must never claim +dirty — got ${tailOf(cleanRes.out)}`);

  let dirtyRes;
  try {
    const before2 = readFileSync(join(repo1, DIRTY_FILE), 'utf8');
    wIn(repo1, DIRTY_FILE, before2 + DIRTY_SUFFIX);
    dirtyRes = grainIn(repo1, args);
  } finally { gitIn(repo1, {}, 'checkout', '--', DIRTY_FILE); }
  assert.equal(dirtyRes.code, 0, `grain ${args.join(' ')} (dirty) exited ${dirtyRes.code}: ${dirtyRes.err}`);
  assert.match(dirtyRes.out, /\+dirty/,
    `check reads ${DIRTY_FILE}'s worktree content directly, so its answer genuinely incorporates the uncommitted edit — the ruling says +dirty is exactly the right claim here. Got ${tailOf(dirtyRes.out)}`);
});

// ===================================================================================================
// INVARIANT 2 — freshness (ticket 013): a second fixture, big enough to clear the partition floor
// (groupPartitions only forms a partition once the small-package bucket reaches 30 scopes; a handful of
// 2-scope files never gets there) and to carry a certified, role-conditioned `auto.extends:Command` NORM.
// ===================================================================================================
const commandSrc = (name, extendsCommand = true) => `export class ${name}Command${extendsCommand ? ' extends Command' : ''} {\n  readonly id: number;\n  constructor(id: number) {\n    this.id = id;\n  }\n}\n`;
const handlerSrc = name => `export class ${name}Handler {\n  handle(cmd: ${name}Command): number {\n    return cmd.id;\n  }\n}\n`;
const PAIRED = ['Order', 'Payment', 'Shipment', 'Refund', 'Invoice', 'Cart', 'Customer', 'Product'];
const EXTRA = ['Stock', 'Coupon', 'Notification', 'Audit', 'Report', 'Ticket'];
const TARGET_REL = 'src/handlers/Order.ts';
const scopeCountOf = out => { const m = /·\s*(\d+)\s*scopes\s*·/.exec(out); return m ? +m[1] : null; };
// the same whole-new-method edit used by both the explain-conditional test and the 013 scope-count test: a WHOLE
// NEW METHOD on the tracked, already-indexed class, which changes the scope count if (and only if) explain
// re-parses the worktree rather than replaying the HEAD-indexed tree cache
const addDescribeMethod = src => src.replace(
  'export class OrderCommand extends Command {\n  readonly id: number;\n  constructor(id: number) {\n    this.id = id;\n  }\n}',
  "export class OrderCommand extends Command {\n  readonly id: number;\n  constructor(id: number) {\n    this.id = id;\n  }\n  describe(): string {\n    return 'order:' + this.id;\n  }\n}");

let tmp2, repo2, poisonedRoleCid;
before(() => {
  ({ tmp: tmp2, repo: repo2 } = initRepo('grain-freshness-013-'));
  for (const e of PAIRED) wIn(repo2, `src/handlers/${e}.ts`, commandSrc(e) + '\n' + handlerSrc(e));
  for (const e of EXTRA) wIn(repo2, `src/handlers/${e}Only.ts`, commandSrc(e));
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  gitIn(repo2, d1, 'add', '-A'); gitIn(repo2, d1, 'commit', '-qm', 'the freshness fixture: Command/Handler pairs');
  assert.equal(grainIn(repo2, ['status']).code, 0);

  const model = loadModel(repo2);
  const part = partitionFor(model, TARGET_REL);
  const ROLE = part.medoids.length; // a fresh, never-colliding role index — same technique as spectrum-role-deviation.test.mjs
  poisonedRoleCid = `r${ROLE}:type`;
  part.medoids.push({ label: 'Command', feats: ['sup:Command'] });
  for (const e of PAIRED) { part.assignments[`src/handlers/${e}.ts#type#${e}Command`] = ROLE; part.assignments[`src/handlers/${e}.ts#type#${e}Handler`] = -1; }
  for (const e of EXTRA) part.assignments[`src/handlers/${e}Only.ts#type#${e}Command`] = ROLE;
  part.facts.push({ cid: poisonedRoleCid, kind: 'type', pid: 'auto.extends:Command', exp: 'true',
    parentExp: null, counts: { true: 14 }, srawCounts: { true: 14 }, alphabet: ['true', 'false'],
    raw: 14, sraw: 14, share: 1, bpi: 1, tau: 3, nSurfaces: 1, siblings: [],
    suppressedValue: null, denyEligible: false, exemplars: [], deviantsN: 0, deviants: [], altMarker: null });
  saveModel(repo2, model);
});
after(() => { if (tmp2) rmSync(tmp2, { recursive: true, force: true }); });

test('013 regression guard (must stay GREEN): a CLEAN worktree — explain behaves exactly as today', () => {
  const out1 = grainIn(repo2, ['explain', TARGET_REL, '--no-refresh']).out;
  const out2 = grainIn(repo2, ['explain', TARGET_REL, '--no-refresh']).out;
  assert.equal(out1, out2, 'two consecutive clean runs must be byte-identical — no incidental noise, no false staleness');
  assert.ok(!out1.includes('+dirty'), `a clean worktree must never show +dirty — got ${tailOf(out1)}`);
  assert.ok(!/\(STALE\)/.test(out1), `a clean worktree must never show a staleness marker — got ${tailOf(out1)}`);
  const n = scopeCountOf(out1);
  // measured directly on this fixture: file + OrderCommand + its constructor + OrderHandler + handle() = 5
  assert.equal(n, 5, `expected 5 scopes on a clean, unedited ${TARGET_REL}; got ${n} — full header: ${out1.split('\n')[0]}`);

  const chk = grainIn(repo2, ['check', TARGET_REL, '--no-refresh']);
  assert.equal(chk.code, 0);
  assert.match(chk.out, /0 deviation\(s\) in your change/, `a clean, conforming file must show 0 deviations: ${chk.out}`);
});

test('stamp truth · `grain explain`: a +dirty claim must mean the answer reflects the edit (else it is the ruled-false claim)', () => {
  const cleanOut = grainIn(repo2, ['explain', TARGET_REL, '--no-refresh']).out;
  const cleanScopes = scopeCountOf(cleanOut);
  assert.ok(cleanScopes > 0, `expected a scope count in explain's clean output: ${tailOf(cleanOut)}`);

  let dirtyOut;
  try {
    const src = readFileSync(join(repo2, TARGET_REL), 'utf8');
    const edited = addDescribeMethod(src);
    assert.notEqual(edited, src, 'fixture-soundness: the string replace must actually match Order.ts\'s real content');
    wIn(repo2, TARGET_REL, edited);
    dirtyOut = grainIn(repo2, ['explain', TARGET_REL, '--no-refresh']).out;
  } finally { gitIn(repo2, {}, 'checkout', '--', TARGET_REL); }

  const claimsDirty = dirtyOut.includes('+dirty');
  const dirtyScopes = scopeCountOf(dirtyOut);
  const reflectsEdit = dirtyScopes !== cleanScopes;
  assert.ok(!claimsDirty || reflectsEdit,
    `ruling: +dirty may only mean "this answer incorporates your uncommitted edits." explain's stamp ${claimsDirty ? 'DID claim +dirty' : 'did not claim +dirty'} on the edited ${TARGET_REL}, yet its scope count stayed at ${dirtyScopes} (clean: ${cleanScopes}) — i.e. it rendered HEAD-cached data while (if it claimed +dirty) implying otherwise. This is 013's staleness bug made visible as a false stamp claim. dirty header: ${dirtyOut.split('\n')[0]}`);
});

test('013 (expected RED while open): explain either reflects a worktree method addition or marks staleness — scope count', () => {
  const cleanOut = grainIn(repo2, ['explain', TARGET_REL, '--no-refresh']).out;
  const cleanScopes = scopeCountOf(cleanOut);
  assert.ok(cleanScopes > 0, `expected a scope count in explain's clean output: ${tailOf(cleanOut)}`);

  let dirtyOut;
  try {
    const src = readFileSync(join(repo2, TARGET_REL), 'utf8');
    const edited = addDescribeMethod(src);
    assert.notEqual(edited, src, 'fixture-soundness: the string replace must actually match Order.ts\'s real content');
    wIn(repo2, TARGET_REL, edited);
    dirtyOut = grainIn(repo2, ['explain', TARGET_REL, '--no-refresh']).out;
  } finally { gitIn(repo2, {}, 'checkout', '--', TARGET_REL); }

  const dirtyScopes = scopeCountOf(dirtyOut);
  const reflectsEdit = dirtyScopes !== cleanScopes;
  // RULING: a bare "+dirty" is NOT accepted here as 013's "visible staleness marker" — it is spoken for under the
  // stamp semantics as "incorporates the edit," which this HEAD-cached answer does not do. Only `(STALE)`
  // (index-behind-HEAD) counts as the other existing marker. Encoding the ruled reading on purpose.
  const staleMarker = /\(STALE\)/.test(dirtyOut);
  assert.ok(reflectsEdit || staleMarker,
    `013: explain neither reflected the new method (clean ${cleanScopes} scopes vs dirty ${dirtyScopes} scopes — ` +
    `identical means stale) nor carried a staleness marker beyond bare +dirty (ruled out — see file-top rationale). ` +
    `dirty header: ${dirtyOut.split('\n')[0]} · dirty tail: ${tailOf(dirtyOut, 80)}`);
});

test('013 (expected RED while open): check sees a worktree deviation explain silently misses — sharper case', () => {
  const cleanCheck = grainIn(repo2, ['check', TARGET_REL, '--no-refresh']);
  assert.equal(cleanCheck.code, 0);
  assert.match(cleanCheck.out, /0 deviation\(s\) in your change/, `fixture-soundness: the clean, committed file must conform before we break it: ${cleanCheck.out}`);

  let dirtyCheck, dirtyExplain;
  try {
    const src = readFileSync(join(repo2, TARGET_REL), 'utf8');
    const edited = src.replace('export class OrderCommand extends Command {', 'export class OrderCommand {');
    assert.notEqual(edited, src, 'fixture-soundness: the string replace must actually strip `extends Command` from real content');
    wIn(repo2, TARGET_REL, edited);
    dirtyCheck = grainIn(repo2, ['check', TARGET_REL, '--no-refresh']);
    // wide open on purpose: the role-conditioned NORM row's own bits are small on a fixture this size and would
    // otherwise be cut by the default minBits/top — a real CLI flag, not a test-only backdoor, widens the view
    dirtyExplain = grainIn(repo2, ['explain', TARGET_REL, '--no-refresh', '--minbits', '-1000', '--top', '500']);
  } finally { gitIn(repo2, {}, 'checkout', '--', TARGET_REL); }

  // `checkFile` reads the worktree directly (by design — this is the half of 013 that already works) and must
  // catch the real, uncommitted deviation from the certified Command convention
  assert.equal(dirtyCheck.code, 0);
  assert.match(dirtyCheck.out, /does not extend `Command`/, `check must see the live edit removing "extends Command": ${dirtyCheck.out}`);

  assert.equal(dirtyExplain.code, 0);
  const rowLine = dirtyExplain.out.split('\n').find(l => l.includes(poisonedRoleCid) && l.includes('auto.extends:Command'));
  assert.ok(rowLine, `expected a ${poisonedRoleCid} auto.extends:Command row in explain's output: ${tailOf(dirtyExplain.out, 600)}`);
  const explainSeesIt = /THIS FILE DEVIATES/.test(rowLine);
  const staleMarker = /\(STALE\)/.test(dirtyExplain.out);
  assert.ok(explainSeesIt || staleMarker,
    `013: check caught "OrderCommand does not extend Command" on the dirty worktree; explain's OWN role-scoped ` +
    `NORM row for the identical fact/file shows no deviation and no staleness marker beyond bare +dirty ` +
    `(ruled out — see file-top rationale) — row: ${JSON.stringify(rowLine)}. This is the exact ` +
    `"check sees your edit, explain silently doesn't" contradiction ticket 013 reports.`);
});
