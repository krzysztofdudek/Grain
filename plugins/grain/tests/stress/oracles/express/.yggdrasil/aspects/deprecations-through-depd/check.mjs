// WHAT   a module that calls `deprecate(...)` must obtain it from
//        `require('depd')('express')`, and no module may hand-roll a
//        deprecation with `process.emitWarning` or `console.warn`.
// WHY    depd is what makes a deprecation addressable by the person receiving
//        it: it prints the caller's own file and line rather than express's,
//        it prints once per call site rather than once per request, and it can
//        be silenced or made fatal per package through NO_DEPRECATION and
//        TRACE_DEPRECATION. The test suite depends on exactly that - it sets
//        `NO_DEPRECATION=body-parser,express` before any suite loads, so a
//        hand-rolled warning would be output no test run can quiet. The
//        namespace argument must stay `express`, because that string is what
//        users put in the environment variable.
// NEXT   add `var deprecate = require('depd')('express')` and emit through it.

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

const CALL = /\bdeprecate\s*\(/g;
const HANDROLLED = /\b(?:process\s*\.\s*emitWarning|console\s*\.\s*warn)\s*\(/g;
const DEPD = /require\(\s*(['"])depd\1\s*\)\s*\(\s*(['"])([^'"]*)\2\s*\)/;

export function check (ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.path.endsWith('.js')) continue;
    const source = stripComments(file.content);

    HANDROLLED.lastIndex = 0;
    let h;
    while ((h = HANDROLLED.exec(source)) !== null) {
      violations.push({
        file: file.path,
        line: lineOf(file.content, h.index),
        column: 0,
        message: 'Hand-rolled warning in a published module. A deprecation must go through the depd instance so it names the caller, fires once per call site, and honours NO_DEPRECATION - which is how the test suite keeps its output readable.',
      });
    }

    CALL.lastIndex = 0;
    const call = CALL.exec(source);
    if (!call) continue;

    const depd = DEPD.exec(source);
    if (!depd) {
      violations.push({
        file: file.path,
        line: lineOf(file.content, call.index),
        column: 0,
        message: 'Calls `deprecate(...)` without creating a depd instance. Add `var deprecate = require(\'depd\')(\'express\')`.',
      });
      continue;
    }
    if (depd[3] !== 'express') {
      violations.push({
        file: file.path,
        line: lineOf(file.content, depd.index),
        column: 0,
        message: `depd namespace is '${depd[3]}', not 'express'. That string is what users put in NO_DEPRECATION, so it has to match the package name.`,
      });
    }
  }
  return violations;
}
