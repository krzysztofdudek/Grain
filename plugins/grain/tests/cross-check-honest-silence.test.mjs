// Cross-check — the honest-silence invariant shared by tickets 011, 018 and 014.
//
// THE INVARIANT (018's "unifying defect", which 011 and 014 are each an instance of): absence of evidence must be
// distinguishable from evidence of absence. `grain what <term>` has exactly one strongest negative sentence —
// "«q» has no declarations or values anywhere in this repository's code" — and today it is emitted identically
// for three structurally different situations:
//   (i)   a term that genuinely appears nowhere in the repository (the honest case — this IS the correct answer);
//   (ii)  a value grain SAW during extraction but excluded from `model.valueIndex` by the population floor
//         (`CFG.valueDfMin = 2`, config.mjs) — a real literal in exactly one file (011);
//   (iii) a symbol that lives in a file grain could not extract scopes from at all — a Rust file entirely made of
//         macro invocations (018), or a Go package-level `const`/`var` that never becomes a scope even though its
//         own file parses fine and yields other scopes (014's own instance of the same defect).
// This file does not presume HOW a fix will disclose the difference (a hedge clause, a count, a named file) — it
// only asserts that the THREE (here, four) answers must stop being byte-identical after their own query text is
// removed. While 011/018/014 are open, that assertion fails: this file's DISTINGUISHABILITY section is expected
// RED, on purpose. Never weaken these assertions to make them pass — a fix on the concurrent engine branch should
// make them go GREEN, not this file's assertions grow looser.
//
// ONE fixture repo carries every case. Measured directly on a real freshly-mined model (not asserted from theory):
// 25 code files total (20 filler .ts functions + gated.ts + control/{one,two}.ts + macro.rs + goconst.go), 48
// scopes, 1 partition. `CFG.valueDfMaxShare = 0.2` gives dfMax = ceil(0.2*25) = 5, comfortably above the control
// literal's df=2 and irrelevant to the gated literal's df=1 (excluded by `valueDfMin=2` regardless of dfMax).
//   - src/gated.ts        : the string "zqgated literal", appearing in EXACTLY this one file (df=1 → gated).
//   - src/control/{one,two}.ts : the string "zqcontrol literal", each once (df=2 → indexed — the sanity anchor
//     proving the pipeline works at all; if this one goes red, the fixture is broken, not the engine).
//   - src/macro.rs        : entire content is macro invocations whose BODIES the grammar cannot read
//     (`declare_flags! { pub struct ZqMacroType: u32 { … } }` — a syntax Rust does not have) — measured (see
//     precondition tests) to contribute zero non-file scopes: no partition's `fileScopes` carries a
//     `src/macro.rs` key at all. 018's own original body (`define_rejection! { pub struct X(Error); }`) is
//     parseable Rust and is extracted since 018 phase 2, so it no longer exhibits the property this fixture
//     needs; the assertions below are unchanged, only the body that makes them true.
//   - src/goconst.go      : a package-level `const zqGoConst = 1` beside a real function `zqGoFunc` in the SAME
//     file — measured to give `zqGoFunc` a real scope entry (proving the file is NOT a 018-style zero-scope file)
//     while `zqGoConst` is never a scope anywhere, exactly 014's own shape (a narrower, per-declaration blindness,
//     not a whole-file one) — added as a third instance of the same unifying property per 018's own text.
//   - "zqabsent"          : appears nowhere in the fixture at all — the genuine absence this whole file contrasts
//     the other two against.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
  GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const grainIn = (dir, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const modelIn = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));

// normalize a `what` answer by deleting every occurrence of its OWN query text — a fix-shape-agnostic comparison:
// whatever a real fix adds (a hedge clause, a count, a named unindexed file) must survive in what's LEFT after the
// query itself is stripped out, so two genuinely different answers stay different, and today's identical bare
// negative collapses to the identical remainder for every one of these terms.
const normText = (out, query) => out.split(query).join('');
const normJson = (jsonText) => { const j = JSON.parse(jsonText); delete j.query; return j; };

let tmp, repo;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-cross-check-honest-silence-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main'); gitIn(repo, 'config', 'commit.gpgsign', 'false');

  w(repo, 'src/gated.ts', 'export const gatedValue = "zqgated literal";\n');
  w(repo, 'src/control/one.ts', 'export const controlValueOne = "zqcontrol literal";\n');
  w(repo, 'src/control/two.ts', 'export const controlValueTwo = "zqcontrol literal";\n');

  // ticket 018's shape: a file whose entire content is macro invocations, none of whose bodies the grammar can
  // read. 018 phase 2 ships macro-body extraction, so a body that IS valid syntax (018's original
  // `define_rejection! { pub struct X(Error); }`) is now correctly extracted and this file would no longer be
  // blind at all; the bodies below are the shape that stays invisible — a syntax the language does not have, so
  // the grammar refuses the body and grain genuinely cannot see the name. Measured across five real Rust
  // repositories: this is not a contrived case, it is the majority of macro bodies (§018 phase 2 log).
  w(repo, 'src/macro.rs',
    'declare_flags! {\n    pub struct ZqMacroType: u32 { const ZQ_A = 1; }\n}\n\n' +
    'declare_flags! {\n    pub struct ZqMacroTypeTwo: u32 { const ZQ_B = 2; }\n}\n');

  // ticket 014's shape: a package-level const beside a real function in the SAME file, so the file is
  // demonstrably NOT a zero-scope file — the const's invisibility is a narrower, per-declaration gap
  w(repo, 'src/goconst.go', 'package zq\n\nconst zqGoConst = 1\n\nfunc zqGoFunc() int {\n\treturn zqGoConst\n}\n');

  // 20 filler files: real functions (no string literals, so they never pollute the value index) — just enough
  // scope volume to clear groupPartitions' 30-scope floor (core.mjs) so a partition actually forms and this
  // file's "0 scopes" claims are checked against real fileScopes data, not the absence of any partition at all
  for (let i = 1; i <= 20; i++) w(repo, `src/filler/f${i}.ts`, `export function filler${i}(): number { return ${i}; }\n`);

  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'cross-check honest-silence fixture');
  const st = grainIn(repo, ['status']); assert.equal(st.code, 0, st.err);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

// ===========================================================================================================
// PRECONDITIONS — fixture-soundness proof. These must be GREEN: they establish that the fixture genuinely
// reproduces each ticket's premise (a real df=1 gated value, a real zero-scope macro file, a real function-bearing
// Go file whose const is still invisible) independent of whatever `what` later does with that information.
// ===========================================================================================================

test('(p0) fixture sanity: 25 code files, dfMax = ceil(0.2*25) = 5 comfortably covers the control literal\'s df=2', () => {
  const m = modelIn(repo);
  assert.equal(m.files, 25, `this file's df-window arithmetic assumes exactly 25 code files: ${m.files}`);
});

test('(p1) precondition: `what "zqcontrol literal"` finds the control literal — the sanity anchor proving the pipeline works', () => {
  const j = JSON.parse(grainIn(repo, ['what', 'zqcontrol literal', '--json']).out);
  const v = j.values.find(v => v.value === 'zqcontrol literal');
  assert.ok(v, `control literal must be found: ${JSON.stringify(j.values)}`);
  assert.equal(v.kind, 'str');
  assert.equal(v.places.length, 2, JSON.stringify(v));
  const r = grainIn(repo, ['what', 'zqcontrol literal']);
  assert.match(r.out, /`zqcontrol literal` in 2 places/, r.out);
});

test('(p2) precondition: the gated literal is genuinely absent from valueIndex, but its file IS indexed (011\'s premise)', () => {
  const m = modelIn(repo);
  assert.ok(!('str:zqgated literal' in (m.valueIndex || {})),
    `the gated literal must be excluded by valueDfMin=2 (df=1): ${JSON.stringify(Object.keys(m.valueIndex || {}))}`);
  assert.ok((m.filesAll || []).includes('src/gated.ts'), 'the file holding the gated literal must be a real, tracked, parsed file');
});

test('(p3) precondition: the macro file is a real tracked file that parsed to ZERO scopes (018\'s premise)', () => {
  const m = modelIn(repo);
  assert.ok((m.filesAll || []).includes('src/macro.rs'), 'the macro file must be in the model\'s file list');
  assert.ok(m.partitions.length > 0, 'at least one partition must have formed for this check to be meaningful');
  for (const p of m.partitions) assert.ok(!('src/macro.rs' in (p.fileScopes || {})),
    `macro.rs must contribute 0 non-file scopes to partition "${p.name}": ${JSON.stringify(p.fileScopes['src/macro.rs'])}`);
});

test('(p4) precondition: the Go file is NOT zero-scope (zqGoFunc is a real scope) — yet zqGoConst is never a scope anywhere (014\'s premise)', () => {
  const m = modelIn(repo);
  assert.ok((m.filesAll || []).includes('src/goconst.go'));
  let sawGoFunc = false, sawGoConst = false;
  for (const p of m.partitions) for (const [rel, list] of Object.entries(p.fileScopes || {})) for (const [, name] of list) {
    if (rel === 'src/goconst.go' && name === 'zqGoFunc') sawGoFunc = true;
    if (name === 'zqGoConst') sawGoConst = true; }
  assert.ok(sawGoFunc, 'zqGoFunc must be a real declared scope — proof the file parses and yields scopes at all');
  assert.ok(!sawGoConst, 'zqGoConst must never be a declared scope anywhere — the exact shape 014 reports');
});

// ===========================================================================================================
// DISTINGUISHABILITY — THE INVARIANT ITSELF. Expected RED while 011/018/014 are open: today all four terms below
// collapse onto the byte-identical "has no declarations or values anywhere" sentence once their own query text is
// stripped out, so `assert.notEqual`/`assert.notDeepEqual` below currently FAIL. That failure IS the defect made
// visible — do not soften these assertions. If the concurrent engine branch lands a disclosure fix mid-run, these
// flip GREEN on their own; nothing here should ever need editing to "match" a fix.
// ===========================================================================================================

test('(d1) 011 acceptance verbatim: a df-gated value\'s answer must differ from a genuinely absent term\'s answer (text)', () => {
  const absent = grainIn(repo, ['what', 'zqabsent']);
  const gated = grainIn(repo, ['what', 'zqgated literal']);
  assert.equal(absent.code, 0, absent.err); assert.equal(gated.code, 0, gated.err);
  const na = normText(absent.out, 'zqabsent'), ng = normText(gated.out, 'zqgated literal');
  assert.notEqual(na, ng,
    `011: "seen but gated" and "genuinely absent" must not read identically once the query text is removed.\n` +
    `absent (raw): ${absent.out}\ngated (raw): ${gated.out}\nabsent (normalized): ${na}\ngated (normalized): ${ng}`);
});

test('(d1-json) 011: the same distinction must survive in --json (normalize by deleting the echoed query field)', () => {
  const absent = grainIn(repo, ['what', 'zqabsent', '--json']);
  const gated = grainIn(repo, ['what', 'zqgated literal', '--json']);
  const ja = normJson(absent.out), jg = normJson(gated.out);
  assert.notDeepEqual(ja, jg,
    `011: --json for "seen but gated" and "genuinely absent" must not be identical once \`query\` is removed.\n` +
    `absent: ${JSON.stringify(ja)}\ngated: ${JSON.stringify(jg)}`);
});

test('(d2) 018 phase 1: a symbol in a zero-scope macro-generated file must differ from a genuinely absent term (text)', () => {
  const absent = grainIn(repo, ['what', 'zqabsent']);
  const macro = grainIn(repo, ['what', 'ZqMacroType']);
  assert.equal(absent.code, 0, absent.err); assert.equal(macro.code, 0, macro.err);
  const na = normText(absent.out, 'zqabsent'), nm = normText(macro.out, 'ZqMacroType');
  assert.notEqual(na, nm,
    `018: "lives in a file I cannot see into" and "genuinely absent" must not read identically once the query text is removed.\n` +
    `absent (raw): ${absent.out}\nmacro (raw): ${macro.out}\nabsent (normalized): ${na}\nmacro (normalized): ${nm}`);
});

test('(d2-json) 018: the same distinction must survive in --json (normalize by deleting the echoed query field)', () => {
  const absent = grainIn(repo, ['what', 'zqabsent', '--json']);
  const macro = grainIn(repo, ['what', 'ZqMacroType', '--json']);
  const ja = normJson(absent.out), jm = normJson(macro.out);
  assert.notDeepEqual(ja, jm,
    `018: --json for a macro-file symbol and a genuinely absent term must not be identical once \`query\` is removed.\n` +
    `absent: ${JSON.stringify(ja)}\nmacro: ${JSON.stringify(jm)}`);
});

test('(d3) third instance (014 shape): a real Go package-level const, never extracted, must differ from a genuinely absent term (text)', () => {
  const absent = grainIn(repo, ['what', 'zqabsent']);
  const goConst = grainIn(repo, ['what', 'zqGoConst']);
  assert.equal(absent.code, 0, absent.err); assert.equal(goConst.code, 0, goConst.err);
  const na = normText(absent.out, 'zqabsent'), ngc = normText(goConst.out, 'zqGoConst');
  assert.notEqual(na, ngc,
    `014: a real, referenced, package-level const that was never extracted as a declaration must not read identically to "genuinely absent" once the query text is removed.\n` +
    `absent (raw): ${absent.out}\ngoConst (raw): ${goConst.out}\nabsent (normalized): ${na}\ngoConst (normalized): ${ngc}`);
});

test('(d3-json) 014: the same distinction must survive in --json (normalize by deleting the echoed query field)', () => {
  const absent = grainIn(repo, ['what', 'zqabsent', '--json']);
  const goConst = grainIn(repo, ['what', 'zqGoConst', '--json']);
  const ja = normJson(absent.out), jgc = normJson(goConst.out);
  assert.notDeepEqual(ja, jgc,
    `014: --json for a real never-extracted Go const and a genuinely absent term must not be identical once \`query\` is removed.\n` +
    `absent: ${JSON.stringify(ja)}\ngoConst: ${JSON.stringify(jgc)}`);
});

// THE HONEST DIRECTION — must stay GREEN forever, including after any 011/018/014 fix: the genuinely-absent case
// is the one situation where today's bare negative sentence is already the CORRECT, complete answer. Whatever
// disclosure a fix adds for cases (ii)/(iii) must not erode or replace this plain "nothing found" phrasing for
// case (i) — that would trade one honest-silence bug for a new one.
test('(honest) a genuinely absent term still says plainly that nothing was found — must not regress under any fix', () => {
  const r = grainIn(repo, ['what', 'zqabsent']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /has no declarations or values anywhere in this repository's code/, r.out);
});
