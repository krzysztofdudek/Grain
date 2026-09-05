// WHAT   every `uses:` reference to a third-party action names a 40-character
//        commit SHA, followed by a `# vX.Y.Z` comment. A local action
//        (`./...`) and a reusable workflow in this repository are exempt.
// WHY    a tag is a mutable pointer someone else controls. An action pinned to
//        `@v4` runs whatever that owner (or whoever compromises them) points
//        the tag at, inside a job that has this repository's token - and this
//        project publishes an OSSF Scorecard result, so the pinning discipline
//        is a claim it makes about itself in public, not only an internal
//        preference. The trailing version comment is what keeps a wall of
//        hexadecimal reviewable and lets dependabot rewrite the pair together.
//        All twenty-two references in the four workflows hold this today.
// NEXT   replace the tag with the commit SHA it currently resolves to and add
//        `# <tag>` after it.

const USES = /^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/gm;

export function check (ctx) {
  const violations = [];
  for (const file of ctx.files) {
    USES.lastIndex = 0;
    let m;
    let line = 0;
    while ((m = USES.exec(file.content)) !== null) {
      line = file.content.slice(0, m.index).split('\n').length;
      const ref = m[1];
      const rest = m[2] || '';

      if (ref.startsWith('./') || ref.startsWith('.\\')) continue;

      const at = ref.lastIndexOf('@');
      if (at === -1) {
        violations.push({
          file: file.path,
          line,
          column: 0,
          message: `\`uses: ${ref}\` names no version at all, so the job runs whatever that action's default branch holds at the moment it starts.`,
        });
        continue;
      }

      const version = ref.slice(at + 1);
      if (!/^[0-9a-f]{40}$/.test(version)) {
        violations.push({
          file: file.path,
          line,
          column: 0,
          message: `\`uses: ${ref}\` is pinned to a mutable ref. A tag is a pointer its owner can move, and this job carries the repository's token - pin the 40-character commit SHA and keep the tag in a trailing comment.`,
        });
        continue;
      }

      if (!/#\s*\S/.test(rest)) {
        violations.push({
          file: file.path,
          line,
          column: 0,
          message: 'Pinned SHA carries no trailing version comment, so nobody reviewing this file can tell which release it is.',
        });
      }
    }
  }
  return violations;
}
