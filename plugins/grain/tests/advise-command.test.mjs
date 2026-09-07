// `grain advise` — node-level co-change and split candidates as `grain-advice/1` (ticket 131).
//
// The command reads the architecture graph a repository already has and reports two things about it from the
// repository's own history and imports: places that change together with nothing in the graph connecting them,
// and places a finer cut of their own files beats on their own evidence. `.system/research/
// node-cochange-measurement.md` is the measurement that decided how much of that ships as advice; this file is
// the guard on the parts of it that can fail silently.
//
// FOUR THINGS ARE GUARDED, each with a silent failure mode of its own:
//
//   1. THE DOCUMENT. `--json` is a published contract another layer reads (`grain-advice/1`, mission §3): the
//      schema string, the item kinds, and the promise that `rule` and `port` are reserved and never fabricated.
//      A drifted key here breaks a consumer with no error anywhere.
//   2. THE MUTUAL GATE. The whole reason this instrument is not the file-level lever that was measured and
//      rejected (`.system/research/where-cochange-promotion.md`) is that both directions must clear the floor.
//      A regression to one-way confidence would still emit pairs — more of them — and nothing would look wrong.
//      So the fixture below contains a HUB whose one-way confidence is 1.00 and whose mutual confidence is
//      under the floor, and the test proves both that it is absent AND that the pair exists in the model, so
//      the absence is the gate rather than a missing pair.
//   3. DECLARED DETECTION. `declared` is what separates a hidden edge from one the graph already draws. It is
//      tested against two REAL graphs differing in exactly one declared relation.
//   4. THE SPLIT SIDE, on the oracles. Express's `Examples` node holds eighty files that are eighty independent
//      programs; spring-petclinic's nodes are already the size of one thing. Both answers are asserted, because
//      "names a split everywhere" and "names one nowhere" are the two ways this side dies.
//
// Everything runs against real on-disk repositories with real git history and real hand-written graphs — the
// fixture here, and the committed oracles under `tests/stress/oracles/` against the corpus clones when they are
// present. Nothing is fabricated.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { declaredVia, readNodeGraph } from '../engine/grain-advise.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const ORACLES = join(here, 'stress', 'oracles');

let tmp, repo, graphUndeclared, graphDeclared, bareRepo, env;

const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env });
const w = (root, rel, content) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};

// THE FIXTURE. Fifteen TypeScript files that import each other across three future nodes, plus three templates
// grain has no grammar for at all — enough real code for grain to have partitions and resolved imports, which
// is what the split side's two comparisons are made of. Twelve of the files are written once and never touched
// again; only the three subjects churn, so the co-change arithmetic below is exactly the designed one.
//
//   phase 1 — 10 commits touching placeOrder, issueInvoice AND log together
//   phase 2 — 25 further commits touching log alone
//
// so the pair (placeOrder, issueInvoice) is 10 of 10 and 10 of 10 — mutual 1.00 — while (placeOrder, log) is
// 10 of 10 one way and 10 of 35 the other: one-way 1.00, mutual 0.29, under the 1/3 floor. `helper<i>()` changes
// the CALLED name every commit so the body hash actually moves; a literal-only edit registers no touch past
// birth (the note `scope-cochange.test.mjs` carries, for the same reason).
const KINDS = ['repo', 'mapper', 'validator', 'view', 'router'];
const cap = s => s[0].toUpperCase() + s.slice(1);
function buildFixture(root) {
  mkdirSync(root, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main', root], { env });
  gitIn(root, 'config', 'commit.gpgsign', 'false');
  const member = (owner, k) =>
    `import { log } from '../util/log';\nimport { newId } from '../util/ids';\n\nexport class ${owner}${cap(k)} {\n` +
    `  run(id: string): string {\n    log(id);\n    return newId(id);\n  }\n}\n`;
  for (const k of KINDS) w(root, `src/orders/order-${k}.ts`, member('Order', k));
  for (const k of KINDS) w(root, `src/billing/invoice-${k}.ts`, member('Invoice', k));
  w(root, 'src/util/ids.ts', "export function newId(seed: string): string {\n  return seed + '-1';\n}\n");
  w(root, 'src/util/clock.ts', 'export function now(): number {\n  return 0;\n}\n');
  // three files under the orders node grain parses nothing in — the shape the split side reads
  for (const n of ['confirmation', 'receipt', 'reminder']) w(root, `src/orders/templates/${n}.html`, `<!doctype html>\n<h1>${n}</h1>\n`);
  for (let i = 1; i <= 10; i++) {
    w(root, 'src/orders/order-service.ts', `export function placeOrder() { helper${i}(); return 1; }\n`);
    w(root, 'src/billing/invoices.ts', `export function issueInvoice() { helper${i}(); return 1; }\n`);
    w(root, 'src/util/log.ts', `export function log(id?: string) { helper${i}(); return 1; }\n`);
    gitIn(root, 'add', '-A');
    gitIn(root, 'commit', '-q', '-m', `together ${i}`);
  }
  for (let i = 11; i <= 35; i++) {
    w(root, 'src/util/log.ts', `export function log(id?: string) { helper${i}(); return 1; }\n`);
    gitIn(root, 'add', '-A');
    gitIn(root, 'commit', '-q', '-m', `log alone ${i}`);
  }
}

// A hand-written graph held BESIDE the repository, the shape every oracle under `tests/stress/oracles/` has.
// `declaresCalls` is the single difference between the two copies.
function buildGraph(root, { declaresCalls }) {
  w(root, '.yggdrasil/yg-config.yaml', 'version: "5.2.0"\n');
  w(root, '.yggdrasil/yg-architecture.yaml', [
    'node_types:', '', '  service:', '    description: "A service."', '    when:',
    '      path: "src/**/*.ts"', '    relations:', '      default: deny', '',
  ].join('\n'));
  w(root, '.yggdrasil/model/orders/yg-node.yaml', [
    'name: Order Service', 'type: service', 'description: "Orders."', 'aspects: []',
    declaresCalls ? 'relations:\n  - target: billing\n    type: calls' : 'relations: []',
    'mapping:', '  - src/orders/', '',
  ].join('\n'));
  w(root, '.yggdrasil/model/billing/yg-node.yaml', [
    'name: Invoices', 'type: service', 'description: "Billing."', 'aspects: []', 'relations: []',
    'mapping:', '  - src/billing/', '',
  ].join('\n'));
  w(root, '.yggdrasil/model/util/yg-node.yaml', [
    'name: Logging', 'type: service', 'description: "Logging."', 'aspects: []', 'relations: []',
    'mapping:', '  - src/util/', '',
  ].join('\n'));
}

function advise(target, extra = []) {
  const r = spawnSync('node', [BIN, 'advise', ...extra], { cwd: target, encoding: 'utf8', maxBuffer: 1 << 28, env });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
const adviseJson = (target, extra = []) => JSON.parse(advise(target, ['--json', ...extra]));

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'advise-'));
  env = {
    ...process.env, HOME: tmp,
    GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
    GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z',
  };
  repo = join(tmp, 'repo');
  buildFixture(repo);
  graphUndeclared = join(tmp, 'graph-undeclared');
  graphDeclared = join(tmp, 'graph-declared');
  buildGraph(graphUndeclared, { declaresCalls: false });
  buildGraph(graphDeclared, { declaresCalls: true });
  // the same sources with no graph anywhere — the brownfield answer
  bareRepo = join(tmp, 'bare');
  mkdirSync(bareRepo, { recursive: true });
  execFileSync('git', ['init', '-q', '-b', 'main', bareRepo], { env });
  w(bareRepo, 'src/a.ts', 'export function a() { return 1; }\n');
  gitIn(bareRepo, 'add', '-A');
  gitIn(bareRepo, 'commit', '-q', '-m', 'bare');
});
after(() => {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ }
});

// ------------------------------------------------------------------ 1. the document

test('`advise --json` is a grain-advice/1 document: schema, subject, commit, items', () => {
  const doc = adviseJson(repo, ['--graph', graphUndeclared]);
  assert.equal(doc.schema, 'grain-advice/1');
  assert.equal(doc.repo, '.');
  assert.match(doc.at, /^[0-9a-f]{40}$/);
  assert.ok(Array.isArray(doc.items));
  for (const it of doc.items) {
    assert.ok(['relation', 'split'].includes(it.kind), `unexpected item kind ${it.kind}`);
    assert.ok(Array.isArray(it.nodes) && it.nodes.length >= 1);
    assert.equal(typeof it.text, 'string');
    assert.ok(it.text.length > 0);
    assert.ok(it.evidence && typeof it.evidence === 'object');
  }
});

test('`rule` and `port` are reserved kinds and are never fabricated', () => {
  const doc = adviseJson(repo, ['--graph', graphUndeclared]);
  assert.deepEqual([...new Set(doc.items.map(i => i.kind))].sort(), ['relation', 'split']);
});

test('the one pair that clears both directions is emitted, with the declarations it was read from', () => {
  const doc = adviseJson(repo, ['--graph', graphUndeclared]);
  const rel = doc.items.filter(i => i.kind === 'relation');
  assert.equal(rel.length, 1, JSON.stringify(rel.map(r => r.nodes)));
  assert.deepEqual(rel[0].nodes, ['billing', 'orders']);
  assert.equal(rel[0].confidence, 1);
  assert.equal(rel[0].evidence.coChanged, 10);
  assert.equal(rel[0].evidence.ofA, 1);
  assert.equal(rel[0].evidence.ofB, 1);
  // the claim is checkable by hand: the two named declarations, and the commit counts behind the two rates
  assert.equal(rel[0].evidence.witnessA, 'src/billing/invoices.ts#method#issueInvoice');
  assert.equal(rel[0].evidence.witnessB, 'src/orders/order-service.ts#method#placeOrder');
  assert.equal(rel[0].evidence.commitsA, 10);
  assert.equal(rel[0].evidence.commitsB, 10);
  assert.match(rel[0].text, /issueInvoice/);
  assert.match(rel[0].text, /placeOrder/);
});

// ------------------------------------------------------------------ 2. the mutual gate

test('the hub is absent because BOTH directions must clear 1/3 — the pair is in the model, one-way at 1.00', () => {
  const doc = adviseJson(repo, ['--graph', graphUndeclared]);
  const named = new Set(doc.items.filter(i => i.kind === 'relation').flatMap(i => i.nodes));
  assert.ok(!named.has('util'), 'the hub node must not be named by any pair');

  // …and the pair really is there to be named: one-way confidence 1.00, mutual 10/35 = 0.29, under the floor.
  // Without this half the test would also pass if the pair had simply never been mined.
  const model = JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));
  const hub = (model.scopeCochange || []).find(
    p => [p.a, p.b].some(k => k.startsWith('src/orders/')) && [p.a, p.b].some(k => k.startsWith('src/util/'))
  );
  assert.ok(hub, `the orders/util scope pair must exist in the model: ${JSON.stringify(model.scopeCochange)}`);
  const ofA = hub.sup / hub.commitsA,
    ofB = hub.sup / hub.commitsB;
  assert.ok(Math.max(ofA, ofB) >= 1 / 3, 'one-way confidence clears the floor — a one-way gate would emit it');
  assert.ok(Math.min(ofA, ofB) < 1 / 3, 'mutual confidence does not clear the floor — which is why it is absent');
});

// ------------------------------------------------------------------ 3. declared detection

test('one declared relation in the graph is the whole difference between a hidden edge and a known one', () => {
  const hidden = adviseJson(repo, ['--graph', graphUndeclared]).items.find(i => i.kind === 'relation');
  const known = adviseJson(repo, ['--graph', graphDeclared]).items.find(i => i.kind === 'relation');
  assert.deepEqual(hidden.nodes, known.nodes);
  assert.equal(hidden.evidence.declared, false);
  assert.equal(hidden.evidence.declaredVia, null);
  assert.equal(known.evidence.declared, true);
  assert.equal(known.evidence.declaredVia, 'relation');
  assert.match(hidden.text, /Nothing in the architecture connects them/);
  assert.match(known.text, /already connects them/);
});

test('the survey counts close, and the control is the declared rate over every pair of mapped nodes', () => {
  const doc = adviseJson(repo, ['--graph', graphDeclared]);
  const s = doc.survey;
  assert.equal(s.pairs, doc.items.filter(i => i.kind === 'relation').length);
  assert.equal(s.declared + s.undeclared, s.pairs);
  assert.equal(s.splits, doc.items.filter(i => i.kind === 'split').length);
  assert.equal(s.nodesWithFiles, 3);
  assert.equal(s.control.nodePairs, 3, 'three mapped nodes make three pairs');
  assert.equal(s.control.declared, 1, 'exactly one of them is declared in this graph');
  assert.equal(s.control.rate, +(1 / 3).toFixed(4));
});

test('containment and an ancestor relation are both declared, and are told apart', () => {
  const files = ['src/orders/order-service.ts', 'src/billing/invoices.ts'];
  const g = readNodeGraph(graphDeclared, files);
  assert.equal(declaredVia(g, 'orders', 'billing'), 'relation');
  assert.equal(declaredVia(g, 'billing', 'util'), null);
  // a graph whose only join is the tree: read the same reader over a graph with a child node
  const nested = join(tmp, 'graph-nested');
  buildGraph(nested, { declaresCalls: false });
  w(nested, '.yggdrasil/model/orders/templates/yg-node.yaml', [
    'name: Order Templates', 'type: service', 'description: "Templates."', 'aspects: []', 'relations: []',
    'mapping:', '  - src/orders/templates/', '',
  ].join('\n'));
  const gn = readNodeGraph(nested, [...files, 'src/orders/templates/receipt.html']);
  assert.equal(declaredVia(gn, 'orders', 'orders/templates'), 'containment');
  assert.equal(declaredVia(gn, 'orders/templates', 'billing'), null);
});

// ------------------------------------------------------------------ 4. the split side

test('a node holding files grain can read none of is offered the finer cut, on the node it belongs to', () => {
  const doc = adviseJson(repo, ['--graph', graphUndeclared]);
  const split = doc.items.filter(i => i.kind === 'split');
  assert.equal(split.length, 1, JSON.stringify(split.map(s => s.nodes)));
  assert.deepEqual(split[0].nodes, ['orders']);
  assert.deepEqual(split[0].candidates, ['src/orders/templates']);
  const c = split[0].evidence.candidates[0];
  assert.equal(c.reason, 'unread');
  assert.equal(c.files, 3);
  assert.equal(c.mined, 0);
  assert.ok(split[0].evidence.node.mined > 0, 'the node above it is code grain did read — that is the contrast');
  assert.match(split[0].text, /outgrown one context/);
});

// ------------------------------------------------------------------ 5. what the text surface says

test('the text surface never lists the change-together pairs as advice, and always discloses', () => {
  const out = advise(repo, ['--graph', graphUndeclared]);
  assert.match(out, /not advice — read them with `--json`/);
  assert.match(out, /Why not advice: /);
  assert.match(out, /For scale: /);
  // the pair is counted, never printed: no declaration name from the pair reaches the text surface
  assert.ok(!/issueInvoice/.test(out), 'a co-change pair must not be listed on the text surface');
  // the split side IS advice and is listed
  assert.match(out, /a finer cut beats on its own evidence/);
});

test('a repository with no architecture graph is told so, and the document stays a grain-advice/1', () => {
  const doc = adviseJson(bareRepo);
  assert.equal(doc.schema, 'grain-advice/1');
  assert.deepEqual(doc.items, []);
  assert.match(doc.note, /no `\.yggdrasil\/`/);
  assert.match(advise(bareRepo), /grain propose/);
});

// ------------------------------------------------------------------ 6. the oracles

// The committed hand graphs, against the real repositories they describe. History is not needed for the split
// side (it reads imports and what grain parsed), so these run `--no-history` and stay cheap.
const CLONES = process.env.GRAIN_CORPUS_CLONES;
const ORACLE_SPLITS = {
  express: { oracle: 'express', clone: 'express', node: 'examples', hasSplit: true },
  'spring-petclinic': { oracle: 'spring-petclinic', clone: 'spring-petclinic', node: null, hasSplit: false },
};

for (const [name, F] of Object.entries(ORACLE_SPLITS)) {
  test(`the ${name} oracle gets the split advice its own node sizes justify`, { skip: CLONES ? false : 'GRAIN_CORPUS_CLONES is not set — the corpus clones are not in this repository' }, () => {
    const clone = join(CLONES, F.clone);
    if (!existsSync(join(clone, '.git'))) {
      assert.ok(true, `skipped: no clone at ${clone}`);
      return;
    }
    // the corpus clones are read-only and `advise` writes an index, so work on a copy of the checkout
    const target = join(tmp, `clone-${name}`);
    execFileSync('cp', ['-a', clone, target]);
    rmSync(join(target, '.grain'), { recursive: true, force: true });
    const doc = adviseJson(target, ['--no-history', '--graph', join(ORACLES, F.oracle)]);
    assert.equal(doc.schema, 'grain-advice/1');
    const split = doc.items.filter(i => i.kind === 'split');
    if (!F.hasSplit) {
      assert.deepEqual(split, [], `${name}'s nodes are already the size of one thing — nothing should be offered`);
      return;
    }
    assert.ok(split.length >= 1, `${name} should be offered at least one finer cut`);
    const s = split.find(i => i.nodes[0] === F.node);
    assert.ok(s, `expected a split on ${F.node}, got ${JSON.stringify(split.map(i => i.nodes))}`);
    assert.ok(s.candidates.length >= 2, 'a node holding many independent programs offers more than one cut');
    for (const c of s.evidence.candidates) assert.ok(['unread', 'tighter'].includes(c.reason));
  });
}
