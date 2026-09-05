// WHAT   `index.js` may contain the licence banner, the strict pragma, and one
//        `module.exports = require('./...')` statement. Nothing else.
// WHY    the manifest declares no `main`, so this filename is the resolution
//        contract for every `require('express')` in the world. Keeping it a
//        pure re-export is what let the library behind it be reorganised - as
//        it was when routing left this repository - without the entry point
//        moving. Logic added here is also logic no suite addresses: every test
//        requires the package root and would exercise it only by accident.
// NEXT   move the statement into lib/ and re-export it from here.

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

export function check (ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.path.endsWith('.js')) continue;

    const lines = stripComments(file.content).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.length === 0) continue;
      if (/^(['"])use strict\1;?$/.test(line)) continue;
      if (/^module\.exports\s*=\s*require\((['"])\.\.?\/[^'"]+\1\);?$/.test(line)) continue;
      violations.push({
        file: file.path,
        line: i + 1,
        column: 0,
        message: `The entry module carries a statement of its own: \`${line}\`. Every \`require('express')\` resolves to this file, so it stays a bare re-export - move the statement into lib/.`,
      });
    }
  }
  return violations;
}
