// WHAT   a server-side .js file must carry a top-level `'use strict'` pragma
//        before its first executable statement.
// WHY    these modules are CommonJS, so sloppy mode is the default and an
//        undeclared assignment silently creates a global instead of throwing.
//        The library, the entry module and every unit suite already comply
//        without exception - the pragma is load-bearing there, not decoration.
//        The acceptance suites and the shared test scaffolding never adopted
//        it, which is why this rule is advisory by default and enforced only
//        where the whole population already holds.
// NEXT   add `'use strict'` as the first statement of the file, directly under
//        the licence banner where there is one.
//
// No imports: the runner hands this check `ctx.files` with raw `content`, which
// is all it needs, and a check that imports nothing cannot be broken by where
// the CLI happens to be installed.

const PRAGMA = /^[ \t]*(['"])use strict\1;?[ \t]*$/m;

function lineOf (content, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (content.charCodeAt(i) === 10) line++;
  return line;
}

function columnOf (content, index) {
  return index - content.lastIndexOf('\n', index - 1) - 1;
}

function at (file, index, message) {
  return {
    file: file.path,
    line: lineOf(file.content, index),
    column: columnOf(file.content, index),
    message,
  };
}

export function check (ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.path.endsWith('.js')) continue;

    const match = PRAGMA.exec(file.content);
    if (!match) {
      violations.push(at(file, 0, "Missing the `'use strict'` pragma. This file runs as a CommonJS module, so without it an undeclared assignment creates a global instead of throwing."));
      continue;
    }

    // The pragma has to precede executable code; a banner comment may sit above it.
    const before = file.content.slice(0, match.index);
    const code = before
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '')
      .trim();

    if (code.length > 0) {
      violations.push(at(file, match.index, "The `'use strict'` pragma is preceded by executable code, so it does not govern the whole module. Move it above every statement."));
    }
  }
  return violations;
}
