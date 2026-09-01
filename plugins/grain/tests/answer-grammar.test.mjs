// J0.3: pointer precision (a scope's own range printed as `file:from–to` wherever an exemplar's endLine differs from
// its line, plain `file:line` otherwise), the `in: <module> · used by <k> modules` locator line on every `where`
// card and as `check`'s first line, and the "(skip line N — its own deviation: ...)" note when an exemplar shown
// as conforming to one fact is independently a deviant of some OTHER fact in the same partition.
//
// (a)/(b)/(e) mutate a real, freshly-mined model.json in place (same pattern as cross-file-exemplar.test.mjs's
// poisoning tests) rather than trying to coax exact line numbers and cross-fact deviations out of mine()'s own
// heuristics — the object under test is the RENDERING of exemplars/deviants, not mine()'s acceptance gates. The
// synthetic second fact used for (e) carries a cid no card's fact-filter recognizes (not `d[...]`, `_all...` or
// `r<n>:...`), so it never renders as a bullet of its own — only `skipLineNote`'s partition-wide deviant scan
// (which reads `part.facts` directly, not through a card) ever sees it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { whereCmd, rulesMarkdown } from '../engine/core.mjs';
import { cmdCheck } from '../engine/grain.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');
let tmp, repo;
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-answer-grammar-'));
  repo = join(tmp, 'fixture');
  execFileSync('node', [BUILDER, repo], { stdio: 'pipe' });
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' });
  assert.equal(st.status, 0, st.stdout + st.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

const loadModel = () => JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));
// the established "types here are annotated with `@Handler`" fact, wherever its partition landed it (MDL cuts may
// make src/handlers its own partition, or fold it partition-wide — either way this is the one `pattern to copy:`
// on the directory card already prints, per the pre-existing "where: intent → directory card" test)
const handlerFact = model => { for (const p of model.partitions) { const f = p.facts.find(x => x.pid === 'auto.deco:@Handler' && x.exp === 'true'); if (f) return { part: p, f }; } throw new Error('no @Handler fact in this model'); };
// isolate the fact under test on its card: strip every other fact from the partition (medoids/assignments/
// fileScopes/moduleGraph are untouched — only which facts a card can print is affected) so `pattern to copy:`'s
// exemplar list is deterministically just this fact's own, never padded or displaced by an unrelated fact's
// exemplars racing it for one of the 3 slots
const isolate = (part, f) => { part.facts = [f]; };

test('(a) a multi-line exemplar prints file:from–to in "pattern to copy:"', () => {
  const model = loadModel();
  const { part, f } = handlerFact(model);
  isolate(part, f);
  f.exemplars = [{ rel: 'src/handlers/order.handler.ts', line: 10, endLine: 17, name: 'OrderHandler' }];
  const { lines } = whereCmd({ model, query: 'handler' });
  const line = lines.find(l => l.startsWith('  pattern to copy:'));
  assert.ok(line, `expected a "pattern to copy:" line: ${lines.join('\n')}`);
  assert.match(line, /order\.handler\.ts:10–17 `OrderHandler`/, line); // RED today: bare `:10`, no range
});

test('(b) a single-line exemplar still prints plain file:line — no redundant range', () => {
  const model = loadModel();
  const { part, f } = handlerFact(model);
  isolate(part, f);
  f.exemplars = [{ rel: 'src/handlers/order.handler.ts', line: 10, name: 'OrderHandler' }]; // no endLine at all
  const { lines } = whereCmd({ model, query: 'handler' });
  const line = lines.find(l => l.startsWith('  pattern to copy:'));
  assert.match(line, /order\.handler\.ts:10 `OrderHandler`/, line);
  assert.doesNotMatch(line, /order\.handler\.ts:10–/, line);
});

test('(c) a where card and check both start with an "in:" locator line when a module resolves', () => {
  const { out } = grain(['where', 'handler']);
  const outLines = out.split('\n');
  const idx = outLines.findIndex(l => l.includes('» → '));
  assert.ok(idx > 0, `expected a map-voice card header: ${out}`);
  assert.match(outLines[idx - 1], /^in: \S.* · used by \d+ modules$/, `expected the in: line right before the card header: ${out}`); // RED today: no such line
  const chk = grain(['check', 'src/handlers/order.handler.ts']).out;
  assert.match(chk.split('\n')[0], /^in: \S.* · used by \d+ modules$/, `expected check's first line to be an in: locator: ${chk}`);
});

// §067c: file vs directory ambiguity (question-catalog §4.1c) — an agent had grain's correct FILE answer on
// screen and treated it as a directory reference, writing a new sibling file instead of editing the one grain
// named. The `in:` line prints first, one line above a file card's own unambiguous `→ file <path>` header, and
// used to print the containing directory bare (no marker at all) — exactly the kind of un-tagged path that
// reads as "the answer" on its own. It now carries the SAME trailing `/` grain's own `lives in:`/`depends on:`/
// `used by:` lines and every directory CARD's own label already use, so a directory locator can never be
// mistaken for the specific file named immediately below it.
test("(c') the \"in:\" locator's module carries a trailing / — the same directory marker grain's other directory references use — never mistakable for the file hit printed right below it", () => {
  const { out } = grain(['where', 'handler']);
  const outLines = out.split('\n');
  const idx = outLines.findIndex(l => l.includes('» → '));
  assert.ok(idx > 0, `expected a map-voice card header: ${out}`);
  const inLine = outLines[idx - 1];
  assert.match(inLine, /^in: \S+\/(?: |\()/, `the in: locator's module must end in / before its next token: ${inLine}`);
  const fileLine = outLines[idx];
  if (fileLine.includes('→ file ')) {
    const dirPart = inLine.match(/^in: (\S+)\//)[1];
    assert.ok(!fileLine.includes(`file ${dirPart} `), `a file hit must never render as if its containing directory alone were the target: ${fileLine}`);
  }
});

test('(d) no "in:" line at all when the model holds no module graph', async () => {
  const model = loadModel();
  delete model.moduleGraph;
  const { lines } = whereCmd({ model, query: 'handler' });
  assert.ok(!lines.some(l => l.startsWith('in: ')), `expected no in: line anywhere: ${lines.join('\n')}`);
  const chkLines = await cmdCheck({ model, root: repo, isGit: true, args: ['src/handlers/order.handler.ts'], opts: {}, stamp: dirty => `as of test${dirty ? '+dirty' : ''}` });
  assert.ok(!chkLines.some(l => l.startsWith('in: ')), `expected check to omit the in: line too: ${chkLines.join('\n')}`);
});

test('(e) an exemplar with its own unrelated deviation carries the skip-line note; a clean one does not', () => {
  const model = loadModel();
  const { part, f } = handlerFact(model);
  isolate(part, f);
  f.exemplars = [
    { rel: 'src/handlers/order.handler.ts', line: 10, endLine: 17, name: 'OrderHandler' },
    { rel: 'src/handlers/pay.handler.ts', line: 5, endLine: 12, name: 'PayHandler' },
  ];
  // a synthetic OTHER fact (different pid, same kind) whose sole deviant IS OrderHandler — a cid no card's own
  // fact-filter recognizes, so it never prints as a bullet of its own; only skipLineNote's partition-wide scan sees it
  part.facts.push({ cid: 'zzz-synthetic:type', kind: 'type', pid: 'auto.extends:Base', exp: 'true',
    deviants: [{ rel: 'src/handlers/order.handler.ts', name: 'OrderHandler', line: 10, endLine: 17, obs: 'false' }] });
  const { lines } = whereCmd({ model, query: 'handler' });
  const line = lines.find(l => l.startsWith('  pattern to copy:'));
  assert.ok(line, `expected a "pattern to copy:" line: ${lines.join('\n')}`);
  assert.match(line, /order\.handler\.ts:10–17 `OrderHandler` \(skip line 10 — its own deviation: does not extend `Base`\)/, line); // RED today: no such suffix ever prints
  assert.doesNotMatch(line, /pay\.handler\.ts:5–12 `PayHandler` \(skip line/, line); // regression control: no false positive on the clean exemplar
});

test('(g) export: group members and marker carriers carry endLine alongside line (additive)', () => {
  const { out } = grain(['export', '--compact', '--no-anchors']);
  const d = JSON.parse((out || '').split('\n').find(l => l.startsWith('{')));
  const part = d.partitions.find(p => p.kind === 'source');
  const groupMember = part.groups.flatMap(g => g.members).find(m => m.line != null);
  assert.ok(groupMember && 'endLine' in groupMember, `expected group members to carry endLine: ${JSON.stringify(groupMember)}`);
  const carrier = part.markers.flatMap(m => m.carriers).find(c => c.line != null);
  assert.ok(carrier && 'endLine' in carrier, `expected marker carriers to carry endLine: ${JSON.stringify(carrier)}`);
});

// J0.3 follow-up (found during impl-J0-3's own verification, orchestrator-fixed one-liner, same shape as the
// `report()` "template (unclustered ...)" line J0.3 already fixed): `rulesMarkdown()`'s OWN separate "### Templates
// (unclustered residue)" section has the identical bare-`file:line` bug — a different render site, same
// `t.exemplars[0]` data (which already carries `endLine` since J0.3's Part 1 plumbing), just never routed through `ptr()`.
test('(h) rulesMarkdown()\'s own "Templates (unclustered residue)" section prints file:from–to too', () => {
  const template = { kind: 'method', n: 4, coverage: 0.8, skel: 'return $EXPR;', perInstance: [], slots: [],
    held: null, exemplars: [{ rel: 'src/x.ts', line: 10, endLine: 17, name: 'run' }] };
  const model = { repo: 'fixture', partitions: [{ name: '_root', scopes: 4, medoids: [], files: ['src/x.ts'], facts: [], templates: [template] }], cochange: [], agentShare: null };
  const text = rulesMarkdown(model, { top: 15 }).join('\n');
  assert.match(text, /— e\.g\. `src\/x\.ts:10–17`/, `expected a range pointer, got:\n${text}`); // RED today: `src/x.ts:10` only
});
