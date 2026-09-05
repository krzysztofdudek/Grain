// §111, security pass — what can a repository make `grain propose` do?
//
// The threat is the north star's own scenario read adversarially: an adopter clones a repository nobody has
// audited and runs one command on it. Everything the proposal contains is derived from that repository's file
// names, identifiers and file contents, and the adopter is then invited to move the result into `.yggdrasil/`
// and commit it. So the repository is the attacker-controlled input, the out-dir is the sink, and the two
// questions are: can it make the command write outside the out-dir, and can it make the command put something
// into the out-dir that did not come from inside the repository.
//
// THE DRILL CORPUS IS THE ONLY PLACE REPOSITORY BYTES ARE COPIED WHOLESALE, and the only place a
// repository-derived string becomes several path components of a write: `<out-dir>/.yggdrasil/aspects/<id>/
// drills/<label>/<the site's own repo-relative path>`. Everything else that reaches a path — a node id, a type
// id, an aspect id — goes through `slug`, which admits `[a-z0-9-]` and nothing else, so it can carry neither a
// separator nor `..`; that is asserted below too, because it is the reason the other write sites need no check.
//
// Two things a hostile repository was able to do before this pass, both through that corpus:
//   1. HAND THE PROPOSAL A FILE IT DOES NOT CONTAIN. Git tracks a symlink as an ordinary entry, and
//      `readFileSync` follows one. A repository shipping `src/handler.ts -> ../../../.ssh/id_rsa` gets that
//      file's content copied into a directory the adopter is being asked to commit.
//   2. NAME A SITE OUTSIDE THE REPOSITORY. A site path is trusted as repo-relative; one that resolves out of
//      the repository is not this repository's evidence, and one carrying `..` reaches out of the out-dir on
//      the write side as well.
//
// The fixture is a REAL repository — `git init`, real files, a real symlink on disk, a real commit — generated
// deterministically here because no fixture under `tests/fixtures/` is hostile on purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { cutDrills, slug } from '../engine/propose.mjs';

const NL = String.fromCharCode(10);
const gitEnv = {
  GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
  GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z', TZ: 'UTC',
};
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (root, rel, content) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };

const SECRET = 'BEGIN-STOLEN-SECRET';

// A repository that is hostile on purpose, on disk, with a history.
//
//   outside/stolen.ts     never tracked, never inside the repository — the thing that must not be copied
//   repo/src/honest.ts    an ordinary tracked file, the control: it MUST still be cut as a case
//   repo/src/link.ts      a TRACKED SYMLINK whose target is `outside/stolen.ts`
function buildHostile(tmp) {
  const repo = join(tmp, 'repo');
  w(tmp, 'outside/stolen.ts', `// ${SECRET}${NL}export function handleStolen(v: string): string { return v; }${NL}`);
  w(repo, 'src/honest.ts', `export function handleHonest(v: string): string { return v; }${NL}`);
  mkdirSync(join(repo, 'src'), { recursive: true });
  symlinkSync(join('..', '..', 'outside', 'stolen.ts'), join(repo, 'src', 'link.ts'));
  gitIn(repo, 'init', '-q', '-b', 'main');
  gitIn(repo, 'config', 'commit.gpgsign', 'false');
  gitIn(repo, 'add', '-A');
  gitIn(repo, 'commit', '-q', '-m', 'hostile');
  return repo;
}

test('a tracked symlink cannot hand the proposal a file the repository does not contain', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'propose-hostile-'));
  try {
    const repo = buildHostile(tmp);
    // git tracks the link as an ordinary entry — if it did not, this test would be measuring git, not grain
    const modes = gitIn(repo, 'ls-files', '-s').split(NL).filter(Boolean);
    assert.ok(modes.some(l => l.startsWith('120000') && l.endsWith('src/link.ts')), `the fixture's symlink is not tracked: ${modes.join(' | ')}`);
    // and the link really does resolve to the secret, so a follower WOULD read it
    assert.match(readFileSync(join(repo, 'src', 'link.ts'), 'utf8'), new RegExp(SECRET));

    const aspect = { drills: { satisfies: [{ rel: 'src/honest.ts' }, { rel: 'src/link.ts' }], violates: [] } };
    const { kept } = cutDrills(repo, aspect);
    const cut = kept.satisfies.map(c => c.rel).sort();
    assert.deepEqual(cut, ['src/honest.ts'], `a symlinked site was cut as a drill case: ${JSON.stringify(cut)}`);
    for (const c of kept.satisfies) assert.doesNotMatch(c.content, new RegExp(SECRET), `${c.rel} carries content from outside the repository`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('a site path that resolves outside the repository is not cut, however it is spelled', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'propose-hostile-esc-'));
  try {
    const repo = buildHostile(tmp);
    const escapes = [
      '../outside/stolen.ts',                      // one level up
      'src/../../outside/stolen.ts',               // up through a real directory
      resolve(tmp, 'outside', 'stolen.ts'),        // absolute
      'src/./../../outside/stolen.ts',             // with a no-op segment in the way
    ];
    for (const rel of escapes) {
      const { kept } = cutDrills(repo, { drills: { satisfies: [{ rel }], violates: [] } });
      assert.deepEqual(kept.satisfies, [], `a site outside the repository was cut: ${JSON.stringify(rel)}`);
    }
    // the control, in the same call shape: an ordinary site is still cut
    const { kept } = cutDrills(repo, { drills: { satisfies: [{ rel: 'src/honest.ts' }], violates: [] } });
    assert.equal(kept.satisfies.length, 1);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('every drill case a hostile repository can produce lands inside the aspect it belongs to', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'propose-hostile-write-'));
  try {
    const repo = buildHostile(tmp);
    // the write the renderer performs for each kept case, reproduced exactly: `<drills>/<label>/<c.rel>`
    const drills = join(tmp, 'out', '.yggdrasil', 'aspects', 'grain', 'x', 'y', 'drills');
    // one `..` is absorbed by the per-case label directory, so the escape that matters is a deeper one — this
    // is the same secret file, reached by climbing out of the repository twice and back down
    const deep = join('..', '..', basename(tmp), 'outside', 'stolen.ts');
    const sites = ['src/honest.ts', 'src/link.ts', '../outside/stolen.ts', deep, resolve(tmp, 'outside', 'stolen.ts')];
    assert.equal(readFileSync(resolve(repo, deep), 'utf8').includes(SECRET), true, 'the deep traversal must really reach the secret');
    const { kept } = cutDrills(repo, { drills: { satisfies: sites.map(rel => ({ rel })), violates: [] } });
    for (const c of kept.satisfies) {
      const dest = resolve(join(drills, `satisfies-${slug(c.rel)}`, c.rel));
      assert.ok(dest.startsWith(resolve(drills) + '/'), `a drill case would be written outside its own corpus: ${dest}`);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

// The reason the OTHER write sites need no containment check of their own: everything repository-derived that
// reaches a path goes through `slug` first, and `slug` cannot emit a separator, a dot, or a leading dash — so
// it can carry neither a traversal nor an argument that a subprocess would read as a flag.
test('slug cannot emit a path separator, a traversal, or a leading dash, whatever it is given', () => {
  const hostile = [
    '..', '../..', 'a/../../b', '/etc/passwd', 'C:\\windows', 'a\\b', '.', './.', '...',
    '--force', '-rf', '- -', '~/.ssh/id_rsa', 'a b', String.fromCharCode(0) + 'x', 'ünïcode', '日本語', '',
  ];
  for (const s of hostile) {
    const out = slug(s);
    assert.match(out, /^[a-z0-9-]+$/, `slug(${JSON.stringify(s)}) = ${JSON.stringify(out)}`);
    assert.doesNotMatch(out, /^-|-$/, `slug(${JSON.stringify(s)}) starts or ends with a dash: ${JSON.stringify(out)}`);
    assert.notEqual(out, '..');
  }
});

// The subprocess path. Every spawn in the renderer passes an argv ARRAY, never a shell string, so a repository
// cannot inject a command; what an argv array still permits is an argument that the callee reads as a FLAG.
// The one repository-derived value handed to a subprocess is the aspect id (`yg drill --aspect <id>`), and it
// is built entirely out of `slug` output joined by `/`.
test('an aspect id built from hostile repository names is never readable as a flag', () => {
  const hostile = ['--force', '-rf', '../../etc', '- -', '  '];
  for (const partition of hostile) {
    for (const arg of hostile) {
      const id = `grain/${slug(partition)}/candidate-${slug(arg)}`;
      assert.doesNotMatch(id, /^-/, `aspect id would be read as a flag: ${id}`);
      assert.match(id, /^grain\/[a-z0-9-]+\/[a-z0-9-]+$/, `aspect id is not the shape the write path assumes: ${id}`);
    }
  }
});

// And the sanity check on the fixture itself: the repository really is a repository, and the file the tests
// refuse to copy really is outside it.
test('the hostile fixture is a real repository whose secret really does sit outside it', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'propose-hostile-fixture-'));
  try {
    const repo = buildHostile(tmp);
    assert.equal(gitIn(repo, 'rev-parse', '--is-inside-work-tree').trim(), 'true');
    const tracked = gitIn(repo, 'ls-files').split(NL).filter(Boolean).sort();
    assert.deepEqual(tracked, ['src/honest.ts', 'src/link.ts']);
    assert.ok(!readdirSync(repo).includes('outside'), 'the secret is inside the repository, so the test proves nothing');
    assert.match(readFileSync(join(tmp, 'outside', 'stolen.ts'), 'utf8'), new RegExp(SECRET));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
