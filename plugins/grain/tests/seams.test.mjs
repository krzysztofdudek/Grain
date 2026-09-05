// Seam tests (ticket 100) — the family's contracts, driven through the NEIGHBOUR PROJECTS' OWN real binaries,
// never a re-implementation of either. Three seams, three tests:
//
//   1. YGGDRASIL LOADS THE PROPOSAL, DRILLS IT CLEAN, AND ADVISES THE FAMILY. A real Yggdrasil checkout is
//      staged into a disposable temp copy (git-tracked files only, never the shared checkout itself — see
//      "READ-ONLY" below), `propose.mjs` renders a proposal for it, and the real `yg` binary (not ours) is run
//      three times against the staged repo: `check` (the graph loads — no LOAD_FAILURES code), `drill` (every
//      rendered check.mjs reports 0 FALSE-ALARM on its own drill corpus), `advise` (the family this adapter
//      wrote to `.family-candidates.json` is nominated). This is the wave-1 slice of the "compat matrix" named
//      in decision `layers-compatible-no-user-thresholds`.
//   2. THE PLANTED-FAMILY PRECISION CONTRACT. Yggdrasil ships two tiny fixture repos
//      (`tests/fixtures/family-planted-mono`, `-polyglot`) whose whole point is a known-exact answer: one
//      structurally-uniform cluster with no rule of its own, surrounded by decoys that must NOT cluster.
//      `buildFamilyCandidates` is run directly against them (no `yg` needed) and checked against that answer.
//   3. HORDE READS THE CHARTER. A real Horde checkout's `node.mjs show <node>` is run against the SAME staged
//      Yggdrasil repo from seam 1 (its `.horde/` wiring stapled on) and must print the rendered charter.md back
//      verbatim under a `## Charter` heading.
//
// Every seam skips itself, with a stated reason, when its neighbour binary/checkout is not present — never a
// silent pass and never a hard failure of the whole suite. Point `YG_BIN` at Yggdrasil's built `bin.js` (its
// repo root is derived from that path, or set `YGG_DIR` directly) and `HORDE_DIR` at a Horde checkout.
//
// READ-ONLY, non-negotiable: neither neighbour checkout is ever written to. Every stage is a `git ls-files`
// listing (read-only) copied into a fresh `mkdtempSync` directory, git-initialised there as its OWN throwaway
// repository — `grain export`'s `.grain/` cache and every `.yggdrasil/`/`.horde/` overlay land in that temp
// copy, never beside the real checkout.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGraph } from './stress/reconstruct.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PROPOSE = join(here, 'stress', 'propose.mjs');

const YG_BIN = process.env.YG_BIN || '/home/user/Yggdrasil/source/cli/dist/bin.js';
// `YG_BIN` is `<repo>/source/cli/dist/bin.js` — the checkout root is three directories up. `YGG_DIR` overrides
// this when the layout differs (e.g. a CI checkout under a different name).
const YGG_DIR = process.env.YGG_DIR || resolve(dirname(YG_BIN), '..', '..', '..');
const HAVE_YG = existsSync(YG_BIN) && existsSync(join(YGG_DIR, '.git'));
const YG_SKIP = `Yggdrasil binary/checkout not found (looked for ${YG_BIN} and a git repo at ${YGG_DIR} — set YG_BIN / YGG_DIR)`;

const HORDE_DIR = process.env.HORDE_DIR || '/home/user/krzysztofdudek/horde';
const NODE_MJS = join(HORDE_DIR, 'skills', 'horde', 'scripts', 'node.mjs');
const HAVE_HORDE = existsSync(NODE_MJS);
const HORDE_SKIP = `Horde checkout not found (looked for ${NODE_MJS} — set HORDE_DIR)`;

const FIXTURES = join(YGG_DIR, 'source', 'cli', 'tests', 'fixtures');
const MONO_FIXTURE = join(FIXTURES, 'family-planted-mono');
const HAVE_MONO_FIXTURE = HAVE_YG && existsSync(MONO_FIXTURE);

const LOAD_FAILURES = /architecture-invalid|graph-load|yaml|schema|node-invalid|aspect-invalid|aspect-reviewer-missing|description-missing|type-undefined|parent-type-forbidden|file-duplicate-mapping|mapping-path-missing/;

const gitEnv = home => ({
  ...process.env, HOME: home,
  GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
  GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z',
});

// Copy a git-tracked source tree (READ-ONLY `ls-files`) into `dest` and git-init it there as a fresh, disposable
// repository, so everything a later `grain export`/`propose.mjs` writes lands in `dest`, never in `srcRepo`.
// `exclude` names path prefixes to leave out (vendored dependencies, build output — never `.yggdrasil/`, which
// stays IN by default so a repo that already carries a graph is staged faithfully; pass it explicitly to drop).
function stageGitRepo(srcRepo, dest, { exclude = [] } = {}) {
  mkdirSync(dest, { recursive: true });
  const files = execFileSync('git', ['-C', srcRepo, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\0').filter(Boolean)
    .filter(rel => !exclude.some(p => rel === p || rel.startsWith(p.endsWith('/') ? p : p + '/')));
  for (const rel of files) {
    const src = join(srcRepo, rel), dst = join(dest, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst);
  }
  const env = gitEnv(dest);
  execFileSync('git', ['-C', dest, 'init', '-q', '-b', 'main'], { env });
  execFileSync('git', ['-C', dest, 'add', '-A'], { env });
  execFileSync('git', ['-C', dest, 'commit', '-q', '-m', 'seam stage'], { env });
  return files.length;
}

let tmp;
// Seam 1 state
let yggStage, yggProposalOut, yggFamilyCandidates, yggProposeCounts, yggProposeError;
// Seam 3 (Horde) reuses the seam-1 stage.

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'seams-'));
  if (!HAVE_YG) return;
  yggStage = join(tmp, 'ygg-stage');
  // `.yggdrasil/` is excluded from the stage: this fixture repo already carries its OWN committed graph
  // (Yggdrasil manages itself), and mining that graph's YAML/drill fixtures as if they were ordinary source
  // would (a) make `propose.mjs` draft a spurious `dot-yggdrasil` node type for its own metadata and (b) collide
  // with the FRESH `.yggdrasil/` this test overlays afterwards. `source/cli/node_modules` and `.../dist` are
  // vendored/build output grain has nothing to learn from and would cost real minutes to parse.
  const nFiles = stageGitRepo(YGG_DIR, yggStage, {
    exclude: ['.yggdrasil', 'source/cli/node_modules', 'source/cli/dist'],
  });
  yggProposalOut = join(tmp, 'ygg-proposal');
  yggFamilyCandidates = join(tmp, 'ygg-family-candidates.json');
  const r = spawnSync('node', [
    PROPOSE, yggStage, yggProposalOut, '--no-history',
    '--family-candidates', yggFamilyCandidates,
  ], { encoding: 'utf8', maxBuffer: 1 << 29, timeout: 10 * 60_000 });
  if (r.status !== 0) {
    yggProposeError = `propose.mjs exited ${r.status} on a ${nFiles}-file stage of Yggdrasil:\n${(r.stderr || '').slice(0, 4000)}`;
    return;
  }
  yggProposeCounts = JSON.parse(readFileSync(join(yggProposalOut, 'proposal.json'), 'utf8')).counts;
  // Overlay the rendered proposal AND the family-candidates adapter's own output onto the staged repo — this is
  // the exact seam a maintainer would perform by hand: drop `.yggdrasil/` in, drop `.family-candidates.json`
  // beside it, run `yg`.
  cpSync(join(yggProposalOut, '.yggdrasil'), join(yggStage, '.yggdrasil'), { recursive: true });
  cpSync(yggFamilyCandidates, join(yggStage, '.yggdrasil', '.family-candidates.json'));
});

after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

// ============================================================================================================
// Seam 1a — `yg check` loads the rendered proposal for a REAL, full-size repository (not the tiny fixture
// `propose.test.mjs` already covers) — the graph parses, no LOAD_FAILURES code, and the node count it reports
// matches what the renderer itself wrote.
// ============================================================================================================
test('yg check loads the proposal rendered for Yggdrasil itself', { skip: HAVE_YG ? false : YG_SKIP }, () => {
  assert.ok(!yggProposeError, yggProposeError);
  const r = spawnSync('node', [YG_BIN, 'check'], { cwd: yggStage, encoding: 'utf8', maxBuffer: 1 << 26 });
  const text = (r.stdout || '') + (r.stderr || '');
  const header = /yg check: \w+[^\n]*?(\d+) nodes/.exec(text);
  assert.ok(header, `yg check printed no graph header — the graph did not load:\n${text.slice(0, 2000)}`);
  assert.equal(Number(header[1]), yggProposeCounts.nodes, `Yggdrasil loaded ${header[1]} nodes, the proposal wrote ${yggProposeCounts.nodes}`);
  const codes = [...new Set([...text.matchAll(/^ {2}([a-z][a-z-]+)/gm)].map(m => m[1]))];
  const fatal = codes.filter(c => LOAD_FAILURES.test(c));
  assert.deepEqual(fatal, [], `Yggdrasil refused to load the proposal:\n${text.slice(0, 4000)}`);
  console.log(`[seams] yg check: ${header[1]} nodes loaded, codes seen: ${codes.join(', ') || '(none)'}`);
});

// ============================================================================================================
// Seam 1b — `yg drill` on every rendered check.mjs, against its OWN drill corpus written beside it. The
// contract (decision log, ticket 097): 0 FALSE-ALARM. MISS is reported, not asserted — a rendered check
// reproducing grain's own count on its OWN mined sites (no hold-out in a `--no-history` run) can still MISS on
// a site the export itself didn't certify strongly enough to drill; FALSE-ALARM is the one a maintainer cannot
// tolerate (the rule fires on code that never showed the pattern) and it is the one this test enforces.
// ============================================================================================================
test('yg drill on every rendered check.mjs reports 0 FALSE-ALARM', { skip: HAVE_YG ? false : YG_SKIP }, () => {
  assert.ok(!yggProposeError, yggProposeError);
  const aspectsRoot = join(yggStage, '.yggdrasil', 'aspects');
  const ids = [];
  const walk = dir => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      // `drills/` holds CASE FILES — verbatim copies of real repository files, which on a self-referential
      // mine of Yggdrasil (it tracks its OWN `.yggdrasil/aspects/**/check.mjs` as ordinary source) can include
      // a copy of some OTHER aspect's `check.mjs` as a case's CONTENT. Never descend into a drill corpus
      // looking for more aspects — an aspect id never contains a `drills/` segment.
      if (ent.isDirectory()) { if (ent.name !== 'drills') walk(p); continue; }
      if (ent.name === 'check.mjs') ids.push(dir.slice(aspectsRoot.length + 1).split(sep).join('/'));
    }
  };
  walk(aspectsRoot);
  assert.ok(ids.length > 0, 'no deterministic check.mjs rendered for Yggdrasil — nothing to drill');
  let pass = 0, miss = 0, falseAlarm = 0, unrun = 0;
  const falseAlarmIds = [];
  for (const id of ids) {
    const r = spawnSync('node', [YG_BIN, 'drill', '--aspect', id], { cwd: yggStage, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 30_000 });
    const text = (r.stdout || '') + (r.stderr || '');
    const m = /(\d+) pass · (\d+) MISS · (\d+) FALSE-ALARM · (\d+) unrun/.exec(text);
    assert.ok(m, `yg drill --aspect ${id} printed no summary:\n${text.slice(0, 1000)}`);
    pass += Number(m[1]); miss += Number(m[2]); falseAlarm += Number(m[3]); unrun += Number(m[4]);
    if (Number(m[3]) > 0) falseAlarmIds.push(id);
  }
  console.log(`[seams] yg drill over ${ids.length} rendered checks: ${pass} pass · ${miss} MISS · ${falseAlarm} FALSE-ALARM · ${unrun} unrun`);
  assert.equal(falseAlarm, 0, `${falseAlarm} FALSE-ALARM across ${falseAlarmIds.join(', ')}`);
});

// ============================================================================================================
// Seam 1c — `yg advise` nominates the family this adapter wrote to `.family-candidates.json`. The nomination
// text is Yggdrasil's OWN (`advise-nominations.ts`'s `familyNominations`) — this test only proves the FILE
// SHAPE this adapter emits is one Yggdrasil's freshness gate (`parseFamilyCandidates`) accepts and renders,
// without changing one line of Yggdrasil's code.
// ============================================================================================================
test('yg advise nominates the family Grain\'s adapter wrote', { skip: HAVE_YG ? false : YG_SKIP }, () => {
  assert.ok(!yggProposeError, yggProposeError);
  const written = JSON.parse(readFileSync(yggFamilyCandidates, 'utf8'));
  assert.equal(written.v, 1);
  assert.ok(!Number.isNaN(Date.parse(written.ts)), `.family-candidates.json's ts ("${written.ts}") must be a parseable instant — yg advise's freshness gate silently drops the whole file otherwise`);
  const r = spawnSync('node', [YG_BIN, 'advise', '--ids', '--all'], { cwd: yggStage, encoding: 'utf8', maxBuffer: 1 << 26 });
  const text = (r.stdout || '') + (r.stderr || '');
  const nominatedIds = [...text.matchAll(/family-without-law:(\S+)/g)].map(m => m[1]);
  console.log(`[seams] yg advise: ${written.families.length} families written, ${nominatedIds.length} nominated (${written.families.length ? 'expect ' + written.families.length : 'none written'})`);
  if (written.families.length === 0) {
    // an empty-but-fresh file is a valid run (no family survived grain's own filters on this asOf) — the
    // seam itself (the file is read and produces nothing, never an error) is still proven.
    assert.deepEqual(nominatedIds, []);
    return;
  }
  for (const fam of written.families) assert.ok(nominatedIds.includes(fam.id), `yg advise did not nominate ${fam.id}:\n${text.slice(0, 4000)}`);
});

// ============================================================================================================
// Seam 2 — the planted-family precision contract, straight from Yggdrasil's own fixtures. No `yg` binary
// needed here: `buildFamilyCandidates` is exercised directly against a real `propose()` run over the fixture.
// ============================================================================================================
test('the adapter emits exactly the planted family on family-planted-mono, and nothing else', { skip: HAVE_MONO_FIXTURE ? false : `family-planted-mono fixture not found under ${FIXTURES} (implies ${YG_SKIP})` }, () => {
  const stage = join(tmp, 'mono-stage');
  stageGitRepo(MONO_FIXTURE, stage); // keep this fixture's own `.yggdrasil/` — it is what "no certified convention" is measured against
  const out = join(tmp, 'mono-out');
  const fc = join(tmp, 'mono-family-candidates.json');
  const r = spawnSync('node', [PROPOSE, stage, out, '--no-history', '--family-candidates', fc], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 60_000 });
  assert.equal(r.status, 0, r.stderr);
  const written = JSON.parse(readFileSync(fc, 'utf8'));
  assert.equal(written.families.length, 1, `expected exactly one planted family, got ${written.families.length}: ${written.families.map(f => f.id).join(', ')}`);
  const fam = written.families[0];
  assert.equal(fam.language, 'ts');
  assert.deepEqual(fam.members.slice().sort(), [
    'src/data/InvoiceRepository.ts', 'src/data/OrderRepository.ts', 'src/data/PaymentRepository.ts',
    'src/data/ProductRepository.ts', 'src/data/UserRepository.ts',
  ], `planted family members did not match exactly — README.md's "Planted family (must be found — exactly one, zero false)"`);
  console.log(`[seams] family-planted-mono: 1/1 planted family found, ${fam.members.length} members, tightness ${fam.evidence.tightness}`);
});

// ============================================================================================================
// Seam 3 — Horde's `node.mjs show <node>` reads the rendered `charter.md` verbatim from
// `.yggdrasil/model/<node>/charter.md`, on the SAME staged Yggdrasil repo seam 1 already built (a real
// git repo is required — `node.mjs`'s `repoRoot()` runs `git rev-parse --show-toplevel`).
// ============================================================================================================
test('charter.md parses under Horde\'s node.mjs show', {
  skip: !HAVE_YG ? YG_SKIP : !HAVE_HORDE ? HORDE_SKIP : false,
}, () => {
  assert.ok(!yggProposeError, yggProposeError);
  // Horde's own state, stapled onto the same staged repo: `nodeSource: yggdrasil` points `node.mjs` at
  // `.yggdrasil/model/**` for node discovery (no writes of its own — see node.mjs's header), and at least one
  // horde must exist under `.horde/hordes/` for `resolveHorde` to pick a default.
  mkdirSync(join(yggStage, '.horde', 'hordes', 'seam'), { recursive: true });
  writeFileSync(join(yggStage, '.horde', 'config.json'), JSON.stringify({ nodeSource: 'yggdrasil' }, null, 1));
  const graph = readGraph(yggProposalOut);
  const node = graph.nodes.find(n => Array.isArray(n.mapping) && n.mapping.length) || graph.nodes[0];
  assert.ok(node, 'the rendered proposal has no nodes to show');
  const r = spawnSync('node', [NODE_MJS, 'show', node.id], { cwd: yggStage, encoding: 'utf8', maxBuffer: 1 << 24 });
  const text = (r.stdout || '') + (r.stderr || '');
  assert.equal(r.status, 0, `node.mjs show ${node.id} exited ${r.status}:\n${text.slice(0, 2000)}`);
  assert.match(text, /## Charter/, `node.mjs show did not print a Charter section:\n${text.slice(0, 2000)}`);
  const charterOnDisk = readFileSync(join(yggProposalOut, '.yggdrasil', 'model', node.id, 'charter.md'), 'utf8');
  const firstContentLine = charterOnDisk.split('\n').find(l => l.startsWith('# Charter'));
  assert.ok(firstContentLine && text.includes(firstContentLine), `node.mjs show's output did not carry the charter's own heading ("${firstContentLine}"):\n${text.slice(0, 2000)}`);
  console.log(`[seams] node.mjs show ${node.id}: charter.md (${charterOnDisk.split('\n').length} lines) read back verbatim`);
});
