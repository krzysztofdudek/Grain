// docs/internal-links-resolve (enforced, errs: under)
//
// Every relative markdown link must resolve to a file that exists. External addresses are somebody
// else's uptime and are skipped; a fragment is stripped before the lookup, because a stale heading
// anchor is a much smaller problem than a missing file.
//
// Existence is probed one path at a time (never by listing a directory), so the verdict's invalidation
// surface is exactly the set of files these documents point at.

const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const EXTERNAL = /^([a-zA-Z][a-zA-Z0-9+.-]*:|\/\/|#)/;

function resolveFrom(docPath, target) {
  const stack = docPath.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (stack.length === 0) return undefined; // escapes the repository root
      stack.pop();
      continue;
    }
    stack.push(seg);
  }
  return stack.join('/');
}

export function check(ctx) {
  const violations = [];

  for (const file of ctx.files) {
    const lines = file.content.split('\n');
    lines.forEach((text, i) => {
      for (const m of text.matchAll(LINK)) {
        const raw = m[1];
        if (EXTERNAL.test(raw)) continue;
        const target = raw.split('#')[0];
        if (!target) continue;
        const resolved = resolveFrom(file.path, target);
        if (resolved === undefined) {
          violations.push({
            file: file.path,
            line: i + 1,
            column: 0,
            message:
              `Link '${raw}' points above the repository root.\n` +
              `It cannot resolve for any reader, on any checkout.\n` +
              `Point it at a path inside the repository, or make it an absolute address.`,
          });
          continue;
        }
        let exists = false;
        try {
          exists = ctx.fs.exists(resolved) !== false;
        } catch {
          violations.push({
            file: file.path,
            line: i + 1,
            column: 0,
            message:
              `Cannot check whether '${raw}' exists — ${resolved} is outside what this document's ` +
              `component is allowed to read.\n` +
              `A link is a dependency on another part of the repository, and the graph is where that is ` +
              `declared.\n` +
              `Declare a relation to the component that owns ${resolved}, or link somewhere this ` +
              `document already depends on.`,
          });
          continue;
        }
        if (exists) continue;
        violations.push({
          file: file.path,
          line: i + 1,
          column: 0,
          message:
            `Link '${raw}' resolves to ${resolved}, which does not exist.\n` +
            `These documents carry the evidence for the claims made around them; a broken link removes ` +
            `that evidence at the exact moment a reader went looking for it.\n` +
            `Fix the path, or point at the document that replaced the one this link was written for.`,
        });
      }
    });
  }

  return violations;
}
