// WHAT   an example that calls `listen(...)` must do so behind the
//        `if (!module.parent)` guard the other examples use.
// WHY    requiring an example must not open a socket. The acceptance suites
//        mount these files inside a mocha process that runs eighteen of them,
//        so an unguarded listen means a port bound for the whole run, a port
//        collision on the second example that picks the same number, and a
//        `--check-leaks` run holding a handle open at the end. One example in
//        this repository does exactly that, which is also why it has no
//        acceptance suite - the two facts are the same fact.
//
//        Honest limit: this rule reads the presence of the guard in the file,
//        not the position of the call inside it, so a listen outside a guard
//        that exists elsewhere in the file would pass. It fires on the case
//        that actually occurs - no guard at all.
// NEXT   wrap the listen call:
//          /* istanbul ignore next */
//          if (!module.parent) { app.listen(3000) }

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

const LISTEN = /\.\s*listen\s*\(/;

export function check (ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.path.endsWith('index.js')) continue;
    const source = stripComments(file.content);

    const listen = LISTEN.exec(source);
    if (!listen) continue;
    if (/\bmodule\s*\.\s*parent\b/.test(source)) continue;

    violations.push({
      file: file.path,
      line: lineOf(file.content, listen.index),
      column: 0,
      message: 'Binds a port unconditionally, so requiring this example starts a server. Guard the call with `if (!module.parent)` - the acceptance suites mount these files inside one mocha process, where an unguarded listen collides with another example and leaves a handle open at the end of the run.',
    });
  }
  return violations;
}
