// release/single-version-of-record (enforced, errs: exact)
//
// The package manifest, the three per-host plugin manifests and the engine version constant must all
// carry the same version string. Five places, one meaning, and nothing at runtime compares them — while
// the engine constant is simultaneously one of the keys that decides whether a stored index is stale.
//
// The constant is read out of the source text rather than imported: a check must not execute product
// code to reach a verdict about it.

const CONFIG = 'plugins/grain/engine/config.mjs';

export function check(ctx) {
  const violations = [];
  const seen = []; // { where, version }

  for (const file of ctx.files) {
    if (!file.path.endsWith('.json')) continue;
    if (file.path.endsWith('package-lock.json')) continue; // generated from the manifest beside it
    if (file.path.endsWith('.mcp.json')) continue; // declares a server, carries no version
    let parsed;
    try {
      parsed = JSON.parse(file.content);
    } catch (e) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message:
          `Manifest is not valid JSON (${e.message}).\n` +
          `A host reads this file to decide what the plugin is called and which version it has; an ` +
          `unparseable one fails the install rather than the build.\n` +
          `Fix the JSON.`,
      });
      continue;
    }
    if (typeof parsed.version === 'string') seen.push({ where: file.path, version: parsed.version });
  }

  let constant;
  try {
    const m = /ENGINE_VERSION\s*=\s*'([^']+)'/.exec(ctx.fs.read(CONFIG));
    if (m) {
      constant = m[1];
      seen.push({ where: CONFIG + ' (the engine version constant)', version: m[1] });
    }
  } catch {
    violations.push({
      message:
        `Cannot read the engine version constant from ${CONFIG}.\n` +
        `It is one of the five places the version is written and the one the running product reports, ` +
        `so it has to be part of the comparison.\n` +
        `Declare a relation from the manifest node to the constant-table node, or fix the path.`,
      line: 1,
      column: 0,
    });
  }

  if (constant === undefined && seen.length === 0) return violations;

  const distinct = [...new Set(seen.map((s) => s.version))];
  if (distinct.length <= 1) return violations;

  violations.push({
    file: seen[0].where.endsWith('.mjs') ? undefined : seen[0].where,
    line: 1,
    column: 0,
    message:
      `The version disagrees across ${seen.length} places: ` +
      seen.map((s) => `${s.where} = ${s.version}`).join('; ') +
      `.\nThe engine constant is also one of the keys that decides whether a stored index is stale, and ` +
      `it is what the running product reports. A package that says one version while the engine says ` +
      `another produces a defect report nobody can reproduce, because the reporter and the maintainer ` +
      `are not running the same thing and both believe they are.\n` +
      `Set all of them to the same string.`,
  });

  return violations;
}
