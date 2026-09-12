// End-to-end guard for `grain propose` as a PRODUCT command (ticket 104) — driven only through the built CLI
// (`bin/grain.mjs`), against the deterministic fixture repository with a real git history
// (`tests/fixtures/build-fixture.mjs`), exactly as `tests/grain.test.mjs` drives every other command.
//
// `tests/propose.test.mjs` already guards the RENDERER (what lands on disk, whether Yggdrasil can load it). This
// file guards the four things that are only true of the command:
//
//   1. THE DEFAULT OUT-DIR AND THE SAFETY RULE. `.yggdrasil-proposal/` under the repository root, never the
//      repository's own `.yggdrasil/` — that path is refused outright, and the staging tree carries its own
//      ignore file so `git status` stays clean while a maintainer reads it for a week.
//   2. THE QUIET REPORT (ruling `propose-default-is-quiet`). Architecture counts, what earned enforcement with
//      the drill's own numbers, the candidates — and nothing else in the default. Every line carries a number
//      or a path. Its counts must agree with the `proposal.json` the same run wrote.
//   3. THE HONEST NEGATIVE. With no Yggdrasil CLI resolvable, nothing is drilled, so nothing is enforced and
//      there are no candidates — and the report says exactly that instead of quietly showing an empty list.
//   4. REACHABILITY (§081, `research/command-reachability.md`: 0 of 63 agent-chosen calls ever went to a command
//      named in neither the SessionStart text nor the SKILL description). The command is named in the
//      SessionStart text of a repository that has an index and no `.yggdrasil/` — and in NO other repository,
//      so a project that already has a graph pays nothing for the line.
//
// The staged `yg check` at the end needs a real Yggdrasil CLI and skips with its reason when there is none,
// the same way `tests/propose.test.mjs` does.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');
const YG_BIN = process.env.YG_BIN || '/home/user/Yggdrasil/source/cli/dist/bin.js';
const HAVE_YG = existsSync(YG_BIN);

let tmp, repo, run, json;
const grain = (args, env = {}) =>
  spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, ...env } });
const outDir = () => join(repo, '.yggdrasil-proposal');
const line = re => run.stdout.split('\n').find(l => re.test(l));

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'propose-cmd-'));
  repo = join(tmp, 'fixture');
  execFileSync('node', [BUILDER, repo], { stdio: 'pipe' });
  run = grain(['propose', '--json', join(tmp, 'report.json')], { YG_BIN });
  assert.equal(run.status, 0, run.stderr);
  json = JSON.parse(readFileSync(join(tmp, 'report.json'), 'utf8'));
});
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

// ---------- 1. the out-dir ----------
test('writes the staging tree to .yggdrasil-proposal/ and never into the repository\'s own .yggdrasil/', () => {
  for (const f of ['.yggdrasil/yg-architecture.yaml', '.yggdrasil/yg-config.yaml', 'PROPOSAL.md', 'proposal.json', 'sizing.json'])
    assert.ok(existsSync(join(outDir(), f)), `missing ${f} under the default out-dir`);
  assert.ok(!existsSync(join(repo, '.yggdrasil')), 'the command must never create a graph inside the repository');
});

test('the staging tree ignores itself, so a proposal under review never shows up as an uncommitted change', () => {
  const gi = readFileSync(join(outDir(), '.gitignore'), 'utf8');
  assert.match(gi, /^\*$/m, 'the out-dir must ignore its own whole contents');
  const status = execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf8' });
  assert.ok(!status.includes('.yggdrasil-proposal'), `git sees the proposal:\n${status}`);
});

test('refuses an out-dir that is the repository itself or its own .yggdrasil/', () => {
  for (const bad of ['.', '.yggdrasil', '.yggdrasil/model']) {
    const r = grain(['propose', bad]);
    assert.notEqual(r.status, 0, `expected a refusal for out-dir ${bad}`);
    assert.match(r.stderr, /refusing to write a proposal into/, r.stderr);
    assert.match(r.stderr, /\.yggdrasil-proposal/, 'the refusal must name the directory to use instead');
  }
  assert.ok(!existsSync(join(repo, '.yggdrasil')), 'a refused run must not have created anything');
});

// ---------- 2. the quiet report ----------
test('the default report carries the architecture, what earned enforcement, and the candidates — and agrees with proposal.json', () => {
  const sidecar = JSON.parse(readFileSync(join(outDir(), 'proposal.json'), 'utf8'));
  const arch = line(/^architecture:/);
  assert.ok(arch, `no architecture line:\n${run.stdout}`);
  assert.match(arch, new RegExp(`${sidecar.counts.types} node types`));
  assert.match(arch, new RegExp(`${sidecar.counts.nodes} nodes`));
  assert.match(arch, new RegExp(`${sidecar.counts.nodeCycles} dependency cycle`));
  assert.match(arch, /\.yggdrasil-proposal\/\.yggdrasil\/yg-architecture\.yaml$/);

  const enf = line(/^enforced:/);
  assert.ok(enf, `no enforced line:\n${run.stdout}`);
  assert.match(enf, new RegExp(`of ${sidecar.counts.aspects} aspects`));
  assert.ok(line(/^candidates:/), `no candidates line:\n${run.stdout}`);
  assert.ok(line(/^on disk, not above:/), `no summary line for what stayed on disk:\n${run.stdout}`);
  assert.ok(line(/^next:/), `no next line:\n${run.stdout}`);

  // every line of the default report carries a number or a path — that is the whole contract of "quiet".
  // Scoped to `proposeReport`'s OWN lines, through `next:` — ticket 123's `yg adopt --dry-run` block printed
  // after it is Yggdrasil's verbatim output, not grain's prose, and is exempt by design (see the handshake
  // tests below): the whole point is showing the real preview untouched, not grain's own wording of it.
  const nextIdx = run.stdout.split('\n').findIndex(l => /^next:/.test(l));
  for (const l of run.stdout.split('\n').slice(0, nextIdx + 1).filter(Boolean).filter(l => !/^as of /.test(l)))
    assert.ok(/\d/.test(l) || /[\w.-]+\//.test(l), `report line carries neither a number nor a path: ${l}`);
});

test('the default report leaves the prose and no-catch drafts on disk, and --full prints them', () => {
  const sidecar = JSON.parse(readFileSync(join(outDir(), 'proposal.json'), 'utf8'));
  const drafts = sidecar.counts.aspectsDraft;
  assert.ok(drafts > 0, 'fixture sanity: the renderer keeps some aspects as drafts');
  const shown = run.stdout.split('\n').filter(l => /^ {2}grain\//.test(l)).length;
  assert.ok(shown < drafts, `the default report named ${shown} aspects of ${drafts} drafts — it is not quiet`);
  const full = grain(['propose', '--full'], { YG_BIN });
  assert.equal(full.status, 0, full.stderr);
  assert.ok(full.stdout.split('\n').length > run.stdout.split('\n').length, 'expected --full to print more than the default');
  assert.match(full.stdout, /the remaining \d+ draft\(s\), by why each is one/);
  assert.match(full.stdout, /finer type alternative\(s\), not cut as types/);
});

test('with a real Yggdrasil, the enforced count is the one a real drill earned', { skip: HAVE_YG ? false : `Yggdrasil CLI not found at ${YG_BIN} (set YG_BIN)` }, () => {
  const sidecar = JSON.parse(readFileSync(join(outDir(), 'proposal.json'), 'utf8'));
  assert.equal(json.aspects.enforced, sidecar.counts.aspectsActive);
  assert.equal(json.aspects.advisory, sidecar.counts.aspectsAdvisory, 'ticket 107: the report and the sidecar must agree on the advisory count too');
  assert.equal(json.yggdrasil.found, true);
  assert.equal(json.yggdrasil.drilled, sidecar.counts.aspectsVerified);
  for (const a of json.enforced) {
    assert.ok(a.drill, `an enforced aspect must carry its drill numbers: ${a.id}`);
    assert.equal(a.drill.falseAlarms, 0, `${a.id} earned enforcement with a false alarm`);
    assert.ok(a.drill.caught >= 1, `${a.id} earned enforcement catching nothing`);
    assert.equal(a.status, 'enforced');
    // ticket 107, ruling `enforced-requires-certified-origin`: a sub-gate-lattice origin never reaches
    // `enforced`, whatever its drill result — cross-checked against the per-aspect provenance.json, the one
    // place `origin` is recorded (the command's own report JSON does not carry it).
    const prov = JSON.parse(readFileSync(join(repo, a.path, 'provenance.json'), 'utf8'));
    assert.notEqual(prov.origin, 'sub-gate-lattice', `${a.id} earned \`enforced\` from a sub-gate-lattice origin`);
  }
  for (const a of json.candidates) {
    assert.ok(a.drill.caught >= 1, `a candidate must have caught something: ${a.id}`);
    assert.ok(a.status === 'advisory' || a.status === 'draft', `a candidate must be advisory or draft, got ${a.status}: ${a.id}`);
  }
});

// ---------- 3. the honest negative ----------
test('with no Yggdrasil CLI resolvable, nothing is enforced and the report says so', () => {
  const r = grain(['propose', join(tmp, 'no-yg'), '--json', join(tmp, 'no-yg.json')], { YG_BIN: join(tmp, 'no-such-yg.js') });
  assert.equal(r.status, 0, r.stderr);
  const enf = r.stdout.split('\n').find(l => /^enforced:/.test(l));
  assert.match(enf, /^enforced: 0 of \d+ aspects/, enf);
  assert.match(enf, /no Yggdrasil CLI was found/, enf);
  assert.match(enf, /YG_BIN/, 'the report must name how to fix it');
  const cand = r.stdout.split('\n').find(l => /^candidates:/.test(l));
  assert.match(cand, /^candidates: 0 of \d+/, cand);
  const j = JSON.parse(readFileSync(join(tmp, 'no-yg.json'), 'utf8'));
  assert.equal(j.yggdrasil.found, false);
  assert.equal(j.yggdrasil.cli, null);
  assert.equal(j.enforced.length, 0);
  assert.equal(j.candidates.length, 0);
  // the architecture is still there — that half of the proposal never needed a reviewer
  assert.ok(j.architecture.nodes >= 1, 'the architecture is proposed whether or not a drill can run');
  // Ticket 028 (1): with no Yggdrasil CLI, "enforced: 0 of N" (129) is not the whole story — grain still knows
  // which deterministic aspects it is confident enough in, and has cases written for, to be worth drilling once
  // a real CLI resolves. Named "certified conventions with cases", never "enforceable": whether a drill would
  // actually pass is exactly what cannot be said without running one.
  const withCases = r.stdout.split('\n').find(l => /certified convention\(s\) with cases/.test(l));
  assert.ok(withCases, `no companion sentence to the enforced/candidates lines:\n${r.stdout}`);
  assert.match(withCases, /^\s*\d+ certified convention\(s\) with cases already look worth drilling/, withCases);
  assert.match(withCases, /npm i -g @chrisdudek\/yg/, withCases);
  assert.match(withCases, /`grain propose` again/, withCases);
  assert.match(withCases, /`yg adopt/, withCases);
  assert.equal(j.aspects.certifiedWithCases, +withCases.trim().match(/^(\d+)/)[1], 'the --json count and the printed count must agree');
  assert.ok(j.aspects.certifiedWithCases > 0, 'the fixture must actually exercise the non-zero case');
  const proposalMd = readFileSync(join(tmp, 'no-yg', 'PROPOSAL.md'), 'utf8');
  assert.match(proposalMd, /certified convention\(s\) with cases already look worth drilling/, 'the same sentence must land in PROPOSAL.md, not only the CLI report');
});

test('the "certified conventions with cases" sentence is silent at zero, and silent whenever a real Yggdrasil is found', () => {
  // A repository with no partitions drafts no aspects at all — `aspectsCertifiedWithCases` is 0 by
  // construction, the same shape as Grain's own repository earning 0 enforced rules from its own `propose`
  // (README, "What it can deduce, and what it can't") — and the sentence must not fire for a zero it cannot
  // act on, exactly like the existing "enforced: 0 of N" line never gained a phantom companion before this.
  const emptyRepo = join(tmp, 'no-conventions');
  mkdirSync(emptyRepo, { recursive: true });
  execFileSync('git', ['-C', emptyRepo, 'init', '-q', '-b', 'main']);
  execFileSync('git', ['-C', emptyRepo, 'config', 'commit.gpgsign', 'false']);
  execFileSync('git', ['-C', emptyRepo, 'config', 'user.email', 't@x']);
  execFileSync('git', ['-C', emptyRepo, 'config', 'user.name', 'T']);
  writeFileSync(join(emptyRepo, 'README.md'), 'hello\n');
  execFileSync('git', ['-C', emptyRepo, 'add', '-A']);
  execFileSync('git', ['-C', emptyRepo, 'commit', '-qm', 'base'], { env: { ...process.env, GIT_AUTHOR_DATE: '2024-01-15T12:00:00Z', GIT_COMMITTER_DATE: '2024-01-15T12:00:00Z' } });
  const r = spawnSync('node', [BIN, 'propose', join(tmp, 'no-conventions-out'), '--json', join(tmp, 'no-conventions.json'), '--repo', emptyRepo], { encoding: 'utf8', env: { ...process.env, YG_BIN: join(tmp, 'no-such-yg.js') } });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /certified convention\(s\) with cases/, r.stdout);
  const j = JSON.parse(readFileSync(join(tmp, 'no-conventions.json'), 'utf8'));
  assert.equal(j.aspects.certifiedWithCases, 0);

  if (HAVE_YG) {
    // With a real Yggdrasil present, the report earns a REAL verdict instead — the "would be worth drilling"
    // sentence, whose whole point is standing in for a drill that cannot run, must not appear beside one.
    assert.doesNotMatch(run.stdout, /certified convention\(s\) with cases already look worth drilling/, run.stdout);
  }
});

// ---------- 5. the acceptance handshake (ticket 123): `next:` names `yg adopt`, and — when a Yggdrasil CLI
// resolves — the command runs its own `--dry-run` on the very proposal it just wrote and prints the summary
// verbatim under that line, so the adopter sees "Already broken N sites" before deciding anything.
// ---------- 5. the acceptance handshake (ticket 123) ----------
test('next: names the yg adopt transaction, dry-run first', () => {
  const next = line(/^next:/);
  assert.ok(next, `no next line:\n${run.stdout}`);
  assert.match(next, /`yg adopt \.yggdrasil-proposal --dry-run`/, next);
  assert.match(next, /`yg adopt \.yggdrasil-proposal`/, next);
  assert.doesNotMatch(next, /move .* to the repository root/, 'the old mv instruction must be gone');
});

test('with a real Yggdrasil, the report runs `yg adopt --dry-run` on its own output and prints the summary verbatim', { skip: HAVE_YG ? false : `Yggdrasil CLI not found at ${YG_BIN} (set YG_BIN)` }, () => {
  const idx = run.stdout.split('\n').findIndex(l => /^next:/.test(l));
  assert.ok(idx >= 0, 'no next: line to anchor the dry-run block on');
  const after = run.stdout.split('\n').slice(idx + 1).join('\n');
  assert.match(after, /yg adopt: would accept\s+\S*\.yggdrasil-proposal → \.yggdrasil\/\s*$/m, after.slice(0, 400));
  assert.match(after, /^\s*Graph\s+\d+ components? · \d+ rules? /m, after);
  assert.match(after, /^\s*Origin\s+mined from this repository by Grain \(grain-proposal\/1\)/m, after);
  // "Already broken" is the one number nothing else in the report gives — a rule earns its status from how
  // the code is USUALLY written, never from a check that this repository is clean today.
  assert.match(after, /^\s*Already broken\s+/m, after);
  assert.match(after, /^\s*Blocks on\s+/m, after);
  assert.match(after, /Nothing was written\. Re-run without --dry-run to accept\./, after);
  assert.ok(!existsSync(join(repo, '.yggdrasil')), 'the dry run must not have installed anything into the repository');
});

test('with no Yggdrasil CLI resolvable, the report says what `yg adopt` would tell the adopter once one resolves', () => {
  const r = grain(['propose', join(tmp, 'no-yg-adopt'), '--json', join(tmp, 'no-yg-adopt.json')], { YG_BIN: join(tmp, 'no-such-yg.js') });
  assert.equal(r.status, 0, r.stderr);
  const idx = r.stdout.split('\n').findIndex(l => /^next:/.test(l));
  assert.ok(idx >= 0, `no next: line:\n${r.stdout}`);
  const after = r.stdout.split('\n').slice(idx + 1).join('\n');
  assert.match(after, /yg adopt is not available to preview this run/, after);
  assert.match(after, /YG_BIN/, 'must name how to make it resolve');
  assert.match(after, /`yg adopt .*no-yg-adopt --dry-run`/, after);
  assert.match(after, /already refuse today/, 'must say what yg adopt would eventually report, not just that it cannot run now');
  assert.doesNotMatch(after, /yg adopt: would accept/, 'no real dry-run block without a resolvable CLI');
});

// ---------- 4. reachability (§081) ----------
test('§081: the SessionStart text names `grain propose` exactly where the trigger moment is real', () => {
  const ctx = () => JSON.parse(grain(['session-context', '--mode', 'claude']).stdout).hookSpecificOutput.additionalContext;
  const withoutGraph = ctx();
  const named = withoutGraph.split('\n').filter(l => /grain propose/.test(l));
  assert.equal(named.length, 1, `expected exactly one line naming propose:\n${withoutGraph}`);
  assert.match(named[0], /no \.yggdrasil\//, 'the line must say what makes this the moment');
  assert.match(named[0], /Run: `node "[^"]+grain\.mjs" propose`/, 'the runnable invocation must be given, as every other advertised command gives it');
  // §067a: an advertised line never opens with the runtime name
  assert.ok(!/^\s*node\b/.test(named[0]), `advertised line must not open with "node": ${named[0]}`);

  mkdirSync(join(repo, '.yggdrasil'), { recursive: true });
  try {
    const withGraph = ctx();
    assert.ok(!/grain propose/.test(withGraph), `a repository that already has a graph must not be told to propose one:\n${withGraph}`);
    // Ticket 028: a repository WITH a graph no longer sees plain "no propose line" — it sees the mirror-image
    // block instead (`yg prime`, plus an install line when `yg` is not resolvable). Apart from the propose
    // line (removed) and that block (added), the rest of the output must still be byte-identical — same
    // invariant §081 always tested, widened for the one new trigger moment ticket 028 adds.
    const YGGDRASIL_BLOCK = /Yggdrasil|`yg prime`|npm i -g @chrisdudek\/yg/;
    const withoutGraphLines = withoutGraph.split('\n').filter(l => l !== named[0]);
    const withGraphLines = withGraph.split('\n');
    const primeLine = withGraphLines.find(l => /`yg prime`/.test(l));
    assert.ok(primeLine, `a repository with a graph must be told to read \`yg prime\`:\n${withGraph}`);
    const withGraphRest = withGraphLines.filter(l => !YGGDRASIL_BLOCK.test(l));
    assert.deepEqual(withGraphRest, withoutGraphLines, 'apart from the propose line (removed) and the Yggdrasil block (added), the two outputs must be identical');
  } finally { rmSync(join(repo, '.yggdrasil'), { recursive: true, force: true }); }
});

// ---------- Yggdrasil must be able to load what the command wrote ----------
const LOAD_FAILURES = /architecture-invalid|graph-load|yaml|schema|node-invalid|aspect-invalid|aspect-reviewer-missing|description-missing|type-undefined|parent-type-forbidden|file-duplicate-mapping|mapping-path-missing/;

test('yg check loads the graph the command wrote, from a staged copy of the repository', { skip: HAVE_YG ? false : `Yggdrasil CLI not found at ${YG_BIN} (set YG_BIN)` }, () => {
  const stage = join(tmp, 'stage');
  mkdirSync(stage, { recursive: true });
  for (const rel of execFileSync('git', ['-C', repo, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)) {
    const dst = join(stage, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(join(repo, rel), dst);
  }
  cpSync(join(outDir(), '.yggdrasil'), join(stage, '.yggdrasil'), { recursive: true });
  const r = spawnSync('node', [YG_BIN, 'check'], { cwd: stage, encoding: 'utf8', maxBuffer: 1 << 26 });
  const text = (r.stdout || '') + (r.stderr || '');
  const header = /yg check: (\w+)[^\n]*?(\d+) nodes/.exec(text);
  assert.ok(header, `yg check printed no graph header — the graph did not load:\n${text.slice(0, 2000)}`);
  assert.equal(Number(header[2]), json.architecture.nodes, `Yggdrasil loaded ${header[2]} nodes, the report claimed ${json.architecture.nodes}`);
  const codes = [...new Set([...text.matchAll(/^ {2}([a-z][a-z-]+)/gm)].map(m => m[1]))];
  assert.deepEqual(codes.filter(c => LOAD_FAILURES.test(c)), [], `Yggdrasil refused to load the proposal:\n${text.slice(0, 4000)}`);
});
