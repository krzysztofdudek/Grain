// grammars/extension-map-bijection (enforced, errs: exact)
//
// The set of grammars shipped as assets and the set of grammars named by the extension map must be
// equal. The map is read from the constant table, which this component reaches through a declared
// relation; reading that one file (rather than listing a directory) keeps the invalidation surface to
// exactly the two things the rule is about.
//
// A shipped grammar is identified by its node-type metadata, which is text and therefore in the subject
// set, and confirmed by probing for its compiled parser — the parser is a binary and the reviewer's
// file set carries text.
//
// The map is parsed out of the source text rather than imported, because a check must not execute
// product code to decide a verdict about it.

const CONFIG = 'plugins/grain/engine/config.mjs';

export function check(ctx) {
  const violations = [];

  const shipped = new Set();
  let dir = '';
  for (const file of ctx.files) {
    const base = file.path.split('/').pop();
    dir = file.path.split('/').slice(0, -1).join('/');
    const m = /^tree-sitter-(.+)\.node-types\.json$/.exec(base);
    if (m) shipped.add(m[1]);
  }
  for (const g of [...shipped]) {
    if (ctx.fs.exists(`${dir}/tree-sitter-${g}.wasm`) !== 'file') shipped.delete(g);
  }

  let source;
  try {
    source = ctx.fs.read(CONFIG);
  } catch {
    violations.push({
      message:
        `Cannot read the constant table at ${CONFIG}.\n` +
        `This rule compares the shipped grammar assets against the one extension map the product ` +
        `declares, so it needs to read that file.\n` +
        `Declare a relation from the grammar-asset component to the constant-table component, or fix ` +
        `the path.`,
      line: 1,
      column: 0,
    });
    return violations;
  }

  const block = /ALL_EXT2GRAMMAR\s*=\s*\{([\s\S]*?)\n\}\s*;/.exec(source);
  if (!block) {
    violations.push({
      file: CONFIG,
      line: 1,
      column: 0,
      message:
        `The extension map could not be located in the constant table.\n` +
        `This rule reads the map from the source text instead of importing it, because a check must not ` +
        `execute product code to reach a verdict about that code.\n` +
        `If the map was renamed or restructured, update this rule to match — do not delete it.`,
    });
    return violations;
  }

  const mapped = new Set([...block[1].matchAll(/:\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]));

  for (const g of [...shipped].sort()) {
    if (mapped.has(g)) continue;
    violations.push({
      file: CONFIG,
      line: 1,
      column: 0,
      message:
        `Grammar '${g}' is shipped but no file extension maps to it.\n` +
        `It is dead weight in every install, and a user who sees the parser in the package reasonably ` +
        `believes the language is covered when nothing will ever be parsed with it.\n` +
        `Add the extensions it serves to the map, or delete the grammar's assets.`,
    });
  }

  for (const g of [...mapped].sort()) {
    if (shipped.has(g)) continue;
    violations.push({
      file: CONFIG,
      line: 1,
      column: 0,
      message:
        `The extension map names grammar '${g}', which is not shipped complete.\n` +
        `The map filters itself at load time to grammars whose parser and metadata both exist, so this ` +
        `entry disappears without a word: files in that language stop being analysed with no error and ` +
        `no warning.\n` +
        `Ship the grammar's assets, or remove its extensions from the map.`,
    });
  }

  return violations;
}
