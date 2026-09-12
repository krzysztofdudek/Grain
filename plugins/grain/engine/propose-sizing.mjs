// grain engine · proposal writer · sizing.json — what the graph costs to review
// Split out of propose.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expandMapping } from './yggdrasil-graph.mjs';

function scopeCountsFromTreeCache(repo) {
  const treePath = join(repo, '.grain', 'cache', 'tree.json');
  if (!existsSync(treePath)) return null;
  let tree;
  try { tree = JSON.parse(readFileSync(treePath, 'utf8')); } catch { return null; }
  const byFile = new Map();
  for (const [k, v] of Object.entries(tree)) {
    const rel = k.slice(k.indexOf('|') + 1);
    const n = (Array.isArray(v) ? v : v.s || []).length;
    byFile.set(rel, (byFile.get(rel) || 0) + n);
  }
  return byFile;
}
export function computeSizing(repo, nodes, handGraph, handFiles) {
  const scopesByFile = scopeCountsFromTreeCache(repo);
  const bytesOf = rel => { try { return statSync(join(repo, rel)).size; } catch { return 0; } };
  const linesOf = rel => { try { return readFileSync(join(repo, rel), 'utf8').split('\n').length; } catch { return 0; } };
  const sizeOf = fileSet => {
    let bytes = 0, codelengthLines = 0, scopes = 0, files = 0;
    for (const rel of fileSet) {
      files++;
      bytes += bytesOf(rel);
      codelengthLines += linesOf(rel);
      if (scopesByFile?.has(rel)) scopes += scopesByFile.get(rel);
    }
    return { files, bytes, codelengthLines, scopes: scopesByFile ? scopes : null };
  };
  const proposedNodes = nodes.filter(n => !n.organizational).map(n => ({ id: n.id, dir: n.dir, ...sizeOf(n.ownFiles) }));
  let handNodes = null;
  if (handGraph) {
    handNodes = handGraph.nodes.filter(n => Array.isArray(n.mapping) && n.mapping.length).map(n => {
      const set = expandMapping(n.mapping, handFiles, { root: repo, pathCache: new Map(), contentCache: new Map(), headCache: new Map() });
      return { id: n.id, ...sizeOf(set) };
    });
  }
  return {
    instrument: 'sizing/1',
    contextBudgetTokens: 200000,
    contextBudgetSource: 'external constant (Anthropic\'s published context window for Sonnet/Opus) — not measured, not tuned, not a Grain number',
    scopesAvailable: !!scopesByFile,
    proposedNodes, handNodes,
  };
}

// ==================================================================================================
// 8. The renderer.
// ==================================================================================================

// ---- the four file sets `propose` writes, each in its own function ----
//
// `propose` below reads its inputs, builds the model, and then writes three things: the architecture, the
// nodes, and the aspects with their drill corpora. Those three are what the section comments
// have always called them; they are functions here so the pipeline reads as the five steps it is rather than
// as one page of interleaved writes. Every body is unchanged, and `ev` — the one shared piece of state, the
// evidence recorder — is passed in rather than closed over, so each function's whole effect is in its
// signature: the directory it writes into, what it needs, and the counts it hands back.
