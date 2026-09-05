// vendor/generated-banner (enforced, errs: under)
//
// A vendored module opens with a banner that (a) says it is generated and must not be edited and
// (b) names the command that regenerates it. These files are committed and look like ordinary source;
// without the banner a fix lands here, survives until the next regeneration and then vanishes with
// nothing in the diff to explain it.
//
// Checked on the first two lines only: a banner further down is a banner a reader has already scrolled
// past.

const GENERATED = /^\s*\/\/\s*GENERATED\b/;
const NAMES_COMMAND = /build-relations\.mjs/;

export function check(ctx) {
  const violations = [];

  for (const file of ctx.files) {
    const head = file.content.split('\n', 2);
    const first = head[0] || '';
    const second = head[1] || '';

    if (!GENERATED.test(first)) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message:
          `Vendored module does not open with a generated banner.\n` +
          `These files are produced mechanically from an upstream checkout and committed, so they look ` +
          `exactly like hand-written source: a fix made here lives until the next regeneration and then ` +
          `disappears with nothing in the diff to explain it.\n` +
          `Add the banner the regeneration script writes as the first line, or regenerate the file.`,
      });
      continue;
    }

    if (!NAMES_COMMAND.test(first) && !NAMES_COMMAND.test(second)) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message:
          `Generated banner does not name the command that regenerates this file.\n` +
          `"Do not edit" without "edit this instead" is an instruction nobody can act on, and the ` +
          `reader who needs it is by definition the one who does not already know.\n` +
          `Name the regeneration script in the banner, as the script itself writes it.`,
      });
    }
  }

  return violations;
}
