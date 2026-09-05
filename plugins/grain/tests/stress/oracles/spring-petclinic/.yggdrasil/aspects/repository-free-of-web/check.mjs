import { walk, report } from '@chrisdudek/yg/ast';

const FORBIDDEN_PREFIXES = [
  'org.springframework.web.',
  'org.springframework.ui.',
  'org.springframework.stereotype.Controller',
  'jakarta.servlet.',
  'javax.servlet.',
];

// A repository may not import the web layer, and may not name a controller
// type at all — an import of *Controller from anywhere is the inversion this
// rule exists to stop.
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      if (node.type !== 'import_declaration') return;
      const imported = node.text.replace(/^import\s+(static\s+)?/, '').replace(/;\s*$/, '').trim();
      const simple = imported.split('.').pop();
      if (simple && /Controller$/.test(simple)) {
        violations.push(
          report(
            file,
            node,
            `repository imports the controller ${imported} — dependencies run controller to repository and never back, or the slice tests that mock this repository stop meaning anything`,
          ),
        );
        return;
      }
      if (FORBIDDEN_PREFIXES.some((prefix) => imported.startsWith(prefix))) {
        violations.push(
          report(file, node, `repository imports the web type ${imported} — persistence has no business knowing about HTTP`),
        );
      }
    });
  }
  return violations;
}
