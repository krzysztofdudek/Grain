const BASE = 'messages.properties';
// English resolves through the base bundle; this file is empty on purpose.
const EXEMPT = new Set(['messages_en.properties']);

export function check(ctx) {
  const violations = [];
  const bundles = new Map();
  for (const file of ctx.files) {
    const name = file.path.split('/').pop() ?? file.path;
    if (!name.startsWith('messages') || !name.endsWith('.properties')) continue;
    bundles.set(name, { path: file.path, keys: keysOf(file.content) });
  }

  const base = bundles.get(BASE);
  if (!base) {
    violations.push({ message: `base bundle ${BASE} is missing — there is nothing for the translations to be checked against` });
    return violations;
  }

  for (const [name, bundle] of bundles) {
    if (name === BASE || EXEMPT.has(name)) continue;
    const missing = [...base.keys].filter((key) => !bundle.keys.has(key)).sort();
    if (missing.length > 0) {
      violations.push({
        file: bundle.path,
        line: 1,
        column: 0,
        message: `${missing.length} key(s) missing from ${name}: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', …' : ''} — an absent key renders as the raw key name in the page, not as English`,
      });
    }
    const extra = [...bundle.keys].filter((key) => !base.keys.has(key)).sort();
    if (extra.length > 0) {
      violations.push({
        file: bundle.path,
        line: 1,
        column: 0,
        message: `${extra.length} key(s) in ${name} that the base bundle does not declare: ${extra.slice(0, 8).join(', ')}${extra.length > 8 ? ', …' : ''} — a translation nothing looks up is dead weight, or the base bundle lost a key`,
      });
    }
  }
  return violations;
}

function keysOf(content) {
  const keys = new Set();
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#') || line.startsWith('!')) continue;
    const separator = line.search(/[=:]/);
    if (separator <= 0) continue;
    keys.add(line.slice(0, separator).trim());
  }
  return keys;
}
