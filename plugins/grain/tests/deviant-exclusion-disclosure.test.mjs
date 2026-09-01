// §047 — "A deviant is pushed out of the group that would have judged it — by the very feature it deviates on."
// Role clustering assigns membership by feature similarity, INCLUDING the feature under test (a decorator, a
// heritage clause, a return type — weighted 3x in `jacW`, engine/core.mjs). A member that cleanly omits the
// convention it should be judged against therefore scores lower similarity to its own group, and can fall below
// `CFG.minMemb` (the group floor) — landing it in `checkFile`'s below-floor branch, which used to say only
// "matched no group (best X, floor Y)" and nothing else. Measured general across 5 languages (Opus, 047 log);
// leave-one-feature-out reassignment was built, measured (+4 genuine catches vs +42 false findings on untouched
// code, 0 genuine among them) and REJECTED. DIRECTOR-APPROVED FIX (disclosure only, no threshold, no floor
// change): name the nearest certifying group and its requirement in that exact branch — the engine already
// computes `sc.best`/`sc.second` (assignAll) and `certN`/`groupDesc` (checkFile) for the sibling branches just
// below; the below-floor branch is extended to read them too.
//
// FIXTURE TECHNIQUE: `applyVocab` (core.mjs) only ever puts an `auto.deco:`/`auto.extends:` predicate on ANY
// scope once the marker itself clears the corpus-wide vocabulary support floor (`CFG`'s `SUP.deco` = 8 real
// occurrences of that exact decorator name, `SUP.ext` = 4 of that exact heritage name — engine/config.mjs) — below
// that floor the predicate key is simply absent and no deviation of any kind, floor or no floor, is even
// evaluated. So every fixture below commits REAL, genuinely-parsed source establishing the marker well past that
// floor. `induceRoles` is not reliable at carving a role this uniform out of a single-purpose fixture on its own
// (the same "poison a real, freshly-mined model" note every sibling test file carries), so the ONE role a much
// larger real population would have certified (per the 047 log's actual field measurements) is planted directly:
// one medoid whose only feature is the marker itself (weight 3), and one certifying fact. The planted OMISSION
// scope is real, genuinely-parsed source in its own grammar, deliberately named and typed with NO token or
// return-type overlap with either the established members or the medoid, so its similarity to every medoid in the
// partition is an exact, deterministic 0.00 — comfortably under `CFG.minMemb` (0.35).
//
// Each language runs in its OWN repo: sharing one repo across languages let same-named filler scopes (`noop0`,
// `void`) accidentally cluster across grammars and made a later language's disclosure name an earlier language's
// group — isolation removes that cross-contamination entirely, matching how a real single-language repo behaves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFile, partitionFor } from '../engine/core.mjs';
import { CFG } from '../engine/config.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const wIn = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grainIn = (repo, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const initRepo = name => { const tmp = mkdtempSync(join(tmpdir(), name)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, {}, 'init', '-q', '-b', 'main'); gitIn(repo, {}, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };
const modelPathOf = repo => join(repo, '.grain', 'cache', 'model.json');
const loadModel = repo => JSON.parse(readFileSync(modelPathOf(repo), 'utf8'));
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pad = (n, one) => Array.from({ length: n }, (_, i) => one(i)).join('');
const skey = (rel, kind, name) => `${rel}#${kind}#${name}`;

const SOL_H = '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\n';

// One config per measured language (047 log). `established` is REAL, committed source clearing the vocab floor
// (>= 8 real decorator occurrences / >= 4 real heritage occurrences, engine/config.mjs SUP) — `memberRel`/
// `memberKeys` name the scopes it certifies below-the-floor group over. `newRel`/`newSrc` is the planted omission:
// real source, never committed, sharing no name token or return type with anything above.
const LANGS = [
  {
    id: 'java', ext: '.java', dir: 'java',
    estRel: 'java/Suite.java',
    estSrc: `class Suite {\n${pad(30, i => `  @Test\n  void zzCheck${i}() {\n  }\n`)}}\n`,
    memberKeys: Array.from({ length: 30 }, (_, i) => skey('java/Suite.java', 'method', `zzCheck${i}`)),
    newRel: 'java/Extra.java',
    newSrc: 'class Extra {\n  boolean qqRegisterFlow() {\n    return true;\n  }\n}\n',
    kind: 'method', name: 'qqRegisterFlow',
    marker: 'dec:Test', pid: 'auto.deco:@Test', label: 'Test', reqPhrase: 'requires @Test',
  },
  {
    id: 'python', ext: '.py', dir: 'python',
    estRel: 'python/views.py',
    estSrc: pad(15, i => `class ZoneView${i}(MethodView):\n    def get(self):\n        return None\n\n    def post(self):\n        return None\n\n`),
    memberKeys: Array.from({ length: 15 }, (_, i) => skey('python/views.py', 'type', `ZoneView${i}`)),
    newRel: 'python/other_views.py',
    newSrc: 'class WidgetPanel:\n    def head(self):\n        return None\n',
    kind: 'type', name: 'WidgetPanel',
    marker: 'sup:MethodView', pid: 'auto.extends:MethodView', label: 'MethodView', reqPhrase: 'requires extends MethodView',
  },
  {
    id: 'solidity', ext: '.sol', dir: 'solidity',
    estRel: 'solidity/Guarded.sol',
    estSrc: SOL_H + `contract Guarded {\n${pad(30, i => `    function zzGuard${i}() public onlyOwner {\n    }\n`)}}\n`,
    memberKeys: Array.from({ length: 30 }, (_, i) => skey('solidity/Guarded.sol', 'method', `zzGuard${i}`)),
    newRel: 'solidity/Extra.sol',
    newSrc: SOL_H + 'contract Extra {\n    function qqEmergencyTransfer() public {\n    }\n}\n',
    kind: 'method', name: 'qqEmergencyTransfer',
    marker: 'dec:onlyOwner', pid: 'auto.deco:@onlyOwner', label: 'OnlyOwner', reqPhrase: 'requires @onlyOwner',
  },
  {
    id: 'csharp', ext: '.cs', dir: 'csharp',
    estRel: 'csharp/Handlers.cs',
    estSrc: pad(10, i => `public class ZoneHandler${i} : IRequestHandler\n{\n    public int Run() => 0;\n    public int RunAgain() => 0;\n}\n`),
    memberKeys: Array.from({ length: 10 }, (_, i) => skey('csharp/Handlers.cs', 'type', `ZoneHandler${i}`)),
    newRel: 'csharp/Extra.cs',
    newSrc: 'public class WidgetProcessor\n{\n    public int Handle(int id) => id;\n}\n',
    kind: 'type', name: 'WidgetProcessor',
    marker: 'sup:IRequestHandler', pid: 'auto.extends:IRequestHandler', label: 'RequestHandler', reqPhrase: 'requires extends IRequestHandler',
  },
  {
    id: 'typescript', ext: '.ts', dir: 'typescript',
    estRel: 'typescript/injected.ts',
    estSrc: `export class ZInjSuite {\n${pad(30, i => `  @Inject()\n  zzWire${i}() {\n  }\n`)}}\n`,
    memberKeys: Array.from({ length: 30 }, (_, i) => skey('typescript/injected.ts', 'method', `zzWire${i}`)),
    newRel: 'typescript/other.ts',
    newSrc: 'export class WNotify {\n  qqNotify() {\n  }\n}\n',
    kind: 'method', name: 'qqNotify',
    marker: 'dec:Inject', pid: 'auto.deco:@Inject', label: 'Inject', reqPhrase: 'requires @Inject',
  },
];

for (const cfg of LANGS) {
  test(`(047 ${cfg.id}) a planted omission that scores below the group floor still discloses the nearest certifying group and its requirement`, async () => {
    const { tmp, repo } = initRepo(`grain-047-${cfg.id}-`);
    try {
      wIn(repo, cfg.estRel, cfg.estSrc);
      const d1 = dateEnv('2026-01-10T12:00:00Z');
      gitIn(repo, d1, 'add', '-A'); gitIn(repo, d1, 'commit', '-qm', 'establishes the convention, real source');
      const st = grainIn(repo, ['status']);
      assert.equal(st.code, 0, st.err);
      const model = loadModel(repo);
      const part = partitionFor(model, cfg.newRel);
      assert.ok(part, `no partition covers ${cfg.newRel}`);
      // `induceRoles` naturally clusters the established population too (30 near-identical members sharing the
      // marker DO form a real, tight role, exactly the mechanism under test) — but a second, independently-pushed
      // medoid sharing only the marker feature is then a near-duplicate of it (jacW >= 0.6, since the marker alone
      // is 3 of the real medoid's ~5 total feature weight) and gets EXCLUDED from ever being "second" by
      // assignAll's own clone guard, hiding the very group this test needs to see. Clearing medoids/assignments
      // first removes every real (uncertified) competitor so the one certifying group planted below is the only
      // one in the partition — deterministic, and unrelated to what real clustering does or doesn't do on its own.
      part.medoids = [];
      part.assignments = {};
      const ROLE = 0;
      // the medoid's ONLY feature is the marker itself (weight 3) — the planted candidate below shares no name
      // token or return type with it, or with any established member, so it scores an exact 0.00 against it and
      // every other medoid in the partition
      part.medoids.push({ label: cfg.label, feats: [cfg.marker] });
      for (const k of cfg.memberKeys) part.assignments[k] = ROLE;
      part.facts.push({
        // bpi: 5.63 — the REAL bpi measured on OpenZeppelin's actual `@onlyOwner` fact (047 fire-rate check),
        // comfortably above the `Math.log2(CFG.lambda)` (=3) bar the below-floor branch now requires; a
        // genuinely-established, specific marker like these five clears it easily, unlike the generic
        // `returns:void`/`returns:t.Any` facts (bpi 1.4–2.7) that fire-rate measurement found the gate must reject.
        cid: `r${ROLE}:${cfg.kind}`, kind: cfg.kind, pid: cfg.pid, exp: 'true', parentExp: null,
        counts: { true: cfg.memberKeys.length }, srawCounts: { true: cfg.memberKeys.length }, alphabet: ['true', 'false'],
        raw: cfg.memberKeys.length, sraw: cfg.memberKeys.length, share: 1, bpi: 5.63, tau: 3, nSurfaces: 1, siblings: [],
        suppressedValue: null, denyEligible: false, exemplars: [], deviantsN: 0, deviants: [], altMarker: null,
      });
      // the planted omission: written AFTER the model is poisoned, never through `grain status` — genuinely
      // unseen by the persisted model, exactly the "just written" case the 047 measurement found `check` failing on
      wIn(repo, cfg.newRel, cfg.newSrc);

      const r = await checkFile({ model, root: repo, rel: cfg.newRel });
      const hit = r.newScopeHits.find(h => h.scope === cfg.name);
      assert.ok(hit, `expected a new-scope disclosure for ${cfg.name} (${cfg.id}): ${JSON.stringify(r.newScopeHits)}`);
      assert.match(hit.text, /is new to the index/, hit.text);
      // the honest below-floor framing is KEPT, not replaced
      assert.match(hit.text, new RegExp(`matched no group \\(best 0\\.00, floor ${CFG.minMemb}\\)`), hit.text);
      // §047's fix: the withheld information is now spoken
      assert.match(hit.text, /the nearest certifying group is/, hit.text);
      assert.match(hit.text, new RegExp(`«${cfg.label}»`), hit.text);
      assert.match(hit.text, new RegExp(`${cfg.memberKeys.length} members`), hit.text);
      assert.match(hit.text, new RegExp(reEsc(cfg.reqPhrase)), hit.text);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
}

// ---- narrowing gate (§047 acceptance 2): a WEAK certifying fact stays silent, exactly the fire-rate finding ----
// The 5-repo fire-rate measurement (flask, spring-petclinic, CleanArchitecture) found the naive certN>0 gate
// naming a "nearest certifying group" on every generic, near-universal role fact too (`returns:void` bpi 1.4–1.8,
// `returns:t.Any` bpi 3.1, a negated `deco:@Test` bpi 2.1) — one weak fact cited for a dozen unrelated new scopes
// each, double digits on two of three corpora. This fixture plants the identical shape with a fact whose bpi sits
// BELOW `Math.log2(CFG.lambda)` (=3, same bar every deviation accusation in this file already uses) and asserts
// the disclosure stays the honest bare "matched no group" — never naming a group it has only weak evidence for.
test('(047 narrowing) a certifying fact below the Math.log2(CFG.lambda) bar is not named — stays the bare below-floor message', async () => {
  const { tmp, repo } = initRepo('grain-047-weak-fact-');
  try {
    wIn(repo, 'typescript/weak.ts', `export class ZWeakSuite {\n${pad(30, i => `  @Inject()\n  zzWeak${i}() {\n  }\n`)}}\n`);
    const d1 = dateEnv('2026-01-10T12:00:00Z');
    gitIn(repo, d1, 'add', '-A'); gitIn(repo, d1, 'commit', '-qm', 'establishes a weak convention, real source');
    const st = grainIn(repo, ['status']);
    assert.equal(st.code, 0, st.err);
    const model = loadModel(repo);
    const part = partitionFor(model, 'typescript/other-weak.ts');
    assert.ok(part, 'no partition covers typescript/other-weak.ts');
    part.medoids = [];
    part.assignments = {};
    const ROLE = 0;
    part.medoids.push({ label: 'Inject', feats: ['dec:Inject'] });
    for (let i = 0; i < 30; i++) part.assignments[skey('typescript/weak.ts', 'method', `zzWeak${i}`)] = ROLE;
    part.facts.push({
      // bpi 2.5 — BELOW Math.log2(CFG.lambda)=3, deliberately: mirrors the real weak facts the fire-rate check found
      cid: `r${ROLE}:method`, kind: 'method', pid: 'auto.deco:@Inject', exp: 'true', parentExp: null,
      counts: { true: 30 }, srawCounts: { true: 30 }, alphabet: ['true', 'false'],
      raw: 30, sraw: 30, share: 1, bpi: 2.5, tau: 3, nSurfaces: 1, siblings: [],
      suppressedValue: null, denyEligible: false, exemplars: [], deviantsN: 0, deviants: [], altMarker: null,
    });
    wIn(repo, 'typescript/other-weak.ts', 'export class WWeakNotify {\n  qqWeakNotify() {\n  }\n}\n');

    const r = await checkFile({ model, root: repo, rel: 'typescript/other-weak.ts' });
    const hit = r.newScopeHits.find(h => h.scope === 'qqWeakNotify');
    assert.ok(hit, `expected a new-scope disclosure: ${JSON.stringify(r.newScopeHits)}`);
    assert.match(hit.text, new RegExp(`matched no group \\(best 0\\.00, floor ${CFG.minMemb}\\)`), hit.text);
    assert.doesNotMatch(hit.text, /the nearest certifying group is/, `a bpi-2.5 fact is below Math.log2(CFG.lambda)=3 — must NOT be named: ${hit.text}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---- containment (§047 acceptance 3): directory-level facts never depended on role clustering, and still don't ----
// A `d[dir]:kind` fact is matched purely by path prefix (checkFile's `gov` loop, `f.cid.startsWith('d[')` branch) —
// it never reads `roleOk`/`assign`/`amb`/CFG.minMemb at all. This planted scope has NO role, no medoid, not even a
// SINGLE induced cluster in its partition (proven by asserting `newScopeHits` is empty) — the opposite extreme of
// "excluded by its own deviation" — and the directory fact still catches it, unchanged by this ticket's fix (which
// only touches the below-floor role-clustering branch above).
test('(047 containment) a directory-scoped fact catches a deviation with zero role clustering involved at all', async () => {
  const { tmp, repo } = initRepo('grain-047-dir-containment-');
  try {
    wIn(repo, 'src/legacy/Members.ts', `export class Base {\n}\n${pad(20, i => `export class Member${i} extends Base {\n  run(): void {\n  }\n}\n`)}`);
    const d1 = dateEnv('2026-01-10T12:00:00Z');
    gitIn(repo, d1, 'add', '-A'); gitIn(repo, d1, 'commit', '-qm', 'baseline, real extends Base usages');
    const st = grainIn(repo, ['status']);
    assert.equal(st.code, 0, st.err);
    const model = loadModel(repo);
    const part = partitionFor(model, 'src/legacy/Extra.ts');
    assert.ok(part, 'no partition covers src/legacy/Extra.ts');
    part.medoids = []; // no role clustering exists in this partition at all — isolates the directory path completely
    part.assignments = {};
    part.facts.push({
      cid: 'd[src/legacy]:type', kind: 'type', pid: 'auto.extends:Base', exp: 'true', parentExp: null,
      counts: { true: 8 }, srawCounts: { true: 8 }, alphabet: ['true', 'false'],
      raw: 8, sraw: 8, share: 1, bpi: 1, tau: 3, nSurfaces: 1, siblings: [],
      suppressedValue: null, denyEligible: false, exemplars: [], deviantsN: 0, deviants: [], altMarker: null,
    });
    wIn(repo, 'src/legacy/Extra.ts', 'export class ExtraLegacyThing {\n}\n'); // never committed/indexed, never extends Base
    const r = await checkFile({ model, root: repo, rel: 'src/legacy/Extra.ts' });
    assert.deepEqual(r.newScopeHits, [], `no medoids exist — there is nothing for role-clustering disclosure to say: ${JSON.stringify(r.newScopeHits)}`);
    const dev = r.msgs.find(m => m.pid === 'auto.extends:Base' && m.scope === 'ExtraLegacyThing');
    assert.ok(dev, `the directory-scoped fact must still catch this deviation regardless of role clustering: ${JSON.stringify(r.msgs)}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
