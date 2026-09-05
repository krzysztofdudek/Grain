// A FILE-NAME RULE MAY NOT ARGUE WITH THE LANGUAGE (ticket 116, part 2).
//
// `auto.filenameshape` measures the shape of a file's name with its last extension removed. In Java every type
// is PascalCase and so is its file, which is exactly the rule the miner finds — and then `package-info.java`
// and `module-info.java` break it, because the Java Language Specification fixes those two names verbatim
// (§7.4.1 and §7.7): there is no other name they may have. Measured on spring-petclinic, five of the
// forty-four standing advisory refusals were `package-info.java` — a rule at odds with the language on the day
// it was proposed.
//
// The exempt names are a per-language FACT, so they hang off the same per-language binding the extension map
// is (`engine/config.mjs`), not off a threshold. An exempt file leaves the rule's population, leaves its drill
// corpus, is skipped by the rendered check, and the evidence line says how many left.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isLanguageMarkerFile } from '../engine/config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PROPOSE = join(here, 'stress', 'propose.mjs');

let tmp, repo, out;

const PKGS = ['owner', 'vet', 'visit', 'clinic', 'system'];
const TYPES = ['Service', 'Repository', 'Controller', 'Validator', 'Mapper'];

function buildFixture(root, env) {
  mkdirSync(root, { recursive: true });
  const w = (rel, content) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
  for (const p of PKGS) {
    for (const t of TYPES) {
      const cls = p[0].toUpperCase() + p.slice(1) + t;
      w(`src/main/java/app/${p}/${cls}.java`,
        `package app.${p};\n\nimport java.util.List;\n\npublic class ${cls} {\n` +
        `  public List<String> all() {\n    return List.of("${p}");\n  }\n` +
        `  public String one() {\n    return "${p}";\n  }\n}\n`);
    }
    // the name the language fixes, one per package — five in all
    w(`src/main/java/app/${p}/package-info.java`, `/** The ${p} package. */\npackage app.${p};\n`);
  }
  w('README.md', '# fixture\n');
  execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main'], { env });
  execFileSync('git', ['-C', root, 'add', '-A'], { env });
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'fixture'], { env });
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'propose-marker-'));
  repo = join(tmp, 'repo');
  out = join(tmp, 'proposal');
  const env = {
    ...process.env, HOME: tmp,
    GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
    GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z',
  };
  buildFixture(repo, env);
  const r = spawnSync('node', [PROPOSE, repo, out, '--no-history', '--quiet'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stderr);
});
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

const shapeAspects = () => JSON.parse(readFileSync(join(out, 'proposal.json'), 'utf8'))
  .evidence.filter(e => e.kind === 'aspect' && e.enumerator === 'filenameshape');

test('the exempt names are derived per language, from the same binding the extensions are', () => {
  for (const rel of ['src/main/java/app/owner/package-info.java', 'a/module-info.java', 'pkg/__init__.py',
    'pkg/__main__.py', 'x/doc.go', 'x/index.ts', 'x/index.tsx', 'x/index.mjs', 'x/mod.rs', 'x/lib.rs', 'x/main.rs']) {
    assert.equal(isLanguageMarkerFile(rel), true, rel);
  }
  // a name that merely looks like one, in a language that does not fix it
  for (const rel of ['x/index.java', 'x/doc.py', 'x/package-info.ts', 'x/mod.go', 'x/Owner.java', '.grain', 'README.md']) {
    assert.equal(isLanguageMarkerFile(rel), false, rel);
  }
});

test('a file-name rule exempts the names the language fixes, and says how many', () => {
  const aspects = shapeAspects();
  assert.ok(aspects.length > 0, 'the fixture mined no file-name shape rule at all');
  for (const a of aspects) {
    assert.match(a.evidence, /5 language marker files? exempted \(`package-info\.java`\)/, a.evidence);
    // the five that left are not counted among the sites that break the rule
    assert.ok(!/5 break it today/.test(a.evidence), a.evidence);
    assert.match(a.evidence, /holds for all 25 files in scope/, a.evidence);
  }
});

test('an exempt file is in no drill corpus', () => {
  for (const a of shapeAspects()) {
    const drills = join(out, '.yggdrasil', 'aspects', a.id, 'drills');
    if (!existsSync(drills)) continue;
    const walk = d => readdirSync(d, { withFileTypes: true })
      .flatMap(e => (e.isDirectory() ? walk(join(d, e.name)) : [e.name]));
    assert.ok(!walk(drills).includes('package-info.java'), `${a.id} drills on a file the language names for it`);
  }
});

test('the rendered check does not refuse a name the language fixes', async () => {
  const aspects = shapeAspects();
  const withCheck = aspects.filter(a => existsSync(join(out, '.yggdrasil', 'aspects', a.id, 'check.mjs')));
  assert.ok(withCheck.length > 0, 'no file-name shape rule rendered a deterministic check');
  for (const a of withCheck) {
    const { check } = await import(pathToFileURL(join(out, '.yggdrasil', 'aspects', a.id, 'check.mjs')).href);
    const files = [
      { path: 'src/main/java/app/owner/package-info.java', content: 'package app.owner;\n' },
      { path: 'src/main/java/app/owner/ownerService.java', content: 'class x {}\n' },
    ];
    const v = check({ files });
    assert.deepEqual(v.map(x => x.file), ['src/main/java/app/owner/ownerService.java'],
      `${a.id} refused a file whose name the language fixes`);
  }
});
