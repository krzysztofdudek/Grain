// This is the contract on the application node's `settings` port. Anything that
// consumes that port and is itself a prototype mixed onto a node HTTP object
// must satisfy it.
//
// WHAT   a prototype module must not require the application module or the
//        factory, under any relative path. The application arrives on `this`.
// WHY    the factory builds an app by mixing the application prototype into a
//        function and hanging per-app copies of these two prototypes off it;
//        the application then re-points each live request and response at those
//        copies as it dispatches. So by the time any code here runs, the
//        application is already reachable as `this.app` (or `this.req.app` on
//        the response). Requiring it instead would close a load-time cycle -
//        factory requires application requires prototype requires application -
//        and node would resolve that by handing one of the three a
//        half-initialised object. Reading it off `this` also keeps the
//        per-application prototype chain intact: mounted sub-applications
//        inherit settings from their parent, and a module-level reference would
//        see the wrong app entirely.
// NEXT   read the application from `this.app`, or from `this.req.app` where
//        `this` is a response.

const FORBIDDEN = /require\(\s*(['"])(\.{1,2}\/(?:[^'"]*\/)?(?:application|express))(?:\.js)?\1\s*\)/g;

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
    FORBIDDEN.lastIndex = 0;
    let m;
    while ((m = FORBIDDEN.exec(source)) !== null) {
      violations.push({
        file: file.path,
        line: lineOf(file.content, m.index),
        column: 0,
        message: `Requires '${m[2]}'. A prototype grafted onto a node HTTP object reaches the application through \`this.app\` (or \`this.req.app\`) at call time - requiring it closes a load-time cycle and pins the module to one application, so a mounted sub-application would read its parent's settings.`,
      });
    }
  }
  return violations;
}
