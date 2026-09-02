// Cross-check: `check <file>` (one file, full detail) and `review` (`check` over many files, aggregated) must
// never disagree about the SAME file — class C ("two outputs over one model disagree") applied to this specific
// pair. §053 (already merged) fixed ONE instance of this drift: a degraded parse (`r.hasError`) survived into
// `check`'s output but silently vanished from `review`'s aggregate whenever the parseable remainder deviated from
// nothing — the file dropped out of review's "no finding at all" skip exactly like a genuinely clean file, with
// nothing saying so. This file's job (per the instr-cross-check task) is to (1) pin that fix as a cross-check
// property rather than the regex-based fixture pin disclosure-fixtures.test.mjs already carries, and (2) audit for
// a SECOND caveat of the same shape.
//
// (2) turned up a real candidate — `checkFile`'s `newScopeHits` ("scopes new to the index — judged against the
// package baseline only", never classified conforming or deviant) has the IDENTICAL absence: `fileFindings`'s own
// `lines` array never includes it, so a file whose only content is unclassified-in-change scopes is dropped by
// review's "no finding at all" skip exactly like §053's hasError case, and neither `check --json` nor `review
// --json` carries the fact in machine-readable form at all (not even for `check`'s own single file).
//
// UNLIKE §053, propagating this one turned out to be the WRONG call, discovered only by actually wiring it up and
// running the full suite: `hasError` is a rare, always-worth-surfacing "something is broken" signal, but
// `newScopeHits` fires on EVERY qualifying scope of EVERY brand-new file, matched or not — see checkFile
// (core.mjs): every branch of its bucket-building loop (below-floor, bestCert, secondCert, nocert) pushes a hit;
// there is no "matched well enough to not bother" exit. A first attempt wired this into `review` exactly like
// §053 (making an otherwise-clean new file survive review's skip, plus new `unclassifiedInChange`/
// `unclassifiedPreExisting` --json fields) and broke two settled, pre-existing tests that encode the OPPOSITE,
// deliberate decision: review-command.test.mjs's own "only the file WITH a finding appears in findings — a clean
// file, tracked or untracked, contributes nothing" (a brand-new file matching an established convention EXACTLY
// still trips newScopeHits, since match quality never suppresses it) and missing-renderer.test.mjs's frozen
// `check <file> --json` key-list snapshot. That is a judgment call already made in the other direction, not an
// oversight — reverted here rather than fought. See git history for the reverted attempt if a future ticket wants
// to revisit it (e.g. only surfacing the caveat's own SHARE/count on a file review already lists for another
// reason, never adding a brand-new "clean" file to the aggregate) — untested territory this file does not attempt.
//
// THE PROPERTY (unchanged, still real, still worth pinning): for a file review already lists for some OTHER reason
// (a real deviation, or a degraded parse), `check <file> --json` (default worktree mode) must be BYTE-FOR-BYTE
// `assert.deepEqual` to that file's own entry in `review --json`'s `findings[]` — the two commands share
// `fileFindings`/`fileVerdictJson` end to end in this mode. The THIRD case (an unclassified-only file) is instead
// pinned as a CHARACTERIZATION of the current, intentional asymmetry: `check` discloses it, `review` stays silent
// about it end to end (not even a findings[] entry), by design — flagged in the report handed back with this
// change for the lead to weigh in on, not fixed here.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { partitionFor, skeyR } from '../engine/core.mjs';

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

// PAIRED: `*Command extends Command` + a sibling `*Handler` (never extends anything) — the exact shape/poisoning
// technique cross-check-agreement.test.mjs already established for a controlled, deterministic role deviation
// (reused rather than re-invented, per this project's own "match the established style" instruction).
const commandSrc = (name, extendsCommand = true) => `export class ${name}Command${extendsCommand ? ' extends Command' : ''} {\n  readonly id: number;\n  constructor(id: number) {\n    this.id = id;\n  }\n}\n`;
const PAIRED = ['Order', 'Payment', 'Shipment', 'Refund', 'Invoice', 'Cart', 'Customer', 'Product', 'Stock', 'Coupon'];

let tmp, repo, ROLE;
before(() => {
  ({ tmp, repo } = initRepo('grain-xcheck-checkreview-'));
  for (const e of PAIRED) wIn(repo, `src/handlers/${e}.ts`, commandSrc(e));
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  gitIn(repo, d1, 'add', '-A'); gitIn(repo, d1, 'commit', '-qm', 'base: paired command shapes');
  assert.equal(grainIn(repo, ['status']).code, 0);

  // poison one role fact certifying `auto.extends:Command` over the 10 PAIRED commands, exactly cross-check-
  // agreement.test.mjs's own FAMILY 1 shape/numbers (10 established, none deviant in the baseline)
  const model = loadModel(repo);
  const part = partitionFor(model, 'src/handlers/Order.ts');
  ROLE = part.medoids.length;
  part.medoids.push({ label: 'Command', feats: ['sup:Command'] });
  for (const e of PAIRED) part.assignments[skeyR(`src/handlers/${e}.ts`, { kind: 'type', name: `${e}Command` })] = ROLE;
  part.facts.push({ cid: `r${ROLE}:type`, kind: 'type', pid: 'auto.extends:Command', exp: 'true',
    parentExp: null, counts: { true: 10 }, srawCounts: { true: 10 }, alphabet: ['true', 'false'],
    raw: 10, sraw: 10, share: 1, bpi: 1, tau: 3, nSurfaces: 1, siblings: [],
    suppressedValue: null, denyEligible: false, exemplars: [], deviantsN: 0, deviants: [], altMarker: null });

  // Rogue.ts: written AFTER the poison so it is untracked (part of `review`'s default change set), with a STICKY
  // assignment forcing its Command scope into the poisoned role — a real, deterministic role deviation
  wIn(repo, 'src/handlers/Rogue.ts', commandSrc('Rogue', false));
  part.assignments[skeyR('src/handlers/Rogue.ts', { kind: 'type', name: 'RogueCommand' })] = ROLE;
  saveModel(repo, model);

  // NewThing.ts: untracked, structurally unrelated, no assignment entry at all — the "new to the index" case
  // (checkFile's newScopeHits: skeyR absent from part.assignments, scores.get(i) still computed live)
  wIn(repo, 'src/handlers/NewThing.ts', `export class NewThingWidget {\n  render(): string {\n    return 'ok';\n  }\n  reset(): void {}\n}\n`);

  // broken.ts: untracked, a real parse error inside a real function (r.hasError, scopesN>0 — "parse degraded",
  // not the separate "parse failed" branch) — the exact snippet disclosure-fixtures.test.mjs's §053 fixture uses
  wIn(repo, 'src/broken.ts', 'export function util99() { return 99; }\n\nexport function broken(x: <<not valid) {\n  return x\n');
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

// ===== fixture soundness: the two finding/caveat shapes this file exercises for THE PROPERTY are really present,
// plus confirmation that NewThing.ts genuinely IS the unclassified-only case the characterization test relies on =====
test('fixture soundness: Rogue deviates, broken.ts is parse-degraded, NewThing has only unclassified scopes (no deviation, no error)', () => {
  const rogue = JSON.parse(grainIn(repo, ['check', 'src/handlers/Rogue.ts', '--json']).out);
  assert.ok(rogue.deviationsInChange.length > 0, `expected Rogue to carry a real deviation: ${JSON.stringify(rogue)}`);
  const broken = JSON.parse(grainIn(repo, ['check', 'src/broken.ts', '--json']).out);
  assert.equal(broken.hasError, true, `expected src/broken.ts to be hasError: ${JSON.stringify(broken)}`);
  const newThing = grainIn(repo, ['check', 'src/handlers/NewThing.ts']).out;
  assert.match(newThing, /\d+ unclassified scope\(s\)/, `expected check's own headline to disclose unclassified scopes for NewThing.ts: ${newThing}`);
  assert.doesNotMatch(newThing, /\d+ deviation\(s\) in your change, \d+ pre-existing(?!, \d+ unclassified)/, `NewThing.ts must show 0 real deviations (only the unclassified qualifier): ${newThing}`);
});

// ===== THE PROPERTY: check <file> --json deep-equals review --json's own entry, for a file review already lists
// for an UNRELATED reason (a real deviation, or a degraded parse) — the two commands share fileFindings/
// fileVerdictJson end to end in this mode =====
for (const [label, rel] of [['a real role deviation', 'src/handlers/Rogue.ts'], ['a degraded parse', 'src/broken.ts']]) {
  test(`check <file> --json is byte-for-byte identical to review --json's entry for the same file — ${label} (${rel})`, () => {
    const c = JSON.parse(grainIn(repo, ['check', rel, '--json']).out);
    const r = JSON.parse(grainIn(repo, ['review', '--json']).out);
    const entry = r.findings.find(f => f.file === rel);
    assert.ok(entry, `review --json must carry a findings[] entry for ${rel}: findings=${JSON.stringify(r.findings.map(f => f.file))}`);
    assert.deepEqual(c, entry, `check ${rel} --json and review --json's entry for ${rel} must agree exactly:\ncheck=${JSON.stringify(c)}\nreview=${JSON.stringify(entry)}`);
  });
}

// ===== CHARACTERIZATION (not a bug pin — see header): `check` discloses NewThing.ts's unclassified scopes in both
// text and (already, pre-existing) NOT in --json; `review` discloses it in NEITHER text NOR --json, and drops the
// file from findings[] entirely — matching review-command.test.mjs's own settled "a clean file... contributes
// nothing" contract, which a brand-new, unclassified-but-otherwise-conforming file satisfies by that contract's own
// terms even though `check` itself would not call the same file fully vetted. Recorded here as a real, load-bearing
// property of TODAY's behavior (green now; a change to either side should have to touch this test on purpose). =====
test('CHARACTERIZATION: an unclassified-only file (no deviation, no error) is disclosed by `check` and completely invisible to `review`, text and --json alike', () => {
  const rel = 'src/handlers/NewThing.ts';
  const checkText = grainIn(repo, ['check', rel]).out;
  assert.match(checkText, /\d+ unclassified scope\(s\)/, `check's own headline must disclose the unclassified scopes: ${checkText}`);
  assert.match(checkText, /is new to the index/, checkText);
  const checkJson = JSON.parse(grainIn(repo, ['check', rel, '--json']).out);
  assert.ok(!('unclassifiedInChange' in checkJson), `check --json does not carry this fact at all today (a pair-1 gap noted separately, not fixed here): ${JSON.stringify(checkJson)}`);

  const reviewText = grainIn(repo, ['review']).out;
  assert.doesNotMatch(reviewText, new RegExp(rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' —'), `review's text must not mention ${rel} at all: ${reviewText}`);
  assert.doesNotMatch(reviewText, /unclassified/, `review's text carries no trace of the unclassified-scope caveat anywhere: ${reviewText}`);

  const reviewJson = JSON.parse(grainIn(repo, ['review', '--json']).out);
  assert.ok(reviewJson.files.includes(rel), `${rel} is still counted in the "files in scope" list: ${JSON.stringify(reviewJson.files)}`);
  assert.ok(!reviewJson.findings.some(f => f.file === rel), `but it has NO findings[] entry at all — dropped silently, same "no finding at all" skip §053 patched for hasError, left as-is here for this caveat: ${JSON.stringify(reviewJson.findings.map(f => f.file))}`);
});
