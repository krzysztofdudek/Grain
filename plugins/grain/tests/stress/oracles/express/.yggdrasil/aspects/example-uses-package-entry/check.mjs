// This is the contract on the entry node's `public-api` port: whatever
// consumes the published entry point reaches it the way a user would.
//
// WHAT   an example may require `../..` (the package root). It may not require
//        a path into `lib/`.
// WHY    an example is a copy-paste source. A reader who copies
//        `require('../../lib/express')` into their own project gets a path that
//        does not exist for them, and a reader who copies the surrounding code
//        learns that reaching into express's internals is normal. It is not:
//        the manifest publishes `index.js` and `lib/`, but only `index.js` is
//        a promise - the library behind it has already been reorganised once,
//        when routing left the repository, and the entry point is what absorbed
//        that. Two examples in this repository take the internal path, which is
//        why this rule is advisory.
// NEXT   require the package root: `require('../..')`.

const INTERNAL = /require\(\s*(['"])((?:\.\.\/)+lib\/[^'"]*)\1\s*\)/g;

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

export function check (ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.path.endsWith('.js')) continue;
    const source = stripComments(file.content);
    INTERNAL.lastIndex = 0;
    let m;
    while ((m = INTERNAL.exec(source)) !== null) {
      violations.push({
        file: file.path,
        line: lineOf(file.content, m.index),
        column: 0,
        message: `Reaches into the library at '${m[2]}'. An example is a copy-paste source, and this path does not exist for the person copying it; require the package root instead.`,
      });
    }
  }
  return violations;
}
