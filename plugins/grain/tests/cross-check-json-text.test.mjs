// Cross-check: text and `--json` renderings of the SAME command must not disagree about the same facts. Text may
// say MORE (prose, hedges) and JSON may carry more structure, but a fact present in both must match, and a
// load-bearing fact in one must not be silently missing from the other. This file implements that invariant, per
// command, over ONE shared fixture repository (built below) whose file/symbol names all carry a `zq` prefix so a
// fact can be extracted from prose by grepping for a distinctive token rather than parsing English.
//
// GENERIC CHECK (every --json command, looped): `--json`'s stdout must parse as ONE JSON document with no stray
// non-JSON text before or after it (the exact class of bug where-json-member-line.test.mjs fixed for `where`:
// cmdWhere's JSON branch used to emit the JSON string as one array element alongside a second, non-JSON line), and
// its exit code must equal the text run's exit code. This loop is the generalization of that fix — proven useful
// below: `grain selftest --json` (and `selftest --how --json`) fail it. `grain.mjs`'s selftest branch builds
// `lines = [JSON.stringify(res, null, 1), stamp()]` — TWO array elements — so stdout is the JSON blob followed by
// a trailing "as of <sha>" line, which is not valid trailing JSON content. This is not a secret gap: `tests/
// selftest.test.mjs` test (c) already knows about it and works around it (`.out.replace(/\nas of .*$/, '')` before
// `JSON.parse`) rather than the CLI contract being fixed. Reported as a new finding below (not ticket 009's).
//
// `how`'s three facts (§009's own ticket) — the set of commit shas named in text vs `matches[]`, the `places[]`
// order vs the text order, and (RED while 009 is open) every match carrying a numeric `score` — are checked
// directly against a real `how` match set: three commits named "add zqbilling pending/shipped/cancelled", each
// touching the identical four files, mirroring `tests/how-command.test.mjs`'s own "add status …" fixture pattern
// but under the `zq` prefix so the query token (`zqbilling`) can never collide with prose. `places[].weight` is
// deliberately NOT asserted (009 leaves that decision open) — this file's header records, instead, exactly which
// keys `places[]` carries today (see the report handed back with this change).
//
// `check` (the fully-governed happy path — the one shape `tests/check-json-contract.test.mjs` does NOT cover: that
// file is entirely about the no-grammar / no-partition / parse-failed / empty-file EDGE cases, G7/G8's own subject.
// It never once checks a normal, fully-parseable, fully-governed file's headline counts or "conforms to:" list
// against `--json`). That gap is this file's `check` test: the scope/governed/deviation COUNTS in the text
// headline against `--json`'s `scopes`/`governed.length`/`deviationsInChange.length`/`deviationsPreExisting.
// length`, and every `governed[].statement` appearing in the text's "conforms to:" line.
//
// MCP `grain_how` ≡ `how --json` is already asserted by `tests/how-command.test.mjs` test (c)
// (`assert.deepEqual(JSON.parse(mcp), j, ...)`) — not duplicated here, per 009's own instruction to extend rather
// than re-write it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const wIn = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grainIn = (repo, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const initRepo = name => { const tmp = mkdtempSync(join(tmpdir(), name)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, {}, 'init', '-q', '-b', 'main'); gitIn(repo, {}, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };

let tmp, repo;

// ----- fixture: a small TS "handler → service" repo (module-graph edges for `map`, a marker+group for `where`,
// declarations+values for `what`) plus a separate, history-only "zqbilling" area (4 files, 3 commits) for `how`'s
// match-by-example — same structural idea as tests/how-command.test.mjs's "add status …" fixture, `zq`-prefixed.
const cap = s => s[0].toUpperCase() + s.slice(1);
const NOUNS = ['zqorder', 'zqcart', 'zqinvoice', 'zqpayment', 'zqshipment', 'zqcustomer', 'zqproduct', 'zqstock', 'zqcoupon', 'zqreview'];
const handlerSrc = n => `import { ZqHandler, zqValidate } from '../zqcore/zqhandler';\nimport { ${cap(n)}Service } from '../zqservices/${n}.service';\n\n@ZqHandler()\nexport class ${cap(n)}Handler {\n  constructor(private readonly service: ${cap(n)}Service) {}\n\n  async handle(cmd: { id: string }): Promise<void> {\n    zqValidate(cmd);\n    const entity = await this.service.load(cmd.id);\n    await this.service.apply(entity);\n  }\n}\n`;
const serviceSrc = n => `import { ZqInjectable, ZqBaseService } from '../zqcore/zqservice';\n\n@ZqInjectable()\nexport class ${cap(n)}Service extends ZqBaseService {\n  async load(id: string): Promise<{ id: string }> {\n    return { id };\n  }\n\n  async apply(entity: { id: string }): Promise<void> {\n    this.logger.info('apply ' + entity.id);\n  }\n}\n`;

const STATUS_FILES = ['src/zqenums/zqbilling-status.enum.ts', 'src/zqdto/zqbilling.dto.ts', 'tests/fixtures/zqbilling.fixture.ts', 'tests/zqbilling.test.ts'];
function writeStatusSet(names) { // `names` grows by one on every "add zqbilling" commit, a real structural change each time — mirrors how-command.test.mjs's writeStatusSet
  wIn(repo, STATUS_FILES[0], `export class ZqBillingStatus {\n${names.map(nm => `  static ${nm}(): string { return '${nm}'; }`).join('\n')}\n}\n`);
  wIn(repo, STATUS_FILES[1], `export class ZqBillingDto {\n  id = '';\n${names.map(nm => `  is${nm}(): boolean { return this.id.startsWith('${nm}'); }`).join('\n')}\n}\n`);
  wIn(repo, STATUS_FILES[2], `${names.map(nm => `export function makeZq${nm}Billing(): { id: string } { return { id: '${nm}' }; }`).join('\n')}\n`);
  wIn(repo, STATUS_FILES[3], `${names.map(nm => `export function checkZq${nm}(): boolean { return makeZq${nm}Billing().id === '${nm}'; }`).join('\n')}\n`); }

let day = 0; const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
function commit(msg, daysLater = 4) { day += daysLater; const iso = new Date(T0 + day * 86400000).toISOString();
  gitIn(repo, {}, 'add', '-A'); gitIn(repo, dateEnv(iso), 'commit', '-qm', msg); }

before(() => {
  ({ tmp, repo } = initRepo('grain-crosscheck-jsontext-'));
  wIn(repo, 'package.json', JSON.stringify({ name: 'zq-fixture', version: '1.0.0', private: true, type: 'module' }, null, 2) + '\n');
  wIn(repo, 'src/zqcore/zqhandler.ts', `export function ZqHandler(): ClassDecorator { return () => {}; }\nexport function zqValidate(cmd: unknown): void { if (!cmd) throw new Error('invalid zq command'); }\nexport interface ZqCommand { readonly kind: string; }\n`);
  wIn(repo, 'src/zqcore/zqservice.ts', `export function ZqInjectable(): ClassDecorator { return () => {}; }\nexport class ZqBaseService { protected logger = { info(_m: string) {} }; }\n`);
  commit('zqcore: scaffolding', 0);

  const waves = [NOUNS.slice(0, 4), NOUNS.slice(4, 7), NOUNS.slice(7, 10)];
  waves.forEach((wave, wi) => {
    for (const n of wave) { wIn(repo, `src/zqservices/${n}.service.ts`, serviceSrc(n)); wIn(repo, `src/zqhandlers/${n}.handler.ts`, handlerSrc(n)); }
    commit(`feat: ${wave.join(', ')} zq handlers (wave ${wi + 1})`, 20); });

  writeStatusSet(['Pending']); commit('add zqbilling pending', 4);
  wIn(repo, 'src/zqcore/zqlint.ts', `export const zqlint = { strict: true };\n`); commit('bump zq lint config', 3); // noise: neither query token
  writeStatusSet(['Pending', 'Shipped']); commit('add zqbilling shipped', 4);
  wIn(repo, 'src/zqservices/zqlogger.ts', `export class ZqLogger { level = 'info'; }\n`); commit('tidy zq logger module', 3); // noise
  writeStatusSet(['Pending', 'Shipped', 'Cancelled']); commit('add zqbilling cancelled', 4);

  // one real maintainer decision, via the CLI (not model surgery), so `map`'s "decisions:" headline is non-zero —
  // exercises the same numeric fact a bare 0 could never distinguish from "the two renderers agree by vacuity"
  let r = grainIn(repo, ['decide', 'steer', 'src/zqhandlers/zqcart.handler.ts#ZqcartHandler', '--surfaces', 'auto.deco:@ZqHandler', '--author', 'zqauthor', '--note', 'zq steer decision']);
  assert.equal(r.code, 0, `fixture setup: grain decide steer failed: ${r.out}\n${r.err}`);
  r = grainIn(repo, ['status']); // force one full remine now (seeds.jsonl changed) so every test below hits an already-fresh cache
  assert.equal(r.code, 0, `fixture setup: warm-up grain status failed: ${r.out}\n${r.err}`);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

// ===== GENERIC: every --json command's stdout is ONE parseable JSON document, and exit codes agree with text =====
const JSON_COMMANDS = [
  ['where', ['where', 'ZqHandler']],
  ['how', ['how', 'zqbilling']],
  ['what', ['what', 'cancelled']],
  ['map', ['map']],
  ['check', ['check', 'src/zqhandlers/zqcart.handler.ts']],
  ['status', ['status']],
  ['report', ['report']],
  ['selftest', ['selftest']],
  // `review` had never joined this loop even though cmdReview's --json branch is exactly as old as check's own —
  // an audit gap this file's own header calls out fixing (§051/instr-cross-check task), not a known bug: this is
  // a NEW addition to coverage, not a red-before-fix case.
  ['review', ['review']],
];
for (const [name, args] of JSON_COMMANDS) {
  test(`generic: \`grain ${name}\` --json stdout is one parseable JSON document with no stray text, and exit codes match text [${name}]`, () => {
    const t = grainIn(repo, args);
    const j = grainIn(repo, [...args, '--json']);
    assert.equal(t.code, j.code, `text exit ${t.code} vs --json exit ${j.code}\ntext:\n${t.out}\n${t.err}\njson:\n${j.out}\n${j.err}`);
    let parsed; assert.doesNotThrow(() => { parsed = JSON.parse(j.out); }, `--json stdout is not a single clean JSON document (a stray line leaked before or after it): ${JSON.stringify(j.out)}`);
    assert.ok(parsed && typeof parsed === 'object', `parsed --json output must be an object: ${j.out}`);
  });
}

// ===== `how` (§009) =====
test('how: the set of commit shas named in text (example lines, in order) equals JSON matches[] (same order)', () => {
  const { out, code, err } = grainIn(repo, ['how', 'zqbilling']);
  assert.equal(code, 0, `${out}\n${err}`);
  const textShas = [...out.matchAll(/^example \(([0-9a-f]{7}) /gm)].map(m => m[1]);
  assert.equal(textShas.length, 3, `expected 3 example lines: ${out}`);
  const j = JSON.parse(grainIn(repo, ['how', 'zqbilling', '--json']).out);
  assert.equal(j.matches.length, 3, `expected 3 JSON matches: ${JSON.stringify(j.matches)}`);
  assert.deepEqual(textShas, j.matches.map(m => m.sha.slice(0, 7)), `text example order ${JSON.stringify(textShas)} vs JSON matches order ${JSON.stringify(j.matches.map(m => m.sha.slice(0, 7)))}`);
});

test('how: places list order in text equals JSON places[] order', () => {
  const { out, code, err } = grainIn(repo, ['how', 'zqbilling']);
  assert.equal(code, 0, `${out}\n${err}`);
  const lines = out.split('\n');
  const idx = lines.indexOf('places such a change touched:');
  assert.ok(idx >= 0, `expected a places header: ${out}`);
  const relOrder = [];
  for (let i = idx + 1; i < lines.length; i++) { const m = /^\s{2}(\S+) \(/.exec(lines[i]); if (!m) break; relOrder.push(m[1]); }
  assert.equal(relOrder.length, 4, `expected 4 places: ${out}`);
  const j = JSON.parse(grainIn(repo, ['how', 'zqbilling', '--json']).out);
  assert.deepEqual(relOrder, j.places.map(p => p.rel), `text places order ${JSON.stringify(relOrder)} vs JSON places order ${JSON.stringify(j.places.map(p => p.rel))}`);
});

test('how: every JSON match carries a numeric score (009 acceptance — expected RED while 009 is open)', () => {
  const j = JSON.parse(grainIn(repo, ['how', 'zqbilling', '--json']).out);
  assert.ok(j.matches.length > 0, `fixture sanity: expected at least one match: ${JSON.stringify(j)}`);
  for (const m of j.matches) assert.equal(typeof m.score, 'number', `expected match.score to be a number (howCmd computes it internally, cmdHow's --json branch drops it — 009), got: ${JSON.stringify(m)}`);
});

// ===== `where` =====
test('where: top hits named in text, in order, match JSON hits[] labels, in order', () => {
  const { out, code, err } = grainIn(repo, ['where', 'ZqHandler']);
  assert.equal(code, 0, `${out}\n${err}`);
  const textHits = [...out.matchAll(/→ (?:file|marker|group|directory) (\S+)/g)].map(m => m[1]);
  assert.ok(textHits.length >= 2, `expected multiple hits: ${out}`);
  const j = JSON.parse(grainIn(repo, ['where', 'ZqHandler', '--json']).out);
  assert.deepEqual(textHits, j.hits.map(h => h.label), `text hit order ${JSON.stringify(textHits)} vs JSON hits order ${JSON.stringify(j.hits.map(h => h.label))}`);
});

// ===== `what` =====
test('what: every repo-relative path named in text appears in JSON, and every path in JSON appears in text', () => {
  const { out, code, err } = grainIn(repo, ['what', 'cancelled']);
  assert.equal(code, 0, `${out}\n${err}`);
  const j = JSON.parse(grainIn(repo, ['what', 'cancelled', '--json']).out);
  assert.ok(j.defined.length > 0, `fixture sanity: expected declarations: ${JSON.stringify(j)}`);
  const pathRe = /\b(?:src|tests)\/[\w./-]+\.\w+/g;
  const textPaths = new Set([...out.matchAll(pathRe)].map(m => m[0]));
  const jsonPaths = new Set([...j.defined.map(d => d.rel), ...j.values.flatMap(v => v.places.map(p => p[0]))]);
  assert.ok(textPaths.size > 0 && jsonPaths.size > 0, `fixture sanity: expected non-empty path sets — text ${[...textPaths]}, json ${[...jsonPaths]}`);
  for (const p of textPaths) assert.ok(jsonPaths.has(p), `text names path ${p}, missing from JSON's defined[]/values[].places: ${JSON.stringify(j)}`);
  for (const p of jsonPaths) assert.ok(textPaths.has(p), `JSON names path ${p}, missing from the text answer: ${out}`);
});

// ===== `map` =====
test('map: the "decisions:" headline and every fully-listed layer\'s module set equal JSON', () => {
  const { out, code, err } = grainIn(repo, ['map']);
  assert.equal(code, 0, `${out}\n${err}`);
  const j = JSON.parse(grainIn(repo, ['map', '--json']).out);
  const dm = /decisions: (\d+) maintainer decision\(s\) in force/.exec(out);
  assert.ok(dm, out);
  assert.equal(+dm[1], j.decisions, `text says ${dm[1]} decisions, JSON says ${j.decisions}`);
  assert.equal(j.decisions, 1, 'fixture sanity: exactly one steer was recorded');

  const layerLine = out.split('\n').find(l => l.startsWith('map: layers:'));
  assert.ok(layerLine, out);
  const byLayer = new Map(); for (const n of j.nodes) (byLayer.get(n.layer) || byLayer.set(n.layer, []).get(n.layer)).push(n.id);
  const segs = [...layerLine.matchAll(/layer (\d+)(?: \(leaves\))?: ([^·]+?)(?= · |$)/g)];
  assert.ok(segs.length >= 2, `expected multiple layer segments: ${layerLine}`);
  let checkedAtLeastOneFull = false;
  for (const seg of segs) {
    const layerN = +seg[1], modsStr = seg[2];
    if (modsStr.includes('more')) continue; // truncated by mapSections' own 4-module cap — text saying less than the full set is not a disagreement, it says so
    const textMods = modsStr.trim().split(/,\s*/).map(m => m.replace(/\/$/, '')).sort();
    const jsonMods = (byLayer.get(layerN) || []).slice().sort();
    assert.deepEqual(textMods, jsonMods, `layer ${layerN}: text lists ${JSON.stringify(textMods)}, JSON nodes are ${JSON.stringify(jsonMods)}`);
    checkedAtLeastOneFull = true;
  }
  assert.ok(checkedAtLeastOneFull, `fixture sanity: expected at least one untruncated layer segment to check fully: ${layerLine}`);
});

// ===== `check` (the happy-path gap check-json-contract.test.mjs leaves open) =====
test('check: a normal, fully-governed file\'s headline counts and "conforms to:" statements agree with --json', () => {
  const rel = 'src/zqhandlers/zqcart.handler.ts';
  const { out, code, err } = grainIn(repo, ['check', rel]);
  assert.equal(code, 0, `${out}\n${err}`);
  const j = JSON.parse(grainIn(repo, ['check', rel, '--json']).out);
  const m = /(\d+) scopes \+ file · governed by (\d+) convention\(s\) · (\d+) deviation\(s\) in your change, (\d+) pre-existing/.exec(out);
  assert.ok(m, out);
  assert.equal(+m[1], j.scopes, `text scopes ${m[1]} vs JSON scopes ${j.scopes}`);
  assert.equal(+m[2], j.governed.length, `text governed-by ${m[2]} vs JSON governed.length ${j.governed.length}`);
  assert.equal(+m[3], j.deviationsInChange.length, `text in-change deviations ${m[3]} vs JSON deviationsInChange.length ${j.deviationsInChange.length}`);
  assert.equal(+m[4], j.deviationsPreExisting.length, `text pre-existing deviations ${m[4]} vs JSON deviationsPreExisting.length ${j.deviationsPreExisting.length}`);
  assert.ok(j.governed.length > 0, `fixture sanity: expected at least one governing convention: ${JSON.stringify(j)}`);
  const conformsLine = out.split('\n').find(l => l.startsWith('conforms to:'));
  assert.ok(conformsLine, `expected a "conforms to:" line on a fully-conforming fixture file: ${out}`);
  for (const g of j.governed) assert.ok(conformsLine.includes(g.statement), `JSON governed statement missing from text's "conforms to:" line: "${g.statement}" not in "${conformsLine}"`);
});

// ===== `status` =====
test('status: partition/group/convention/file counts in the headline equal --json', () => {
  const { out, code, err } = grainIn(repo, ['status']);
  assert.equal(code, 0, `${out}\n${err}`);
  const j = JSON.parse(grainIn(repo, ['status', '--json']).out);
  const m = /^model: .+? · (\d+) partition\(s\) · (\d+) groups · (\d+) conventions · (\d+) files/m.exec(out);
  assert.ok(m, out);
  assert.equal(+m[1], j.partitions.length, `text partitions ${m[1]} vs JSON ${j.partitions.length}`);
  assert.equal(+m[2], j.partitions.reduce((a, p) => a + p.groups, 0), `text groups ${m[2]} vs JSON sum ${j.partitions.reduce((a, p) => a + p.groups, 0)}`);
  assert.equal(+m[3], j.partitions.reduce((a, p) => a + p.conventions, 0), `text conventions ${m[3]} vs JSON sum ${j.partitions.reduce((a, p) => a + p.conventions, 0)}`);
  assert.equal(+m[4], j.files, `text files ${m[4]} vs JSON files ${j.files}`);
});

// ===== `report` =====
test('report: the partition header\'s convention count equals JSON\'s total (spot-checked against --top so the two cannot trivially agree by both being unsliced)', () => {
  const { out, code, err } = grainIn(repo, ['report', '--top', '5']);
  assert.equal(code, 0, `${out}\n${err}`);
  const j = JSON.parse(grainIn(repo, ['report', '--top', '5', '--json']).out);
  const m = /^== .+? — (\d+) conventions · \d+ groups · \d+ scopes · \d+ files ==/m.exec(out);
  assert.ok(m, out);
  assert.equal(+m[1], j.partitions[0].total, `text header count ${m[1]} vs JSON total ${j.partitions[0].total}`);
  assert.ok(j.partitions[0].conventions.length <= 5, `--top 5 must actually slice the JSON list too: got ${j.partitions[0].conventions.length}`);
  assert.ok(+m[1] > j.partitions[0].conventions.length, `fixture sanity: header total (${m[1]}) must exceed the sliced --top 5 list (${j.partitions[0].conventions.length}) or this spot-check proves nothing`);
});

// ===== `review` — its own dedicated field check, the same gap this file's `check` test closed but for `review`'s
// aggregate headline (review had never joined even the GENERIC loop above until this pass) =====
test('review: the headline\'s file count and "across N file(s)" count equal JSON files.length and findings.length', () => {
  const { out, code, err } = grainIn(repo, ['review']);
  assert.equal(code, 0, `${out}\n${err}`);
  const j = JSON.parse(grainIn(repo, ['review', '--json']).out);
  const m = /^review (\d+) files? · \d+ finding\(s\) across (\d+) file\(s\)$/m.exec(out);
  assert.ok(m, out);
  assert.equal(+m[1], j.files.length, `text file count ${m[1]} vs JSON files.length ${j.files.length}`);
  assert.equal(+m[2], j.findings.length, `text "across N file(s)" count ${m[2]} vs JSON findings.length ${j.findings.length}`);
});

// ===== `map` (§051 — text renders `concepts:`/`changes:`, --json used to omit both entirely) =====
// A self-contained fixture (not the shared `repo` above, which has no repeated commit shapes to certify a change
// archetype): reuses change-archetypes.test.mjs's own proven "8 handler-adds interleaved with 8 status-adds"
// shape (guaranteed to certify exactly 2 archetypes — see that file's own bit-budget comment) plus one more
// commit/file pair sharing a token between the commit message and a code identifier (concepts-and-changes-map.
// test.mjs's own minimal J4.3b trigger), so ONE fixture produces non-empty `model.concepts` AND
// `model.changeArchetypes` together — both text-rendered lines this ticket (§051) found missing from `--json`.
test('map: `concepts:`/`changes:` text lines have a --json twin carrying the same data (§051 — json used to omit both)', () => {
  const { tmp: tmp2, repo: repo2 } = initRepo('grain-xcheck-mapjson-');
  try {
    const HANDLERS = ['create', 'cancel', 'ship', 'refund', 'archive', 'restore', 'split', 'merge'];
    const STATUSES = ['Pending', 'Approved', 'Rejected', 'Escrowed', 'Settled', 'Voided', 'Frozen', 'Lapsed'];
    const writeHandler = n => {
      wIn(repo2, `src/zqhandlers/${n}.handler.ts`, `export class Zq${cap(n)}Handler {\n  handle(input: string): string { return input + '${n}'; }\n  name(): string { return '${n}'; }\n}\n`);
      wIn(repo2, `src/zqdto/${n}.dto.ts`, `export class Zq${cap(n)}Dto {\n  payload = '';\n  valid(): boolean { return this.payload.length > 0; }\n  render(): string { return this.payload; }\n}\n`);
      wIn(repo2, `tests/zq${n}.test.ts`, `export function test${cap(n)}(): boolean { return true; }\nexport function bench${cap(n)}(): number { return 1; }\n`);
    };
    const writeStatuses = names => {
      wIn(repo2, 'src/zqenums/order-status.enum.ts', `export class ZqOrderStatus {\n${names.map(x => `  static ${x}(): string { return '${x}'; }`).join('\n')}\n}\n`);
      wIn(repo2, 'src/zqdto2/order.dto.ts', `export class ZqOrderDto {\n  id = '';\n  known(): boolean { return [${names.map(x => `'${x}'`).join(', ')}].includes(this.id); }\n}\n`);
    };
    let day2 = 0;
    const T02 = Date.UTC(2026, 1, 1, 12, 0, 0);
    const commit2 = msg => { day2 += 2; const iso = new Date(T02 + day2 * 86400000).toISOString();
      gitIn(repo2, {}, 'add', '-A'); gitIn(repo2, dateEnv(iso), 'commit', '-qm', msg); };
    wIn(repo2, 'package.json', JSON.stringify({ name: 'zq2', version: '1.0.0', private: true, type: 'module' }, null, 2) + '\n');
    writeStatuses(['Draft']);
    commit2('zq2 scaffold');
    const grown = ['Draft'];
    for (let i = 0; i < HANDLERS.length; i++) {
      writeHandler(HANDLERS[i]); commit2(`add zqhandler ${HANDLERS[i]}`);
      grown.push(STATUSES[i]); writeStatuses(grown); commit2(`add zqstatus ${STATUSES[i].toLowerCase()}`);
    }
    wIn(repo2, 'src/zqwidget/panel.widget.ts', 'export const renderZqwidgetPanel = () => 1;\n'); // concepts trigger: "zqwidget" shared between this commit message and a code identifier
    commit2('add zqwidget panel summary');
    assert.equal(grainIn(repo2, ['status']).code, 0);
    const m = JSON.parse(readFileSync(join(repo2, '.grain', 'cache', 'model.json'), 'utf8'));
    assert.ok(m.concepts && m.concepts.length, `fixture sanity: expected non-empty model.concepts: ${JSON.stringify(m.concepts)}`);
    assert.ok(m.changeArchetypes && m.changeArchetypes.length, `fixture sanity: expected non-empty model.changeArchetypes: ${JSON.stringify(m.changeArchetypes)}`);

    const t = grainIn(repo2, ['map']);
    assert.equal(t.code, 0, `${t.out}\n${t.err}`);
    const conceptsLine = t.out.split('\n').find(l => l.startsWith('map: concepts: '));
    assert.ok(conceptsLine, `expected a concepts: line: ${t.out}`);
    const changesLine = t.out.split('\n').find(l => l.startsWith('changes: '));
    assert.ok(changesLine, `expected a changes: line: ${t.out}`);

    const j = JSON.parse(grainIn(repo2, ['map', '--json']).out);
    assert.deepEqual(j.concepts, m.concepts, `map --json's concepts must carry model.concepts verbatim: text said "${conceptsLine}", json.concepts=${JSON.stringify(j.concepts)}`);
    assert.ok(Array.isArray(j.changes) && j.changes.length === m.changeArchetypes.length,
      `map --json's changes must carry every model.changeArchetypes entry (text is capped to 4, json must not be): got ${j.changes.length}, model has ${m.changeArchetypes.length}: ${JSON.stringify(j.changes)}`);
    for (const a of m.changeArchetypes)
      assert.ok(changesLine.includes(`"${a.label}" — ${a.n} change`), `text changes: line missing archetype "${a.label}" (n=${a.n}): ${changesLine}`);
    for (const a of m.changeArchetypes) {
      const jc = j.changes.find(c => c.id === a.id);
      assert.ok(jc, `json.changes missing archetype id ${a.id}: ${JSON.stringify(j.changes)}`);
      assert.equal(jc.label, a.label); assert.equal(jc.n, a.n);
    }
  } finally {
    rmSync(tmp2, { recursive: true, force: true });
  }
});
