// G14: `Math.round(share * 100)` rounds any share in [0.995, 1) up to the display value 100 — so a fact with
// nonzero deviants (e.g. share=0.997, 2 deviants) prints "100% of N established, 2 deviants" in the SAME sentence,
// a direct self-contradiction of what `report`/`check`/`rules` otherwise teach a reader "100% of N" to mean (a rule
// with zero exceptions). Fixed by a shared `pct()` helper (core.mjs) with a floor at 99 for any share < 1, applied
// at every site that rounds a share to a percentage for display.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { report, rulesMarkdown, whereCmd } from '../engine/core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

// ===== hand-built models: report()/rulesMarkdown() only ever consume model.partitions[].facts, built the same
// shape learn() builds them in (mirrors report-fact-tiers.test.mjs / architecture-norms.test.mjs Part 1) =====
function fact(overrides = {}) {
  return { cid: '_all:type', kind: 'type', pid: 'auto.deco:@Handler', exp: 'true',
    share: 0.997, sraw: 600, deviantsN: 2, bpi: 5,
    exemplars: [{ rel: 'src/handlers/H0.ts', line: 1, name: 'H0' }],
    held: null, trend: undefined, alphabet: undefined, counts: undefined,
    ...overrides }; }
function modelOf(f) {
  return { repo: 'fixture', partitions: [{ name: '_root', scopes: f.sraw, medoids: [], files: ['src/handlers/H0.ts'], facts: [f], templates: [] }], cochange: [], agentShare: null }; }

test('(a) report(): a fact with share=0.997 and 2 deviants prints "99%", never "100%", in the same sentence as the deviant count', () => {
  const lines = report(modelOf(fact()), { top: 15 });
  const text = lines.join('\n');
  assert.match(text, /99% of 600 established, 2 deviants/, `expected the honest 99%, got: ${text}`);
  assert.doesNotMatch(text, /100% of 600 established, 2 deviants/, `must never print a self-contradicting 100% alongside nonzero deviants: ${text}`);
});

test('(a) rulesMarkdown(): the same fact prints "99%" in its evidence cell, never "100%"', () => {
  const lines = rulesMarkdown(modelOf(fact()), { top: 15 });
  const text = lines.join('\n');
  assert.match(text, /99% of 600 established, 2 deviants/, `expected the honest 99%, got: ${text}`);
  assert.doesNotMatch(text, /100% of 600 established, 2 deviants/, `must never print a self-contradicting 100%: ${text}`);
});

test('(b) report(): a fact with share=1.0 and 0 deviants still prints "100%" — the floor must not over-fire', () => {
  const f = fact({ share: 1, sraw: 600, deviantsN: 0 });
  const lines = report(modelOf(f), { top: 15 });
  const text = lines.join('\n');
  assert.match(text, /100% of 600 established/, `an exact 1.0 share must still print 100%: ${text}`);
});

test('(b) rulesMarkdown(): the same exact-1.0 fact still prints "100%"', () => {
  const f = fact({ share: 1, sraw: 600, deviantsN: 0 });
  const lines = rulesMarkdown(modelOf(f), { top: 15 });
  const text = lines.join('\n');
  assert.match(text, /100% of 600 established/, `an exact 1.0 share must still print 100%: ${text}`);
});

test('(c) report(): printFact\'s trend array renders a 0.996 trend point as 99, not 100', () => {
  const f = fact({ trend: { shares: [{ share: 0.5 }, { share: 0.996 }], nucleating: null } });
  const lines = report(modelOf(f), { top: 15 });
  const text = lines.join('\n');
  assert.match(text, /trend\[50>99%\]/, `expected the trend array to round the 0.996 point down to 99: ${text}`);
  assert.doesNotMatch(text, /trend\[50>100%\]/, `must never round a <1 trend share up to 100: ${text}`);
});

test('(c) rulesMarkdown(): row()\'s trend note renders the same 0.996 point as 99, not 100', () => {
  const f = fact({ trend: { shares: [{ share: 0.5 }, { share: 0.996 }], nucleating: null } });
  const lines = rulesMarkdown(modelOf(f), { top: 15 });
  const text = lines.join('\n');
  assert.match(text, /trend 50>99%/, `expected the trend note to round the 0.996 point down to 99: ${text}`);
  assert.doesNotMatch(text, /trend 50>100%/, `must never round a <1 trend share up to 100: ${text}`);
});

// ===== hand-built partition: whereCmd()'s group-card "comes with" companion line =====
function companionModel(companionShare) {
  const n = 5;
  const keys = []; for (let i = 0; i < n; i++) keys.push(`src/widgets/W${i}.ts#type#Widget${i}`);
  const assignments = {}; keys.forEach(k => { assignments[k] = 0; });
  const partition = { name: '_root', scopes: n, medoids: [{ label: 'Widget', feats: [] }], files: keys.map(k => k.split('#')[0]),
    facts: [], templates: [], assignments, markers: {},
    groupImplied: { 0: { companion: { pattern: '*.service.ts', share: companionShare, n: 40, example: 'src/widgets/w.service.ts' } } },
    markerImplied: {} };
  return { repo: 'fixture', partitions: [partition], cochange: [], agentShare: null, steers: [], boundaries: [], moduleGraph: null }; }

test('(d) whereCmd(): a group-card companion share of 0.995 renders "99%", not "100%"', () => {
  const { lines } = whereCmd({ model: companionModel(0.995), query: 'Widget', top: 10 });
  const text = lines.join('\n');
  assert.match(text, /a same-stem `\*\.service\.ts` companion \(99% of 40 have one/, `expected 99%, got: ${text}`);
  assert.doesNotMatch(text, /a same-stem `\*\.service\.ts` companion \(100% of 40 have one/, `must never round a <1 companion share up to 100: ${text}`);
});

test('(d) whereCmd(): a group-card companion share of exactly 1 still renders "100%"', () => {
  const { lines } = whereCmd({ model: companionModel(1), query: 'Widget', top: 10 });
  const text = lines.join('\n');
  assert.match(text, /a same-stem `\*\.service\.ts` companion \(100% of 40 have one/, `an exact 1.0 companion share must still print 100%: ${text}`);
});

// ===== real git-backed fixture: `report`, `rules` and `check`'s "conforms to:" line all read the SAME established
// fact off the SAME repo — a population of `total` classes where all but `deviants` carry `@Handler()`, aged past
// CFG.freshDays so the convention is established. total=410, deviants=2 gives share = 408/410 = 0.99512..., which
// today rounds up to a self-contradicting "100% ... 2 deviants" and must instead read "99%". =====
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: `${iso}T12:00:00Z`, GIT_COMMITTER_DATE: `${iso}T12:00:00Z` });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } });
function buildHandlerRepo(repo, { total, deviants }) {
  mkdirSync(join(repo, 'src', 'handlers'), { recursive: true });
  gitIn(repo, {}, 'init', '-q', '-b', 'main'); gitIn(repo, {}, 'config', 'commit.gpgsign', 'false');
  for (let i = 0; i < total; i++) {
    const deco = i < deviants ? '' : '@Handler()\n';
    writeFileSync(join(repo, 'src', 'handlers', `H${i}.ts`), `${deco}export class H${i} {\n  run() {\n    return ${i};\n  }\n}\n`);
  }
  gitIn(repo, dateEnv('2026-01-01'), 'add', '-A'); gitIn(repo, dateEnv('2026-01-01'), 'commit', '-qm', `add ${total} handler classes`);
  writeFileSync(join(repo, 'NOTES.md'), 'notes\n'); // pushes HEAD's own timestamp forward so the classes above clear freshDays and are "established"
  gitIn(repo, dateEnv('2026-02-15'), 'add', '-A'); gitIn(repo, dateEnv('2026-02-15'), 'commit', '-qm', 'notes');
}
const grain = (repo, args) => spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' });
const grainOut = (repo, args) => { const r = grain(repo, args); assert.equal(r.status, 0, r.stdout + r.stderr); return (r.stdout || '').replace(/\n$/, ''); };

let tmp, repoDeviants, repoPerfect;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-pct-'));
  repoDeviants = join(tmp, 'deviants'); buildHandlerRepo(repoDeviants, { total: 410, deviants: 2 });
  repoPerfect = join(tmp, 'perfect'); buildHandlerRepo(repoPerfect, { total: 20, deviants: 0 });
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('(a) grain report on a real repo: share=408/410 prints "99% of 410 established, 2 deviants", never "100%"', () => {
  const out = grainOut(repoDeviants, ['report']);
  assert.match(out, /types here are annotated with `@Handler` — 99% of 410 established, 2 deviants/, out);
  assert.doesNotMatch(out, /100% of 410 established, 2 deviants/, out);
});

test('(a) grain rules on the same repo: the table cell prints "99% of 410 established, 2 deviants", never "100%"', () => {
  const out = grainOut(repoDeviants, ['rules', '--top', '40']);
  assert.match(out, /99% of 410 established, 2 deviants/, out);
  assert.doesNotMatch(out, /100% of 410 established, 2 deviants/, out);
});

test('(a) grain check on a conforming file in the same repo: "conforms to:" prints "@Handler` (99% of 410)", never "(100% of 410)" for that fact', () => {
  // other facts on this same population (naming shape, export style) have a genuine, exact 1.0 share (0 deviants)
  // and correctly print 100% alongside the `@Handler` fact's 99% — only the `@Handler` clause itself is asserted here
  const out = grainOut(repoDeviants, ['check', 'src/handlers/H5.ts']);
  assert.match(out, /conforms to:.*@Handler` \(99% of 410\)/, out);
  assert.doesNotMatch(out, /conforms to:.*@Handler` \(100% of 410\)/, out);
});

test('(b) grain report/rules/check on a repo with zero deviants still print "100%" — the floor does not over-fire', () => {
  const rOut = grainOut(repoPerfect, ['report']);
  assert.match(rOut, /types here are annotated with `@Handler` — 100% of 20 established/, rOut);
  const rulesOut = grainOut(repoPerfect, ['rules', '--top', '40']);
  assert.match(rulesOut, /100% of 20 established/, rulesOut);
  const checkOut = grainOut(repoPerfect, ['check', 'src/handlers/H0.ts']);
  assert.match(checkOut, /conforms to:.*\(100% of 20\)/, checkOut);
});
