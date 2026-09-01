// `grain decide` — the decision surface (`seed` stays a 1:1 alias) — and its new third decision type: the WAIVER.
// A steer promotes a different value repo-wide; a waiver does the opposite and much less: one named maintainer
// excuses ONE scope from ONE convention, on the record. It is purely render-time suppression — the waived scope is
// still counted as governed and non-conforming everywhere numbers are printed, and waivers never reach mine() or
// the weights. What changes is only the VOICE: instead of "your class departs from the norm", check says
// "decision waiver (…): this class deliberately departs from it — n/N established do it the other way".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const today = new Date().toISOString().slice(0, 10);
const DEVIANT = 'src/handlers/dispute.handler.ts';   // the fixture's planted deviant: CreateDisputeHandler carries no @Handler
const PID = 'auto.deco:@Handler';

let tmp, pristine, n = 0;
before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-waive-')); pristine = join(tmp, 'pristine'); execFileSync('node', [BUILDER, pristine], { stdio: 'pipe' }); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

const newRepo = () => { const r = join(tmp, 'r' + (++n)); execFileSync('cp', ['-R', pristine, r]); return r; };
const grain = (repo, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const git = (repo, ...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, ...gitEnv } }).trim();
const seedLines = repo => (existsSync(join(repo, '.grain', 'seeds.jsonl')) ? readFileSync(join(repo, '.grain', 'seeds.jsonl'), 'utf8') : '').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
const decisions = repo => readFileSync(join(repo, '.grain', 'decisions.jsonl'), 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
const meta = repo => JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'meta.json'), 'utf8'));
// dirty the deviant's body so its own deviations count as "in your change" rather than pre-existing
const dirtyDeviant = repo => { const p = join(repo, DEVIANT); const s = readFileSync(p, 'utf8');
  const s2 = s.replace('const entity = await', 'const entity  = await'); assert.notEqual(s2, s, 'fixture handler body changed shape'); writeFileSync(p, s2); };
const waive = (repo, target = DEVIANT + '#CreateDisputeHandler', pid = PID, note = 'legacy adapter: the decorator would double-register it') =>
  grain(repo, ['decide', 'waive', target, '--on', pid, '--note', note, '--author', 'kd']);

test('(a) decide waive records a waiver; decide list shows it; decide rm withdraws it and lands in decisions.jsonl', () => {
  const repo = newRepo();
  const add = waive(repo);
  assert.equal(add.code, 0, add.err);
  const id = (add.out.match(/recorded waiver ([0-9a-f]{8})/) || [])[1];
  assert.ok(id, `expected a recorded waiver id:\n${add.out}\n${add.err}`);
  const rec = seedLines(repo).pop();
  assert.equal(rec.id, id);
  assert.deepEqual(rec.waiver, { path: DEVIANT, name: 'CreateDisputeHandler', pid: PID });
  assert.equal(rec.author, 'kd');
  assert.equal(rec.createdAt, today);
  assert.equal(rec.note, 'legacy adapter: the decorator would double-register it');

  const list = grain(repo, ['decide', 'list']);
  assert.equal(list.code, 0, list.err);
  assert.match(list.out, new RegExp(`^${id}\\s+waiver: ${DEVIANT.replace(/\./g, '\\.')}#CreateDisputeHandler on ${PID.replace(/[.@]/g, m => '\\' + m)}`, 'm'));

  const rm = grain(repo, ['decide', 'rm', id]);
  assert.equal(rm.code, 0, rm.err);
  assert.equal(seedLines(repo).filter(r => r.id === id).length, 0, 'the waiver must be gone from seeds.jsonl');
  const d = decisions(repo).filter(x => x.id === id);
  assert.deepEqual(d.map(x => x.action), ['add', 'rm']);
});

test('(b) an active waiver replaces that deviation with a decision waiver line that still carries the denominator', () => {
  const repo = newRepo();
  dirtyDeviant(repo);
  const before = JSON.parse(grain(repo, ['check', DEVIANT, '--json']).out);
  assert.ok(before.deviationsInChange.some(x => x.pid === PID), `expected the @Handler deviation before any waiver:\n${JSON.stringify(before.deviationsInChange.map(x => x.pid))}`);

  const add = waive(repo);
  assert.equal(add.code, 0, add.err);
  const id = (add.out.match(/recorded waiver ([0-9a-f]{8})/) || [])[1];
  assert.ok(id, add.out);

  const after = JSON.parse(grain(repo, ['check', DEVIANT, '--json']).out);
  assert.ok(!after.deviationsInChange.some(x => x.pid === PID), 'the waived deviation must not be reported as a deviation in the change');
  assert.ok(!after.deviationsPreExisting.some(x => x.pid === PID), 'nor as a pre-existing one — a waiver suppresses it outright');
  // regression control inside the same file: the OTHER deviations of this same scope's file are untouched
  assert.ok(after.deviationsInChange.some(x => x.pid === 'auto.call:validate'), 'a waiver is per-(scope,pid): the handler\'s other deviations must survive it');
  // the numbers still tell the truth: the scope is still governed by that convention and still not conforming
  const gov = after.governed.find(g => g.convention.endsWith('::' + PID));
  assert.ok(gov, 'the waived convention must still govern this file');
  assert.ok(gov.conforming < gov.scopes, 'a waiver suppresses the voice, never the fact: the scope still counts as non-conforming');

  const text = grain(repo, ['check', DEVIANT]).out;
  assert.match(text, new RegExp(`decision waiver \\(id ${id}, kd ${today}\\): \`CreateDisputeHandler\` \\(line \\d+\\) deliberately departs from .*@Handler.* — (\\d+)/(\\d+) established do it the other way — legacy adapter`));
  const [, conform, sraw] = text.match(/deliberately departs from .*@Handler.* — (\d+)\/(\d+) established do it the other way/);
  assert.ok(+sraw > 0 && +conform > 0, `the waiver voice must carry a real denominator, got ${conform}/${sraw}`);
  assert.ok(!/is not annotated with `@Handler`/.test(text), `the plain deviation voice must be gone:\n${text}`);
});

test('(c) a different deviant scope of the same convention, with no waiver of its own, still deviates', () => {
  const repo = newRepo();
  // a second planted deviant of the SAME convention, in its own file
  writeFileSync(join(repo, 'src', 'handlers', 'chargeback.handler.ts'),
    `import { Handler, validate, type Command } from '../core/handler';\nimport { ChargebackService } from '../services/chargeback.service';\n\nexport interface CreateChargebackCommand extends Command { readonly chargebackId: string; }\n\nexport class CreateChargebackHandler {\n  constructor(private readonly service: ChargebackService) {}\n\n  async handle(cmd: CreateChargebackCommand): Promise<void> {\n    validate(cmd);\n    const entity = await this.service.load(cmd.chargebackId);\n    await this.service.apply(entity, 'create');\n  }\n}\n`);
  writeFileSync(join(repo, 'src', 'services', 'chargeback.service.ts'),
    `import { Injectable, BaseService } from '../core/service';\n\n@Injectable()\nexport class ChargebackService extends BaseService {\n  async load(id: string): Promise<{ id: string }> {\n    this.logger.info('load chargeback ' + id);\n    return { id };\n  }\n\n  async apply(entity: { id: string }, action: string): Promise<void> {\n    this.logger.info('apply ' + action + ' to ' + entity.id);\n  }\n}\n`);
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'feat: chargeback (a second planted deviant)');

  const add = waive(repo);   // waive ONLY the dispute handler
  assert.equal(add.code, 0, add.err);
  const other = grain(repo, ['check', 'src/handlers/chargeback.handler.ts', '--all']).out;
  assert.match(other, /is not annotated with `@Handler`/, `an unwaived deviant of the same convention must still be told off:\n${other}`);
  assert.ok(!/decision waiver/.test(other), 'a waiver is scope-specific, never convention-wide');
});

test('(d) report lists the waivers in force in their own section', () => {
  const repo = newRepo();
  const add = waive(repo);
  const id = (add.out.match(/recorded waiver ([0-9a-f]{8})/) || [])[1];
  assert.ok(id, add.out);
  const rep = grain(repo, ['report']).out;
  assert.match(rep, /^== waivers — 1 waiver\(s\) in \.grain\/seeds\.jsonl ==$/m, `expected a waivers section:\n${rep}`);
  assert.match(rep, new RegExp(`decision waiver \\(id ${id}, kd ${today}\\): .*CreateDisputeHandler.*${PID.replace(/[.@]/g, m => '\\' + m)}.*legacy adapter`));
});

test('(e) decide steer records a functionally identical record to seed add (the command is an alias; its own wording is not)', () => {
  const a = newRepo(), b = newRepo();
  const args = ['src/handlers/address.handler.ts#UpdateAddressHandler', '--surfaces', PID, '--author', 'kd', '--note', 'the house style'];
  const viaSeed = grain(a, ['seed', 'add', ...args]);
  const viaDecide = grain(b, ['decide', 'steer', ...args]);
  assert.equal(viaSeed.code, 0, viaSeed.err);
  assert.equal(viaDecide.code, 0, viaDecide.err);
  assert.deepEqual(seedLines(b).pop(), seedLines(a).pop(), 'decide steer and seed add must persist the identical record');
  // and the model reads it back the same way
  assert.equal(JSON.parse(grain(b, ['export']).out).steers.length, JSON.parse(grain(a, ['export']).out).steers.length);
});

test('(f) a waiver whose (path, name) names more than one scope is refused, not silently pinned to the first', () => {
  const repo = newRepo();
  writeFileSync(join(repo, 'src', 'services', 'twin.service.ts'),
    `import { Injectable, BaseService } from '../core/service';\n\n@Injectable()\nexport class AlphaService extends BaseService {\n  async load(id: string): Promise<{ id: string }> {\n    this.logger.info('alpha ' + id);\n    return { id };\n  }\n}\n\n@Injectable()\nexport class BetaService extends BaseService {\n  async load(id: string): Promise<{ id: string }> {\n    this.logger.info('beta ' + id);\n    return { id };\n  }\n}\n`);
  git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'feat: two services, two load methods, one file');
  const r = waive(repo, 'src/services/twin.service.ts#load', 'auto.call:this.logger.info');
  assert.match(r.out + r.err, /pick one scope of src\/services\/twin\.service\.ts:/, `an ambiguous target must be refused with the established wording:\n${r.out}\n${r.err}`);
  assert.equal(seedLines(repo).length, 0, 'nothing may be written for an ambiguous target');
});

test('(g) a repository whose only decision is a waiver still re-mines when that waiver is added or withdrawn', () => {
  const repo = newRepo();
  grain(repo, ['status']);                                   // build the index with no decisions at all
  assert.equal(meta(repo).seedsHash, '', 'a decision-free repo hashes to the empty string');
  const add = waive(repo);
  const id = (add.out.match(/recorded waiver ([0-9a-f]{8})/) || [])[1];
  assert.ok(id, add.out);
  grain(repo, ['status']);
  const h = meta(repo).seedsHash;
  assert.notEqual(h, '', 'a waiver-only decision file must produce a real seeds hash, or the model never re-mines with it');
  // and the freshly re-mined model actually carries the waiver — no `refresh` needed
  assert.equal(JSON.parse(grain(repo, ['export']).out).waivers.length, 1);
  grain(repo, ['decide', 'rm', id]);
  grain(repo, ['status']);
  assert.equal(meta(repo).seedsHash, '', 'withdrawing the only waiver must re-mine back to a decision-free hash');
});

// J1.3b: `check --json` must not lose the waiver's trace — a machine consumer needs to tell "conforms" apart
// from "deliberately waived", the same way `steers` already carries a maintainer decision's trace.
test('(h) J1.3b: check --json carries a waivers array with the active waiver\'s pid/scope/inChange', () => {
  const repo = newRepo();
  dirtyDeviant(repo);
  const add = waive(repo);
  assert.equal(add.code, 0, add.err);
  const id = (add.out.match(/recorded waiver ([0-9a-f]{8})/) || [])[1];
  assert.ok(id, add.out);

  const j = JSON.parse(grain(repo, ['check', DEVIANT, '--json']).out);
  assert.ok(Array.isArray(j.waivers), `expected a waivers array in check --json output, got: ${JSON.stringify(j.waivers)}`);
  const hit = j.waivers.find(w => w.pid === PID);
  assert.ok(hit, `expected a waiver entry for ${PID}: ${JSON.stringify(j.waivers)}`);
  assert.equal(hit.waiver, id);
  assert.equal(hit.scope, 'CreateDisputeHandler');
  assert.equal(typeof hit.inChange, 'boolean');
});

test('(i) J1.3b: check --json on a file with no active waiver reports an empty waivers array, not absent or null', () => {
  const repo = newRepo();
  const j = JSON.parse(grain(repo, ['check', DEVIANT, '--json']).out);
  assert.deepEqual(j.waivers, []);
});
