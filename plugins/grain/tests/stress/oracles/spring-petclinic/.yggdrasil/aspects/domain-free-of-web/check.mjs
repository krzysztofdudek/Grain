import { walk, report } from '@chrisdudek/yg/ast';

// Import prefixes that mean "this file knows how a request arrives".
// org.springframework.format is intentionally absent: the date-format hint an
// entity carries is a formatting concern, not a web one, and removing it
// would push date parsing into every controller.
const FORBIDDEN = [
  { prefix: 'org.springframework.web.', why: 'Spring MVC' },
  { prefix: 'org.springframework.ui.', why: 'the MVC model' },
  { prefix: 'org.springframework.stereotype.Controller', why: 'the controller stereotype' },
  { prefix: 'jakarta.servlet.', why: 'the servlet API' },
  { prefix: 'javax.servlet.', why: 'the servlet API' },
];

export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      if (node.type !== 'import_declaration') return;
      const imported = node.text.replace(/^import\s+(static\s+)?/, '').replace(/;\s*$/, '').trim();
      for (const { prefix, why } of FORBIDDEN) {
        if (!imported.startsWith(prefix)) continue;
        violations.push(
          report(
            file,
            node,
            `domain type imports ${imported} (${why}) — entities and their bases are the layer everything else depends on and must not know how a request reaches them`,
          ),
        );
        return;
      }
    });
  }
  return violations;
}
