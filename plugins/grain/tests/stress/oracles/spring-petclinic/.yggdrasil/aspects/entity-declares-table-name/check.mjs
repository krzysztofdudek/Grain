import { walk, report } from '@chrisdudek/yg/ast';

// Every @Entity must carry @Table(name = "..."). The schema is hand-written
// SQL and ddl-auto is off, so the entity is the only place the mapping to an
// existing table is stated.
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      if (node.type !== 'class_declaration') return;
      const modifiers = node.namedChildren.find((c) => c.type === 'modifiers');
      if (!modifiers || !/@Entity\b/.test(modifiers.text)) return;
      const name = node.childForFieldName('name');
      if (/@Table\s*\(\s*name\s*=\s*"[^"]+"/.test(modifiers.text)) return;
      violations.push(
        report(
          file,
          node,
          `entity '${name ? name.text : '<anonymous>'}' does not declare @Table(name = "...") — the schema is hand-written SQL per dialect and is never generated, so the table name has to be stated here rather than inferred`,
        ),
      );
    });
  }
  return violations;
}
