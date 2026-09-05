import { walk, report } from '@chrisdudek/yg/ast';

const SPRING_DATA_BASES = /\b(JpaRepository|CrudRepository|PagingAndSortingRepository|Repository)\s*</;

// A repository file must declare an interface named *Repository that extends a
// Spring Data base, and must declare no class at all. A class in this file is
// a hand-written persistence implementation, which is what the declarative
// repository is there to avoid.
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.ast) continue;

    let sawRepositoryInterface = false;
    const before = violations.length;

    walk(file.ast.rootNode, (node) => {
      if (node.type === 'class_declaration') {
        const name = node.childForFieldName('name');
        violations.push(
          report(
            file,
            node,
            `'${name ? name.text : '<anonymous>'}' is a class in a repository file — persistence here is declared as a Spring Data interface, not implemented by hand`,
          ),
        );
        return;
      }
      if (node.type !== 'interface_declaration') return;
      const name = node.childForFieldName('name');
      const extendsClause = node.namedChildren.find((c) => c.type === 'extends_interfaces');
      if (!name || !name.text.endsWith('Repository')) {
        if (name) {
          violations.push(
            report(file, node, `interface '${name.text}' lives in a repository file but is not named *Repository`),
          );
        }
        return;
      }
      if (!extendsClause || !SPRING_DATA_BASES.test(extendsClause.text)) {
        violations.push(
          report(
            file,
            node,
            `repository '${name.text}' does not extend a Spring Data repository — without one there is no query derivation and no shared save/find contract`,
          ),
        );
        return;
      }
      sawRepositoryInterface = true;
    });

    if (!sawRepositoryInterface && violations.length === before) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message: 'no *Repository interface extending a Spring Data base was found in this repository file',
      });
    }
  }
  return violations;
}
