// The proposal renderer — turn grain's model into a PROPOSED `.yggdrasil/` graph.
//
// The north star (decisions.md `north-star-brownfield-miner`) is a maintainer adopting Yggdrasil on a brownfield
// repository. `tests/stress/reconstruct.mjs` (ticket 093) measured how much of a hand-written graph grain's
// export ALREADY holds; this module is the other half — it writes the graph grain can propose, so the maintainer
// starts from a draft with evidence attached instead of from an empty directory.
//
// It was an instrument (`tests/stress/propose.mjs`, ticket 094) until ticket 104 made `grain propose` a product
// command: the whole render pipeline moved here VERBATIM, and the instrument is now a thin wrapper that imports
// this module, adds the `--score` comparison against a hand-written graph, and keeps its own CLI flags. The
// dispatcher's `propose` command (`cmdPropose`, engine/grain.mjs) drives `propose()` below and renders the
// report; nothing about what lands on disk depends on which of the two called it.
//
// THREE RULES THIS MODULE OBEYS.
//
//   1. NEVER write into the repository's own `.yggdrasil/`. Everything lands under `<out-dir>/.yggdrasil/`, a
//      directory the maintainer reads, edits and moves in by hand. The repo is read-only here, exactly as it is
//      in `reconstruct.mjs`.
//   2. EVERY proposed element carries an evidence line — counts, paths, shares — naming what in the repository
//      made grain propose it. A proposal without evidence is a guess with a YAML syntax, and the whole point of
//      the north star is that the graph comes from the code rather than from imagination. The evidence is both a
//      `# evidence:` comment in the YAML and a row in `<out-dir>/proposal.json`.
//   3. NOTHING IS ASSERTED AS TRUE UNTIL IT HAS EARNED IT. Every aspect ships `status: draft` by default (the
//      reviewer is skipped, no verdict, no baseline); no type ever carries `enforce: strict`. A prose aspect
//      (`content.md`, an LLM judgment call) NEVER leaves draft here — ticket 101 measured its sense rate under
//      a keyless gate at 0% (ruling `prose-aspects-draft-by-default`) — and its `content.md` says so. A
//      deterministic aspect (`check.mjs`) is promoted to `status: enforced` ONLY when a Yggdrasil CLI resolves
//      and a REAL `yg drill` on the just-written proposal, in a throwaway staging copy, confirms it: zero
//      FALSE-ALARMs and at least one caught `violates-*` case. A check that false-alarms stays draft with
//      `draftReason: file-scope-approximation-fa` (ruling `drill-fa-labelling-is-acceptance-not-defect` — the
//      convention's own subject is a symbol inside the file, Yggdrasil's unit is the file, and the label is
//      what is wrong, not the check); a check that catches nothing stays draft with `draftReason: no-catch`
//      (ruling `no-catch-rules-stay-draft`). With no Yggdrasil CLI every deterministic aspect stays draft too,
//      unverified. The honest limits — above all that a rule about an ABSENCE can never come from mining — are
//      printed at the top of every file a human opens either way.
//
// `grain export` is driven as a SUBPROCESS (`bin/grain.mjs export --out …`) rather than called in-process: it is
// the same code path either way, and the subprocess keeps the export's own memory profile (a full parse of every
// tracked file) out of the process that then renders. `core.mjs` is imported dynamically, only when the sub-gate
// lattice is actually computed. Verifying against Yggdrasil (`yg drill`) runs the built CLI as a subprocess over
// a throwaway copy of this renderer's own output, exactly as `tests/propose.test.mjs` already does.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGraph, expandWhen, expandMapping, jaccard, intersectSize } from './yggdrasil-graph.mjs';
// Read-only: two version constants, the same ones `grain export`'s own `proposal.json`-equivalent
// (`grain-export/1`) stamps itself with — so a proposal names the engine/extractor build that produced it
// without this renderer re-deriving or hardcoding either number (ticket 100, "the proposal contract").
import { ENGINE_VERSION, EXTR_V } from './config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(here, '..', 'bin', 'grain.mjs');
const CORE = resolve(here, 'core.mjs');

// ==================================================================================================
// 0. The constants, and where each comes from.
//
// Every number below is either the repository's own interpretable constant (mathematics.md) or a stated
// admission floor whose sensitivity the report measures. None is tuned against the pattern repo's answer.
// ==================================================================================================

// mathematics.md, "The honest residue": the two-thirds supermajority is ONE interpretable share already behind a
// marker's established value, a value container's certified population and a structural twin's shared core. A
// sub-gate row at or above it is a practice a maintainer would recognise; below it, it is a coincidence.
export const SUPERMAJORITY = 2 / 3;
// λ = 8 ⇒ the certification bound (n+½)/(n_total+K/2) ≥ 1 − 1/λ = 0.875. A row at or above this that grain did
// NOT certify failed on population, not on share, and is not what "below the gate" means; the sub-gate band is
// therefore [SUPERMAJORITY, LAMBDA_BOUND).
export const LAMBDA_BOUND = 1 - 1 / 8;
// The same support-floor family as `cochangeMinSup` (8 commits): below it a single small cell fabricates a rule.
export const MIN_SUPPORT = 8;
// A directory card is promoted to its own type only from this many files up — below it the split is noise a
// maintainer would immediately merge back.
export const MIN_PROMOTE_FILES = 3;
// A role group is proposed as a content-predicated type only from this many members up (the same floor grain's
// own `buildCards` uses to publish a group at all).
export const MIN_GROUP_MEMBERS = 3;
// A drafted `when` must actually select the set it was drafted from. Below this the draft is demoted to an
// alternative rather than shipped as an active type — this is the renderer checking its own work.
export const MIN_WHEN_FIDELITY = 0.5;
// A convention is drafted as an aspect only once this many sites carry it.
export const MIN_CONVENTION_SITES = 5;
// FAMILY-WITHOUT-LAW FLOOR (ticket 100). Yggdrasil's own offline miner (`scripts/family-without-law.mjs`)
// requires 5 members before a structurally-tight cluster is a "family" worth naming rather than an anecdote
// (`MIN_CLUSTER_SIZE`); the adapter below reuses that SAME number rather than inventing a second one for the
// identical concept. Stated here, not hidden, per ruling `instrument-floors-allowed-if-stated-and-measured` —
// the seam test measures how many of grain's own role groups clear it on the pattern repo.
export const FAMILY_MIN_MEMBERS = 5;
// Per partition, at most this many sub-gate candidates are drafted; the rest go to the backlog. A cap on how
// much a maintainer is asked to read, not on what is measured.
export const SUBGATE_PER_PARTITION = 6;

const SCHEMA_VERSION = '5.2.0'; // CLI_SUPPORTED_SCHEMA in Yggdrasil's core/graph-loader.ts

// Where the Yggdrasil CLI is: an explicit `ygBin` option first (the stress instrument passes its own default
// there, so its runs are unchanged), then the `YG_BIN` environment variable, then a plain `yg` on PATH. A
// PRODUCT command may not carry a machine path, so there is no fourth fallback: when none of the three resolves,
// `promoteEnforceableAspects` below skips verification entirely and every aspect ships `status: draft`,
// unverified — and the command says so in its report rather than pretending the drafts were judged.
//
// The two forms differ in how they are spawned, so resolution returns the whole invocation rather than a path:
// a FILE is run as `node <file> …` (a built `dist/bin.js` is not executable on its own), a PATH entry is run as
// `yg …` (it is already a launcher).
export function resolveYg(explicit) {
  const path = explicit || process.env.YG_BIN || null;
  if (path) return { have: existsSync(path), label: path, cmd: 'node', pre: [path] };
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['yg'], { encoding: 'utf8' });
  const found = which.status === 0 && (which.stdout || '').trim().split(/\r?\n/)[0];
  return found
    ? { have: true, label: found + ' (on PATH)', cmd: found, pre: [] }
    : { have: false, label: null, cmd: null, pre: [] };
}
// A type is a GROUP of files: one file is a member, not a group. This is the definition of the object being cut, not an
// admission threshold — ticket 101 §5 measured that 1 vs 2 changed no count on 17 repos, which is why the former
// MIN_TYPE_FILES knob was removed (ruling `root-fix-accepted-min-type-files-goes`).
const GROUP_MIN = 2;

// ==================================================================================================
// 1. Small helpers.
// ==================================================================================================

const say = (opts, m) => { if (!opts.quiet) process.stderr.write(`[propose] ${m}\n`); };
const uniq = a => [...new Set(a)];
const pct = x => `${(x * 100).toFixed(0)}%`;

// The tracked files. `git ls-files` where there is a git repository; a worktree walk where there is not.
//
// A DIRECTORY OF CODE WITH NO `.git` IS NOT AN ERROR (ticket 101). `grain export` itself handles it — it stamps
// its answer `no-git` and reports "extracted 154 files (worktree — no git)" — and `edge-cases.mjs` has a case
// for exactly that shape. This renderer used to call `git ls-files` unconditionally and died with
// `fatal: not a git repository`, exit 128, on the one hostile repository whose whole point is the absence of
// git. The fallback walks the worktree instead, skipping the state directories no proposal should ever describe.
// It is a WEAKER file set than `git ls-files`, and knowingly so: with no git there is no `.gitignore` resolution,
// so build output a git repo would have hidden is visible here. That is a degradation, which is the contract,
// rather than a crash, which is not.
const WALK_SKIP = new Set(['.git', '.grain', '.yggdrasil', 'node_modules']);
function walkWorktree(root, rel = '', out = []) {
  let entries;
  try { entries = readdirSync(join(root, rel), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (WALK_SKIP.has(e.name)) continue;
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walkWorktree(root, p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}
function gitFiles(repo) {
  try {
    // `-s` so the mode is visible: a SUBMODULE is listed by `git ls-files` as a single entry with mode 160000
    // (a gitlink), and it is a directory on disk, not a file. Rendered as a file it becomes a node mapping that
    // names a directory the type's `when` cannot satisfy — measured on leveldb, whose `third_party` gitlink
    // produced a `type-when-mismatch` error. Yggdrasil already excludes a subtree carrying its own `.git` from
    // coverage by default, so dropping the gitlink here agrees with what the graph loader does anyway.
    const out = execFileSync('git', ['-C', repo, 'ls-files', '-s', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
    const files = [];
    for (const rec of out.split('\0')) {
      if (!rec) continue;
      const m = /^(\d{6}) [0-9a-f]+ \d+\t(.*)$/s.exec(rec);
      if (!m) continue;
      if (m[1] === '160000') continue; // gitlink: a nested checkout, not a file of this repository
      files.push(m[2].split('\\').join('/'));
    }
    return files;
  } catch {
    return walkWorktree(repo).sort();
  }
}

// Repo-relative directory prefix -> the tracked files beneath it.
const underDir = (files, dir) => new Set(files.filter(f => f === dir || f.startsWith(dir + '/')));

// A YAML-safe id: lowercase, path separators and dots folded to dashes, collapsed.
export function slug(s) {
  const t = String(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return t || 'x';
}

// ---- a minimal YAML emitter (block style only; the shapes this renderer writes and nothing else) ----
const NEEDS_QUOTE = /^(\s|$)|[:#\-?*&!|>'"%@`{}[\],]|\s$|^(true|false|null|yes|no|on|off|~)$|^-?\d/i;
export function yq(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (!s.length || NEEDS_QUOTE.test(s) || s.includes('\n')) return JSON.stringify(s);
  return s;
}
export function yamlEmit(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return `${pad}[]\n`;
    let out = '';
    for (const item of value) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const body = yamlEmit(item, indent + 2);
        out += `${pad}- ${body.slice(indent + 2)}`;
      } else out += `${pad}- ${yq(item)}\n`;
    }
    return out;
  }
  if (value && typeof value === 'object') {
    let out = '';
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (k.startsWith('#')) { out += `${pad}# ${v}\n`; continue; } // comment pseudo-key
      if (Array.isArray(v)) {
        if (!v.length) out += `${pad}${k}: []\n`;
        else out += `${pad}${k}:\n${yamlEmit(v, indent + 2)}`;
      } else if (v && typeof v === 'object') {
        out += `${pad}${k}:\n${yamlEmit(v, indent + 2)}`;
      } else out += `${pad}${k}: ${yq(v)}\n`;
    }
    return out;
  }
  return `${pad}${yq(value)}\n`;
}

const write = (p, text) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };

// ==================================================================================================
// 2. The honest preamble.
//
// 093 §6 established the boundary of the whole approach, and it is stated where a human will read it rather than
// buried in a report: a miner of what a repository DOES cannot see a rule about what it never does. On the
// pattern repo, 6 of 57 deterministic rules were of exactly that shape. Nothing in this renderer can change that,
// and a proposal that stayed quiet about it would be dishonest.
// ==================================================================================================

export const PREAMBLE = [
  'PROPOSAL — written by grain from evidence in this repository. Nothing here is verified.',
  '',
  'Every element carries an `# evidence:` line naming the counts, paths and shares behind it. Read the',
  'evidence, keep what is true, delete what is not. What this proposal CANNOT contain, by construction:',
  '',
  '  - A rule about an ABSENCE. Grain mines what the code does; a rule forbidding something the repository',
  '    never does leaves no evidence to mine. Rules of that shape (no network egress, no secret strings, no',
  '    direct filesystem access) have to be written by hand. On the one repository where this was measured,',
  '    6 of 57 hand-written mechanical rules were of exactly that shape.',
  '  - A rule with no identifier in it. A rule that asserts a SHAPE ("this file stays under 300 lines", "every',
  '    command returns the same exit codes") names nothing a miner can match. 20 of those same 57 were of that',
  '    shape.',
  '  - Relations the code does not contain. `relations:` below come from resolved imports. On a repository',
  '    whose CI already forbids an undeclared import they will look near-perfect; on one without such a gate',
  '    they will be incomplete in proportion to how much of the dependency graph is dynamic, reflective, or in',
  '    a language grain has no grammar for.',
  '',
  'And one thing it deliberately does NOT say: an established negative in the evidence ("this module is never',
  'imported from that one") is a statement about what is PRACTICED, not about what is PERMITTED. It becomes a',
  'line in the refactor backlog, never a `deny` that contradicts an import the code actually contains.',
];
const preambleComment = () => PREAMBLE.map(l => (l ? `# ${l}` : '#')).join('\n') + '\n\n';

// ==================================================================================================
// 3. Candidate localities: the three levels a type can be cut at.
//
// 093 §2 measured which level actually matches a hand-written node type. Partitions match where the partition is
// a directory; role groups and directory cards hold seven more type-shaped sets that nothing surfaced. All three
// levels are generated here, and section 4 decides which are ACTIVE and which are ALTERNATIVES.
// ==================================================================================================

export function localities(exp, cache, files) {
  const out = { partitions: [], directories: [], groups: [] };
  const byName = new Map();
  for (const p of cache?.partitions || []) if (Array.isArray(p.files)) byName.set(p.name, new Set(p.files));
  for (const p of exp.partitions || []) {
    // Partition file sets come from the cache when it is there (grain's own answer); otherwise the partition
    // name is a directory prefix and the tracked files beneath it are the set, minus anything a deeper
    // partition claims. The residue partition `_repo` is not a locality at all — it is "everything else".
    let set = byName.get(p.name);
    if (!set) {
      if (p.name === '_repo') set = new Set();
      else {
        set = underDir(files, p.name);
        for (const q of exp.partitions) if (q.name !== p.name && q.name !== '_repo' && q.name.startsWith(p.name + '/')) for (const f of underDir(files, q.name)) set.delete(f);
      }
    }
    out.partitions.push({ level: 'partition', name: p.name, part: p, files: new Set([...set].filter(f => files.includes(f))) });
    for (const d of p.directories || []) {
      if (!d.dir) continue;
      out.directories.push({ level: 'directory', name: d.dir, part: p, card: d, files: underDir(files, d.dir) });
    }
    for (const g of p.groups || []) {
      const s = new Set((g.members || []).map(m => m.rel));
      if (s.size) out.groups.push({ level: 'group', name: `${p.name}::${g.id}`, part: p, group: g, files: new Set([...s].filter(f => files.includes(f))) });
    }
  }
  // a directory card can be published by several partitions; keep one per path
  const seen = new Set();
  out.directories = out.directories.filter(d => (seen.has(d.name) ? false : (seen.add(d.name), true)));
  return out;
}

// ==================================================================================================
// 4. `node_types` — choosing the level, and showing the alternatives instead of hiding them.
//
// THE CUT. Active types form an ANTICHAIN of path prefixes: no active type's directory contains another's. It is
// built deepest-first from three sources, in this order of evidence strength:
//
//   1. grain's partitions (its own certified cut of the directory tree — the level 093 §2 found agreeing with
//      hand types wherever the hand type is a directory);
//   2. directory cards strictly BELOW a partition root (grain publishes a card only for a directory that
//      carries scopes, so a published card is evidence of its own; this is the level that holds `portal-server`
//      and `portal-engine-api` in 093 §2's class-a table);
//   3. the top-level directory of any tracked file the first two leave uncovered (no grain evidence at all, and
//      the evidence line says so in those words).
//
// THE ALTERNATIVES. 093 §2 class c is the finding this section exists to answer: hand types are often ONE LEVEL
// FINER than grain's cut, split by a `content:` predicate. So a role group whose file set is not already a
// directory becomes a CANDIDATE SUB-TYPE with a drafted `content:` regex — and it is never silently substituted
// for the coarse type. It is written to `alternatives.md` with its evidence, its drafted predicate, and the
// exact count of tracked files that predicate selects, so the maintainer chooses the level rather than
// discovering one was chosen for them.
// ==================================================================================================

// Draft a `content:` regex for a role group from the group's own evidence, in descending order of how directly
// the group names itself. Returns null when the group offers nothing to anchor on — which is an answer, not a
// failure: a group with no marker, no shared name shape and no shared import is not a type.
export function contentRegexFor(group) {
  const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const members = group.members || [];
  const names = uniq(members.map(m => m.name).filter(n => n && n !== '<anon>'));
  // (1) a marker — a decorator or supertype the members carry; the most direct thing a group says about itself.
  for (const mk of group.markers || []) {
    const nm = mk.name || mk.marker;
    if (!nm || !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(nm)) continue;
    if (mk.type === 'decorator') return { regex: `@${esc(nm)}\\b`, why: `marker \`@${nm}\` (${(mk.carriers || []).length} carriers)` };
    if (mk.type === 'supertype') return { regex: `\\b(extends|implements)\\s+${esc(nm)}\\b`, why: `marker \`extends ${nm}\` (${(mk.carriers || []).length} carriers)` };
  }
  // (2) the members' own name shape — the longest common prefix and suffix over the member names. This is what
  //     a hand-written type does: `command` vs `command-support` in the pattern repo is literally "does this
  //     file export register<X>Command", and that regex is exactly a common prefix plus a common suffix.
  if (names.length >= MIN_GROUP_MEMBERS) {
    const pre = commonAffix(names, 'prefix'), suf = commonAffix(names, 'suffix');
    if (pre.length >= 3 && suf.length >= 3 && pre.length + suf.length < Math.min(...names.map(n => n.length)))
      return { regex: `\\b${esc(pre)}[A-Za-z0-9_]*${esc(suf)}\\b`, why: `member names share the prefix \`${pre}\` and the suffix \`${suf}\` (${names.length} names)` };
    if (pre.length >= 5) return { regex: `\\b${esc(pre)}[A-Za-z0-9_]*\\b`, why: `member names share the prefix \`${pre}\` (${names.length} names)` };
    if (suf.length >= 5) return { regex: `\\b[A-Za-z0-9_]*${esc(suf)}\\b`, why: `member names share the suffix \`${suf}\` (${names.length} names)` };
  }
  // (3) a shared import — weaker (an import is a dependency, not an identity) but real, and anchored.
  const imps = (group.imports || []).filter(i => i && i.length >= 4);
  if (imps.length === 1) return { regex: esc(imps[0]), why: `every member's file imports \`${imps[0]}\`` };
  // (4) a defining name token, when the group named itself one word.
  //
  // CASE. A `nameTokens` entry is a CASE-FOLDED subword out of grain's own vocabulary (`core.mjs`'s `tokenize`
  // lowercases; the export publishes them as `tok:` features), NOT a literal that appears in the source. Every
  // other branch above anchors on something spelled exactly as the code spells it — a decorator name, a
  // supertype, a member identifier, an import specifier — so only this one has to be rendered case-tolerantly.
  // Measured (ticket 101) on Yggdrasil's own planted-family fixtures: rendered case-sensitively, the token
  // `first` selected 0 of the 5 `*Repository.ts` members of `family-planted-mono` (their subword is `findFirst`,
  // capital F) and 0 of 6 on `family-planted-polyglot`, while selecting all 5 snake_case Python members
  // (`find_first`) — i.e. the predicate silently worked in one casing convention and was vacuous in the other.
  const toks = (group.nameTokens || []).filter(t => t && t.length >= 5);
  if (toks.length) return { regex: `\\b[A-Za-z0-9_]*${caseTolerant(toks[0])}[A-Za-z0-9_]*\\b`, why: `group's defining name token \`${toks[0]}\`` };
  return null;
}

// Render a case-folded token so it matches the source whatever casing convention the language uses, without
// changing the flags of the regex it is embedded in (Yggdrasil's `content:` predicate takes a pattern, not
// flags). A letter becomes `[Aa]`; every other character is escaped literally.
export function caseTolerant(token) {
  return [...String(token)].map(ch => {
    const lo = ch.toLowerCase(), up = ch.toUpperCase();
    if (lo !== up) return `[${up}${lo}]`;
    return ch.replace(/[.*+?^${}()|[\]\\]/, '\\$&');
  }).join('');
}

function commonAffix(names, which) {
  const norm = which === 'prefix' ? (s => s) : (s => [...s].reverse().join(''));
  const xs = names.map(norm);
  let out = xs[0] || '';
  for (const x of xs.slice(1)) { let i = 0; while (i < out.length && i < x.length && out[i] === x[i]) i++; out = out.slice(0, i); }
  return which === 'prefix' ? out : [...out].reverse().join('');
}

export function buildTypes(exp, loc, files, ctx, opts = {}) {
  // The 2-files-up admission floor for a directory-derived type used to be MIN_TYPE_FILES, a named, overridable
  // constant (`--min-type-files`) — ruling `granularity-bounded-by-evidence-not-taste` asked for exactly that: it
  // to be MEASURED as a floor to remove, not defended. Ticket 101 §5 ran 2 against 1 on three repositories and
  // found it not load-bearing: types and nodes count differ by a few (every extra element is a one- or two-file
  // directory nothing else claims), but aspects, pairs, refusals, drill outcomes and FALSE-ALARMs are
  // byte-identical between the two runs — the floor gated no operability at all. Ruling
  // `root-fix-accepted-min-type-files-goes` retires the knob; ticket 102 removes it. The number a directory
  // needs to be classified is a bare `2` below, unowned by any named constant, because there is nothing left to
  // measure by varying it.
  const active = [];       // { id, dir, when, files, evidence, source }
  const alternatives = []; // { id, of, when, selected, evidence, why }

  // THE CUT IS NESTED, NOT AN ANTICHAIN, AND NO PARENT IS CARVED HOLLOW.
  //
  // The first version of this renderer took the deepest candidate and cut the parent's `when` down with `not:`
  // exclusions. Measured against the pattern repo's hand graph it LOST recall (15/36 against a 19/36 baseline):
  // the hand graph's `engine` type is the WHOLE of `source/cli/src/core`, and hollowing that type out to make
  // room for three of its sub-directories destroyed the one type grain reproduces best. So both levels ship,
  // both classify, and their overlap is stated rather than resolved. Yggdrasil permits it (only two `enforce:
  // strict` types may not overlap, and this renderer sets `strict` on nothing) and it is the honest shape: grain
  // measured two cuts of the same tree and has no basis for deleting either.
  const cands = new Map(); // dir -> candidate (first source to name a directory keeps it)
  const put = c => { const k = c.dir ?? `\0${c.id}`; if (!cands.has(k)) cands.set(k, c); };
  for (const p of loc.partitions) {
    if (p.name === '_repo' || !p.files.size) continue;
    // A PARTITION NAME IS GRAIN'S LABEL, NOT NECESSARILY A PATH. `_repo` is the residue bucket (excluded above
    // by name, since it is "everything else" rather than a locality) and `_root` is the repository-root bucket:
    // its files are real, but no directory called `_root` exists. Rendered as a directory the way every other
    // partition is, it produces a `when` of `_root/**` that selects nothing, a node whose `mapping` names a path
    // that is not there, and aspects scoped to `_root/**` that can never produce a pair. Measured (ticket 101):
    // 4 of 17 corpus repositories carried such a partition, 168 drafted aspects were scoped to `_root/**`
    // (17 of them deterministic) and every one produced ZERO pairs — which is the whole reason `leveldb` and
    // `kotlin-datetime` scored 0% before this. The test is DERIVED, not a list of names: if no tracked file
    // lives under the name, the name is not a directory.
    if (!underDir(files, p.name).size) {
      // Its files are real. When they all sit at the repository root, that is exactly the shape the root-glob
      // type already models (`when: { path: '*' }`); anything else has no path expression and is disclosed as
      // an alternative rather than guessed at.
      if ([...p.files].every(f => !f.includes('/'))) {
        put({ dir: null, id: slug(p.name), rootGlob: true, files: p.files, src: 'partition', why: `grain partition \`${p.name}\` (kind ${p.part.kind}, ${p.part.files} files, ${p.part.scopes} scopes, ${p.part.groups.length} role groups) — a synthetic bucket, not a directory: every file in it sits at the repository root, so it is drafted as the root glob rather than as a path prefix` });
      }
      continue;
    }
    put({ dir: p.name, files: p.files, src: 'partition', why: `grain partition (kind ${p.part.kind}, ${p.part.files} files, ${p.part.scopes} scopes, ${p.part.groups.length} role groups)` });
  }
  const partRoots = new Set([...cands.keys()]);
  // grain's OTHER cut of the same tree: the refined module graph. It is coarser than the partition set in some
  // places and finer in others, and both were in the candidate set the reconstruction measured against.
  for (const m of exp.moduleGraph?.nodes || []) {
    const s = underDir(files, m.id);
    if (s.size < GROUP_MIN) continue;
    put({ dir: m.id, files: s, src: 'module', why: `grain module \`${m.id}\` (${m.files} files, dependency layer ${m.layer})` });
  }
  // directory cards ONE LEVEL below a partition root. Grain publishes a card only for a directory that carries
  // scopes, so a published card is evidence of its own; one level is where a hand architecture actually splits
  // (`portal/api`, `portal/server` in the pattern repo), and deeper cards are drill corpora and fixture trees.
  for (const d of loc.directories) {
    if (cands.has(d.name) || d.files.size < MIN_PROMOTE_FILES) continue;
    const owner = [...partRoots].filter(r => d.name.startsWith(r + '/')).sort((a, b) => b.length - a.length)[0];
    const depth = owner ? d.name.slice(owner.length + 1).split('/').length : null;
    if (depth !== 1) continue;
    put({ dir: d.name, files: d.files, src: 'directory', why: `grain directory card \`${d.name}\` (${d.card.files} files, ${d.card.scopes} scopes), one level below the partition \`${owner}\`` });
  }
  for (const c of [...cands.values()].sort((a, b) => (String(a.dir) < String(b.dir) ? -1 : 1))) {
    if (c.files.size < GROUP_MIN) continue;
    active.push({ id: c.id || slug(c.dir), dir: c.dir, files: c.files, source: c.src, why: c.why, ...(c.rootGlob ? { rootGlob: true } : {}) });
  }

  // the uncovered remainder, by top-level directory. No grain evidence — and the evidence line says so.
  const covered = new Set();
  for (const a of active) for (const f of a.files) covered.add(f);
  const rest = new Map();
  for (const f of files) {
    if (covered.has(f)) continue;
    const top = f.includes('/') ? f.slice(0, f.indexOf('/')) : '.';
    (rest.get(top) || rest.set(top, new Set()).get(top)).add(f);
  }
  for (const [top, set] of [...rest].sort((a, b) => b[1].size - a[1].size)) {
    if (set.size < GROUP_MIN || top === '.' || cands.has(top)) continue;
    active.push({ id: slug(top), dir: top, files: underDir(files, top), source: 'uncovered', why: `directory \`${top}\` holds ${set.size} tracked files no grain partition, module or directory card claims — a grouping from the layout alone, with no mining behind it` });
  }
  const rootFiles = rest.get('.');
  if (rootFiles && rootFiles.size >= GROUP_MIN && !active.some(a => a.rootGlob)) active.push({ id: 'repo-root-file', dir: null, files: rootFiles, source: 'uncovered', rootGlob: true, why: `${rootFiles.size} tracked files sit at the repository root and no grain partition, module or directory card claims them — a grouping from the layout alone, with no mining behind it` });

  for (const a of active) {
    a.when = a.rootGlob ? { path: '*' } : { path: `${a.dir}/**` };
    a.selected = expandWhen(a.when, files, ctx);
    a.fidelity = jaccard(a.files, a.selected);
    a.contains = active.filter(b => b.dir && a.dir && b.dir !== a.dir && b.dir.startsWith(a.dir + '/')).map(b => b.id);
  }

  // THE ALTERNATIVES: the level 093 §2 class (a) named as the cheapest recall available anywhere — sets grain
  // already holds inside a role group or an unpromoted directory card, which the hand graph turned into a node
  // type and which nothing surfaced as a type candidate.
  //
  // Each candidate is offered in BOTH forms a hand-written architecture actually uses, because they fail
  // differently and only the maintainer knows which failure is acceptable:
  //
  //   - `-content`: a `path` + `content` predicate drafted from the group's own marker or name shape. It
  //     GENERALISES — a new file that matches joins the type by itself — and it may over- or under-select. This
  //     is the shape 093 §2 class (c) says the hand graph reaches for (`command` vs `command-support` is
  //     literally a `content:` regex over an exported symbol name).
  //   - `-list`: the membership frozen as an `any_of` of explicit paths. It is EXACT today and DEAD tomorrow —
  //     it classifies no file grain did not already see. Yggdrasil's own architecture uses this shape where a
  //     type is a fixed set rather than a rule.
  const seenAlt = new Set();
  const addAlt = (a) => { if (!seenAlt.has(a.id)) { seenAlt.add(a.id); alternatives.push(a); } };
  const finer = [
    // `groupId`/`partKind` ride along ONLY so a downstream family-without-law adapter (ticket 100) can name a
    // stable id and a language stratum for a role-group alternative without re-deriving either from `label` —
    // they change nothing about which alternatives are offered or how.
    ...loc.groups.map(g => ({ set: g.files, label: g.group.label || g.group.id, group: g.group, groupId: g.group.id, partKind: g.part.kind, part: g.part.name, kind: 'role group' })),
    ...loc.directories.filter(d => !active.some(a => a.dir === d.name)).map(d => ({ set: d.files, label: d.name, group: null, groupId: null, partKind: d.part.kind, part: d.part.name, kind: 'directory card' })),
  ];
  for (const f of finer) {
    if (f.set.size < GROUP_MIN) continue;
    const host = active.filter(a => a.dir && [...f.set].every(x => x.startsWith(a.dir + '/') || x === a.dir)).sort((a, b) => b.dir.length - a.dir.length)[0];
    if (!host) continue;
    if (jaccard(f.set, host.files) >= 0.9) continue; // the candidate IS the host — nothing finer on offer
    const base = `${host.id}-${slug(f.label)}`.slice(0, 100);
    const cr = f.group ? contentRegexFor(f.group) : null;
    if (cr) {
      const when = { all_of: [{ path: `${host.dir}/**` }, { content: cr.regex }] };
      let selected = null;
      try { selected = expandWhen(when, files, ctx); } catch { /* a predicate that will not compile is itself a finding */ }
      if (selected) {
        const j = jaccard(f.set, selected);
        addAlt({ id: `${base}-content`, of: host.id, form: 'content', when, groupFiles: f.set.size, selected: selected.size, fidelity: +j.toFixed(3), viable: j >= MIN_WHEN_FIDELITY,
          kind: f.kind, groupId: f.groupId, partKind: f.partKind, members: [...f.set].sort(),
          why: `${f.kind} \`${f.label}\` in partition \`${f.part}\`: ${f.set.size} files; generalising predicate from ${cr.why}; selects ${selected.size} tracked files, ${intersectSize(f.set, selected)} of them the candidate's own (J=${j.toFixed(2)})` });
      }
    }
    const paths = [...f.set].sort();
    addAlt({ id: `${base}-list`, of: host.id, form: 'list', when: { any_of: paths.map(p => ({ path: p })) }, groupFiles: f.set.size, selected: f.set.size, fidelity: 1, viable: true,
      kind: f.kind, groupId: f.groupId, partKind: f.partKind, members: paths,
      why: `${f.kind} \`${f.label}\` in partition \`${f.part}\`: the exact ${f.set.size} files grain grouped, frozen as an \`any_of\` of explicit paths — exact today, and it will classify no file grain has not already seen` });
  }
  alternatives.sort((a, b) => b.fidelity - a.fidelity || b.groupFiles - a.groupFiles || (a.id < b.id ? -1 : 1));
  return { active, alternatives };
}

// ==================================================================================================
// 5. Relations, and the one thing an established negative may NOT become.
//
// Allow-lists are aggregated from resolved file->file imports, mapped through each file's owning node to its
// type. Only `uses` is populated: grain's edge kinds on a typed repository are imports, and an import is a use,
// never necessarily a call — writing `calls:` from an import would assert something the evidence does not say.
//
// `default: deny` (093 §4). Grain's `archNorms exp:"false"` rows are established NEGATIVES — "this module does
// not reach that one, and the absence itself compresses". The architecture's `deny` is a statement about what is
// PERMITTED. On the pattern repo one of the two published negatives (`relations -> core`, share 0.941) sits on a
// pair the hand architecture explicitly ALLOWS: both statements are true about different things. So a negative
// is turned into `default: deny` only when it is not contradicted by anything observed — the source type has no
// resolved outgoing edge at all — and otherwise it becomes a backlog line, never a deny.
// ==================================================================================================

export function buildRelations(exp, typeOfFile, active) {
  const pairs = new Map(); // "from|to" -> n
  for (const e of exp.edges || []) {
    const a = typeOfFile.get(e.from), b = typeOfFile.get(e.to);
    if (!a || !b || a === b) continue;
    const k = a + '|' + b;
    pairs.set(k, (pairs.get(k) || 0) + (e.n || 1));
  }
  const uses = new Map(); // type -> Map(target -> n)
  for (const [k, n] of pairs) {
    const [a, b] = k.split('|');
    (uses.get(a) || uses.set(a, new Map()).get(a)).set(b, n);
  }
  // established negatives, split into the two things they can become
  const denies = [], backlog = [];
  const dirOfType = new Map(active.filter(a => a.dir).map(a => [a.dir, a.id]));
  for (const an of exp.archNorms || []) {
    if (an.exp !== 'false' || an.fromKind !== 'module') continue;
    const fromT = dirOfType.get(an.from), toT = dirOfType.get(an.to);
    const rec = { from: an.from, to: an.to, fromType: fromT || null, toType: toT || null, share: an.share, ne: an.ne, neff: an.neff, bits: an.bits };
    const observed = fromT && uses.get(fromT) && uses.get(fromT).size;
    if (fromT && !observed) { denies.push(rec); rec.becomes = 'default: deny'; }
    else { rec.becomes = 'backlog only'; rec.whyNot = observed ? `type \`${fromT}\` has ${uses.get(fromT).size} observed outgoing dependencies — a deny here would contradict imports the code contains` : `\`${an.from}\` is not a proposed type, so there is nothing to deny on`; backlog.push(rec); }
  }
  return { uses, denies, backlog, pairs };
}

// ==================================================================================================
// 6. Nodes — the COARSE cut, deliberately.
//
// 093 §3: the pattern repo's hand graph has 250 nodes that map exactly ONE file. Imitating that would be
// imitating a granularity choice, not recovering evidence — a one-file node is a decision about how finely to
// review, and grain has nothing to say about it. So one node per active type, mapping that type's directory,
// nested in `model/` so a child node's directory sits under its parent's. Every finer candidate grain does hold
// (role groups, deeper directory cards) is listed in `alternatives.md` as a node the maintainer may split out.
// ==================================================================================================

// A node's path in the graph IS its directory under `model/`, so a repository directory whose name starts with
// a dot cannot be one verbatim — Yggdrasil's model walker does not descend into it. The mapping still names the
// real path; only the node's own address is rewritten.
export const nodePathFor = dir => (dir ? dir.split('/').map(s => (s.startsWith('.') ? 'dot-' + s.slice(1) : s)).join('/') : 'repo-root');

// A subtree that carries its own `.yggdrasil/` is a SEPARATE PROJECT, and every Yggdrasil check skips it. Grain
// has no such notion — those files are tracked, so they are mined — and the first version of this renderer duly
// gave each of them a node. Measured on the pattern repo that produced 11 `mapping-path-missing` errors reading
// "resolves only to excluded files". The TYPES stay (a `when` predicate over a subtree costs nothing and is
// still true); only the nodes are withheld, since a node whose whole mapping is invisible to the checker is a
// node that can never carry a verdict.
export const nestedProjectRoots = files => {
  const roots = new Set();
  for (const f of files) {
    const i = f.indexOf('/.yggdrasil/');
    if (i > 0) roots.add(f.slice(0, i));
  }
  return [...roots];
};

export function buildNodes(active, typeOfFile, exp, nestedRoots = []) {
  const live = f => !nestedRoots.some(r => f.startsWith(r + '/'));
  const nodes = active.map(a => ({
    id: nodePathFor(a.dir),
    type: a.id,
    dir: a.dir,
    files: new Set([...a.files].filter(live)),
    why: a.why,
  })).filter(n => n.files.size > 0);
  // Yggdrasil loads a node only where a `yg-node.yaml` sits, and reads the hierarchy from the directory chain
  // under `model/`. A gap in that chain (a `model/source/` with no node between `model/` and
  // `model/source/cli/src/core/`) silently loses the whole subtree — measured: 82 nodes written, 12 loaded.
  // So every missing intermediate segment gets an ORGANIZATIONAL node (`type: module`, no mapping), which is
  // what a hand-written graph does at the same places and what the schema's "parent-only" type is for.
  const have = new Set(nodes.map(n => n.id));
  for (const n of [...nodes]) {
    const segs = n.id.split('/');
    for (let k = 1; k < segs.length; k++) {
      const id = segs.slice(0, k).join('/');
      if (have.has(id)) continue;
      have.add(id);
      nodes.push({ id, type: 'module', dir: null, files: new Set(), organizational: true, why: `organizational node: \`model/${id}/\` is a step in the hierarchy between nodes that do carry a mapping, and Yggdrasil reads the hierarchy from that directory chain` });
    }
  }
  nodes.sort((a, b) => (a.id < b.id ? -1 : 1));
  const nodeOfFile = new Map();
  for (const n of [...nodes].sort((a, b) => (a.dir || '').split('/').length - (b.dir || '').split('/').length)) for (const f of n.files) nodeOfFile.set(f, n.id);
  const rel = new Map();
  for (const e of exp.edges || []) {
    const a = nodeOfFile.get(e.from), b = nodeOfFile.get(e.to);
    if (!a || !b || a === b) continue;
    const m = rel.get(a) || rel.set(a, new Map()).get(a);
    m.set(b, (m.get(b) || 0) + (e.n || 1));
  }
  for (const n of nodes) n.relations = [...(rel.get(n.id) || new Map())].sort((x, y) => y[1] - x[1]).map(([t, n2]) => ({ target: t, n: n2 }));

  // mapping form, and (for the explicit form) the files this node owns after every descendant has taken its own
  for (const n of nodes) {
    n.useDir = !!n.dir && !nestedRoots.some(r => r === n.dir || r.startsWith(n.dir + '/'));
    const kids = nodes.filter(m => m !== n && m.id.startsWith(n.id + '/'));
    n.ownFiles = new Set([...n.files].filter(f => !kids.some(k => k.files.has(f))));
  }

  // A CYCLE IN THE CODE IS NOT EXPRESSIBLE IN THE GRAPH, AND THE PROPOSAL SAYS SO RATHER THAN HIDING IT.
  //
  // Yggdrasil refuses a graph whose node relations form a loop (`structural-cycle`, blocking). Grain measures
  // real loops in the pattern repo's imports — the same two `yg advise` nominates independently. An earlier
  // version of this renderer broke each loop at its weakest edge to make the proposal green. MEASURED, that
  // trade was bad: dropping 8 edges turned one `structural-cycle` error, which names the real defect and the
  // real fix, into 4 `relation-undeclared-dependency` errors whose suggested fix is to put the edges back. So
  // every resolved edge is declared, the loops are found and reported here and at the top of the refactor
  // backlog, and the proposal is honestly RED on a repository whose imports form a cycle. That is not a
  // renderer defect; it is the finding.
  const dropped = [];
  const outgoing = () => new Map(nodes.map(n => [n.id, n.relations.filter(r => !r._masked).map(r => r.target)]));
  for (let guard = 0; guard < 500; guard++) {
    const adj = outgoing();
    const colour = new Map(), stack = [];
    let loop = null;
    const dfs = id => {
      if (loop) return;
      colour.set(id, 1); stack.push(id);
      for (const t of adj.get(id) || []) {
        if (loop) return;
        if (colour.get(t) === 1) { loop = stack.slice(stack.indexOf(t)).concat(t); return; }
        if (!colour.has(t)) dfs(t);
      }
      colour.set(id, 2); stack.pop();
    };
    for (const n of nodes) if (!colour.has(n.id) && !loop) dfs(n.id);
    if (!loop) break;
    let weakest = null;
    for (let i = 0; i < loop.length - 1; i++) {
      const from = nodes.find(n => n.id === loop[i]);
      const edge = from.relations.find(r => r.target === loop[i + 1]);
      if (edge && (!weakest || edge.n < weakest.edge.n)) weakest = { from, edge };
    }
    if (!weakest) break;
    // recorded, NOT removed — but the edge is masked for this scan so the next loop can be found
    weakest.from.relations = weakest.from.relations.map(r => (r === weakest.edge ? { ...r, _masked: true } : r));
    dropped.push({ from: weakest.from.id, to: weakest.edge.target, n: weakest.edge.n, cycle: loop });
  }
  for (const n of nodes) n.relations = n.relations.map(r => { const { _masked, ...rest } = r; void _masked; return rest; });
  void typeOfFile;
  return { nodes, cycles: dropped, nodeOfFile };
}

// ==================================================================================================
// 7. Aspect drafts — from the certified set AND from the sub-gate lattice.
//
// (i) A CERTIFIED convention is a claim grain is willing to make: its statement becomes the rule and its
//     superposition template (the group's anti-unified skeleton) becomes "what passing looks like".
//
// (ii) The SUB-GATE lattice is the other half, and `sub-gate-rows-are-the-product` is why it exists: the real
//     house rules of the pattern repo sit BELOW the λ gate as low-share candidates (`catch -> abortOnUnexpected
//     Error`, practised in 22% of places). For an agent mid-edit, refusing to certify those is correct. For a
//     maintainer drafting aspects, the sub-gate row IS the draft plus its own refactor backlog.
//
//     THE SURFACE THAT ALREADY EXPOSES THEM is `grain explain <file>` (alias `spectrum`) — its `[obs ]` rows,
//     as against `[NORM]` rows, are exactly the below-gate cells (`spectrum()` in `engine/core.mjs`). But
//     `explain` conditions its cells on ONE file's roles and directory chain and then keeps only rows that file
//     has, so it is a per-file debug dump, not a maintainer surface. THE AGGREGATION NEEDED (ticket 095) is:
//     the same cells, built once per PARTITION over all its scopes, with `_all:<kind>` and `r<role>:<kind>`
//     cell ids, ranked by adoption share, and each row carrying the sites that do NOT conform. That is what
//     `partitionLattice` below computes, from the engine's own vocabulary and codelength, read-only.
// ==================================================================================================

const CELL_SEP = '\u0001'; // the same cell-key separator `core.mjs` uses; a pid can contain spaces, so ' ' would truncate it

export async function partitionLattice(repo, opts = {}) {
  const modelPath = join(repo, '.grain', 'cache', 'model.json');
  const treePath = join(repo, '.grain', 'cache', 'tree.json');
  if (!existsSync(modelPath) || !existsSync(treePath)) return { rows: [], reason: 'no grain cache (.grain/cache/{model,tree}.json) — run `grain export` on this repo first' };
  const core = await import(`file://${CORE}`);
  const { hydrateScope, applyVocab, buildVocab, skeyR, isBool, kt } = core;
  const model = JSON.parse(readFileSync(modelPath, 'utf8'));
  const tree = JSON.parse(readFileSync(treePath, 'utf8'));
  const byFile = new Map();
  for (const [k, v] of Object.entries(tree)) {
    const rel = k.slice(k.indexOf('|') + 1);
    byFile.set(rel, (Array.isArray(v) ? v : v.s) || []);
  }
  const rows = [];
  for (const part of model.partitions || []) {
    const ps = [];
    for (const rel of part.files || []) for (const raw of byFile.get(rel) || []) { if (raw.name !== '<anon>') ps.push(hydrateScope(raw)); }
    if (ps.length < 3) continue;
    const vocab = buildVocab(ps, { deep: true });
    for (const s of ps) applyVocab(s, vocab);
    const roleOf = s => { const r = part.assignments?.[skeyR(s.rel, s)]; return r !== undefined && r !== -1 ? r : undefined; };
    const cells = new Map(), sites = new Map();
    const add2 = (cid, pid, v, s) => {
      const k = cid + CELL_SEP + pid;
      const c = cells.get(k) || cells.set(k, Object.create(null)).get(k);
      c[v] = (c[v] || 0) + 1;
      (sites.get(k) || sites.set(k, []).get(k)).push({ rel: s.rel, kind: s.kind, name: s.name, line: s.line, v });
    };
    for (const s of ps) {
      const r = roleOf(s);
      for (const [pid, v] of Object.entries(s.preds)) {
        add2('_all:' + s.kind, pid, v, s);
        if (r !== undefined) add2('r' + r + ':' + s.kind, pid, v, s);
      }
    }
    const idxCost = Math.ceil(Math.log2(Math.max(cells.size, 2)));
    const factKey = new Set((part.facts || []).map(f => f.cid + CELL_SEP + f.pid + CELL_SEP + f.exp));
    for (const [key, c] of cells) {
      const [cid, pid] = key.split(CELL_SEP);
      if (!pid) continue;
      const kind = cid.split(':').pop();
      const n = Object.values(c).reduce((a, b) => a + b, 0);
      if (n < 3) continue;
      const Vv = Object.keys(c).sort();
      const bl = isBool(pid);
      const K = bl ? 2 : Vv.length + 1;
      const allC = cells.get('_all:' + kind + CELL_SEP + pid);
      const allN = allC ? Object.values(allC).reduce((a, b) => a + b, 0) : n;
      let data = 0;
      if (cid.startsWith('_all')) { const B = Math.max(bl ? 2 : Vv.length, 2); for (const v of Vv) if (c[v]) data += c[v] * Math.log2(kt(c, K, v, n) * B); }
      else if (!allC) continue; // no partition-wide reference for this cell — nothing to contrast against
      else for (const v of Vv) if (c[v]) data += c[v] * Math.log2(kt(c, K, v, n) / kt(allC, K, v, allN));
      const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(n, 2)) - idxCost;
      let exp = null, ne = -1;
      for (const v of Vv) if (c[v] > ne) { exp = v; ne = c[v]; }
      if (!bl && ['other', 'none', 'mixed', '?'].includes(exp)) continue;
      if (bl && exp === 'false') { const tot = allN; if (!tot || (allC?.['true'] || 0) / tot < 0.2) continue; }
      const share = ne / n;
      const isNorm = factKey.has(cid + CELL_SEP + pid + CELL_SEP + exp);
      rows.push({
        partition: part.name, cid, pid, exp, share, n, ne, bits: +bits.toFixed(1), isNorm,
        role: /^r(\d+):/.exec(cid)?.[1] ?? null, kind,
        deviants: (sites.get(key) || []).filter(s => s.v !== exp).map(s => `${s.rel}#${s.name}`),
      });
    }
  }
  void opts;
  return { rows, reason: null };
}

// The sub-gate band: practised by a supermajority but below the certification bound, with real support. These
// are the rows a maintainer reads as "a house rule that has not finished spreading".
export const subGate = rows => rows
  .filter(r => !r.isNorm && r.n >= MIN_SUPPORT && r.share >= SUPERMAJORITY && r.share < LAMBDA_BOUND)
  .sort((a, b) => b.share - a.share || b.n - a.n || (a.pid < b.pid ? -1 : 1));

// The identifier a lattice pid or a convention feature is ABOUT — what an aspect draft names, and the thing a
// comparison against a hand-written mechanical rule can match on.
export const identifierOf = pid => {
  const m = /^auto\.([a-z0-9]+):(.*)$/.exec(String(pid));
  return m ? m[2] : null;
};

// ---- the check renderer: one template per RENDERABLE enumerator class ----
//
// The director's steer (counsel memo §2 B1, §4): where a convention's `check` descriptor has a renderable
// enumerator class, render a DETERMINISTIC `check.mjs` against Yggdrasil's `check(ctx)` contract — never prose.
// Prose is reserved for what has no shape, and each prose aspect says which class it fell out of and why.
//
// `errs: under` IS EARNED, NOT DECLARED. Every template below obeys one discipline: report a violation only
// where the tree PROVES the negation. A rule "methods here return `Promise`" fires on a method that declares a
// DIFFERENT return type, and stays silent on a method that declares none — a missing annotation is a language
// or a style question, not evidence against the rule. A rule "files here never import X" fires only where the
// import is actually present. Under-firing is the deliberate error direction; ticket 097 measures it.
//
// Grain and Yggdrasil parse with the same tree-sitter grammars, so a rendered check reads the same tree grain
// counted. Where a language's grammar names a field differently the check sees no evidence and stays silent —
// again, under.

// grain's name-shape alphabet (`nameShape`, engine/core.mjs): `U` a run of uppercase, `a` a run of
// lowercase/digits, `_ - $ .` themselves, `?` anything else, and `(XY)+` a repeated pair. A shape compiles to
// an anchored regex mechanically; a shape carrying `?` does not compile at all (that is an answer, not a gap).
export function shapeToRegex(shape) {
  if (!shape || /\?/.test(shape)) return null;
  const toks = shape.match(/\([^)]+\)\+|./g) || [];
  const atom = ch => (ch === 'U' ? '[A-Z]+' : ch === 'a' ? '[a-z0-9]+' : /[_\-$.]/.test(ch) ? ch.replace(/[.$\-]/g, '\\$&') : null);
  let out = '';
  for (const t of toks) {
    const g = /^\((.+)\)\+$/.exec(t);
    if (g) {
      let inner = '';
      for (const ch of g[1]) { const a = atom(ch); if (!a) return null; inner += a; }
      out += `(?:${inner})+`;
    } else { const a = atom(t); if (!a) return null; out += a; }
  }
  return `^${out}$`;
}

// The node types each language's grammar uses for the construct a template needs. Deliberately a REGEX over
// node-type names rather than a per-language table: the shipped grammars agree on the words, and a grammar that
// does not match simply yields no evidence (under).
const NT = {
  import: '/(^|_)(import|use_declaration|using_directive|include|require)/',
  call: '/^(call_expression|call|method_invocation|invocation_expression|function_call_expression|macro_invocation)$/',
  deco: '/(decorator|attribute|annotation)/',
  heritage: '/(heritage|extends|superclass|base_list|implements|impl_item|superclasses)/',
  decl: '/(function|method|class|interface|struct|enum|type_alias)_(declaration|definition|item|specifier)|method_signature|function_signature/',
  typeDecl: '/^(class_declaration|class_definition|class_specifier|interface_declaration|type_alias_declaration|enum_declaration|enum_specifier|enum_item|struct_item|struct_specifier|trait_item|record_declaration|object_declaration|type_declaration|type_item)$/',
  funcDecl: '/^(function_declaration|function_definition|function_item|function_signature|method_definition|method_declaration|method_signature)$/',
};

const PROVENANCE = p => `// PROVENANCE — grain measured this, it did not decide it.
//   ${p.replace(/\n/g, '\n//   ')}
//
// DRAFT: this aspect is \`status: draft\`, so the runner never executes this check. Read it, decide whether the
// rule is real, then promote it. \`errs: under\` is the contract this template keeps: it reports only where the
// syntax tree proves the negation, and stays silent where the language gives it nothing to read.`;

// Every template shares one skeleton so the contract (sync, Violation[], guard on file.ast) is identical.
const wrap = (prov, body, helpers = '') => `import { walk, report } from '@chrisdudek/yg/ast';

${PROVENANCE(prov)}
${helpers}
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
${body}
  }
  return violations;
}
`;

export function renderCheck(spec) {
  const { enumerator, argument, expected, provenance } = spec;
  const A = JSON.stringify(String(argument ?? ''));
  const wants = String(expected) === 'true';
  switch (enumerator) {
    // MATCHING THE SPECIFIER. The first version of this template looked for the specifier only INSIDE QUOTES
    // (`'x'`, `"x"`, `` `x` ``). That is how JavaScript, TypeScript and Go spell an import and how almost
    // nothing else does: Java writes `import jakarta.persistence.Entity;`, Python `import os`, Rust
    // `use serde::Serialize;`, C# `using System;`, all unquoted — so on every one of those languages the check
    // matched nothing, refused nothing, and MISSED every `violates-` case in its own drill corpus. Measured
    // (ticket 101, spring-petclinic): 17 of 38 rendered checks were `imp` checks, every one of them scored
    // 0 refusals on the repository and 4-5/5 MISS on its own corpus. The specifier is now matched as a bounded
    // token anywhere in the import statement's text, which covers the quoted spelling as well (a quote is not
    // an identifier character) without matching a longer name that merely contains it (`os` does not match
    // `import osmosis`, and `java.util.List` does not match `import java.util.ArrayList`).
    case 'imp':
      return wrap(provenance, `    if (!file.ast) continue;
    const SPEC = ${A};
    const SPEC_RE = new RegExp('(^|[^A-Za-z0-9_$.])' + SPEC.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + '($|[^A-Za-z0-9_$])');
    let sawAnyImport = false, sawSpec = null;
    walk(file.ast.rootNode, n => {
      if (!${NT.import}.test(n.type)) return;
      sawAnyImport = true;
      if (SPEC_RE.test(n.text)) sawSpec = n;
    });
    if (${wants}) {
      // under: only a file that DOES import things, and not this one, is evidence against the rule.
      if (sawAnyImport && !sawSpec) violations.push({ file: file.path, line: 1, column: 0, message: 'expected an import of ' + SPEC + ' here (proposed rule, not yet reviewed)' });
    } else if (sawSpec) {
      violations.push(report(file, sawSpec, 'this rule proposes that ' + SPEC + ' is not imported here (proposed rule, not yet reviewed)'));
    }`);
    case 'call':
      return wrap(provenance, `    if (!file.ast) continue;
    const NAME = ${A};
    let sawAnyCall = false; const hits = [];
    walk(file.ast.rootNode, n => {
      if (!${NT.call}.test(n.type)) return;
      sawAnyCall = true;
      const callee = (n.namedChild(0) ? n.namedChild(0).text : '').replace(/\\s+/g, '');
      if (callee === NAME) hits.push(n);
    });
    if (${wants}) {
      if (sawAnyCall && !hits.length) violations.push({ file: file.path, line: 1, column: 0, message: 'expected a call to ' + NAME + ' here (proposed rule, not yet reviewed)' });
    } else for (const n of hits) violations.push(report(file, n, 'this rule proposes that ' + NAME + ' is not called here (proposed rule, not yet reviewed)'));`);
    case 'deco':
      return wrap(provenance, `    if (!file.ast) continue;
    const NAME = ${A};
    let sawAny = false; const hits = [];
    walk(file.ast.rootNode, n => {
      if (!${NT.deco}.test(n.type)) return;
      sawAny = true;
      if (new RegExp('(^|[^A-Za-z0-9_])' + NAME.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + '\\\\b').test(n.text)) hits.push(n);
    });
    if (${wants}) {
      if (sawAny && !hits.length) violations.push({ file: file.path, line: 1, column: 0, message: 'expected the marker ' + NAME + ' here (proposed rule, not yet reviewed)' });
    } else for (const n of hits) violations.push(report(file, n, 'this rule proposes that ' + NAME + ' is not used here (proposed rule, not yet reviewed)'));`);
    case 'extends':
      return wrap(provenance, `    if (!file.ast) continue;
    const NAME = ${A};
    let sawAny = false; const hits = [];
    walk(file.ast.rootNode, n => {
      if (!${NT.heritage}.test(n.type)) return;
      sawAny = true;
      if (new RegExp('\\\\b' + NAME.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + '\\\\b').test(n.text)) hits.push(n);
    });
    if (${wants}) {
      if (sawAny && !hits.length) violations.push({ file: file.path, line: 1, column: 0, message: 'expected a declaration extending ' + NAME + ' here (proposed rule, not yet reviewed)' });
    } else for (const n of hits) violations.push(report(file, n, 'this rule proposes that nothing here extends ' + NAME + ' (proposed rule, not yet reviewed)'));`);
    case 'returns':
      return wrap(provenance, `    if (!file.ast) continue;
    const NAME = ${A};
    const re = new RegExp('\\\\b' + NAME.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&') + '\\\\b');
    walk(file.ast.rootNode, n => {
      const rt = n.childForFieldName ? n.childForFieldName('return_type') : null;
      if (!rt) return; // under: a declaration with no declared return type is no evidence either way
      const hit = re.test(rt.text);
      if (hit !== ${wants}) violations.push(report(file, rt, ${wants ? "'expected a declared return type of ' + NAME + ' here'" : "'this rule proposes that nothing here declares a return type of ' + NAME"} + ' (proposed rule, not yet reviewed)'));
    });`);
    case 'nameshape': {
      const re = shapeToRegex(String(expected));
      // A name-shape rule is about ONE kind of declaration. Rendering it over every declaration node breaks the
      // `errs: under` contract by construction, and did: drilled on the pattern repo the first version produced
      // 4 FALSE-ALARMs out of 5 cases on a single rule, refusing files for methods a rule about TYPES never
      // spoke about. So the template exists only for the kinds whose grammar node types can be named exactly,
      // and every other kind falls through to prose.
      const forKind = { type: NT.typeDecl, method: NT.funcDecl }[spec.kind];
      if (!re || !forKind) return null;
      return wrap(provenance, `    if (!file.ast) continue;
    walk(file.ast.rootNode, n => {
      if (!${forKind}.test(n.type)) return;
      const nm = n.childForFieldName ? n.childForFieldName('name') : null;
      if (!nm || !nm.text) return;
      if (!SHAPE.test(nm.text)) violations.push(report(file, nm, 'name ' + nm.text + ' does not follow the shape this rule proposes (' + ${JSON.stringify(String(expected))} + ') (proposed rule, not yet reviewed)'));
    });`, `const SHAPE = ${new RegExp(re).toString()};\n`);
    }
    case 'filenameshape': {
      const re = shapeToRegex(String(expected));
      if (!re) return null;
      // THE SHAPE IS THE STEM'S, NOT THE BASENAME'S. grain measures `auto.filenameshape` as
      // `nameShape(basename(rel, extname(rel)))` (`core.mjs`) — the name with its LAST extension removed — and
      // the compiled shape is anchored (`^...$`), so testing it against the basename can never match a file
      // that has an extension at all. Measured (ticket 101, spring-petclinic): both rendered `filenameshape`
      // checks refused 100% of the files in their own scope, and the one whose corpus had `satisfies-` cases
      // FALSE-ALARMED on 5 of 5 — on the very files grain had certified as conforming. The stem is computed
      // here exactly as node's `basename(b, extname(b))` computes it, dotfiles included.
      return `${PROVENANCE(provenance)}
const SHAPE = ${new RegExp(re).toString()};

// grain measured this shape on the file name with its last extension removed; match what it measured.
const stemOf = b => { const i = b.lastIndexOf('.'); return i > 0 ? b.slice(0, i) : b; };

export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    const base = file.path.split('/').pop();
    if (!SHAPE.test(stemOf(base))) violations.push({ file: file.path, line: 1, column: 0, message: 'file name ' + base + ' does not follow the shape this rule proposes (' + ${JSON.stringify(String(expected))} + ') (proposed rule, not yet reviewed)' });
  }
  return violations;
}
`;
    }
    case 'lex': {
      // the lexical layer: an exact, content-only reading of the same two surfaces grain measures
      if (argument === 'indent') {
        const m = /^space(\d+)$/.exec(String(expected));
        const unit = m ? `' '.repeat(${m[1]})` : "'\\t'";
        return `${PROVENANCE(provenance)}
const UNIT = ${unit};

export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    const lines = file.content.split('\\n');
    for (let i = 0; i < lines.length; i++) {
      const lead = /^[ \\t]*/.exec(lines[i])[0];
      if (!lead || !lines[i].slice(lead.length)) continue;         // blank or unindented — no evidence
      if (${m ? 'lead.includes("\\t")' : '/^ +/.test(lead)'}) {     // under: only a PROVABLY different unit fires
        violations.push({ file: file.path, line: i + 1, column: 0, message: 'this rule proposes ${String(expected)} indentation here (proposed rule, not yet reviewed)' });
        break;
      }
    }
  }
  return violations;
}
`;
      }
      if (argument === 'quote') {
        const wantSingle = String(expected) === 'single';
        return `${PROVENANCE(provenance)}
// under: counts complete, same-line string literals only, and fires only where the OTHER quote clearly dominates.
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    const single = (file.content.match(/'[^'\\n]*'/g) || []).length;
    const double = (file.content.match(/"[^"\\n]*"/g) || []).length;
    if (single + double < 3) continue;
    const wrong = ${wantSingle ? 'double > single' : 'single > double'};
    if (wrong) violations.push({ file: file.path, line: 1, column: 0, message: 'this rule proposes ${String(expected)} quotes here (proposed rule, not yet reviewed)' });
  }
  return violations;
}
`;
      }
      return null;
    }
    default:
      return null;
  }
}

// The classes that render, and — for everything else — the reason it does not, stated in the aspect itself
// rather than approximated into a check that would be wrong.
export const RENDERABLE = new Set(['imp', 'call', 'deco', 'extends', 'returns', 'nameshape', 'filenameshape', 'lex']);

// WHICH DIRECTION AN `errs: under` CHECK MAY RENDER AT ALL — measured, not assumed.
//
// A drill sweep of the first version over the pattern repo: 86 rendered checks, 423 cases, 314 pass, 56 MISS,
// 53 FALSE-ALARM. Every FALSE-ALARM had one shape. A convention like "methods in this ROLE GROUP declare a
// return type of `Promise`" is true of four methods in a file that holds twenty; a check whose subject is the
// FILE then refuses the file for the other sixteen, which the rule never spoke about. Under-firing is the
// permitted error direction for `errs: under`; over-firing is a broken contract.
//
// So a POSITIVE rule ("everything here does X") renders only where the subject of the rule IS the file — an
// import, a file name, a lexical layer, or a name shape the whole partition shares. A NEGATIVE rule ("nothing
// here does X") renders in every class, because it fires only on evidence it can see and never on absence.
const BOOLEAN_CLASS = new Set(['imp', 'call', 'deco', 'extends', 'returns']);
// grain's own `unitOf` domain (engine/core.mjs): a convention's `kind` names the SUBJECT its evidence is about.
// `file` and `module` ARE the unit Yggdrasil's `scope: { per: 'file' }` reviews; every other kind — a method, a
// type/class, a catch or finally block — is a SYMBOL living inside a file, smaller than the unit a rendered
// check is actually judged at. Rendering such a convention as a check is still sound by construction (the
// `errs: under` templates above only fire on evidence they can prove, never on an absence), but the CORPUS label
// this renderer cuts from the export's own sites approximates a symbol-level fact as a file-level one — ticket
// 101 §8.1 traced every remaining FALSE-ALARM in its whole corpus to exactly this gap. `scopeApproximation`
// names it in `provenance.json` (ruling `drill-fa-labelling-is-acceptance-not-defect`) so a real drill's FA
// count is read as a labelling artifact of the corpus, not a defect in the check.
const SYMBOL_LEVEL_KIND = new Set(['method', 'type', 'catch', 'finally', 'case']);
export function renderableDirection(enumerator, expected, kind, ctxType) {
  if (!RENDERABLE.has(enumerator)) return false;
  // A GROUP-SCOPED RULE IS UNRENDERABLE IN BOTH DIRECTIONS. The counsel memo said group-scoped conventions
  // WITHOUT a marker cannot be rendered; drilling says the marker does not save them either. A `content:`
  // predicate selects FILES, and a role group is a set of SCOPES — so "methods in the `reviewer+point` group
  // never return `string`" becomes, at file granularity, "no method in any file mentioning `point` returns
  // `string`", which refuses methods the rule never spoke about. Measured: the last 5 FALSE-ALARMs in the
  // sweep, all on one such rule, with the marker predicate doing its job correctly.
  if (ctxType === 'group' && enumerator !== 'filenameshape' && enumerator !== 'lex') return false;
  if (BOOLEAN_CLASS.has(enumerator)) {
    if (String(expected) === 'false') return true;
    return enumerator === 'imp' && kind === 'file';
  }
  if (enumerator === 'nameshape') return ctxType === 'partition' && (kind === 'type' || kind === 'method');
  return true; // filenameshape and lex: the file itself is the subject either way
}
export const WHY_PROSE = {
  stshape: 'the convention asserts a STATEMENT SHAPE — a subtree, not a name. There is no identifier to match and no way to phrase it as a tree query that holds across languages.',
  has: 'the convention asserts the PRESENCE OR ABSENCE of a syntactic construct. Rendering it would mean asserting the grammar\'s own vocabulary as a rule.',
  modexport: 'the convention asserts a MODULE-LEVEL export style, which every language spells differently.',
  arity: 'the convention asserts a PARAMETER COUNT — a shape, and one whose meaning differs per language.',
  ptype: 'the convention asserts a PARAMETER TYPE, which needs per-language parameter-list field names this template set does not claim to know.',
  ret: 'the convention asserts a RETURN-STATEMENT SHAPE, not a declared type.',
  first1: 'the convention asserts what the FIRST STATEMENT is — a shape.',
  varshape: 'the convention asserts a LOCAL-VARIABLE shape.',
  moddirshape: 'the convention asserts a directory-name shape at module level; it is placement, and placement is what the node cut already encodes.',
  modfileshape: 'the convention asserts a file-name shape at module level; the node cut already encodes it.',
  modsize: 'the convention asserts a module SIZE — a measurement of the repository, not a rule about a file.',
  nameshape: 'the convention asserts a NAME SHAPE over a kind of declaration whose grammar node types this template set cannot name exactly, so a rendered check would refuse declarations the rule never spoke about.',
  filenameshape: 'the convention asserts a FILE-NAME SHAPE that does not compile to an anchored pattern (it contains a character class grain records as "anything else").',
  lex: 'the convention asserts a LEXICAL surface this template set does not read exactly.',
  imp: 'the convention names no import specifier to look for.',
  call: 'the convention names no callee to look for.',
  _scopeMismatch: 'the convention\'s subject is a DECLARATION inside a file, and a deterministic check\'s unit is the FILE. A rule that speaks about some declarations would refuse the file for all the others — measured at 53 false alarms in 423 drill cases before this was closed, and 5 more from the group-scoped case after — and an `errs: under` check may not over-fire. Written as prose so a reviewer that can see which declaration the rule is about judges it instead.',
  _positiveGroup: 'the convention is POSITIVE ("everything here does X") and its subject is a declaration inside the file, not the file itself. A deterministic check whose unit is the file would refuse the file for every OTHER declaration in it — measured at 53 false alarms in 423 drill cases before this was closed — and an `errs: under` check may not over-fire. Written as prose so a reviewer that can see which declaration the rule is about judges it instead.',
};


// ==================================================================================================
// 7.5 Sizing — `sizing.json` (ticket 098 / ecosystem-design-2026-09-05.md §2.4).
//
// Horde's only cutting rule (skills/horde/reference/model.md, "The node"): "a node is cut correctly when its
// charter, its contracts and its code fit one Sonnet context with room to work". `node.mjs map` needs a NUMBER
// to print that ratio against; this is where it comes from. Per proposed node — and per HAND node, when the
// source repository already carries its own `.yggdrasil/` (as this one does on Yggdrasil itself) — four counts:
//
//   - `files`    the node's own file count (deepest-node precedence, same as `buildNodes`'s `ownFiles`)
//   - `bytes`    total file size on disk (`fs.statSync`)
//   - `codelengthLines` total source lines (`fs.readFileSync`, newline count) — named deliberately NOT
//                "codelength" alone: the export's OWN codelength quantity (`bitsPerInstance` on a convention,
//                `engine/core.mjs`'s description-length statistic over scope populations) is a measure of how
//                SURPRISING a value is against its population, not a measure of SIZE, and nothing in the export
//                aggregates it per module or per partition despite the ecosystem-design memo's §2.4 phrasing
//                ("Grain's export already has bytes, scopes and codelength per module and per partition") — that
//                claim does not hold for `bytes` or a size-flavoured "codelength" either; both are computed here,
//                from the files themselves, not read out of any existing export field.
//   - `scopes`   the file's total scope count, summed from `.grain/cache/tree.json` (the same per-file scope
//                array `partitionLattice` above reads) when that cache exists; `null` — not zero — when it does
//                not, so an absent cache is never misread as a repo with no scopes.
//
// WHAT IS DERIVED AND WHAT IS A FACT OF THE MODEL. `files`/`bytes`/`codelengthLines`/`scopes` are ALL derived —
// counted from the files themselves or from grain's own scope cache, nothing tuned, nothing tunable. The ONE
// number here that is not derived at all is `contextBudgetTokens: 200000` — Anthropic's published context
// window for the models this family runs on (claude-api skill), a fact about the tool the ecosystem happens to
// run on, not a Grain measurement and not a Grain constant. `sizing.json` carries it so a consumer (`node.mjs
// map`) can compute a ratio without hardcoding the number itself; this renderer computes no ratio and makes no
// claim about what ratio predicts owner success — that is the bet ecosystem-design-2026-09-05.md §6 names, and
// sizing.json is deliberately just the two numbers a ratio needs, not the ratio's verdict.
// ==================================================================================================

function scopeCountsFromTreeCache(repo) {
  const treePath = join(repo, '.grain', 'cache', 'tree.json');
  if (!existsSync(treePath)) return null;
  let tree;
  try { tree = JSON.parse(readFileSync(treePath, 'utf8')); } catch { return null; }
  const byFile = new Map();
  for (const [k, v] of Object.entries(tree)) {
    const rel = k.slice(k.indexOf('|') + 1);
    const n = (Array.isArray(v) ? v : v.s || []).length;
    byFile.set(rel, (byFile.get(rel) || 0) + n);
  }
  return byFile;
}

export function computeSizing(repo, active, nodes, handGraph, handFiles) {
  const scopesByFile = scopeCountsFromTreeCache(repo);
  const bytesOf = rel => { try { return statSync(join(repo, rel)).size; } catch { return 0; } };
  const linesOf = rel => { try { return readFileSync(join(repo, rel), 'utf8').split('\n').length; } catch { return 0; } };
  const sizeOf = fileSet => {
    let bytes = 0, codelengthLines = 0, scopes = 0, files = 0;
    for (const rel of fileSet) {
      files++;
      bytes += bytesOf(rel);
      codelengthLines += linesOf(rel);
      if (scopesByFile?.has(rel)) scopes += scopesByFile.get(rel);
    }
    return { files, bytes, codelengthLines, scopes: scopesByFile ? scopes : null };
  };
  void active; // the proposed rows are read off `nodes` (post deepest-node-precedence `ownFiles`), not `active`
  const proposedNodes = nodes.filter(n => !n.organizational).map(n => ({ id: n.id, dir: n.dir, ...sizeOf(n.ownFiles) }));
  let handNodes = null;
  if (handGraph) {
    handNodes = handGraph.nodes.filter(n => Array.isArray(n.mapping) && n.mapping.length).map(n => {
      const set = expandMapping(n.mapping, handFiles, { root: repo, pathCache: new Map(), contentCache: new Map(), headCache: new Map() });
      return { id: n.id, ...sizeOf(set) };
    });
  }
  return {
    instrument: 'sizing/1',
    contextBudgetTokens: 200000,
    contextBudgetSource: 'external constant (Anthropic\'s published context window for Sonnet/Opus) — not measured, not tuned, not a Grain number',
    scopesAvailable: !!scopesByFile,
    proposedNodes, handNodes,
  };
}

// ==================================================================================================
// 8. The renderer.
// ==================================================================================================

export async function propose(repo, outDir, opts = {}) {
  const files = gitFiles(repo);
  let exp;
  if (opts.exportPath) exp = JSON.parse(readFileSync(opts.exportPath, 'utf8'));
  else {
    say(opts, 'running grain export ...');
    const out = join(repo, '.grain', 'propose-export.json');
    const args = ['export', '--repo', repo, '--out', out, '--compact', '--no-anchors'];
    if (opts.noHistory) args.push('--no-history');
    execFileSync('node', [BIN, ...args], { encoding: 'utf8', maxBuffer: 1 << 29, timeout: 120 * 60_000, stdio: ['ignore', 'pipe', opts.quiet ? 'ignore' : 'inherit'] });
    exp = JSON.parse(readFileSync(out, 'utf8'));
  }
  const cachePath = join(repo, '.grain', 'cache', 'model.json');
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : null;
  const ctx = { root: repo, pathCache: new Map(), contentCache: new Map(), headCache: new Map(), unknownWhenKeys: new Set(), parsed: new Set(cache?.filesAll || []) };

  say(opts, `${repo}: ${files.length} tracked files · ${(exp.partitions || []).length} partitions · ${(exp.conventions || []).length} conventions`);
  const loc = localities(exp, cache, files);
  const { active, alternatives } = buildTypes(exp, loc, files, ctx);
  // deepest wins, matching Yggdrasil's own child precedence (a child node claiming a file inside a directory
  // its parent globs owns that file)
  const byDepth = [...active].sort((a, b) => (a.dir || '').split('/').length - (b.dir || '').split('/').length);
  const typeOfFile = new Map();
  for (const a of byDepth) for (const f of a.files) typeOfFile.set(f, a.id);
  const rels = buildRelations(exp, typeOfFile, active);
  const nestedRoots = nestedProjectRoots(files);
  const { nodes, cycles: nodeCycles, nodeOfFile } = buildNodes(active, typeOfFile, exp, nestedRoots);
  say(opts, `types: ${active.length} active · ${alternatives.length} finer alternatives · nodes: ${nodes.length} · ${nodeCycles.length} dependency cycles in the proposed node graph (declared, not hidden — the proposal is red until they are broken)`);

  const lat = await partitionLattice(repo, opts);
  const sub = subGate(lat.rows);
  say(opts, `lattice: ${lat.rows.length} rows${lat.reason ? ` (${lat.reason})` : ''} · ${sub.length} in the sub-gate band`);

  const { aspects, skipped } = buildAspects(exp, active, sub, opts);
  say(opts, `aspect drafts: ${aspects.length} (${aspects.filter(a => a.check).length} rendered as check.mjs, ${aspects.filter(a => !a.check).length} prose) · skipped: ${skipped.unrenderableGroupScoped} unrenderable group-scoped, ${skipped.notARule} not a rule`);

  // ---------------- write ----------------
  const ygg = join(outDir, '.yggdrasil');
  rmSync(ygg, { recursive: true, force: true });
  mkdirSync(ygg, { recursive: true });
  const evidence = [];
  const ev = (kind, id, line, extra = {}) => { evidence.push({ kind, id, evidence: line, ...extra }); return line; };

  // yg-config.yaml — require nothing. A proposal that turns every unmapped file into a blocking error on day one
  // is a proposal nobody runs twice; `getting-started` §4 says require-nothing is the brownfield default.
  write(join(ygg, 'yg-config.yaml'), preambleComment() + yamlEmit({
    version: SCHEMA_VERSION,
    coverage: { required: [], excluded: [] },
    auto_approve: false,
    quality: { max_direct_relations: Math.max(10, ...nodes.map(n => n.relations.length)) },
  }));

  // yg-architecture.yaml
  const nodeTypes = {
    project: { '#e': ev('type', 'project', 'organizational root; no `when`, classifies nothing', { level: 'organizational' }), description: 'Top-level grouping — root of the hierarchy. One per repository.', parents: [] },
    // `module` is the organizational grouping the renderer inserts wherever a directory has to exist as a node
    // but owns no files of its own. Such a node is routinely a CHILD of a classifying type's node (a `module`
    // named `src/main` under the node for the `src` type), so every active type is an allowed parent — derived
    // from the cut this run actually made, not chosen. Measured (ticket 101): without this, a staged `yg check`
    // on spring-petclinic reported `parent-type-forbidden` — "Node 'src/main' (type 'module') has parent 'src'
    // of type 'src', which is not an allowed parent type" — a blocking error in the proposal's own graph.
    module: { '#e': ev('type', 'module', 'organizational grouping; no `when`, classifies nothing', { level: 'organizational' }), description: 'Domain grouping — organizes children under shared domain responsibility.', parents: ['project', 'module', ...active.map(a => a.id)] },
  };
  for (const a of active) {
    const targets = uniq([...(rels.uses.get(a.id) || new Map()).keys()]).sort();
    const deny = rels.denies.find(d => d.fromType === a.id);
    const line = `${a.why}; the drafted \`when\` selects ${a.selected.size} of ${files.length} tracked files, ${intersectSize(a.files, a.selected)} of them the ones the evidence names (J=${a.fidelity.toFixed(2)})`;
    const relBlock = {};
    if (targets.length) relBlock.uses = targets;
    if (deny) relBlock.default = 'deny';
    nodeTypes[a.id] = {
      '#e': ev('type', a.id, line, { level: a.source, dir: a.dir, evidenceFiles: a.files.size, selects: a.selected.size, fidelity: +a.fidelity.toFixed(3) }),
      description: `Files under \`${a.dir || 'the repository root'}\` — proposed from ${a.source === 'partition' ? "grain's own partition of the directory tree" : a.source === 'module' ? "grain's refined module graph" : a.source === 'directory' ? 'a grain directory card' : 'the repository layout alone'}.`,
      when: a.when,
      // a nested type's node sits under its ancestors' nodes, and Yggdrasil rejects a parent whose type is not
      // listed here (`parent-type-forbidden`) — so every ancestor type is an allowed parent, by construction
      parents: ['project', 'module', ...active.filter(b => b.dir && a.dir && b.dir !== a.dir && a.dir.startsWith(b.dir + '/')).map(b => b.id)],
      ...(Object.keys(relBlock).length ? { relations: relBlock } : {}),
      // Bare ids, deliberately — no explicit `status:` override at this attach site (channel 3). This block is
      // written before an aspect's OWN final status is known (verification runs later, once check.mjs and its
      // drill corpus are on disk), and an explicit override here would need to track it exactly: any override
      // LOWER than the aspect's own eventual default is `aspect-status-downgrade`, a validator error (`yg
      // schemas read architecture` — "bump up OK, downgrade is validator error"). Found on sight rendering
      // Yggdrasil's own proposal once `promoteEnforceableAspects` started promoting some aspects to `enforced`:
      // the old `{ id, status: 'draft' }` form downgraded every one of them right back down, twelve nodes'
      // worth. Omitting `status:` here lets the cascade rule (effective status = max() across channels 1–6)
      // read the aspect's own default with nothing to disagree with, whatever that default turns out to be.
      ...(a.aspectIds?.length ? { aspects: [...a.aspectIds] } : {}),
    };
    if (targets.length) ev('relations', a.id, `${targets.length} allowed \`uses\` targets, aggregated from ${[...(rels.uses.get(a.id) || new Map()).values()].reduce((x, y) => x + y, 0)} resolved imports out of files of this type`);
    if (deny) ev('deny', a.id, `established negative: \`${deny.from}\` does not reach \`${deny.to}\` (share ${deny.share.toFixed(3)}, ${deny.ne}/${deny.neff} scopes, ${deny.bits.toFixed(1)} bits) AND this type has no resolved outgoing import at all, so the deny contradicts nothing observed`);
  }
  write(join(ygg, 'yg-architecture.yaml'), preambleComment() + yamlEmit({ node_types: nodeTypes }));

  // model/**/yg-node.yaml
  for (const n of nodes) {
    const relEntries = n.relations.map(r => ({ target: r.target, type: 'uses' }));
    const line = n.organizational ? n.why : `${n.why}; maps ${n.files.size} tracked files; ${n.relations.length} outgoing dependencies from ${n.relations.reduce((a, r) => a + r.n, 0)} resolved imports`;
    ev('node', n.id, line, { files: n.files.size, relations: n.relations.length, organizational: !!n.organizational });
    write(join(ygg, 'model', n.id, 'yg-node.yaml'), preambleComment() + yamlEmit({
      '#e': line,
      name: n.id,
      type: n.type,
      description: n.organizational ? `Parent node for \`${n.id}\` — children own the mappings.` : `Proposed node for \`${n.dir}\`.`,
      // A directory mapping wherever the whole directory is live: Yggdrasil's child precedence then hands each
      // file to the deepest node that claims it, and no file is owned twice. Where a nested project (its own
      // `.yggdrasil/`) removes part of the directory the mapping has to be an explicit list — and an explicit
      // list gets NO child precedence, so every descendant node's files are subtracted here by hand. Measured:
      // without that subtraction the pattern repo produced 591 `file-duplicate-mapping` errors from two nodes.
      ...(n.organizational ? {} : { mapping: n.useDir ? [`${n.dir}/`] : [...n.ownFiles].sort() }),
      relations: relEntries,
    }));
  }

  // aspects/<id>/ — yg-aspect.yaml, the rule source (check.mjs or content.md), and a drill corpus.
  //
  // `status` is written TWICE. Every aspect ships `draft` here, first — `yg drill` is not gated by status
  // (`yg knowledge read aspect-status`: "draft dormancy applies to `yg check`/`--approve` only"), so `draft` is
  // the one value guaranteed valid before this renderer knows a check's own verdict. `promoteEnforceableAspects`
  // below rewrites `yg-aspect.yaml` a second time for whatever a REAL drill just confirmed — see the header.
  let drillCases = 0, drillDropped = 0;
  for (const a of aspects) {
    ev('aspect', a.id, a.evidenceLine, { reviewer: a.check ? 'deterministic' : 'llm', origin: a.origin, enumerator: a.enumerator, identifier: a.argument ?? null, expected: a.expected ?? null, host: a.host });
    write(join(ygg, 'aspects', a.id, 'yg-aspect.yaml'), preambleComment() + yamlEmit(aspectYamlDoc(a, 'draft')));
    if (a.check) write(join(ygg, 'aspects', a.id, 'check.mjs'), a.check);
    else write(join(ygg, 'aspects', a.id, 'content.md'), a.content);

    const { kept, dropped } = cutDrills(repo, a, opts.holdout);
    // On-disk case counts, not `a.drills`' full deviating/conforming lists (`cutDrills` caps each side at 5) —
    // `promoteEnforceableAspects` below judges the check by what a real drill can actually see.
    a.drillViolatesWritten = kept.violates.length;
    a.drillSatisfiesWritten = kept.satisfies.length;
    const lines = [];
    for (const side of ['satisfies', 'violates']) {
      for (const c of kept[side]) {
        const label = `${side}-${slug(c.rel.replace(/\.[^./]+$/, ''))}`.slice(0, 90);
        write(join(ygg, 'aspects', a.id, 'drills', label, c.rel), c.content);
        lines.push(`- \`${label}/${c.rel}\` — from \`${c.rel}\`${c.name ? ` (\`${c.name}\`)` : ''}${c.born ? `, first seen ${c.born}` : ''}`);
        drillCases++;
      }
      drillDropped += dropped[side];
    }
    if (lines.length) write(join(ygg, 'aspects', a.id, 'drills', 'CORPUS.md'), [
      `# Drill corpus for \`${a.id}\``, '',
      opts.holdout
        ? `**Hold-out: BY TIME, cut at ${opts.holdout}.** Only sites whose first appearance post-dates that date are here; ${dropped.satisfies + dropped.violates} older sites were dropped. The hold-out is by the export's per-site \`lifecycle.firstSeen\` DATE, not by a cut sha — ticket 097 does the sha version and scores it with \`yg drill\`/\`yg simulate\`.`
        : '**Hold-out: NONE.** These cases are cut from the very sites the rule was mined on, so passing this drill proves only that the rendered check reproduces grain\'s own count — it is NOT evidence the rule generalises. Re-cut with `--holdout <YYYY-MM-DD>`; ticket 097 does the held-out version by cut sha.',
      '', `Provenance: ${a.provenance}`, '', ...lines, '',
      'Layout is Yggdrasil\'s: each source file under a `satisfies-*` / `violates-*` directory is one case;',
      'a `violates-*` case MUST be refused and a `satisfies-*` case MUST pass. Score with:', '',
      '```', `yg drill --aspect ${a.id} --dir .yggdrasil/aspects/${a.id}/drills --corpus grain-proposal`, '```', '',
    ].join('\n'));
  }
  say(opts, `drills: ${drillCases} cases${opts.holdout ? ` (hold-out ${opts.holdout}; ${drillDropped} sites dropped as pre-cut)` : ' (NO hold-out — labelled as such in every CORPUS.md)'}`);

  // Aspect status, earned or not — rulings `prose-aspects-draft-by-default`, `drill-fa-labelling-is-acceptance-
  // not-defect`, `no-catch-rules-stay-draft` (ticket 101/102). Rewrites `yg-aspect.yaml` for whatever a real
  // drill just confirmed, writes every `provenance.json` (deferred until now so it can carry the verdict), and
  // annotates the matching `evidence[]` rows in place. See the header comment for the full rule.
  const verify = promoteEnforceableAspects(aspects, { ygg, outDir, evidence, asOf: exp.asOf, repo, ygBin: opts.ygBin });
  say(opts, verify.haveYg
    ? `verification: ${verify.verified} deterministic aspect(s) drilled against a real Yggdrasil (${verify.ygBin}) — ${aspects.filter(a => a.finalStatus === 'active').length} promoted to \`status: enforced\``
    : 'verification: skipped — no Yggdrasil CLI found (set YG_BIN to a built bin.js, or put `yg` on PATH); every deterministic aspect ships `status: draft`, unverified');

  // sizing.json — files/bytes/scopes/codelength per proposed node, and per HAND node when the source repo
  // already carries its own `.yggdrasil/` (see §7.5 above for what is derived vs. an external constant)
  const hasHandGraph = existsSync(join(repo, '.yggdrasil'));
  const handGraphForSizing = hasHandGraph ? readGraph(repo) : null;
  const sizing = computeSizing(repo, active, nodes, handGraphForSizing, files);
  write(join(outDir, 'sizing.json'), JSON.stringify({ instrument: sizing.instrument, repo, asOf: exp.asOf, ...sizing }, null, 1) + '\n');

  // charter.md — one per proposed node, beside its yg-node.yaml (ticket 100, §7c above). Written here, AFTER
  // sizing.json, so every charter can quote its own node's sizing row instead of recomputing it.
  const sizingByNode = new Map((sizing.proposedNodes || []).map(s => [s.id, s]));
  const cochangeByNode = nodeCochangePairs(exp, nodeOfFile);
  let chartersWritten = 0, charterLines = 0;
  for (const n of nodes) {
    const md = renderNodeCharter(n, { nodes, aspects, sizingByNode, cochangeByNode, asOf: exp.asOf, repo });
    write(join(ygg, 'model', n.id, 'charter.md'), md);
    ev('charter', n.id, `charter.md rendered for \`${n.id}\` — ${n.organizational ? 'organizational node' : `${n.files.size} files`}, ${aspects.filter(a => a.host === n.id).length} hosted aspect drafts, ${(cochangeByNode.get(n.id) || []).length} co-change partners`);
    chartersWritten++; charterLines += md.split('\n').length;
  }
  say(opts, `charters: ${chartersWritten} written, avg ${(charterLines / Math.max(1, chartersWritten)).toFixed(1)} lines`);

  // the documents a human actually reads
  const aspectsByDraftReason = {};
  for (const a of aspects) if (a.draftReason) aspectsByDraftReason[a.draftReason] = (aspectsByDraftReason[a.draftReason] || 0) + 1;
  const counts = {
    types: active.length, alternatives: alternatives.length, nodes: nodes.length,
    aspects: aspects.length, aspectsRenderedAsCheck: aspects.filter(a => a.check).length, aspectsProse: aspects.filter(a => !a.check).length,
    // status split (ticket 102) — `active` is what a plain `yg check` on this proposal enforces; the rest is a
    // candidate for a human decision, split by WHY (`aspectsByDraftReason`, see `promoteEnforceableAspects`).
    aspectsActive: aspects.filter(a => a.finalStatus === 'active').length,
    aspectsDraft: aspects.filter(a => a.finalStatus !== 'active').length,
    aspectsByDraftReason,
    aspectsVerified: verify.verified, aspectsVerifiedAgainst: verify.haveYg ? verify.ygBin : null,
    aspectsSkippedUnrenderableGroupScoped: skipped.unrenderableGroupScoped, aspectsSkippedNotARule: skipped.notARule, proseByClass: skipped.byClass,
    drillCases, drillHoldout: opts.holdout || null, drillDropped, nodeCycles: nodeCycles.length,
    latticeRows: lat.rows.length, subGate: sub.length, denies: rels.denies.length, denyBacklog: rels.backlog.length,
    sizingHandNodes: sizing.handNodes ? sizing.handNodes.length : null,
    charters: chartersWritten, charterAvgLines: chartersWritten ? +(charterLines / chartersWritten).toFixed(1) : null,
  };
  write(join(outDir, 'PROPOSAL.md'), renderProposalMd({ repo, exp, files, active, alternatives, nodes, aspects, rels, sub, lat, counts }));
  write(join(outDir, 'REFACTOR-BACKLOG.md'), renderBacklogMd({ exp, sub, rels, nodeCycles }));
  write(join(outDir, 'alternatives.md'), renderAlternativesMd({ alternatives, active }));
  // proposal.json — the published, versioned interface (ticket 100, "the proposal contract" in docs/reference.md).
  // `schema`/`engine`/`extractor`/`schemaNotes` are ADDED here, alongside the `instrument`/`repo`/`asOf`/`files`/
  // `counts`/`evidence` fields 094/097/098 already read — nothing existing is renamed or removed, so a reader of
  // last wave's proposal.json keeps working unmodified (docs/reference.md, "additive fields only, never a
  // silent shape change").
  write(join(outDir, 'proposal.json'), JSON.stringify({
    schema: 'grain-proposal/1',
    engine: ENGINE_VERSION,
    extractor: EXTR_V,
    instrument: 'propose/1', repo, asOf: exp.asOf, files: files.length, counts,
    schemaNotes: {
      evidence:
        'one row per emitted element (`kind`: `type` | `relations` | `deny` | `node` | `charter` | `aspect`), `id` names the element, `evidence` is the exact prose a human reads on the file itself (a `# evidence:` YAML comment, or the corresponding line in the rendered .md); everything else on the row is `kind`-specific structured detail (e.g. an `aspect` row carries `enumerator`/`identifier`/`expected`/`host`, plus — ticket 102 — `status` (`active` | `draft`) and `draftReason` (`prose-unenforceable-keyless` | `file-scope-approximation-fa` | `no-catch` | `null`) matching the aspect\'s own `provenance.json`). This is the full audit trail: every element this renderer wrote has exactly one row here.',
      counts:
        'summary tallies over the SAME run this proposal.json describes — `aspects` = every drafted aspect (certified-convention + sub-gate-lattice combined), `aspectsRenderedAsCheck`/`aspectsProse` partition it by reviewer kind, `aspectsActive`/`aspectsDraft`/`aspectsByDraftReason` partition it by earned status (ticket 102 — see `provenance.json`\'s own `status`/`draftReason`), `aspectsVerified`/`aspectsVerifiedAgainst` say how many deterministic aspects a real `yg drill` actually judged this run and against which Yggdrasil binary (`null` when `YG_BIN` was not resolvable — every aspect then ships draft, unverified), `charters`/`charterAvgLines` cover the charter.md written per node (§ below).',
      provenance:
        'NOT inlined here — each `.yggdrasil/aspects/<id>/provenance.json` (same field set as ticket 097\'s law-loop.mjs: aspectId, conventionId, origin, enumeratorClass, identifier, expected, partition, share, n, deviating, asOf, cutSha, cutDate, repo, reviewer, note — PLUS, ticket 102, `status`/`draftReason`/`scopeApproximation`, additive fields law-loop.mjs\'s own replay provenance does not carry) is the per-aspect record; this file\'s `evidence` rows are the prose summary, provenance.json is the structured one a machine reads.',
      sizing:
        'NOT inlined here — `sizing.json` alongside this file carries files/bytes/codelength-lines/scopes per proposed (and, where the source repo already carries its own `.yggdrasil/`, per HAND) node; every node\'s `charter.md` quotes its own row under "## Sizing".',
      charter:
        'one `charter.md` per non-organizational AND organizational node, written beside its `yg-node.yaml` under `.yggdrasil/model/<node>/` — Horde\'s `node.mjs show` reads it verbatim. Sections: what lives here, depends on / used by (module edges with counts), certified conventions (share/n/deviating + exemplars), sub-gate candidates, co-change partners, sizing, and the `asOf` sha.',
      familyCandidates:
        'NOT part of this file — `propose.mjs --family-candidates <out.json>` writes a SEPARATE `.family-candidates.json` in the exact shape Yggdrasil\'s `yg advise` (`parseFamilyCandidates`, `advise-nominations.ts`) already accepts; see `buildFamilyCandidates` and docs/reference.md, "The proposal contract".',
    },
    evidence,
  }, null, 1) + '\n');

  return { outDir, active, alternatives, nodes, aspects, rels, sub, lat, evidence, files, exp, counts, nodeCycles, sizing, loc, verify };
}

// ---- aspect drafting ----
//
// Two sources, one shape. A CERTIFIED convention is a claim grain is willing to make; a SUB-GATE row is a claim
// it refuses to make and a maintainer still wants to see. Both are rendered the same way: a deterministic check
// where the enumerator class renders, prose where it does not, and in both cases the provenance (share, n, sites,
// asOf) in the description, `status: draft`, and a drill corpus cut from the sites themselves.
//
// `filebirth` is excluded from drafting entirely. "Types here are new" is a statement about the repository's
// history, not about how a file should be written; making it an aspect would be a category error.
const NOT_A_RULE = new Set(['filebirth']);

export function buildAspects(exp, active, sub, opts = {}) {
  const out = [];
  const skipped = { unrenderableGroupScoped: 0, notARule: 0, prose: 0, byClass: {} };
  const asOf = (exp.asOf || '').slice(0, 8);
  const reviewBy = ((y) => `${y + 1}-01-15`)(new Date(exp.indexedAt || Date.now()).getUTCFullYear());
  const typeForPartition = name => active.find(a => a.dir === name) || active.find(a => a.dir && name.startsWith(a.dir + '/')) || null;
  const partOf = name => (exp.partitions || []).find(p => p.name === name);

  // The scope predicate an aspect is judged over. A partition- or directory-scoped convention scopes by PATH; a
  // group-scoped one needs a `content:` predicate drafted from the group's own marker or name shape (§4 of the
  // renderer above), and a group that offers none is UNRENDERABLE — the count is disclosed, never approximated.
  const scopeFor = (c, host) => {
    if (!host) return null;
    if (c.context?.type === 'group') {
      const g = (partOf(c.partition)?.groups || []).find(x => x.id === c.context.group);
      const cr = g ? contentRegexFor(g) : null;
      if (!cr) return null;
      return { pred: { per: 'file', files: { all_of: [{ path: `${host.dir}/**` }, { content: cr.regex }] } }, why: `scoped by the group's own evidence (${cr.why})` };
    }
    if (c.context?.type === 'directory' && c.context.dir) return { pred: { per: 'file', files: { path: `${c.context.dir}/**` } }, why: `scoped to directory \`${c.context.dir}\`` };
    return { pred: { per: 'file', files: { path: `${host.dir}/**` } }, why: `scoped to partition \`${c.partition}\`` };
  };

  // (i) the certified set
  for (const c of exp.conventions || []) {
    const n = c.established || 0;
    if (n < MIN_CONVENTION_SITES) continue;
    if (NOT_A_RULE.has(c.feature.enumerator)) { skipped.notARule++; continue; }
    const host = typeForPartition(c.partition);
    const scope = scopeFor(c, host);
    if (!scope) { skipped.unrenderableGroupScoped++; continue; }
    const dev = (c.deviatingSites || []).length;
    const adoption = n / Math.max(1, n + dev);
    const ctxLabel = c.context?.type === 'group' ? `role group \`${c.context.label || c.context.group}\`` : c.context?.type === 'directory' ? `directory \`${c.context.dir}\`` : `partition \`${c.partition}\``;
    const provenance = `share ${(c.share ?? 0).toFixed(3)} · n ${n} conforming, ${dev} deviating (adoption ${pct(adoption)}) · ${((c.bitsPerInstance ?? 0)).toFixed(1)} bits/instance · ${ctxLabel} of \`${c.partition}\` · asOf ${asOf}`;
    const evidenceLine = `certified convention: ${provenance}; ${scope.why}; exemplars ${(c.exemplars || []).slice(0, 2).map(e => `${e.rel}:${e.line}`).join(', ') || '(none)'}`;
    const id = `grain/${slug(c.partition)}/${slug(c.context?.type === 'group' ? (c.context.label || c.context.group) : c.context?.type || 'partition')}-${slug(c.feature.enumerator)}${c.feature.argument ? '-' + slug(c.feature.argument).slice(0, 40) : ''}`;
    if (out.some(o => o.id === id)) continue;
    const check = renderableDirection(c.feature.enumerator, c.expected, c.kind, c.context?.type)
      ? renderCheck({ enumerator: c.feature.enumerator, argument: c.feature.argument, expected: c.expected, kind: c.kind, provenance: `${c.statement}\n${provenance}` })
      : null;
    const proseReason = check ? null : (BOOLEAN_CLASS.has(c.feature.enumerator) || c.feature.enumerator === 'nameshape' ? WHY_PROSE._scopeMismatch : (WHY_PROSE[c.feature.enumerator] || `no template renders the \`${c.feature.enumerator}\` class`));
    if (!check) { skipped.prose++; skipped.byClass[c.feature.enumerator] = (skipped.byClass[c.feature.enumerator] || 0) + 1; }
    const profile = c.context?.type === 'group' ? (partOf(c.partition)?.groups || []).find(g => g.id === c.context.group)?.profile : null;
    out.push({
      id, origin: 'certified-convention', host: host?.id || null, evidenceLine, provenance, reviewBy,
      name: c.statement.slice(0, 70), description: `${c.statement}. Proposed by grain from evidence — ${provenance}.`,
      scope: scope.pred, check,
      whyProse: proseReason,
      content: check ? null : contentMd(c, profile, evidenceLine, proseReason),
      drills: { satisfies: (c.conformingSites || []).slice(), violates: (c.deviatingSites || []).slice() },
      enumerator: c.feature.enumerator, argument: c.feature.argument, expected: c.expected, kind: c.kind,
      // structured fields for provenance.json (ticket 100) — parallel to the prose already in `provenance`,
      // never re-derived from it by regex the way a POST-HOC reader of a written proposal has to (097's
      // law-loop.mjs `provenanceFor`, which reads back a file this renderer did not annotate at write time)
      partition: c.partition, share: c.share ?? null, n, deviating: dev,
      exemplars: (c.exemplars || []).slice(0, 3).map(e => ({ rel: e.rel, line: e.line, name: e.name })),
    });
  }

  // (ii) the sub-gate lattice — the house rules that have not finished spreading
  //
  // `SUBGATE_PER_PARTITION` is a READING cap, not a measurement one (§7 of the renderer design): it bounds how
  // many candidates a maintainer is asked to look at, and nothing about what grain measured. A MEASUREMENT run
  // must be able to lift it or it is measuring the cap — so `opts.subGatePerPartition` overrides it, the default
  // is unchanged, and 097 states in its report that it ran with the cap lifted (ruling
  // `instrument-floors-allowed-if-stated-and-measured`).
  const capPer = Number.isFinite(opts.subGatePerPartition) ? opts.subGatePerPartition : SUBGATE_PER_PARTITION;
  const perPart = new Map();
  for (const r of sub) {
    const seen = perPart.get(r.partition) || perPart.set(r.partition, []).get(r.partition);
    if (seen.length >= capPer) continue;
    const fam = /^auto\.([a-z0-9]+):?/.exec(r.pid)?.[1];
    if (!fam || NOT_A_RULE.has(fam)) continue;
    const host = typeForPartition(r.partition);
    if (!host) continue;
    const id = `grain/${slug(r.partition)}/candidate-${slug(r.pid)}`.slice(0, 120);
    if (out.some(o => o.id === id)) continue;
    seen.push(id);
    const statement = `${r.kind}s in \`${r.partition}\`${r.role !== null ? ` (role group r${r.role})` : ''} ${r.exp === 'false' ? 'do not ' : ''}${describePid(r.pid)}`.replace(/\s+/g, ' ');
    const provenance = `share ${r.share.toFixed(3)} · practised in ${r.ne} of ${r.n} ${r.kind}s · ${r.deviants.length} sites do not · ${r.bits.toFixed(1)} bits · BELOW grain's certification bound (${LAMBDA_BOUND}) and above the repository's own two-thirds supermajority · asOf ${asOf}`;
    const evidenceLine = `sub-gate candidate: ${provenance}`;
    const check = renderableDirection(fam, r.exp, r.kind, r.role !== null ? 'group' : 'partition')
      ? renderCheck({ enumerator: fam, argument: identifierOf(r.pid), expected: r.exp, kind: r.kind, provenance: `${statement}\n${provenance}` })
      : null;
    const proseReason2 = check ? null : (BOOLEAN_CLASS.has(fam) || fam === 'nameshape' ? WHY_PROSE._scopeMismatch : (WHY_PROSE[fam] || `no template renders the \`${fam}\` class`));
    if (!check) { skipped.prose++; skipped.byClass[fam] = (skipped.byClass[fam] || 0) + 1; }
    out.push({
      id, origin: 'sub-gate-lattice', host: host.id, evidenceLine, provenance, reviewBy,
      name: statement.slice(0, 70), description: `${statement}. Proposed by grain from evidence — ${provenance}.`,
      scope: { per: 'file', files: { path: `${host.dir}/**` } }, check,
      whyProse: proseReason2,
      content: check ? null : subGateMd(r, statement, evidenceLine, proseReason2),
      drills: { satisfies: [], violates: r.deviants.map(d => ({ rel: d.split('#')[0], name: d.split('#')[1] })) },
      enumerator: fam, argument: identifierOf(r.pid), expected: r.exp, kind: r.kind,
      // sub-gate rows have no CONFORMING exemplar of their own — only `deviants` (sites that do NOT follow the
      // candidate) — so `exemplars` (a "copy this" list, never a "avoid this" one) stays empty here, unlike a
      // certified convention above; the charter renderer reads absence as "not yet a copy-worthy pattern".
      partition: r.partition, share: r.share ?? null, n: r.ne ?? null, deviating: r.deviants.length,
      exemplars: [],
    });
  }

  // attach every draft to the type it came from, so nothing is orphaned in the graph
  for (const a of active) a.aspectIds = out.filter(o => o.host === a.id).map(o => o.id);
  // (opts is read above for the sub-gate reading cap)
  return { aspects: out, skipped };
}

// ==================================================================================================
// 7a. `provenance.json` — one per rendered aspect (ticket 100 / law-loop-yggdrasil.md §1.2).
//
// SAME FIELD SET 097's `law-loop.mjs` `provenanceFor` writes for a candidate it renders from a CUT export, so a
// consumer (a human, or a future measurement) reads one shape whether the aspect came from a live `propose` run
// or from a held-out replay. The two differ only in HOW the fields are obtained: 097 regex-parses them back out
// of a written `provenance` prose string because it loads a proposal a PAST run already wrote to disk; here the
// renderer has the structured numbers on hand at write time (`a.partition`, `a.share`, `a.n`, `a.deviating` —
// added to the aspect object above for exactly this) and writes them directly, never through a regex.
//
// `status`, `draftReason` and `scopeApproximation` (ticket 102) are ADDED here, not shared with law-loop.mjs's
// own `provenanceFor` — they describe something only a LIVE run with a real `.yggdrasil/` tree on disk can know
// (a real `yg drill` result), which a held-out replay never produces. Additive, per the proposal contract's own
// rule (docs/reference.md): a field gained here is not a shape change to an existing one.
export function provenanceFor(a, { asOf, repo }) {
  return {
    aspectId: a.id,
    conventionId: a.id,
    origin: a.origin,
    enumeratorClass: a.enumerator ?? null,
    identifier: a.argument ?? null,
    expected: a.expected ?? null,
    partition: a.partition ?? null,
    share: a.share ?? null,
    n: a.n ?? null,
    deviating: a.deviating ?? null,
    asOf: asOf || null,
    cutSha: asOf || null, // a live `propose` run has no hold-out cut of its own — the cut IS `asOf` (HEAD)
    cutDate: null,
    repo,
    reviewer: a.check ? 'deterministic' : 'llm',
    note: a.check
      ? 'Generated by grain from measured practice at `asOf`; rendered as a deterministic check.mjs.'
      : 'Generated by grain from measured practice at `asOf`; no template renders this class as a deterministic check, so it ships as prose (content.md) for an LLM reviewer.',
    // 'active' | 'draft' — Grain's own vocabulary (see `promoteEnforceableAspects`), not to be confused with the
    // three Yggdrasil-schema values (`draft`/`advisory`/`enforced`) the aspect's own `yg-aspect.yaml` carries;
    // 'active' there is written as `status: enforced`. Absent only if this ran before classification ran at all.
    status: a.finalStatus ?? 'draft',
    // one of 'prose-unenforceable-keyless' | 'file-scope-approximation-fa' | 'no-catch', or null when `status`
    // is 'active' (nothing to explain) or the aspect was never verified this run (no `YG_BIN`, no drill corpus).
    draftReason: a.draftReason ?? null,
    // 'file-from-symbol' when the CONVENTION's own subject (`a.kind`) is a symbol inside a file — a method, a
    // type, a catch/finally block — but Yggdrasil reviews this check per FILE; null for a file/module-level
    // convention, where the unit the check runs at and the unit the convention is ABOUT are the same thing.
    scopeApproximation: a.scopeApproximation ?? null,
  };
}

// The `yg-aspect.yaml` document, shared by the provisional (`draft`, before verification) and final write.
function aspectYamlDoc(a, status) {
  return {
    '#e': a.evidenceLine,
    name: a.name, description: a.description, status,
    ...(a.check ? { errs: 'under' } : {}),
    review_by: a.reviewBy,
    scope: a.scope,
  };
}

// ==================================================================================================
// 7a-continued. Aspect status, earned rather than declared (ticket 102, rulings from 101's integration-stress
// report). Sits right after `provenanceFor` (§7a) rather than claiming its own top-level number — §7b/§7c below
// (the family-candidates adapter, `charter.md`) are ticket 100's, unrenumbered.
//
// `status: draft` is where every aspect starts (§ above). This function is the only place anything leaves it:
//
//   - PROSE (`content.md`) never leaves. Ticket 101 measured its sense rate under a keyless gate at 0% (1305 of
//     1671 proposed aspects on a 17-repo corpus) — a judgment call needs a configured reviewer this renderer
//     cannot assume, so it ships as a candidate for a human decision, always (`prose-unenforceable-keyless`).
//   - A DETERMINISTIC check (`check.mjs`) is judged by a REAL `yg drill` run against the proposal this renderer
//     JUST wrote, in a throwaway staging copy — never against a claim this script computes on its own. `yg
//     drill` needs nothing but a `.yggdrasil/` tree at its cwd (status does not gate it — `yg knowledge read
//     aspect-status`), so the stage is exactly that tree, nothing more.
//     - `FALSE-ALARM > 0` → stays draft, `file-scope-approximation-fa`. Ticket 101 §8.1 traced every remaining
//       FALSE-ALARM in its whole corpus to one shape: the convention's subject is a symbol inside a file (a
//       method, a type), the check's unit is the file, and a drill corpus cut from a SAMPLE of sites mislabels
//       the file. Ruling `drill-fa-labelling-is-acceptance-not-defect`: this is a corpus-labelling artifact, not
//       a defect to chase here, and the fix is to demote, not to relabel — 0 is not a matter of taste, it is the
//       only value at which a keyless CI never blocks on an honest change.
//     - Else, `catches (violates-case refusals) <= 0` → stays draft, `no-catch`. Ruling `no-catch-rules-stay-
//       draft`: a rule nothing can ever be shown to violate does not enforce architecture — it is noise for a
//       future agent session, whatever else is true about it.
//     - Else (0 FALSE-ALARM, >= 1 catch) → `active` (written as `status: enforced` in `yg-aspect.yaml`).
//   - No `YG_BIN`, or a check with no drill corpus at all (nothing to run) → stays draft, unverified, no reason.
//     Exactly what this renderer shipped before ticket 102 — the absence of a verdict is not one of the three
//     named reasons above, because none of them fired; nothing here says the check is bad, only that no drill
//     was run to say either way.
export function promoteEnforceableAspects(aspects, { ygg, outDir, evidence, asOf, repo, ygBin: explicitYgBin }) {
  const yg = resolveYg(explicitYgBin);
  const ygBin = yg.label;
  const haveYg = yg.have;
  const stage = join(outDir, '.grain-verify-stage');
  if (haveYg) {
    rmSync(stage, { recursive: true, force: true });
    mkdirSync(stage, { recursive: true });
    // `yg drill` reads only the aspect's own `check.mjs` and its `drills/{satisfies-*,violates-*}` corpus, both
    // already self-contained copies inside `.yggdrasil/aspects/<id>/` — no repository source tree is needed at
    // all (verified against the real CLI while designing this). A throwaway copy of the tree this renderer just
    // wrote, nothing else, and it is deleted again below whether or not verification ran to completion.
    cpSync(ygg, join(stage, '.yggdrasil'), { recursive: true });
  }

  let verified = 0;
  try {
    for (const a of aspects) {
      a.scopeApproximation = (a.check && a.kind && SYMBOL_LEVEL_KIND.has(a.kind)) ? 'file-from-symbol' : null;
      if (!a.check) { a.finalStatus = 'draft'; a.draftReason = 'prose-unenforceable-keyless'; continue; }
      const violates = a.drillViolatesWritten || 0, satisfies = a.drillSatisfiesWritten || 0;
      if (!haveYg || (!violates && !satisfies)) { a.finalStatus = 'draft'; a.draftReason = null; continue; }
      const r = spawnSync(yg.cmd, [...yg.pre, 'drill', '--aspect', a.id], { cwd: stage, encoding: 'utf8', maxBuffer: 1 << 26 });
      const m = /(\d+) pass\s*·\s*(\d+) MISS\s*·\s*(\d+) FALSE-ALARM/.exec(`${r.stdout || ''}${r.stderr || ''}`);
      if (!m) { a.finalStatus = 'draft'; a.draftReason = null; continue; } // could not verify this run (e.g. a spawn failure) — unverified, not blamed
      verified++;
      const miss = Number(m[2]), falseAlarm = Number(m[3]);
      const catches = violates - miss;
      // The drill's own three numbers, kept on the aspect for whoever renders a report from this run. Nothing
      // on disk reads them (`provenanceFor` names its fields one by one), so a proposal tree is byte-identical
      // with and without this line — ticket 104 needs them to say what an enforced rule actually caught.
      a.drill = { pass: Number(m[1]), miss, falseAlarm, catches, violates, satisfies };
      if (falseAlarm > 0) { a.finalStatus = 'draft'; a.draftReason = 'file-scope-approximation-fa'; }
      else if (catches <= 0) { a.finalStatus = 'draft'; a.draftReason = 'no-catch'; }
      else { a.finalStatus = 'active'; a.draftReason = null; }
    }
  } finally {
    // Always — a thrown drill invocation must not leave a throwaway copy of the whole proposal sitting in the
    // maintainer's out-dir.
    if (haveYg) rmSync(stage, { recursive: true, force: true });
  }

  for (const a of aspects) {
    if (a.finalStatus === 'active') write(join(ygg, 'aspects', a.id, 'yg-aspect.yaml'), preambleComment() + yamlEmit(aspectYamlDoc(a, 'enforced')));
    write(join(ygg, 'aspects', a.id, 'provenance.json'), JSON.stringify(provenanceFor(a, { asOf, repo }), null, 2) + '\n');
    const row = evidence.find(e => e.kind === 'aspect' && e.id === a.id);
    if (row) { row.status = a.finalStatus; row.draftReason = a.draftReason || null; }
  }
  return { haveYg, ygBin, verified };
}

// ==================================================================================================
// 7b. The `.family-candidates.json` adapter (ticket 100) — the seam to `yg advise`'s family-without-law class.
//
// Yggdrasil's OWN offline miner (`scripts/family-without-law.mjs`) clusters files by AST structural feature
// vectors and cuts a fitted predicate for a cluster that shares no rule of its own. Grain never re-implements
// that clustering: it already HOLDS the equivalent evidence in a different shape — a ROLE GROUP is exactly a
// structurally-uniform cluster within a partition (093/094's own vocabulary), and `buildTypes` above already
// drafts a generalising `content:` predicate for one (the `-content` alternative) whenever the group's evidence
// supports it (`viable`, § MIN_WHEN_FIDELITY). "A family without a law" in Grain's own terms is precisely a
// role-group alternative that (a) is `viable`, (b) clears the SAME size floor Yggdrasil's miner uses
// (`FAMILY_MIN_MEMBERS`), and (c) has NOT already become a certified convention of its own — i.e. `exp.conventions`
// holds no group-scoped row for that exact group. (a)+(b) is Grain's tightness/size evidence; (c) is what makes
// it a family WITHOUT a law rather than one that already has one.
export function buildFamilyCandidates(alternatives, exp, opts = {}, extra = {}) {
  const minMembers = Number.isFinite(opts.minMembers) ? opts.minMembers : FAMILY_MIN_MEMBERS;
  // `ts` MUST be a parseable calendar instant — Yggdrasil's `parseFamilyCandidates` runs `Date.parse` on it and
  // rejects the whole file (silently, as stale) otherwise. `exp.asOf` is a git SHA, not a date (grain's OWN
  // schemaNotes documents it as such); `exp.indexedAt` is the ISO instant this export was built, which is what
  // "local analysis since <ts>" means in `yg advise`'s rendered nomination. Bug found + fixed on sight
  // (ruling `fix-bugs-on-sight`): an earlier draft of this adapter used `exp.asOf` here and every family it
  // wrote was silently dropped by the freshness gate.
  const asOf = exp.indexedAt || new Date().toISOString();
  const certifiedGroups = new Set(
    (exp.conventions || [])
      .filter(c => c.context?.type === 'group')
      .map(c => `${c.partition}::${c.context.group}`)
  );
  const langOf = members => {
    const counts = new Map();
    for (const rel of members) {
      const m = /\.([A-Za-z0-9]+)$/.exec(rel);
      const ext = m ? m[1].toLowerCase() : 'unknown';
      counts.set(ext, (counts.get(ext) || 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
  };
  const families = [];
  for (const a of alternatives) {
    if (a.kind !== 'role group' || a.form !== 'content' || !a.viable) continue;
    if (!a.members || a.members.length < minMembers) continue;
    // `certifiedGroups` keys by (partition NAME, group id); `a.of` is the host TYPE id (a slug), not the raw
    // partition name, so match on the group-id half only — a group id is a small per-partition ordinal (`r0`,
    // `r1`, ...), and colliding across two DIFFERENT partitions' groups only ever suppresses a family that
    // would otherwise be offered, never fabricates one that has a law.
    const alreadyLawed = a.groupId != null && [...certifiedGroups].some(k => k.endsWith('::' + a.groupId));
    if (alreadyLawed) continue;
    const contentPred = a.when?.all_of?.find(x => x.content)?.content ?? null;
    const scopePath = a.when?.all_of?.find(x => x.path)?.path ?? null;
    families.push({
      id: `family-grain-${slug(a.groupId || a.id)}`.slice(0, 80),
      language: langOf(a.members),
      members: [...a.members].sort(),
      fittedPredicate: { kind: 'regex', value: contentPred || '' },
      scopeFilesDraft: scopePath ? [scopePath] : [],
      evidence: { clusterSize: a.members.length, tightness: a.fidelity ?? 0 },
      _groupId: a.groupId ?? null,
    });
  }
  // (ii) role groups whose membership IS its whole host type — `buildTypes` above never drafts a `-content`
  // ALTERNATIVE for one of these ("the candidate IS the host — nothing finer on offer", §4), because the
  // finer-cut alternative would classify exactly what the type already does. That is not the same thing as
  // "grain found no such family" — grain found the SAME structural cluster, it just cut it as an active TYPE
  // instead of a sub-type. Measured on Yggdrasil's own `family-planted-mono` fixture (5 structurally-identical
  // `*Repository.ts` files under their own directory): without this branch the adapter emitted ZERO families —
  // the fixture's whole point — because the group coincides exactly with its directory's active type. Every
  // group already covered by (i) above is skipped here (`seenGroupIds`) so a group never emits twice.
  const seenGroupIds = new Set(families.map(f => f._groupId).filter(Boolean));
  const { active = [], groups = [] } = extra;
  for (const g of groups) {
    const gid = g.group?.id;
    if (gid == null || seenGroupIds.has(gid)) continue;
    if (g.files.size < minMembers) continue;
    if ([...certifiedGroups].some(k => k.endsWith('::' + gid))) continue;
    const host = active.find(a => a.dir && jaccard(g.files, a.files) >= 0.9);
    if (!host) continue; // not coincident with any active type — (i) above should have offered it as an alternative instead
    const cr = contentRegexFor(g.group);
    if (!cr) continue;
    seenGroupIds.add(gid);
    families.push({
      id: `family-grain-${slug(gid)}`.slice(0, 80),
      language: langOf([...g.files]),
      members: [...g.files].sort(),
      fittedPredicate: { kind: 'regex', value: cr.regex },
      scopeFilesDraft: [`${host.dir}/**`],
      evidence: { clusterSize: g.files.size, tightness: 1 }, // exact match to the host type — the strongest fit this adapter reports
    });
  }
  for (const f of families) delete f._groupId;
  // PREDICATE FIT (ticket 101). A family handed to `yg advise` is a PAIR — a member list and the fitted
  // predicate that is supposed to describe it — and `yg advise` renders the predicate as the draft scope a
  // maintainer would adopt. A member the predicate does not actually select is therefore a claim the file
  // itself refutes, and the adapter has the file on disk, so it can check rather than assert. Measured before
  // this gate existed: on `family-planted-polyglot` the TS family carried 6 members (the 5 planted repositories
  // plus the `ConfigLoader.ts` decoy the fixture's README says must never join a cluster) and its predicate
  // selected NONE of them. Members that do not select are dropped; a family left under the size floor is
  // dropped whole, because a family below the floor is exactly what `FAMILY_MIN_MEMBERS` says is an anecdote.
  // Nothing is widened here — this gate can only ever remove.
  const fitted = [];
  const dropped = { members: 0, families: 0 };
  for (const f of families) {
    if (!extra.repo || !f.fittedPredicate?.value) { fitted.push(f); continue; }
    let re;
    try { re = new RegExp(f.fittedPredicate.value); } catch { fitted.push(f); continue; }
    const keep = f.members.filter(rel => {
      let text;
      try { text = readFileSync(join(extra.repo, rel), 'utf8'); } catch { return true; } // unreadable ⇒ no evidence against it
      return re.test(text);
    });
    dropped.members += f.members.length - keep.length;
    if (keep.length < minMembers) { dropped.families++; continue; }
    fitted.push({ ...f, members: keep, evidence: { ...f.evidence, clusterSize: keep.length } });
  }
  fitted.sort((x, y) => (x.id < y.id ? -1 : 1));
  return { v: 1, ts: asOf, families: fitted, _fit: dropped };
}

// ==================================================================================================
// 7c. `charter.md` — one per proposed node, beside `yg-node.yaml` (ticket 100, addendum on
// `two-granularities-rules-fine-nodes-ownership-sized`). Horde's `node.mjs show` reads this file VERBATIM from
// `.yggdrasil/model/<node>/charter.md` — no schema of its own, so this is written the way a `where` card reads
// a directory to a human: what lives here, depends on / used by, certified conventions with their evidence,
// exemplars to copy, co-change partners, sizing, and the sha it is all measured as of. Every line carries a
// number or a path; a section with nothing to report says so rather than being omitted, so an owner reading it
// cold knows the difference between "nothing found" and "not measured".
// ==================================================================================================

// Node-level co-change: `exp.cochange` pairs FILES; a node's own partners are the pairs whose two files land in
// two DIFFERENT nodes, aggregated by summing `support` over every such pair — the same aggregation `whereCmd`'s
// directory-level `cochangePartners` does at file granularity, done here at node granularity instead because a
// charter is read by the node's OWNER, who thinks in nodes, not files.
export function nodeCochangePairs(exp, nodeOfFile, top = 5) {
  const agg = new Map();
  const add = (x, y, support) => { const m = agg.get(x) || agg.set(x, new Map()).get(x); m.set(y, (m.get(y) || 0) + support); };
  for (const p of exp.cochange || []) {
    const a = nodeOfFile.get(p.a), b = nodeOfFile.get(p.b);
    if (!a || !b || a === b) continue;
    add(a, b, p.support || 0);
    add(b, a, p.support || 0);
  }
  const out = new Map();
  for (const [id, m] of agg) out.set(id, [...m].sort((x, y) => y[1] - x[1]).slice(0, top).map(([partner, support]) => ({ partner, support })));
  return out;
}

export function renderNodeCharter(n, { nodes, aspects, sizingByNode, cochangeByNode, asOf, repo }) {
  const L = [`# Charter — \`${n.id}\``, '', ...PREAMBLE.map(l => (l ? `> ${l}` : '>')), ''];
  L.push(n.organizational
    ? `Organizational node — no mapping of its own; every file is owned by a child under \`model/${n.id}/\`.`
    : n.why, '');

  if (!n.organizational) {
    L.push('## What lives here', '', `- ${n.files.size} tracked files mapped to \`${n.dir}/\` (${n.ownFiles.size} owned directly; the rest belong to a nested node)`);
    const extCounts = new Map();
    for (const f of n.ownFiles) { const m = /\.([A-Za-z0-9]+)$/.exec(f); const ext = m ? m[1] : '(no extension)'; extCounts.set(ext, (extCounts.get(ext) || 0) + 1); }
    const topExts = [...extCounts].sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (topExts.length) L.push(`- file types: ${topExts.map(([e, c]) => `\`.${e}\` ×${c}`).join(' · ')}`);
    if (n.contains?.length) L.push(`- groups: ${n.contains.map(id => `\`${id}\``).join(' · ')}`);
    L.push('');
  }

  L.push('## Depends on / used by', '');
  const dep = n.relations || [];
  const used = nodes
    .filter(x => x !== n)
    .flatMap(x => (x.relations || []).filter(r => r.target === n.id).map(r => ({ from: x.id, n: r.n })))
    .sort((a, b) => b.n - a.n);
  L.push(`- depends on: ${dep.length ? dep.map(r => `\`${r.target}\` (${r.n} resolved import${r.n === 1 ? '' : 's'})`).join(' · ') : '(no resolved outgoing import)'}`);
  L.push(`- used by: ${used.length ? used.map(r => `\`${r.from}\` (${r.n} resolved import${r.n === 1 ? '' : 's'})`).join(' · ') : '(no resolved incoming import)'}`, '');

  const hosted = aspects.filter(a => a.host === n.id);
  const certified = hosted.filter(a => a.origin === 'certified-convention');
  const subgate = hosted.filter(a => a.origin === 'sub-gate-lattice');
  L.push('## Certified conventions', '');
  if (certified.length) {
    for (const a of certified) {
      const sh = typeof a.share === 'number' ? a.share.toFixed(3) : String(a.share);
      L.push(`- ${a.name} — share ${sh} · n ${a.n} conforming, ${a.deviating} deviating (\`${a.id}\`)`);
      if (a.exemplars?.length) L.push(`  exemplars to copy: ${a.exemplars.map(e => `${e.rel}:${e.line}`).join(', ')}`);
    }
  } else {
    L.push('- (none certified yet at this node)');
  }
  L.push('');
  L.push('## Sub-gate candidates — evidence, not yet law', '');
  if (subgate.length) {
    for (const a of subgate) {
      const sh = typeof a.share === 'number' ? a.share.toFixed(3) : String(a.share);
      L.push(`- ${a.name} — share ${sh} · practised in ${a.n} · ${a.deviating} sites do not (\`${a.id}\`)`);
    }
  } else {
    L.push('- (none below the certification bound worth naming)');
  }
  L.push('');

  L.push('## Co-change partners', '');
  const cc = cochangeByNode.get(n.id) || [];
  L.push(cc.length ? cc.map(c => `- \`${c.partner}\` — ${c.support} shared commit${c.support === 1 ? '' : 's'}`).join('\n') : '- (no other node co-changes with this one above the support floor)', '');

  L.push('## Sizing', '');
  const sz = sizingByNode.get(n.id);
  L.push(sz
    ? `- ${sz.files} files · ${sz.bytes} bytes · ${sz.codelengthLines} lines · ${sz.scopes == null ? 'scopes unavailable (no `.grain/cache/tree.json`)' : `${sz.scopes} scopes`} (see \`sizing.json\`)`
    : '- (no sizing recorded — organizational node, or `sizing.json` was not written)', '');

  L.push('## As of', '', `\`${asOf}\`${repo ? ` — ${repo}` : ''}`, '');
  return L.join('\n');
}

// ---- drills, cut from the export's own sites ----
//
// A drill case is one source FILE under a `satisfies-*` / `violates-*` directory (Yggdrasil's corpus layout).
// The counsel memo's hold-out is BY TIME and non-negotiable for the measurement ticket (097); here it is
// available and LABELLED. `--holdout <YYYY-MM-DD>` keeps only sites whose first appearance post-dates the cut,
// using the per-site `lifecycle.firstSeen` the export already carries. Without it every corpus says, in its own
// CORPUS.md, that the rule and the drill are the same data — which is the honest label, not a footnote.
export function cutDrills(repo, aspect, holdout, cap = 5) {
  const kept = { satisfies: [], violates: [] }, dropped = { satisfies: 0, violates: 0 };
  // A DRILL CASE IS A FILE; A CONVENTION'S SITE IS OFTEN A SCOPE INSIDE ONE. A file holding one conforming
  // method and one deviating method is NOT a `satisfies-` case — the check runs over the whole file and is
  // right to refuse it. Cutting it as `satisfies-` blames the check for the corpus's own mislabelling, and did:
  // 13 of the 13 remaining FALSE-ALARMs on the pattern repo were this, not a defect in any rendered rule.
  // So a file that carries ANY deviating site is a `violates-` case, whatever else it also carries.
  const deviatingFiles = new Set((aspect.drills.violates || []).map(s => s?.rel).filter(Boolean));
  for (const side of ['satisfies', 'violates']) {
    const seen = new Set();
    for (const s of aspect.drills[side] || []) {
      if (!s?.rel || seen.has(s.rel)) continue;
      if (side === 'satisfies' && deviatingFiles.has(s.rel)) continue;
      if (holdout) {
        const born = s.lifecycle?.firstSeen;
        if (!born || born <= holdout) { dropped[side]++; continue; }
      }
      let content;
      try { const st = statSync(join(repo, s.rel)); if (st.size > 200 * 1024) continue; content = readFileSync(join(repo, s.rel), 'utf8'); } catch { continue; }
      seen.add(s.rel);
      kept[side].push({ rel: s.rel, content, name: s.name || null, born: s.lifecycle?.firstSeen || null });
      if (kept[side].length >= cap) break;
    }
  }
  return { kept, dropped };
}


const describePid = pid => {
  const m = /^auto\.([a-z0-9]+):?(.*)$/.exec(pid) || [];
  const [, fam, arg] = m;
  return ({ imp: `import \`${arg}\``, call: `call \`${arg}\``, deco: `carry \`@${arg}\``, extends: `extend \`${arg}\``, has: `contain a \`${arg}\``, returns: `declare a return type of \`${arg}\``, stshape: `use the structure \`${arg}\``, nameshape: `follow the name shape \`${arg}\``, ptype: `take a parameter of type \`${arg}\`` }[fam]) || `have ${pid}`;
};

function contentMd(c, profile, evidenceLine, whyProse) {
  const L = [];
  L.push(...PREAMBLE.map(l => (l ? `> ${l}` : '>')));
  L.push('', `# ${c.statement}`, '', '## The rule', '', c.statement + '.', '', '## Evidence', '', evidenceLine, '',
    '## Why this is prose and not a check', '',
    `Grain renders a deterministic \`check.mjs\` wherever the convention's class has a shape a syntax tree can`,
    `be asked about. This one does not: ${whyProse || 'no template renders this class'}`,
    'A prose rule costs a reviewer call every time it is answered, and it cannot be replayed or drilled for free.',
    'If you can restate it as a rule about a NAME, delete this aspect and write the check instead.', '');
  if (c.exemplars?.length) {
    L.push('## What passing looks like', '');
    L.push(`Follow \`${c.exemplars[0].rel}\` line ${c.exemplars[0].line}${c.exemplars[0].name ? ` (\`${c.exemplars[0].name}\`)` : ''}.`, '');
  }
  if (profile?.skel) {
    L.push('The shared shape every conforming site anti-unifies to (grain\'s superposition template — the parts', `all ${profile.n} members hold in common, ${pct(profile.coverage ?? 0)} coverage):`, '', '```', profile.skel, '```', '');
  }
  if (c.deviatingSites?.length) {
    L.push('## Sites that do not follow it yet', '');
    for (const d of c.deviatingSites.slice(0, 20)) L.push(`- \`${d.rel}\`${d.name && d.name !== d.rel.split('/').pop() ? ` (\`${d.name}\`)` : ''} — ${d.phrase || 'deviates'}`);
    if (c.deviatingSites.length > 20) L.push(`- … and ${c.deviatingSites.length - 20} more`);
    L.push('');
  }
  L.push('## Before promoting this out of `draft`', '', 'Decide whether this is a RULE or merely a HABIT. Grain measured that the code does this; it cannot know', 'whether it should. If it is a habit, delete this aspect. If it is a rule, say WHY it is a rule here —', 'that sentence is the part no miner can write.', '');
  return L.join('\n');
}

function subGateMd(r, statement, evidenceLine, whyProse) {
  const L = [];
  L.push(...PREAMBLE.map(l => (l ? `> ${l}` : '>')));
  L.push('', `# ${statement}`, '', '## The rule', '', statement + '.', '', '## Evidence', '', evidenceLine, '',
    '## Why this is a DRAFT and not a certified convention', '',
    `This row is below grain's own gate. It is practised by ${pct(r.share)} of the population, which clears the`,
    "repository's two-thirds supermajority but not the certification bound — so grain refuses to state it as a",
    'fact. That refusal is right for an agent mid-edit and wrong for you: a rule that most of the code follows',
    'and some of it does not is either a rule with a backlog, or a habit to drop. Only you can say which.', '',
    '## Why this is prose and not a check', '',
    `${whyProse || 'no template renders this class'}`, '');
  if (r.deviants.length) {
    L.push('## The sites that do not follow it', '');
    for (const d of r.deviants.slice(0, 30)) L.push(`- \`${d}\``);
    if (r.deviants.length > 30) L.push(`- … and ${r.deviants.length - 30} more`);
    L.push('');
  }
  return L.join('\n');
}

// ---- the human-readable documents ----
function mdTable(head, rows) {
  if (!rows.length) return '_(none)_\n';
  const w = head.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length)));
  const line = cells => '| ' + cells.map((c, i) => String(c ?? '').padEnd(w[i])).join(' | ') + ' |';
  return [line(head), '|' + w.map(x => '-'.repeat(x + 2)).join('|') + '|', ...rows.map(line)].join('\n') + '\n';
}

function renderProposalMd({ repo, exp, files, active, alternatives, nodes, aspects, rels, sub, lat, counts }) {
  const L = [];
  L.push('# Proposed `.yggdrasil/` graph', '', ...PREAMBLE, '', '---', '',
    `Repository: \`${repo}\` at \`${(exp.asOf || '').slice(0, 8)}\` · ${files.length} tracked files · grain: ${(exp.partitions || []).length} partitions, ${(exp.moduleGraph?.nodes || []).length} modules, ${(exp.conventions || []).length} certified conventions, ${(exp.edges || []).length} resolved imports.`, '',
    `Proposed: **${active.length} node types**, **${nodes.length} nodes**, **${aspects.length} aspect drafts** (${counts.aspectsRenderedAsCheck} rendered as a deterministic \`check.mjs\`, ${counts.aspectsProse} as prose), **${counts.drillCases} drill cases**, **${alternatives.length} finer type alternatives** you choose between (see \`alternatives.md\`), and a refactor backlog (\`REFACTOR-BACKLOG.md\`).`, '',
    '## What this proposal does NOT contain, counted', '',
    mdTable(['left out', 'count', 'why'], [
      ['group-scoped conventions with no marker', counts.aspectsSkippedUnrenderableGroupScoped, 'the rule holds inside a role group, and the group offers no marker, name shape or shared import to turn into a `content:` predicate. There is no honest way to say WHERE the rule applies, so it is disclosed rather than approximated.'],
      ['history facts that are not rules', counts.aspectsSkippedNotARule, '`filebirth` says "the code here is new". That is a fact about the repository, not about how a file should be written.'],
      ['rules about an ABSENCE', 'unknowable', 'a miner of practice leaves no trace of what a repository never does. These must be written by hand.'],
    ]), '',
    `Of the ${aspects.length} drafted, ${counts.aspectsProse} could not be rendered as a check because the convention asserts a SHAPE rather than a name` + (Object.keys(counts.proseByClass || {}).length ? ` — by class: ${Object.entries(counts.proseByClass).sort((a, b) => b[1] - a[1]).map(([k, v]) => `\`${k}\` ${v}`).join(', ')}` : '') + '. Each such aspect says so in its own `content.md`.', '',
    counts.nodeCycles
      ? `**This proposal is RED on \`yg check\`, for one reason:** ${counts.nodeCycles} dependency cycle(s) in the proposed node graph. Yggdrasil cannot express a loop, and the proposal declares every dependency the code contains rather than quietly dropping one. See \`REFACTOR-BACKLOG.md\` §4 — that is the first thing to fix, and it is a finding about the repository, not about the proposal.`
      : 'The proposed node graph is acyclic.', '',
    counts.drillHoldout
      ? `Drills are cut with a TIME HOLD-OUT at ${counts.drillHoldout} (${counts.drillDropped} pre-cut sites dropped), by the export's per-site first-appearance date rather than by a cut sha.`
      : '**Drills carry NO hold-out.** Every case is cut from the sites the rule was mined on, so a passing drill shows only that the rendered check reproduces grain\'s own count. Re-cut with `--holdout <YYYY-MM-DD>`.', '');
  L.push('## Node types', '', mdTable(['type', 'from', 'evidence files', '`when` selects', 'fidelity', 'uses'],
    active.map(a => [`\`${a.id}\``, a.source, a.files.size, a.selected.size, a.fidelity.toFixed(2), (rels.uses.get(a.id) || new Map()).size])));
  L.push('', 'Fidelity is the renderer checking its own work: the Jaccard overlap between the file set the evidence',
    'names and the file set the drafted `when` predicate actually selects when expanded against `git ls-files`.',
    'A type below 1.00 selects files the evidence does not name (usually files grain has no grammar for, which',
    'live in the same directory and are correctly classified anyway).', '');
  L.push('## Aspect drafts', '', mdTable(['origin', 'count', 'rendered as `check.mjs`', 'prose'], [
    ['certified convention', aspects.filter(a => a.origin === 'certified-convention').length, aspects.filter(a => a.origin === 'certified-convention' && a.check).length, aspects.filter(a => a.origin === 'certified-convention' && !a.check).length],
    ['sub-gate lattice', aspects.filter(a => a.origin === 'sub-gate-lattice').length, aspects.filter(a => a.origin === 'sub-gate-lattice' && a.check).length, aspects.filter(a => a.origin === 'sub-gate-lattice' && !a.check).length],
  ]), '',
    'Every rendered check carries `errs: under`: it reports a violation only where the syntax tree PROVES the',
    'negation, and stays silent where the language gives it nothing to read. A rule about a declared return type',
    'fires on a declaration that declares a different one and never on a declaration that declares none. That is',
    'a contract the template keeps, not a label — and `yg drill` on the corpus beside each check is how you hold',
    'it to that contract.', '');
  L.push(`The sub-gate half comes from a per-partition lattice of ${lat.rows.length} cells${lat.reason ? ` — ${lat.reason}` : ''}, of which ${sub.length} sit in the band between the repository's own two-thirds supermajority and grain's certification bound. \`grain explain <file>\` shows the same cells for one file at a time as its \`[obs ]\` rows; this is that surface aggregated per partition, which is what a maintainer needs and what no shipped command prints today.`, '');
  L.push('## Established negatives', '',
    'Grain publishes a pair as an established negative when the ABSENCE of the dependency compresses. That is a',
    'statement about what is PRACTICED. An architecture `deny` is a statement about what is PERMITTED. Where the',
    'code contains an import a `deny` would forbid, the two statements are both true about different things —',
    'class (c), undecidable without a human — and the negative stays a backlog line rather than becoming a rule',
    'that contradicts the code.', '',
    mdTable(['from', 'to', 'share', 'became', 'why'],
      [...rels.denies, ...rels.backlog].map(d => [`\`${d.from}\``, `\`${d.to}\``, d.share.toFixed(3), d.becomes, d.whyNot || 'nothing observed contradicts it'])), '');
  return L.join('\n') + '\n';
}

function renderAlternativesMd({ alternatives, active }) {
  const L = ['# Finer type candidates — your choice, not grain\'s', '', ...PREAMBLE, '', '---', '',
    'Each row is a role group grain found INSIDE one of the proposed types whose members are not simply "the',
    'files of a directory". A hand-written architecture very often splits a directory-shaped type exactly here,',
    'with a `content:` predicate. The predicate below is drafted from the group\'s own evidence and then',
    'EXPANDED against the repository, so the "selects" column is a measured count and not a promise.', '',
    'Nothing here is active. To adopt one: paste its `when` into `yg-architecture.yaml` as a new type, and add',
    'a `not:` for it to the parent type listed in `of`.', ''];
  L.push(mdTable(['candidate', 'of', 'group files', 'selects', 'J', 'viable', 'evidence'],
    alternatives.map(a => [`\`${a.id}\``, `\`${a.of}\``, a.groupFiles, a.selected, a.fidelity.toFixed(2), a.viable ? 'yes' : 'no', a.why])));
  L.push('', '## The drafted predicates', '');
  for (const a of alternatives) L.push(`### \`${a.id}\``, '', '```yaml', yamlEmit({ when: a.when }).trimEnd(), '```', '', a.why, '');
  void active;
  return L.join('\n') + '\n';
}

function renderBacklogMd({ exp, sub, rels, nodeCycles }) {
  const L = ['# Refactor backlog', '', ...PREAMBLE, '', '---', '',
    'This is not part of the graph. It is the list of places where the repository disagrees with itself, ranked',
    'by how much of it already agrees. Every row is a decision: spread the rule, or drop it.', ''];

  const convs = (exp.conventions || []).filter(c => (c.deviatingSites || []).length).map(c => {
    const n = c.established || 0, d = (c.deviatingSites || []).length;
    return { c, n, d, adoption: n / Math.max(1, n + d) };
  }).sort((a, b) => b.d - a.d);
  L.push(`## 1. Certified conventions with sites that do not follow them (${convs.length})`, '',
    mdTable(['adoption', 'conforming', 'deviating', 'partition', 'rule'],
      convs.map(x => [pct(x.adoption), x.n, x.d, `\`${x.c.partition}\``, x.c.statement])), '');
  for (const x of convs.slice(0, 12)) {
    L.push(`### ${x.c.statement}`, '', `${pct(x.adoption)} adoption — ${x.d} sites to change:`, '');
    for (const d of x.c.deviatingSites.slice(0, 25)) L.push(`- \`${d.rel}\`${d.name ? ` — \`${d.name}\`` : ''} (${d.phrase || 'deviates'})`);
    if (x.c.deviatingSites.length > 25) L.push(`- … and ${x.c.deviatingSites.length - 25} more`);
    L.push('');
  }

  L.push(`## 2. Candidate house rules below grain's gate (${sub.length})`, '',
    'Practised by a supermajority but not yet by enough of the code for grain to state it as a fact. This is the',
    'sub-gate lattice — the surface `grain explain` shows one file at a time, aggregated per partition.', '',
    mdTable(['adoption', 'n', 'partition', 'scope', 'candidate rule', 'sites to fix'],
      sub.slice(0, 80).map(r => [pct(r.share), r.n, `\`${r.partition}\``, r.role !== null ? `role r${r.role}` : 'partition', `${r.kind}s ${r.exp === 'false' ? 'never ' : ''}${describePid(r.pid)}`, r.deviants.length])), '');

  const twins = (exp.twins || []).filter(t => t.namedDifferently);
  L.push(`## 3. Structural twins — one shape under two names (${twins.length} of ${(exp.twins || []).length} twin pairs are named differently)`, '',
    mdTable(['similarity', 'a', 'b', 'named differently'],
      twins.slice(0, 40).map(t => [t.sim.toFixed(2), `\`${t.a.part}\` ${t.a.label}`, `\`${t.b.part}\` ${t.b.label}`, (t.namedDifferently || []).join(' vs ')])), '');

  const cyc = exp.moduleGraph?.cycles || [];
  L.push(`## 4. Dependency cycles — ${cyc.length} in grain's module graph, ${nodeCycles.length} in the proposed node graph`, '',
    '**THIS IS WHY THE PROPOSAL IS RED.** Yggdrasil refuses a graph whose node relations form a loop',
    '(`structural-cycle`, a blocking error), and the proposal declares every dependency the code contains. Until',
    'a loop below is broken in the CODE — extract a shared interface, invert a dependency, or merge the nodes —',
    'no honest graph over this repository can be green. Cutting the edge out of the proposal instead was tried',
    'and measured: it turned one error that names the real defect into four that ask for the edge back.', '');
  for (const c of cyc) L.push(`- grain's own module cycle: ${c.map(x => `\`${x}\``).join(' → ')} → …`);
  L.push('', mdTable(['weakest edge in the loop', 'resolved imports', 'the loop'],
    nodeCycles.map(d => [`\`${d.from}\` → \`${d.to}\``, d.n, d.cycle.map(x => `\`${x}\``).join(' → ')])), '');

  L.push('## 5. Established negatives that are NOT proposed as `deny`', '',
    'Grain measured that these pairs do not happen. An architecture `deny` says a pair is NOT PERMITTED — a',
    'different statement. Where the code contains an import that a deny would forbid, the negative stays here as',
    'a question for you rather than becoming a rule that contradicts the code. In the three-class vocabulary of',
    'the reconstruction report this is class (c): undecidable without a human.', '',
    mdTable(['from', 'to', 'share', 'why it is not a deny'], rels.backlog.map(d => [`\`${d.from}\``, `\`${d.to}\``, d.share.toFixed(3), d.whyNot])), '');
  return L.join('\n') + '\n';
}

// ==================================================================================================
// 11. The report — what `grain propose` prints, and what `--json` writes.
//
// ONE builder for both surfaces (ticket 104). The text lines and the JSON document are produced from the same
// pass over the same objects, so a fact cannot appear in one and not the other; `tests/cross-check-propose.
// test.mjs` pins that.
//
// THE DEFAULT REPORT IS QUIET (ruling `propose-default-is-quiet`). On Yggdrasil's own proposal 124 aspects are
// drafted and 10 of them earned enforcement — a report in which 92% of the rows are things nobody should act on
// discourages the adopter and undermines the 8% that is true. So the default carries exactly three things, and
// every line of it carries a number or a path:
//
//   1. THE ARCHITECTURE — node types, nodes, relations, dependency cycles. This is the part that loads.
//   2. WHAT EARNED ENFORCEMENT — aspects a REAL `yg drill` promoted, each with what it checks and the drill's
//      own numbers (caught / false alarms / corpus size) beside the practice it was mined from (share, n).
//   3. THE CANDIDATES — and a candidate is DEFINED, not thresholded: a draft that the same real drill caught at
//      least one violation with. That is the exact bar `no-catch-rules-stay-draft` sets for a rule to be doing
//      anything at all; a draft that meets it and is still not enforced is the one thing a maintainer can act
//      on immediately. It follows that with no drill there are no candidates to rank — which the report says,
//      rather than ranking drafts nobody has judged. No display cap is applied and none is needed: the
//      definition does the cutting (1 candidate on Yggdrasil's own proposal, out of 114 drafts).
//
// Everything else — prose drafts, no-catch drafts, finer type alternatives, the conventions skipped as not a
// rule — is written to disk exactly as before and summarised here in ONE counted line naming the file that
// holds it. `--full` prints it all.
export function proposeReport(r, { outDir, root, full = false } = {}) {
  const rel = p => (root && p.startsWith(root + '/') ? p.slice(root.length + 1) : p);
  const out = rel(outDir);
  const ygg = `${out}/.yggdrasil`;
  const c = r.counts;
  const sha = (r.exp?.asOf || '').slice(0, 7);
  const edges = r.nodes.reduce((a, n) => a + n.relations.length, 0);
  const evidenceOf = a => `${a.share == null ? 'share n/a' : pct(a.share)} of ${a.n ?? 0} site(s), ${a.deviating ?? 0} deviating`;
  const aspectPath = a => `${ygg}/aspects/${a.id}/`;
  const caught = a => (a.drill ? a.drill.catches : 0);
  const byStrength = (a, b) => caught(b) - caught(a) || (b.share ?? 0) - (a.share ?? 0) || (b.n ?? 0) - (a.n ?? 0);

  const enforced = r.aspects.filter(a => a.finalStatus === 'active').sort(byStrength);
  // a candidate: drilled, caught at least one planted violation, still not enforced (see the header)
  const candidates = r.aspects.filter(a => a.finalStatus !== 'active' && caught(a) > 0).sort(byStrength);
  const rest = r.aspects.filter(a => a.finalStatus !== 'active' && caught(a) <= 0);
  // counted over `rest` alone, not over every draft: a candidate above is also a draft, and a summary line that
  // re-counted it would make the report's own numbers add up to more than the aspects that exist
  const restByReason = {};
  for (const a of rest) { const k = a.draftReason || 'unverified'; restByReason[k] = (restByReason[k] || 0) + 1; }

  const aspectJson = a => ({
    id: a.id, statement: a.name, status: a.finalStatus === 'active' ? 'enforced' : 'draft',
    draftReason: a.draftReason || null, reviewer: a.check ? 'deterministic' : 'llm',
    share: a.share ?? null, n: a.n ?? null, deviating: a.deviating ?? null, node: a.host || null,
    drill: a.drill ? { caught: a.drill.catches, planted: a.drill.violates, falseAlarms: a.drill.falseAlarm } : null,
    path: aspectPath(a),
  });

  const json = {
    schema: 'grain-propose/1',
    outDir: out, repo: root || null, asOf: r.exp?.asOf || null, files: r.files.length,
    architecture: { nodeTypes: c.types, nodes: c.nodes, relations: edges, cycles: c.nodeCycles, path: `${ygg}/yg-architecture.yaml` },
    yggdrasil: { found: !!r.verify?.haveYg, cli: r.verify?.haveYg ? r.verify.ygBin : null, drilled: r.verify?.verified || 0 },
    aspects: { total: c.aspects, enforced: enforced.length, candidates: candidates.length, rest: rest.length, restByDraftReason: restByReason },
    enforced: enforced.map(aspectJson),
    candidates: candidates.map(aspectJson),
    alternatives: c.alternatives,
    skippedNotARule: c.aspectsSkippedNotARule,
    skippedUnrenderableGroupScoped: c.aspectsSkippedUnrenderableGroupScoped,
    paths: { proposal: `${out}/PROPOSAL.md`, evidence: `${out}/proposal.json`, backlog: `${out}/REFACTOR-BACKLOG.md`, alternatives: `${out}/alternatives.md`, sizing: `${out}/sizing.json`, graph: `${ygg}/` },
    ...(full ? { restAspects: rest.map(aspectJson) } : {}),
  };

  const L = [];
  L.push(`proposed a graph for ${r.files.length} tracked files, as of ${sha} — ${ygg}/`);
  L.push(`architecture: ${c.types} node types · ${c.nodes} nodes · ${edges} relations · ${c.nodeCycles} dependency cycle(s) — ${ygg}/yg-architecture.yaml`);
  if (!r.verify?.haveYg) {
    L.push(`enforced: 0 of ${c.aspects} aspects — no Yggdrasil CLI was found, so no rule was drilled and NOTHING here is enforced (set YG_BIN to a built bin.js, or put \`yg\` on PATH, then run this again)`);
    L.push(`candidates: 0 of ${c.aspects} — a candidate is a draft a real drill caught a violation with, and no drill ran`);
  } else {
    L.push(`enforced: ${enforced.length} of ${c.aspects} aspects earned \`status: enforced\` from a real drill of ${r.verify.verified} deterministic check(s) — ${r.verify.ygBin}`);
    for (const a of enforced) {
      L.push(`  ${a.id} — ${a.name}`);
      L.push(`    caught ${a.drill.catches} of ${a.drill.violates} planted violation(s) · ${a.drill.falseAlarm} false alarm(s) · practised in ${evidenceOf(a)} — ${aspectPath(a)}`);
    }
    L.push(`candidates: ${candidates.length} of ${c.aspects} — drafts a real drill caught a violation with, strongest evidence first`);
    for (const a of candidates) {
      L.push(`  ${a.id} — ${a.name}`);
      L.push(`    caught ${a.drill.catches} of ${a.drill.violates} · ${a.drill.falseAlarm} false alarm(s) · ${evidenceOf(a)} · held as draft: ${a.draftReason || 'unverified'} — ${aspectPath(a)}`);
    }
  }
  const byReason = Object.entries(restByReason).sort().map(([k, v]) => `${v} ${k}`).join(', ') || 'none';
  L.push(`on disk, not above: ${rest.length} more draft(s) (${byReason}) · ${c.alternatives} finer type alternative(s) · ${c.aspectsSkippedNotARule} convention(s) skipped as not a rule — ${out}/PROPOSAL.md`);
  if (full) {
    L.push(`== the remaining ${rest.length} draft(s), by why each is one ==`);
    for (const reason of [...new Set(rest.map(a => a.draftReason || 'unverified'))].sort()) {
      const group = rest.filter(a => (a.draftReason || 'unverified') === reason);
      L.push(`  ${reason}: ${group.length}`);
      for (const a of group) L.push(`    ${a.id} — ${a.name} · ${evidenceOf(a)} — ${aspectPath(a)}`);
    }
    L.push(`== ${c.alternatives} finer type alternative(s), not cut as types — ${out}/alternatives.md ==`);
    for (const alt of r.alternatives) L.push(`  ${alt.id} — ${alt.why}`);
  }
  L.push(`next: read ${out}/PROPOSAL.md (per-element evidence: ${out}/proposal.json), then move ${ygg}/ to the repository root as .yggdrasil/ and run \`yg check\``);
  return { lines: L, json };
}
