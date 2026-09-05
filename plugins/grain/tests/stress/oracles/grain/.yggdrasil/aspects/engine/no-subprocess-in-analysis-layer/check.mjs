// engine/no-subprocess-in-analysis-layer (enforced, errs: under)
//
// The mining layer must be a pure function of the bytes it was handed: same input, same answer, no
// ambient process. This check refuses any import of node:child_process — static, re-exported, dynamic
// or required — in a file of a type that carries it. The three modules that legitimately spawn (the
// dispatcher and the history layer for git, the proposal writer for its drills) have their own types
// and never receive this rule, so there is nothing to waive and no exception list to drift.
//
// AST-based: the words `spawn` or `child_process` in a comment or a string never fire.

import { walk, report } from '@chrisdudek/yg/ast';

const FORBIDDEN = new Set(['node:child_process', 'child_process']);

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

export function check(ctx) {
  const violations = [];

  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      const spec = importedSpecifier(node);
      if (spec === undefined || !FORBIDDEN.has(spec)) return;
      violations.push(
        report(
          file,
          node,
          `Imports 'node:child_process' inside the analysis layer.\n` +
            `Mining has to be a pure function of the bytes it was given: a spawned process is not ` +
            `reproducible, not measurable, and makes a cached verdict about this code worthless.\n` +
            `Move the work to the module whose type already allows a subprocess — the dispatcher and ` +
            `the history layer for git, the proposal writer for its drills — and call into it, or pass ` +
            `the result in as an argument.`
        )
      );
    });
  }

  return violations;
}
