// engine/no-runtime-dependencies (enforced, errs: under)
//
// The shipped plugin has no runtime dependency. A module inside it may import a platform builtin
// (`node:*`) or a relative path, and nothing else. Detection is AST-based, so a bare specifier that
// merely appears inside a string literal — both the mining core and the proposal writer emit source
// code as text, and that text contains imports — is not a violation and never fires. That is what makes
// this check free of false alarms rather than merely careful.

import { walk, report } from '@chrisdudek/yg/ast';

/** Literal value of a `string` or a substitution-free `template_string`; undefined for anything else. */
function literal(node) {
  if (!node) return undefined;
  if (node.type !== 'string' && node.type !== 'template_string') return undefined;
  if (node.type === 'template_string' && node.namedChildren.some((c) => c.type === 'template_substitution')) {
    return undefined; // interpolated: not a static specifier, out of scope
  }
  const frag = node.namedChildren.find((c) => c.type === 'string_fragment');
  if (frag) return frag.text;
  const t = node.text;
  return t.length >= 2 ? t.slice(1, -1) : '';
}

/** The module specifier this node introduces, if it introduces one at all. */
function specifierOf(node) {
  if (node.type === 'import_statement' || node.type === 'export_statement') {
    return literal(node.childForFieldName('source'));
  }
  if (node.type === 'call_expression') {
    const callee = node.childForFieldName('function');
    if (!callee) return undefined;
    const isDynamicImport = callee.type === 'import';
    const isRequire = callee.type === 'identifier' && callee.text === 'require';
    if (!isDynamicImport && !isRequire) return undefined;
    const args = node.childForFieldName('arguments');
    const first = args && args.namedChildren[0];
    return literal(first);
  }
  return undefined;
}

const allowed = (spec) => spec.startsWith('node:') || spec.startsWith('./') || spec.startsWith('../');

export function check(ctx) {
  const violations = [];

  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      const spec = specifierOf(node);
      if (spec === undefined || spec === '' || allowed(spec)) return;
      violations.push(
        report(
          file,
          node,
          `Imports the package '${spec}'.\n` +
            `The shipped plugin has no runtime dependency: an install is a checkout, nothing is ` +
            `downloaded when a query runs, and no third-party code sees the user's source.\n` +
            `Use a platform builtin (a 'node:' specifier) or a relative path, or vendor what you need ` +
            `into the plugin the way the parser runtime and the relation machinery already are.`
        )
      );
    });
  }

  return violations;
}
