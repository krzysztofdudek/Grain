// WHAT   `@api public` and `@api private` are refused; the tag is `@public` or
//        `@private`.
// WHY    the visibility tag is the only thing separating express's supported
//        surface from its internals - there is no other manifest of what a user
//        may call. Two spellings for one meaning means a reader (and any tool
//        that reads these comments) has to know both, and it makes "is this
//        private?" a question about which era of the file you are standing in.
//        The modern spelling is the majority everywhere except the private
//        helpers module, which was never converted. Fourteen occurrences remain
//        across three files, so this rule is advisory: it is a backlog with an
//        exact size, not a gate.
// NEXT   replace `@api private` with `@private` and `@api public` with
//        `@public`.

const LEGACY = /@api\s+(public|private|protected)\b/g;

function lineOf (content, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (content.charCodeAt(i) === 10) line++;
  return line;
}

export function check (ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.path.endsWith('.js')) continue;
    LEGACY.lastIndex = 0;
    let m;
    while ((m = LEGACY.exec(file.content)) !== null) {
      violations.push({
        file: file.path,
        line: lineOf(file.content, m.index),
        column: m.index - file.content.lastIndexOf('\n', m.index - 1) - 1,
        message: `Legacy visibility tag \`@api ${m[1]}\`. Use \`@${m[1]}\` - this tag is the only record of what is supported surface and what is internal, and two spellings for one meaning make that record ambiguous.`,
      });
    }
  }
  return violations;
}
