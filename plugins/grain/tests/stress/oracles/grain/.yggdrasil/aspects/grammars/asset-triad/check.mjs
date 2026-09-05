// grammars/asset-triad (enforced, errs: exact)
//
// For each grammar named by this directory, all three legs must be present: the compiled parser, its
// node-type metadata, and a manifest entry. The consequence of a missing leg is silence, not failure —
// the extension map drops any grammar whose parser or metadata is absent — so this is checked here
// rather than left to a runtime that will never complain.
//
// The compiled parsers are probed with an existence check rather than read from the subject set: the
// reviewer's file set carries text, and a parser is a binary. Probing one exact path per grammar (never
// listing the directory) keeps the invalidation surface to exactly the assets named here.

const MANIFEST = 'manifest.json';

export function check(ctx) {
  const violations = [];

  const nodeTypes = new Set();
  let manifestFile = null;
  let dir = 'the grammar directory';

  for (const file of ctx.files) {
    const base = file.path.split('/').pop();
    dir = file.path.split('/').slice(0, -1).join('/');
    if (base === MANIFEST) { manifestFile = file; continue; }
    const m = /^tree-sitter-(.+)\.node-types\.json$/.exec(base);
    if (m) nodeTypes.add(m[1]);
  }

  if (!manifestFile) {
    violations.push({
      message:
        `No ${MANIFEST} in ${dir}.\n` +
        `The manifest is the only record of which upstream package and version each asset was built ` +
        `from; without it a regeneration cannot be reproduced and a parser defect cannot be attributed.\n` +
        `Regenerate the grammar set so the manifest is written alongside the assets.`,
      line: 1,
      column: 0,
    });
    return violations;
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestFile.content);
  } catch (e) {
    violations.push({
      file: manifestFile.path,
      line: 1,
      column: 0,
      message:
        `${MANIFEST} is not valid JSON (${e.message}).\n` +
        `It is read to record which upstream version every shipped parser came from.\n` +
        `Regenerate the grammar set rather than repairing the file by hand.`,
    });
    return violations;
  }
  const declared = new Set(Object.keys(manifest));

  for (const g of [...new Set([...nodeTypes, ...declared])].sort()) {
    const legs = [];
    if (ctx.fs.exists(`${dir}/tree-sitter-${g}.wasm`) !== 'file') {
      legs.push(`the compiled parser (tree-sitter-${g}.wasm)`);
    }
    if (!nodeTypes.has(g)) legs.push(`its node-type metadata (tree-sitter-${g}.node-types.json)`);
    if (!declared.has(g)) legs.push(`a ${MANIFEST} entry`);
    if (legs.length === 0) continue;
    violations.push({
      file: manifestFile.path,
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
