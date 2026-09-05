const ENTITY_NODES = ['app/owner/entities', 'app/vet/entities'];
const DIALECTS = ['h2', 'mysql', 'postgres'];

const TABLE_ANNOTATION = /@(?:Table|JoinTable)\s*\(\s*name\s*=\s*"([^"]+)"/g;
const CREATE_TABLE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)/gi;

export function check(ctx) {
  const violations = [];

  const wanted = new Map(); // table -> source file
  for (const id of ENTITY_NODES) {
    let node;
    try {
      node = ctx.graph.node(id);
    }
    catch {
      violations.push({
        message: `cannot reach entity component '${id}' — add a 'uses' relation to it in this component's yg-node.yaml so the schema can be checked against the entity mappings`,
      });
      continue;
    }
    if (!node) continue;
    for (const file of node.files) {
      TABLE_ANNOTATION.lastIndex = 0;
      let match;
      while ((match = TABLE_ANNOTATION.exec(file.content)) !== null) {
        if (!wanted.has(match[1])) wanted.set(match[1], file.path);
      }
    }
  }
  if (wanted.size === 0) return violations;

  for (const dialect of DIALECTS) {
    const path = `src/main/resources/db/${dialect}/schema.sql`;
    const schema = ctx.files.find((f) => f.path === path);
    if (!schema) {
      violations.push({ message: `no schema for the ${dialect} profile — expected ${path}` });
      continue;
    }
    const created = tablesIn(schema.content);
    for (const [table, source] of wanted) {
      if (created.has(table.toLowerCase())) continue;
      violations.push({
        file: path,
        line: 1,
        column: 0,
        message: `table '${table}', mapped by ${source}, is never created in the ${dialect} schema — schema generation is off, so this fails at startup on that profile and nowhere else`,
      });
    }
  }
  return violations;
}

function tablesIn(sql) {
  const tables = new Set();
  CREATE_TABLE.lastIndex = 0;
  let match;
  while ((match = CREATE_TABLE.exec(sql)) !== null) tables.add(match[1].toLowerCase());
  return tables;
}
