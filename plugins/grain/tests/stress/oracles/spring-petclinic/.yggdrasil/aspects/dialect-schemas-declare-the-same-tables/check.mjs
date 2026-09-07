const DIALECTS = ['h2', 'mysql', 'postgres'];
const CREATE_TABLE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)/gi;

export function check(ctx) {
  const violations = [];
  const perDialect = new Map();

  for (const dialect of DIALECTS) {
    const path = `src/main/resources/db/${dialect}/schema.sql`;
    const schema = ctx.files.find((f) => f.path === path);
    if (!schema) {
      violations.push({ message: `no schema for the ${dialect} profile — expected ${path}` });
      continue;
    }
    const tables = new Set();
    CREATE_TABLE.lastIndex = 0;
    let match;
    while ((match = CREATE_TABLE.exec(schema.content)) !== null) tables.add(match[1].toLowerCase());
    perDialect.set(dialect, { path, tables });
  }
  if (perDialect.size < 2) return violations;

  const union = new Set();
  for (const { tables } of perDialect.values()) for (const table of tables) union.add(table);

  for (const [dialect, { path, tables }] of perDialect) {
    const missing = [...union].filter((table) => !tables.has(table)).sort();
    if (missing.length === 0) continue;
    violations.push({
      file: path,
      line: 1,
      column: 0,
      message: `the ${dialect} schema does not create ${missing.join(', ')}, which the other dialect schemas do — the profile that runs is chosen at startup, so a table present in only one of them breaks the others`,
    });
  }
  return violations;
}
