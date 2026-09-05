import { walk, report } from '@chrisdudek/yg/ast';

const INJECTION_ANNOTATIONS = /@(Autowired|Inject|Resource)\b/;

// Flags @Autowired / @Inject / @Resource anywhere in production code except on
// a constructor — where it is redundant anyway, since a single-constructor
// bean is autowired without it.
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      if (node.type !== 'field_declaration' && node.type !== 'method_declaration') return;
      const modifiers = node.namedChildren.find((c) => c.type === 'modifiers');
      if (!modifiers || !INJECTION_ANNOTATIONS.test(modifiers.text)) return;
      const kind = node.type === 'field_declaration' ? 'field' : 'setter';
      violations.push(
        report(
          file,
          node,
          `${kind} injection — collaborators arrive through the constructor here, so they can be final, cannot be missing at construction time, and can be handed in by a test with no container`,
        ),
      );
    });
  }
  return violations;
}
