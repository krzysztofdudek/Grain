// G10: a FILE-KIND fact (quote style, filename shape, export style — a lexical property of the WHOLE file's
// content) sits on a pseudo-scope with `line: 1` and no real span (extractScopes, core.mjs). `check`/`review`
// classify in-change vs pre-existing by intersecting the diff's changed line RANGES with a deviating scope's own
// line range (`touched()` in `fileFindings`, grain.mjs). That is correct for a bounded scope (a method, a class)
// but wrong for a file-kind fact: since the predicate describes the ENTIRE file, an edit anywhere can flip its
// value, yet the line-range check only counts it as "touched" when the diff happens to touch line 1-4. Two
// mirror-image misattributions result:
//   (a) an edit deep in the file that FLIPS the file's dominant quote style (a genuinely new deviation) is
//       reported as pre-existing, because the diff never touches line 1;
//   (b) an edit that ONLY touches line 1 (an unrelated header comment) makes an OLD, unrelated file-level
//       deviation get reported as in-change, because line 1 (where the pseudo-scope sits) was touched.
// The fix classifies a file-kind deviation by whether THIS edit changed the fact's VALUE (comparing against the
// predicate recomputed on the file's content at the correct "before" ref), not by line ranges.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const git = (env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const reset = () => { git({}, 'checkout', '-q', 'HEAD', '--', '.'); git({}, 'clean', '-qfd'); };
// pull the pids reported for one file's check --json into two short lists, for terse assertions below
const pids = json => ({ inChange: json.deviationsInChange.map(x => x.pid), preExisting: json.deviationsPreExisting.map(x => x.pid) });
const checkJson = file => JSON.parse(grain(['check', file, '--json']).out);

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-filefact-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git({}, 'init', '-q', '-b', 'main'); git({}, 'config', 'commit.gpgsign', 'false');
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  // 24 conforming corpus files: 2 double-quoted strings each — establishes a repo-wide "files here quote strings
  // with double quotes" convention (kind: 'file', pid: auto.lex:quote)
  for (let i = 1; i <= 24; i++) w(`src/models/Model${i}.ts`, `export class Model${i}Model {\n  compute() {\n    return "a";\n  }\n  compute2() {\n    return "b";\n  }\n}\n`);
  // ModelA: conforming at HEAD (all double), several lines of header before its string literals — the edit target
  // for case (a): an edit far from line 1 that flips the dominant quote style
  w('src/models/ModelA.ts', '// ModelA header\nexport class ModelAModel {\n  compute() {\n    return "a";\n  }\n  compute2() {\n    return "b";\n  }\n  compute3() {\n    return "c";\n  }\n  compute4() {\n    return "d";\n  }\n  compute5() {\n    return "e";\n  }\n}\n');
  // ModelB: ALREADY deviant at HEAD (all single quotes) — the edit target for case (b): an edit that only touches line 1
  w('src/models/ModelB.ts', "// ModelB header\nexport class ModelBModel {\n  compute() {\n    return 'a';\n  }\n  compute2() {\n    return 'b';\n  }\n  compute3() {\n    return 'c';\n  }\n  compute4() {\n    return 'd';\n  }\n  compute5() {\n    return 'e';\n  }\n}\n");
  git(d1, 'add', '-A'); git(d1, 'commit', '-qm', 'add models');
  // ModelBad: a genuine SCOPE-level (type-kind) nameshape deviation, in its own commit — the fixture for regression
  // control (e): its own class sits on a real, bounded line range, unlike a file-kind pseudo-scope
  w('src/models/ModelBad.ts', 'export class modelBadModel {\n  compute() {\n    return "a";\n  }\n}\n\nexport class ModelBadExtraModel {\n  compute() {\n    return "a";\n  }\n  compute2() {\n    return "b";\n  }\n}\n');
  git(dateEnv('2026-03-02T12:00:00Z'), 'add', '-A'); git(dateEnv('2026-03-02T12:00:00Z'), 'commit', '-qm', 'add ModelBad');
  // pushes HEAD's own timestamp forward so the corpus above clears freshDays and is "established"
  w('NOTES.md', 'notes\n');
  git(dateEnv('2026-03-10T12:00:00Z'), 'add', 'NOTES.md'); git(dateEnv('2026-03-10T12:00:00Z'), 'commit', '-qm', 'notes');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' });
  assert.equal(st.status, 0, st.stdout + st.stderr);
  assert.match(st.stdout, /\d+ conventions/, `sanity: the fixture must establish at least one convention: ${st.stdout}`);
  const rep = spawnSync('node', [BIN, 'report', '--top', '60'], { cwd: repo, encoding: 'utf8' });
  assert.match(rep.stdout, /quote strings with double quotes/, `sanity: the quote-style convention must be established: ${rep.stdout}`);
});
beforeEach(() => reset());
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('(a) an edit far from line 1 that flips the file\'s dominant quote style is reported IN-CHANGE, not pre-existing', () => {
  // sanity: HEAD's own committed content does NOT carry the deviation
  const headContent = git({}, 'show', 'HEAD:src/models/ModelA.ts');
  assert.doesNotMatch(headContent, /return 'a';/, 'sanity: HEAD is all-double-quoted, the premise the test edit relies on');
  const path = join(repo, 'src', 'models', 'ModelA.ts');
  const lines = readFileSync(path, 'utf8').split('\n');
  for (const i of [3, 6, 9, 12]) lines[i] = lines[i].replace('"', "'").replace('"', "'"); // lines 4,7,10,13 (1-indexed) — 4 of 5 strings flipped to single, none within the first 4 lines
  writeFileSync(path, lines.join('\n'));
  const diff = git({}, 'diff', '-U0', '--', 'src/models/ModelA.ts');
  assert.doesNotMatch(diff, /^@@ -1\b/m, 'sanity: the diff must not touch line 1, the exact premise of the bug');
  const j = checkJson('src/models/ModelA.ts');
  const { inChange, preExisting } = pids(j);
  assert.ok(inChange.includes('auto.lex:quote'), `expected the flipped quote style reported IN-CHANGE: inChange=${inChange} preExisting=${preExisting}`);
  assert.ok(!preExisting.includes('auto.lex:quote'), `the quote deviation must not also appear as pre-existing: preExisting=${preExisting}`);
});

test('(b) an edit that only touches line 1 leaves an old, unrelated file-level deviation PRE-EXISTING, not in-change', () => {
  // sanity: the deviation already exists at HEAD, before any worktree edit
  const before = checkJson('src/models/ModelB.ts');
  assert.ok(pids(before).preExisting.includes('auto.lex:quote'), `sanity: ModelB.ts must already deviate at HEAD: ${JSON.stringify(before)}`);
  const path = join(repo, 'src', 'models', 'ModelB.ts');
  const lines = readFileSync(path, 'utf8').split('\n');
  lines[0] += ' — edited'; // only line 1 changes; no string literal is touched
  writeFileSync(path, lines.join('\n'));
  const diff = git({}, 'diff', '-U0', '--', 'src/models/ModelB.ts');
  assert.match(diff, /^@@ -1\b/m, 'sanity: the diff touches only line 1');
  assert.doesNotMatch(diff, /^@@ -[2-9]/m, 'sanity: no other line is touched');
  const j = checkJson('src/models/ModelB.ts');
  const { inChange, preExisting } = pids(j);
  assert.ok(preExisting.includes('auto.lex:quote'), `expected the old quote deviation to remain PRE-EXISTING: inChange=${inChange} preExisting=${preExisting}`);
  assert.ok(!inChange.includes('auto.lex:quote'), `an unrelated line-1 edit must not promote it to in-change: inChange=${inChange}`);
});

test('(c) an untracked (brand new) file with a file-level deviation is reported in-change — confirm no regression', () => {
  w('src/models/ModelC.ts', "export class ModelCModel {\n  compute() {\n    return 'a';\n  }\n  compute2() {\n    return 'b';\n  }\n}\n");
  const j = checkJson('src/models/ModelC.ts');
  const { inChange } = pids(j);
  assert.ok(inChange.includes('auto.lex:quote'), `expected an untracked file's own deviation reported in-change: ${JSON.stringify(j)}`);
});

test('(e) a scope-level (non-file-kind) deviation is unaffected: still classified purely by line range', () => {
  // ModelBad.ts: `modelBadModel` (lines 1-4) is a pre-existing nameshape deviation; `ModelBadExtraModel` (lines 7-14) conforms
  const before = checkJson('src/models/ModelBad.ts');
  assert.ok(pids(before).preExisting.includes('auto.nameshape'), `sanity: modelBadModel must already deviate at HEAD: ${JSON.stringify(before)}`);
  const path = join(repo, 'src', 'models', 'ModelBad.ts');
  // an edit INSIDE the conforming second class, far from the deviant class's own line range — must stay pre-existing
  { const lines = readFileSync(path, 'utf8').split('\n'); lines[8] = lines[8].replace('"a"', '"a" // edited'); writeFileSync(path, lines.join('\n'));
    const j = checkJson('src/models/ModelBad.ts'); const { inChange, preExisting } = pids(j);
    assert.ok(preExisting.includes('auto.nameshape'), `an edit to an unrelated class must leave the nameshape deviation pre-existing: ${JSON.stringify(j)}`);
    assert.ok(!inChange.includes('auto.nameshape'), `an edit to an unrelated class must not promote it to in-change: ${JSON.stringify(j)}`);
    reset(); }
  // an edit INSIDE the deviant class's own line range — must become in-change
  { const lines = readFileSync(path, 'utf8').split('\n'); lines[2] = lines[2].replace('"a"', '"a" // edited'); writeFileSync(path, lines.join('\n'));
    const j = checkJson('src/models/ModelBad.ts'); const { inChange } = pids(j);
    assert.ok(inChange.includes('auto.nameshape'), `an edit inside the deviant class's own scope must report it in-change: ${JSON.stringify(j)}`); }
});

test('(f) check --content (wholeFile mode) is unaffected: still treats the whole submission as in-change', () => {
  const tmpFile = join(tmp, 'wholefile.ts');
  writeFileSync(tmpFile, "export class Model1Model {\n  compute() {\n    return 'a';\n  }\n  compute2() {\n    return 'b';\n  }\n}\n");
  const j = JSON.parse(grain(['check', 'src/models/Model1.ts', '--content', tmpFile, '--json']).out);
  assert.ok(pids(j).inChange.includes('auto.lex:quote'), `--content must still treat the whole file as the change: ${JSON.stringify(j)}`);
});

// permanent commits below (mirrors review-command.test.mjs's own --range tests) — kept last so they don't disturb any test above
test('(d) --range a..b classifies a file-level deviation against the RANGE START (a), not literal HEAD', () => {
  // ModelRange.ts: already deviant (single quotes) as of `a` — a deviation that PREDATES the range
  w('src/models/ModelRange.ts', "// ModelRange header\nexport class ModelRangeModel {\n  compute() {\n    return 'a';\n  }\n  compute2() {\n    return 'b';\n  }\n}\n");
  git(dateEnv('2026-03-11T12:00:00Z'), 'add', '-A'); git(dateEnv('2026-03-11T12:00:00Z'), 'commit', '-qm', 'add ModelRange (deviant)');
  const a = git({}, 'rev-parse', 'HEAD');
  // b: touches only line 1 (unrelated) — the file changes between a..b, but the quote-style value does not
  { const path = join(repo, 'src', 'models', 'ModelRange.ts'); const lines = readFileSync(path, 'utf8').split('\n'); lines[0] += ' x'; writeFileSync(path, lines.join('\n')); }
  git(dateEnv('2026-03-12T12:00:00Z'), 'commit', '-qam', 'touch line 1 only');
  const b = git({}, 'rev-parse', 'HEAD');
  // a further commit AFTER b flips the file back to double quotes — this becomes the real, current HEAD. If the
  // implementation used literal 'HEAD' instead of the range's own start (a), this commit's content ('double') would
  // wrongly look like the "before" state and the pre-existing deviation would be misreported as in-change.
  w('src/models/ModelRange.ts', '// ModelRange header x\nexport class ModelRangeModel {\n  compute() {\n    return "a";\n  }\n  compute2() {\n    return "b";\n  }\n}\n');
  git(dateEnv('2026-03-13T12:00:00Z'), 'commit', '-qam', 'flip back to double, after b');
  const j = JSON.parse(grain(['review', '--range', `${a}..${b}`, '--json']).out);
  assert.ok(j.files.includes('src/models/ModelRange.ts'), `expected the file in scope: ${JSON.stringify(j.files)}`);
  // `review` deliberately reports nothing for a file whose only findings are pre-existing (not yours to fix) —
  // so the CORRECT verdict here (pre-existing, since the deviation predates `a`) makes the file disappear from
  // `findings` entirely. The bug this guards against — comparing against literal HEAD instead of the range's own
  // start (a) — would instead see the deviation as NEW (HEAD's flipped-back content looks like a clean "before"),
  // so the file would wrongly show up with a deviationsInChange entry.
  const f = j.findings.find(x => x.file === 'src/models/ModelRange.ts');
  assert.equal(f, undefined, `a deviation predating the range start must not surface as a finding at all: ${JSON.stringify(f)}`);
});
