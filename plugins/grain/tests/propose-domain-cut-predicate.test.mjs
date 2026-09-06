// A DOMAIN CUT IS A PREDICATE, NOT A GUEST LIST (ticket 116, part 1).
//
// The finer cuts grain finds inside a proposed type — `owner`, `vet`, `model` on spring-petclinic — were offered
// as an `any_of` of the exact paths grain had seen. That membership is exact today and dead tomorrow: it
// classifies no file grain has not already seen, so every file added to the domain lands outside its own type,
// and nothing downstream can cut a second node and a second owner out of it. Almost always those members all
// live under one directory, and then the same membership is a `path:` glob over that directory — a predicate
// that generalises.
//
// This test takes the offer at its word: it puts the domain to work in a staged copy of the repository, adds a
// file grain has never seen under the domain directory, and asks the real Yggdrasil CLI who owns it.
//
// The domain has TWO places it can land, and ticket 116 is about the SHAPE of the membership, which has to be a
// path predicate in either. It is a finer-type CANDIDATE in `alternatives.md` when the domain directory is not a
// module of its own — the case the ticket was written from. It is an ACTIVE node type in `yg-architecture.yaml`
// when it is: a JVM source root (§113) cuts modules at the package, so a Java package IS a module and grain
// publishes it directly, already carrying the `path:` predicate. Then there is nothing to activate — which is
// the same guarantee, arrived at one step earlier — and this test asks the same question of the active type.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './stress/reconstruct.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PROPOSE = join(here, 'stress', 'propose.mjs');
const YG_BIN = process.env.YG_BIN || '/home/user/Yggdrasil/source/cli/dist/bin.js';
const HAVE_YG = existsSync(YG_BIN);

let tmp, repo, out, env;

const PKGS = ['owner', 'vet', 'visit', 'clinic', 'system'];
const TYPES = ['Service', 'Repository', 'Controller', 'Validator', 'Mapper'];

function javaClass(pkg, name) {
  return `package app.${pkg};\n\nimport java.util.List;\n\npublic class ${name} {\n` +
    `  public List<String> all() {\n    return List.of("${pkg}");\n  }\n` +
    `  public String one() {\n    return "${pkg}";\n  }\n}\n`;
}

function buildFixture(root) {
  mkdirSync(root, { recursive: true });
  const w = (rel, content) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
  for (const p of PKGS) for (const t of TYPES) w(`src/main/java/app/${p}/${p[0].toUpperCase() + p.slice(1)}${t}.java`, javaClass(p, `${p[0].toUpperCase() + p.slice(1)}${t}`));
  w('README.md', '# fixture\n');
  execFileSync('git', ['-C', root, 'init', '-q', '-b', 'main'], { env });
  execFileSync('git', ['-C', root, 'add', '-A'], { env });
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'fixture'], { env });
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'propose-domain-'));
  repo = join(tmp, 'repo');
  out = join(tmp, 'proposal');
  env = {
    ...process.env, HOME: tmp,
    GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
    GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z',
  };
  buildFixture(repo);
  const r = spawnSync('node', [PROPOSE, repo, out, '--no-history', '--quiet'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  assert.equal(r.status, 0, r.stderr);
});
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

// The one domain this test drives: `owner`, whose members all live under one package. Read wherever grain put
// it — an active node type first, a finer-type candidate otherwise — and report which, so the assertions below
// can hold the right form to account without either shape being able to pass by silently disappearing.
const DOMAIN_DIR = 'src/main/java/app/owner';
const DOMAIN_GLOB = `${DOMAIN_DIR}/**`;

const ownerDomain = () => {
  const archText = readFileSync(join(out, '.yggdrasil', 'yg-architecture.yaml'), 'utf8');
  const arch = parseYaml(archText);
  for (const [id, t] of Object.entries(arch.node_types || {})) {
    if (!t || !t.when || t.when.path !== DOMAIN_GLOB) continue;
    // the `# evidence:` comment grain writes directly under the type id
    const ev = new RegExp(`^  ${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\n\\s*# ([^\\n]*)`, 'm').exec(archText);
    return { form: 'active', id, when: t.when, why: ev ? ev[1] : '' };
  }
  const md = readFileSync(join(out, 'alternatives.md'), 'utf8');
  const alts = [...md.matchAll(/^### `([^`]+)`\n\n```yaml\n([\s\S]*?)\n```\n\n([^\n]+)/gm)]
    .map(m => ({ id: m[1], yaml: m[2], why: m[3] }));
  const of = id => (new RegExp(`^\\|\\s*\`${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\`\\s*\\|\\s*\`([^\`]+)\``, 'm').exec(md) || [])[1];
  // the MEMBERSHIP candidate (the `-path`/`-list` pair this ticket is about), not the `-content` regex form
  const a = alts.find(x => /owner/.test(x.id) && !/-content$/.test(x.id));
  assert.ok(a, `the \`owner\` domain is neither an active type with a \`${DOMAIN_GLOB}\` predicate nor a candidate; candidates: ${alts.map(x => x.id).join(', ') || '(none)'}`);
  return { form: 'candidate', ...a, of: of(a.id) };
};

test('a domain whose members share a directory is a path predicate, not a file list, and says why', () => {
  const a = ownerDomain();
  if (a.form === 'active') {
    // published as a type in its own right: the predicate is already law, and its evidence is the measured
    // selection — the same guarantee the candidate below only offers
    assert.deepEqual(a.when, { path: DOMAIN_GLOB }, JSON.stringify(a.when));
    assert.match(a.why, new RegExp('`' + DOMAIN_GLOB.replace(/[*/]/g, ch => '\\' + ch) + '` selects \\d+ of \\d+ tracked files'), a.why);
    return;
  }
  assert.match(a.yaml, /path: "?src\/main\/java\/app\/owner\/\*\*"?/, a.yaml);
  assert.ok(!/any_of/.test(a.yaml), `the domain is still frozen as a file list:\n${a.yaml}`);
  assert.match(a.why, /all \d+ files share the directory `src\/main\/java\/app\/owner`/, a.why);
  assert.match(a.why, /GENERALISES/, a.why);
});

test('a domain whose members share no directory below the host is still offered as a list, and says why', async () => {
  // buildTypes is the unit that decides; drive it with a group whose files are scattered, and one whose are not.
  const { buildTypes } = await import('./stress/propose.mjs');
  const files = ['src/a/one.ts', 'src/b/two.ts', 'src/c/three.ts', 'src/d/four.ts', 'src/dom/x.ts', 'src/dom/y.ts', 'src/dom/z.ts'];
  const exp = { partitions: [{ name: 'src', files: 7, groups: [], directories: [] }] };
  const loc = {
    partitions: [{ level: 'partition', name: 'src', part: exp.partitions[0], files: new Set(files) }],
    directories: [],
    groups: [
      { level: 'group', name: 'src::scattered', part: exp.partitions[0], group: { id: 'scattered', label: 'scattered', members: files.slice(0, 4).map(rel => ({ rel })) }, files: new Set(files.slice(0, 4)) },
      { level: 'group', name: 'src::dom', part: exp.partitions[0], group: { id: 'dom', label: 'dom', members: files.slice(4).map(rel => ({ rel })) }, files: new Set(files.slice(4)) },
    ],
  };
  const ctx = { root: repo, pathCache: new Map(), contentCache: new Map(), headCache: new Map(), unknownWhenKeys: new Set(), parsed: new Set(files) };
  const { alternatives } = buildTypes(exp, loc, files, ctx);
  const scattered = alternatives.find(a => /scattered/.test(a.id));
  const dom = alternatives.find(a => /-dom-/.test(a.id) || /dom-path$|dom-list$/.test(a.id));
  assert.ok(scattered && dom, alternatives.map(a => a.id).join(', '));
  assert.equal(scattered.form, 'list', 'a scattered group has no path expression to offer');
  assert.match(scattered.why, /share no directory below `src`/);
  assert.equal(dom.form, 'path');
  assert.deepEqual(dom.when, { path: 'src/dom/**' });
});

test('the predicate classifies a file grain never saw', { skip: HAVE_YG ? false : `Yggdrasil CLI not found at ${YG_BIN} (set YG_BIN)` }, () => {
  const stage = join(tmp, 'stage');
  mkdirSync(stage, { recursive: true });
  for (const rel of execFileSync('git', ['-C', repo, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)) {
    const dst = join(stage, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(join(repo, rel), dst);
  }
  cpSync(join(out, '.yggdrasil'), join(stage, '.yggdrasil'), { recursive: true });

  const a = ownerDomain();
  // The type whose name must come back for the fresh file. When the domain is already an ACTIVE type there is
  // nothing to activate — the staged graph is used exactly as grain wrote it, which is the same guarantee one
  // step earlier. When it is a CANDIDATE, activate it exactly as alternatives.md tells a maintainer to: paste
  // its `when` in as a new type under the host, and give it a node.
  let expectType = a.id;
  if (a.form === 'candidate') {
    expectType = 'owner-domain';
    const archPath = join(stage, '.yggdrasil', 'yg-architecture.yaml');
    const arch = readFileSync(archPath, 'utf8');
    const host = a.of;
    assert.ok(host, `could not read the candidate's host type from alternatives.md`);
    writeFileSync(archPath, arch +
      '\n  owner-domain:\n' +
      '    description: "The owner domain — activated from a grain candidate. A file placed here is classified here."\n' +
      `    ${a.yaml.replace(/\n/g, '\n    ')}\n` +
      `    parents: ["project", "module", "${host}"]\n`);
    const nodeDir = join(stage, '.yggdrasil', 'model', 'owner-domain');
    mkdirSync(nodeDir, { recursive: true });
    writeFileSync(join(nodeDir, 'yg-node.yaml'),
      'name: owner-domain\ntype: owner-domain\ndescription: "The owner domain, cut from grain\'s own candidate."\n' +
      `mapping:\n  - "${DOMAIN_DIR}/"\n`);
  }

  // a file grain has NEVER seen, in the domain
  const fresh = `${DOMAIN_DIR}/OwnerScheduler.java`;
  writeFileSync(join(stage, fresh), javaClass('owner', 'OwnerScheduler'));

  const r = spawnSync('node', [YG_BIN, 'check'], { cwd: stage, encoding: 'utf8', maxBuffer: 1 << 26 });
  const text = (r.stdout || '') + (r.stderr || '');
  assert.match(text, /yg check: \w+[^\n]*?\d+ nodes/, `the graph did not load:\n${text.slice(0, 3000)}`);
  assert.ok(!/\b(architecture-invalid|type-when-mismatch|node-invalid|yaml-[a-z-]+|schema-[a-z-]+)\b/.test(text),
    `the domain type broke the graph:\n${text}`);

  const c = spawnSync('node', [YG_BIN, 'context', '--file', fresh], { cwd: stage, encoding: 'utf8', maxBuffer: 1 << 26 });
  const ctext = (c.stdout || '') + (c.stderr || '');
  assert.ok(ctext.includes(expectType),
    `a new file under the domain was not classified by \`${expectType}\` (${a.form}):\n${ctext.slice(0, 3000)}`);
});
