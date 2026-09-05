// engine/no-test-or-instrument-import (enforced, errs: under)
//
// A shipped module may not import a file from the test tree. The specifier is resolved against the
// importing file's own directory and refused when the result lands under a `tests/` segment, or is
// named like a test or a harness. Only relative specifiers can reach the repository tree at all, so a
// package or builtin specifier is never a candidate.
//
// Recorded defect this protects against: a product command once imported a graph reader from a
// measurement instrument, which put a shipped command downstream of a test file. The fix moved the code
// into the engine and had the instrument re-export it. Dependencies point from the tests into the
// product, never back.

import { walk, report } from '@chrisdudek/yg/ast';

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

/** Resolve a relative specifier against the importer's directory; undefined if it is not relative. */
function resolveRelative(spec, importerPath) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return undefined;
  const stack = importerPath.split('/').slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (stack.length === 0) return undefined; // escapes the repository root
      stack.pop();
      continue;
    }
    stack.push(seg);
  }
  return stack.join('/');
}

const isTestPath = (p) =>
  /(^|\/)tests?(\/|$)/.test(p) || /\.test\.[cm]?[jt]sx?$/.test(p) || /(^|\/)_?[\w-]*harness\.[cm]?js$/.test(p);

export function check(ctx) {
  const violations = [];

  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      const spec = importedSpecifier(node);
      if (spec === undefined) return;
      const target = resolveRelative(spec, file.path);
      if (!target || !isTestPath(target)) return;
      violations.push(
        report(
          file,
          node,
          `Shipped code imports '${spec}', which resolves into the test tree (${target}).\n` +
            `That puts a shipped surface downstream of a test file: a change made for a measurement can ` +
            `then alter what a user's command produces, and the package depends on a directory that is ` +
            `not part of it. This has happened here before and was fixed by moving the code, not by ` +
            `leaving the import.\n` +
            `Move the shared code into the engine and have the test or instrument import it from there.`
        )
      );
    });
  }

  return violations;
}
