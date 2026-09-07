#!/usr/bin/env node
// The integration stress test (instrument, ticket 101) — how much of what grain PROPOSES does Yggdrasil
// actually OPERATE ON, at what granularity, and does the proposal degrade honestly on hostile repositories.
//
//   node tests/stress/integration-stress.mjs --clones <dir> --out <dir> [options]
//
// Options:
//   --clones <dir>              directory of clones, one subdirectory per repo id (see corpus.json)
//   --out <dir>                 where proposals, stages and results are written
//   --repos a,b,c               measure only these repo ids (default: every subdirectory of --clones)
//   --only corpus|hostile       run one leg only
//   --hostile-work <dir>        the work directory `tests/stress/edge-cases.mjs` was pointed at
//   --subgate-per-partition <n> override propose.mjs's reading cap on sub-gate candidates per partition
//   --no-history                pass --no-history through to `grain export`
//   --keep-stages               do not delete each stage after measuring it (they are large)
//   --yg <bin.js>               the Yggdrasil CLI (default: $YG_BIN, then the usual checkout path)
//   --json <path>               the full per-element results
//   --md <path>                 the same matrix as markdown
//   --propose-timeout <s>       per-repository propose budget (default 1500)
//   --yg-timeout <s>            per-`yg`-invocation budget (default 1500)
//
// Ruling `granularity-bounded-by-evidence-not-taste` retired "precision against a hand-written graph" as the
// renderer's target and named its replacement in so many words: the share of proposed elements that
// (a) Yggdrasil LOADS, (b) produce PAIRS carrying a verdict, and (c) have a drill that CATCHES (at least one
// `violates-*` case refused) and does not FABRICATE (zero FALSE-ALARM). That share is the SENSE RATE, and this
// script measures it on a corpus of real repositories none of which carries a hand-written graph — so nothing
// here is a recall number, and nothing here is scored against anybody's taste.
//
// WHAT ONE REPOSITORY COSTS, in order:
//
//   1. `propose.mjs` over the clone (which runs `grain export` itself) → `<out>/proposals/<id>/.yggdrasil/`.
//   2. STAGE: a hard-linked copy of the clone's worktree with that `.yggdrasil/` dropped in. The clone is never
//      written to; the proposal is never written into the repository it describes.
//   3. `yg check` on the stage AS PROPOSED — every aspect `status: draft`. This is the honest baseline and it
//      is measured, not assumed: a draft aspect is DORMANT (`yg knowledge read aspect-status` — "draft removes
//      a pair from the expected set entirely"), so a proposal as shipped produces ZERO pairs by construction.
//   4. PROMOTE the DETERMINISTIC aspects (those that shipped a `check.mjs`) to `advisory`, at the aspect file
//      and at every attach site. Prose aspects (`content.md`) stay draft, and that is not a convenience: with a
//      prose aspect at advisory and no `reviewer:` in `yg-config.yaml`, `yg check --approve` ABORTS before
//      anything runs ("A judgment rule has no judge") — so a single prose draft promoted would take the free
//      deterministic leg down with it. Their sense rate under a keyless gate is therefore 0, by structure, and
//      the report says so rather than hiding them.
//   5. `yg check` again (loaded? errors by code?) and `yg check --approve --only-deterministic` (free, keyless),
//      then read `.yggdrasil/.yg-lock.deterministic.json` — the authoritative pair record: one entry per
//      (aspect, unit) with `verdict: approved | refused`.
//   6. `yg drill --aspect <id>` for every rendered check that has a corpus → pass / MISS / FALSE-ALARM.
//   7. SENSE RATE per kind, granularity distribution, wall time, peak RSS.
//
// THE THREE KINDS, and what "operated on" means for each. An aspect is the only element Yggdrasil judges code
// WITH; a type and a node are how a rule REACHES code. So the same four legs are applied through the
// attachment, never invented:
//
//   aspect  loads = named in the loaded graph and in no load-blocking error · pairs = >=1 unit with a verdict
//           · catches = >=1 `violates-*` case refused · no-FA = 0 FALSE-ALARM in its own drill.
//   type    loads = classifying (`when:`) and not named by a load-blocking error · pairs/catches/no-FA = the
//           legs of the aspects ATTACHED to it (>=1 pairs, >=1 catches, none false-alarms).
//   node    loads = same · pairs = >=1 verdict on a unit this node owns · catches/no-FA = over the aspects that
//           reached it.
//
// FLOORS (ruling `instrument-floors-allowed-if-stated-and-measured`). This script adds none of its own. It
// EXPOSES propose.mjs's, so their cost can be measured rather than defended: `--subgate-per-partition` (the
// READING cap, lifted for measurement exactly as 097 lifted it). `--min-type-files` (094's MIN_TYPE_FILES) was
// the other one — §5 of ticket 101's own report ran 2 against 1 on three repositories and found it not
// load-bearing (aspects, pairs, refusals, drill outcomes and FALSE-ALARMs were byte-identical between the two
// runs), so ruling `root-fix-accepted-min-type-files-goes` retired it and ticket 102 removed the flag from
// `propose.mjs` entirely. This script has nothing left to expose for it.
//
// Yggdrasil is READ-ONLY here: the only thing this script runs of Yggdrasil's is its built `bin.js`, always
// with the stage as cwd.
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PROPOSE = join(here, 'propose.mjs');
const GRAIN = resolve(here, '..', '..', 'bin', 'grain.mjs');
const YG_DEFAULT = '/home/user/Yggdrasil/source/cli/dist/bin.js';

// ==================================================================================================
// 1. Process plumbing — run a child, measure its wall time and the peak RSS of its whole process tree.
// ==================================================================================================

// Peak RSS is sampled, so it is a LOWER BOUND and is reported as such: a spike shorter than the sampling
// interval between two reads is invisible. It covers the whole tree (propose.mjs spawns `grain export`, and
// `yg check` spawns worker threads and per-commit subprocesses), because a number for the direct child alone
// would understate what the run actually needs on the machine.
const SAMPLE_MS = 120;

function treeRssKb(rootPid) {
  let total = 0;
  const byParent = new Map();
  const rss = new Map();
  let entries;
  try { entries = readdirSync('/proc'); } catch { return 0; }
  for (const e of entries) {
    if (!/^\d+$/.test(e)) continue;
    let stat;
    try { stat = readFileSync(`/proc/${e}/stat`, 'utf8'); } catch { continue; }
    const close = stat.lastIndexOf(')');
    const rest = stat.slice(close + 2).split(' ');
    const ppid = Number(rest[1]);
    const rssPages = Number(rest[21]);
    if (!Number.isFinite(ppid)) continue;
    if (!byParent.has(ppid)) byParent.set(ppid, []);
    byParent.get(ppid).push(Number(e));
    rss.set(Number(e), (rssPages || 0) * 4); // pages -> KiB (4 KiB pages)
  }
  const seen = new Set();
  const stack = [rootPid];
  while (stack.length) {
    const p = stack.pop();
    if (seen.has(p)) continue;
    seen.add(p);
    total += rss.get(p) || 0;
    for (const c of byParent.get(p) || []) stack.push(c);
  }
  return total;
}

// Kill the whole process GROUP on timeout — lesson `harness-timeouts-kill-process-group`: killing the direct
// child alone leaves `grain export`'s or `yg check`'s own children running and the machine slowly fills up.
export function runMeasured(cmd, args, { cwd, timeoutMs = 20 * 60_000, env } = {}) {
  return new Promise(res => {
    const t0 = Date.now();
    const child = spawn(cmd, args, { cwd, env: env || process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', peakKb = 0, timedOut = false;
    child.stdout.on('data', d => { out += d; if (out.length > 1 << 26) out = out.slice(-(1 << 25)); });
    child.stderr.on('data', d => { err += d; if (err.length > 1 << 24) err = err.slice(-(1 << 23)); });
    const sampler = setInterval(() => { const v = treeRssKb(child.pid); if (v > peakKb) peakKb = v; }, SAMPLE_MS);
    const killer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* group already gone */ }
    }, timeoutMs);
    child.on('close', code => {
      clearInterval(sampler); clearTimeout(killer);
      res({ code, out, err, timedOut, wallSeconds: +((Date.now() - t0) / 1000).toFixed(1), peakRssMb: +(peakKb / 1024).toFixed(1) });
    });
    child.on('error', e => {
      clearInterval(sampler); clearTimeout(killer);
      res({ code: -1, out, err: String(e.message), timedOut, wallSeconds: +((Date.now() - t0) / 1000).toFixed(1), peakRssMb: 0 });
    });
  });
}

// ==================================================================================================
// 2. Reading a rendered proposal off disk.
// ==================================================================================================

export function walkDirs(root, marker, prefix = []) {
  const out = [];
  if (!existsSync(root)) return out;
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const p = join(root, e.name);
    const id = [...prefix, e.name].join('/');
    if (existsSync(join(p, marker))) out.push({ id, dir: p });
    out.push(...walkDirs(p, marker, [...prefix, e.name]));
  }
  return out;
}

// The classifying types of a rendered `yg-architecture.yaml`, with the aspects attached to each. Read with a
// deliberately small line reader rather than a YAML parser: the file is written by `yamlEmit` in this same
// directory, its shape is fixed, and the instrument must not depend on a parser the graph loader does not use.
export function readArchitecture(text) {
  const types = new Map();
  let cur = null, inAspects = false, indent = 0;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line || /^\s*#/.test(line)) continue;
    const m = /^ {2}([A-Za-z0-9_./-]+):\s*$/.exec(line);
    if (m) { cur = { id: m[1], classifying: false, aspects: [], organizational: false }; types.set(m[1], cur); inAspects = false; continue; }
    if (!cur) continue;
    const lead = line.length - line.trimStart().length;
    if (/^ {4}when:/.test(line)) cur.classifying = true;
    if (/^ {4}aspects:\s*$/.test(line)) { inAspects = true; indent = 4; continue; }
    if (inAspects && lead <= indent) inAspects = false;
    if (inAspects) { const a = /-\s+id:\s*"?([^"\s]+)"?/.exec(line); if (a) cur.aspects.push(a[1]); }
  }
  for (const t of types.values()) if (!t.classifying) t.organizational = true;
  return types;
}

// A rendered node's own facts: mapping entries, declared type, attached aspects.
export function readNode(text) {
  const out = { type: null, mapping: [], aspects: [], relations: 0 };
  let section = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line || /^\s*#/.test(line)) continue;
    const t = /^type:\s*"?([^"\s]+)"?/.exec(line); if (t) { out.type = t[1]; section = null; continue; }
    if (/^mapping:\s*$/.test(line)) { section = 'mapping'; continue; }
    if (/^aspects:\s*$/.test(line)) { section = 'aspects'; continue; }
    if (/^relations:\s*$/.test(line)) { section = 'relations'; continue; }
    if (/^[a-z_]+:/.test(line)) { section = null; continue; }
    if (section === 'mapping') { const m = /-\s*"?([^"]+?)"?\s*$/.exec(line); if (m) out.mapping.push(m[1]); }
    if (section === 'aspects') { const a = /-\s+id:\s*"?([^"\s]+)"?/.exec(line); if (a) out.aspects.push(a[1]); }
    if (section === 'relations') { if (/-\s+target:/.test(line)) out.relations++; }
  }
  return out;
}

export function readProposal(propDir) {
  const ygg = join(propDir, '.yggdrasil');
  const types = readArchitecture(readFileSync(join(ygg, 'yg-architecture.yaml'), 'utf8'));
  const nodes = walkDirs(join(ygg, 'model'), 'yg-node.yaml').map(n => ({ id: n.id, dir: n.dir, ...readNode(readFileSync(join(n.dir, 'yg-node.yaml'), 'utf8')) }));
  const aspects = walkDirs(join(ygg, 'aspects'), 'yg-aspect.yaml').map(a => ({
    id: a.id, dir: a.dir,
    deterministic: existsSync(join(a.dir, 'check.mjs')),
    drills: drillCounts(join(a.dir, 'drills')),
  }));
  return { ygg, types, nodes, aspects };
}

// How many cases a rendered drill corpus holds per side. A drill with no `violates-*` case cannot CATCH, and a
// drill with no `satisfies-*` case cannot FALSE-ALARM — both are reported, because "FA = 0" over zero satisfies
// cases is a vacuous truth and calling it a pass would be the exact dishonesty this ticket is testing for.
export function drillCounts(drillDir) {
  const out = { satisfies: 0, violates: 0 };
  if (!existsSync(drillDir)) return out;
  for (const e of readdirSync(drillDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const side = e.name.startsWith('violates-') ? 'violates' : e.name.startsWith('satisfies-') ? 'satisfies' : null;
    if (!side) continue;
    out[side] += countFiles(join(drillDir, e.name));
  }
  return out;
}
function countFiles(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? countFiles(join(dir, e.name)) : 1;
  return n;
}

// ==================================================================================================
// 3. Staging, and the status promotion the measurement needs.
// ==================================================================================================

// A stage is a hard-linked copy of the clone's worktree. Hard links because a corpus of 18 repositories copied
// byte-for-byte is disk this machine does not have to spend: nothing in this run ever writes a source file, and
// everything Yggdrasil writes lands under `.yggdrasil/`, which is copied fresh.
export function stageRepo(clone, stage, propDir) {
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  try {
    const r = spawnSync('cp', ['-al', clone + '/.', stage + '/'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr);
  } catch {
    cpSync(clone, stage, { recursive: true });
  }
  rmSync(join(stage, '.grain'), { recursive: true, force: true });
  rmSync(join(stage, '.yggdrasil'), { recursive: true, force: true });
  cpSync(join(propDir, '.yggdrasil'), join(stage, '.yggdrasil'), { recursive: true });
}

// Promote exactly the named aspects from `draft` to `advisory`, at the aspect file AND at every attach site
// (`yg-architecture.yaml` and every `yg-node.yaml`). Both are required: an attach site left at `draft` under an
// aspect that now cascades `advisory` is `aspect-status-downgrade`, a blocking error — measured, that is 36
// errors on spring-petclinic alone.
export function promote(ygg, ids) {
  const want = new Set(ids);
  let aspectFiles = 0, attachSites = 0;
  for (const a of walkDirs(join(ygg, 'aspects'), 'yg-aspect.yaml')) {
    if (!want.has(a.id)) continue;
    const f = join(a.dir, 'yg-aspect.yaml');
    const t = readFileSync(f, 'utf8');
    const n = t.replace(/(^status:[ \t]*)draft[ \t]*$/m, '$1advisory');
    if (n !== t) { writeFileSync(f, n); aspectFiles++; }
  }
  const attachFiles = [join(ygg, 'yg-architecture.yaml'), ...walkDirs(join(ygg, 'model'), 'yg-node.yaml').map(n => join(n.dir, 'yg-node.yaml'))];
  for (const f of attachFiles) {
    if (!existsSync(f)) continue;
    const t = readFileSync(f, 'utf8');
    const n = t.replace(/(-[ \t]+id:[ \t]*"([^"]+)"[ \t]*\r?\n[ \t]*status:[ \t]*)draft/g, (m, head, id) => (want.has(id) ? head + 'advisory' : m));
    if (n !== t) { writeFileSync(f, n); attachSites++; }
  }
  return { aspectFiles, attachSites };
}

// ==================================================================================================
// 4. Reading `yg check` back.
// ==================================================================================================

// The header line: `yg check: PASS (2 warnings)  14 nodes · 131/132 files (99%) · 18 aspects · 0 flows · 18 draft`
export function parseCheckHeader(text) {
  const line = text.split('\n').find(l => l.startsWith('yg check:')) || '';
  const g = re => { const m = re.exec(line); return m ? Number(m[1]) : null; };
  return {
    header: line.trim(),
    verdict: /yg check:\s*(PASS|FAIL)/.exec(line)?.[1] || null,
    nodes: g(/(\d+) nodes/),
    filesMapped: g(/(\d+)\/\d+ files/),
    filesTotal: g(/\d+\/(\d+) files/),
    aspects: g(/(\d+) aspects/),
    flows: g(/(\d+) flows/),
    draft: g(/(\d+) draft/),
    verified: g(/(\d+) verified/),
  };
}

// The issue groups: `  <code>  N pairs  M nodes  ...` or `  <code> (N)` or a bare `  <code>`. Yggdrasil's own
// reference forbids piping this output through grep because a filter silently drops lines; this reads the WHOLE
// text and keys on the two section headers, so no line is dropped and the tallies reconcile with the header.
export function parseIssueCodes(text) {
  const out = { errors: {}, warnings: {}, errorCount: null, warningCount: null };
  let section = null;
  for (const raw of text.split('\n')) {
    const e = /^Errors \((\d+)\)/.exec(raw); if (e) { section = 'errors'; out.errorCount = Number(e[1]); continue; }
    const w = /^Warnings \((\d+)\)/.exec(raw); if (w) { section = 'warnings'; out.warningCount = Number(w[1]); continue; }
    if (/^Next:/.test(raw) || /^yg check:/.test(raw)) { if (/^Next:/.test(raw)) section = null; continue; }
    if (!section) continue;
    const m = /^ {2}([a-z][a-z0-9-]+)(?:\s+\((\d+)\))?(?:\s+(\d+) pairs)?/.exec(raw);
    if (!m) continue;
    const n = Number(m[3] ?? m[2] ?? 1);
    out[section][m[1]] = (out[section][m[1]] || 0) + n;
  }
  return out;
}

// Codes that mean THE GRAPH DID NOT COME IN — the proposal was refused, not merely found wanting. Everything
// else `yg check` reports is a finding ABOUT loaded content and counts as a load.
export const LOAD_BLOCKING = new Set([
  'architecture-invalid', 'node-invalid', 'aspect-invalid', 'graph-invalid', 'yaml-invalid', 'schema-invalid',
  'lock-invalid', 'aspect-missing', 'aspect-undefined', 'parent-type-forbidden', 'type-undefined',
  'aspect-status-downgrade', 'file-duplicate-mapping', 'node-cycle', 'config-invalid', 'unreadable',
]);

// `yg drill`'s summary line: `yg drill '<id>': 5 pass · 0 MISS · 0 FALSE-ALARM · 0 unrun · 0 unsupported ...`
export function parseDrill(text) {
  const m = /yg drill\s+'[^']*':\s*(\d+) pass\s*·\s*(\d+) MISS\s*·\s*(\d+) FALSE-ALARM\s*·\s*(\d+) unrun\s*·\s*(\d+) unsupported/.exec(text);
  if (!m) return null;
  return { pass: +m[1], miss: +m[2], falseAlarm: +m[3], unrun: +m[4], unsupported: +m[5] };
}

// ==================================================================================================
// 5. The sense rate.
// ==================================================================================================

// One element's four legs, and the conjunction. Split out so the guard test can exercise the arithmetic on
// synthetic rows without a corpus, and so the report can name WHICH leg dominates the loss.
export function senseOf(el) {
  const loads = !!el.loads;
  const pairs = loads && (el.pairs || 0) > 0;
  const catches = pairs && (el.violatesCases || 0) > 0 && (el.violatesCases - (el.miss || 0)) > 0;
  const noFalseAlarm = catches && (el.falseAlarm || 0) === 0;
  return { loads, pairs, catches, noFalseAlarm, sense: loads && pairs && catches && noFalseAlarm };
}

// Aggregate a list of scored elements into a rate plus the per-leg survivor counts. The legs are NESTED (each
// implies the one before it), so `legs` reads as a funnel and the drop between two adjacent numbers is exactly
// what that leg cost.
export function senseRate(elements) {
  const legs = { rendered: elements.length, loads: 0, pairs: 0, catches: 0, noFalseAlarm: 0 };
  for (const el of elements) {
    const s = senseOf(el);
    if (s.loads) legs.loads++;
    if (s.pairs) legs.pairs++;
    if (s.catches) legs.catches++;
    if (s.noFalseAlarm) legs.noFalseAlarm++;
  }
  return { ...legs, rate: elements.length ? +(legs.noFalseAlarm / elements.length).toFixed(3) : null };
}

// Files per element, one-file elements, rules per partition — the granularity distribution the ticket asks for.
export function distribution(values) {
  const xs = values.slice().sort((a, b) => a - b);
  if (!xs.length) return { n: 0, min: null, median: null, max: null, mean: null, ones: 0 };
  const at = q => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))];
  return {
    n: xs.length, min: xs[0], median: at(0.5), max: xs[xs.length - 1],
    mean: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2),
    ones: xs.filter(x => x === 1).length,
  };
}

// ==================================================================================================
// 6. One repository, end to end.
// ==================================================================================================

export async function measureRepo(id, clone, opts) {
  const t0 = Date.now();
  const row = { id, clone, skipped: null, steps: {} };
  const propDir = join(opts.out, 'proposals', id);
  const stage = join(opts.out, 'stages', id);

  // ---- 1. propose -------------------------------------------------------------------------------
  const proposeArgs = [PROPOSE, clone, propDir, '--quiet'];
  if (opts.subgate != null) proposeArgs.push('--subgate-per-partition', String(opts.subgate));
  if (opts.noHistory) proposeArgs.push('--no-history');
  const prop = await runMeasured('node', proposeArgs, { cwd: opts.out, timeoutMs: opts.proposeTimeoutMs });
  row.steps.propose = { code: prop.code, wallSeconds: prop.wallSeconds, peakRssMb: prop.peakRssMb, timedOut: prop.timedOut };
  if (prop.code !== 0 || !existsSync(join(propDir, '.yggdrasil'))) {
    row.skipped = prop.timedOut ? `propose timed out after ${opts.proposeTimeoutMs / 1000}s` : `propose exited ${prop.code}`;
    row.proposeStderrTail = prop.err.slice(-1200);
    row.wallSeconds = +((Date.now() - t0) / 1000).toFixed(1);
    return row;
  }
  const proposalJson = JSON.parse(readFileSync(join(propDir, 'proposal.json'), 'utf8'));
  row.counts = proposalJson.counts;
  row.filesTracked = proposalJson.files;

  const p = readProposal(propDir);
  const classifying = [...p.types.values()].filter(t => t.classifying);
  row.rendered = {
    types: classifying.length, organizationalTypes: p.types.size - classifying.length,
    nodes: p.nodes.length, aspects: p.aspects.length,
    aspectsDeterministic: p.aspects.filter(a => a.deterministic).length,
    aspectsProse: p.aspects.filter(a => !a.deterministic).length,
  };

  // ---- 2. stage ---------------------------------------------------------------------------------
  stageRepo(clone, stage, propDir);
  const yg = opts.yg;

  // ---- 3. AS PROPOSED: everything draft ---------------------------------------------------------
  const asProposed = await runMeasured('node', [yg, 'check'], { cwd: stage, timeoutMs: opts.ygTimeoutMs });
  row.asProposed = {
    exit: asProposed.code, timedOut: asProposed.timedOut, wallSeconds: asProposed.wallSeconds, peakRssMb: asProposed.peakRssMb,
    ...parseCheckHeader(asProposed.out), ...parseIssueCodes(asProposed.out),
  };
  row.asProposed.loadBlocking = Object.keys(row.asProposed.errors).filter(c => LOAD_BLOCKING.has(c));

  // ---- 4. promote the deterministic aspects -----------------------------------------------------
  const detIds = p.aspects.filter(a => a.deterministic).map(a => a.id);
  row.promoted = promote(p.ygg.replace(propDir, stage), detIds);
  row.promotedIds = detIds.length;

  // ---- 5. check + free deterministic fill --------------------------------------------------------
  const check = await runMeasured('node', [yg, 'check'], { cwd: stage, timeoutMs: opts.ygTimeoutMs });
  row.check = {
    exit: check.code, timedOut: check.timedOut, wallSeconds: check.wallSeconds, peakRssMb: check.peakRssMb,
    ...parseCheckHeader(check.out), ...parseIssueCodes(check.out),
  };
  row.check.loadBlocking = Object.keys(row.check.errors).filter(c => LOAD_BLOCKING.has(c));
  if (check.timedOut) row.checkStderrTail = check.err.slice(-800);

  const approve = await runMeasured('node', [yg, 'check', '--approve', '--only-deterministic', '--quiet'], { cwd: stage, timeoutMs: opts.ygTimeoutMs });
  row.approve = { exit: approve.code, timedOut: approve.timedOut, wallSeconds: approve.wallSeconds, peakRssMb: approve.peakRssMb, ...parseCheckHeader(approve.out) };
  if (approve.code !== 0 && !parseCheckHeader(approve.out).verdict) row.approve.stderrTail = approve.err.slice(-1200);

  // ---- 6. the pair record ------------------------------------------------------------------------
  const lockPath = join(stage, '.yggdrasil', '.yg-lock.deterministic.json');
  const byAspect = new Map();
  let unitsTotal = 0, refusedTotal = 0;
  if (existsSync(lockPath)) {
    let lock = null;
    try { lock = JSON.parse(readFileSync(lockPath, 'utf8')); } catch { lock = null; }
    for (const [aid, units] of Object.entries(lock?.verdicts || {})) {
      const keys = Object.keys(units);
      const refused = keys.filter(k => units[k].verdict === 'refused');
      byAspect.set(aid, { units: keys.length, refused: refused.length, unitKeys: keys });
      unitsTotal += keys.length; refusedTotal += refused.length;
    }
  }
  row.pairs = {
    lockPresent: existsSync(lockPath), aspectsWithPairs: byAspect.size, units: unitsTotal, refused: refusedTotal,
    approved: unitsTotal - refusedTotal,
    refusalShare: unitsTotal ? +(refusedTotal / unitsTotal).toFixed(3) : null,
  };

  // ---- 7. drills ---------------------------------------------------------------------------------
  const drills = new Map();
  for (const a of p.aspects) {
    if (!a.deterministic) continue;
    if (!a.drills.satisfies && !a.drills.violates) { drills.set(a.id, { ...a.drills, ran: false, reason: 'no corpus rendered' }); continue; }
    const d = await runMeasured('node', [yg, 'drill', '--aspect', a.id], { cwd: stage, timeoutMs: opts.drillTimeoutMs });
    const parsed = parseDrill(d.out + d.err);
    drills.set(a.id, parsed ? { ...a.drills, ran: true, ...parsed, exit: d.code } : { ...a.drills, ran: false, reason: `unparseable (exit ${d.code}${d.timedOut ? ', timed out' : ''})`, tail: (d.err || d.out).slice(-300) });
  }
  row.drillSummary = {
    aspectsDrilled: [...drills.values()].filter(d => d.ran).length,
    pass: [...drills.values()].reduce((a, d) => a + (d.pass || 0), 0),
    miss: [...drills.values()].reduce((a, d) => a + (d.miss || 0), 0),
    falseAlarm: [...drills.values()].reduce((a, d) => a + (d.falseAlarm || 0), 0),
    unrun: [...drills.values()].reduce((a, d) => a + (d.unrun || 0), 0),
    unsupported: [...drills.values()].reduce((a, d) => a + (d.unsupported || 0), 0),
    withSatisfiesCases: [...drills.values()].filter(d => d.ran && d.satisfies > 0).length,
    withViolatesCases: [...drills.values()].filter(d => d.ran && d.violates > 0).length,
  };
  row.falseAlarmingAspects = [...drills].filter(([, d]) => (d.falseAlarm || 0) > 0).map(([id, d]) => ({ id, falseAlarm: d.falseAlarm }));

  // ---- 8. score every element ---------------------------------------------------------------------
  const loadBlocked = row.check.loadBlocking.length > 0;
  const aspectRows = p.aspects.map(a => {
    const d = drills.get(a.id) || {};
    const pr = byAspect.get(a.id);
    return {
      id: a.id, deterministic: a.deterministic,
      loads: !loadBlocked && (row.check.aspects || 0) > 0,
      pairs: pr ? pr.units : 0, refused: pr ? pr.refused : 0,
      refusalShare: pr && pr.units ? +(pr.refused / pr.units).toFixed(3) : null,
      satisfiesCases: d.satisfies || 0, violatesCases: d.violates || 0,
      miss: d.miss ?? null, falseAlarm: d.falseAlarm ?? null, drillRan: !!d.ran,
    };
  });
  for (const r of aspectRows) { r.sense = senseOf(r).sense; }

  // A type's legs come from the aspects attached to it; a node's from the aspects that reached its units.
  const aspectById = new Map(aspectRows.map(a => [a.id, a]));
  const foldAspects = ids => {
    const rows = ids.map(i => aspectById.get(i)).filter(Boolean);
    return {
      pairs: rows.reduce((a, r) => a + r.pairs, 0),
      violatesCases: rows.reduce((a, r) => a + r.violatesCases, 0),
      miss: rows.reduce((a, r) => a + (r.miss || 0), 0),
      falseAlarm: rows.reduce((a, r) => a + (r.falseAlarm || 0), 0),
      attached: rows.length,
    };
  };
  const typeRows = classifying.map(t => ({ id: t.id, attachedAspects: t.aspects.length, loads: !loadBlocked, ...foldAspects(t.aspects) }));
  for (const r of typeRows) r.sense = senseOf(r).sense;

  // Which node owns a unit: the deepest node whose mapping covers that file (Yggdrasil's own child precedence).
  const nodeOfFile = rel => {
    let best = null;
    for (const n of p.nodes) {
      for (const m of n.mapping) {
        const hit = m.endsWith('/') ? rel.startsWith(m) : rel === m;
        if (hit && (!best || m.length > best.m.length)) best = { n, m };
      }
    }
    return best?.n?.id || null;
  };
  const nodeUnits = new Map();
  for (const [aid, rec] of byAspect) {
    for (const k of rec.unitKeys) {
      const rel = k.startsWith('file:') ? k.slice(5) : null;
      const nid = rel ? nodeOfFile(rel) : k.replace(/^node:/, '');
      if (!nid) continue;
      if (!nodeUnits.has(nid)) nodeUnits.set(nid, { units: 0, aspects: new Set() });
      const e = nodeUnits.get(nid); e.units++; e.aspects.add(aid);
    }
  }
  const nodeRows = p.nodes.map(n => {
    const u = nodeUnits.get(n.id);
    const folded = foldAspects([...(u?.aspects || [])]);
    return { id: n.id, mappedFiles: null, loads: !loadBlocked, pairs: u ? u.units : 0, violatesCases: folded.violatesCases, miss: folded.miss, falseAlarm: folded.falseAlarm };
  });
  for (const r of nodeRows) r.sense = senseOf(r).sense;

  row.sense = {
    types: senseRate(typeRows),
    nodes: senseRate(nodeRows),
    aspects: senseRate(aspectRows),
    aspectsDeterministic: senseRate(aspectRows.filter(a => a.deterministic)),
    aspectsProse: senseRate(aspectRows.filter(a => !a.deterministic)),
  };

  // ---- 9. granularity ------------------------------------------------------------------------------
  const filesPerNode = countFilesPerNode(stage, p.nodes);
  row.granularity = {
    filesPerNode: distribution([...filesPerNode.values()]),
    filesPerType: distribution((proposalJson.evidence || []).filter(e => e.kind === 'type' && e.selects != null).map(e => e.selects)),
    aspectsPerType: distribution(classifying.map(t => t.aspects.length)),
    unitsPerAspect: distribution(aspectRows.filter(a => a.deterministic).map(a => a.pairs)),
    drillCasesPerAspect: distribution(p.aspects.filter(a => a.deterministic).map(a => a.drills.satisfies + a.drills.violates)),
    oneFileNodes: [...filesPerNode.values()].filter(v => v === 1).length,
    zeroFileNodes: [...filesPerNode.values()].filter(v => v === 0).length,
  };

  row.detail = { aspects: aspectRows, types: typeRows, nodes: nodeRows };
  row.wallSeconds = +((Date.now() - t0) / 1000).toFixed(1);
  row.peakRssMb = Math.max(prop.peakRssMb, check.peakRssMb, approve.peakRssMb, asProposed.peakRssMb);
  if (opts.keepStages !== true) rmSync(stage, { recursive: true, force: true });
  return row;
}

function countFilesPerNode(stage, nodes) {
  const out = new Map();
  for (const n of nodes) {
    let c = 0;
    for (const m of n.mapping) {
      const p = join(stage, m);
      try {
        const st = statSync(p.replace(/\/$/, ''));
        c += st.isDirectory() ? countFiles(p.replace(/\/$/, '')) : 1;
      } catch { /* mapping entry resolves to nothing — counted as 0, and yg reports it */ }
    }
    out.set(n.id, c);
  }
  return out;
}

// ==================================================================================================
// 7. Hostile repositories.
//
// `tests/stress/edge-cases.mjs` builds hostile little repositories to prove GRAIN degrades without crashing.
// This reuses the built repositories and asks the next question: does the PROPOSAL degrade too? The contract has
// two halves and only the second is about content:
//
//   NO CRASH        — `propose.mjs` exits 0 and a staged `yg check` LOADS the graph (no load-blocking code).
//   NO FABRICATION  — a repository with no evidence yields no claim: zero conventions in the export must mean
//                     zero drafted aspects. An EMPTY proposal is a pass. A proposal that names a convention over
//                     zero evidence is the defect.
//
// An empty or minimal proposal passing is the whole point: the ticket's words are "an empty or minimal proposal
// is fine; a proposal Yggdrasil refuses to load, or one that claims a convention over zero evidence, is a defect".
// ==================================================================================================

// WHAT COUNTS AS FABRICATION, and what does not. The first version of this predicate called any aspect drafted
// where the export certified ZERO conventions a fabrication, and it fired on the shallow clone: history is
// unavailable there so nothing is certified, but the 5 aspects it drafted are SUB-GATE rows, cut from the HEAD
// tree, each carrying its own share, n and sites. That is evidence below the certification bound, not the
// absence of evidence, and the renderer labels it as such. The predicate now reads the per-aspect
// `provenance.json` the renderer writes and asks the only question that is actually about fabrication: does
// every drafted aspect name a positive number of sites it was measured on?
export function hostileContract(row) {
  const failures = [];
  if (row.proposeExit !== 0) failures.push(`propose exited ${row.proposeExit}${row.timedOut ? ' (timed out)' : ''}`);
  else {
    if (row.loadBlocking && row.loadBlocking.length) failures.push(`yg refused to load: ${row.loadBlocking.join(', ')}`);
    if ((row.aspectsWithoutSites || 0) > 0) failures.push(`fabrication: ${row.aspectsWithoutSites} aspect(s) drafted naming 0 measured sites`);
    if ((row.filesTracked || 0) === 0 && (row.types || 0) > 0) failures.push(`fabrication: ${row.types} types drafted over 0 tracked files`);
    if ((row.filesTracked || 0) === 0 && (row.aspects || 0) > 0) failures.push(`fabrication: ${row.aspects} aspect(s) drafted over 0 tracked files`);
  }
  return { ok: failures.length === 0, failures };
}

// Every rendered aspect writes a `provenance.json` carrying the structured record of what it was measured on.
// `n` is the conforming-site count; an aspect with none was measured on nothing.
export function aspectsWithoutSites(propDir) {
  let bad = 0, seen = 0;
  for (const a of walkDirs(join(propDir, '.yggdrasil', 'aspects'), 'yg-aspect.yaml')) {
    const f = join(a.dir, 'provenance.json');
    seen++;
    if (!existsSync(f)) { bad++; continue; } // an aspect with no provenance record at all names nothing
    try {
      const p = JSON.parse(readFileSync(f, 'utf8'));
      if (!(Number(p.n) > 0)) bad++;
    } catch { bad++; }
  }
  return { aspects: seen, withoutSites: bad };
}

export async function measureHostile(name, dir, opts) {
  const row = { name, dir };
  const propDir = join(opts.out, 'hostile-proposals', name);
  const stage = join(opts.out, 'hostile-stages', name);
  const prop = await runMeasured('node', [PROPOSE, dir, propDir, '--quiet'], { cwd: opts.out, timeoutMs: opts.hostileTimeoutMs });
  row.proposeExit = prop.code; row.timedOut = prop.timedOut;
  row.wallSeconds = prop.wallSeconds; row.peakRssMb = prop.peakRssMb;
  row.proposeStderrTail = prop.code === 0 ? null : prop.err.slice(-800);
  if (prop.code === 0 && existsSync(join(propDir, 'proposal.json'))) {
    const pj = JSON.parse(readFileSync(join(propDir, 'proposal.json'), 'utf8'));
    row.filesTracked = pj.files;
    row.types = pj.counts.types; row.nodes = pj.counts.nodes; row.aspects = pj.counts.aspects;
    // the export's own certified-convention count, read back from the evidence rows the renderer wrote
    row.conventions = (pj.evidence || []).filter(e => e.kind === 'aspect' && e.origin === 'certified-convention').length;
    row.subGateAspects = (pj.evidence || []).filter(e => e.kind === 'aspect' && e.origin !== 'certified-convention').length;
    const sites = aspectsWithoutSites(propDir);
    row.aspectsWithoutSites = sites.withoutSites;
    stageRepo(dir, stage, propDir);
    const check = await runMeasured('node', [opts.yg, 'check'], { cwd: stage, timeoutMs: opts.ygTimeoutMs });
    const codes = parseIssueCodes(check.out);
    row.check = { exit: check.code, timedOut: check.timedOut, ...parseCheckHeader(check.out), ...codes };
    row.loadBlocking = Object.keys(codes.errors).filter(c => LOAD_BLOCKING.has(c));
    if (row.loadBlocking.length) row.checkTail = check.out.slice(0, 1500);
    rmSync(stage, { recursive: true, force: true });
  }
  row.contract = hostileContract(row);
  return row;
}

// The repositories `edge-cases.mjs` leaves behind under its work directory, with what each one is FOR. Only
// directories that actually exist are measured; `edge-cases.mjs` itself skips what its environment cannot build
// (a submodule needs `protocol.file.allow`), and a skip is reported, never counted as a pass.
export const HOSTILE_CASES = [
  ['empty', 'git repo with no commits at all'],
  ['nocode', 'commits, but not one code file'],
  ['shallow', 'shallow clone — history unavailable'],
  ['symlinks', 'symlinked directory and symlinked file inside the tree'],
  ['hostile-files', '5 MB generated file, 2 MB minified bundle, latin-1 bytes, CRLF, spaces and parens in a path'],
  ['renames', 'a mass directory rename across the history'],
  ['tests-only', 'nothing but test files — mining-excluded, below every floor'],
  ['with-submodule', 'a git submodule inside the tree'],
  ['monorepo', 'nested package roots, each under the partition floor'],
  ['race', 'index left behind by two cold queries racing'],
  ['detached', 'detached HEAD, two commits back'],
  ['noindex', 'no grain index present at all'],
  ['newfile', 'an untracked new file and a deleted tracked file'],
  ['outside', 'the fixture, queried with a path outside the repo'],
  ['plain', 'a directory of code with NO git repository'],
  ['fixture-src', 'the plain fixture itself — the control'],
  ['sub-src', 'the fixture used as a submodule source — a second control'],
];

// ==================================================================================================
// 8. Rendering
// ==================================================================================================

const num = (v, d = 0) => (v == null ? '—' : typeof v === 'number' ? v.toFixed(d) : String(v));
const pctOf = v => (v == null ? '—' : `${(v * 100).toFixed(0)}%`);

export function renderMatrix(rows) {
  const head = '| repo | files | types / nodes / aspects (det+prose) | loads | pairs | refused | FA | sense: types | nodes | aspects(det) | files/node med | files/type med | wall s | peak MB |';
  const sep = '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const body = rows.map(r => {
    if (r.skipped) return `| \`${r.id}\` | — | — | — | — | — | — | — | — | — | — | — | ${num(r.wallSeconds, 1)} | — | (skipped: ${r.skipped}) |`.replace(' | (skipped', ' (skipped');
    const g = r.granularity;
    return `| \`${r.id}\` | ${r.filesTracked} | ${r.rendered.types} / ${r.rendered.nodes} / ${r.rendered.aspects} (${r.rendered.aspectsDeterministic}+${r.rendered.aspectsProse}) `
      + `| ${r.check.loadBlocking.length ? 'NO (' + r.check.loadBlocking.join(',') + ')' : 'yes'} | ${r.pairs.units} | ${r.pairs.refused} | ${r.drillSummary.falseAlarm} `
      + `| ${pctOf(r.sense.types.rate)} | ${pctOf(r.sense.nodes.rate)} | ${pctOf(r.sense.aspectsDeterministic.rate)} `
      + `| ${num(g.filesPerNode.median)} | ${num(g.filesPerType.median)} | ${num(r.wallSeconds, 1)} | ${num(r.peakRssMb, 0)} |`;
  });
  return [head, sep, ...body].join('\n');
}

export function renderHostile(rows) {
  const head = '| hostile repo | what it is | propose | files | types/nodes/aspects | conventions | yg loads | contract |';
  const sep = '|---|---|---|---|---|---|---|---|';
  return [head, sep, ...rows.map(r =>
    `| \`${r.name}\` | ${r.what || ''} | exit ${r.proposeExit}${r.timedOut ? ' (TIMEOUT)' : ''} | ${r.filesTracked ?? '—'} `
    + `| ${r.types ?? '—'}/${r.nodes ?? '—'}/${r.aspects ?? '—'} | ${r.conventions ?? '—'} `
    + `| ${r.check ? (r.loadBlocking.length ? 'NO (' + r.loadBlocking.join(',') + ')' : 'yes') : '—'} `
    + `| ${r.contract.ok ? 'held' : 'BROKEN: ' + r.contract.failures.join('; ')} |`)].join('\n');
}

// ==================================================================================================
// 9. Main
// ==================================================================================================

function parseArgs(argv) {
  const o = {
    clones: null, out: null, repos: null, yg: process.env.YG_BIN || YG_DEFAULT, json: null, md: null,
    subgate: null, noHistory: false, keepStages: false, hostileWork: null, only: null,
    proposeTimeoutMs: 25 * 60_000, ygTimeoutMs: 25 * 60_000, drillTimeoutMs: 5 * 60_000, hostileTimeoutMs: 10 * 60_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--clones') o.clones = resolve(argv[++i]);
    else if (a === '--out') o.out = resolve(argv[++i]);
    else if (a === '--repos') o.repos = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--yg') o.yg = resolve(argv[++i]);
    else if (a === '--json') o.json = resolve(argv[++i]);
    else if (a === '--md') o.md = resolve(argv[++i]);
    else if (a === '--subgate-per-partition') o.subgate = Number(argv[++i]);
    else if (a === '--no-history') o.noHistory = true;
    else if (a === '--keep-stages') o.keepStages = true;
    else if (a === '--hostile-work') o.hostileWork = resolve(argv[++i]);
    else if (a === '--only') o.only = argv[++i]; // 'corpus' | 'hostile'
    else if (a === '--propose-timeout') o.proposeTimeoutMs = Number(argv[++i]) * 1000;
    else if (a === '--yg-timeout') o.ygTimeoutMs = Number(argv[++i]) * 1000;
    else throw new Error(`unknown flag ${a}`);
  }
  if (!o.out) throw new Error('usage: node integration-stress.mjs --clones <dir> --out <dir> [--repos a,b] [--hostile-work <dir>] [--only corpus|hostile] [--subgate-per-partition N] [--yg <bin.js>] [--json <path>] [--md <path>]');
  return o;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  mkdirSync(opts.out, { recursive: true });
  const out = { instrument: 'integration-stress/1', ticket: '101', startedAt: new Date().toISOString(), yg: opts.yg, floors: { subGatePerPartition: opts.subgate }, repos: [], hostile: [] };
  const flush = () => { if (opts.json) writeFileSync(opts.json, JSON.stringify(out, null, 1)); };

  if (opts.only !== 'hostile' && opts.clones) {
    const ids = (opts.repos || readdirSync(opts.clones, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)).sort();
    for (const id of ids) {
      const clone = join(opts.clones, id);
      if (!existsSync(clone)) { out.repos.push({ id, skipped: 'clone missing' }); continue; }
      process.stderr.write(`[stress] ${id} ...\n`);
      const row = await measureRepo(id, clone, opts);
      out.repos.push(row);
      process.stderr.write(`[stress] ${id}: ${row.skipped ? 'SKIPPED — ' + row.skipped : `${row.pairs.units} units, ${row.pairs.refused} refused, FA ${row.drillSummary.falseAlarm}, sense det-aspects ${pctOf(row.sense.aspectsDeterministic.rate)}, ${row.wallSeconds}s, ${row.peakRssMb} MB`}\n`);
      flush();
    }
  }

  if (opts.only !== 'corpus' && opts.hostileWork) {
    for (const [name, what] of HOSTILE_CASES) {
      const dir = join(opts.hostileWork, name);
      if (!existsSync(dir)) { out.hostile.push({ name, what, skipped: 'not built by edge-cases.mjs in this environment' }); continue; }
      process.stderr.write(`[stress] hostile ${name} ...\n`);
      const row = await measureHostile(name, dir, opts);
      row.what = what;
      out.hostile.push(row);
      process.stderr.write(`[stress] hostile ${name}: ${row.contract.ok ? 'contract held' : 'BROKEN — ' + row.contract.failures.join('; ')}\n`);
      flush();
    }
  }

  out.finishedAt = new Date().toISOString();
  flush();
  const scored = out.repos.filter(r => !r.skipped);
  if (scored.length) {
    process.stdout.write('\n' + renderMatrix(out.repos) + '\n');
    const totals = kind => {
      const legs = { rendered: 0, loads: 0, pairs: 0, catches: 0, noFalseAlarm: 0 };
      for (const r of scored) for (const k of Object.keys(legs)) legs[k] += r.sense[kind][k];
      return { ...legs, rate: legs.rendered ? +(legs.noFalseAlarm / legs.rendered).toFixed(3) : null };
    };
    out.pooled = { types: totals('types'), nodes: totals('nodes'), aspects: totals('aspects'), aspectsDeterministic: totals('aspectsDeterministic'), aspectsProse: totals('aspectsProse') };
    process.stdout.write('\nPOOLED SENSE RATE (funnel: rendered -> loads -> pairs -> catches -> no-FA)\n');
    for (const [k, v] of Object.entries(out.pooled)) {
      process.stdout.write(`  ${k.padEnd(22)} ${v.rendered} -> ${v.loads} -> ${v.pairs} -> ${v.catches} -> ${v.noFalseAlarm}   rate ${pctOf(v.rate)}\n`);
    }
    flush();
  }
  if (out.hostile.length) process.stdout.write('\n' + renderHostile(out.hostile.filter(h => !h.skipped)) + '\n');

  // The same matrix as markdown on disk, beside the JSON — the ticket asks for both.
  if (opts.md) {
    const md = [`# integration-stress — ${out.startedAt}`, '', `yg: \`${out.yg}\``,
      `floors: SUBGATE_PER_PARTITION=${opts.subgate ?? '6 (default)'}`, ''];
    if (scored.length) {
      md.push('## Corpus', '', renderMatrix(out.repos), '', '## Pooled sense rate (rendered -> loads -> pairs -> catches -> no-FA)', '',
        '| kind | rendered | loads | pairs | catches | no-FA | rate |', '|---|---|---|---|---|---|---|',
        ...Object.entries(out.pooled).map(([k, v]) => `| ${k} | ${v.rendered} | ${v.loads} | ${v.pairs} | ${v.catches} | ${v.noFalseAlarm} | ${pctOf(v.rate)} |`), '');
    }
    if (out.hostile.length) md.push('## Hostile repositories', '', renderHostile(out.hostile.filter(h => !h.skipped)), '');
    writeFileSync(opts.md, md.join('\n'));
    process.stdout.write(`\nmarkdown matrix written to ${opts.md}\n`);
  }
}
