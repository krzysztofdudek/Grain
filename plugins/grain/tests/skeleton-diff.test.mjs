// J5.8 — structural shape diff in `check` (H11). A role group's profile already carries the anti-unified
// template of its members (`profileOf`), but only as the NON-ENUMERABLE `_tpl` (J3.4) — deliberately, because
// `part.profiles[r]` is published verbatim by `export.mjs` and written into `.grain/cache/model.json` by
// `JSON.stringify`, which skips non-enumerable own properties. `checkFile` reads the model back FROM that cache
// file, so `_tpl` is absent by construction there and no amount of in-memory wiring can change it.
//
// The finalized mechanism therefore persists a DERIVED, bounded field instead of the raw tree: `req` — the
// occurrence counts of the template's LITERAL (non-hole) signatures, capped at 40 entries, an ordinary enumerable
// profile field in the same register as `skel`/`perInstance`/`slots`. `_tpl` stays exactly as it was.
//
// Soundness: every literal node of the anti-unified template maps injectively into every member (`skAu` joins
// children positionally at equal arity, else by order-preserving LCS pairing via `skAlign`; holes are the only
// non-injective case and are excluded from the count by construction). So `count(sig in template) <= count(sig in
// EVERY member)`, and a candidate whose own count for `sig` is LOWER is provably missing structure all `n`
// certified members carry. The `n of N` in the message is `N of N` BY CONSTRUCTION — not a counted majority.
//
// FIXTURE NUMBERS (the gates this must clear, all measured on this tree, not assumed):
//   · `groupPartitions`: `src/handlers` holds 103 scopes (>= 100) and is its own partition; `src/fillers` holds
//     49 and survives as the single small package's own bucket (>= 30). The 12 `run`-method handler classes alone
//     land at 85 scopes post-§075 (that fix deduped a catch/finally clause claimed by both its method AND that
//     method's enclosing class down to one scope each, dropping this directory's count below the 100 floor) — 6
//     `SupportNService` filler files, shaped like `src/fillers`' own and clustering into no role of their own, sit
//     alongside them purely to keep `src/handlers` above the floor without touching the 12-member `run` group.
//   · `profileOf`: the `run` group has n = 12 members (>= 4) and `shared` = 69 (>= 6).
//   · Per the `induceRoles` gotcha behind `impl-J5-7`'s fixture: the clustering signal is the IDENTICAL, REPEATED
//     method signature `async run(cmd: Command): Promise<void>` across all 12 — not a shared decorator plus a
//     unique per-instance class name, which actively resists merging.
//   · Every member's `run` body is `try/catch` x3 + `try/finally` x1, giving template counts try_statement = 4,
//     catch_clause = 3, finally_clause = 1. The candidates below replace whole `try` statements with a
//     STRUCTURE-PRESERVING `if/else` (same statement_block / call_expression / await_expression counts), so the
//     ONLY shortfalls are the try/catch/finally signatures — which is what makes the tie-break unambiguous.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFile, profileOf, kt } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const wIn = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grainIn = (repo, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const modelIn = repo => { grainIn(repo, ['status']); return JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8')); };
const initRepo = name => { const tmp = mkdtempSync(join(tmpdir(), name)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, {}, 'init', '-q', '-b', 'main'); gitIn(repo, {}, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };

const TRYC = n => `    try {\n      await ${n}(cmd);\n    } catch {\n      report();\n    }\n`;
const TRYF = n => `    try {\n      await ${n}(cmd);\n    } finally {\n      report();\n    }\n`;
const IFEL = n => `    if (ready) {\n      await ${n}(cmd);\n    } else {\n      report();\n    }\n`;
const handler = (cls, inner) => `export class ${cls} {\n  async run(cmd: Command): Promise<void> {\n${inner}  }\n}\n`;
const GROUP_BODY = TRYC('save') + TRYC('flush') + TRYC('close') + TRYF('done');
const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima'];
const CAND = 'src/handlers/mike.handler.ts';
// the three candidates, all named the same so role assignment cannot differ between them for a name reason
const conformingSrc = handler('MikeHandler', GROUP_BODY);
const oneShortSrc = handler('MikeHandler', IFEL('save') + TRYC('flush') + TRYC('close') + TRYF('done'));
const allShortSrc = handler('MikeHandler', IFEL('save') + IFEL('flush') + IFEL('close') + IFEL('done'));

let tmp, repo, model, profile;
before(() => {
  ({ tmp, repo } = initRepo('grain-skeleton-diff-'));
  NAMES.forEach(n => wIn(repo, `src/handlers/${n.toLowerCase()}.handler.ts`, handler(`${n}Handler`, GROUP_BODY)));
  // §075: the 12 `run`-method handlers alone land at 85 scopes now that a catch/finally clause is claimed by its
  // NEAREST enclosing scope only (previously double-counted under both the method and its enclosing class) — 6
  // filler files, shaped like `src/fillers`' own and clustering into no role of their own, keep this directory
  // above `groupPartitions`' 100-scope floor without touching the 12-member `run` group's n/shared/req numbers.
  for (let i = 1; i <= 6; i++) wIn(repo, `src/handlers/support${i}.ts`, `export class Support${i}Service {\n  loadRecord(id: number): Record {\n    return this.store.fetch(id);\n  }\n}\n`);
  for (let i = 1; i <= 16; i++) wIn(repo, `src/fillers/filler${i}.ts`, `export class Filler${i}Service {\n  loadRecord(id: number): Record {\n    return this.store.fetch(id);\n  }\n}\n`);
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  gitIn(repo, d1, 'add', '-A'); gitIn(repo, d1, 'commit', '-qm', 'the shape-diff fixture');
  model = modelIn(repo);
  const part = model.partitions.find(p => p.name === 'src/handlers');
  assert.ok(part, `the handlers partition must exist: ${model.partitions.map(p => p.name).join(', ')}`);
  assert.equal(part.scopes, 103, 'groupPartitions keeps src/handlers as its own partition on this scope count');
  const entry = Object.entries(part.profiles || {}).find(([, pf]) => pf.n === 12);
  assert.ok(entry, `a 12-member role profile must exist: ${JSON.stringify(Object.entries(part.profiles || {}).map(([r, pf]) => [r, pf.n]))}`);
  profile = entry[1];
  assert.equal(profile.shared, 69, 'the run-group template clears profileOf\'s shared >= 6 floor with room to spare');
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

const shapeMsgs = r => r.msgs.filter(m => m.pid.startsWith('auto.shape:'));
const checkCand = src => checkFile({ model, root: repo, rel: CAND, content: src });
// the KT estimator every other deviation in checkFile uses, on the degenerate all-true population: all `pf.n`
// certified members carry the signature (share 1.0 by construction), so the candidate is the one exception
const EXPECTED_DELTA = +(-Math.log2(kt({ true: 12, false: 0 }, 2, 'false', 12))).toFixed(2);

test('J5.8: the role profile persists `req` — literal-signature occurrence counts of the group template', () => {
  assert.ok(profile.req, `profile carries req: ${JSON.stringify(Object.keys(profile))}`);
  assert.equal(profile.req.try_statement, 4, JSON.stringify(profile.req));
  assert.equal(profile.req.catch_clause, 3, JSON.stringify(profile.req));
  assert.equal(profile.req.finally_clause, 1, JSON.stringify(profile.req));
  assert.equal(profile.req.statement_block, 9, JSON.stringify(profile.req));
  assert.ok(Object.keys(profile.req).length <= 40, `req is capped at 40 entries, got ${Object.keys(profile.req).length}`);
  // no hole marker ever enters the counts — `skCount` treats `?`/`?*` as 0 and `sigCounts` mirrors it exactly
  assert.ok(!Object.keys(profile.req).some(k => k.startsWith('?')), JSON.stringify(Object.keys(profile.req)));
  // the raw tree stays off the enumerable surface: this profile came back through JSON, so a leak would show here
  assert.ok(!('_tpl' in profile), 'the raw anti-unified tree must never reach the persisted model');
  assert.ok(!('tpl' in profile), 'no second raw-tree field under any name');
});

test('J5.8: `req` survives a JSON round-trip with identical counts (the .grain/cache/model.json path)', () => {
  // model.json above IS already one round-trip; this pins the property at the unit level, where a regression to a
  // non-enumerable `_tpl`-style field would be caught before it ever reaches a fixture
  const sk = ['method_definition', 'id:run', ['statement_block', ['try_statement', 'statement_block', 'catch_clause'], ['try_statement', 'statement_block', 'catch_clause']]];
  const pf = profileOf([sk, sk, sk, sk]);
  assert.ok(pf && pf.req, `four identical skeletons give a profile with req: ${JSON.stringify(pf)}`);
  assert.equal(pf.req.try_statement, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(pf)).req, pf.req);
  assert.ok(!('_tpl' in JSON.parse(JSON.stringify(pf))), '_tpl stays non-enumerable and out of the serialized form');
});

test('J5.8: a candidate short one `try` statement gets exactly one shape deviation', async () => {
  const r = await checkCand(oneShortSrc);
  assert.equal(r.partition, 'src/handlers', r.reason || '');
  const hits = shapeMsgs(r);
  assert.equal(hits.length, 1, `exactly one shape deviation per file's worth of scopes here: ${JSON.stringify(r.msgs.map(m => m.pid + '@' + m.scope))}`);
  const [m] = hits;
  assert.equal(m.pid, 'auto.shape:try_statement');
  assert.equal(m.scope, 'run');
  assert.equal(m.kind, 'method');
  assert.equal(m.delta, EXPECTED_DELTA);
  assert.equal(m.delta, 4.7, 'log2(2 * (12 + 1)) = log2(26) = 4.70 bits');
  assert.match(m.text, /try_statement/);
  assert.match(m.text, /12\/12 established methods conform/);
  assert.match(m.text, /at least 4 times, yours has 3/);
  // groupDeviations re-cuts every message on its `  N/M established …. Your <kind> `name` (line L) <phrase>.`
  // second line; without one it renders a bare "  . Your …". This message carries it.
  assert.match(m.text.split('\n')[1], /^ {2}\d+\/\d+ established .* conform\. Your method `run` \(line \d+\) .*\.$/);
  // `check`'s pre-existing summary re-derives a phrase through `verbalize`, which has no `auto.shape:` row and
  // would print the raw pid — the message carries its own phrase for that one call site instead
  assert.equal(m.summary, 'methods all carry `try_statement` (4×)');
});

test('J5.8: a candidate that carries the whole shape gets no shape deviation', async () => {
  const r = await checkCand(conformingSrc);
  assert.deepEqual(shapeMsgs(r).map(m => m.pid + '@' + m.scope), []);
});

test('J5.8: two missing signatures still yield ONE message — the one with the higher `req` count', async () => {
  // this candidate is short on try_statement (4), catch_clause (3) AND finally_clause (1); the cap is one
  // deviation per scope and the tie-break is highest req count first, then signature ascending
  const r = await checkCand(allShortSrc);
  const hits = shapeMsgs(r);
  assert.equal(hits.length, 1, JSON.stringify(hits.map(m => m.pid + '@' + m.scope)));
  assert.equal(hits[0].pid, 'auto.shape:try_statement', 'try_statement (4) outranks catch_clause (3) and finally_clause (1)');
  assert.match(hits[0].text, /at least 4 times, yours has 0/);
});

test('J5.8: `check` prints the shape deviation for a new candidate member', () => {
  wIn(repo, CAND, oneShortSrc);
  try {
    const c = grainIn(repo, ['check', CAND]);
    assert.equal(c.code, 0, c.out + c.err);
    assert.match(c.out, /try_statement/);
    assert.match(c.out, /preference gap 4\.7 bits/);
  } finally { unlinkSync(join(repo, CAND)); }
});

test('J5.8: `grain export` carries `req` on the group profile (additive, no export.mjs change)', () => {
  const dump = JSON.parse(grainIn(repo, ['export', '--no-anchors']).out);
  const part = dump.partitions.find(p => p.name === 'src/handlers');
  const g = part.groups.find(x => x.profile && x.profile.n === 12);
  assert.ok(g, `the 12-member group is in the export: ${JSON.stringify(part.groups.map(x => [x.id, x.profile && x.profile.n]))}`);
  assert.equal(g.profile.req.try_statement, 4);
  assert.equal(g.profile.req.catch_clause, 3);
});

test('J5.8: profileOf\'s existing floors are untouched — below them there is no profile, hence no `req`', () => {
  const sk = ['method_definition', 'id:run', ['statement_block', ['try_statement', 'statement_block', 'catch_clause'], ['try_statement', 'statement_block', 'catch_clause']]];
  assert.equal(profileOf([sk, sk, sk]), null, 'fewer than 4 members: no profile at all');
  const thin = ['statement_block', 'return_statement'];       // skCount = 2, far under the shared >= 6 floor
  assert.equal(profileOf([thin, thin, thin, thin]), null, 'a template thinner than 6 nodes: no profile at all');
});
