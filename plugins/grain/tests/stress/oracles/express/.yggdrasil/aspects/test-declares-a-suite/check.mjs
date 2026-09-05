// WHAT   a file in a mocha-loaded test directory contains at least one
//        `describe(...)` and at least one `it(...)`.
// WHY    the test script names directories, not files: mocha loads everything
//        under `test/` and `test/acceptance/`. A file there that declares no
//        suite is loaded, executed for its side effects, and contributes
//        nothing to the count - and nothing in the run says so. All 88 suites
//        in the repository declare one; scaffolding that legitimately declares
//        none lives in `test/support/`, which mocha does not load as tests.
// NEXT   declare the suite, or move the file to `test/support/`.

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
    const source = stripComments(file.content);

    if (!/\bdescribe\s*(?:\.\w+)?\s*\(/.test(source)) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message: 'Declares no `describe(...)` suite. mocha loads this directory wholesale, so this file runs for its side effects and reports nothing - move it to test/support/ if it is scaffolding.',
      });
      continue;
    }
    if (!/\bit\s*(?:\.\w+)?\s*\(/.test(source)) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message: 'Declares a suite with no `it(...)` case in it. An empty suite is reported as a pass.',
      });
    }
  }
  return violations;
}
