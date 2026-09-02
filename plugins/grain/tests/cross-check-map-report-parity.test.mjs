// Cross-check: `map` and `report` are two different commands surfacing overlapping structural facts over the SAME
// model — class C territory, the fourth pair this instrument's task names. `map` is the terse, single-glance
// overview (§J4.3a/§J4.3b); `report` is the full, sectioned dump. Where they overlap, they must agree:
//
//   (1) DECISIONS: `map`'s single `decisions: N maintainer decision(s) in force` line is, by its own grain.mjs
//       definition (cmdMap: `(model.steers||[]).length + (model.boundaries||[]).length + (model.waivers||[]).length`),
//       the SUM of report's three separately-sectioned counts (`== boundaries — N ==`, `== steers — N ==`,
//       `== waivers — N ==`). Checked as a real arithmetic identity, not a re-statement of the source: this file
//       records three decisions of three DIFFERENT kinds via the real `decide` CLI (not model surgery) so the sum
//       is never 3×0 or a single kind trivially equal to the total.
//
//   (2) MODULE COUNT: `report`'s architecture header (`== architecture — N modules · ...==`) and `map`'s `layers:`
//       line (§J4.3a) both claim to describe the SAME `model.moduleGraph.nodes` set. `map`'s line truncates each
//       layer to 4 module names plus a "+K more" tail (mapSections, core.mjs) — this test reconstructs the total
//       named-or-counted module tally from that tail rather than assuming the visible names are the whole set, so
//       a real, non-doubly-capped fixture (more than 4 modules in a layer) is required to exercise the "+K more"
//       arithmetic at all, not just the trivial all-visible case cross-check-json-text.test.mjs's own map test
//       already covers.
//
// Note: `report --json` carries NO architecture/module data at all today (only `repo`/`partitions`/`asOf`) — a
// text/JSON gap of its own (pair 1's territory, not this pair's), so this file compares `map` and `report` TEXT
// output rather than JSON twins; recorded here for the lead to triage separately.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const wIn = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grainIn = (repo, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const initRepo = name => { const tmp = mkdtempSync(join(tmpdir(), name)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, {}, 'init', '-q', '-b', 'main'); gitIn(repo, {}, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };

let tmp, repo;
// 7 disjoint modules (mod0..mod6, no imports among them) so at least one layer holds MORE than 4 modules — forces
// mapSections' own "+K more" truncation, the exact arithmetic this file's test (2) must exercise, not just count
// the trivially-all-visible case.
const MODS = ['mod0', 'mod1', 'mod2', 'mod3', 'mod4', 'mod5', 'mod6'];
// enough decorated handler files for `src/handlers/` to actually become a real, indexed partition — with only ONE
// file, `decide steer`/`decide waive`'s scope lookup has no partition to search and either refuses ("no partition
// covers ...") or records the decision as permanently inert ("scope ... not found in HEAD") — discovered building
// this very fixture with just `Foo.ts` alone.
const HANDLERS = ['Foo', 'Bar', 'Baz', 'Qux', 'Quux', 'Corge', 'Grault', 'Garply', 'Waldo', 'Fred'];
before(() => {
  ({ tmp, repo } = initRepo('grain-xcheck-mapreport-'));
  for (const m of MODS) wIn(repo, `${m}/index.ts`, `export const ${m}Value = () => '${m}';\n`);
  wIn(repo, 'src/handlers/core.ts', `export function Injectable(): ClassDecorator {\n  return () => {};\n}\n`);
  for (const h of HANDLERS) wIn(repo, `src/handlers/${h}.ts`, `import { Injectable } from './core';\n\n@Injectable()\nexport class ${h}Handler {\n  handle(): void {}\n}\n`);
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  gitIn(repo, d1, 'add', '-A'); gitIn(repo, d1, 'commit', '-qm', 'base: 7 disjoint modules + 10 decorated handlers');
  assert.equal(grainIn(repo, ['status']).code, 0);

  // three decisions of three DIFFERENT kinds, via the real CLI — never model surgery — so the sum this file checks
  // is never a single kind trivially equal to the total
  const s = grainIn(repo, ['decide', 'steer', 'src/handlers/Foo.ts#FooHandler', '--surfaces', 'auto.deco:@Injectable', '--author', 'kd', '--note', 'xcheck steer']);
  assert.equal(s.code, 0, `fixture setup: decide steer failed: ${s.out}\n${s.err}`);
  const w = grainIn(repo, ['decide', 'waive', 'src/handlers/Foo.ts#FooHandler', '--on', 'auto.deco:@Injectable', '--author', 'kd', '--note', 'xcheck waiver']);
  assert.equal(w.code, 0, `fixture setup: decide waive failed: ${w.out}\n${w.err}`);
  const b = grainIn(repo, ['decide', 'boundary', 'mod0', '--never-imports', 'mod1', '--author', 'kd', '--note', 'xcheck boundary']);
  assert.equal(b.code, 0, `fixture setup: decide boundary failed: ${b.out}\n${b.err}`);
  const r = grainIn(repo, ['status']); // force a re-mine now (seeds.jsonl changed) so every test below hits an already-fresh cache
  assert.equal(r.code, 0, `fixture setup: warm-up grain status failed: ${r.out}\n${r.err}`);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

// ===== fixture soundness =====
test('fixture soundness: 3 decisions of 3 different kinds, and more than 4 modules in the leaf layer', () => {
  const rep = grainIn(repo, ['report']).out;
  assert.match(rep, /^== boundaries — 1 architecture decision\(s\)/m, rep);
  assert.match(rep, /^== steers — 1 maintainer decision\(s\)/m, rep);
  assert.match(rep, /^== waivers — 1 waiver\(s\)/m, rep);
  const m = grainIn(repo, ['map']).out;
  const layerLine = m.split('\n').find(l => l.startsWith('map: layers:'));
  assert.ok(layerLine, m);
  assert.match(layerLine, /\+\d+ more/, `expected at least one truncated ("+K more") layer segment: ${layerLine}`);
});

// ===== (1) DECISIONS: map's single total equals the sum of report's 3 separately-sectioned counts =====
test('map: `decisions: N` equals the SUM of report\'s boundaries + steers + waivers counts', () => {
  const rep = grainIn(repo, ['report']).out;
  const nb = /^== boundaries — (\d+) architecture decision\(s\)/m.exec(rep);
  const ns = /^== steers — (\d+) maintainer decision\(s\)/m.exec(rep);
  const nw = /^== waivers — (\d+) waiver\(s\)/m.exec(rep);
  assert.ok(nb && ns && nw, `expected all three sections in report: ${rep}`);
  const sum = +nb[1] + +ns[1] + +nw[1];
  const mp = grainIn(repo, ['map']).out;
  const dm = /^decisions: (\d+) maintainer decision\(s\) in force$/m.exec(mp);
  assert.ok(dm, mp);
  assert.equal(+dm[1], sum, `map says ${dm[1]} decisions; report's boundaries(${nb[1]}) + steers(${ns[1]}) + waivers(${nw[1]}) = ${sum}`);
});

// ===== (2) MODULE COUNT: report's architecture header vs map's layers tally (reconstructed through "+K more") =====
test('map: the total module count implied by `layers:` (visible names + every "+K more" tail) equals report\'s architecture header module count', () => {
  const rep = grainIn(repo, ['report']).out;
  const hm = /^== architecture — (\d+) modules · \d+ directed dependencies · \d+ cycle\(s\) ==/m.exec(rep);
  assert.ok(hm, rep);
  const mp = grainIn(repo, ['map']).out;
  const layerLine = mp.split('\n').find(l => l.startsWith('map: layers:'));
  assert.ok(layerLine, mp);
  const segs = [...layerLine.matchAll(/layer \d+(?: \(leaves\))?: ([^·]+?)(?= · |$)/g)];
  assert.ok(segs.length >= 1, `expected at least one layer segment: ${layerLine}`);
  let total = 0;
  for (const seg of segs) {
    const body = seg[1].trim();
    const more = /,?\s*\+(\d+) more$/.exec(body);
    if (more) {
      const visible = body.slice(0, more.index).split(',').map(s => s.trim()).filter(Boolean);
      total += visible.length + +more[1];
    } else {
      total += body.split(',').map(s => s.trim()).filter(Boolean).length;
    }
  }
  assert.equal(total, +hm[1], `map's layers: line implies ${total} modules (visible + "+K more" tails); report's architecture header says ${hm[1]}: layers="${layerLine}", report header="${hm[0]}"`);
});
