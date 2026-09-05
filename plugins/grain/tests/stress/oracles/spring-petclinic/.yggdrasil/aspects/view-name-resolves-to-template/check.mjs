import { walk, report } from '@chrisdudek/yg/ast';

const TEMPLATE_ROOT = 'src/main/resources/templates';

// Collects the literal view names a controller produces and asserts each one
// has a template. Two shapes are recognised, and only two:
//
//   return "owners/findOwners";          — a literal returned from a handler
//   new ModelAndView("owners/ownerDetails")
//
// A constant returned by name (VIEWS_OWNER_CREATE_OR_UPDATE_FORM) is resolved
// from the string field initialisers declared in the same file. Anything else
// — a concatenation, a call, a redirect: or forward: prefix — is skipped: the
// rule would rather miss a computed name than invent one.
export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.ast) continue;

    const constants = stringConstants(file.ast.rootNode);
    const seen = new Map();

    walk(file.ast.rootNode, (node) => {
      if (node.type === 'return_statement') {
        const value = node.namedChildren[0];
        if (value) collect(value, constants, seen, node);
        return;
      }
      if (node.type === 'object_creation_expression') {
        const type = node.childForFieldName('type');
        if (!type || !/(^|\.)ModelAndView$/.test(type.text)) return;
        const args = node.childForFieldName('arguments');
        const first = args ? args.namedChildren[0] : undefined;
        if (first) collect(first, constants, seen, node);
      }
    });

    for (const [view, node] of seen) {
      const path = `${TEMPLATE_ROOT}/${view}.html`;
      if (ctx.fs.exists(path) !== 'file') {
        violations.push(
          report(
            file,
            node,
            `view name '${view}' has no template — expected ${path}; a mistyped view name compiles and only fails when a user opens that page`,
          ),
        );
      }
    }
  }
  return violations;
}

function collect(expression, constants, seen, node) {
  let raw = null;
  if (expression.type === 'string_literal') raw = unquote(expression.text);
  else if (expression.type === 'identifier' && constants.has(expression.text)) raw = constants.get(expression.text);
  if (raw === null) return;
  if (raw.startsWith('redirect:') || raw.startsWith('forward:')) return;
  if (!/^[A-Za-z0-9_/-]+$/.test(raw)) return;
  if (!seen.has(raw)) seen.set(raw, node);
}

// field: private static final String NAME = "literal";
function stringConstants(root) {
  const constants = new Map();
  walk(root, (node) => {
    if (node.type !== 'field_declaration') return;
    for (const declarator of node.namedChildren) {
      if (declarator.type !== 'variable_declarator') continue;
      const name = declarator.childForFieldName('name');
      const value = declarator.childForFieldName('value');
      if (name && value && value.type === 'string_literal') constants.set(name.text, unquote(value.text));
    }
  });
  return constants;
}

function unquote(text) {
  return text.replace(/^"/, '').replace(/"$/, '');
}
