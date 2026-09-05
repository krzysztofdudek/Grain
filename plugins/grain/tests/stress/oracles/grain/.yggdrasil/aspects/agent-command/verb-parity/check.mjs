// agent-command/verb-parity (enforced, errs: exact)
//
// Both directions. Every verb a command document invokes must exist in the dispatcher; every verb the
// dispatcher handles must be invoked by a command document or be on the exemption list below.
//
// The dispatcher's verbs are read out of its source text in the two forms it uses — the switch cases of
// its single dispatch switch, and the `cmd === '...'` guards ahead of it that handle the host hooks and
// the development aliases. Reading the text rather than importing the module keeps the check from
// executing product code to reach a verdict about it.

const DISPATCH = 'plugins/grain/engine/grain.mjs';

// Exempt from needing a command document, each for a stated reason.
const EXEMPT = new Map([
  ['session-context', 'a host hook: invoked by the editor at session start, never typed'],
  ['check-hook', 'a host hook: invoked after an edit and before a write, never typed'],
  ['edit-hook', 'a host hook: invoked before an edit, never typed'],
  ['read-hook', 'a host hook: invoked after a read, never typed'],
  ['how-hook', 'a host hook: invoked on a user prompt, never typed'],
  ['commit-hook', 'a host hook: invoked before a shell command, never typed'],
  ['mutate-test', 'a development alias whose documented counterpart is the self-test command'],
  ['version', 'a one-liner with nothing to document'],
  ['help', 'a one-liner with nothing to document'],
]);

export function check(ctx) {
  const violations = [];

  let source;
  try {
    source = ctx.fs.read(DISPATCH);
  } catch {
    violations.push({
      message:
        `Cannot read the dispatcher at ${DISPATCH}.\n` +
        `This rule compares the verbs the dispatcher handles against the verbs the command documents ` +
        `invoke, so it needs to read that file.\n` +
        `Declare a relation from the command node to the dispatcher node, or fix the path.`,
      line: 1,
      column: 0,
    });
    return violations;
  }

  const dispatched = new Set([
    ...[...source.matchAll(/case '([\w-]+)':/g)].map((m) => m[1]),
    ...[...source.matchAll(/cmd === '([\w-]+)'/g)].map((m) => m[1]),
  ]);

  const invoked = new Map(); // verb -> file that invokes it
  for (const file of ctx.files) {
    for (const m of file.content.matchAll(/^!`[^`]*bin\/grain\.mjs"?\s+([\w-]+)/gm)) {
      if (!invoked.has(m[1])) invoked.set(m[1], file.path);
    }
  }

  for (const [verb, file] of invoked) {
    if (dispatched.has(verb)) continue;
    violations.push({
      file,
      line: 1,
      column: 0,
      message:
        `Command document invokes '${verb}', which the dispatcher does not handle.\n` +
        `The command appears in the menu and fails when a user picks it — the one moment no test run is ` +
        `watching.\n` +
        `Rename the invocation to a verb the dispatcher handles, or delete the document.`,
    });
  }

  for (const verb of [...dispatched].sort()) {
    if (invoked.has(verb) || EXEMPT.has(verb)) continue;
    violations.push({
      line: 1,
      column: 0,
      message:
        `The dispatcher handles '${verb}', but no command document invokes it.\n` +
        `A command nobody can reach is a command nobody uses: it works when called by hand and ships ` +
        `with no route to it from the surface a user actually has.\n` +
        `Add a command document that invokes '${verb}', or add it to this rule's exemption list with the ` +
        `reason it needs none.`,
    });
  }

  return violations;
}
