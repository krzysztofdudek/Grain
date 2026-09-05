// A page must carry, on its <html> element, a replace into the shared layout
// fragment that passes its own body and a menu id:
//
//   th:replace="~{fragments/layout :: layout (~{::body},'owners')}"
//
// Matched on text because there is no HTML grammar available to the checker;
// the pattern is tight enough that a partial or misspelled invocation is
// reported rather than silently accepted.
const LAYOUT_CALL = /th:replace\s*=\s*"~\{\s*fragments\/layout\s*::\s*layout\s*\(\s*~\{\s*::\s*body\s*\}\s*,\s*'([^']*)'\s*\)\s*\}"/;

export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    const match = LAYOUT_CALL.exec(file.content);
    if (match && match[1].trim() !== '') continue;
    if (match) {
      violations.push({
        file: file.path,
        line: lineOf(file.content, match.index),
        column: 0,
        message: 'page composes the layout fragment but passes an empty menu id — the navigation entry for this page would never be highlighted',
      });
      continue;
    }
    violations.push({
      file: file.path,
      line: 1,
      column: 0,
      message: "page does not compose the shared layout — expected th:replace=\"~{fragments/layout :: layout (~{::body},'<menu>')}\" on the <html> element; without it the page renders with no navigation, no footer and no stylesheet",
    });
  }
  return violations;
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}
