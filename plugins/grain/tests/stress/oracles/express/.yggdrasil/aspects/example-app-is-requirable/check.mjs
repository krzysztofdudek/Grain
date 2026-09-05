// WHAT   an example's index.js assigns the application it builds to
//        `module.exports`.
// WHY    the house form here is `var app = module.exports = express()`, and it
//        is not decoration: it is what lets an acceptance suite require the
//        example and drive the real thing over HTTP. An example that does not
//        export its app cannot be tested at all, which is how an example goes
//        stale - it keeps looking right in the readme while the API it
//        demonstrates moves underneath it. Six examples in this repository do
//        not export, which is why this rule is advisory rather than blocking.
// NEXT   write `var app = module.exports = express()` and let the acceptance
//        suite mount it.

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
    if (!file.path.endsWith('index.js')) continue;
    const source = stripComments(file.content);
    if (/\bmodule\.exports\s*=/.test(source)) continue;
    violations.push({
      file: file.path,
      line: 1,
      column: 0,
      message: 'Exports nothing, so no acceptance suite can mount this example. Write `var app = module.exports = express()` - an example nothing executes is documentation that stops being true without anyone noticing.',
    });
  }
  return violations;
}
