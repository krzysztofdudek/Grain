// engine/constants-only-in-config (enforced, errs: under)
//
// A module that imports the constant table must not also DECLARE a binding under one of the table's
// own names. Importing one is the point; shadowing one with a local declaration creates a second source
// of truth that drifts in silence — and for the three cache-version keys, a second definition means a
// stored index that is stale without saying so.
//
// The check looks only at declarations, never at uses, and only at the exact reserved names. An import
// binding is not a declaration for this purpose (that is the compliant form), so the two are told apart
// by walking declarators rather than identifiers.

import { walk, report } from '@chrisdudek/yg/ast';

const RESERVED = new Set([
  'CFG', 'SUP', 'TOPK', 'NCAP',
  'EXCL', 'MINE_EXCL', 'HARD_EXCL',
  'GRAMMAR_DIR', 'GRAMMARS', 'EXT2GRAMMAR', 'EXT_ALT',
  'ENGINE_VERSION', 'EXTR_V', 'HIST_V', 'MODEL_V',
  'AGENT_AUTHOR_RE', 'FIX_RE',
]);

const WHY =
  `The constant table is the single home of every acceptance constant, path, exclusion pattern and ` +
  `cache-version key. A second declaration under the same name is a second source of truth: the two ` +
  `agree the day they are written and diverge afterwards, and for a cache-version key it means a stored ` +
  `index that is stale without ever saying so.`;

export function check(ctx) {
  const violations = [];

  for (const file of ctx.files) {
    if (!file.ast) continue;
    walk(file.ast.rootNode, (node) => {
      if (node.type !== 'variable_declarator') return;
      const name = node.childForFieldName('name');
      if (!name || name.type !== 'identifier' || !RESERVED.has(name.text)) return;
      violations.push(
        report(
          file,
          node,
          `Declares '${name.text}', a name that belongs to the constant table.\n` +
            WHY +
            `\nImport it from the constant table instead of declaring it here. If the value genuinely ` +
            `differs from the table's, it is a new constant and needs its own name — in the table.`
        )
      );
    });
  }

  return violations;
}
