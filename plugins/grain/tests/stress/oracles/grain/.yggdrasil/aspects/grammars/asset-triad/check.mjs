// grammars/asset-triad (enforced, errs: exact)
//
// For each grammar named by this directory or by the manifest, all three legs must be present: the
// compiled parser, its node-type metadata, and a manifest entry. The consequence of a missing leg is
// silence, not failure — the extension map drops any grammar whose parser or metadata is absent — so this
// is checked here rather than left to a runtime that will never complain.
//
// The manifest is the Runes grammar manifest (`runes-grammars/1`), vendored with the Runes copy rather than
// kept beside the assets: one entry per grammar in `grammars[]`, named by its `wasmFile`. It is read through
// the relation this node declares to the vendored copy.
//
// The compiled parsers are probed with an existence check rather than read from the subject set: the
// reviewer's file set carries text, and a parser is a binary. Probing one exact path per grammar (never
// listing the directory) keeps the invalidation surface to exactly the assets named here.

const MANIFEST = 'plugins/grain/engine/vendor/runes/grammars/manifest.json';

export function check(ctx) {
  const violations = [];

  const nodeTypes = new Set();
  let dir = 'plugins/grain/engine/grammars';

  for (const file of ctx.files) {
    const base = file.path.split('/').pop();
    const m = /^tree-sitter-(.+)\.node-types\.json$/.exec(base);
    if (!m) continue;
    dir = file.path.split('/').slice(0, -1).join('/');
    nodeTypes.add(m[1]);
  }

  let text;
  try {
    text = ctx.fs.read(MANIFEST);
  } catch {
    violations.push({
      message:
        `No grammar manifest at ${MANIFEST}.\n` +
        `The manifest is the only record of which upstream commit each asset was built from and what its bytes ` +
        `must hash to; without it a regeneration cannot be reproduced and a parser defect cannot be attributed.\n` +
        `Restore the vendored Runes copy with \`npm run runes:update\`.`,
      line: 1,
      column: 0,
    });
    return violations;
  }

  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (e) {
    violations.push({
      file: MANIFEST,
      line: 1,
      column: 0,
      message:
        `The grammar manifest is not valid JSON (${e.message}).\n` +
        `It is read to record which upstream commit every shipped parser came from.\n` +
        `Restore the vendored Runes copy rather than repairing the file by hand.`,
    });
    return violations;
  }
  const declared = new Set(
    (Array.isArray(manifest.grammars) ? manifest.grammars : [])
      .map(g => /^tree-sitter-(.+)\.wasm$/.exec(String(g && g.wasmFile))?.[1])
      .filter(Boolean)
  );

  for (const g of [...new Set([...nodeTypes, ...declared])].sort()) {
    const legs = [];
    if (ctx.fs.exists(`${dir}/tree-sitter-${g}.wasm`) !== 'file') {
      legs.push(`the compiled parser (tree-sitter-${g}.wasm)`);
    }
    if (!nodeTypes.has(g)) legs.push(`its node-type metadata (tree-sitter-${g}.node-types.json)`);
    if (!declared.has(g)) legs.push('a grammar manifest entry');
    if (legs.length === 0) continue;
    violations.push({
      file: MANIFEST,
      line: 1,
      column: 0,
      message:
        `Grammar '${g}' is incomplete — missing ${legs.join(' and ')}.\n` +
        `A grammar missing its parser or its metadata is dropped from the extension map in silence: ` +
        `files in that language simply stop being analysed and nothing says so. A grammar missing its ` +
        `manifest entry has no recorded provenance.\n` +
        `Regenerate the grammar set, or remove the leftover assets for '${g}' entirely.`,
    });
  }

  return violations;
}
