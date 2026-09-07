import { walk, report } from '@chrisdudek/yg/ast';

// System.out / System.err writes and printStackTrace() calls. Matched on the
// AST rather than the raw text so a mention inside a comment or a string (the
// i18n consistency test greps for the literal "System.out") is not a hit.
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      if (node.type !== 'method_invocation') return;
      const object = node.childForFieldName('object');
      const name = node.childForFieldName('name');
      if (name && name.text === 'printStackTrace') {
        violations.push(
          report(file, node, 'printStackTrace() writes to standard error and cannot be turned off — log the exception instead'),
        );
        return;
      }
      if (!object) return;
      if (/^System\.(out|err)$/.test(object.text)) {
        violations.push(
          report(
            file,
            node,
            `${object.text}.${name ? name.text : 'print'}() bypasses logging — log level is configurable per package and console output is not`,
          ),
        );
      }
    });
  }
  return violations;
}
