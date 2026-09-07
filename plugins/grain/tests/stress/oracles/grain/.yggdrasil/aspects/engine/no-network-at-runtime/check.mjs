// engine/no-network-at-runtime (enforced, errs: under)
//
// The product reads every file and the whole history of a repository that may be private. "Nothing
// leaves your machine" is the promise that makes that safe, and it is one import away from being false
// without anything visibly breaking. So: no networking builtin may be imported and no networking global
// may be called, anywhere inside the shipped plugin.
//
// AST-based, so the word `fetch` in a comment, a string, or a documentation example never fires.

import { walk, report } from '@chrisdudek/yg/ast';

const NET_BUILTINS = new Set([
  'node:http', 'node:https', 'node:http2', 'node:net', 'node:tls', 'node:dgram', 'node:dns',
  'node:dns/promises', 'node:quic',
  'http', 'https', 'http2', 'net', 'tls', 'dgram', 'dns',
]);
const NET_GLOBALS = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']);

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
      if (spec !== undefined && NET_BUILTINS.has(spec)) {
        violations.push(
          report(
            file,
            node,
            `Imports the networking builtin '${spec}'.\n` +
              `The product reads every file and the whole history of a repository that may be private; ` +
              `"nothing leaves your machine, no model calls, no network at runtime" is what makes that safe.\n` +
              `Remove the import. If something genuinely has to reach outside the machine, that is a ` +
              `product decision, not a module-level one — take it to the maintainer first.`
          )
        );
        return;
      }
      if (node.type === 'call_expression' || node.type === 'new_expression') {
        const callee = node.childForFieldName('function') || node.childForFieldName('constructor');
        if (callee && callee.type === 'identifier' && NET_GLOBALS.has(callee.text)) {
          violations.push(
            report(
              file,
              node,
              `Calls the networking global '${callee.text}'.\n` +
                `The product answers from the local index only; a runtime network call breaks the ` +
                `"nothing leaves your machine" promise the whole tool rests on.\n` +
                `Remove the call, or take the requirement to the maintainer as a product decision.`
            )
          );
        }
      }
    });
  }

  return violations;
}
