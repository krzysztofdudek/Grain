import { walk, report } from '@chrisdudek/yg/ast';

const SHARED_BASES = ['BaseEntity', 'NamedEntity', 'Person'];

// Every @Entity class must extend one of the three shared mapped superclasses.
// Note the direction: the rule is about the base, not about where the file
// lives. Entities in this repository sit in their feature package, not in
// model/ — model/ holds only the bases they inherit.
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      if (node.type !== 'class_declaration') return;
      const modifiers = node.namedChildren.find((c) => c.type === 'modifiers');
      if (!modifiers || !/@Entity\b/.test(modifiers.text)) return;
      const name = node.childForFieldName('name');
      const superclass = node.childForFieldName('superclass');
      const base = superclass ? superclass.text.replace(/^extends\s+/, '').trim() : '';
      const simple = base.split('.').pop();
      if (!SHARED_BASES.includes(simple)) {
        violations.push(
          report(
            file,
            node,
            `entity '${name ? name.text : '<anonymous>'}' extends ${base || 'nothing'} — every entity here extends one of ${SHARED_BASES.join(', ')} so that identity, the is-new test and the validated name column stay the same for every row`,
          ),
        );
      }
    });
  }
  return violations;
}
