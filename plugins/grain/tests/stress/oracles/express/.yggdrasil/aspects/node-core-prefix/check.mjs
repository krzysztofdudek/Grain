// WHAT   `require('fs')` and friends are refused; `require('node:fs')` is the
//        only accepted form.
// WHY    a bare built-in name can be shadowed by a package of the same name
//        published to the registry, so the prefix is what makes the specifier
//        unambiguous rather than merely conventional. All 89 built-in requires
//        in this repository already use it - library, tests and examples alike
//        - so a bare one is a regression, not a style opinion.
// NEXT   prefix the specifier with `node:`.

const CORE = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
  'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline',
  'repl', 'stream', 'string_decoder', 'timers', 'tls', 'trace_events', 'tty',
  'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

const REQUIRE = /require\(\s*(['"])([^'"]+)\1\s*\)/g;

// Blank out comment bodies while preserving byte offsets, so a rule about code
// never fires on a line somebody commented out.
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
    // block
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
      const spec = m[2];
      if (!CORE.has(spec)) continue;
      violations.push({
        file: file.path,
        line: lineOf(file.content, m.index),
        column: m.index - file.content.lastIndexOf('\n', m.index - 1) - 1,
        message: `Built-in module required as '${spec}'. Use 'node:${spec}' so the specifier cannot be shadowed by a published package of the same name.`,
      });
    }
  }
  return violations;
}
