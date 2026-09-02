// §060 — Scala's braced-package syntax, combined with a Guice-style `@Inject()`-annotated curried constructor
// (the same idiom §053 already measured at 11.5% of playframework/playframework's .scala files), leaves the
// tree-sitter-scala grammar unable to parse the class header, and it wraps the whole surrounding statement list
// in one ERROR node. Real repro, byte-for-byte off playframework's own
// documentation/manual/tutorial/code/scalaguide/hello/HelloController.scala (commit 61ec059): a
// `package scalaguide.hello { ... }` block holds a nested `package views { object html { ... } }` (three real
// methods) followed by the broken `class HelloController @Inject() (cc: …)(implicit …)`. The nested package,
// object and all three of its methods parse CLEANLY as their own subtrees — tree-sitter's own error recovery
// already typed them correctly — but grain's walk hit `ch.isError` on the ERROR node and skipped straight past
// it, never pushing its children, so the clean subtree living inside never got visited at all. Silent loss: no
// disclosure, nothing in the model, nothing in `check`/`review`.
//
// The fix (engine/core.mjs, the walk loop in extractScopes): an ERROR node's own boundary is still never a
// declaration, but its children are pushed onto the walk stack exactly as any other non-scope node's are, so
// whichever of them the grammar ALREADY parsed with zero errors of their own get extracted normally. A doubly-
// broken child is itself flagged isError/isMissing and is skipped on its own next pop, so nothing is invented —
// every recovered scope still traces back to a real, cleanly-typed AST node, the same zero-fabrication contract
// §018's macro-body reparse holds, just applied at node granularity instead of re-parsing a text span (reparsing
// the WHOLE error span here would refail on the still-broken class header and recover nothing at all — see the
// negative-control test below, which proves that literal 018-style whole-region reparse is the wrong shape for
// this defect).
//
// This must NOT weaken the existing "parse degraded" disclosure (§053): the file's `hasError` stays true (the
// class header genuinely does not parse — recovering the sibling object does not fix that), so `check`/`review`
// must keep naming this file as degraded even after the salvage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getParser, bindingFor, extractScopes, parseFile } from '../engine/core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

async function scopesOf(ext, src) {
  const p = await getParser(ext); const b = bindingFor(p._g); const tree = p.parse(src);
  const out = extractScopes('src/X' + ext, tree, b, p._g); tree.delete(); return out;
}
const declared = scopes => scopes.filter(s => s.kind !== 'file').map(s => `${s.name}@${s.line}`).sort();

// the real shape, trimmed to what matters (comments/blank filler dropped, lines kept 1:1 with the original file
// so the `@N` line numbers below double as a byte-for-byte anchor into the real corpus file)
const HELLO_CONTROLLER = [
  'package scalaguide.hello {',                                                                 // 1
  '  import controllers.AssetsFinder',                                                          // 2
  '  import jakarta.inject.Inject',                                                              // 3
  '  import play.api.mvc._',                                                                     // 4
  '',                                                                                             // 5
  '  package views {',                                                                            // 6
  '    import play.twirl.api.Html',                                                              // 7
  '',                                                                                             // 8
  '    object html {',                                                                            // 9
  '      def index(message: String): Html = Html("Index page")',                                 // 10
  '      def hello(): Html                = Html("Hello page")',                                 // 11
  '      def hello(name: String): Html    = Html(s"Hello $name")',                                // 12
  '    }',                                                                                        // 13
  '  }',                                                                                          // 14
  '',                                                                                             // 15
  '  class HelloController @Inject() (cc: ControllerComponents)(implicit assetsFinder: AssetsFinder)', // 16
  '      extends AbstractController(cc) {',                                                       // 17
  '    def index = Action {',                                                                     // 18
  '      Ok(views.html.index("Your new application is ready."))',                                 // 19
  '    }',                                                                                         // 20
  '  }',                                                                                           // 21
  '}',                                                                                             // 22
].join('\n') + '\n';

// ===========================================================================================================
// THE DEFECT, CONFIRMED — this file genuinely carries an ERROR node under tree-sitter-scala
// ===========================================================================================================

test('confirms the repro genuinely produces a parse error (this is a grammar-limitation boundary, not a clean file)', async () => {
  const { tree } = await parseFile('.scala', HELLO_CONTROLLER);
  assert.equal(tree.rootNode.hasError, true,
    'the broken @Inject()-annotated curried constructor must still leave a real ERROR node — if this ever ' +
    'goes false the grammar itself changed and this whole fixture needs re-deriving from a fresh corpus repro');
  tree.delete();
});

// ===========================================================================================================
// POSITIVE — the nested object and its methods are recovered, at their own real lines
// ===========================================================================================================

test('a nested object sitting beside a broken @Inject() constructor, inside the same ERROR node, is recovered', async () => {
  const scopes = await scopesOf('.scala', HELLO_CONTROLLER);
  const names = declared(scopes);
  assert.ok(names.includes('html@9'), `object html must be recovered at its own line: ${JSON.stringify(names)}`);
  const html = scopes.find(s => s.name === 'html');
  assert.equal(html.kind, 'type', 'an object definition is a type, wherever it was found');
});

test('all three methods of the recovered object are extracted, exactly as an ordinary object\'s methods are', async () => {
  const scopes = await scopesOf('.scala', HELLO_CONTROLLER);
  const names = declared(scopes);
  for (const line of [10, 11, 12])
    assert.ok(names.includes(`hello@${line}`) || names.includes(`index@${line}`),
      `expected a method at line ${line}: ${JSON.stringify(names)}`);
  assert.equal(names.filter(n => n.startsWith('index@') || n.startsWith('hello@')).length, 4,
    `3 object methods + 1 orphaned class method (index, already recovered before this fix via the infix-` +
    `expression recovery path) = 4: ${JSON.stringify(names)}`);
});

test('the class whose constructor breaks the parse is itself still named (bonus recovery, same mechanism)', async () => {
  const scopes = await scopesOf('.scala', HELLO_CONTROLLER);
  const hc = scopes.find(s => s.name === 'HelloController');
  assert.ok(hc, `HelloController's own bodiless declaration should also surface: ${JSON.stringify(declared(scopes))}`);
  assert.equal(hc.kind, 'type');
});

// ===========================================================================================================
// STILL HONEST — recovering the salvageable part must not silence the caveat for the part that is still lost
// ===========================================================================================================

test('the file still reports hasError after salvage — the caveat mechanism (§053) is not blinded by the fix', async () => {
  const { tree } = await parseFile('.scala', HELLO_CONTROLLER);
  assert.equal(tree.rootNode.hasError, true,
    'HelloController\'s own constructor genuinely does not parse; recovering the sibling object must not flip this');
  tree.delete();
});

// ===========================================================================================================
// NEGATIVE CONTROL — literal §018-style "reparse the whole error span, accept only if clean" would recover
// NOTHING here, because the genuine syntax error and the salvageable object share the same ERROR node's span.
// This is why the fix works at node granularity (trust each child's own hasError) rather than re-parsing text.
// ===========================================================================================================

test('reparsing the WHOLE error region as one blob (018\'s literal mechanism) still fails — proves node-level salvage was the right shape, not text-level reparse', async () => {
  const { tree } = await parseFile('.scala', HELLO_CONTROLLER);
  const errNode = tree.rootNode.descendantsOfType('ERROR')[0];
  assert.ok(errNode, 'expected at least one ERROR node in the fixture');
  const p = await getParser('.scala');
  const reparsed = p.parse(errNode.text);
  assert.equal(reparsed.rootNode.hasError, true,
    'the ERROR node\'s own text, reparsed standalone, must STILL fail — the broken constructor is inside this ' +
    'exact span, so an all-or-nothing whole-region reparse (018\'s literal mechanism) would recover zero ' +
    'declarations here, including the perfectly clean nested object; the fix must not go down that path');
  reparsed.delete();
  tree.delete();
});

// ===========================================================================================================
// NO FABRICATION — an ERROR node whose children are ALSO broken (no clean salvageable subtree at all) still
// yields nothing invented. Descending into an error region must never manufacture a phantom declaration.
// ===========================================================================================================

test('an ERROR node with no clean, scope-shaped children inside it still yields no phantom declarations', async () => {
  // pure bracket/paren soup: tree-sitter-scala recovers only unnamed punctuation and nested ERROR nodes here —
  // no class/object/def-shaped node appears anywhere in the subtree, so there is nothing salvageable to find,
  // with or without this fix (verified directly: no descendant of the outer ERROR node is `isScope`-shaped)
  const src = 'package p {\n  ) ( ]] [[ }}\n}\n';
  const scopes = await scopesOf('.scala', src);
  assert.deepEqual(declared(scopes), [], `bracket soup must still yield nothing, not a guess: ${JSON.stringify(declared(scopes))}`);
});

test('a doubly-nested error (an ERROR node whose own child is ALSO an ERROR node) does not crash and salvages only the clean grandchild', async () => {
  const src = [
    'package p {',
    '  class @@@ garbage1',
    '  package q {',
    '    object Clean {',
    '      def m(): Int = 1',
    '    }',
    '  }',
    '  class @@@ garbage2',
    '}',
  ].join('\n') + '\n';
  const scopes = await scopesOf('.scala', src);
  const names = declared(scopes);
  assert.ok(names.some(n => n.startsWith('Clean@')), `Clean must still be recovered despite neighboring garbage on both sides: ${JSON.stringify(names)}`);
  assert.ok(names.some(n => n.startsWith('m@')), `Clean's method must still be recovered: ${JSON.stringify(names)}`);
});

// ===========================================================================================================
// UNCHANGED — a clean Scala file with no ERROR node at all extracts exactly as before
// ===========================================================================================================

test('a clean Scala file with no parse error is extracted byte-identically to before the fix', async () => {
  const src = 'package controllers\n\nclass Ok(cc: Int) {\n  def run(): Int = cc\n}\n\nobject Helper {\n  def go(): Int = 1\n}\n';
  const scopes = await scopesOf('.scala', src);
  assert.deepEqual(declared(scopes), ['Ok@3', 'Helper@7', 'go@8', 'run@4'].sort(),
    JSON.stringify(scopes.map(s => [s.kind, s.name, s.line])));
});

// ===========================================================================================================
// END TO END — the ticket's own acceptance criteria: (a) the recovery shows up in `what`, and (b) the parse-
// degraded caveat (§053) still fires for this exact file
// ===========================================================================================================

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
  GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const grainIn = (dir, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };

let tmpE2e, repoE2e;
test('setup: a repo whose only declaration of a real object is beside a broken @Inject() constructor', () => {
  tmpE2e = mkdtempSync(join(tmpdir(), 'grain-scala-errsalvage-')); repoE2e = join(tmpE2e, 'r'); mkdirSync(repoE2e);
  gitIn(repoE2e, 'init', '-q', '-b', 'main'); gitIn(repoE2e, 'config', 'commit.gpgsign', 'false');
  w(repoE2e, 'app/controllers/HelloController.scala', HELLO_CONTROLLER);
  // enough real scopes for a partition to form at all (same sizing convention as macro-body-declarations.test.mjs)
  for (let i = 1; i <= 15; i++) w(repoE2e, `src/filler${i}.ts`, `export function f${i}(): number { return ${i}; }\n`);
  gitIn(repoE2e, 'add', '-A'); gitIn(repoE2e, 'commit', '-qm', 'hello controller');
  const st = grainIn(repoE2e, ['status']); assert.equal(st.code, 0, st.err);
});

test('`what` finds the recovered object, instead of denying it exists', () => {
  const r = grainIn(repoE2e, ['what', 'html']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /HelloController\.scala/, `the answer must point at the real file:\n${r.out}`);
});

test('`check` still carries the §053 parse-degraded caveat for this exact file — recovery does not silence it', () => {
  const r = grainIn(repoE2e, ['check', 'app/controllers/HelloController.scala']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /\(parse degraded — part of this file sits in error nodes/,
    `the caveat must still fire — HelloController's own constructor is still genuinely unparseable:\n${r.out}`);
});

test('teardown: e2e repo', () => { if (tmpE2e) rmSync(tmpE2e, { recursive: true, force: true }); });
