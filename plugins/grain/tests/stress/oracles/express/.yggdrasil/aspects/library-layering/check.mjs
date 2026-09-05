// WHAT   each published module may require only the intra-library modules its
//        layer is allowed to see. The budget below is the whole rule; a module
//        that is not in the table may require nothing from the library.
// WHY    node resolves a require cycle by handing the second requirer a
//        half-initialised exports object. In a library whose modules are
//        prototypes assembled at load time, that failure is silent and
//        arrives as an undefined method at request time, in the consumer's
//        application, not here. The budget below is not a preference: it is the
//        shape that keeps the graph a DAG.
//
//        entry     lib/express.js     -> application, request, response
//        core      lib/application.js -> view, utils
//        prototype lib/response.js    -> utils
//        prototype lib/request.js     -> (nothing)
//        support   lib/utils.js       -> (nothing)
//        support   lib/view.js        -> (nothing)
//
//        The prototypes are the interesting row. Both of them need the
//        application at run time, and neither may require it - they read it off
//        the live object as `this.app` or `this.req.app`. That indirection is
//        the reason this table has no cycle in it while the running object
//        graph does.
//
//        The table is fail-closed on purpose: adding a module to lib/ without
//        adding a row here refuses it, which forces the question "what is this
//        module allowed to see" to be answered in the graph rather than in a
//        review comment.
// NEXT   route the dependency through a module the layer may already see, or
//        move the shared piece down into lib/utils.js or lib/view.js.

// Keyed by module basename: lib/ is flat, and keying this way is also what
// lets the rule be drilled against case files that do not live at lib/.
const BUDGET = {
  'express.js': ['./application', './request', './response'],
  'application.js': ['./view', './utils'],
  'response.js': ['./utils'],
  'request.js': [],
  'utils.js': [],
  'view.js': [],
};

const REQUIRE = /require\(\s*(['"])(\.[^'"]*)\1\s*\)/g;

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

function normalise (spec) {
  return spec.replace(/\.js$/, '');
}

export function check (ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.path.endsWith('.js')) continue;

    const allowed = BUDGET[file.path.split('/').pop()];
    const source = stripComments(file.content);

    REQUIRE.lastIndex = 0;
    let m;
    while ((m = REQUIRE.exec(source)) !== null) {
      const spec = normalise(m[2]);
      const line = lineOf(file.content, m.index);

      if (allowed === undefined) {
        violations.push({
          file: file.path,
          line,
          column: 0,
          message: `This module has no row in the layering budget, so it may not require '${m[2]}'. Add its allowed intra-library requires to the table in this rule, deliberately, before the module ships.`,
        });
        continue;
      }

      if (!allowed.includes(spec)) {
        const budget = allowed.length === 0 ? 'nothing from this library' : allowed.join(', ');
        violations.push({
          file: file.path,
          line,
          column: 0,
          message: `Requires '${m[2]}', which is outside this layer's budget (${budget}). Node resolves a require cycle by handing back a half-built exports object, and in a library of load-time prototypes that surfaces as an undefined method in someone else's application.`,
        });
      }
    }
  }
  return violations;
}
