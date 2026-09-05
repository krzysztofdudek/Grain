// WHAT   a published module starts with the `/*! ... MIT Licensed */` banner
//        that names the project.
// WHY    these seven files are the only ones that land in a user's
//        node_modules - the manifest's `files` list is `LICENSE`, `Readme.md`,
//        `index.js` and `lib/`. The banner travels with them: it is where the
//        attribution and the licence grant actually reach the person who
//        vendored the code. Losing it on one file makes the package's licence
//        state depend on which file you happened to open.
// NEXT   copy the banner from any sibling module in lib/, keeping the
//        copyright lines intact.

export function check (ctx) {
  const violations = [];
  for (const file of ctx.files) {
    if (!file.path.endsWith('.js')) continue;

    const head = file.content.slice(0, 600);
    const banner = /^\/\*!\s*\n[\s\S]*?\*\//.exec(head);
    if (!banner) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message: 'Missing the leading `/*! ... */` licence banner that every published module carries.',
      });
      continue;
    }

    const text = banner[0];
    if (!/\bexpress\b/.test(text)) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message: 'The leading banner does not name the project, so a vendored copy of this file carries no attribution.',
      });
    }
    if (!/MIT Licensed/.test(text)) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message: 'The leading banner is missing the `MIT Licensed` line - the licence grant that ships with this file.',
      });
    }
  }
  return violations;
}
