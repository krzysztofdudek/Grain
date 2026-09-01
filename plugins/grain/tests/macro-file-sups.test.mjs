// §045 — `macroDefs` asserted arbitrary identifiers from macro bodies as the file's SUPERTYPES.
//
// `extractScopes` collected every `identifier`/`type_identifier` inside every macro invocation, kept the
// multi-token ones, and put them on the FILE scope's `sup` as "the DEFINITIONS a macro emits". `sup` becomes
// `model.fileSups`, which `what` reads at core.mjs:3153 as *implements/extends it*. Measured over five real Rust
// repositories, 5656 such names: 13% were declarations the ordinary walk or §018 phase 2 already had, 1.4% were
// real declarations inside a macro body the phase-2 gate refuses, and **85.5% were not declarations at all** —
// 26% the invoked macro's OWN name, 59% a bare reference. `what assert_eq` answered "implements/extends it in
// 230 files" on tokio. Nothing implements the standard assertion macro.
//
// The fix keeps `macroDoc` (the same identifiers as DOC tokens — a mention signal, which is what they are, and
// `fileDocs` only ever becomes match tokens so it claims nothing it cannot support) and drops `macroDefs`.
//
// Two knock-ons are pinned here deliberately, because both look like regressions to a reader who does not know
// they were measured:
//   · queries that had only a phantom `referenced` count now take §018's EMPTY-ANSWER path instead. They change
//     disclosure KIND, not merely presence. §037's `weakName` therefore fires LESS often, not more: `exactLocal`
//     (core.mjs) reads DECLARATIONS only and never `fileSups`, while `referenced` is one of the disjuncts that
//     make an answer non-empty — and non-empty is `weakName`'s own precondition.
//   · the `doc` half is measurably weaker than the `sup` half for retrieval (file cards over a 53-query sweep:
//     53 with both, 49 with doc only, 44 with neither). Those 4 cards are a knowingly accepted cost; the signal
//     that must survive is the one below.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const modelIn = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
  GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const grainIn = (dir, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const allSups = repo => { const m = modelIn(repo); const out = {};
  for (const p of m.partitions) for (const [rel, s] of Object.entries(p.fileSups || {})) (out[rel] ||= []).push(...s);
  return out; };

let tmp, repo;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-macro-file-sups-')); repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main'); gitIn(repo, 'config', 'commit.gpgsign', 'false');

  // (1) a macro body of BARE REFERENCES. `assert_eq` is the invoked macro's own name and tokenizes to two
  // tokens, so the old heuristic kept it and called it a supertype of this file.
  w(repo, 'src/checks.rs',
    'pub fn zq_check_one(a: u32, b: u32) {\n    assert_eq!(a, b);\n}\n\n' +
    'pub fn zq_check_two(a: u32) {\n    assert_eq!(a, ZqWidgetKind::Alpha as u32);\n}\n');

  // (2) a REAL supertype, in the same repo: trait bounds the ordinary walk records on a real scope. This must
  // survive untouched — the fix removes contamination from `fileSups`, not `fileSups`.
  // a supertrait list is a `trait_bounds` node sitting as a DIRECT child of the declaration, which is what
  // `b.heritageRe` matches; a generic bound on a fn or struct is nested inside `type_parameters` and never
  // becomes a `sup` at all (verified against the engine — the shape here has to be the one that really fires)
  w(repo, 'src/bounds.rs',
    'pub trait ZqMarkerTrait {}\n\n' +
    'pub trait ZqChildTrait: ZqMarkerTrait + Send {}\n');

  // (3) the `doc` signal: a macro body the phase-2 gate REFUSES (a syntax Rust does not have), carrying an
  // identifier that appears nowhere else. Only the doc-token path can surface this file for that word.
  w(repo, 'src/flags.rs',
    'declare_flags! {\n    pub struct ZqFlagSet: u32 {\n        const ZQ_DESERIALIZE_MARKER = 1;\n    }\n}\n');

  for (let i = 1; i <= 15; i++) w(repo, `src/filler${i}.ts`, `export function filler${i}(): number { return ${i}; }\n`);
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'macro file-sups fixture');
  const st = grainIn(repo, ['status']); assert.equal(st.code, 0, st.err);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('(p) precondition: the macro bodies are real and the phase-2 gate refuses the flags one', () => {
  const m = modelIn(repo);
  assert.ok((m.filesAll || []).includes('src/checks.rs'), 'the reference-only macro file must be tracked and parsed');
  let sawFlagSet = false;
  for (const p of m.partitions) for (const list of Object.values(p.fileScopes || {})) for (const [, name] of list) if (name === 'ZqFlagSet') sawFlagSet = true;
  assert.ok(!sawFlagSet, 'ZqFlagSet must NOT be extracted — its body is not Rust syntax, which is what makes case (3) meaningful');
});

test('(1) a macro body of bare references contributes NO supertype to its file', () => {
  const sups = allSups(repo)['src/checks.rs'] || [];
  assert.deepEqual(sups, [], `nothing in that file implements or extends anything: ${JSON.stringify(sups)}`);
});

test('(2) `what` on the invoked macro\'s own name makes no implements/extends claim', () => {
  const r = grainIn(repo, ['what', 'assert_eq']);
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /implements\/extends it in/, `nothing implements the assertion macro:\n${r.out}`);
});

test('(3) that query takes §018\'s empty-answer path — a change of disclosure KIND, pinned so it is not read as a regression', () => {
  const r = grainIn(repo, ['what', 'assert_eq']);
  assert.match(r.out, /has no declarations or values anywhere in this repository's code/,
    `with the phantom reference count gone the answer is genuinely empty, and says so:\n${r.out}`);
  assert.doesNotMatch(r.out, /nothing above IS/, `§037's weakName needs a non-empty answer to hedge about; there is none:\n${r.out}`);
});

test('(4) a REAL supertype is still recorded — the fix removes contamination from fileSups, not fileSups', () => {
  const sups = allSups(repo)['src/bounds.rs'] || [];
  assert.ok(sups.includes('ZqMarkerTrait'), `a genuine trait bound must survive: ${JSON.stringify(sups)}`);
});

test('(5) the `doc` half still surfaces a file for a word that exists only inside a body the gate refuses', () => {
  const r = grainIn(repo, ['where', 'zq deserialize marker']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /src\/flags\.rs/, `the mention signal is the half that earns its place — it must still point here:\n${r.out}`);
});
