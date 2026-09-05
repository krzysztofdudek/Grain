// §111 — `grain propose` as PRODUCT code: the failures an instrument may carry and a shipped command may not.
//
// Ticket 104 moved the proposal renderer out of `tests/stress/` and made it a command an adopter runs on a
// repository nobody in this project has seen. Everything below is a defect that review found in that code and
// that a real repository can reach; each test fails against the code as ticket 104 shipped it.
//
//   1. THE OUT-DIR GUARD IS LEXICAL, AND A SYMLINK WALKS PAST IT. `cmdPropose` refuses to write a proposal
//      over the repository or its own `.yggdrasil/` — "writing it over a live graph destroys the graph already
//      there" — by comparing `resolve()`d strings. `resolve()` normalises `.`/`..` and never reads the
//      filesystem, so an out-dir that is a SYMLINK to the repository root compares unequal, passes the guard,
//      and the renderer's `rmSync(<out-dir>/.yggdrasil)` then deletes the hand-written graph the guard exists
//      to protect. Measured before the fix: a repository's `.yggdrasil/yg-architecture.yaml` and every node
//      under it, gone, exit code 0, no warning.
//   2. `git ls-files -z` IS NOT QUOTED, SO A BACKSLASH IS A FILENAME CHARACTER. The reader folded every `\`
//      in a path to `/`. Git stores `/` as the separator on every platform and `-z` emits paths raw, so the
//      fold could never fix a real separator — it could only corrupt a legal POSIX path. `src/we\ird.ts`
//      became `src/we/ird.ts`: a file mapped into a directory that does not exist, sized at zero bytes, and a
//      node mapping naming a path `yg check` cannot resolve.
//   3. A NEWLINE IN A REPOSITORY PATH INJECTS YAML. Every emitted element carries its evidence as a `#`
//      comment, written by `yamlEmit`'s comment pseudo-key as a single `# <text>` line. A repository directory
//      may contain a newline; the evidence text quotes the directory verbatim; everything after the newline
//      then leaves the comment and lands in the document as YAML. Measured: a directory named `ev\ninjected:
//      true` put a real `injected: true` key inside its own node type in `yg-architecture.yaml`.
//   4. `yq` PASSES A CONTROL CHARACTER THROUGH AS A PLAIN SCALAR. YAML's printable set excludes the C0
//      controls other than tab, newline and carriage return, and excludes lone surrogates. A repository path
//      may contain any of them. Emitted unquoted they are not YAML at all.
//
// The staged `yg check` assertions need a built Yggdrasil CLI and skip without one; every other assertion
// here runs unconditionally.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { yq, yamlEmit, promoteEnforceableAspects, proposeReport, DRILL_TIMEOUT_MS, SLOWEST_OBSERVED_DRILL_MS } from '../engine/propose.mjs';
import { parseYaml } from '../engine/yggdrasil-graph.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const NL = String.fromCharCode(10);
const NOT_PRINTABLE_RE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

const gitEnv = {
  GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
  GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z', TZ: 'UTC',
};
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (root, rel, content) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const commit = root => { gitIn(root, 'init', '-q', '-b', 'main'); gitIn(root, 'config', 'commit.gpgsign', 'false'); gitIn(root, 'add', '-A'); gitIn(root, 'commit', '-q', '-m', 'fixture'); };
const grainIn = (dir, args) => {
  const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, ...gitEnv } });
  return { out: r.stdout || '', err: r.stderr || '', code: r.status };
};

// ---------- 1. the out-dir guard has to survive a symlink ----------
test('an out-dir that is a symlink to the repository does not get past the refuse-to-overwrite guard, and the live `.yggdrasil/` survives', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'propose-symlink-'));
  try {
    const repo = join(tmp, 'repo');
    w(repo, 'src/a.ts', 'export const a = 1;' + NL);
    w(repo, 'src/b.ts', 'export const b = 2;' + NL);
    w(repo, '.yggdrasil/yg-architecture.yaml', 'node_types:' + NL + '  hand: {}' + NL);
    w(repo, '.yggdrasil/model/keep/yg-node.yaml', 'name: keep' + NL);
    commit(repo);
    symlinkSync(repo, join(tmp, 'link'));

    const r = grainIn(repo, ['propose', join(tmp, 'link')]);
    assert.notEqual(r.code, 0, `expected a refusal, got exit ${r.code}:${NL}${r.out}${r.err}`);
    assert.match(r.out + r.err, /refusing to write a proposal into/);
    // the point of the guard: the hand-written graph is still there, byte for byte
    assert.equal(readFileSync(join(repo, '.yggdrasil', 'yg-architecture.yaml'), 'utf8'), 'node_types:' + NL + '  hand: {}' + NL);
    assert.ok(existsSync(join(repo, '.yggdrasil', 'model', 'keep', 'yg-node.yaml')), 'the hand-written node was deleted');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('a symlinked out-dir pointing INTO the repository\'s own .yggdrasil/ is refused too', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'propose-symlink2-'));
  try {
    const repo = join(tmp, 'repo');
    w(repo, 'src/a.ts', 'export const a = 1;' + NL);
    w(repo, 'src/b.ts', 'export const b = 2;' + NL);
    w(repo, '.yggdrasil/model/keep/yg-node.yaml', 'name: keep' + NL);
    commit(repo);
    symlinkSync(join(repo, '.yggdrasil'), join(tmp, 'inner'));
    const r = grainIn(repo, ['propose', join(tmp, 'inner', 'sub')]);
    assert.notEqual(r.code, 0, `expected a refusal, got exit ${r.code}:${NL}${r.out}${r.err}`);
    assert.match(r.out + r.err, /refusing to write a proposal into/);
    assert.ok(existsSync(join(repo, '.yggdrasil', 'model', 'keep', 'yg-node.yaml')));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('a legitimate out-dir reached through a symlinked parent still works', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'propose-symlink3-'));
  try {
    const repo = join(tmp, 'repo'), real = join(tmp, 'staging');
    w(repo, 'src/a.ts', 'export const a = 1;' + NL);
    w(repo, 'src/b.ts', 'export const b = 2;' + NL);
    commit(repo);
    mkdirSync(real, { recursive: true });
    symlinkSync(real, join(tmp, 'via'));
    const r = grainIn(repo, ['propose', join(tmp, 'via', 'out')]);
    assert.equal(r.code, 0, `${r.out}${r.err}`);
    assert.ok(existsSync(join(real, 'out', '.yggdrasil', 'yg-architecture.yaml')));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

// ---------- 2. a backslash is a filename character, not a separator ----------
test('a tracked path containing a backslash keeps it: the file is mapped where it actually lives', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'propose-backslash-'));
  try {
    const repo = join(tmp, 'repo');
    const odd = 'src/we\\ird.ts';
    w(repo, odd, 'export const weird = 1;' + NL);
    w(repo, 'src/plain.ts', 'export const plain = 2;' + NL);
    commit(repo);
    // git itself has to agree the path is what we wrote, or the test is measuring git and not grain
    const listed = gitIn(repo, 'ls-files', '-z').split('\0').filter(Boolean);
    assert.ok(listed.includes(odd), `git does not track ${JSON.stringify(odd)} on this platform: ${JSON.stringify(listed)}`);

    const r = grainIn(repo, ['propose', join(tmp, 'out')]);
    assert.equal(r.code, 0, `${r.out}${r.err}`);
    const sidecar = JSON.parse(readFileSync(join(tmp, 'out', 'proposal.json'), 'utf8'));
    assert.equal(sidecar.files, 2, 'both tracked files are counted');
    // The mangled path `src/we/ird.ts` does not exist on disk, so `computeSizing`'s statSync/readFileSync both
    // fail and the file is silently sized at zero — the node claims two files and the bytes of one. Summing
    // the sizing rows against what is actually on disk is the assertion that catches it.
    const onDisk = [odd, 'src/plain.ts'].reduce((a, rel) => a + readFileSync(join(repo, rel)).length, 0);
    const sizing = JSON.parse(readFileSync(join(tmp, 'out', 'sizing.json'), 'utf8'));
    const total = sizing.proposedNodes.reduce((a, n) => a + n.bytes, 0);
    assert.equal(total, onDisk, `sizing accounts for ${total} bytes of the ${onDisk} actually on disk — a tracked path did not resolve`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

// ---------- 3. the evidence comment may not carry a newline out of its comment ----------
test('yamlEmit keeps a multi-line comment value inside the comment, and the document parses back to the keys it declared', () => {
  const hostile = 'evidence for a dir' + NL + 'injected: true' + NL + 'status: enforced';
  const text = yamlEmit({ '#e': hostile, name: 'real', status: 'draft' });
  const doc = parseYaml(text);
  assert.deepEqual(Object.keys(doc).sort(), ['name', 'status'], `the comment leaked keys into the document:${NL}${text}`);
  assert.equal(doc.status, 'draft');
  // every line of the comment is still a comment
  for (const line of text.split(NL)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    assert.match(line, /^\s*(name|status):/, `a comment line escaped into the document: ${JSON.stringify(line)}`);
  }
});

test('a repository directory whose name contains a newline cannot inject a key into the proposed architecture', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'propose-newline-'));
  try {
    const repo = join(tmp, 'repo');
    const dir = 'ev' + NL + 'injected: true';
    for (const n of ['a', 'b', 'c', 'd']) w(repo, `${dir}/${n}.ts`, `export function f${n}(v: string): string { return v; }` + NL);
    w(repo, 'other/z.ts', 'export const z = 1;' + NL);
    commit(repo);
    const r = grainIn(repo, ['propose', join(tmp, 'out')]);
    assert.equal(r.code, 0, `${r.out}${r.err}`);
    const arch = readFileSync(join(tmp, 'out', '.yggdrasil', 'yg-architecture.yaml'), 'utf8');
    const doc = parseYaml(arch);
    for (const [id, t] of Object.entries(doc.node_types || {})) {
      assert.ok(!Object.prototype.hasOwnProperty.call(t || {}, 'injected'), `node type \`${id}\` carries an injected key`);
    }
    // and no line of any emitted YAML is a bare `injected: true`
    assert.doesNotMatch(arch, /^\s*injected:/m, `the architecture carries an injected key:${NL}${arch.slice(0, 2000)}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

// ---------- 4. hostile identifiers through the emitter, reloaded ----------
//
// A fuzz-shaped sweep rather than a list of cases: every scalar below is something a repository can put in a
// path, an identifier or a statement, and the claim is one and the same for all of them — what `yq` writes,
// `parseYaml` reads back unchanged.
const ch = n => String.fromCharCode(n);
const HOSTILE_SCALARS = [
  'plain', 'a: b', '#hash', ' leading', 'trailing ', '', '-dash', '- item', '*alias', '&anchor', '!!str',
  '?query', '|block', '>fold', '%directive', '@at', '`tick`', '{flow}', '[flow]', 'a,b', "quote'", 'quote"',
  'true', 'false', 'null', 'yes', 'no', 'on', 'off', '~', '0', '-1', '1.5', '0x10', '2026-01-10',
  'unicode-üñî', '日本語', 'emoji-\u{1f600}', 'a' + NL + 'b',
  'tab' + ch(9) + 'here', 'cr' + ch(13) + 'here', 'ctl' + ch(1) + 'here', 'esc' + ch(27) + 'here',
  'del' + ch(127) + 'here', 'nul' + ch(0) + 'here', 'lone' + ch(0xd800) + 'surrogate',
  'a'.repeat(300), '---', '...', '- - -', 'key: value: value',
];

test('every hostile scalar `yq` emits reads back as the exact string it was given', () => {
  for (const s of HOSTILE_SCALARS) {
    const text = yamlEmit({ v: s });
    let doc;
    try { doc = parseYaml(text); } catch (e) { assert.fail(`yq(${JSON.stringify(s)}) => ${JSON.stringify(text)} does not parse: ${e.message}`); }
    assert.equal(doc.v, s, `yq(${JSON.stringify(s)}) emitted ${JSON.stringify(text)}, which read back as ${JSON.stringify(doc.v)}`);
    assert.equal(text.split(NL).filter(Boolean).length, 1, `yq(${JSON.stringify(s)}) emitted more than one line: ${JSON.stringify(text)}`);
  }
});

test('a scalar carrying a character YAML does not admit as printable is quoted and escaped, never emitted bare', () => {
  // YAML 1.2's c-printable excludes the C0 controls other than tab/LF/CR, DEL, and the surrogate range. A
  // repository path can hold any of them; a plain scalar cannot.
  const NOT_PRINTABLE = [0x00, 0x01, 0x08, 0x0b, 0x1b, 0x7f, 0xd800].map(ch);
  for (const c of NOT_PRINTABLE) {
    const s = 'id' + c + 'x';
    const emitted = yq(s);
    assert.ok(emitted.startsWith('"'), `yq(${JSON.stringify(s)}) emitted the bare scalar ${JSON.stringify(emitted)}`);
    assert.doesNotMatch(emitted, new RegExp(`[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f\\ud800-\\udfff]`), `yq(${JSON.stringify(s)}) left a raw non-printable character in ${JSON.stringify(emitted)}`);
  }
});

test('hostile scalars round-trip through nested mappings and sequences too', () => {
  const doc = { top: HOSTILE_SCALARS.map(s => ({ id: s, nested: { v: s } })) };
  const text = yamlEmit(doc);
  const back = parseYaml(text);
  assert.equal(back.top.length, HOSTILE_SCALARS.length);
  for (let i = 0; i < HOSTILE_SCALARS.length; i++) {
    assert.equal(back.top[i].id, HOSTILE_SCALARS[i], `sequence item ${i} did not round-trip`);
    assert.equal(back.top[i].nested.v, HOSTILE_SCALARS[i], `nested value ${i} did not round-trip`);
  }
});

// ---------- 5. a drill that never returns may not hang the command ----------
//
// `spawnSync` with no `timeout` waits forever, so a wedged CLI hung `grain propose` itself: no output, and
// nothing to interrupt but the process. The bound is derived (see `DRILL_TIMEOUT_MS`) and what is asserted here
// is that it is actually enforced — injected small, so the test does not have to wait out the real one.
test('a drill that never returns is abandoned, its aspect stays unverified, and the run says how many were given up on', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'propose-drill-timeout-'));
  try {
    // a stand-in for the Yggdrasil CLI that accepts the drill invocation and then never returns
    const hang = join(tmp, 'hangs.mjs');
    writeFileSync(hang, 'setInterval(() => {}, 1000);' + NL);
    // the minimum a drill is attempted on at all: an aspect with a rendered check and a corpus written
    const outDir = join(tmp, 'out'), ygg = join(outDir, '.yggdrasil');
    const id = 'grain/x/candidate-hang';
    mkdirSync(join(ygg, 'aspects', id), { recursive: true });
    writeFileSync(join(ygg, 'aspects', id, 'check.mjs'), 'export function check() { return []; }' + NL);
    const aspect = {
      id, origin: 'certified-convention', check: 'export function check() { return []; }' + NL,
      kind: 'file', drillViolatesWritten: 1, drillSatisfiesWritten: 1,
    };
    const evidence = [{ kind: 'aspect', id }];
    const t0 = Date.now();
    const verify = promoteEnforceableAspects([aspect], { ygg, outDir, evidence, asOf: 'abc', repo: tmp, ygBin: hang, drillTimeoutMs: 1500 });
    const elapsed = Date.now() - t0;

    assert.equal(verify.haveYg, true, 'the stand-in CLI has to resolve, or the test proves nothing');
    assert.ok(elapsed < 60_000, `the drill was not abandoned — the call took ${elapsed} ms`);
    assert.equal(verify.timedOut, 1, 'the abandoned drill was not counted');
    assert.equal(verify.verified, 0, 'a drill that returned no verdict must not count as verified');
    // unverified is not the same as judged and found wanting: no draftReason is invented for it
    assert.equal(aspect.finalStatus, 'draft');
    assert.equal(aspect.draftReason, null);
    // and the report says so, in one line, naming the bound that fired
    const report = proposeReport({
      counts: { types: 0, nodes: 0, nodeCycles: 0, aspects: 1, alternatives: 0, aspectsSkippedNotARule: 0, aspectsSkippedUnrenderableGroupScoped: 0 },
      nodes: [], aspects: [aspect], files: [], exp: { asOf: 'abc' }, alternatives: [], verify,
    }, { outDir });
    assert.equal(report.json.yggdrasil.timedOut, 1);
    const line = report.lines.find(l => /given up on/.test(l));
    assert.ok(line, `the report never mentions the abandoned drill:${NL}${report.lines.join(NL)}`);
    assert.match(line, /1\.5s/, `the report does not name the bound that fired: ${line}`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('the drill timeout is a stated multiple of a drill actually measured, not a chosen number', () => {
  assert.equal(DRILL_TIMEOUT_MS, SLOWEST_OBSERVED_DRILL_MS * 100);
  assert.ok(SLOWEST_OBSERVED_DRILL_MS > 0);
});

// ---------- 6. the repository is read-only, and `.grain/` has a committable half ----------
//
// `.grain/.gitignore` ignores `cache/` and nothing else — "everything else in .grain/ is meant to be
// committed". The export `propose` spawns for itself was written to `.grain/` directly, so every run left a
// multi-megabyte generated file in that committable half, never cleaned up, and showing as an untracked change
// in any repository that already commits its `.grain/`.
test('the export `propose` spawns for itself lands in the disposable cache, and the repository gains nothing else', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'propose-repo-writes-'));
  try {
    const repo = join(tmp, 'repo');
    w(repo, 'src/a.ts', 'export const a = 1;' + NL);
    w(repo, 'src/b.ts', 'export const b = 2;' + NL);
    // a repository that has already adopted grain: the committable half of `.grain/` is committed, exactly the
    // shape its own `.gitignore` describes. That is the repository the leak is visible in.
    w(repo, '.grain/.gitignore', '# generated by grain — the cache is disposable; everything else in .grain/ is meant to be committed' + NL + 'cache/' + NL);
    commit(repo);
    const r = grainIn(repo, ['propose', join(tmp, 'out')]);
    assert.equal(r.code, 0, `${r.out}${r.err}`);

    // git's own answer, not ours: nothing the run wrote is visible as a change to this repository
    const dirty = gitIn(repo, 'status', '--porcelain').split(NL).filter(Boolean);
    assert.deepEqual(dirty, [], `the run left changes in the repository: ${JSON.stringify(dirty)}`);
    // and specifically: the committable half of `.grain/` holds only the two things that belong there
    const inGrain = readdirSync(join(repo, '.grain')).sort();
    assert.deepEqual(inGrain, ['.gitignore', 'cache'], `.grain/ gained a generated file: ${JSON.stringify(inGrain)}`);
    assert.ok(existsSync(join(repo, '.grain', 'cache', 'propose-export.json')), 'the export was not written to the cache');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

// A comment is literal to the end of its line — there is no escape available inside one — so a character YAML
// does not admit cannot be quoted out of the way there, and one left raw takes the whole document down with it
// exactly as it would in a scalar.
test('a character YAML does not admit never reaches a comment raw either', () => {
  const c = n => String.fromCharCode(n);
  for (const n of [0x00, 0x01, 0x1b, 0x7f, 0x9f, 0xd800]) {
    const text = yamlEmit({ '#e': 'evidence for id' + c(n) + 'x', name: 'real' });
    assert.doesNotMatch(text, NOT_PRINTABLE_RE, `a comment carries U+${n.toString(16).padStart(4, '0')} raw: ${JSON.stringify(text)}`);
    assert.match(text, /^# evidence for id.x$/m, `the comment lost more than the one character it cannot write: ${JSON.stringify(text)}`);
    assert.deepEqual(Object.keys(parseYaml(text)), ['name']);
  }
});
