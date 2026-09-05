// WHAT   every published module assigns `module.exports` or an
//        `exports.<name>` property, and none of them uses `import`/`export`
//        syntax.
// WHY    the package manifest declares no `type` field and no `exports` map,
//        so node loads all of it as CommonJS. A single ESM statement would not
//        be a style change - it would make the file unloadable for every
//        consumer, on every node version the matrix tests. Both assignment
//        forms are in use here deliberately: the prototypes and the View
//        constructor replace the whole export object, while the private helpers
//        and the application prototype hang named properties off it.
// NEXT   expose the module's surface with `module.exports = ...` or
//        `exports.<name> = ...`.

function stripComments (source) {
  const out = source.split('');
  let i = 0;
  let mode = 'code';
  let quote = '';
  while (i < source.length) {
    const c = source[i];
    const d = source[i + 1];
    if (mode === 'code') {
      if (c === '/' && d === '/') { mode = 'line'; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; out[i] = ' '; out[i + 1] = ' '; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { mode = 'string'; quote = c; i++; continue; }
      i++; continue;
    }
    if (mode === 'string') {
      if (c === '\\') { i += 2; continue; }
      if (c === quote) mode = 'code';
      i++; continue;
    }
    if (mode === 'line') {
      if (c === '\n') { mode = 'code'; i++; continue; }
      out[i] = ' '; i++; continue;
    }
    if (c === '*' && d === '/') { out[i] = ' '; out[i + 1] = ' '; mode = 'code'; i += 2; continue; }
    if (c !== '\n') out[i] = ' ';
    i++;
  }
  return out.join('');
}

function lineOf (content, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (content.charCodeAt(i) === 10) line++;
  return line;
}

const ESM = /^[ \t]*(?:export\s+(?:default|const|let|var|function|class|\{|\*)|import\s+(?:[A-Za-z_$*{]|['"]))/m;

export function check (ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.path.endsWith('.js')) continue;
    const source = stripComments(file.content);

    const esm = ESM.exec(source);
    if (esm) {
      violations.push({
        file: file.path,
        line: lineOf(file.content, esm.index),
        column: 0,
        message: 'ECMAScript module syntax in a CommonJS package. The manifest declares no `type` and no `exports` map, so node loads this file as CommonJS and this statement makes it unloadable.',
      });
    }

    const publishes = /\bmodule\.exports\s*=/.test(source) || /\bexports\.[A-Za-z_$][\w$]*\s*=/.test(source);
    if (!publishes) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message: 'Module publishes nothing: no `module.exports =` and no `exports.<name> =` assignment. A published module with no export surface is dead weight inside the package.',
      });
    }
  }
  return violations;
}
