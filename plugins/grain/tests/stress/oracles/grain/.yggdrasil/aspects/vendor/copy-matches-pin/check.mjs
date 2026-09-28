// vendor/copy-matches-pin (enforced, errs: exact)
//
// The vendored Runes copy against its pin, file by file: every file under the copy is in the pin's `files`
// table with the sha256 of its bytes, and every file in the table is under the copy. The same comparison
// `npm run runes:check` makes before the suite runs, stated as law so a hand edit to the copy is refused by
// the graph and not only by the test gate.
//
// The pin sits beside the copy and names it by `dest` (a directory relative to the pin); every path in
// `files` is relative to that directory. The copy is text (modules, type declarations, JSON, patches), so
// hashing each subject file's content as UTF-8 is hashing its bytes.
import { createHash } from 'node:crypto';

const PIN = 'plugins/grain/engine/vendor/runes.pin.json';
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');

export function check(ctx) {
  const violations = [];
  let pin;
  try {
    pin = JSON.parse(ctx.fs.read(PIN));
  } catch (e) {
    return [{
      line: 1,
      column: 0,
      message:
        `Cannot read the Runes pin at ${PIN} (${e.message}).\n` +
        `The pin is the only record of which release the vendored copy is and what each of its files must hash to.\n` +
        `Restore it with \`npm run runes:update -- --tag <the release>\`.`,
    }];
  }
  const base = PIN.split('/').slice(0, -1).join('/') + '/' + String(pin.dest || 'runes').replace(/\/+$/, '') + '/';
  const listed = new Map(Object.entries(pin.files || {}));
  const seen = new Set();

  for (const file of ctx.files) {
    if (file.path === PIN || !file.path.startsWith(base)) continue;
    const rel = file.path.slice(base.length);
    seen.add(rel);
    const want = listed.get(rel);
    if (!want) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message:
          `${rel} is in the vendored Runes copy but not in its pin.\n` +
          `The copy is moved only by the vendoring tool, which lists every file it writes; a file it did not write is a ` +
          `hand addition that the next \`runes:update\` removes.\n` +
          `Put the change in Runes and move the pin, or delete the file.`,
      });
    } else if (sha256(file.content) !== want) {
      violations.push({
        file: file.path,
        line: 1,
        column: 0,
        message:
          `${rel} does not hash to what the pin lists for it (${want.slice(0, 12)}…).\n` +
          `It was edited in place. The copy is a Runes release byte for byte, and the next \`runes:update\` puts the ` +
          `release's bytes back with nothing in the diff to say where the fix went.\n` +
          `Put the fix in Runes and move the pin with \`npm run runes:update\`, or restore the file with it.`,
      });
    }
  }
  for (const rel of [...listed.keys()].sort()) {
    if (seen.has(rel)) continue;
    violations.push({
      file: PIN,
      line: 1,
      column: 0,
      message:
        `The pin lists ${rel}, and the vendored Runes copy does not have it.\n` +
        `A copy missing a file the release shipped is not that release.\n` +
        `Restore the copy with \`npm run runes:update -- --tag ${pin.tag || '<the pinned release>'}\`.`,
    });
  }
  return violations;
}
