// release/one-plugin-description (enforced, errs: exact)
//
// The plugin's description must be byte-identical across the three per-host plugin manifests and the
// four marketplace catalogues. A host shows it at install time and a model reads it to learn that these
// commands exist at all, so seven hand-edited copies drift into seven slightly different products.
//
// This check runs on the marketplace node and reads the plugin manifests through a declared relation:
// somebody has to hold both sets, and the catalogue is the outward-facing one.

const PLUGIN_MANIFESTS = [
  'plugins/grain/.claude-plugin/plugin.json',
  'plugins/grain/.codex-plugin/plugin.json',
  'plugins/grain/.cursor-plugin/plugin.json',
];

function parse(where, text, violations) {
  try {
    return JSON.parse(text);
  } catch (e) {
    violations.push({
      file: where,
      line: 1,
      column: 0,
      message:
        `Manifest is not valid JSON (${e.message}).\n` +
        `A host reads this file to list and install the plugin; an unparseable one fails the install ` +
        `rather than the build.\n` +
        `Fix the JSON.`,
    });
    return null;
  }
}

export function check(ctx) {
  const violations = [];
  const seen = []; // { where, description }

  for (const file of ctx.files) {
    const parsed = parse(file.path, file.content, violations);
    if (!parsed) continue;
    const entries = Array.isArray(parsed.plugins) ? parsed.plugins : [];
    entries.forEach((p, i) => {
      if (typeof p?.description === 'string') {
        seen.push({ where: `${file.path} (plugins[${i}])`, description: p.description });
      }
    });
  }

  for (const path of PLUGIN_MANIFESTS) {
    let text;
    try {
      text = ctx.fs.read(path);
    } catch {
      violations.push({
        message:
          `Cannot read the plugin manifest at ${path}.\n` +
          `The description has to agree between the catalogues and the manifests, so both sets must be ` +
          `readable from wherever the comparison lives.\n` +
          `Declare a relation from the marketplace node to the plugin-manifest node, or fix the path.`,
        line: 1,
        column: 0,
      });
      continue;
    }
    const parsed = parse(path, text, violations);
    if (parsed && typeof parsed.description === 'string') {
      seen.push({ where: path, description: parsed.description });
    }
  }

  const distinct = [...new Set(seen.map((s) => s.description))];
  if (distinct.length <= 1) return violations;

  const groups = distinct.map((d) => {
    const wheres = seen.filter((s) => s.description === d).map((s) => s.where);
    return `  · ${wheres.length} file(s) — ${wheres.join(', ')}\n    "${d.slice(0, 90)}${d.length > 90 ? '…' : ''}"`;
  });

  violations.push({
    line: 1,
    column: 0,
    message:
      `The plugin description differs across ${seen.length} places (${distinct.length} distinct texts):\n` +
      groups.join('\n') +
      `\nA host shows this at install time and a model reads it to learn these commands exist; different ` +
      `copies mean a user installing from one catalogue is promised something a user installing from ` +
      `another is not.\n` +
      `Make every copy byte-identical to the one that is correct.`,
  });

  return violations;
}
