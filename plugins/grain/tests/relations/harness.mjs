// Shared harness for the relation-conformance tests (tests/relations/*.test.mjs — one file per case).
// Each test builds a minimal fixture tree in a temp directory (no git: the index runs in worktree mode),
// runs the real CLI (`grain export`), and asserts on the file→file edges the tri-state resolver bound.
// The cases are ported from the Yggdrasil relation e2e suites (same author, MIT); where Yggdrasil decided
// ownership against its declared node model, grain decides it against modules (directories) — a test that
// depended on node-ownership semantics says so in its own comment.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'grain.mjs');

/** Build the fixture, index it, return { edges, moduleGraph, dir }. Caller should rmSync(dir) via cleanup(). */
export function edgesOf(files) {
  const dir = mkdtempSync(join(tmpdir(), 'grain-rel-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  const r = spawnSync('node', [BIN, 'export', '--compact', '--no-anchors'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const line = (r.stdout || '').split('\n').find(l => l.startsWith('{'));
  assert.ok(line, 'export printed no JSON: ' + r.stdout + r.stderr);
  const d = JSON.parse(line);
  return { edges: d.edges || [], moduleGraph: d.moduleGraph, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function expectEdge(edges, from, to, kind = null) {
  const hit = edges.find(e => e.from === from && e.to === to && (kind === null || e.kind === kind));
  assert.ok(hit, `expected edge ${from} → ${to}${kind ? ' (' + kind + ')' : ''}; got: ${JSON.stringify(edges)}`);
}

export function forbidEdge(edges, from, to) {
  const hit = edges.find(e => e.from === from && e.to === to);
  assert.equal(hit, undefined, `forbidden edge ${from} → ${to} exists: ${JSON.stringify(hit)}`);
}
