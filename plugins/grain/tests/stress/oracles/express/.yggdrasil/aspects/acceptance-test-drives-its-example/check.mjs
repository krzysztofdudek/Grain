// WHAT   `test/acceptance/<name>.js` must require `../../examples/<name>`.
// WHY    this pairing is the only thing that makes the examples true. They are
//        the code people copy out of the repository, and nothing else executes
//        them - the unit suites all build their own tiny applications. Naming
//        the suite after the directory is what makes the gap visible when an
//        example is added without one: a reader can see at a glance which
//        examples are covered, and which are prose. Eighteen suites hold this
//        today, without exception.
// NEXT   name the file after the example directory it mounts, and require that
//        directory.

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

const EXAMPLE = /require\(\s*(['"])(?:\.\.\/)+examples\/([A-Za-z0-9._-]+)\1\s*\)/g;

export function check (ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.path.endsWith('.js')) continue;

    const name = file.path.split('/').pop().replace(/\.js$/, '');
    const source = stripComments(file.content);

    const mounted = new Set();
    EXAMPLE.lastIndex = 0;
    let m;
    while ((m = EXAMPLE.exec(source)) !== null) mounted.add(m[2]);

    if (mounted.size === 0) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message: `Mounts no example. An acceptance suite exists to run \`examples/${name}\` end to end; a suite that builds its own application belongs in test/, not test/acceptance/.`,
      });
      continue;
    }
    if (!mounted.has(name)) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message: `Named '${name}' but mounts ${[...mounted].map(e => `examples/${e}`).join(', ')}. The filename is how a reader tells which examples are covered - rename the suite or mount the matching example.`,
      });
    }
  }
  return violations;
}
