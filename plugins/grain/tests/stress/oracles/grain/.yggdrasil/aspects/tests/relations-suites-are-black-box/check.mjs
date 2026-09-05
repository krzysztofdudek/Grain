// tests/relations-suites-are-black-box (enforced, errs: under)
//
// No relation end-to-end test may import a module from the plugin's engine or entry directories. The
// only route to the product is the shared harness, which spawns the built binary. Specifiers are
// resolved against the importing file's own directory, so the check is about where the import LANDS,
// not about how it was spelled.
//
// AST-based: a fixture written as a string that itself contains an import (which these tests do
// constantly — that is what they feed the parser) is not an import and never fires.

import { walk, report } from '@chrisdudek/yg/ast';

const INTERNAL = /(^|\/)(engine|bin)\//;

function literal(node) {
  if (!node) return undefined;
  if (node.type !== 'string' && node.type !== 'template_string') return undefined;
  if (node.type === 'template_string' && node.namedChildren.some((c) => c.type === 'template_substitution')) {
    return undefined;
  }
  const frag = node.namedChildren.find((c) => c.type === 'string_fragment');
  if (frag) return frag.text;
  const t = node.text;
  return t.length >= 2 ? t.slice(1, -1) : '';
}

function importedSpecifier(node) {
  if (node.type === 'import_statement' || node.type === 'export_statement') {
    return literal(node.childForFieldName('source'));
  }
  if (node.type === 'call_expression') {
    const callee = node.childForFieldName('function');
    if (!callee) return undefined;
    if (callee.type !== 'import' && !(callee.type === 'identifier' && callee.text === 'require')) return undefined;
    const args = node.childForFieldName('arguments');
    return literal(args && args.namedChildren[0]);
  }
  return undefined;
}

function resolveRelative(spec, importerPath) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return undefined;
  const stack = importerPath.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (stack.length === 0) return undefined;
      stack.pop();
      continue;
    }
    stack.push(seg);
  }
  return stack.join('/');
}

export function check(ctx) {
  const violations = [];

  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      const spec = importedSpecifier(node);
      if (spec === undefined) return;
      const target = resolveRelative(spec, file.path);
      if (!target || !INTERNAL.test(target)) return;
      violations.push(
        report(
          file,
          node,
          `End-to-end relation test imports the internal module '${target}'.\n` +
            `These cases pin behaviour a user can observe — given this fixture, these edges are reported ` +
            `and these are not. Reaching into an internal module means a refactor that moves code breaks ` +
            `the suite without changing anything a user sees, and, worse, that a real regression can be ` +
            `masked by a test inspecting the very internals it is meant to be observing from outside.\n` +
            `Go through the shared harness, which spawns the built binary and reads its real output.`
        )
      );
    });
  }

  return violations;
}
