import { walk, report } from '@chrisdudek/yg/ast';

// A class annotated @Controller must not be declared public. All six
// controllers in this repository are package-private; the rule keeps it that
// way, because a public controller is an invitation to call a handler method
// from another package instead of going through the request mapping.
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      if (node.type !== 'class_declaration') return;
      const modifiers = node.namedChildren.find((c) => c.type === 'modifiers');
      if (!modifiers) return;
      if (!/@Controller\b/.test(modifiers.text)) return;
      if (!/(^|\s)public(\s|$)/.test(stripAnnotations(modifiers.text))) return;
      const name = node.childForFieldName('name');
      violations.push(
        report(
          file,
          node,
          `controller '${name ? name.text : '<anonymous>'}' is declared public — controllers are package-private here so nothing outside the package can call a handler method directly`,
        ),
      );
    });
  }
  return violations;
}

// Annotation arguments can contain the word `public` inside a string literal;
// drop the annotations before looking for the modifier keyword.
function stripAnnotations(text) {
  return ` ${text.replace(/@\w+(\s*\([^)]*\))?/g, ' ')} `;
}
