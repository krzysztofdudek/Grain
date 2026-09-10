// grain engine · proposal writer · the admission constants, the Yggdrasil CLI resolution, the file walk and the YAML emitter
// Split out of propose.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARD_EXCL } from './config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const BIN = resolve(here, '..', 'bin', 'grain.mjs');
export const CORE = resolve(here, 'core.mjs');

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
export const SCHEMA_VERSION = '6.0.0'; // CLI_SUPPORTED_SCHEMA in Yggdrasil's core/graph-loader.ts
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
export const GROUP_MIN = 2;

// ==================================================================================================
// 1. Small helpers.
// ==================================================================================================
export const say = (opts, m) => { if (!opts.quiet) process.stderr.write(`[propose] ${m}\n`); };
export const uniq = a => [...new Set(a)];
export const pct = x => `${(x * 100).toFixed(0)}%`;
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
const WALK_SKIP = new Set(['.git', '.grain', '.yggdrasil', '.yggdrasil-proposal', 'node_modules']);
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
export function gitFiles(repo) {
  // THE FALLBACK IS A DEGRADATION, SO IT HAS TO SAY IT HAPPENED. Two very different things used to arrive at
  // the same silent `walkWorktree`: a directory with no git at all (the documented, expected case — `grain
  // export` handles it too and stamps its answer `no-git`), and a repository where git IS there and the call
  // FAILED — a corrupt index, a permission the process does not have, an `ls-files` output past `maxBuffer`
  // on a very large repository. The second one silently mines a WEAKER file set: with no git there is no
  // `.gitignore` resolution, so build output a git repo would have hidden is proposed on as if it were source.
  // The reason is returned and disclosed; the answer is still produced, because a degraded proposal an adopter
  // can see the caveat on beats a crash.
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
      // The path is taken VERBATIM. `-z` output is never quoted and git stores `/` as the separator on every
      // platform, Windows included, so there is no separator here to normalise — and a `\` in the record is a
      // filename character, legal on POSIX. Folding it to `/` could only corrupt such a path, and did:
      // `src/we\ird.ts` became `src/we/ird.ts`, a file mapped into a directory that does not exist, sized at
      // zero bytes because nothing on disk answers to it, and named by a node mapping `yg check` cannot resolve.
      // GRAIN'S OWN STATE IS NOT THE REPOSITORY'S CODE, EVEN WHEN IT IS TRACKED. `grain export` has always
      // filtered it (`HARD_EXCL`), and this list — which decides which files become types, nodes, mappings and
      // the uncovered remainder — did not, so the filter held for what grain MINED and not for what it
      // PROPOSED. Invisible until a repository commits `.grain/`, which grain's own `.grain/.gitignore` tells
      // it to ("everything else in .grain/ is meant to be committed"): measured, `.grain` then arrives as a
      // node type of the adopter's architecture. Same filter, same reason, in both places.
      if (HARD_EXCL.test(m[2])) continue;
      files.push(m[2]);
    }
    return { files, degraded: null };
  } catch (e) {
    return {
      files: walkWorktree(repo).sort(),
      degraded: existsSync(join(repo, '.git'))
        ? `\`git ls-files\` failed in a repository that HAS git (${String(e.message || e).split('\n')[0].slice(0, 200)}), so the file set below comes from walking the worktree instead: build output and anything else \`.gitignore\` would have hidden is in it`
        : null,
    };
  }
}
// THE BRANCH A CHANGE IS MEASURED AGAINST (ticket 118).
//
// Ticket 109 measured what an earned `enforced` actually costs on delivery: all 21 enforced rules across the
// 17-repo corpus block between 1 and 18 EXISTING files at the first `yg check`. The drill that earned the
// status proves the CHECK correct; neither it nor ruling `enforced-requires-certified-origin` asks whether the
// repository is green today. Yggdrasil's answer is progressive mode — `progressive: { reference: <ref> }` in
// `yg-config.yaml` (`yg schemas read config`): with it set, a plain `yg check` blocks only on what the current
// change reaches, everything inherited from that ref is listed and counted as a non-blocking warning, and
// `yg check --full` blocks on all of it again. Status is NOT lowered by it — the rule stays enforced and blocks
// the moment a change reaches it — which is exactly what the ruling requires.
//
// The reference is DERIVED from the repository, never guessed, and in the order an adopter's own CI resolves it:
//
//   1. `origin/HEAD` — the default branch of the remote this repository was cloned from. This is what a pull
//      request is opened against, so it is what a change is accountable against.
//   2. failing that, the branch HEAD is on, as the remote has it (`origin/<branch>`) if that ref exists locally,
//      and otherwise the local branch name — a repository with no remote at all still has something to compare
//      against, and Yggdrasil resolves a plain branch name the same way.
//   3. failing both (a detached HEAD with no `origin/HEAD`, or no git at all) — NOTHING. The block is left out
//      and the report prints the one-line instruction instead. A `progressive` block that names no reference is
//      a hard `config-progressive-missing-reference` error, and a reference naming a ref that does not exist
//      makes every run answer for the whole project while the config reads as though it did not: both are worse
//      than saying plainly that this repository gave the renderer nothing to derive.
export function progressiveReference(repo) {
  const git = (...args) => {
    try { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
  };
  const head = git('symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD');
  if (head.startsWith('refs/remotes/')) {
    const ref = head.slice('refs/remotes/'.length);
    return { reference: ref, why: `\`${ref}\` is the default branch of the remote this repository was cloned from, so it is what a change here is opened against` };
  }
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch && branch !== 'HEAD') {
    if (git('rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`)) {
      return { reference: `origin/${branch}`, why: `this repository names no default branch, so the reference is the branch it is on (\`${branch}\`) as the remote has it` };
    }
    return { reference: branch, why: `this repository has no remote, so the reference is the branch it is on (\`${branch}\`)` };
  }
  return { reference: null, why: 'this repository names no default branch (no `origin/HEAD`) and its HEAD is not on a branch, so there is no ref here to measure a change against' };
}
// Repo-relative directory prefix -> the tracked files beneath it.
export const underDir = (files, dir) => new Set(files.filter(f => f === dir || f.startsWith(dir + '/')));
// The deepest directory every one of these paths lies under, or null when they share none (a file at the
// repository root leaves nothing to share). Whole path SEGMENTS only: `src/apple` and `src/apricot` share
// `src`, never `src/ap`.
export const commonDir = paths => {
  if (!paths.length) return null;
  let pre = paths[0].split('/').slice(0, -1);
  for (const p of paths.slice(1)) {
    const q = p.split('/').slice(0, -1);
    let i = 0;
    while (i < pre.length && i < q.length && pre[i] === q[i]) i++;
    pre = pre.slice(0, i);
    if (!pre.length) return null;
  }
  return pre.length ? pre.join('/') : null;
};
// A YAML-safe id: lowercase, path separators and dots folded to dashes, collapsed.
export function slug(s) {
  const t = String(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return t || 'x';
}
// ---- a minimal YAML emitter (block style only; the shapes this renderer writes and nothing else) ----
const NEEDS_QUOTE = /^(\s|$)|[:#\-?*&!|>'"%@`{}[\],]|\s$|^(true|false|null|yes|no|on|off|~)$|^-?\d/i;
// YAML's printable set (1.2 §5.1) admits tab, line feed and carriage return and NOTHING else below U+0020, and
// excludes DEL, the C1 range and unpaired surrogates. A repository path may hold any of them, and emitted bare
// they are not YAML: a conforming parser rejects the WHOLE document, not just the scalar — measured, a path
// containing U+0001 makes `yg-architecture.yaml` unreadable end to end. Such a scalar is therefore always
// quoted — and, below, escaped, since the double-quoted form admits these characters only as `\uXXXX`.
const NOT_PRINTABLE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
// QUOTING ALONE IS NOT ENOUGH. `JSON.stringify` escapes U+0000-U+001F and unpaired surrogates but leaves DEL
// and the C1 range raw, and a conforming parser rejects those inside double quotes exactly as it does outside
// them — measured. Everything the plain form may not carry is therefore escaped as `\uXXXX`, which YAML's
// double-quoted form admits for every one of them.
const NOT_PRINTABLE_G = new RegExp(NOT_PRINTABLE.source, 'g');
const escapeNonPrintable = json => json.replace(/[\u007f-\u009f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
export function yq(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (!s.length || NEEDS_QUOTE.test(s) || s.includes('\n') || NOT_PRINTABLE.test(s)) return escapeNonPrintable(JSON.stringify(s));
  return s;
}
// A COMMENT VALUE IS THE REPOSITORY'S OWN PROSE, AND A REPOSITORY PATH MAY CONTAIN A LINE BREAK. Every emitted
// element carries its evidence as a `#` comment naming the directories, identifiers and shares behind it.
// Written as a single `# <text>` line, everything after a line break in that text LEFT the comment and landed
// in the document as YAML: a directory named `ev<LF>injected: true` put a real `injected: true` key inside its
// own node type in `yg-architecture.yaml` — confirmed both by this repository's own parser and by a conforming
// one. Each line of the value now gets its own `#`, so a comment stays a comment however the value is spelled.
// A COMMENT CANNOT ESCAPE ANYTHING — it is literal to the end of the line — so the characters YAML does not
// admit at all (see NOT_PRINTABLE above) are replaced by U+FFFD here rather than escaped. One of them raw in a
// comment is rejected by a conforming parser exactly as one in a scalar is, and takes the whole document with
// it; the replacement character is the honest rendering of 'a character that cannot be written here'.
const yamlComment = (v, pad) => String(v).split(/\r\n|\r|\n/).map(l => `${pad}# ${l.replace(NOT_PRINTABLE_G, '\ufffd')}\n`).join('');
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
      if (k.startsWith('#')) { out += yamlComment(v, pad); continue; } // comment pseudo-key
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
export const write = (p, text) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); };

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
export const preambleComment = () => PREAMBLE.map(l => (l ? `# ${l}` : '#')).join('\n') + '\n\n';

// ==================================================================================================
// 3. Candidate localities: the three levels a type can be cut at.
//
// 093 §2 measured which level actually matches a hand-written node type. Partitions match where the partition is
// a directory; role groups and directory cards hold seven more type-shaped sets that nothing surfaced. All three
// levels are generated here, and section 4 decides which are ACTIVE and which are ALTERNATIVES.
// ==================================================================================================
