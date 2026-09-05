import { walk, report } from '@chrisdudek/yg/ast';

// Every method carrying @InitBinder must call setDisallowedFields with BOTH
// "id" and "*.id". The nested pattern is the one that matters: an owner form
// binds a whole aggregate, so `pet.id` reaches a child row even when the
// top-level `id` is blocked.
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      if (node.type !== 'method_declaration') return;
      const modifiers = node.namedChildren.find((c) => c.type === 'modifiers');
      if (!modifiers || !/@InitBinder\b/.test(modifiers.text)) return;

      const body = node.childForFieldName('body');
      const name = node.childForFieldName('name');
      const label = name ? name.text : '<anonymous>';
      if (!body) {
        violations.push(report(file, node, `@InitBinder method '${label}' has no body — it cannot disallow "id" and "*.id"`));
        return;
      }

      const args = disallowedFieldArguments(body);
      if (args === null) {
        violations.push(
          report(
            file,
            node,
            `@InitBinder method '${label}' never calls setDisallowedFields — bind-time protection is opt-in, so a form that carries an id field would write to it`,
          ),
        );
        return;
      }
      const missing = ['"id"', '"*.id"'].filter((needed) => !args.includes(needed));
      if (missing.length > 0) {
        violations.push(
          report(
            file,
            node,
            `@InitBinder method '${label}' does not disallow ${missing.join(' and ')} — nested identifiers such as pet.id reach a child row even when the top-level id is blocked`,
          ),
        );
      }
    });
  }
  return violations;
}

// Returns the list of literal arguments passed to any setDisallowedFields
// call inside the method body, or null when there is no such call.
function disallowedFieldArguments(body) {
  let found = null;
  walk(body, (node) => {
    if (node.type !== 'method_invocation') return;
    const name = node.childForFieldName('name');
    if (!name || name.text !== 'setDisallowedFields') return;
    const args = node.childForFieldName('arguments');
    found = found ?? [];
    if (args) {
      for (const arg of args.namedChildren) found.push(arg.text);
    }
  });
  return found;
}
