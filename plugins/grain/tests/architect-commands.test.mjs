// The architect's instruments (issue 446): `cochange` with a partition score, `measure` between two commits,
// `advise`'s `kind: rule` drafts and `propose --scope`.
//
// Everything runs against a real repository with real git history, built here, and a real hand-written graph held
// beside it. The history is designed so the arithmetic is known before the command runs:
//
//   phase 1 — 12 commits touching placeOrder (orders) and issueInvoice (billing) together
//   phase 2 — 25 commits touching log (util) alone
//   phase 3 — 3 commits adding a report module that imports billing and util (the "mission" `measure` reads)
//
// so orders and billing change together 12 of 12 times each, util changes with neither, and the phase-3 range is a
// piece of work whose effect on the territories is known.
import './git-env.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { typeForbids } from '../engine/advise-rules.mjs';
import { certifiedPairs, randomCuts, unitAggregates } from '../engine/cochange.mjs';
import { rng } from '../engine/selftest-null.mjs';
import { removeTemp } from './remove-temp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

let tmp, repo, env, graphAllow, graphLaw, base, mid;

const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env }).trim();
const w = (root, rel, content) => {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};
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
  for (let i = 1; i <= 12; i++) {
    w(root, 'src/orders/order-service.ts', `export function placeOrder() { helper${i}(); return 1; }\n`);
    w(root, 'src/billing/invoices.ts', `export function issueInvoice() { helper${i}(); return 1; }\n`);
    w(root, 'src/util/log.ts', i === 1 ? 'export function log(id?: string) { return 1; }\n' : readFileSync(join(root, 'src/util/log.ts'), 'utf8'));
    gitIn(root, 'add', '-A');
    gitIn(root, 'commit', '-q', '-m', `together ${i}`);
  }
  for (let i = 13; i <= 37; i++) {
    w(root, 'src/util/log.ts', `export function log(id?: string) { helper${i}(); return 1; }\n`);
    gitIn(root, 'add', '-A');
    gitIn(root, 'commit', '-q', '-m', `log alone ${i}`);
  }
  const b = gitIn(root, 'rev-parse', 'HEAD');
  for (let i = 1; i <= 3; i++) {
    w(root, `src/report/report-${i}.ts`, `import { issueInvoice } from '../billing/invoices';\nimport { log } from '../util/log';\n\nexport function report${i}() {\n  log();\n  return issueInvoice();\n}\n`);
    gitIn(root, 'add', '-A');
    gitIn(root, 'commit', '-q', '-m', `report ${i}`);
  }
  return b;
}
// Two graphs held beside the repository, differing in one thing: whether the architecture makes "orders never
// imports util" law (a deny-default table on the orders type that does not list util's type).
function buildGraph(root, { law }) {
  w(root, '.yggdrasil/yg-config.yaml', 'version: "6.0.0"\n');
  w(root, '.yggdrasil/yg-architecture.yaml', [
    'node_types:',
    '  service:', '    description: "A service."', '    when:', '      path: "src/orders/**"',
    '    relations:', '      default: deny', law ? '      calls: [service]' : '      uses: [lib]',
    '  ledger:', '    description: "Billing."', '    when:', '      path: "src/billing/**"',
    '  lib:', '    description: "A library."', '    when:', '      path: "src/util/**"', '',
  ].join('\n'));
  const node = (id, name, type, mapping) =>
    w(root, `.yggdrasil/model/${id}/yg-node.yaml`, [`name: ${name}`, `type: ${type}`, `description: "${name}."`, 'aspects: []', 'relations: []', 'mapping:', `  - ${mapping}`, ''].join('\n'));
  node('orders', 'Order Service', 'service', 'src/orders/');
  node('billing', 'Invoices', 'ledger', 'src/billing/');
  node('util', 'Logging', 'lib', 'src/util/');
}
function grain(cwd, args, { ok = true } = {}) {
  const r = spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 28, env });
  if (ok) assert.equal(r.status, 0, r.stderr);
  return r;
}
const json = (cwd, args) => JSON.parse(grain(cwd, [...args, '--json']).stdout);

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'architect-'));
  env = {
    ...process.env, HOME: tmp,
    GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
    GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z',
  };
  repo = join(tmp, 'repo');
  base = buildFixture(repo);
  mid = gitIn(repo, 'rev-parse', 'HEAD~1');
  graphAllow = join(tmp, 'graph-allow');
  graphLaw = join(tmp, 'graph-law');
  buildGraph(graphAllow, { law: false });
  buildGraph(graphLaw, { law: true });
});
after(() => removeTemp(tmp));

// ------------------------------------------------------------------ cochange

test('cochange --nodes: the designed pair is certified at node level, the null names none, and the document says so', () => {
  const doc = json(repo, ['cochange', '--graph', graphAllow, '--nodes', 'orders']);
  assert.equal(doc.schema, 'grain-cochange/1');
  assert.equal(doc.level, 'node', '--nodes counts nodes unless told otherwise');
  assert.match(doc.at, /^[0-9a-f]{40}$/);
  const p = doc.pairs.find(x => [x.a, x.b].sort().join() === 'billing,orders');
  assert.ok(p, JSON.stringify(doc.pairs));
  assert.equal(p.sup, 12);
  assert.equal(p.inside, false, 'billing is outside the set');
  assert.ok(p.bitsAB !== null || p.bitsBA !== null);
  assert.ok(!doc.pairs.some(x => [x.a, x.b].includes('util')), 'util changes with neither');
  assert.equal(doc.control.real, doc.pairs.length);
  assert.equal(doc.control.null.runs, 3);
  assert.equal(doc.control.null.certifiedMax, 0, 'every pair the shuffled history certifies would be false');
  assert.deepEqual(doc.units.map(u => u.unit), ['orders']);
  assert.equal(doc.units[0].commits, 12);
  assert.ok(doc.units[0].evidence.files >= 6);
});

test('cochange --files at directory level reads the same seam, and the pair is inside the set when both sides are in it', () => {
  const doc = json(repo, ['cochange', '--files', 'src/orders,src/billing', '--level', 'dir']);
  assert.equal(doc.level, 'dir');
  const p = doc.pairs.find(x => [x.a, x.b].sort().join() === 'src/billing,src/orders');
  assert.ok(p, JSON.stringify(doc.pairs));
  assert.equal(p.inside, true);
});

test('cochange at file level with the counting cell reproduces the pair the history was built with', () => {
  const doc = json(repo, ['cochange', '--files', 'src/orders/order-service.ts']);
  assert.equal(doc.level, 'file');
  const p = doc.pairs.find(x => [x.a, x.b].includes('src/billing/invoices.ts'));
  assert.ok(p, JSON.stringify(doc.pairs));
  assert.equal(p.sup, 12);
});

test('a partition that follows the seam scores better than one that cuts it, and both carry the random-cut control', () => {
  const good = json(repo, ['cochange', '--graph', graphAllow, '--level', 'node', '--partition', JSON.stringify({ sales: ['orders', 'billing'], infra: ['util'] })]);
  const bad = json(repo, ['cochange', '--graph', graphAllow, '--level', 'node', '--partition', JSON.stringify({ sales: ['orders'], infra: ['billing', 'util'] })]);
  assert.ok(good.partition.score.commitShare > bad.partition.score.commitShare, `${good.partition.score.commitShare} vs ${bad.partition.score.commitShare}`);
  assert.equal(good.partition.score.commitsCrossing, 1, 'only the first commit, which wrote every file, touched both parts of the good cut');
  assert.equal(bad.partition.score.commitsCrossing, 12, 'the twelve together-commits cross the bad cut (the first of them wrote every file)');
  assert.equal(good.partition.score.pairsInside, 1);
  assert.equal(bad.partition.score.pairsCrossing, 1);
  for (const d of [good, bad]) {
    assert.equal(d.partition.control.runs, 30);
    assert.equal(typeof d.partition.control.commitShareMean, 'number');
    assert.equal(typeof d.partition.control.atLeastAsGoodCommitShare, 'number');
    assert.deepEqual(d.partition.parts.map(p => p.name), Object.keys(d === good ? { sales: 1, infra: 1 } : { sales: 1, infra: 1 }));
    for (const p of d.partition.parts) assert.ok('importsInside' in p && 'importsCrossing' in p && 'purity' in p, 'each part carries its typeEvidence');
  }
  // the imports: every orders and billing file imports util, so the good cut keeps none of those inside a part
  assert.ok(good.partition.score.importsCrossing > 0);
});

test('a partition can come from a file, and a file in two parts, an unknown node or path, or no set at all is refused', () => {
  const f = join(tmp, 'parts.json');
  writeFileSync(f, JSON.stringify({ a: ['src/orders'], b: ['src/billing'] }));
  assert.equal(json(repo, ['cochange', '--partition', f]).partition.parts.length, 2);
  const refused = (args, re) => {
    const r = grain(repo, ['cochange', ...args], { ok: false });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, re);
  };
  refused(['--partition', JSON.stringify({ a: ['src/orders'], b: ['src/orders/order-repo.ts'] })], /one part only/);
  refused(['--graph', graphAllow, '--nodes', 'nosuch'], /no node `nosuch`/);
  refused(['--files', 'src/nosuch'], /nothing tracked matches `src\/nosuch`/);
  refused([], /needs --files, --nodes or --partition/);
  refused(['--files', 'src/orders', '--level', 'module'], /--level takes one of file, dir, node/);
  refused(['--files', 'src/orders', '--level', 'node'], /needs an architecture graph/);
});

test('the text answer names the pairs, the null beside them, and the cut against random cuts', () => {
  const out = grain(repo, ['cochange', '--graph', graphAllow, '--level', 'node', '--partition', JSON.stringify({ sales: ['orders', 'billing'], infra: ['util'] })]).stdout;
  assert.match(out, /change together more often than chance/);
  assert.match(out, /shuffled cop/);
  assert.match(out, /billing ↔ orders|orders ↔ billing/);
  assert.match(out, /stayed inside one part \(random cuts along the directory tree: \d+%/);
  assert.match(out, /as of [0-9a-f]{7}/);
});

test('the pair counts and the null are pure functions of the footprints', () => {
  const ufps = [];
  for (let i = 0; i < 12; i++) ufps.push({ files: ['a', 'b'] });
  for (let i = 0; i < 25; i++) ufps.push({ files: ['c'] });
  const pairs = certifiedPairs(unitAggregates(ufps));
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].sup, 12);
  const cut = randomCuts({ x: new Set(['d1/a', 'd1/b', 'd2/c']), y: new Set(['d3/e']) }, rng(1));
  assert.equal(cut.x.size + cut.y.size, 4);
  for (const part of Object.values(cut)) for (const d of ['d1/']) assert.ok([...part].filter(f => f.startsWith(d)).length % 2 === 0, 'a directory is never split between parts');
  // a large directory dealt first never leaves a later part empty: a random cut has as many parts as the proposed one
  const big = { x: new Set(['s/a', 'b/a', 'b/b', 'b/c']), y: new Set(['b/d']) };
  for (let r = 1; r <= 20; r++) {
    const c = randomCuts(big, rng(r));
    assert.ok(c.x.size > 0 && c.y.size > 0, `seed ${r}: ${[...c.x]} | ${[...c.y]}`);
  }
});

// ------------------------------------------------------------------ measure

test('measure between the base and HEAD sees the work: new files, new imports out of the territory, and the range', () => {
  const doc = json(repo, ['measure', '--from', base, '--to', 'HEAD', '--scope', 'src/report,src/billing', '--graph', graphAllow]);
  assert.equal(doc.schema, 'grain-measure/1');
  assert.equal(doc.from.sha, base);
  assert.equal(doc.to.sha, gitIn(repo, 'rev-parse', 'HEAD'));
  assert.equal(doc.to.files - doc.from.files, 3, 'three report files were added');
  assert.equal(doc.delta.files, 3);
  assert.ok(doc.delta.importsInside >= 3, 'each report imports billing: inside the scope');
  assert.ok(doc.delta.importsOut >= 3, 'each report imports util: out of the scope');
  assert.equal(doc.range.commitsInRange, 3);
  assert.equal(doc.range.scopeCommits, 3);
  assert.equal(doc.range.crossing, 0, 'the report commits touched nothing outside the scope');
  assert.equal(doc.range.baseline.scopeCommits, 3, 'the baseline takes as many of the scope\'s own commits just before the range');
  assert.equal(doc.range.baseline.crossing, 3, 'billing\'s own commits always came with orders');
  assert.equal(typeof doc.to.undeclaredNodeDependencies, 'number');
});

test('measure reuses each end once built, answers text with a stamp, and refuses a commit it cannot find or a scope that matches nothing', () => {
  const out = grain(repo, ['measure', '--from', mid, '--to', 'HEAD', '--scope', 'src/report']).stdout;
  assert.match(out, /files: 2 → 3 \(\+1\)/);
  assert.match(out, /For scale: /);
  assert.match(out, /as of [0-9a-f]{7}/);
  const cached = readdirSync(join(repo, '.grain', 'cache', 'measure')).filter(f => f.endsWith('.json'));
  assert.ok(cached.length >= 2, cached.join());
  assert.ok(!readdirSync(join(repo, '.grain', 'cache', 'measure')).some(f => f.startsWith('tree-')), 'no materialised tree is left behind');
  const r1 = grain(repo, ['measure', '--from', 'nosuchref', '--to', 'HEAD'], { ok: false });
  assert.match(r1.stderr, /no commit `nosuchref`/);
  const r2 = grain(repo, ['measure', '--from', base, '--to', 'HEAD', '--scope', 'src/nosuch'], { ok: false });
  assert.match(r2.stderr, /nothing matches `src\/nosuch` at either commit/);
  const r3 = grain(repo, ['measure', '--from', base], { ok: false });
  assert.match(r3.stderr, /usage: grain measure --from/);
});

test('measure reads each end\'s undeclared dependencies against the graph that commit had', () => {
  const own = join(tmp, 'measure-own-graph');
  cpSync(repo, own, { recursive: true });
  cpSync(join(graphAllow, '.yggdrasil'), join(own, '.yggdrasil'), { recursive: true });
  gitIn(own, 'add', '-A');
  gitIn(own, 'commit', '-q', '-m', 'graph');
  const before = gitIn(own, 'rev-parse', 'HEAD');
  // the work: billing's dependency on util becomes a declared relation
  const node = join(own, '.yggdrasil/model/billing/yg-node.yaml');
  writeFileSync(node, readFileSync(node, 'utf8').replace('relations: []', 'relations:\n  - target: util\n    type: uses'));
  gitIn(own, 'add', '-A');
  gitIn(own, 'commit', '-q', '-m', 'declare billing uses util');
  const doc = json(own, ['measure', '--from', before, '--to', 'HEAD', '--scope', 'billing']);
  assert.equal(doc.from.graphAtCommit, true);
  assert.deepEqual(doc.from.undeclared.map(u => `${u.from}>${u.to}`), ['billing>util']);
  assert.equal(doc.to.undeclaredNodeDependencies, 0, 'the relation the work declared counts at --to');
  assert.equal(doc.delta.undeclaredNodeDependencies, -1);
});

// ------------------------------------------------------------------ advise: kind rule

test('a boundary decision the architecture does not make law is a `kind: rule` item with its draft and its crossings', () => {
  const own = join(tmp, 'boundary');
  cpSync(repo, own, { recursive: true });
  grain(own, ['decide', 'boundary', 'src/orders', '--never-imports', 'src/util', '--note', 'orders log through billing', '--author', 'test']);
  const doc = json(own, ['advise', '--graph', graphAllow]);
  const rule = doc.items.find(i => i.kind === 'rule' && i.evidence.origin === 'boundary');
  assert.ok(rule, JSON.stringify(doc.items.map(i => i.kind)));
  assert.deepEqual(rule.nodes, ['orders']);
  assert.equal(rule.evidence.from, 'src/orders');
  assert.equal(rule.evidence.neverImports, 'src/util');
  assert.ok(rule.evidence.violations >= 6, 'every orders file imports util');
  assert.deepEqual(rule.evidence.draft.deny, [{ type: 'service', mustNotReach: 'lib' }]);
  assert.match(rule.text, /does not make it law yet/);
  assert.match(rule.text, /type `service` must not reach `lib`/);
  assert.equal(doc.survey.rules.boundaries.promoted, 0);
  assert.match(grain(own, ['advise', '--graph', graphAllow]).stdout, /rules? the graph could take on/);
});

test('once the architecture forbids it the decision is promoted: no item, marked in decide list, and no longer flagged at edit time', () => {
  const own = join(tmp, 'promoted');
  cpSync(repo, own, { recursive: true });
  grain(own, ['decide', 'boundary', 'src/orders', '--never-imports', 'src/util', '--note', 'orders log through billing', '--author', 'test']);
  const doc = json(own, ['advise', '--graph', graphLaw]);
  assert.ok(!doc.items.some(i => i.kind === 'rule' && i.evidence.origin === 'boundary'));
  assert.equal(doc.survey.rules.boundaries.promoted, 1);
  // the edit-time flag reads the repository's own graph: before it has one the decision speaks, after it does not
  const flagged = () => {
    w(own, 'src/orders/order-extra.ts', "import { log } from '../util/log';\nexport const extra = () => log();\n");
    return JSON.stringify(json(own, ['check', 'src/orders/order-extra.ts']));
  };
  assert.match(flagged(), /"kind":"boundary-decision"/);
  cpSync(join(graphLaw, '.yggdrasil'), join(own, '.yggdrasil'), { recursive: true });
  assert.doesNotMatch(flagged(), /"kind":"boundary-decision"/);
  assert.match(grain(own, ['decide', 'list']).stdout, /\[promoted: the architecture forbids it\]/);
});

test('a boundary between a node and one nested inside it is never promoted: the hierarchy needs no relation', () => {
  const own = join(tmp, 'nested');
  cpSync(repo, own, { recursive: true });
  grain(own, ['decide', 'boundary', 'src/orders', '--never-imports', 'src/util', '--note', 'x', '--author', 'test']);
  const graph = join(tmp, 'graph-nested');
  cpSync(graphLaw, graph, { recursive: true });
  // util moves under orders: the type table still denies lib, but Yggdrasil exempts an import along the hierarchy
  cpSync(join(graph, '.yggdrasil', 'model', 'util'), join(graph, '.yggdrasil', 'model', 'orders', 'util'), { recursive: true });
  rmSync(join(graph, '.yggdrasil', 'model', 'util'), { recursive: true, force: true });
  const doc = json(own, ['advise', '--graph', graph]);
  assert.equal(doc.survey.rules.boundaries.promoted, 0);
  const rule = doc.items.find(i => i.kind === 'rule' && i.evidence.origin === 'boundary');
  assert.ok(rule, JSON.stringify(doc.items.map(i => i.kind)));
  assert.deepEqual(rule.evidence.nestedNodes, [{ from: 'orders', to: 'orders/util' }]);
  assert.match(rule.text, /one node inside the other/);
});

test('the architecture reading: only a deny-default table that lists neither the type nor * forbids it', () => {
  const arch = t => ({ node_types: { s: { relations: t } } });
  assert.equal(typeForbids(arch({ default: 'deny', calls: ['s'] }), 's', 'lib'), true);
  assert.equal(typeForbids(arch({ default: 'deny', uses: ['lib'] }), 's', 'lib'), false);
  assert.equal(typeForbids(arch({ default: 'deny', uses: ['*'] }), 's', 'lib'), false);
  assert.equal(typeForbids(arch({ uses: ['s'] }), 's', 'lib'), false, 'an absent default allows');
  assert.equal(typeForbids({ node_types: { s: {} } }, 's', 'lib'), false);
});

test('every `kind: rule` item a consumer reads has what `yg advise import` requires, and convention drafts carry a check', () => {
  const own = join(tmp, 'importable');
  cpSync(repo, own, { recursive: true });
  grain(own, ['decide', 'boundary', 'src/orders', '--never-imports', 'src/util', '--note', 'x', '--author', 'test']);
  const doc = json(own, ['advise', '--graph', graphAllow]);
  assert.ok(doc.items.some(i => i.kind === 'rule'));
  for (const it of doc.items) {
    assert.ok(['relation', 'split', 'rule'].includes(it.kind), it.kind);
    assert.ok(Array.isArray(it.nodes) && it.nodes.length >= 1 && it.nodes.every(n => typeof n === 'string'));
    assert.ok(typeof it.text === 'string' && it.text.trim());
    if (it.kind === 'rule' && it.evidence.origin === 'convention') {
      assert.equal(it.evidence.alsoIn.length, it.nodes.length - 1, 'one draft per node the rule holds in');
      assert.equal(typeof it.evidence.draft.check, 'string');
      assert.equal(it.evidence.draft.attachTo, it.nodes[0]);
      // the identity a consumer files on names the rule, not the node holding it most strongly (issue 498)
      const e = it.evidence;
      assert.equal(e.rule, [e.enumerator, e.argument ?? '', String(e.expected ?? ''), e.rule.split('|').at(-1)].join('|'));
      assert.ok(!e.rule.includes(e.partition), 'the rule identity does not carry the strongest node\'s partition');
    }
  }
  const rules = doc.items.filter(i => i.kind === 'rule' && i.evidence.origin === 'convention').map(i => i.evidence.rule);
  assert.equal(new Set(rules).size, rules.length, 'one item per rule, so no two items share a rule identity');
  assert.ok(!doc.items.some(i => i.kind === 'port'), '`port` stays reserved');
  const c = doc.survey.rules.conventions;
  assert.equal(c.emitted, doc.items.filter(i => i.kind === 'rule' && i.evidence.origin === 'convention').length);
  assert.ok(c.emitted <= 20);
});

// ------------------------------------------------------------------ propose --scope

test('propose --scope writes a graph over the territory only, and every rule it drafts was measured inside it', () => {
  const own = join(tmp, 'propose-scope');
  cpSync(repo, own, { recursive: true });
  const out = join(tmp, 'proposal-scope');
  grain(own, ['propose', out, '--scope', 'src/orders']);
  const report = JSON.parse(readFileSync(join(out, 'proposal.json'), 'utf8'));
  const mapped = [];
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name === 'yg-node.yaml') mapped.push(...readFileSync(join(d, e.name), 'utf8').split('\n').filter(l => /^ {2}- /.test(l)).map(l => l.trim().slice(2).replace(/^["']|["']$/g, '')));
    }
  };
  walk(join(out, '.yggdrasil', 'model'));
  for (const m of mapped) assert.ok(m.startsWith('src/orders') || m === 'src' || m === 'src/', `mapping outside the scope: ${m}`);
  for (const row of (report.evidence || []).filter(r => r.kind === 'aspect')) assert.match(row.id, /orders/, `a rule outside the scope: ${row.id}`);
  const r = grain(own, ['propose', out, '--scope', 'src/nosuch'], { ok: false });
  assert.match(r.stderr, /--scope: nothing tracked matches `src\/nosuch`/);
});

// The convention side, on the shared fixture whose conventions are planted (tests/fixtures/build-fixture.mjs): every
// handler imports `src/core/handler`, a rule no aspect of a graph that only draws the directories states.
test('a certified convention inside one node, which no aspect states, is drafted as that node\'s aspect — and not once the graph states it', () => {
  const fx = join(tmp, 'fixture');
  execFileSync('node', [join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs'), fx], { env });
  const graph = join(tmp, 'graph-fixture');
  w(graph, '.yggdrasil/yg-config.yaml', 'version: "6.0.0"\n');
  w(graph, '.yggdrasil/yg-architecture.yaml', 'node_types:\n  area:\n    description: "An area."\n');
  for (const [id, path] of [['core', 'src/core/'], ['dto', 'src/dto/'], ['guards', 'src/guards/'], ['handlers', 'src/handlers/'], ['services', 'src/services/'], ['tests', 'test/']])
    w(graph, `.yggdrasil/model/${id}/yg-node.yaml`, `name: ${id}\ntype: area\ndescription: "${id}."\naspects: []\nrelations: []\nmapping:\n  - ${path}\n`);
  const doc = json(fx, ['advise', '--graph', graph]);
  const drafts = doc.items.filter(i => i.kind === 'rule' && i.evidence.origin === 'convention');
  const imp = drafts.find(i => i.nodes[0] === 'handlers' && /import `~\/src\/core\/handler`/.test(i.text));
  assert.ok(imp, drafts.map(d => d.text).join('\n'));
  assert.equal(imp.evidence.draft.attachTo, 'handlers');
  assert.equal(imp.evidence.draft.yaml.status, 'draft');
  assert.match(imp.evidence.draft.check, /export/);
  assert.ok(imp.evidence.conforming >= 20);
  assert.equal(imp.confidence, 1);
  for (const d of drafts) {
    assert.ok(d.evidence.draft.check, 'only a rule a check can hold is drafted');
    assert.notEqual(d.evidence.enumerator, 'lex', 'formatting is the formatter\'s');
  }
  // one rule certified in several nodes is one item naming all of them (the fixture's handlers and services both
  // name their methods one lowercase word and their files dotted lowercase)
  const keys = drafts.map(d => [d.evidence.enumerator, d.evidence.argument, d.evidence.expected].join('|'));
  assert.equal(new Set(keys).size, keys.length, 'no rule is listed twice');
  const multi = drafts.find(d => d.nodes.length > 1);
  assert.ok(multi, drafts.map(d => `${d.nodes} ${d.text}`).join('\n'));
  assert.deepEqual([multi.evidence.draft.attachTo, ...multi.evidence.alsoIn.map(x => x.attachTo)], multi.nodes);
  assert.match(multi.text, /The same rule, each time over that node's own files, holds in \d+ nodes/);
  // the graph states it: an aspect of the same id is in the graph, and the draft goes
  w(graph, `.yggdrasil/aspects/${imp.evidence.aspect}/yg-aspect.yaml`, 'name: x\ndescription: x\nstatus: draft\n');
  const again = json(fx, ['advise', '--graph', graph]);
  assert.ok(!again.items.some(i => i.kind === 'rule' && i.evidence.aspect === imp.evidence.aspect));
  assert.equal(again.survey.rules.conventions.alreadyStated, doc.survey.rules.conventions.alreadyStated + 1);
});
