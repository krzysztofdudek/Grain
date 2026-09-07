import { walk, report } from '@chrisdudek/yg/ast';

// @RestController is @Controller + a blanket @ResponseBody: every String a
// handler returns stops being a view name and becomes the response body.
// This application renders HTML, and the single JSON endpoint marks itself
// with @ResponseBody on the one method that needs it.
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      if (node.type !== 'marker_annotation' && node.type !== 'annotation') return;
      const name = node.childForFieldName('name');
      if (!name) return;
      if (name.text !== 'RestController' && !name.text.endsWith('.RestController')) return;
      violations.push(
        report(
          file,
          node,
          '@RestController turns every returned String into a response body — this application renders views; put @ResponseBody on the one method that returns data instead',
        ),
      );
    });
  }
  return violations;
}
