// 003 (B): a scope `checkFile` genuinely has never certified is disclosed — nearest group + score, or "matched no
// group" when nothing clears CFG.minMemb — instead of being judged only by the trivially-satisfied `_all:`
// baseline. (§003 resolution: near-member DETECTION — accusing a new scope of "missing" a group's defining trait —
// was built four ways and measured on three live repos; all four were rejected. Rich feature bags pull the
// newcomer into the COMPLEMENTARY group by the very omission that should flag it (flask r32/r33); thin bags drop
// below CFG.minMemb into `amb`, so only the trivially-satisfied `_all:` baseline governs. Disclosure ships
// instead — informational, never an accusation.)
//
// (A1): `check`'s "conforms to:" line must not credit the READER'S OWN CHANGE with a fact that governs only a
// scope the change never touched — that fact is true of the FILE, not of what this reader just wrote.
//
// (A2): a role fact whose pid IS the feature (3x-weighted in `jacW`) that formed the role group (`isDefiningFact`)
// is a marker tautology — unanimity guaranteed by construction, not a followed convention — and must carry a
// clause saying so wherever it renders under "conforms to:", never suppressed.
//
// FIXTURE NOTE: `induceRoles` does not reliably split a role this small/uniform into its own cluster — confirmed
// directly by `spectrum-role-deviation.test.mjs` on the same corpus shape (0 accepted role-conditioned facts on a
// natural `grain status` run of this fixture). So, following that file's own technique, the one role (a medoid, its
// sticky assignments, and its facts) is poisoned directly onto a real, freshly-mined model. Every scope, predicate,
// and extracted `sup:Command`/`auto.namesuffix` reading below is real, genuinely-parsed TypeScript — only the ROLE
// NUMBER a Command scope belongs to and its medoid/facts are injected, standing in for what a much larger, real
// population would have made `mine()`/`induceRoles` certify on their own (as the field reports this ticket answers
// evidently found).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFile, partitionFor, tokenize, report, rulesMarkdown } from '../engine/core.mjs';

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

// (§010) a bare TS class carrying nothing but two name tokens — {tok:x, tok:y} and no sup/dec/ret — used to hand-
// place a new scope at an exact, computable jacW distance from a synthetic medoid below
const bareSrc = name => `export class ${name} {\n  readonly id: number;\n  constructor(id: number) {\n    this.id = id;\n  }\n}\n`;
// plant a synthetic role directly onto a loaded model's partition — the SAME "poison a real, freshly-mined model"
// technique the top-level fixture above uses (itself borrowed from spectrum-role-deviation.test.mjs), extended to
// plant a role with NO facts at all: §010's flask shape is a real cluster (a real label, or induceRoles' OWN
// 'group' fallback) that certifies zero conventions. Pass `factPid`/`exemplar` to also certify one marker-tautology
// fact on the role (mirroring the top-level fixture's fact1); omit them for a catch-all.
const plantGroup = (part, { label, feats, members, kind = 'type', factPid, exemplar }) => {
  const idx = part.medoids.length; part.medoids.push({ label, feats });
  for (let k = 0; k < members; k++) part.assignments[`synthetic/${label}${idx}#${kind}#m${k}`] = idx;
  if (factPid) part.facts.push({ cid: `r${idx}:${kind}`, kind, pid: factPid, exp: 'true',
    parentExp: null, counts: { true: members }, srawCounts: { true: members }, alphabet: ['true', 'false'],
    raw: members, sraw: members, share: 1, bpi: 1, tau: 3, nSurfaces: 1, siblings: [],
    suppressedValue: null, denyEligible: false, exemplars: exemplar ? [exemplar] : [], deviantsN: 0, deviants: [], altMarker: null });
  return idx;
};
// a real, indexed scope to anchor a synthetic fact's exemplar on (§010-e: the pointer must resolve to real source,
// even though which GROUP claims it is fabricated for the test) — src/handlers/Order.ts line 1 is OrderCommand's
// own declaration line, established by the top-level fixture below
const REAL_EXEMPLAR = { rel: 'src/handlers/Order.ts', line: 1, endLine: 1, name: 'OrderCommand' };

// same paired shape as spectrum-role-deviation.test.mjs: a `*Command` class extending the `Command` marker beside a
// `*Handler` that never extends anything (a different, unrelated role — never assigned into ROLE below)
const commandSrc = (name, extendsCommand = true) => `export class ${name}Command${extendsCommand ? ' extends Command' : ''} {\n  readonly id: number;\n  constructor(id: number) {\n    this.id = id;\n  }\n}\n`;
const handlerSrc = name => `export class ${name}Handler {\n  handle(cmd: ${name}Command): number {\n    return cmd.id;\n  }\n}\n`;
const PAIRED = ['Order', 'Payment', 'Shipment', 'Refund', 'Invoice', 'Cart', 'Customer', 'Product'];

let tmp, repo, ROLE;
before(() => {
  ({ tmp, repo } = initRepo('grain-new-scope-disclosure-'));
  for (const e of PAIRED) wIn(repo, `src/handlers/${e}.ts`, commandSrc(e) + '\n' + handlerSrc(e));
  wIn(repo, 'src/handlers/Rogue.ts', commandSrc('Rogue', false) + '\n' + handlerSrc('Rogue')); // the genuine-deviation regression fixture (test 5)
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  gitIn(repo, d1, 'add', '-A'); gitIn(repo, d1, 'commit', '-qm', 'the disclosure fixture');
  assert.equal(grainIn(repo, ['status']).code, 0);

  const model = loadModel(repo);
  const part = partitionFor(model, 'src/handlers/Order.ts');
  ROLE = part.medoids.length; // a fresh, never-colliding role index
  // a REAL medoid bag: `OrderCommand`'s own feats — tokenize('OrderCommand') -> ['order','command'] (`tok:`, 1x
  // each) plus its `sup:Command` marker (3x, `featW`) — not a hand-picked minimal one.
  part.medoids.push({ label: 'Command', feats: [...tokenize('OrderCommand').map(t => `tok:${t}`), 'sup:Command'] });
  for (const e of PAIRED) { part.assignments[`src/handlers/${e}.ts#type#${e}Command`] = ROLE; part.assignments[`src/handlers/${e}.ts#type#${e}Handler`] = -1; }
  part.assignments['src/handlers/Rogue.ts#type#RogueCommand'] = ROLE;
  part.assignments['src/handlers/Rogue.ts#type#RogueHandler'] = -1;
  // fact1 — the marker tautology (§003-A2): its own pid (`auto.extends:Command`) IS the feature that formed the
  // role (`sup:Command` sits in the medoid bag above), so every certified member holds it BY CONSTRUCTION.
  part.facts.push({ cid: `r${ROLE}:type`, kind: 'type', pid: 'auto.extends:Command', exp: 'true',
    parentExp: null, counts: { true: 8 }, srawCounts: { true: 8 }, alphabet: ['true', 'false'],
    raw: 8, sraw: 8, share: 1, bpi: 1, tau: 3, nSurfaces: 1, siblings: [],
    suppressedValue: null, denyEligible: false, exemplars: [], deviantsN: 0, deviants: [], altMarker: null });
  // fact2 — a REAL, non-tautological role fact on the SAME role: `auto.namesuffix` is not one of the dec:/sup:/
  // ret: marker families `isDefiningFact` tests, so this one must NOT carry the (§003-A2) clause. `exp` matches the
  // actual extracted value (`nameSuffix('OrderCommand')` === 'command', tokenize's last token) so it genuinely
  // conforms — this is not a synthetic mismatch, `OrderCommand` really is named that way.
  part.facts.push({ cid: `r${ROLE}:type`, kind: 'type', pid: 'auto.namesuffix', exp: 'command',
    parentExp: null, counts: { command: 8 }, srawCounts: { command: 8 }, alphabet: ['command'],
    raw: 8, sraw: 8, share: 1, bpi: 1, tau: 3, nSurfaces: 1, siblings: [],
    suppressedValue: null, denyEligible: false, exemplars: [], deviantsN: 0, deviants: [], altMarker: null });
  saveModel(repo, model);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('(B) a scope missing the group\'s defining marker, never seen by the model, is disclosed with its nearest group and score', async () => {
  const model = loadModel(repo);
  // same two name tokens as the medoid ('order','command'), missing `extends Command` — mirrors the field report
  // (`add_url_alias` vs the `add_url_rule` group): the newcomer shares almost everything with the group except the
  // one marker feature. m1 = 2/(2+3) = 0.40 (2 shared 1x tokens over 2 + the medoid's own 3x `sup:Command`) — above
  // CFG.minMemb (0.35), so this must land in the "nearest «group»" branch, not "matched no group".
  const NEW_REL = 'src/handlers/legacy/OrderCommand.ts';
  wIn(repo, NEW_REL, commandSrc('Order', false));
  const r = await checkFile({ model, root: repo, rel: NEW_REL });
  const hit = r.newScopeHits.find(h => h.scope === 'OrderCommand');
  assert.ok(hit, `expected a new-scope disclosure for OrderCommand: ${JSON.stringify(r.newScopeHits)}`);
  assert.match(hit.text, /is new to the index/, hit.text);
  assert.match(hit.text, /«Command»/, hit.text);
  assert.match(hit.text, /9 members/, `9 = 8 PAIRED + Rogue, all assigned ROLE: ${hit.text}`);
  assert.match(hit.text, /requires extends Command/, `groupDesc must name the defining trait: ${hit.text}`);
  assert.match(hit.text, /0\.40/, `expected the live m1 score computed by assignAll: ${hit.text}`);
});

test('(B) a scope the persisted model already knows (sticky assignment) draws no disclosure', async () => {
  const model = loadModel(repo);
  const r = await checkFile({ model, root: repo, rel: 'src/handlers/Order.ts' });
  assert.ok(!r.newScopeHits.some(h => h.scope === 'OrderCommand'), `OrderCommand is a certified member — must not be disclosed as new: ${JSON.stringify(r.newScopeHits)}`);
  assert.ok(!r.newScopeHits.some(h => h.scope === 'OrderHandler'), `OrderHandler carries an explicit sticky -1 — also known, also no disclosure: ${JSON.stringify(r.newScopeHits)}`);
});

test('(A1) a fact governing only an untouched scope is not credited under "conforms to:" for a change that never touched it', () => {
  const rel = 'src/handlers/Payment.ts';
  const orig = readFileSync(join(repo, rel), 'utf8');
  // edit ONLY PaymentHandler's body — PaymentCommand (the sole scope the role-conditioned extends:Command fact
  // governs in this file) is left byte-for-byte identical to HEAD, several lines away from the edit
  const edited = orig.replace('return cmd.id;', 'return cmd.id; // logged');
  assert.notEqual(edited, orig);
  writeFileSync(join(repo, rel), edited);
  try {
    const { out, code, err } = grainIn(repo, ['check', rel]);
    assert.equal(code, 0, err);
    assert.doesNotMatch(out, /extend `Command`/,
      `the extends:Command fact governs only the untouched PaymentCommand scope — it must not read as THIS change conforming to it:\n${out}`);
  } finally { writeFileSync(join(repo, rel), orig); }
});

test('(A2) a marker-tautology fact renders with the "defines this group" clause; a non-tautology role fact does not', () => {
  const { out, code, err } = grainIn(repo, ['check', 'src/handlers/Order.ts']);
  assert.equal(code, 0, err);
  const line = out.split('\n').find(l => l.startsWith('conforms to:'));
  assert.ok(line, `expected a "conforms to:" line:\n${out}`);
  const segs = line.slice('conforms to: '.length).split(' · ');
  const extSeg = segs.find(s => /extend `Command`/.test(s));
  assert.ok(extSeg, `expected the extends:Command fact under conforms to: ${line}`);
  assert.match(extSeg, /defines this group; grain enforces it on members, not on a non-member/,
    `the marker-tautology clause must render where this fact is spoken: ${extSeg}`);
  const sufSeg = segs.find(s => /ending in `command`/.test(s));
  assert.ok(sufSeg, `expected the namesuffix fact under conforms to: ${line}`);
  assert.doesNotMatch(sufSeg, /defines this group/, `a non-tautology role fact must not carry the marker-tautology clause: ${sufSeg}`);

  // the machine-readable verdict threads the same boolean through, per-fact — not just the human sentence
  const j = JSON.parse(grainIn(repo, ['check', 'src/handlers/Order.ts', '--json']).out);
  const extG = j.governed.find(g => g.convention.endsWith('::auto.extends:Command'));
  const sufG = j.governed.find(g => g.convention.endsWith('::auto.namesuffix'));
  assert.ok(extG && sufG, `expected both governed facts in --json: ${JSON.stringify(j.governed)}`);
  assert.equal(extG.defining, true, `--json must mark the marker-tautology fact: ${JSON.stringify(extG)}`);
  assert.equal(sufG.defining, false, `--json must not mark the non-tautology fact: ${JSON.stringify(sufG)}`);
});

// beyond the brief: `factTiers` (shared by `report`/`rulesMarkdown`) filters marker-tautology facts out of the
// domain/structural/lexical tier lists entirely, replacing them with an aggregate `taut` count — a design decision
// this ticket's brief never asked for (it only covers `check`'s "conforms to:" line). Pinning the actual behavior,
// not asserting it is the only correct one: it does NOT silently vanish (a count renders in both surfaces below),
// and a genuinely non-tautological role fact on the very same role is untouched — only the tautology is aggregated.
test('(beyond brief) factTiers aggregates marker-tautology facts out of report/rules tier listings, discloses a count, and leaves other facts alone', () => {
  const model = loadModel(repo);
  const rl = report(model, { top: 50 }).join('\n');
  assert.doesNotMatch(rl, /types here extend `Command`/, `report() must not list the marker-tautology fact as an ordinary "chosen" convention:\n${rl}`);
  assert.match(rl, /1 group-defining marker not listed/, `report() must disclose the withheld count, not go silent:\n${rl}`);
  assert.match(rl, /types here are named ending in `command`/, `report() must still list the non-tautology role fact — only the tautology is aggregated:\n${rl}`);

  const md = rulesMarkdown(model, { top: 50 }).join('\n');
  assert.doesNotMatch(md, /types here extend `Command`/, `rulesMarkdown() must not individually list the tautology either:\n${md}`);
  assert.match(md, /1 group-defining marker not listed/, `rulesMarkdown() must carry the same disclosure:\n${md}`);
  assert.match(md, /types here are named ending in `command`/, `rulesMarkdown() must still list the non-tautology role fact:\n${md}`);
});

test('(regression) a genuine deviation in an existing role-conditioned scope still fires exactly as before', async () => {
  const model = loadModel(repo);
  const r = await checkFile({ model, root: repo, rel: 'src/handlers/Rogue.ts' });
  const dev = r.msgs.find(m => m.pid === 'auto.extends:Command' && m.scope === 'RogueCommand');
  assert.ok(dev, `RogueCommand is assigned the Command role and does not extend Command — must still be flagged: ${JSON.stringify(r.msgs)}`);
});

// ===== §010: delivery fixes on top of the disclosure above (three field-testers judged the CONTENT right, the
// DELIVERY wrong — see .temp/issues/010-new-scope-disclosure-delivery/issue.md) =====

// the flask shape, reproduced exactly: a marker splits a population into a decorated ("certifying") group and an
// unlabelled undecorated ("catch-all") one, and the catch-all is NEARER to a new scope missing the marker than the
// certifying group is. jacW arithmetic (weighted Jaccard, dec:/sup:/ret: at 3x, tok: at 1x):
//   probe feats = {tok:acct, tok:thing} (weight 2)
//   catch-all medoid = {tok:acct} (weight 1)          -> i=1, u=2        -> jacW = 0.50
//   cert     medoid = {tok:acct, sup:AcctBase} (w 4)   -> i=1, u=2+3=5    -> jacW = 0.20
// catch-all (0.50) is genuinely nearer than cert (0.20); the catch-all's own label is deliberately the literal
// string 'group' — induceRoles' OWN fallback for "no feature reached majority share", never mined data — the exact
// case the ticket says must never print as a name.
const withDPositive = () => { const model = loadModel(repo); const part = partitionFor(model, 'src/handlers/Order.ts');
  const catchIdx = plantGroup(part, { label: 'group', feats: ['tok:acct'], members: 11 });
  const certIdx = plantGroup(part, { label: 'AcctBase', feats: ['tok:acct', 'sup:AcctBase'], members: 6,
    factPid: 'auto.extends:AcctBase', exemplar: REAL_EXEMPLAR });
  return { model, part, catchIdx, certIdx }; };

test('(§010-d) the nearest group certifies nothing, the next one does — the line names the CERTIFYING group and its requirement, never the bare «group» placeholder', async () => {
  const { model } = withDPositive();
  const NEW_REL = 'src/handlers/newscope/AcctThing.ts';
  wIn(repo, NEW_REL, bareSrc('AcctThing'));
  const r = await checkFile({ model, root: repo, rel: NEW_REL });
  const hit = r.newScopeHits.find(h => h.scope === 'AcctThing');
  assert.ok(hit, `expected a disclosure for AcctThing: ${JSON.stringify(r.newScopeHits)}`);
  assert.match(hit.text, /is new to the index/, hit.text);
  // the CERTIFYING group is named, with its requirement — this is what a reader can act on
  assert.match(hit.text, /«AcctBase»/, `must name the certifying group: ${hit.text}`);
  assert.match(hit.text, /requires extends AcctBase/, `must state the requirement: ${hit.text}`);
  assert.match(hit.text, /6 members/, `AcctBase has 6 planted members: ${hit.text}`);
  assert.match(hit.text, /0\.20/, `the live score to the certifying group must still be reported honestly: ${hit.text}`);
  // the raw nearest score is STILL reported (never hidden) — just not foregrounded, since it certifies nothing
  assert.match(hit.text, /0\.50/, `the genuinely-nearest score must still be disclosed honestly: ${hit.text}`);
  assert.match(hit.text, /11 members/, `the catch-all's 11 planted members must still be disclosed: ${hit.text}`);
  // the bug this pins: induceRoles' 'group' fallback must never render as though it were a real name
  assert.doesNotMatch(hit.text, /«group»/, `the literal 'group' fallback must never render as a name: ${hit.text}`);
});

test('(§010-e) the exemplar pointer names a real file:line, resolving to a real member of the named group', async () => {
  const { model } = withDPositive();
  const NEW_REL = 'src/handlers/newscope/AcctThing.ts';
  wIn(repo, NEW_REL, bareSrc('AcctThing'));
  const r = await checkFile({ model, root: repo, rel: NEW_REL });
  const hit = r.newScopeHits.find(h => h.scope === 'AcctThing');
  assert.ok(hit, `expected a disclosure for AcctThing: ${JSON.stringify(r.newScopeHits)}`);
  assert.match(hit.text, /See: src\/handlers\/Order\.ts:1 `OrderCommand`/, `expected the exemplar pointer, reusing roleExemplar/the See: line: ${hit.text}`);
  // it resolves to a REAL member: the named file genuinely carries that name at that line
  const src = readFileSync(join(repo, 'src', 'handlers', 'Order.ts'), 'utf8').split('\n');
  assert.match(src[0], /class OrderCommand\b/, `the pointer must resolve to real source, not a fabricated location: ${src[0]}`);
});

test('(§010-d negative) no nearby group certifies anything — an honest "no group certifies" line, still never a bare «group»', async () => {
  const model = loadModel(repo); const part = partitionFor(model, 'src/handlers/Order.ts');
  // both neighbours certify zero conventions — one bears the literal 'group' fallback, the other a real (but
  // uncertified) label, proving a real label alone does not get mistaken for "certifies something"
  plantGroup(part, { label: 'group', feats: ['tok:wgt'], members: 11 });
  plantGroup(part, { label: 'Uncert2', feats: ['tok:wgt', 'dec:extra'], members: 4 });
  const NEW_REL = 'src/handlers/newscope/WgtThing.ts';
  wIn(repo, NEW_REL, bareSrc('WgtThing'));
  const r = await checkFile({ model, root: repo, rel: NEW_REL });
  const hit = r.newScopeHits.find(h => h.scope === 'WgtThing');
  assert.ok(hit, `expected a disclosure for WgtThing: ${JSON.stringify(r.newScopeHits)}`);
  assert.match(hit.text, /is new to the index/, hit.text);
  assert.match(hit.text, /no nearby group certifies/, `expected an honest "nothing nearby certifies" statement: ${hit.text}`);
  assert.match(hit.text, /an unlabelled cluster/, `the 'group' fallback must render as an honest unlabelled cluster, not a name: ${hit.text}`);
  assert.match(hit.text, /«Uncert2»/, `a real (if uncertified) label may still be named: ${hit.text}`);
  assert.doesNotMatch(hit.text, /«group»/, `the literal 'group' fallback must never render as a name: ${hit.text}`);
  // nothing certifies nearby => no exemplar to anchor on
  assert.doesNotMatch(hit.text, /\n {2}See:/, `no certifying neighbour means no exemplar pointer to offer: ${hit.text}`);
});

test('(§010-a) a new file with several new scopes in ONE group collapses to a single disclosure, with a count — not one per scope', async () => {
  const model = loadModel(repo); const part = partitionFor(model, 'src/handlers/Order.ts');
  plantGroup(part, { label: 'group', feats: ['tok:zork'], members: 11 });
  plantGroup(part, { label: 'ZorkBase', feats: ['tok:zork', 'sup:ZorkBase'], members: 6,
    factPid: 'auto.extends:ZorkBase', exemplar: REAL_EXEMPLAR });
  const NAMES = ['AlphaZork', 'BetaZork', 'GammaZork', 'DeltaZork', 'EpsilonZork']; // 5 — one authoring decision
  const NEW_REL = 'src/handlers/newscope/Zorks.ts';
  wIn(repo, NEW_REL, NAMES.map(bareSrc).join('\n'));
  const r = await checkFile({ model, root: repo, rel: NEW_REL });
  assert.equal(r.newScopeHits.length, 1, `5 new scopes in one group must collapse to ONE disclosure, not one per scope: ${JSON.stringify(r.newScopeHits)}`);
  const hit = r.newScopeHits[0];
  assert.equal(hit.count, 5, `the collapsed hit must carry the covered-scope count: ${JSON.stringify(hit)}`);
  assert.match(hit.text, /are new to the index/, `plural verb for a multi-scope disclosure: ${hit.text}`);
  assert.match(hit.text, /and 2 more/, `only the first 3 are named, the rest fold into the house "+N more" idiom: ${hit.text}`);
  assert.match(hit.text, /«ZorkBase»/, hit.text);
});

// (§010 d+a compound, tester-verified reproduction) the flask retest that adds THREE new setup-style methods in
// ONE edit hit both bugs at once: all three printed the near-identical paragraph back to back, and in that repo's
// actual data BOTH neighbours — nearest and the one that certifies — happened to carry induceRoles' bare 'group'
// fallback (no feature reached majority share on either side). Proves the fixes compose: dedup still collapses to
// one line even when naming has nothing to work with, and the actionable requirement still surfaces even though
// the certifying group itself has no real label to print.
test('(§010 d+a compound) three new scopes in one edit, BOTH neighbours unlabelled — still one line, still never «group», still names the requirement', async () => {
  const model = loadModel(repo); const part = partitionFor(model, 'src/handlers/Order.ts');
  plantGroup(part, { label: 'group', feats: ['tok:zap'], members: 11 }); // catch-all: no label, no facts
  plantGroup(part, { label: 'group', feats: ['tok:zap', 'dec:setup'], members: 12, // certifies, but ALSO no label
    factPid: 'auto.deco:@setup', exemplar: REAL_EXEMPLAR });
  const NAMES = ['AlphaZap', 'BetaZap', 'GammaZap']; // one "add a family of registration methods" decision
  const NEW_REL = 'src/handlers/newscope/Zaps.ts';
  wIn(repo, NEW_REL, NAMES.map(bareSrc).join('\n'));
  const r = await checkFile({ model, root: repo, rel: NEW_REL });
  assert.equal(r.newScopeHits.length, 1, `one authoring decision must collapse to ONE disclosure, even with nothing to name: ${JSON.stringify(r.newScopeHits)}`);
  const hit = r.newScopeHits[0];
  assert.equal(hit.count, 3, `the collapsed hit must carry the covered-scope count: ${JSON.stringify(hit)}`);
  assert.doesNotMatch(hit.text, /«group»/, `neither neighbour has a real label — the literal fallback must still never render as a name: ${hit.text}`);
  assert.match(hit.text, /an unlabelled cluster \(11 members\)/, `the nearest (non-certifying) neighbour, honestly unlabelled: ${hit.text}`);
  assert.match(hit.text, /an unlabelled cluster \(12 members, requires @setup\)/, `the certifying neighbour has no real label either, but its requirement still surfaces: ${hit.text}`);
  assert.match(hit.text, /See: src\/handlers\/Order\.ts:1 `OrderCommand`/, `an exemplar is still offered — the group need not be NAMED to be pointed at: ${hit.text}`);
});

test('(§010-c) the check headline qualifies "0 deviations" in place when a new-scope disclosure is pending, and is byte-identical when nothing is pending', () => {
  // no pending disclosure at all: the headline must read exactly as it always has
  const clean = grainIn(repo, ['check', 'src/handlers/Payment.ts']).out;
  const cleanHeadline = clean.split('\n').find(l => l.startsWith('check '));
  assert.match(cleanHeadline, /governed by \d+ convention\(s\) · \d+ deviation\(s\) in your change, \d+ pre-existing/, `byte-identical to the pre-§010 wording: ${cleanHeadline}`);
  assert.doesNotMatch(cleanHeadline, /known deviation|unclassified scope/, `no pending disclosure must never introduce the new wording: ${cleanHeadline}`);

  // a genuinely new, never-committed file with one new scope missing the group's marker (reuses the persisted
  // Command role from the top-level fixture — real end-to-end CLI path, not the in-process checkFile() calls above)
  const NEW_REL = 'src/handlers/legacy2/OrderCommand.ts';
  wIn(repo, NEW_REL, commandSrc('Order', false));
  try {
    const out = grainIn(repo, ['check', NEW_REL]).out;
    const headline = out.split('\n').find(l => l.startsWith('check '));
    assert.match(headline, /\d+ known deviation\(s\) in your change, \d+ pre-existing, 1 unclassified scope\(s\)/,
      `the pending disclosure must qualify the headline's own deviation count IN PLACE, not only in lines below it: ${headline}`);
  } finally { rmSync(join(repo, NEW_REL)); }
});
