// agent-command/contract (enforced, errs: under)
//
// Frontmatter with a description and an allowed-tools list; exactly one execution line; that line runs
// the plugin's CLI entry point with one verb. Everything checked here is a property of the file's own
// text, so there is nothing to approximate.

const EXEC_LINE = /^!`(.*)`\s*$/;
const ENTRY = /bin\/grain\.mjs/;

function frontmatter(content) {
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('\n---', 3);
  if (end < 0) return null;
  return content.slice(3, end);
}

export function check(ctx) {
  const violations = [];

  for (const file of ctx.files) {
    const fm = frontmatter(file.content);
    if (fm === null) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message:
          `Command document has no YAML frontmatter block.\n` +
          `The host reads the description and the tool permission out of it; without the block the ` +
          `command has no menu entry and is refused when invoked.\n` +
          `Open the file with a --- delimited block carrying at least description: and allowed-tools:.`,
      });
      continue;
    }
    for (const key of ['description', 'allowed-tools']) {
      if (new RegExp('^' + key + ':', 'm').test(fm)) continue;
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message:
          `Frontmatter is missing '${key}:'.\n` +
          (key === 'description'
            ? `The description is the only thing a user picking from a command menu sees; without it the ` +
              `command is an unlabelled entry.`
            : `Without the tool permission the host refuses to run the command, and the failure surfaces ` +
              `only when somebody types it.`) +
          `\nAdd '${key}:' to the frontmatter block.`,
      });
    }

    const lines = file.content.split('\n');
    const execs = [];
    lines.forEach((line, i) => {
      const m = EXEC_LINE.exec(line);
      if (m) execs.push({ line: i + 1, body: m[1] });
    });

    if (execs.length === 0) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message:
          `Command document contains no execution line.\n` +
          `It is a menu entry that does nothing when picked: the host shows the command, the user runs ` +
          `it, and no answer is produced.\n` +
          "Add exactly one execution line that runs the plugin's CLI entry point with this command's verb.",
      });
    } else if (execs.length > 1) {
      violations.push({
        file: file.path,
        line: execs[1].line,
        column: 0,
        message:
          `Command document contains ${execs.length} execution lines; exactly one is allowed.\n` +
          `Two commands produce one undelimited blob of output, and the model relaying it has to guess ` +
          `where one answer ends and the next begins.\n` +
          `Split the extra invocation into its own command document.`,
      });
    }

    for (const e of execs) {
      if (ENTRY.test(e.body)) continue;
      violations.push({
        file: file.path,
        line: e.line,
        column: 0,
        message:
          `Execution line does not run the plugin's CLI entry point.\n` +
          `The entry point owns the process contract every invocation depends on — the baseline-compiler ` +
          `re-exec that keeps a query inside its memory budget, the top-level error funnel, and draining ` +
          `stdout before exit so a large answer is not truncated into a pipe.\n` +
          `Invoke bin/grain.mjs, not an engine module and not a bare name resolved from the path.`,
      });
    }
  }

  return violations;
}
