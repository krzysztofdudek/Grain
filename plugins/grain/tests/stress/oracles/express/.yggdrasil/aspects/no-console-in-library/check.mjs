// WHAT   no `console.log`, `.info`, `.warn`, `.debug`, `.trace`, `.dir`,
//        `.table` or timing call anywhere in a published module. Only
//        `console.error` is permitted.
// WHY    a framework writes to a host application's stdout only when that
//        application asked for it. Diagnostics here go through the `debug`
//        package, which is off unless DEBUG names the namespace, so a library
//        print statement is output nobody can switch off. The one exception in
//        the tree is the default error handler's `console.error`, and even that
//        is suppressed when the environment is `test` - the codebase already
//        treats unconditional output as a defect.
// NEXT   route the message through the module's `debug('express:<area>')`
//        instance, or drop it.

const BANNED = /\bconsole\s*\.\s*(log|info|warn|debug|trace|dir|table|time|timeEnd|group|groupEnd|count|assert)\s*\(/g;

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
    BANNED.lastIndex = 0;
    let m;
    while ((m = BANNED.exec(source)) !== null) {
      violations.push({
        file: file.path,
        line: lineOf(file.content, m.index),
        column: m.index - file.content.lastIndexOf('\n', m.index - 1) - 1,
        message: `\`console.${m[1]}\` in a published module writes to the host application's output with no way to switch it off. Use the module's \`debug\` instance instead.`,
      });
    }
  }
  return violations;
}
