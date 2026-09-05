// WHAT   no `console.*` call in a test file. A call that has been commented
//        out is fine - that is a note, not output.
// WHY    the suite runs on eighteen matrix jobs and its output is read by
//        people triaging a failure they cannot reproduce. A print statement in
//        a failure path adds noise to exactly the run that is already hard to
//        read, and it adds nothing an assertion message could not carry - the
//        assertion is what names the expectation, and it is what the reporter
//        formats. This rule is advisory because the repository violates it
//        today, in one failure branch of the location tests.
// NEXT   move what the print statement was telling you into the assertion
//        message.

const CONSOLE = /\bconsole\s*\.\s*\w+\s*\(/g;

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
    CONSOLE.lastIndex = 0;
    let m;
    while ((m = CONSOLE.exec(source)) !== null) {
      violations.push({
        file: file.path,
        line: lineOf(file.content, m.index),
        column: 0,
        message: 'Left-over debug printing in a test. Put what this line was telling you into the assertion message instead, where the reporter will show it on the run that actually failed.',
      });
    }
  }
  return violations;
}
