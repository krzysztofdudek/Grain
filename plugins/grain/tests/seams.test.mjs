// Seam tests (ticket 100) — the family's contracts, driven through the NEIGHBOUR PROJECTS' OWN real binaries,
// never a re-implementation of either. Five seams:
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
//   3. THE PROPOSAL CONTRACT WITHOUT A CHARTER (ticket 026). `yg node <path> --json`, run by the real Yggdrasil
//      CLI against the SAME staged repo from seam 1, returns the `description` grain wrote into `yg-node.yaml`
//      — and no `charter.md` exists anywhere under the tree grain rendered. This is Yggdrasil-only: reading the
//      node through `yg node --json` is exactly what sidesteps the coupling to Horde a charter.md used to need.
//   4. GRAIN'S OWN ADVICE PARSES UNDER HORDE. A real `grain advise --json` run against the SAME staged (now
//      adopted-equivalent) repo is handed to a real Horde checkout's `queue.mjs quality --from` — proving the
//      `grain-advice/1` document this repo writes is the one document Horde's quality pass reads, never a
//      re-implementation of the schema on either side.
//   5. THE FAMILY-CONTRACTS REGISTER IS THE WHOLE TRUTH (ticket 027). `YGG_DIR/docs/family-contracts.md` names
//      every machine document the family exchanges. This seam is the only CI with all three checkouts at once,
//      so it is the only place that can hold the page to all three: every schema id Horde's scripts name, and
//      every one Grain's engine writes, must have a row. Pure file reads — no binary is run.
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
const GRAIN_BIN = join(here, '..', 'bin', 'grain.mjs');

const YG_BIN = process.env.YG_BIN || '/home/user/Yggdrasil/source/cli/dist/bin.js';
// `YG_BIN` is `<repo>/source/cli/dist/bin.js` — the checkout root is three directories up. `YGG_DIR` overrides
// this when the layout differs (e.g. a CI checkout under a different name).
const YGG_DIR = process.env.YGG_DIR || resolve(dirname(YG_BIN), '..', '..', '..');
const HAVE_YG = existsSync(YG_BIN) && existsSync(join(YGG_DIR, '.git'));
const YG_SKIP = `Yggdrasil binary/checkout not found (looked for ${YG_BIN} and a git repo at ${YGG_DIR} — set YG_BIN / YGG_DIR)`;

const HORDE_DIR = process.env.HORDE_DIR || '/home/user/krzysztofdudek/horde';
const NODE_MJS = join(HORDE_DIR, 'skills', 'horde', 'scripts', 'node.mjs');
const QUEUE_MJS = join(HORDE_DIR, 'skills', 'horde', 'scripts', 'queue.mjs');
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
// Seam 3 — the proposal contract without a charter (ticket 026). `yg node <path> --json`, the real Yggdrasil
// CLI, reads the rendered `.yggdrasil/` tree from the SAME staged repo seam 1 already built, and its
// `description` is the fact a `charter.md` used to open with. No `charter.md` exists anywhere under the tree
// this run wrote — asserted recursively, not on one node, since a stub check on the node happened to look at
// is exactly the kind of regression a wipe elsewhere in the tree would hide.
// ============================================================================================================
test('yg node <path> --json returns Grain\'s own description, and the proposal has no charter.md anywhere', { skip: HAVE_YG ? false : YG_SKIP }, () => {
  assert.ok(!yggProposeError, yggProposeError);
  const graph = readGraph(yggProposalOut);
  const node = graph.nodes.find(n => Array.isArray(n.mapping) && n.mapping.length) || graph.nodes[0];
  assert.ok(node, 'the rendered proposal has no nodes to show');
  const r = spawnSync('node', [YG_BIN, 'node', node.id, '--json'], { cwd: yggStage, encoding: 'utf8', maxBuffer: 1 << 24 });
  const text = (r.stdout || '') + (r.stderr || '');
  assert.equal(r.status, 0, `yg node ${node.id} --json exited ${r.status}:\n${text.slice(0, 2000)}`);
  const doc = JSON.parse(r.stdout);
  assert.equal(doc.description, node.description, `yg node --json's description does not match what grain wrote into ${node.id}'s yg-node.yaml`);
  assert.ok(doc.description && doc.description.length, 'the description read back is empty');

  const charterFiles = [];
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name === 'charter.md') charterFiles.push(p);
    }
  };
  walk(join(yggProposalOut, '.yggdrasil'));
  assert.deepEqual(charterFiles, [], `a charter.md is still written: ${charterFiles.join(', ')}`);
  console.log(`[seams] yg node ${node.id} --json: description read back verbatim, no charter.md under .yggdrasil/`);
});

// ============================================================================================================
// Seam 4 — grain's own advice parses under Horde. A real `grain advise --json` run against the SAME staged
// (now adopted-equivalent) repo is handed to a real Horde checkout's `queue.mjs quality --from` — the path
// `readAdvice`/`parseAdvice` (Horde's `skills/horde/scripts/queue.mjs`) read a `grain-advice/1` document
// through, whether Horde calls Grain itself (`grainCommand`) or is handed a file grain already wrote. `--from`
// exercises the file path directly so this seam does not also need a `grainCommand` wired into `.horde/config.json`.
// `--dry-run --all` keeps the run to parsing and matching: no ticket, no queue, no roster file is needed for the
// document to prove it is the schema Horde expects.
// ============================================================================================================
test('grain advise --json parses under Horde\'s queue.mjs quality', {
  skip: !HAVE_YG ? YG_SKIP : !HAVE_HORDE ? HORDE_SKIP : false,
}, () => {
  assert.ok(!yggProposeError, yggProposeError);
  // Horde's own state, stapled onto the same staged repo: at least one horde must exist under `.horde/hordes/`
  // for `resolveHorde` to pick a default, and `config.json` carries only the keys Horde actually reads for this
  // command (`ygCommand`, so `nodeExists` can resolve `yg node --json`; `base`/`gates` alongside it for a
  // realistic config, not because this command reads them) — not `nodeSource`, which nothing in Horde reads at
  // all (audit 2026-09-09).
  mkdirSync(join(yggStage, '.horde', 'hordes', 'seam'), { recursive: true });
  writeFileSync(join(yggStage, '.horde', 'config.json'), JSON.stringify({
    base: 'main', gates: { commit: '', team: '', trunk: '' }, ygCommand: `node ${YG_BIN}`,
  }, null, 1));

  const advicePath = join(tmp, 'grain-advice.json');
  const g = spawnSync('node', [GRAIN_BIN, 'advise', '--json'], { cwd: yggStage, encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.equal(g.status, 0, `grain advise --json exited ${g.status}:\n${(g.stdout || '') + (g.stderr || '')}`);
  writeFileSync(advicePath, g.stdout);
  const advice = JSON.parse(g.stdout);
  assert.equal(advice.schema, 'grain-advice/1');

  const r = spawnSync('node', [QUEUE_MJS, 'quality', '--from', advicePath, '--dry-run', '--all', '--json'], { cwd: yggStage, encoding: 'utf8', maxBuffer: 1 << 24 });
  const text = (r.stdout || '') + (r.stderr || '');
  assert.equal(r.status, 0, `queue.mjs quality --from exited ${r.status}:\n${text.slice(0, 2000)}`);
  assert.doesNotMatch(text, /does not hold a grain-advice\/1 document/, `Horde refused grain's own document:\n${text.slice(0, 2000)}`);
  const doc = JSON.parse(r.stdout);
  assert.equal(doc.ran, true);
  assert.equal(doc.source, advicePath);
  assert.ok(Array.isArray(doc.filed) && Array.isArray(doc.skipped), `unexpected shape: ${text.slice(0, 500)}`);
  console.log(`[seams] queue.mjs quality --from: ${advice.items.length} advice item(s), ${doc.filed.length} would be filed, ${doc.skipped.length} skipped`);
});

// ============================================================================================================
// Seam 5 — the family-contracts register is the whole truth (ticket 027). `YGG_DIR/docs/family-contracts.md`
// is the one page naming every machine document the family exchanges, its schema id, its producer and its
// consumers. Yggdrasil's own unit test holds that page to Yggdrasil's `src/formatters/` constants; it cannot
// see the other two repositories. THIS job can — it is the only CI with all three checkouts at once — so this
// is where a document Horde reads, or Grain writes, that nobody added a row for turns something red.
//
// No binary is run: three trees are read with `node:fs` and compared. Horde's scripts are read with
// `readFileSync` as TEXT rather than grepped from a shell — `escalate.mjs` has carried a literal NUL byte,
// which makes grep/rg treat the file as binary and say nothing at all, and a scanner that silently skips a
// file is exactly the drift this seam exists to catch. The assertion below pins that the file was opened.
//
// The table parser is a SECOND, INDEPENDENT COPY of the one in Yggdrasil's
// `tests/unit/repo/family-contracts-invariant.test.ts`. Deliberately duplicated: this job cannot import
// Yggdrasil's TypeScript, and ten lines of regex copied once is cheaper than a shared package three
// repositories would have to version together. If the page's table shape ever changes, both copies move.
// ============================================================================================================

const HORDE_SCRIPTS_DIR = join(HORDE_DIR, 'skills', 'horde', 'scripts');
const HAVE_HORDE_SCRIPTS = existsSync(HORDE_SCRIPTS_DIR);
const HORDE_SCRIPTS_SKIP = `Horde checkout has no skills/horde/scripts/ (looked in ${HORDE_SCRIPTS_DIR} — set HORDE_DIR)`;
const HAVE_YGG_CHECKOUT = existsSync(join(YGG_DIR, '.git'));
const YGG_CHECKOUT_SKIP = `Yggdrasil checkout not found (looked for a git repo at ${YGG_DIR} — set YG_BIN / YGG_DIR)`;

// A family schema id: a lowercase, HYPHENATED name and a version number — `yg-check/1`, `horde-law/1`,
// `grain-advice/1`. The hyphen is required so an ordinary path or media type in a string literal
// (`application/1`, `skills/2`) is never mistaken for a contract.
const SCHEMA_ID = '[a-z][a-z0-9]*(?:-[a-z0-9]+)+\\/\\d+';

/** Every quoted family schema id in one source file's text, each with the 1-based line it sits on. */
function schemaIdsInSource(text) {
  const re = new RegExp(`['"\`](${SCHEMA_ID})['"\`]`, 'g');
  const found = [];
  text.split(/\r?\n/).forEach((line, i) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) !== null) found.push({ id: m[1], line: i + 1 });
  });
  return found;
}

/**
 * Scan every `.mjs` under `dir` for family schema ids. Returns the map id → "file:line" of the FIRST sighting
 * (so a refusal can say which side of the seam moved) and the list of files actually opened.
 */
function scanSchemaIds(dir) {
  const where = new Map();
  const opened = [];
  for (const name of readdirSync(dir).filter(f => f.endsWith('.mjs')).sort()) {
    const text = readFileSync(join(dir, name), 'utf8'); // as TEXT — a NUL byte must not silence the file
    opened.push(name);
    for (const { id, line } of schemaIdsInSource(text)) {
      if (!where.has(id)) where.set(id, `${name}:${line}`);
    }
  }
  return { where, opened };
}

/** Parse every markdown table on the page. The duplicate of Yggdrasil's own parser — see the note above. */
function parseTables(page) {
  const lines = page.split(/\r?\n/);
  const cellsOf = line => {
    const t = line.trim();
    if (!t.startsWith('|') || !t.endsWith('|') || t.length < 2) return null;
    return t.slice(1, -1).split('|').map(c => c.trim());
  };
  const isSeparator = cells => cells !== null && cells.length > 0 && cells.every(c => /^:?-{3,}:?$/.test(c));
  const tables = [];
  for (let i = 0; i < lines.length; i++) {
    const header = cellsOf(lines[i]);
    if (header === null || isSeparator(header)) continue;
    if (!isSeparator(cellsOf(lines[i + 1] ?? ''))) continue;
    const rows = [];
    let j = i + 2;
    for (; j < lines.length; j++) {
      const cells = cellsOf(lines[j]);
      if (cells === null) break;
      rows.push({ line: j + 1, cells });
    }
    tables.push({ headerLine: i + 1, headerText: lines[i].trim(), header, rows });
    i = j - 1;
  }
  return tables;
}

/** The schema id a table row declares, or null when it deliberately declares none. */
function rowSchemaId(cell) {
  const m = cell.replace(/`/g, '').trim().match(new RegExp(`^(${SCHEMA_ID})`));
  return m ? m[1] : null;
}

test('every schema id Horde reads and Grain writes has a row on Yggdrasil\'s family-contracts page', {
  skip: !HAVE_YGG_CHECKOUT ? YGG_CHECKOUT_SKIP : !HAVE_HORDE_SCRIPTS ? HORDE_SCRIPTS_SKIP : false,
}, () => {
  // A missing page is a REFUSAL naming the path, never a skip: the checkout is here, so the page's absence is
  // the drift, not a missing neighbour.
  const pagePath = join(YGG_DIR, 'docs', 'family-contracts.md');
  assert.ok(existsSync(pagePath), `the family-contracts register is missing: ${pagePath} does not exist in the Yggdrasil checkout`);
  const page = readFileSync(pagePath, 'utf8');

  // The table's shape, before anything is read out of it.
  const tables = parseTables(page);
  assert.equal(tables.length, 1, `expected exactly one table on ${pagePath}, found ${tables.length}`);
  const [table] = tables;
  assert.equal(table.header.length, 6,
    `the register's header row has ${table.header.length} columns, expected 6 — line ${table.headerLine}: ${table.headerText}`);
  assert.ok(table.rows.length > 0, `the register at ${pagePath} has a header and no rows`);

  const rowById = new Map();
  for (const row of table.rows) {
    const id = rowSchemaId(row.cells[1] ?? '');
    if (id !== null) rowById.set(id, row);
  }

  // What Horde reads and writes. An EMPTY result is a refusal, not a pass: an empty set satisfies every
  // containment assertion below, which makes it the quietest way this seam could ever break.
  const horde = scanSchemaIds(HORDE_SCRIPTS_DIR);
  assert.ok(horde.opened.length > 0, `scanned ${HORDE_SCRIPTS_DIR} and opened no .mjs file at all`);
  assert.ok(horde.where.size > 0,
    `scanned ${horde.opened.length} Horde script(s) under ${HORDE_SCRIPTS_DIR} and found no schema id — the scan, `
    + 'not the page, is what broke: an empty set passes every assertion below silently');
  // The NUL-byte file must be among the files the scan opened. `escalate.mjs` has carried a literal NUL, which
  // makes a shell grep treat it as binary and report nothing; reading it as text is what keeps it in the scan.
  assert.ok(horde.opened.includes('escalate.mjs'),
    `escalate.mjs was not among the ${horde.opened.length} Horde script(s) the scan opened — a file that goes `
    + `silent takes its contracts with it. Opened: ${horde.opened.join(', ')}`);

  // What Grain writes, read out of its own engine rather than hard-coded, so a new Grain document is caught
  // here the day it lands.
  const grainEngineDir = join(here, '..', 'engine');
  const grain = scanSchemaIds(grainEngineDir);
  assert.ok(grain.where.size > 0, `scanned ${grainEngineDir} and found no grain-* schema id`);

  const missing = [];
  for (const [id, at] of [...horde.where].sort()) {
    if (!rowById.has(id)) missing.push(`${id} — read or written by Horde at skills/horde/scripts/${at}`);
  }
  for (const [id, at] of [...grain.where].sort()) {
    if (!rowById.has(id)) missing.push(`${id} — written by Grain at plugins/grain/engine/${at}`);
  }
  assert.deepEqual(missing, [],
    `these schema ids cross the seam but have no row on ${pagePath}:\n  ${missing.join('\n  ')}\n`
    + 'Add a row (document, schema id, producer, consumers, since, described where) — the page is this seam\'s '
    + 'only source of truth.');

  // `.family-candidates.json` carries no `schema` field at all — it versions itself by `v`. Deciding whether to
  // give it an identifier is a contract change and a separate decision; until then the page must say so, and
  // this seam holds it to saying it rather than quietly dropping the document.
  assert.match(page, /\.family-candidates\.json/,
    `${pagePath} has no row for .family-candidates.json — the one document in the family with no schema id, `
    + 'versioned by its `v` field (Grain writes it, yg advise reads it)');

  // A row for a document none of the three repositories names is allowed ONLY when the page itself says where
  // it comes from — a non-empty producer column. Anything else is a ghost row.
  const known = new Set([...horde.where.keys(), ...grain.where.keys()]);
  const ghosts = [];
  const notes = [];
  for (const [id, row] of rowById) {
    if (known.has(id)) continue;
    const producer = (row.cells[2] ?? '').trim();
    if (producer === '') ghosts.push(`${id} (line ${row.line}) — no producer named`);
    else notes.push(`${id} — produced by ${producer}`);
  }
  assert.deepEqual(ghosts, [],
    `ghost rows on ${pagePath}: ${ghosts.join('; ')}. Neither Horde nor Grain names these, and the page does `
    + 'not say who produces them either.');

  // A document dropped from Horde but still listed is NOT an error — the page is a register of the release's
  // history, and a consumer on an older version still reads it. It is worth saying out loud, though.
  if (notes.length) console.log(`[seams] family-contracts: ${notes.length} row(s) no Horde or Grain source names — ${notes.join(', ')}`);
  console.log(`[seams] family-contracts: ${rowById.size} row(s); ${horde.where.size} id(s) across ${horde.opened.length} Horde script(s), ${grain.where.size} written by Grain — all present`);
});
