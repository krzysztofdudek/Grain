// WHAT   `describe.only`, `it.only`, `context.only` and `specify.only` are
//        refused. A hard-coded `.skip` is refused too.
// WHY    `.only` does not narrow this file's run; it narrows the WHOLE run.
//        One left in a merge turns a matrix of eighteen green jobs into
//        eighteen green jobs that ran a single test, and nothing in the output
//        distinguishes the two. `.skip` is refused for the same reason at a
//        smaller scale: a permanently skipped test is a test nobody deleted and
//        nobody fixed. The one legitimate skip in this repository is computed -
//        `(skipRelative ? describe.skip : describe)(...)` - which is a platform
//        guard, states its condition in code, and is deliberately not matched
//        by this rule.
// NEXT   remove the `.only`; for a genuinely platform-dependent case, select
//        the runner conditionally so the reason is visible.

const FOCUSED = /\b(describe|context|it|specify)\s*\.\s*(only|skip)\s*\(/g;

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
    FOCUSED.lastIndex = 0;
    let m;
    while ((m = FOCUSED.exec(source)) !== null) {
      const message = m[2] === 'only'
        ? `\`${m[1]}.only\` narrows the entire run, not this file. Every other suite in the matrix would be reported green without having executed.`
        : `\`${m[1]}.skip\` disables a test permanently and silently. Delete the test or fix it; if the case is genuinely platform-dependent, choose the runner with an expression so the condition is visible.`;
      violations.push({
        file: file.path,
        line: lineOf(file.content, m.index),
        column: 0,
        message,
      });
    }
  }
  return violations;
}
