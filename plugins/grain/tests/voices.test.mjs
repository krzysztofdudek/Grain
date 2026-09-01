// Four voices, one marker, one rule (J0.1). Every line grain prints as a CLAIM speaks in exactly one of four
// voices, marked identically in every command: practiced (the statistical claim — no marker, ever), decided
// (`decision <steer|boundary> (<who> <when>): `), example (a real historical instance — `example (<sha>): `),
// map (a structural overview — `map: `). Headers, stamps, pointers and continuation lines are structure, not
// claims: they carry no voice and are excluded here by an explicit, audited allowlist.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
let tmp, repo;
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, ...gitEnv } }).trim();
const DISPUTE = 'src/handlers/dispute.handler.ts';

// the one file edited to make `check` speak every voice at once: a boundary-crossing import, a method that departs
// from the maintainer decision, and a type missing the established `@Handler` (a plain practiced deviation)
const deviate = () => { const p = join(repo, DISPUTE); const s = readFileSync(p, 'utf8');
  writeFileSync(p, "import { AddressGuard } from '../guards/address.guard';\n" + s.replace('    const entity = await this.service.load', '    validate(cmd);\n    const entity = await this.service.load')); };
const restore = () => git('checkout', '-q', '--', DISPUTE);

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-voices-'));
  repo = join(tmp, 'fixture');
  execFileSync('node', [BUILDER, repo], { stdio: 'pipe' });
  const st = grain(['seed', 'add', DISPUTE + '#handle', '--surfaces', 'auto.call:validate', '--note', 'validate() moves into the framework — ADR-7', '--topic', 'handler validation', '--author', 'kd']);
  assert.equal(st.code, 0, st.err);
  const bd = grain(['seed', 'add-boundary', 'src/handlers', '--never-imports', 'src/guards', '--note', 'ADR-3', '--author', 'kd']);
  assert.equal(bd.code, 0, bd.err);
  // «endpoint» lives ONLY in commit messages, never in the code — the history bridge's only source (example voice).
  // The bridge's acceptance test (§J2.4) makes a token earn its line: it must beat the file's own base rate by
  // enough bits to pay for naming one of ~1200 candidate (token, file) pairs in this fixture (idxCost = 11), at the
  // λ=8 bound. It is squeezed from the other side by `filler`, which drops any token said in more than
  // max(8, 15% of commits) — so df must land in a narrow window: seven `endpoint` commits (λ = 0.9375, filler cap 8)
  // against fourteen that touch only the service, which is what holds the handler's base rate down to 8/37 while the
  // token's own rate stays 7/7. Worth ~2.4 bits after the 11-bit index cost of naming one of ~1200 candidate pairs.
  // Two commits, as this fixture used to carry, cannot clear the λ bound at any base rate (0.833 < 0.875).
  for (let i = 1; i <= 7; i++) {
    const p = join(repo, 'src/handlers/address.handler.ts');
    writeFileSync(p, readFileSync(p, 'utf8') + `\n// touch ${i}\n`);
    git('add', 'src/handlers/address.handler.ts'); git('commit', '-qm', `wire address liveness endpoint ${i}`); }
  for (let i = 1; i <= 14; i++) {
    const q = join(repo, 'src/services/address.service.ts');
    writeFileSync(q, readFileSync(q, 'utf8') + `\n// noise ${i}\n`);
    git('add', 'src/services/address.service.ts'); git('commit', '-qm', `polish service internals ${i}`); }
  assert.equal(grain(['status']).code, 0);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

// ----- the four voices, as the only markers a claim may lead with -----
const VOICES = {
  decided: /^decision (?:steer|boundary) \([^)]*\): /,
  example: /^example(?: \([^)]*\))?: /,
  map: /^map: /,
};
// Lines that lead with `<label>: ` but assert nothing — headers, stamps, pointers, continuations, and the
// location labels report/check use to say WHERE a convention holds. Audited by hand against the real output of
// `where`/`check`/`review`/`report` on this fixture; a NEW marker showing up here is the signal J0.1 exists for.
const NON_CLAIM = [
  /^(?:Copy|See|Nearest conforming exemplar)$/,                                       // pointers into the tree
  /^(?:carriers to copy|pattern to copy|members to look at|files to look at|not to copy)$/,
  /^(?:lives in|carries|depends on|used by|superposition|conforms to|historically co-changes with)$/,
  /^in$/,                                                                              // the card/check locator line (J0.3)
  /^selftest$/,                                                                        // status readout, like statusLines' own lines (J0.4)
  /^(?:a new carrier comes with|a new member comes with|its carriers share \(observed, not certified\))$/,
  /^(?:architecture|freshness|index|weak match|note)$/,                               // topic labels and stamps
  /^agent-authored share of code younger than \d+ days$/,
  /^template \(/, /^pre-existing \(/,
  /^(?:package |group «|local \(|repo-wide)/,                                         // factLabel: where it holds
  /^[0-9a-f]{8}$/,                                                                    // report's seed catalogue row key
  /^change shape$/,                                                                   // missingLines' practiced sources lead with a label (`co-change:`/`kin:`/`recipe:` share this shape too, unaudited only because none fires on this fixture) that reads like a marker but isn't one — J4.2's shape: is the first to actually trigger here
];
const bareOf = line => line.replace(/^\[grain\] /, '').replace(/^\s+/, '').replace(/^- /, '');
const markerOf = line => { const m = /^([^:]{1,70}): /.exec(bareOf(line)); return m ? m[1] : null; };

test('(a) every claim grain prints leads with one of the four voice markers — or with an audited non-claim label', () => {
  deviate();
  try {
    const out = [
      grain(['where', 'handler', 'validation']).out,
      grain(['where', 'handlers directory']).out,
      grain(['where', 'endpoint']).out,
      grain(['check', DISPUTE, '--all']).out,
      grain(['review']).out,
      grain(['report', '--top', '40']).out,
    ].join('\n');
    const unknown = [];
    for (const line of out.split('\n')) {
      const bare = bareOf(line);
      const mk = markerOf(line);
      if (mk === null) continue;                                          // practiced or pure structure — no marker to check
      if (Object.values(VOICES).some(re => re.test(bare))) continue;      // one of the four voices
      if (NON_CLAIM.some(re => re.test(mk))) continue;                    // audited structure
      unknown.push(line);
    }
    assert.deepEqual(unknown, [], `these lines lead with a marker that is neither a voice nor audited structure:\n${unknown.join('\n')}`);
  } finally { restore(); }
});

test('(a) the decided voice has ONE shape across where and check — steer and boundary alike', () => {
  deviate();
  try {
    const w = grain(['where', 'handler', 'validation']).out;
    assert.match(w, /^  decision steer \(kd \d{4}-\d{2}-\d{2}\): methods here never call `validate` — practiced by \d+% of \d+ in group «handle» today · validate\(\) moves into the framework — ADR-7 · copy src\/handlers\/dispute\.handler\.ts:\d+ `handle`$/m);
    assert.match(w, /^  decision boundary \(kd \d{4}-\d{2}-\d{2}\): never imports src\/guards\/ — ADR-3$/m);
    const c = grain(['check', DISPUTE, '--all']).out;
    assert.match(c, /^\[grain\] decision steer \(kd \d{4}-\d{2}-\d{2}\): methods here never call `validate`[^\n]*Your method `handle` \(line \d+\) calls `validate`\.\n  validate\(\) moves into the framework — ADR-7\n  Copy: src\/handlers\/dispute\.handler\.ts:\d+ `handle`$/m);
    assert.match(c, /^\[grain\] decision boundary \(kd \d{4}-\d{2}-\d{2}\): src\/handlers\/ never imports src\/guards\/ — your import of `src\/guards\/address\.guard\.ts` \(line 1\) crosses it\.\n  ADR-3$/m);
    for (const old of [/steer \(maintainer decision/, /maintainer decision \(/, /boundary \(maintainer decision/])
      for (const s of [w, c]) assert.doesNotMatch(s, old, 'the pre-J0.1 decision shapes are gone');
  } finally { restore(); }
});

// J0.5: report()'s `== boundaries ==` / `== steers ==` catalogue rows are the fifth place a decided claim printed
// (found while verifying J0.1) — they led with a bare `<8-hex-id>: ` and never passed through voice(). The id is
// still needed for `seed rm <id>`, so it moves into the marker's parenthetical instead of disappearing.
test('(a) the fifth decided shape: report()\'s boundaries/steers catalogue rows carry the id inside the marker', () => {
  const out = grain(['report', '--top', '40']).out;
  assert.match(out, /^  decision steer \(id [0-9a-f]{8}, kd \d{4}-\d{2}-\d{2}\): /m);
  assert.match(out, /^  decision boundary \(id [0-9a-f]{8}, kd \d{4}-\d{2}-\d{2}\): /m);
});

// J0.6: rulesMarkdown()'s `## Boundaries` / `## Maintainer decisions (steers)` bullet rows are the same twin
// shape J0.5 just fixed in report() — found while verifying J0.5. They led with a bare `- **<id>**: ` and never
// passed through voice(). Same fix: the id moves into the marker's parenthetical.
test('(a) rulesMarkdown() carries the same fifth decided shape fix as report()', () => {
  const out = grain(['rules', '--top', '40']).out;
  assert.match(out, /^- decision steer \(id [0-9a-f]{8}, kd \d{4}-\d{2}-\d{2}\): /m);
  assert.match(out, /^- decision boundary \(id [0-9a-f]{8}, kd \d{4}-\d{2}-\d{2}\): /m);
});

test('(a) the example voice cites the commit in its marker, not in prose alone', () => {
  const r = grain(['where', 'endpoint']).out;
  assert.match(r, /^example \([0-9a-f]{7}\): «endpoint» appears in no code card here, but commits saying it touched: `src\/handlers\/address\.handler\.ts` \(7\)/m);
  assert.doesNotMatch(r, /history bridge/);
});

test('(a) the map voice marks the first line of every where card', () => {
  for (const q of [['handler'], ['handlers directory'], ['guard'], ['dto']]) {
    const out = grain(['where', ...q]).out;
    const headers = out.split('\n').filter(l => l.includes('» → '));
    assert.ok(headers.length, `expected at least one card header for "${q.join(' ')}":\n${out}`);
    for (const h of headers) assert.match(h, /^map: «/, `a where card header must speak in the map voice: ${h}`);
  }
});

// (b) REGRESSION CONTROL, not red→green: `bridgeLines` (the example voice) is reachable only from `whereCmd`, and
// check-hook's `speak` filter keeps to `[grain]`-marked findings, so neither example nor map has a path into
// `additionalContext` today. This pins that: a hook must never speak anything but practiced or decided.
test('(b) check-hook speaks no example and no map voice, Pre or Post', () => {
  deviate();
  try {
    const hook = extra => { const r = spawnSync('node', [BIN, 'check-hook', ...extra], { cwd: repo, encoding: 'utf8', input: JSON.stringify({ cwd: repo, tool_name: 'Edit', tool_input: { file_path: join(repo, DISPUTE) } }) });
      return (r.stdout || '').trim(); };
    const post = hook([]);
    assert.ok(post, 'the edited file must give the Post hook something to say');
    const ctx = JSON.parse(post).hookSpecificOutput.additionalContext;
    assert.match(ctx, /decision (?:steer|boundary) \(/, 'the decided voice is one a hook MAY speak');
    assert.doesNotMatch(ctx, /(?:^|\n)\s*example \(/); assert.doesNotMatch(ctx, /(?:^|\n)\s*map: /);
    const pre = hook(['--pre']);
    if (pre) { const p = JSON.parse(pre).hookSpecificOutput.additionalContext || '';
      assert.doesNotMatch(p, /(?:^|\n)\s*example \(/); assert.doesNotMatch(p, /(?:^|\n)\s*map: /); }
  } finally { restore(); }
});

// (c) REGRESSION CONTROL with the OPPOSITE assertion: `session-context` is a SessionStart one-time overview, not a
// per-edit hook — J0.1 exempts it. Its architecture line and its "Maintainer decisions in force" line (both
// decided-conceptual content, rendered as plain summaries with no voice() marker of their own) must survive
// unprefixed, proving the hook filter was scoped to check-hook. §J4.3b later added two more sessionContext lines,
// `concepts:`/`changes:`, which this same exemption explicitly permits to carry their OWN real voice markers
// (`map: `/no marker respectively, per voice()'s own definitions) — so, unlike the older two lines, their presence
// here is the marker doing exactly what it does everywhere else, not evidence the exemption leaked.
test('(c) session-context is exempt: its architecture and maintainer-decision lines stay exactly as they were', () => {
  const r = spawnSync('node', [BIN, 'session-context'], { cwd: repo, encoding: 'utf8', input: JSON.stringify({ cwd: repo }) });
  assert.equal(r.status, 0, r.stderr);
  const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /^Architecture \(measured\): \d+ modules, \d+ dependencies, \d+ cycle\(s\), \d+ layer\(s\); most depended-on: /m);
  assert.match(ctx, /^Maintainer decisions in force \(committed \.grain\/seeds\.jsonl[^)]*\): /m);
  assert.doesNotMatch(ctx, /^decision /m); // steers/boundaries here are the plain summary line above, never the `decided` voice's own marker
  // §J4.3b: concepts:/changes: are new, model-dependent lines — this fixture's history and code share vocabulary
  // (real overlap, not contrived for this test), so both are present and DO carry their documented markers
  assert.match(ctx, /^map: concepts: /m);
  assert.match(ctx, /^changes: /m);
});
