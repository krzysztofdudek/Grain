// J5.5 — `== health ==`: report()/rulesMarkdown() render individual conventions and drift, but nothing pulls
// together the repo-wide signals that suggest a maintainer should make a decision. This composes seven fields
// already built by earlier tickets (never reimplemented here): f.cost (J5.1), f.rejected (J5.2), f.agentShare
// (J5.3), check-outcomes.json (J5.4, passed in as `outcomes` since report()/rulesMarkdown() are pure functions of
// `model` and cannot read files), model.changeArchetypes (J4.1), model.waivers (J1.3), and baselineClause's own
// "no movement" case (E4).
//
// model.twins (J3.4) was the EIGHTH such input and is deliberately no longer one — see §044: the twin health row
// measured 0.24 precision over 75 hand-adjudicated rows on three languages (0.04 on Go), so it was removed while
// model.twins, the export schema and `where`'s group card kept it. The absence is pinned below and, in full,
// in tests/twins-not-a-health-row.test.mjs.
//
// Models here are hand-built directly (report-fact-tiers.test.mjs's own pattern) rather than grown through git —
// the upstream construction of every one of these fields is already tested elsewhere; this file only exercises
// how report()/rulesMarkdown() COMPOSE and RENDER fields that are already sitting on the model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { report, rulesMarkdown } from '../engine/core.mjs';

// pkgA carries every anchor a health row needs: a partition-wide fact (cid '_all') for the cost/rejected/agentShare
// rows, and a role-defining fact (cid 'r0:'/'r1:') for the archetype row to resolve a real <path>#<name>. The
// `twins` field below is still built — it is what proves the row's absence is a rendering decision (§044) and not
// a missing input, and the r0:/r1: facts stay for the same reason: the anchor machinery is untouched.
function baseModel() {
  const costFact = { cid: '_all', kind: 'method', pid: 'auto.call:validate', exp: 'true', share: 0.9, sraw: 120, deviantsN: 12,
    exemplars: [{ rel: 'alpha/T0.ts', name: 'run', line: 2, endLine: 4 }],
    deviants: [{ rel: 'alpha/T1.ts', name: 'run', line: 2, obs: 'false' }],
    cost: { k: 11, n: 12, baseK: 13, baseN: 120, bits: 27.12 } };
  const rejectedFact = { cid: '_all', kind: 'type', pid: 'auto.deco:@Handler', exp: 'true', share: 0.95, sraw: 20, deviantsN: 0,
    exemplars: [{ rel: 'src/handlers/H0.ts', name: 'H0', line: 1, endLine: 3 }],
    rejected: [{ v: 'false', tried: 5, reverted: 5 }] };
  const agentFact = { cid: '_all', kind: 'method', pid: 'auto.first1', exp: 'V', share: 0.8, sraw: 30, deviantsN: 2,
    exemplars: [{ rel: 'src/agent/A0.ts', name: 'run', line: 1, endLine: 2 }],
    agentShare: 0.72 };
  const role0Fact = { cid: 'r0:method', kind: 'method', pid: 'auto.deco:@Foo', exp: 'true', share: 1, sraw: 12, deviantsN: 0,
    exemplars: [{ rel: 'src/pkgA/Foo0.ts', name: 'Foo0', line: 1, endLine: 2 }] };
  const role1Fact = { cid: 'r1:method', kind: 'method', pid: 'auto.deco:@Bar', exp: 'true', share: 1, sraw: 9, deviantsN: 0,
    exemplars: [{ rel: 'src/pkgA/Bar0.ts', name: 'Bar0', line: 1, endLine: 2 }] };

  const pkgA = { name: 'pkgA', scopes: 200, medoids: [{ label: 'Foo group', feats: [] }, { label: 'Bar group', feats: [] }],
    files: ['alpha/T0.ts'], templates: [], facts: [costFact, rejectedFact, agentFact, role0Fact, role1Fact] };

  const twins = [{ a: { part: 'pkgA', role: 0, label: 'Foo group' }, b: { part: 'pkgA', role: 1, label: 'Bar group' },
    sim: 0.91, namedDifferently: ['Foo', 'Bar'] }];

  const archetype = { id: 'ca1', label: '«Foo group» + handlers/', n: 20,
    cells: [
      { cell: 'g:pkgA#0', k: 14, share: 0.700, bits: 5.1, certified: false }, // in-band [0.6, 0.89) — must appear
      { cell: 'm:core', k: 19, share: 0.950, bits: 8.2, certified: true },     // certified, clears 0.6 — must NOT appear
      { cell: 'g:pkgA#1', k: 20, share: 1.000, bits: 6.0, certified: true },   // certified anchor for the row's suggestion
    ], exemplars: [['abc123', 'feat: thing', 1]], toks: ['thing'] };

  const waivers = [
    { id: 'w1', path: 'src/pkgA/Foo1.ts', name: 'Foo1', pid: 'auto.deco:@Foo', kind: 'method', line: 3, partition: 'pkgA', found: true, note: '', author: '', createdAt: '' },
    { id: 'w2', path: 'src/pkgA/Foo2.ts', name: 'Foo2', pid: 'auto.deco:@Foo', kind: 'method', line: 3, partition: 'pkgA', found: true, note: '', author: '', createdAt: '' },
    { id: 'w3', path: 'src/pkgA/Foo3.ts', name: 'Foo3', pid: 'auto.deco:@Foo', kind: 'method', line: 3, partition: 'pkgA', found: true, note: '', author: '', createdAt: '' },
    // same pid, DIFFERENT partition — must not be merged into pkgA's group (proves partition + '::' + pid grouping)
    { id: 'w4', path: 'src/pkgB/Foo1.ts', name: 'Foo1', pid: 'auto.deco:@Foo', kind: 'method', line: 3, partition: 'pkgB', found: true, note: '', author: '', createdAt: '' },
    { id: 'w5', path: 'src/pkgB/Foo2.ts', name: 'Foo2', pid: 'auto.deco:@Foo', kind: 'method', line: 3, partition: 'pkgB', found: true, note: '', author: '', createdAt: '' },
  ];

  const deadSteer = { id: 'sd1', found: true, path: 'src/pkgA/Steered.ts', name: 'Steered',
    surfaces: [{ pid: 'auto.deco:@Foo', value: 'true', retires: false, share: 0.5, n: 10, context: 'package pkgA',
      baseline: { share: 0.5, n: 10, context: 'package pkgA', at: '2026-01-01' } }] };

  return { repo: 'test-repo', partitions: [pkgA], cochange: [], agentShare: null,
    twins, changeArchetypes: [archetype], waivers, steers: [deadSteer] };
}

test('(a) red -> green: a fixture with cost + rejected + agentShare + outcomes signals produces a health section with rows and decide suggestions', () => {
  const model = baseModel();
  const outcomes = { acted: 1, ignored: 3, byFact: { 'pkgA::auto.call:validate': 3 } };
  const lines = report(model, { outcomes });
  const text = lines.join('\n');
  const headingIdx = lines.findIndex(l => /^== health — \d+ signal/.test(l));
  assert.notEqual(headingIdx, -1, `expected a health heading: ${text}`);

  assert.match(text, /costs 8\.5× more fixes when deviated from \(11 of 12 vs 13 of 120\)/, text);
  assert.match(text, /→ grain decide steer alpha\/T0\.ts#run --surfaces auto\.call:validate --note "codify/, text);

  assert.match(text, /is not annotated with `@Handler` tried 5×, reverted 5× — a rejection, not an alternative/, text);
  assert.match(text, /→ grain decide steer src\/handlers\/H0\.ts#H0 --surfaces auto\.deco:@Handler/, text);

  assert.match(text, /held mostly by agent-authored code \(72% of recent conformers\)/, text);
  assert.match(text, /→ grain decide steer src\/agent\/A0\.ts#run --surfaces auto\.first1/, text);

  assert.match(text, /keeps ignoring the `auto\.call:validate` warning at alpha\/T1\.ts:2 \(flagged and ignored 3×\)/, text);
  assert.match(text, /→ grain decide waive alpha\/T1\.ts#run --on auto\.call:validate/, text);
});

test('(b) a model with none of the eight signals present renders no health section at all', () => {
  const plain = { cid: '_all', kind: 'method', pid: 'auto.arity', exp: '1', share: 1, sraw: 5, deviantsN: 0,
    exemplars: [{ rel: 'x.ts', name: 'f', line: 1, endLine: 1 }] };
  const model = { repo: 'r', partitions: [{ name: '_root', scopes: 5, medoids: [], files: ['x.ts'], templates: [], facts: [plain] }],
    cochange: [], agentShare: null };
  const lines = report(model);
  assert.doesNotMatch(lines.join('\n'), /== health/, 'no signals must mean no header at all, not an empty one');
});

test('(c) waivers group by partition + pid, not pid alone: two same-pid partitions below threshold never merge into one row', () => {
  const model = baseModel();
  const lines = report(model, {});
  const text = lines.join('\n');
  assert.match(text, /`auto\.deco:@Foo` in package pkgA carries 3 waivers/, text);
  assert.doesNotMatch(text, /carries 5 waivers/, 'pkgA (3) and pkgB (2) must never be summed into one group');
  assert.doesNotMatch(text, /pkgB carries/, 'pkgB alone has only 2 waivers — below the >= 3 floor');
});

test('(d) an archetype cell in [0.6, certification) appears; a certified cell clearing 0.6 does not', () => {
  const model = baseModel();
  const lines = report(model, {});
  const text = lines.join('\n');
  assert.match(text, /usually but not always touches «Foo group» \(14 of 20, 70%\)/, text);
  assert.doesNotMatch(text, /usually but not always touches core\//, 'a certified cell must never appear here, even at 95% share');
});

test('(e) rulesMarkdown renders the same health section as Markdown', () => {
  const model = baseModel();
  const outcomes = { acted: 1, ignored: 3, byFact: { 'pkgA::auto.call:validate': 3 } };
  const md = rulesMarkdown(model, { outcomes }).join('\n');
  assert.match(md, /## Health/, md);
  assert.match(md, /costs 8\.5× more fixes when deviated from/, md);
  assert.match(md, /^- .*costs 8\.5× more fixes when deviated from/m, md);
});

test('(f) check-outcomes.json wiring: present -> ignored row shows; absent -> silently absent, never a crash', () => {
  const model = baseModel();
  const withOutcomes = report(model, { outcomes: { acted: 0, ignored: 3, byFact: { 'pkgA::auto.call:validate': 3 } } }).join('\n');
  assert.match(withOutcomes, /keeps ignoring the `auto\.call:validate` warning/, withOutcomes);

  const withoutOutcomes = report(model, {}).join('\n');
  assert.doesNotMatch(withoutOutcomes, /keeps ignoring/, 'no outcomes file must mean the row is silently absent, not a crash');
});

test('dead-steer rows render with real, resolvable exemplars', () => {
  const model = baseModel();
  const text = report(model, {}).join('\n');
  assert.match(text, /steer sd1 on src\/pkgA\/Steered\.ts#Steered has not moved the needle \(no movement since 2026-01-01: 5 of 10 then, 5 of 10 now\) → grain decide rm sd1/, text);
});

// CONTRACT CHANGE (§044). This test previously asserted the opposite — that a twin pair renders a health row with
// a resolvable `grain decide steer … "duplicate of … unify or document why both exist"`. Measured across
// OpenZeppelin/gin/flask that row was right 18 times in 75 (upper bound: unsure adjudications were scored in the
// tool's favour), and `rules` wrote every one of them into the user's committed CONVENTIONS.md. The model field,
// the export schema and `where`'s one-line group-card observation all survive; only the instruction is gone.
test('(§044) a twin pair renders NO health row, even with both role anchors resolvable', () => {
  const model = baseModel();
  const text = report(model, {}).join('\n');
  assert.doesNotMatch(text, /are structurally the same shape/, text);
  assert.doesNotMatch(text, /unify or document why both exist/, text);
  // the anchors the deleted row used are still here and still resolvable — the change is the rendering, not the data
  assert.ok(model.twins.length === 1 && model.twins[0].namedDifferently, 'the fixture must still carry a twin pair');
  assert.ok(model.partitions[0].facts.some(f => f.cid === 'r0:method' && f.exemplars[0]), 'role anchors must still exist');
  assert.match(text, /== health/, 'the section itself must survive — only signal 5 was removed');
});
