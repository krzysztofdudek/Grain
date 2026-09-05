#!/usr/bin/env node
//
// law-loop.mjs — THE LAW LOOP, MEASURED (ticket 097).
//
// The question: can rules RENDERED from grain's mined practice reproduce, IN VERDICT, the deterministic rules a
// maintainer wrote by hand — with a hold-out by TIME that keeps the rule and the drill from being the same data
// twice?
//
// The shape of the run, and why each leg exists:
//
//   1. THE CUT.  A sha at ~70% of the pattern repo's history. Everything the miner is allowed to see stops
//      there. `--cut <sha>` names it; `--cut-fraction` derives it. Every corpus id names the cut sha.
//   2. CANDIDATES.  `propose.mjs` (094) renders the at-cut export into `.yggdrasil/aspects/<id>/{yg-aspect.yaml,
//      check.mjs}`. This instrument adds `provenance.json` per candidate — {conventionId, partition, share, n,
//      asOf, cutSha, enumeratorClass} — the record counsel-2 §2.3 asks every generated rule to carry.
//   3. HELD-OUT DRILL CORPORA (I10).  Cases are cut ONLY from files whose git FIRST APPEARANCE post-dates the
//      cut sha, on the post-cut tree — not by the `lifecycle.firstSeen` date propose.mjs uses, which can only
//      see sites the at-cut export already held. The label comes from the HEAD measurement, never from the
//      candidate's own check: a case is `violates-` where the LATER export (or the later lattice) records that
//      site as deviating, `satisfies-` where it records it as conforming. I10 = corpora whose every case
//      post-dates the cut ÷ corpora, verified against git rather than asserted.
//   4. VERDICT REPRODUCTION.  For each of the pattern repo's deterministic HAND aspects, every candidate is
//      drilled against THAT HAND RULE'S OWN case corpus — the maintainer's labelled ground truth. A candidate
//      REPRODUCES a hand rule in verdict when it refuses every `violates-` case and no `satisfies-` case: the
//      same refused set on the same units. Jaccard of the two refused sets is reported for the best near-miss.
//      Running both rules over the repository's HEAD tree instead was measured and is reported as the
//      degenerate comparison it is — a repository whose CI already enforces its own rules refuses nothing, so
//      every candidate "agrees" with every hand rule on an empty set.
//   5. THE SHAPE-CHECK BET.  A hand rule that names no identifier cannot be reached by a name. The export's
//      role-group superposition (`profile.req` — the node types every member of the group holds in common, with
//      counts) is a SHAPE, so it is rendered as a deterministic shape check and drilled against exactly those
//      hand rules. Reported honestly, including the direction the false alarms run.
//   6. REPLAY.  `yg simulate <candidate> --node <n>` over the post-cut commit window, with the survivorship
//      caveat the tool prints. The candidate is overlaid on the repository's OWN graph, because a proposed node
//      does not exist in the committed history and `simulate` then reports `non-comparable` for every commit —
//      itself a finding, and measured both ways.
//   7. RETIREMENT.  For each `decorative?` rule `yg aspects --health` names: does an auto-cut drill exist, and
//      does it catch?
//   8. THE SAMPLE.  Candidates that survive their held-out drill with zero false alarms and have no hand
//      counterpart, with the evidence a maintainer needs to classify them (a) miner-miss / (b) graph-debt /
//      (c) undecidable. This instrument PREPARES that sample. It never classifies it.
//
// Floors, named (ruling `instrument-floors-allowed-if-stated-and-measured`):
//   CASES_PER_SIDE = 5    cases kept per corpus side, the same cap propose.mjs uses for its own drills.
//   MIN_CASES      = 1    a corpus with no case at all is not drilled; the count is published, never hidden.
//   SUBGATE_LIFT   —      propose.mjs's SUBGATE_PER_PARTITION is a READING cap. A measurement run lifts it
//                         (`--subgate-per-partition`) and reports the cost of not doing so.
// Nothing here enters the engine, and no threshold decides any verdict: every gate is a contract (0 MISS /
// 0 FALSE-ALARM) or a count.
//
// Usage:
//   node law-loop.mjs --repo <clone at HEAD> --at-cut <clone at the cut> --cut <sha> \
//     --export-head <json> --export-cut <json> --proposal <dir written by propose.mjs> \
//     --out <dir> [--yg <bin.js>] [--jobs N] [--max-commits N] [--json <path>] [--stages a,b,c]
//
// The pattern repository is READ-ONLY: every clone, stage and corpus is written under --out.

import { execFileSync, execFile } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, cpSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readGraph, expandWhen, subtreeFileSets, jaccard, parseYaml,
} from './reconstruct.mjs';
import { partitionLattice, subGate, slug } from './propose.mjs';

// ---- named instrument floors -------------------------------------------------------------------
export const CASES_PER_SIDE = 5;   // the same cap propose.mjs's own drill cutter uses
export const MIN_CASES = 1;        // a corpus of zero cases is reported as absent, never drilled

const YG_DEFAULT = '/home/user/Yggdrasil/source/cli/dist/bin.js';

// ==================================================================================================
// 0. small helpers
// ==================================================================================================
const git = (repo, args, max = 1 << 30) =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: max });
const gitFiles = repo => git(repo, ['ls-files']).split('\n').filter(Boolean);
const write = (p, s) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); };
const say = (opts, msg) => { if (!opts.quiet) process.stderr.write(`[law-loop] ${msg}\n`); };
const pct = x => `${(x * 100).toFixed(1)}%`;

function walkFiles(dir, pred = () => true, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out;
}

// Run N shell tasks with bounded concurrency. Every leg of this instrument is one CLI invocation per
// (rule, corpus) pair, and there are thousands of them; serial is hours, eight at a time is minutes.
async function pool(items, jobs, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, async () => {
    for (;;) {
      const k = i++;
      if (k >= items.length) return;
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
}

const runCli = (cwd, yg, args, timeout = 15 * 60_000) => new Promise(res => {
  execFile('node', [yg, ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 28, timeout },
    (err, stdout, stderr) => res({ code: err ? (err.code ?? 1) : 0, stdout: stdout || '', stderr: stderr || '' }));
});

// ==================================================================================================
// 1. The cut, and git first-appearance
// ==================================================================================================
//
// The cut is a COMMIT, not a date: a date cut cannot say which side of it a given commit fell on when several
// land the same day, and the corpus id has to name a sha (counsel memo §2 B1, "the corpus id names the cut sha").
export function chooseCut(repo, fraction = 0.7) {
  const lines = git(repo, ['log', '--reverse', '--format=%H %ad', '--date=short']).trim().split('\n');
  const total = lines.length;
  const index = Math.max(1, Math.floor(total * fraction));
  const [sha, date] = lines[index - 1].split(' ');
  return { sha, date, index, total, postCommits: total - index, fraction };
}

// Every path's FIRST appearance in history (an add, or the target of a rename), oldest-first. One git pass.
export function firstAppearance(repo) {
  const raw = git(repo, ['log', '--reverse', '--format=@@%H %ad', '--date=short', '--name-status', '-M',
    '--diff-filter=AR']);
  const first = new Map();
  let sha = null, date = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('@@')) { const p = line.slice(2).split(' '); sha = p[0]; date = p[1]; continue; }
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const path = parts[0].startsWith('R') ? parts[2] : parts[1];
    if (path && !first.has(path)) first.set(path, { sha, date });
  }
  return first;
}

// Is a path's birth strictly after the cut? Answered by ancestry, not by date: `git merge-base --is-ancestor`
// says whether the birth commit is reachable from the cut, which is the only question that has a right answer
// when two commits share a day.
export function bornAfterCut(repo, birthSha, cutSha, cache = new Map()) {
  if (!birthSha) return false;
  const key = birthSha;
  if (cache.has(key)) return cache.get(key);
  let after;
  try {
    execFileSync('git', ['-C', repo, 'merge-base', '--is-ancestor', birthSha, cutSha], { stdio: 'ignore' });
    after = false;                       // birth is an ancestor of the cut → the miner could see it
  } catch { after = true; }
  cache.set(key, after);
  return after;
}

// ==================================================================================================
// 2. Candidates — what propose.mjs rendered, plus the provenance record every generated rule must carry
// ==================================================================================================
export function readCandidates(proposalDir) {
  const ygg = join(proposalDir, '.yggdrasil');
  const rows = existsSync(join(proposalDir, 'proposal.json'))
    ? JSON.parse(readFileSync(join(proposalDir, 'proposal.json'), 'utf8')).evidence.filter(e => e.kind === 'aspect')
    : [];
  const byId = new Map(rows.map(r => [r.id, r]));
  const out = [];
  for (const f of walkFiles(join(ygg, 'aspects'), p => p.endsWith(`${sep}yg-aspect.yaml`))) {
    const dir = dirname(f);
    const id = relative(join(ygg, 'aspects'), dir).split(sep).join('/');
    const doc = parseYaml(readFileSync(f, 'utf8')) || {};
    const hasCheck = existsSync(join(dir, 'check.mjs'));
    out.push({
      id, dir, hasCheck,
      check: hasCheck ? readFileSync(join(dir, 'check.mjs'), 'utf8') : null,
      scope: doc.scope || null,
      description: doc.description || '',
      row: byId.get(id) || null,
    });
  }
  return out;
}

// provenance.json — counsel-2 §2.3, and the half of the meta-law that a generated rule may be refused for
// lacking. Everything in it is a fact of the run, not a judgement.
export function provenanceFor(cand, { cutSha, cutDate, asOf, repo, partitions = [] }) {
  const r = cand.row || {};
  const ev = String(r.evidence || cand.description || '');
  const num = re => { const m = re.exec(ev); return m ? Number(m[1]) : null; };
  // A certified convention's evidence line names its partition in prose; a sub-gate line does not (it names the
  // share and the band). The candidate's own id carries the partition slug in both cases, so resolve through
  // that rather than leaving the field null for half the generated rules.
  const partSlug = cand.id.split('/')[1] || '';
  const partition = /of \`([^`]+)\`/.exec(ev)?.[1] || /partition \`([^`]+)\`/.exec(ev)?.[1]
    || partitions.find(p => slug(p) === partSlug) || null;
  return {
    aspectId: cand.id,
    conventionId: r.id || cand.id,
    origin: r.origin || 'unknown',
    enumeratorClass: r.enumerator || null,
    identifier: r.identifier ?? null,
    expected: r.expected ?? null,
    partition,
    share: num(/share ([0-9.]+)/),
    n: num(/n (\d+) conforming/) ?? num(/practised in (\d+) of/),
    deviating: num(/(\d+) deviating/) ?? num(/(\d+) sites do not/),
    asOf: asOf || null,
    cutSha, cutDate,
    repo,
    reviewer: cand.hasCheck ? 'deterministic' : 'llm',
    note: 'Generated by grain from measured practice at `asOf`; every drill case under drills/ was born after `cutSha`.',
  };
}

// ==================================================================================================
// 3. Held-out corpora
// ==================================================================================================
//
// A candidate's corpus is cut from the POST-CUT tree. The universe is the candidate's own scope predicate
// expanded against the later tree; the hold-out keeps only files whose birth commit is not an ancestor of the
// cut; the LABEL comes from the later measurement (the HEAD export's site enumeration for a certified
// convention, the HEAD lattice's deviant list for a sub-gate candidate) and never from the candidate's check.
//
// What this measures, stated so it cannot be over-read: for a rule that grain rendered from its own count, a
// grain-derived label makes the drill a test of the TEMPLATE, not of the rule — "does the rendered check still
// read the tree the way grain counted it, on code the miner never saw?". The rule's own worth is measured in
// §4 (against the hand law), §6 (replay) and §8 (the maintainer's sample).
const conventionKey = c => [
  c.partition, c.context?.type || 'partition',
  c.context?.type === 'group' ? (c.context.label || c.context.group) : (c.context?.dir || ''),
  c.feature?.enumerator, c.feature?.argument ?? '', c.expected, c.kind,
].join('|');

export function headLabels(headExport, headLattice) {
  const byKey = new Map();
  for (const c of headExport.conventions || []) {
    const k = conventionKey(c);
    const conforming = new Set((c.conformingSites || []).map(s => s.rel).filter(Boolean));
    const deviating = new Set((c.deviatingSites || []).map(s => s.rel).filter(Boolean));
    byKey.set(k, { conforming, deviating, source: 'head-convention' });
  }
  const byPid = new Map();
  for (const r of headLattice || []) {
    const key = `${r.partition}|${r.pid}|${r.exp}|${r.kind}`;
    const deviating = new Set(r.deviants.map(d => d.split('#')[0]));
    byPid.set(key, { deviating, share: r.share, n: r.n, source: 'head-lattice' });
  }
  return { byKey, byPid };
}

export function cutHoldoutCorpus(cand, { repo, files, scopeFiles, labels, first, cutSha, ancCache }) {
  const scoped = scopeFiles;
  const born = scoped.filter(f => bornAfterCut(repo, first.get(f)?.sha, cutSha, ancCache));
  const r = cand.row || {};
  // Find the LATER measurement this candidate's rule corresponds to. Matching is on the rule's own semantics —
  // partition, enumerator class, identifier, direction — never on an export-local id: role-group numbering
  // (`r3`) is not stable between two exports of the same repository, and a positional id would silently match
  // the wrong rule.
  const partSlug = cand.id.split('/')[1] || '';
  let lab = null;
  if (r.origin === 'certified-convention') {
    for (const [k, v] of labels.byKey) {
      const parts = k.split('|');
      if (slug(parts[0]) === partSlug && parts[3] === r.enumerator &&
          parts[4] === String(r.identifier ?? '') && parts[5] === String(r.expected)) { lab = v; break; }
    }
  }
  if (!lab && r.origin === 'sub-gate-lattice') {
    const pid = /candidate-(.+)$/.exec(cand.id.split('/').pop())?.[1];
    for (const [k, v] of labels.byPid) {
      const parts = k.split('|');
      if (slug(parts[0]) === partSlug && slug(parts[1]) === pid && parts[2] === String(r.expected)) { lab = v; break; }
    }
    // A sub-gate row at the cut can have finished spreading by HEAD and be a CERTIFIED convention there. That
    // is the later measurement of the same rule, not a different one, so it labels the corpus — and the corpus
    // says which source the label came from.
    if (!lab) {
      for (const [k, v] of labels.byKey) {
        const parts = k.split('|');
        if (slug(parts[0]) === partSlug && parts[3] === r.enumerator &&
            parts[4] === String(r.identifier ?? '') && parts[5] === String(r.expected)) { lab = v; break; }
      }
    }
  }
  const cases = { satisfies: [], violates: [] };
  if (lab) {
    for (const f of born) {
      if (lab.deviating.has(f)) { if (cases.violates.length < CASES_PER_SIDE) cases.violates.push(f); }
      else if (!lab.conforming || lab.conforming.has(f)) { if (cases.satisfies.length < CASES_PER_SIDE) cases.satisfies.push(f); }
    }
  }
  return { scoped: scoped.length, born: born.length, labelled: !!lab, labelSource: lab?.source || null, cases };
}

export function writeCorpus(outDir, cand, corpus, repo, provenance, cut) {
  const root = join(outDir, 'corpora', cand.id.replace(/\//g, '__'));
  rmSync(root, { recursive: true, force: true });
  const written = [];
  for (const side of ['satisfies', 'violates']) {
    for (const rel of corpus.cases[side]) {
      const base = rel.replace(/[^A-Za-z0-9._-]/g, '-').slice(-60);
      const dst = join(root, `${side}-${base}`, rel.split('/').pop());
      write(dst, readFileSync(join(repo, rel), 'utf8'));
      written.push({ side, rel, case: relative(root, dst).split(sep).join('/') });
    }
  }
  write(join(root, '..', '..', 'provenance', `${cand.id.replace(/\//g, '__')}.json`), JSON.stringify(provenance, null, 2));
  write(join(cand.dir, 'provenance.json'), JSON.stringify(provenance, null, 2));
  if (written.length) {
    write(join(root, 'CORPUS.md'), [
      `# Held-out corpus for \`${cand.id}\``, '',
      `**Hold-out: BY CUT SHA \`${cut.sha}\` (${cut.date}), commit ${cut.index} of ${cut.total}.**`,
      'Every case below is a file whose FIRST APPEARANCE in history is a commit that is NOT an ancestor of the',
      'cut. The rule was mined on the tree at the cut and has never seen any of these files.', '',
      `Labels come from the later measurement (${corpus.labelSource}), never from this rule's own check.`, '',
      `Scope at HEAD: ${corpus.scoped} files · born after the cut: ${corpus.born} · cases: ${written.length}`, '',
      ...written.map(w => `- \`${w.case}\` — ${w.rel}`), '',
    ].join('\n'));
  }
  return { root, written };
}

// I10 — hold-out integrity. Not asserted: every case file is re-checked against git, from the corpus on disk.
export function verifyI10(corpora, { repo, first, cutSha, ancCache }) {
  let clean = 0, dirty = 0, cases = 0, leaked = [];
  for (const c of corpora) {
    if (!c.written.length) continue;
    let ok = true;
    for (const w of c.written) {
      cases++;
      if (!bornAfterCut(repo, first.get(w.rel)?.sha, cutSha, ancCache)) { ok = false; leaked.push({ corpus: c.id, rel: w.rel }); }
    }
    if (ok) clean++; else dirty++;
  }
  return { corpora: clean + dirty, clean, dirty, cases, leaked, ratio: clean + dirty ? +(clean / (clean + dirty)).toFixed(3) : null };
}

// ==================================================================================================
// 4. Drill — one CLI call, parsed
// ==================================================================================================
const DRILL_LINE = /^(pass|MISS|FALSE-ALARM|unrun|unsupported)\s+(\S+)/;

export function parseDrill(stdout) {
  const cases = [];
  for (const line of stdout.split('\n')) {
    const m = DRILL_LINE.exec(line.trim());
    if (m) cases.push({ outcome: m[1], label: m[2] });
  }
  const sum = /(\d+) pass · (\d+) MISS · (\d+) FALSE-ALARM · (\d+) unrun · (\d+) unsupported/.exec(stdout);
  return {
    cases,
    pass: sum ? +sum[1] : cases.filter(c => c.outcome === 'pass').length,
    miss: sum ? +sum[2] : cases.filter(c => c.outcome === 'MISS').length,
    fa: sum ? +sum[3] : cases.filter(c => c.outcome === 'FALSE-ALARM').length,
    unrun: sum ? +sum[4] : cases.filter(c => c.outcome === 'unrun').length,
    unsupported: sum ? +sum[5] : cases.filter(c => c.outcome === 'unsupported').length,
    ran: !!sum,
  };
}

// The refused set a drill implies: a `violates-` case is refused when it passes, a `satisfies-` case is refused
// when it false-alarms. That makes two drills over the SAME corpus directly comparable as refused sets, which
// is what "reproduced in verdict" means.
export function refusedSet(drill) {
  const s = new Set();
  for (const c of drill.cases) {
    const isViolates = c.label.startsWith('violates-');
    const refused = isViolates ? c.outcome === 'pass' : c.outcome === 'FALSE-ALARM';
    if (refused) s.add(c.label);
  }
  return s;
}
export const expectedRefusedSet = drill =>
  new Set(drill.cases.filter(c => c.label.startsWith('violates-')).map(c => c.label));

// ==================================================================================================
// 5. The shape-check bet — a superposition template as a deterministic check
// ==================================================================================================
//
// A hand rule that names NO identifier cannot be reached by matching names. The export's role-group profile
// carries `req` — the node types every member of the group holds, with the minimum count each holds — which is
// a SHAPE and not a name. This renders it: within a file in scope, every declaration of the group's own root
// node type must contain at least those node types at those counts.
//
// The bet is stated before it is measured, and the measurement is allowed to lose.
export function renderShapeCheck(group, provenance) {
  const req = group?.profile?.req;
  if (!req) return null;
  const rootType = /^([a-z_]+)\(/.exec(String(group.profile.skel || ''))?.[1];
  if (!rootType) return null;
  // `id:Name` entries are names, not shapes — the bet is about shape, so they are dropped and the count says so.
  const shape = Object.entries(req).filter(([k]) => !k.startsWith('id:') && k !== rootType);
  if (!shape.length) return null;
  return `${'// PROVENANCE — grain measured this, it did not decide it.\n//   ' + String(provenance).replace(/\n/g, '\n//   ')}
//
// SHAPE CHECK (097, the "template as shape check" bet). The rule is the group's SUPERPOSITION: the anti-unified
// skeleton every member holds in common. It names no identifier — it asserts that a declaration of this kind
// contains these node types, at least this many times. \`errs: under\`: it speaks only about declarations whose
// root node type is the one the skeleton names, and stays silent about every other construct in the file.
import { walk, report } from '@chrisdudek/yg/ast';

const ROOT = ${JSON.stringify(rootType)};
const REQ = ${JSON.stringify(Object.fromEntries(shape))};

export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, n => {
      if (n.type !== ROOT) return;
      const have = Object.create(null);
      walk(n, m => { have[m.type] = (have[m.type] || 0) + 1; });
      for (const [t, k] of Object.entries(REQ)) {
        if ((have[t] || 0) < k) {
          violations.push(report(file, n, 'this declaration does not hold the shape every member of this group holds (missing ' + t + ') (proposed rule, not yet reviewed)'));
          return false;
        }
      }
      return false;
    });
  }
  return violations;
}
`;
}

// The files one hand aspect actually judges. Yggdrasil's real semantics: a type's `when` carries its aspects to
// every file it classifies, and a node's aspects cascade to its whole subtree — so the bare `mapping:` would
// leave an organizational node's rules attached to nothing.
export function nodeAttachOf(graph, aspectId, files, ctx) {
  const ids = list => (list || []).map(a => (typeof a === 'string' ? a : a && a.id)).filter(Boolean);
  const set = new Set();
  for (const t of Object.values(graph.arch.node_types || {})) {
    if (!t || !ids(t.aspects).includes(aspectId)) continue;
    for (const f of t.when ? expandWhen(t.when, files, ctx) : []) set.add(f);
  }
  const subtree = subtreeFileSets(graph, files, ctx);
  for (const n of graph.nodes) {
    if (!ids(n.aspects).includes(aspectId)) continue;
    for (const f of subtree.get(n.id) || []) set.add(f);
  }
  return set;
}

// ==================================================================================================
// 6. The run
// ==================================================================================================
export async function run(opts) {
  const t0 = Date.now();
  const out = { instrument: 'law-loop.mjs', ticket: '097', startedAt: new Date().toISOString() };
  // Each leg costs minutes and the run is long; flush the JSON after every one so a run that is interrupted
  // still hands back everything it had already measured (and `--merge` can reuse it).
  const flush = () => { if (opts.json) write(opts.json, JSON.stringify(out, null, 2)); };
  const repo = opts.repo;                      // clone at HEAD (full history), read-write scratch
  const yg = opts.yg || YG_DEFAULT;
  mkdirSync(opts.out, { recursive: true });

  // ---- the cut -----------------------------------------------------------------------------------
  const cut = opts.cut
    ? (() => {
      const lines = git(repo, ['log', '--reverse', '--format=%H %ad', '--date=short']).trim().split('\n');
      const idx = lines.findIndex(l => l.startsWith(opts.cut));
      const [sha, date] = lines[idx].split(' ');
      return { sha, date, index: idx + 1, total: lines.length, postCommits: lines.length - idx - 1, fraction: +((idx + 1) / lines.length).toFixed(3) };
    })()
    : chooseCut(repo, opts.cutFraction ?? 0.7);
  out.cut = cut;
  say(opts, `cut: ${cut.sha.slice(0, 8)} (${cut.date}) — commit ${cut.index} of ${cut.total} (${pct(cut.fraction)}); ${cut.postCommits} commits held out`);

  const files = gitFiles(repo);
  const first = firstAppearance(repo);
  const ancCache = new Map();
  out.repo = { files: files.length, firstAppearanceKnown: files.filter(f => first.has(f)).length };

  // ---- candidates --------------------------------------------------------------------------------
  const headExport = JSON.parse(readFileSync(opts.exportHead, 'utf8'));
  const cutExport = JSON.parse(readFileSync(opts.exportCut, 'utf8'));
  const cands = readCandidates(opts.proposal);
  const rendered = cands.filter(c => c.hasCheck);
  say(opts, `candidates: ${cands.length} drafts · ${rendered.length} rendered as check.mjs (from the export at the cut, ${(cutExport.conventions || []).length} conventions)`);
  out.candidates = { drafts: cands.length, rendered: rendered.length, cutConventions: (cutExport.conventions || []).length, headConventions: (headExport.conventions || []).length };

  // ---- HEAD lattice, for sub-gate labels ----------------------------------------------------------
  let headLattice = [];
  if (!opts.skipLattice) {
    try {
      const lat = await partitionLattice(repo, { quiet: true });
      headLattice = subGate(lat.rows);
      say(opts, `HEAD lattice: ${lat.rows.length} rows · ${headLattice.length} in the sub-gate band`);
    } catch (e) { say(opts, `HEAD lattice unavailable (${e.message}) — sub-gate candidates get no independent label`); }
  }
  const labels = headLabels(headExport, headLattice);

  // ---- scope expansion + held-out corpora ---------------------------------------------------------
  const ctx = { root: repo, pathCache: new Map(), contentCache: new Map(), headCache: new Map(), unknownWhenKeys: new Set(), parsed: new Set() };
  const corpora = [];
  for (const c of rendered) {
    c.provenance = provenanceFor(c, { cutSha: cut.sha, cutDate: cut.date, asOf: cutExport.asOf, repo: cutExport.repo, partitions: (cutExport.partitions || []).map(p => p.name) });
    const scopeFiles = c.scope?.files ? [...expandWhen(c.scope.files, files, ctx)] : [];
    const corpus = cutHoldoutCorpus(c, { repo, files, scopeFiles, labels, first, cutSha: cut.sha, ancCache });
    const { root, written } = writeCorpus(opts.out, c, corpus, repo, c.provenance, cut);
    corpora.push({ id: c.id, dir: root, written, ...corpus });
  }
  const i10 = verifyI10(corpora, { repo, first, cutSha: cut.sha, ancCache });
  out.holdout = {
    corporaAttempted: corpora.length,
    corporaWithCases: corpora.filter(c => c.written.length >= MIN_CASES).length,
    cases: i10.cases,
    labelled: corpora.filter(c => c.labelled).length,
    I10: i10,
  };
  say(opts, `held-out corpora: ${out.holdout.corporaWithCases} of ${corpora.length} carry >= ${MIN_CASES} case · ${i10.cases} cases · I10 ${i10.clean}/${i10.corpora} = ${i10.ratio}`);
  flush();

  // ---- the shape-check bet: extra candidates -------------------------------------------------------
  const shapeCands = [];
  if (!opts.skipBet) {
    let n = 0;
    for (const p of cutExport.partitions || []) {
      for (const g of p.groups || []) {
        const prov = `superposition of role group \`${g.label || g.id}\` of \`${p.name}\` · ${(g.members || []).length} members · skeleton coverage ${g.profile?.coverage ?? '?'} · asOf ${(cutExport.asOf || '').slice(0, 8)}`;
        const src = renderShapeCheck(g, prov);
        if (!src) continue;
        const id = `grain-shape/${slug(p.name)}/${slug(g.label || g.id)}-superposition`;
        if (shapeCands.some(s => s.id === id)) continue;
        const dir = join(opts.stage, '.yggdrasil', 'aspects', ...id.split('/'));
        write(join(dir, 'check.mjs'), src);
        write(join(dir, 'yg-aspect.yaml'), [
          `name: ${JSON.stringify(`Superposition shape of ${g.label || g.id}`)}`,
          `description: ${JSON.stringify(`Every member of this role group holds this skeleton. Proposed by grain from evidence — ${prov}.`)}`,
          'status: draft', 'errs: under', '',
        ].join('\n'));
        write(join(dir, 'provenance.json'), JSON.stringify({
          aspectId: id, origin: 'superposition-template', enumeratorClass: 'shape',
          partition: p.name, group: g.label || g.id, members: (g.members || []).length,
          coverage: g.profile?.coverage ?? null, asOf: cutExport.asOf, cutSha: cut.sha, cutDate: cut.date,
          reviewer: 'deterministic',
        }, null, 2));
        shapeCands.push({ id, dir, partition: p.name, group: g.label || g.id, members: (g.members || []).length, coverage: g.profile?.coverage ?? null });
        n++;
      }
    }
    say(opts, `shape-check bet: ${n} superposition templates rendered as deterministic checks`);
    out.bet = { rendered: n };
  }

  // ---- hand aspects, and their own corpora ----------------------------------------------------------
  const handGraph = readGraph(opts.handRepo);
  const handDet = handGraph.aspects.filter(a => a.hasCheck);
  const handCorpus = a => (existsSync(join(a.dir, 'drills')) ? join(a.dir, 'drills') : null);
  const handWithCorpus = handDet.filter(a => handCorpus(a));
  out.hand = { deterministic: handDet.length, withCorpus: handWithCorpus.length, prose: handGraph.aspects.length - handDet.length };

  // the hand rules' own baseline: does each hand rule pass its own drill? A rule that fails its own corpus
  // cannot be reproduced "in verdict" by anything, and the asymmetry has to be visible.
  const baseline = await pool(handWithCorpus, opts.jobs, async a => {
    const r = await runCli(opts.handRepo, yg, ['drill', '--aspect', a.id, '--dir', handCorpus(a), '--corpus', `self-${cut.sha.slice(0, 8)}`]);
    const d = parseDrill(r.stdout + r.stderr);
    return { id: a.id, ...d, expected: [...expectedRefusedSet(d)], refused: [...refusedSet(d)] };
  });
  out.handBaseline = {
    ran: baseline.filter(b => b.ran).length,
    clean: baseline.filter(b => b.ran && !b.miss && !b.fa).length,
    withViolatesCase: baseline.filter(b => b.expected.length).length,
    unsupported: baseline.filter(b => b.unsupported).length,
    rows: baseline,
  };
  say(opts, `hand baseline: ${out.handBaseline.clean}/${out.handBaseline.ran} hand rules pass their own corpus · ${out.handBaseline.withViolatesCase} have a violates- case`);

  // ---- 4. VERDICT REPRODUCTION --------------------------------------------------------------------
  //
  // Every candidate is judged against every hand rule's own labelled corpus. Done one CLI call per (candidate,
  // hand rule) that is ~4000 process starts and hours of graph loading for a few seconds of actual checking, so
  // the corpora are MERGED ONCE into a single directory whose case labels carry the hand rule that owns them
  // (`violates-<hand slug>__<case>`), and each candidate is drilled against the merged corpus exactly once. The
  // per-pair result is recovered by splitting on the label, so the arithmetic is identical and the run is 45×
  // shorter.
  const allCands = [...rendered.map(c => ({ id: c.id, kind: 'rendered' })), ...shapeCands.map(s => ({ id: s.id, kind: 'shape' }))];
  const drillable = baseline.filter(h => h.ran && h.expected.length);   // no violates- case: nothing to reproduce
  const merged = join(opts.out, 'merged-hand-corpus');
  rmSync(merged, { recursive: true, force: true });
  const handOfLabel = new Map();
  for (const h of drillable) {
    const a = handDet.find(x => x.id === h.id);
    const src = handCorpus(a);
    for (const e of readdirSync(src, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const side = e.name.startsWith('violates-') ? 'violates' : e.name.startsWith('satisfies-') ? 'satisfies' : null;
      if (!side) continue;
      const dst = `${side}-${slug(h.id)}__${e.name.slice(side.length + 1)}`;
      cpSync(join(src, e.name), join(merged, dst), { recursive: true });
      handOfLabel.set(dst, h.id);
    }
  }
  const handOf = label => handOfLabel.get(label.split('/')[0]) || null;
  const pairs = drillable.flatMap(h => allCands.map(c => ({ hand: h, cand: c })));
  // `--merge <prior json>` reuses the two expensive legs from an earlier run of THIS instrument on the same cut
  // rather than re-drilling several thousand pairs. It is refused unless the prior run names the same cut sha,
  // so a merged report can never mix two hold-outs.
  const prior = opts.merge && existsSync(opts.merge) ? JSON.parse(readFileSync(opts.merge, 'utf8')) : null;
  if (prior && prior.cut?.sha !== cut.sha) throw new Error(`--merge names a run at cut ${prior.cut?.sha}, this run is at ${cut.sha}`);
  say(opts, prior?.verdict
    ? `verdict reproduction: reusing ${prior.verdict.pairs} pairs from ${opts.merge}`
    : `verdict reproduction: ${allCands.length} candidates × ${drillable.length} hand corpora = ${pairs.length} pairs, in ${allCands.length} merged-corpus drills`);
  const drills = prior?.verdict ? prior.verdict.pairRows || [] : (await pool(allCands, opts.jobs, async c => {
    const r = await runCli(opts.stage, yg, ['drill', '--aspect', c.id, '--dir', merged,
      '--corpus', `hand-merged-${cut.sha.slice(0, 8)}`]);
    const d = parseDrill(r.stdout + r.stderr);
    // split the merged result back into one row per hand rule
    const per = new Map();
    for (const cs of d.cases) {
      const hid = handOf(cs.label);
      if (!hid) continue;
      const g = per.get(hid) || { cases: [] };
      g.cases.push(cs);
      per.set(hid, g);
    }
    return [...per].map(([hid, g]) => {
      const sub = { cases: g.cases, ran: true };
      const got = refusedSet(sub);
      const want = expectedRefusedSet(sub);
      const miss = g.cases.filter(x => x.outcome === 'MISS').length;
      const fa = g.cases.filter(x => x.outcome === 'FALSE-ALARM').length;
      return {
        hand: hid, cand: c.id, kind: c.kind,
        ran: d.ran, pass: g.cases.filter(x => x.outcome === 'pass').length, miss, fa,
        unrun: g.cases.filter(x => x.outcome === 'unrun').length,
        unsupported: g.cases.filter(x => x.outcome === 'unsupported').length,
        reproduced: d.ran && miss === 0 && fa === 0 && want.size > 0,
        jaccard: +jaccard(got, want).toFixed(3),
      };
    });
  })).flat();
  const byHand = new Map();
  for (const d of drills) {
    if (!d.ran) continue;
    const cur = byHand.get(d.hand) || { hand: d.hand, best: null, reproducedBy: [] };
    if (d.reproduced) cur.reproducedBy.push(d.cand);
    if (!cur.best || d.jaccard > cur.best.jaccard) cur.best = d;
    byHand.set(d.hand, cur);
  }
  out.verdict = {
    pairs: drills.length, rows: [...byHand.values()],
    reproduced: [...byHand.values()].filter(r => r.reproducedBy.length).map(r => r.hand),
    pairRows: drills,
  };
  say(opts, `verdict reproduction: ${out.verdict.reproduced.length} of ${byHand.size} drillable hand rules reproduced by at least one candidate`);
  flush();

  // ---- the held-out drill sweep of the candidates themselves --------------------------------------
  const sweepTargets = corpora.filter(c => c.written.length >= MIN_CASES);
  const sweep = prior?.sweep ? prior.sweep.rows : await pool(sweepTargets, opts.jobs, async c => {
    const r = await runCli(opts.stage, yg, ['drill', '--aspect', c.id, '--dir', c.dir, '--corpus', `holdout-${cut.sha.slice(0, 8)}`]);
    const d = parseDrill(r.stdout + r.stderr);
    return { id: c.id, cases: c.written.length, ...d };
  });
  out.sweep = {
    corpora: sweep.length,
    cases: sweep.reduce((a, b) => a + b.pass + b.miss + b.fa + b.unrun + b.unsupported, 0),
    pass: sweep.reduce((a, b) => a + b.pass, 0),
    miss: sweep.reduce((a, b) => a + b.miss, 0),
    fa: sweep.reduce((a, b) => a + b.fa, 0),
    unrun: sweep.reduce((a, b) => a + b.unrun, 0),
    unsupported: sweep.reduce((a, b) => a + b.unsupported, 0),
    rows: sweep,
  };
  say(opts, `held-out sweep: ${out.sweep.cases} cases · ${out.sweep.pass} pass · ${out.sweep.miss} MISS · ${out.sweep.fa} FALSE-ALARM`);
  flush();

  // ---- 6. REPLAY -----------------------------------------------------------------------------------
  //
  // `yg simulate` resolves `--node` in the graph COMMITTED AT EACH REPLAYED COMMIT. A proposed node id does not
  // exist anywhere in the pattern repo's history, so simulating a candidate inside the proposal stage returns
  // `non-comparable` for every commit — which is the honest answer and is measured here as one of the two arms.
  // The other arm overlays the candidate onto the repository's OWN graph and names a REAL node, which is the
  // only configuration in which a mined rule can be replayed at all.
  if (opts.replayStage && !opts.skipReplay) {
    const nodeSets = subtreeFileSets(handGraph, files, ctx);
    const maxCommits = opts.maxCommits ?? 40;
    const targets = [];
    for (const c of rendered) {
      const scopeSet = c.scope?.files ? expandWhen(c.scope.files, files, ctx) : new Set();
      if (!scopeSet.size) continue;
      let best = null;
      for (const [nid, s] of nodeSets) {
        const j = jaccard(scopeSet, s);
        if (!best || j > best.j) best = { node: nid, j: +j.toFixed(3) };
      }
      if (best && best.j > 0) targets.push({ id: c.id, ...best });
    }
    say(opts, `replay: ${targets.length} candidates with a matching real node · window ${maxCommits} commits (all post-cut)`);
    const sims = await pool(targets, Math.max(2, Math.floor(opts.jobs / 2)), async t => {
      const r = await runCli(opts.replayStage, yg, ['simulate', t.id, '--node', t.node, '--max-commits', String(maxCommits)]);
      const m = /Replayed (\d+) commits: ran-clean (\d+) · violations (\d+) · non-comparable (\d+)/.exec(r.stdout + r.stderr);
      const catches = [...(r.stdout + r.stderr).matchAll(/violations \((\d+)\)/g)].reduce((a, x) => a + Number(x[1]), 0);
      return {
        ...t, replayed: m ? +m[1] : 0, ranClean: m ? +m[2] : 0, commitsWithViolations: m ? +m[3] : 0,
        nonComparable: m ? +m[4] : 0, catches,
        caveatPrinted: /survivorship|censored by the old regime/i.test(r.stdout + r.stderr),
      };
    });
    // the control arm: the same candidates simulated inside the PROPOSAL stage, whose nodes history never had
    const control = await pool(targets.slice(0, Math.min(5, targets.length)), 2, async t => {
      const propNode = (readGraph(opts.proposal).nodes[0] || {}).id;
      const r = await runCli(opts.stage, yg, ['simulate', t.id, '--node', propNode || t.node, '--max-commits', '10']);
      const m = /Replayed (\d+) commits: ran-clean (\d+) · violations (\d+) · non-comparable (\d+)/.exec(r.stdout + r.stderr);
      return { id: t.id, node: propNode, nonComparable: m ? +m[4] : null, replayed: m ? +m[1] : null };
    });
    out.replay = {
      window: maxCommits, candidates: sims.length,
      totalCatches: sims.reduce((a, s) => a + s.catches, 0),
      withAnyCatch: sims.filter(s => s.catches > 0).length,
      ranClean: sims.reduce((a, s) => a + s.ranClean, 0),
      nonComparable: sims.reduce((a, s) => a + s.nonComparable, 0),
      caveatPrinted: sims.every(s => s.caveatPrinted),
      controlOnProposedNodes: control,
      rows: sims.sort((a, b) => b.catches - a.catches),
    };
    say(opts, `replay: ${out.replay.totalCatches} catches over ${maxCommits} post-cut commits · ${out.replay.withAnyCatch} candidates caught anything · ${out.replay.nonComparable} non-comparable`);
    flush();
  }

  // ---- 7. RETIREMENT --------------------------------------------------------------------------------
  //
  // counsel-2 §2.7 corrects counsel-1: deterministic catch/exposure never reaches the committed record, so a
  // GENERATED (deterministic) rule cannot be retired from `aspects --health` at all. This leg checks that
  // claim against the repository rather than repeating it, and then asks the addendum's question of each
  // `decorative?` rule: is there an auto-cut drill, and does it catch?
  if (!opts.skipRetirement) {
    const h = await runCli(opts.handRepo, yg, ['aspects', '--health']);
    const text = h.stdout + h.stderr;
    const rows = [];
    for (const line of text.split('\n')) {
      const m = /^(\S+)\s+(deterministic|llm)\s+(\S+)\s+\d+\s+\d+\s+\S+\s+\d+\s+\S+\s+\S+\s+(\S+)\s+(\S+)\s+(\S+)/.exec(line.trim());
      if (m) rows.push({ aspect: m[1], kind: m[2], status: m[3], catch: m[4], exposure: m[5], signal: m[6] });
    }
    const decorative = rows.filter(r => r.signal === 'decorative?');
    const detWithRecord = rows.filter(r => r.kind === 'deterministic' && r.catch !== '—');
    const retire = [];
    for (const d of decorative) {
      const a = handGraph.aspects.find(x => x.id === d.aspect);
      const corpusDir = a && existsSync(join(a.dir, 'drills')) ? join(a.dir, 'drills') : null;
      const cases = corpusDir ? walkFiles(corpusDir).filter(p => !p.endsWith('CORPUS.md')).length : 0;
      // an AUTO-CUT drill would come from this instrument: is there any candidate whose scope overlaps this
      // rule's attach set AND that carries a held-out corpus of its own?
      const attach = nodeAttachOf(handGraph, d.aspect, files, ctx);
      let auto = null;
      for (const c of corpora) {
        if (!c.written.length) continue;
        const cand = rendered.find(x => x.id === c.id);
        const s = cand?.scope?.files ? expandWhen(cand.scope.files, files, ctx) : new Set();
        const j = jaccard(s, attach);
        if (!auto || j > auto.j) auto = { candidate: c.id, j: +j.toFixed(3), cases: c.written.length };
      }
      retire.push({
        aspect: d.aspect, kind: d.kind, catch: d.catch, exposure: d.exposure,
        handDrillCases: cases,
        handDrillCatches: null,          // an LLM corpus is never drilled here: it BILLS a reviewer
        autoCutDrill: auto,
        renderableByGrain: d.kind === 'deterministic',
      });
    }
    out.retirement = {
      decorative: decorative.length, rows: retire,
      deterministicRowsWithARecord: detWithRecord.length,
      deterministicRows: rows.filter(r => r.kind === 'deterministic').length,
      // MEASURED, and it corrects counsel-2 §2.7 rather than repeating it. On a FRESH checkout every
      // deterministic row reads `—` and only LLM rules can be `decorative?`. After ONE free local
      // `yg check --approve --only-deterministic`, every deterministic row carries catch/exposure and the
      // `decorative?` population jumps. The record therefore EXISTS for deterministic rules — it is simply
      // LOCAL: the deterministic lock is gitignored, so it is per-machine and a fresh clone starts blind.
      note: 'Deterministic catch/exposure appears in `aspects --health` only after a local `--approve --only-deterministic` fill, because the deterministic lock is gitignored. It is not committed and not shared, so retirement of a GENERATED rule still cannot rest on the committed record — but it can rest on one free local fill, which counsel-2 §2.7 did not account for.',
      filledLocallyBeforeReading: true,
    };
    say(opts, `retirement: ${decorative.length} decorative? rules · deterministic rows carrying a catch record: ${detWithRecord.length}/${out.retirement.deterministicRows}`);
  }

  // ---- 8. THE SAMPLE --------------------------------------------------------------------------------
  //
  // Candidates that survive their own held-out drill with ZERO false alarms and have no hand counterpart. The
  // instrument prepares the evidence and leaves the (a)/(b)/(c) column blank: classifying it is the
  // maintainer's act (`oracle-is-fallible-report-disagreements-symmetrically`).
  {
    const reproducedBy = new Set(drills.filter(d => d.reproduced).map(d => d.cand));
    const bySweep = new Map(sweep.map(s => [s.id, s]));
    const survivors = corpora
      .filter(c => c.written.length >= MIN_CASES)
      .map(c => ({ c, s: bySweep.get(c.id) }))
      .filter(x => x.s && x.s.ran && x.s.fa === 0 && !reproducedBy.has(x.c.id))
      .map(({ c, s }) => {
        const cand = rendered.find(x => x.id === c.id);
        return {
          candidate: c.id,
          rule: cand?.description || '',
          origin: cand?.provenance?.origin,
          enumerator: cand?.provenance?.enumeratorClass,
          identifier: cand?.provenance?.identifier,
          expected: cand?.provenance?.expected,
          share: cand?.provenance?.share, n: cand?.provenance?.n, deviating: cand?.provenance?.deviating,
          scopeFilesAtHead: c.scoped, bornAfterCut: c.born,
          cases: c.written.length, pass: s.pass, miss: s.miss, fa: s.fa,
          sites: c.written.slice(0, 4).map(w => w.rel),
          provenance: `corpora/${c.id.replace(/\//g, '__')}`,
          class: '',                    // (a) miner-miss / (b) graph-debt / (c) undecidable — MAINTAINER FILLS
        };
      })
      .sort((a, b) => (b.share ?? 0) - (a.share ?? 0) || b.cases - a.cases);
    // The ticket asks for TWENTY candidates to classify. Fewer than twenty clear the held-out drill, and
    // shrinking the sample silently would hide exactly that fact — so the remainder is filled with rendered
    // candidates that have NO held-out corpus, each labelled `heldOutCorpus: none` and carrying the reason
    // (no independent later label, or no post-cut file in scope). The maintainer classifies both kinds and can
    // see which is which.
    const chosen = new Set(survivors.map(s => s.candidate));
    const byId = new Map(corpora.map(c => [c.id, c]));
    const filler = rendered
      .filter(c => !chosen.has(c.id) && !reproducedBy.has(c.id) && !(byId.get(c.id)?.written.length >= MIN_CASES))
      .map(c => {
        const co = byId.get(c.id);
        return {
          candidate: c.id, rule: c.description || '',
          origin: c.provenance?.origin, enumerator: c.provenance?.enumeratorClass,
          identifier: c.provenance?.identifier, expected: c.provenance?.expected,
          share: c.provenance?.share, n: c.provenance?.n, deviating: c.provenance?.deviating,
          scopeFilesAtHead: co?.scoped ?? null, bornAfterCut: co?.born ?? null,
          cases: 0, pass: null, miss: null, fa: null,
          heldOutCorpus: 'none',
          why: co?.labelled ? 'no file in scope was born after the cut' : 'the rule has no counterpart in the later measurement, so no independent label exists',
          sites: [], provenance: null, class: '',
        };
      })
      .sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
    const take = [...survivors.map(s => ({ ...s, heldOutCorpus: 'held out at the cut sha' })), ...filler].slice(0, 20);
    out.sample = {
      pool: survivors.length, drilled: survivors.length, filler: take.length - survivors.length,
      take,
    };
    say(opts, `sample: ${survivors.length} candidates survive their held-out drill with 0 FALSE-ALARM and no hand counterpart; ${out.sample.take.length} rows prepared (${out.sample.filler} of them with no held-out corpus, labelled)`);
  }

  out.wallSeconds = +((Date.now() - t0) / 1000).toFixed(1);
  flush();
  return out;
}

// ==================================================================================================
// 7. CLI
// ==================================================================================================
function parseArgs(argv) {
  const o = { jobs: 8, out: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') o.repo = resolve(argv[++i]);
    else if (a === '--hand-repo') o.handRepo = resolve(argv[++i]);
    else if (a === '--stage') o.stage = resolve(argv[++i]);
    else if (a === '--proposal') o.proposal = resolve(argv[++i]);
    else if (a === '--export-head') o.exportHead = resolve(argv[++i]);
    else if (a === '--export-cut') o.exportCut = resolve(argv[++i]);
    else if (a === '--out') o.out = resolve(argv[++i]);
    else if (a === '--json') o.json = resolve(argv[++i]);
    else if (a === '--yg') o.yg = resolve(argv[++i]);
    else if (a === '--cut') o.cut = argv[++i];
    else if (a === '--cut-fraction') o.cutFraction = Number(argv[++i]);
    else if (a === '--jobs') o.jobs = Number(argv[++i]);
    else if (a === '--max-commits') o.maxCommits = Number(argv[++i]);
    else if (a === '--skip-lattice') o.skipLattice = true;
    else if (a === '--skip-bet') o.skipBet = true;
    else if (a === '--skip-replay') o.skipReplay = true;
    else if (a === '--skip-retirement') o.skipRetirement = true;
    else if (a === '--replay-stage') o.replayStage = resolve(argv[++i]);
    else if (a === '--merge') o.merge = resolve(argv[++i]);
    else if (a === '--quiet') o.quiet = true;
    else throw new Error(`unknown flag ${a}`);
  }
  if (!o.repo || !o.proposal || !o.exportHead || !o.exportCut || !o.out || !o.stage) {
    throw new Error('usage: node law-loop.mjs --repo <clone> --stage <staged project> --proposal <dir> --export-head <json> --export-cut <json> --out <dir> [--hand-repo <clone>] [--cut <sha>] [--jobs N] [--json <path>]');
  }
  o.handRepo = o.handRepo || o.repo;
  return o;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const o = parseArgs(process.argv.slice(2));
  run(o).then(r => { if (!o.quiet) process.stderr.write(`[law-loop] done in ${r.wallSeconds}s\n`); })
    .catch(e => { process.stderr.write(`law-loop: ${e.stack || e.message}\n`); process.exitCode = 1; });
}

