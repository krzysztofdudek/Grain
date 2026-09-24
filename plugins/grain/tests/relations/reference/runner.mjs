// The relation reference-case runner: Yggdrasil's name-resolution catalogue (reference/relations/<language>/<id>.md,
// copied here verbatim beside this file — same author, MIT) run through GRAIN's own relation pipeline, never a copy
// of it. Each case's `## Files` are written into a temporary repository; every file grain parses is parsed by grain's
// parser, its relation facts taken by `relFactsFor` exactly as the index takes them, and the whole tree resolved by
// `applyRelationLayer` (arch.mjs) — the same call the index makes (package roots, JVM source roots, Vue/Svelte
// components; the vendored resolvers read tsconfig, package.json, Cargo.toml, go.mod/go.work, composer.json, pyproject,
// compile_commands.json and .csproj from the case's own files). The resulting file→file edges are then read the way
// the catalogue writes its expectations: a file belongs to node `<basename of its directory>`, and a case's `## Expect`
// is the exact set of cross-node edges `file:line -> node:<id>` (or `silence`).
//
// Grain's edges are per (target file, kind), carrying the FIRST line that references the target, so the runner
// compares, per (from file, target node), the earliest expected line with the earliest resolved line.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFile } from '../../../engine/parse.mjs';
import { relFactsFor, sfcRelations } from '../../../engine/relations.mjs';
import { applyRelationLayer } from '../../../engine/arch.mjs';
import { findPackageRoots } from '../../../engine/partition.mjs';
import { langExt, CODE_RE } from '../../../engine/base.mjs';
import { EXT2GRAMMAR } from '../../../engine/config.mjs';

export const CATALOGUE = dirname(fileURLToPath(import.meta.url));

function sectionBody(body, name) {
  const start = new RegExp(`(^|\\n)##\\s+${name}\\s*\\n`).exec(body);
  if (!start) throw new Error(`missing section ## ${name}`);
  const rest = body.slice(start.index + start[0].length);
  const next = /\n##\s+/.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

export function loadCase(language, id) {
  const text = readFileSync(join(CATALOGUE, language, `${id}.md`), 'utf8');
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) throw new Error(`${id}: no frontmatter`);
  const body = text.slice(fm[0].length);
  const files = [];
  const fence = /```[a-zA-Z+]*\s+path=([^\s`]+)\n([\s\S]*?)```/g;
  const filesSection = sectionBody(body, 'Files');
  let m;
  while ((m = fence.exec(filesSection)) !== null) files.push({ path: m[1].trim(), code: m[2] });
  const edges = [];
  let silence = false;
  for (const raw of sectionBody(body, 'Expect').split('\n')) {
    let line = raw.trim();
    if (line.startsWith('-')) line = line.slice(1).trim();
    const s = line.replace(/#.*$/, '').trim();
    if (s === '') continue;
    if (s === 'silence') {
      silence = true;
      continue;
    }
    const e = /^(\S+):(\d+)\s*->\s*node:(\S+)$/.exec(s);
    if (!e) throw new Error(`${id}: unparseable ## Expect line '${raw.trim()}'`);
    edges.push({ from: e[1], line: Number(e[2]), node: e[3] });
  }
  return { id, language, files, edges, silence };
}

export const caseIds = language =>
  readdirSync(join(CATALOGUE, language))
    .filter(f => f.endsWith('.md'))
    .map(f => f.slice(0, -3))
    .sort();

const nodeOf = p => {
  const segs = p.split('/');
  return segs.length >= 2 ? segs[segs.length - 2] : '';
};

/** Run one case through grain's pipeline; returns { expected, actual } maps `from -> node` → earliest line. */
export async function resolveCase(c) {
  const root = mkdtempSync(join(tmpdir(), 'grain-refcase-'));
  try {
    for (const f of c.files) {
      mkdirSync(join(root, dirname(f.path)), { recursive: true });
      writeFileSync(join(root, f.path), f.code);
    }
    const allPaths = c.files.map(f => posix.normalize(f.path)).sort();
    const files = allPaths.filter(p => CODE_RE.test(p) && EXT2GRAMMAR[langExt(p)]);
    const relFacts = {};
    for (const rel of files) {
      const src = readFileSync(join(root, rel), 'utf8');
      const { p, tree } = await parseFile(langExt(rel), src);
      // through JSON, as the tree cache stores relation facts: a case must hold for facts read back from a warm cache
      relFacts[rel] = JSON.parse(JSON.stringify(relFactsFor(rel, src, tree, p._g)));
      tree.delete();
    }
    const sfc = await sfcRelations(root, { allPaths }); // as learn does: components join the relation universe
    for (const [rel, f] of Object.entries(sfc.facts)) relFacts[rel] = JSON.parse(JSON.stringify(f));
    const model = {};
    const relFiles = [...files, ...sfc.files].sort();
    applyRelationLayer(model, { root, files: relFiles, pkgs: findPackageRoots(root, allPaths), tree: { allPaths }, relFacts, log: () => {} });
    const actual = new Map();
    for (const e of model.edges || []) {
      const node = nodeOf(e.to);
      if (node === nodeOf(e.from)) continue;
      const k = `${e.from} -> ${node}`;
      if (!actual.has(k) || e.line < actual.get(k)) actual.set(k, e.line);
    }
    const expected = new Map();
    for (const e of c.edges) {
      const k = `${e.from} -> ${e.node}`;
      if (!expected.has(k) || e.line < expected.get(k)) expected.set(k, e.line);
    }
    return { expected, actual };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const show = m => [...m].map(([k, l]) => `${k}:${l}`).join(', ') || 'none';

export async function runCase(language, id) {
  const c = loadCase(language, id);
  const { expected, actual } = await resolveCase(c);
  for (const [k, line] of expected) {
    assert.ok(actual.has(k), `${id}: expected edge ${k} (line ${line}) not resolved; got ${show(actual)}`);
    assert.equal(actual.get(k), line, `${id}: edge ${k} resolved from line ${actual.get(k)}, expected line ${line}`);
  }
  for (const k of actual.keys()) assert.ok(expected.has(k), `${id}: unexpected cross-node edge ${k}; expected ${show(expected)}`);
}
