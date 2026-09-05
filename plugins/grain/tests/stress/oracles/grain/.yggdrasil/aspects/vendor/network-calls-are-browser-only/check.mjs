// vendor/network-calls-are-browser-only (advisory, errs: over)
//
// Report every network call site in vendored third-party code so the count is a reviewed fact rather
// than an assumption. It finds SITES, not reachable ones — the known sites here all sit in browser-only
// branches the platform never takes — which is why this is advisory and labelled as over-approximating.
// The first-party rule that forbids these outright is a separate aspect and stays absolute.

import { walk, report } from '@chrisdudek/yg/ast';

const NET_GLOBALS = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']);

export function check(ctx) {
  const violations = [];

  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      if (node.type !== 'call_expression' && node.type !== 'new_expression') return;
      const callee = node.childForFieldName('function') || node.childForFieldName('constructor');
      if (!callee || callee.type !== 'identifier' || !NET_GLOBALS.has(callee.text)) return;
      violations.push(
        report(
          file,
          node,
          `Vendored code has a network call site ('${callee.text}').\n` +
            `Vendored code is taken as shipped and is not reshaped here, but the promise that nothing ` +
            `leaves the user's machine cannot rest on an assumption about somebody else's source.\n` +
            `Confirm this site is in a branch the platform never takes (the known ones are guarded by a ` +
            `platform or worker-environment test, with the file-system path taken instead), and record ` +
            `the finding. If it is reachable, the re-vendoring that introduced it has to be undone.`
        )
      );
    });
  }

  return violations;
}
