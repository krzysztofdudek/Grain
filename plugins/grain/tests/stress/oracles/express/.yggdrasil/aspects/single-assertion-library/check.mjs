// WHAT   no test file may require chai, should, expect.js, unexpected, must,
//        better-assert, power-assert or sinon-style assertion add-ons.
// WHY    the suite has exactly two vocabularies today - `node:assert` for
//        values and supertest's `.expect()` for responses - and the devDeps
//        list is deliberately short: this package is installed by a very large
//        number of people, and every development dependency is a supply-chain
//        surface the maintainers have to watch (the npm settings here already
//        refuse install scripts and impose a minimum release age). A second
//        assertion library also splits the failure output into two formats,
//        which matters when a failure arrives from a matrix job on a node
//        version nobody has locally.
// NEXT   assert with `node:assert`, or with supertest's `.expect()` for a
//        response.

const BANNED = new Set([
  'chai', 'should', 'expect.js', 'expect', 'unexpected', 'must',
  'better-assert', 'power-assert', 'assert-plus', 'chai-as-promised',
]);

const REQUIRE = /require\(\s*(['"])([^'"]+)\1\s*\)/g;

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
    REQUIRE.lastIndex = 0;
    let m;
    while ((m = REQUIRE.exec(source)) !== null) {
      if (!BANNED.has(m[2])) continue;
      violations.push({
        file: file.path,
        line: lineOf(file.content, m.index),
        column: 0,
        message: `Second assertion library '${m[2]}'. The suite asserts with node:assert and supertest expectations only - a new development dependency here is a supply-chain surface the maintainers have to watch, and a second failure format to read from a matrix job.`,
      });
    }
  }
  return violations;
}
