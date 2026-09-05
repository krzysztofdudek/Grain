// tests/node-test-runner-only (enforced, errs: under)
//
// Every test file imports the platform's own test runner. The suite has no framework and no assertion
// library, which is what makes "clone it and the suite runs" true and lets the gate run with no install
// step. AST-based, so the name of a framework in a comment or a fixture string never fires.

import { walk, report } from '@chrisdudek/yg/ast';

const RUNNER = 'node:test';

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

    let usesRunner = false;
    const foreign = [];

    walk(file.ast.rootNode, (node) => {
      const spec = importedSpecifier(node);
      if (spec === undefined || spec === '') return;
      if (spec === RUNNER) { usesRunner = true; return; }
      if (spec.startsWith('node:') || spec.startsWith('./') || spec.startsWith('../')) return;
      foreign.push({ node, spec });
    });

    for (const f of foreign) {
      violations.push(
        report(
          file,
          f.node,
          `Test imports the package '${f.spec}'.\n` +
            `The suite runs on the platform's own test runner with no framework and no assertion ` +
            `library, which is what makes "clone it and the suite runs" true and lets the gate run with ` +
            `no install step at all.\n` +
            `Use the platform's test runner and assertion module, or a relative helper in this tree.`
        )
      );
    }

    if (!usesRunner) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message:
          `Test file does not import the platform's test runner ('${RUNNER}').\n` +
          `The gate globs this directory and runs every file in it under that runner; a file that ` +
          `declares no cases with it contributes nothing and its assertions, if any, never run.\n` +
          `Import the runner and declare the cases with it, or move the file out of the test glob if it ` +
          `is a helper rather than a test.`,
      });
    }
  }

  return violations;
}
