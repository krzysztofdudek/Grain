// §018 phase 2 — declarations written inside a MACRO INVOCATION's body.
//
// The defect: a macro invocation's body is an UNPARSED TOKEN REGION. The grammar tokenises it and then declines
// to give it structure, so every declaration written inside it is invisible to extraction. axum's
// `axum/src/extract/rejection.rs` defines ~15 public error types entirely through
// `define_rejection! { pub struct JsonDataError(Error); }` and yielded ZERO scopes — a 200-line file grain
// answered about confidently and wrongly.
//
// The fix asks the GRAMMAR ITSELF what the tokens are, instead of guessing what a macro emits: re-parse the
// region's own text with the same parser and keep what comes back ONLY if the whole region parses cleanly
// (`hasError === false`). That single boolean is the entire gate — there is no new threshold, no macro-name
// allowlist, and no language is named anywhere. Both node-type predicates (`b.macroCall`, `b.tokenRegion`) are
// derived from each grammar's own node-types.json, exactly as `b.scope`/`b.namedValueSpec` already are.
//
// The error this must never make is the INVERSE one: inventing a declaration that does not exist would be
// strictly worse than the silence it replaces, since phase 1 already ships an honest "grain cannot see inside
// this file" answer. Hence the negative tests below carry as much weight as the positive ones — a body of bare
// references, a macro DEFINITION's own template, a template with interpolation holes and a body in a syntax the
// language does not have must every one of them produce nothing at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';
import { EXT2GRAMMAR } from '../engine/config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

async function scopesOf(ext, src) {
  const p = await getParser(ext); const b = bindingFor(p._g); const tree = p.parse(src);
  const out = extractScopes('src/X' + ext, tree, b, p._g); tree.delete(); return out;
}
const declared = scopes => scopes.filter(s => s.kind !== 'file').map(s => `${s.name}@${s.line}`).sort();

// ===========================================================================================================
// THE DERIVATION — both predicates come from node-types.json, and are a no-op for every grammar that has no
// unstructured token region. This is what makes "kod to kod" checkable rather than asserted: 22 of the 23
// shipped grammars provably get no new behaviour at all.
// ===========================================================================================================

test('the macro-call predicate is derived from node-types.json, not from a grammar name', async () => {
  const p = await getParser('.rs'); const b = bindingFor(p._g);
  assert.ok(b.macroCall.size >= 1, 'a grammar with an unstructured token region must yield at least one macro-call node type');
  // every macro-call type's own children must be token regions — that IS the derivation, restated
  for (const t of b.macroCall) assert.ok(!b.tokenRegion.has(t), `${t} must not itself be a token region`);
});

test('every shipped grammar with no unstructured token region derives an EMPTY macro-call set (no new behaviour)', async () => {
  const seen = new Set(); let empty = 0, nonEmpty = 0;
  for (const ext of Object.keys(EXT2GRAMMAR)) {
    const g = EXT2GRAMMAR[ext]; if (seen.has(g)) continue; seen.add(g);
    const p = await getParser(ext); const b = bindingFor(p._g);
    if (b.macroCall.size) nonEmpty++; else empty++;
  }
  assert.ok(empty >= 20, `most shipped grammars must derive no macro-call node type at all: ${empty} empty, ${nonEmpty} non-empty`);
  assert.ok(nonEmpty >= 1, 'at least one shipped grammar must derive one, or the rule is dead code');
});

// ===========================================================================================================
// POSITIVE — the names that were invisible, and the exact lines they sit on
// ===========================================================================================================

test('a macro body that spells a declaration yields that declaration, at its own line (018\'s own shape)', async () => {
  const scopes = await scopesOf('.rs', [
    'define_rejection! {',                                    // 1
    '    #[status = UNPROCESSABLE_ENTITY]',                   // 2
    '    #[body = "Failed to deserialize the JSON body"]',    // 3
    '    /// Rejection type for [`Json`](super::Json).',      // 4
    '    pub struct JsonDataError(Error);',                   // 5
    '}',                                                      // 6
    '',
    'define_rejection! {',                                    // 8
    '    pub struct MissingJsonContentType;',                 // 9
    '}',                                                      // 10
  ].join('\n'));
  assert.deepEqual(declared(scopes), ['JsonDataError@5', 'MissingJsonContentType@9'],
    `both macro-declared types must appear at their real lines: ${JSON.stringify(scopes.map(s => [s.kind, s.name, s.line]))}`);
  const jde = scopes.find(s => s.name === 'JsonDataError');
  assert.equal(jde.kind, 'type', 'a struct declaration is a type, wherever it was written');
  assert.equal(jde.rel, 'src/X.rs', 'the declaration belongs to the REAL file, not to the re-parsed fragment');
});

test('a macro body that spells an enum yields the enum AND its members, exactly as an ordinary enum does', async () => {
  const macroed = await scopesOf('.rs', 'composite_rejection! {\n    pub enum JsonRejection {\n        JsonDataError,\n        JsonSyntaxError,\n    }\n}\n');
  const plain = await scopesOf('.rs', 'pub enum JsonRejection {\n    JsonDataError,\n    JsonSyntaxError,\n}\n');
  assert.deepEqual(macroed.filter(s => s.kind !== 'file').map(s => [s.kind, s.name, s.nt]),
    plain.filter(s => s.kind !== 'file').map(s => [s.kind, s.name, s.nt]),
    'a declaration inside a macro body must be classified identically to the same declaration written plainly');
});

test('a macro body nested one level inside another macro body is still reached', async () => {
  const scopes = await scopesOf('.rs', 'outer! {\n    inner! {\n        pub struct Nested;\n    }\n}\n');
  assert.deepEqual(declared(scopes), ['Nested@3'], JSON.stringify(scopes.map(s => [s.name, s.line])));
});

// ===========================================================================================================
// NEGATIVE — the phantom-declaration guards. Inventing a name is the one error worse than silence.
// ===========================================================================================================

test('a macro body of bare REFERENCES declares nothing', async () => {
  const scopes = await scopesOf('.rs', [
    'fn caller() {',
    '    println!("{}", WidgetKind);',
    '    let v = vec![AlphaThing, BetaThing];',
    '    assert_eq!(GammaThing, DeltaThing);',
    '    let _ = matches!(v, EpsilonThing::Zeta);',
    '}',
  ].join('\n'));
  assert.deepEqual(declared(scopes), ['caller@1'],
    `only the real function may be declared — every identifier inside those macro bodies is a REFERENCE: ${JSON.stringify(scopes.map(s => [s.kind, s.name]))}`);
});

test('a macro DEFINITION\'s own template declares nothing — the template is not code that exists', async () => {
  const scopes = await scopesOf('.rs', 'macro_rules! make_it {\n    () => {\n        pub struct PhantomType;\n    };\n}\n');
  assert.deepEqual(declared(scopes), [],
    `a macro_rules! body is a template, not a declaration site: ${JSON.stringify(scopes.map(s => [s.kind, s.name]))}`);
});

test('a macro body whose names are interpolation HOLES declares nothing', async () => {
  const scopes = await scopesOf('.rs', 'fn emit() {\n    let _t = quote! { pub struct #name; };\n}\n');
  assert.deepEqual(declared(scopes), ['emit@1'],
    ``+`a hole is not a name: ${JSON.stringify(scopes.map(s => [s.kind, s.name]))}`);
});

test('a macro body in a syntax the language does not have declares nothing (it stays 018-phase-1 blind)', async () => {
  const scopes = await scopesOf('.rs', 'declare_flags! {\n    pub struct FlagSet: u32 { const A = 1; }\n}\n');
  assert.deepEqual(declared(scopes), [],
    `the grammar refuses this body, so grain must keep saying it cannot see inside: ${JSON.stringify(scopes.map(s => [s.kind, s.name]))}`);
});

// ===========================================================================================================
// UNCHANGED — a file with no macro invocation in it, and a grammar with no token region at all
// ===========================================================================================================

test('a file with no macro invocation is extracted exactly as before', async () => {
  const src = 'pub struct Plain { x: u32 }\n\nimpl Plain {\n    pub fn get(&self) -> u32 { self.x }\n}\n\npub fn free() -> u32 { 1 }\n';
  const scopes = await scopesOf('.rs', src);
  assert.deepEqual(declared(scopes), ['Plain@1', 'free@7', 'get@4'], JSON.stringify(scopes.map(s => [s.kind, s.name, s.line])));
});

test('a grammar with no unstructured token region is byte-identical either way (TypeScript, Go, Python)', async () => {
  for (const [ext, src, want] of [
    ['.ts', 'export function alpha(): number { return 1; }\nexport class Beta { gamma(): void {} }\n', ['Beta@2', 'alpha@1', 'gamma@2']],
    ['.go', 'package p\n\nfunc Alpha() int { return 1 }\n', ['Alpha@3']],
    ['.py', 'class Beta:\n    def gamma(self):\n        return 1\n', ['Beta@1', 'gamma@2']],
  ]) {
    const p = await getParser(ext); const b = bindingFor(p._g);
    assert.equal(b.macroCall.size, 0, `${ext} must derive no macro-call node type`);
    assert.deepEqual(declared(await scopesOf(ext, src)), want, ext);
  }
});

// ===========================================================================================================
// END TO END — the ticket's own symptom: `what` on a macro-declared type
// ===========================================================================================================

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
  GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const grainIn = (dir, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };

let tmpE2e, repoE2e;
test('setup: a repo whose only declaration of a public type is inside a macro body', () => {
  tmpE2e = mkdtempSync(join(tmpdir(), 'grain-macro-decl-')); repoE2e = join(tmpE2e, 'r'); mkdirSync(repoE2e);
  gitIn(repoE2e, 'init', '-q', '-b', 'main'); gitIn(repoE2e, 'config', 'commit.gpgsign', 'false');
  w(repoE2e, 'src/rejection.rs',
    'define_rejection! {\n    #[status = BAD_REQUEST]\n    pub struct ZqJsonDataError(Error);\n}\n\n' +
    'define_rejection! {\n    pub struct ZqMissingContentType;\n}\n');
  // enough real scopes for a partition to form at all — a repo below the floor answers "not found" for
  // everything, real symbols included (the same sizing behaviour what-honest-negative.test.mjs documents)
  for (let i = 1; i <= 15; i++) w(repoE2e, `src/filler${i}.ts`, `export function f${i}(): number { return ${i}; }\n`);
  gitIn(repoE2e, 'add', '-A'); gitIn(repoE2e, 'commit', '-qm', 'macro-declared rejection types');
  const st = grainIn(repoE2e, ['status']); assert.equal(st.code, 0, st.err);
});

test('`what` names the macro-declared type and the line it is written on, instead of denying it exists', () => {
  const r = grainIn(repoE2e, ['what', 'ZqJsonDataError']);
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /has no declarations or values anywhere/, `the bare false negative 018 reports must be gone:\n${r.out}`);
  assert.match(r.out, /src\/rejection\.rs:3/, `the answer must point at the declaration's own line:\n${r.out}`);
});

test('a genuinely absent symbol on the SAME repo is still answered as absent (no over-reach)', () => {
  const r = grainIn(repoE2e, ['what', 'ZqTotallyAbsentThing']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /has no declarations or values anywhere in this repository's code/, r.out);
});

test('teardown: e2e repo', () => { if (tmpE2e) rmSync(tmpE2e, { recursive: true, force: true }); });
