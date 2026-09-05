import { walk, report } from '@chrisdudek/yg/ast';

// @Query(..., nativeQuery = true) binds the repository to one SQL dialect.
// This application ships three, chosen at runtime by profile.
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      if (node.type !== 'annotation') return;
      const name = node.childForFieldName('name');
      if (!name || name.text.split('.').pop() !== 'Query') return;
      const args = node.childForFieldName('arguments');
      if (!args || !/nativeQuery\s*=\s*true/.test(args.text)) return;
      violations.push(
        report(
          file,
          node,
          'native SQL in a repository query — the same code runs on H2, MySQL and PostgreSQL, so queries stay in JPQL',
        ),
      );
    });
  }
  return violations;
}
