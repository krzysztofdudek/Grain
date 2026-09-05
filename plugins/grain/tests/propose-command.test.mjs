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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

  // every line of the default report carries a number or a path — that is the whole contract of "quiet"
  for (const l of run.stdout.split('\n').filter(Boolean).filter(l => !/^as of /.test(l)))
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
  assert.equal(json.yggdrasil.found, true);
  assert.equal(json.yggdrasil.drilled, sidecar.counts.aspectsVerified);
  for (const a of json.enforced) {
    assert.ok(a.drill, `an enforced aspect must carry its drill numbers: ${a.id}`);
    assert.equal(a.drill.falseAlarms, 0, `${a.id} earned enforcement with a false alarm`);
    assert.ok(a.drill.caught >= 1, `${a.id} earned enforcement catching nothing`);
  }
  for (const a of json.candidates) assert.ok(a.drill.caught >= 1, `a candidate must have caught something: ${a.id}`);
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
    assert.equal(
      Buffer.byteLength(withGraph),
      Buffer.byteLength(withoutGraph) - Buffer.byteLength(named[0]) - 1,
      'the propose line must be the ONLY difference the condition makes'
    );
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
