// hooks/verb-exists (enforced, errs: under)
//
// Each hook configuration must parse, must invoke the CLI entry point, and must name only verbs the
// dispatcher handles. A hook has no user in front of it: when it breaks, the host swallows the failure
// and the tool simply stops speaking — which looks exactly like it correctly having nothing to say.
//
// Host coverage is deliberately NOT compared across files: the hosts offer different events.

const DISPATCH = 'plugins/grain/engine/grain.mjs';

/** Every string value anywhere in a parsed JSON value. */
function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) strings(v, out);
  return out;
}

export function check(ctx) {
  const violations = [];

  let source;
  try {
    source = ctx.fs.read(DISPATCH);
  } catch {
    violations.push({
      message:
        `Cannot read the dispatcher at ${DISPATCH}.\n` +
        `This rule checks that every verb a hook names is one the dispatcher handles, so it needs to ` +
        `read that file.\n` +
        `Declare a relation from the hook node to the dispatcher node, or fix the path.`,
      line: 1,
      column: 0,
    });
    return violations;
  }
  const dispatched = new Set([
    ...[...source.matchAll(/case '([\w-]+)':/g)].map((m) => m[1]),
    ...[...source.matchAll(/cmd === '([\w-]+)'/g)].map((m) => m[1]),
  ]);

  for (const file of ctx.files) {
    let parsed;
    try {
      parsed = JSON.parse(file.content);
    } catch (e) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message:
          `Hook configuration is not valid JSON (${e.message}).\n` +
          `The host reads this file at session start; an unparseable one drops every hook it declares ` +
          `and says nothing about it.\n` +
          `Fix the JSON.`,
      });
      continue;
    }

    for (const s of strings(parsed)) {
      if (!s.includes('grain.mjs')) continue;
      if (!/bin[/\\\\]+grain\.mjs/.test(s)) {
        violations.push({
          file: file.path,
          line: 1,
          column: 0,
          message:
            `Hook command reaches the product somewhere other than the CLI entry point: ${s}\n` +
            `The entry point owns the process contract every invocation needs — the memory-bounded ` +
            `re-exec, the error funnel, the stdout drain — and a hook that skips it inherits none of it.\n` +
            `Invoke bin/grain.mjs.`,
        });
        continue;
      }
      const m = /grain\.mjs["']?\s+([\w-]+)/.exec(s);
      if (!m) {
        violations.push({
          file: file.path,
          line: 1,
          column: 0,
          message:
            `Hook command names no verb: ${s}\n` +
            `Run with no verb, the entry point prints usage into the host's hook channel on every event.\n` +
            `Name the hook verb this event should run.`,
        });
        continue;
      }
      if (dispatched.has(m[1])) continue;
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message:
          `Hook names the verb '${m[1]}', which the dispatcher does not handle.\n` +
          `The host will run it, the command will fail, the host will swallow the failure, and the tool ` +
          `will simply stop speaking at that moment — indistinguishable from it correctly having nothing ` +
          `to say.\n` +
          `Point the hook at a verb the dispatcher handles.`,
      });
    }
  }

  return violations;
}
