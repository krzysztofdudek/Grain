// hooks/never-blocks (advisory, errs: over)
//
// Inside the dispatcher, every `if (cmd === '<hook verb>')` branch must return only zero and must never
// call the process exit with a non-zero literal. A hook runs inside somebody else's edit; a non-zero
// exit there interrupts a task that has nothing to do with this tool.
//
// Scope of the reading: the branch's OWN control flow. The walk does not descend into a nested function
// or arrow inside the branch — a `return` there belongs to that callback, not to the hook — and it does
// not descend into a nested hook branch, which is checked on its own pass.
//
// errs: over is the honest label. A helper CALLED from inside the branch could still exit and this
// would not see it. The rule catches the change that would most plausibly break the promise — a "real"
// error path added to a hook — and claims nothing more than that.

import { walk, report } from '@chrisdudek/yg/ast';

const HOOK_VERBS = new Set([
  'session-context', 'check-hook', 'edit-hook', 'read-hook', 'how-hook', 'commit-hook',
]);

const NESTED_FUNCTION = new Set([
  'function_declaration', 'function_expression', 'function', 'arrow_function',
  'generator_function', 'generator_function_declaration', 'method_definition', 'class_declaration',
]);

/** The hook verb this if-statement guards, if it guards one. */
function guardedHookVerb(node) {
  if (node.type !== 'if_statement') return undefined;
  const cond = node.childForFieldName('condition');
  if (!cond) return undefined;
  const m = /cmd\s*===\s*'([\w-]+)'/.exec(cond.text);
  if (!m || !HOOK_VERBS.has(m[1])) return undefined;
  return m[1];
}

const isZero = (node) => !!node && node.type === 'number' && node.text.trim() === '0';

export function check(ctx) {
  const violations = [];

  for (const file of ctx.files) {
    if (!file.ast) continue;

    const branches = [];
    walk(file.ast.rootNode, (node) => {
      const verb = guardedHookVerb(node);
      if (!verb) return;
      const body = node.childForFieldName('consequence');
      if (body) branches.push({ verb, body });
    });

    for (const { verb, body } of branches) {
      walk(body, (node) => {
        if (node === body) return;
        if (NESTED_FUNCTION.has(node.type)) return false; // a callback's return is not the hook's
        if (guardedHookVerb(node)) return false; // checked on its own pass

        if (node.type === 'return_statement') {
          const value = node.namedChildren[0];
          if (!value || isZero(value)) return;
          violations.push(
            report(
              file,
              node,
              `The '${verb}' hook branch returns '${value.text}' rather than 0.\n` +
                `A hook runs inside somebody else's edit, on every write and every prompt. A non-zero ` +
                `exit there interrupts a task that has nothing to do with this tool, and "it never ` +
                `blocks" is the first promise the product makes.\n` +
                `Swallow the condition and return 0; if it is worth telling the user about, write to ` +
                `standard error and still return 0.`
            )
          );
          return;
        }

        if (node.type === 'call_expression') {
          const callee = node.childForFieldName('function');
          if (!callee || callee.text.replace(/\s+/g, '') !== 'process.exit') return;
          const args = node.childForFieldName('arguments');
          const first = args && args.namedChildren[0];
          if (!first || isZero(first)) return;
          violations.push(
            report(
              file,
              node,
              `The '${verb}' hook branch exits the process with '${first.text}'.\n` +
                `The host reads that as a failed hook and surfaces it in the middle of an unrelated ` +
                `edit; a tool that occasionally halts somebody else's work is uninstalled long before ` +
                `anyone debugs why.\n` +
                `Return 0 from the branch and let the dispatcher own the exit.`
            )
          );
        }
      });
    }
  }

  return violations;
}
