// Cross-check: `report` and `rules` are two different commands surfacing overlapping convention/architecture
// content over the SAME model — class C territory. cross-check-disclosure-parity.test.mjs already proves this for
// the two coverage/aggregation DISCLOSURES (§004/§G21's relCoverageNote/intraModuleNote) and documents, by design,
// why it stops there (the per-convention listing itself is excluded from that file's scope, on the argument that
// `rulesMarkdown` and `report` share `factTiers`/`verbalize`/`factLabel` end to end so they "can never disagree").
// This file is the audit that argument earns nothing until it is actually checked: a PROPERTY test, over a real
// mined convention, that the shared-code argument holds in practice — and a regression pin if a future edit ever
// decouples the two renderers' wording or header counts.
//
// Fixture: the same deterministic "10 Commands extend Command" poisoning technique cross-check-agreement.test.mjs
// and cross-check-check-review-parity.test.mjs already established (reused rather than re-invented) — a role fact
// fully conforming (10/10 established, share 1, no deviants), so `report`'s domain-tier line and `rules`'
// Domain-conventions table row for the SAME (cid, pid) must carry byte-identical evidentiary text. A 3-file
// module chain (modA -> modB -> modC) is added so the architecture section's header counts are non-trivial (a
// bare "0 modules" comparison would prove far less, mirroring cross-check-disclosure-parity.test.mjs's own "no
// bare zero" reasoning for why a non-vacuous fixture matters).
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
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const commandSrc = name => `export class ${name}Command extends Command {\n  readonly id: number;\n  constructor(id: number) {\n    this.id = id;\n  }\n}\n`;
const PAIRED = ['Order', 'Payment', 'Shipment', 'Refund', 'Invoice', 'Cart', 'Customer', 'Product', 'Stock', 'Coupon'];

let tmp, repo, ROLE;
before(() => {
  ({ tmp, repo } = initRepo('grain-xcheck-reportrules-'));
  for (const e of PAIRED) wIn(repo, `src/handlers/${e}.ts`, commandSrc(e));
  // a 3-layer module chain, disjoint from src/handlers/, so the architecture section is non-trivial (>1 module node)
  wIn(repo, 'modC/leaf.ts', "export const leaf = () => 'leaf';\n");
  wIn(repo, 'modB/mid.ts', "import { leaf } from '../modC/leaf';\nexport const mid = () => leaf() + 'mid';\n");
  wIn(repo, 'modA/top.ts', "import { mid } from '../modB/mid';\nexport const top = () => mid() + 'top';\n");
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  gitIn(repo, d1, 'add', '-A'); gitIn(repo, d1, 'commit', '-qm', 'base: paired command shapes + module chain');
  assert.equal(grainIn(repo, ['status']).code, 0);

  // poison a fully-conforming role fact (10/10 established, share 1, no deviants) certifying `auto.extends:Command`
  // — same technique as cross-check-agreement.test.mjs / cross-check-check-review-parity.test.mjs, reused rather
  // than re-invented; deliberately no deviant here (this file is about WORDING/COUNT parity, not deviation logic).
  // The role's OWN defining feature (`auto.extends:Command`, matching medoid.feats' `sup:Command`) is a marker
  // TAUTOLOGY (isDefiningFact) — factTiers excludes it from domain/structural/lexical entirely (it only ever shows
  // up as report/rules' "N group-defining marker(s) not listed" note), so a SECOND, non-defining fact
  // (`auto.deco:@Injectable`, maps to `dec:Injectable` — not in this medoid's feats) is poisoned onto the same
  // role/population to get a real, printable domain-conventions line out of `factTiers`.
  const model = loadModel(repo);
  const part = partitionFor(model, 'src/handlers/Order.ts');
  ROLE = part.medoids.length;
  part.medoids.push({ label: 'Command', feats: ['sup:Command'] });
  for (const e of PAIRED) part.assignments[skeyR(`src/handlers/${e}.ts`, { kind: 'type', name: `${e}Command` })] = ROLE;
  const factBase = { cid: `r${ROLE}:type`, kind: 'type', parentExp: null,
    counts: { true: 10 }, srawCounts: { true: 10 }, alphabet: ['true', 'false'],
    raw: 10, sraw: 10, share: 1, bpi: 1, tau: 3, nSurfaces: 1, siblings: [],
    suppressedValue: null, denyEligible: false, exemplars: [], deviantsN: 0, deviants: [], altMarker: null };
  part.facts.push({ ...factBase, pid: 'auto.extends:Command', exp: 'true' }); // the (suppressed) defining marker
  part.facts.push({ ...factBase, pid: 'auto.deco:@Injectable', exp: 'true' }); // the real, printable domain fact
  saveModel(repo, model);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

// ===== fixture soundness =====
test('fixture soundness: the poisoned role fact is a real, non-empty domain convention report can print', () => {
  const { out } = grainIn(repo, ['report']);
  assert.match(out, /@Injectable/, out);
  assert.match(out, /100% of 10 established/, out);
  assert.match(out, /group-defining marker.* not listed/, out); // the OTHER poisoned fact (the role's own defining feature) — suppressed, as designed
});

// ===== INVARIANT 1: the SAME convention's evidentiary text (label + verbalized statement + share/established) is
// byte-identical between report's line and rules' table row, extracted from report's OWN printed output rather
// than hand-duplicated (so this test cannot silently drift from whatever verbalize()/factLabel() actually say) =====
test('report and rules agree, verbatim, on the poisoned convention\'s label + statement + evidence text', () => {
  const reportOut = grainIn(repo, ['report']).out;
  // report's printed convention line (printFact, voice('practiced', ...) — plain text, no marker prefix):
  // "  <label>: <verbalize(...)> — <share>% of <sraw> established[, N deviants]"
  const m = /^ {2}(.+?): (.+?) — (\d+% of \d+ established(?:, \d+ deviants?)?)$/m.exec(reportOut);
  assert.ok(m, `expected a domain-conventions line in report: ${reportOut}`);
  const [, label, statement, evidence] = m;
  const rulesOut = grainIn(repo, ['rules']).out;
  assert.match(rulesOut, /^### Domain conventions$/m, `expected a Domain conventions section in rules:\n${rulesOut}`);
  // rules' table row (row(), same voice('practiced', ...)): "| <label> | <statement> | <evidence> | `<exemplar>` | <notes> |"
  const rowRe = new RegExp('^\\| ' + escapeRe(label) + ' \\| ' + escapeRe(statement) + ' \\| ' + escapeRe(evidence) + ' \\|', 'm');
  assert.match(rulesOut, rowRe, `rules must carry the identical label/statement/evidence report prints (report said "${label}: ${statement} — ${evidence}"):\n${rulesOut}`);
});

// ===== INVARIANT 2: partition header counts (conventions/groups/scopes/files) agree =====
test('report and rules agree on the partition header counts (conventions · groups · scopes · files)', () => {
  const reportOut = grainIn(repo, ['report']).out;
  const m = /^== .+? — (\d+) conventions · (\d+) groups · (\d+) scopes · (\d+) files ==/m.exec(reportOut);
  assert.ok(m, reportOut);
  const rulesOut = grainIn(repo, ['rules']).out;
  const rm = /^(\d+) conventions · (\d+) groups · (\d+) scopes · (\d+) files$/m.exec(rulesOut);
  assert.ok(rm, `expected the identical header line (Markdown, no "== ... ==" wrapper) in rules:\n${rulesOut}`);
  assert.deepEqual(m.slice(1), rm.slice(1), `report header ${JSON.stringify(m.slice(1))} vs rules header ${JSON.stringify(rm.slice(1))}`);
});

// ===== INVARIANT 3: architecture section header counts agree (non-trivial: 4 modules from the fixture's own chain
// plus src/handlers/, not a vacuous "0 modules" both renderers could trivially agree on) =====
test('report and rules agree on the architecture section header counts (modules · dependencies · cycles)', () => {
  const reportOut = grainIn(repo, ['report']).out;
  const m = /^== architecture — (\d+) modules · (\d+) directed dependencies · (\d+) cycle\(s\) ==/m.exec(reportOut);
  assert.ok(m, reportOut);
  assert.ok(+m[1] > 1, `fixture sanity: expected more than 1 module node: ${reportOut}`);
  const rulesOut = grainIn(repo, ['rules']).out;
  const rm = /^(\d+) modules · (\d+) directed dependencies · (\d+) cycle\(s\)$/m.exec(rulesOut);
  assert.ok(rm, `expected the identical header line (Markdown) in rules:\n${rulesOut}`);
  assert.deepEqual(m.slice(1), rm.slice(1), `report architecture header ${JSON.stringify(m.slice(1))} vs rules ${JSON.stringify(rm.slice(1))}`);
});
