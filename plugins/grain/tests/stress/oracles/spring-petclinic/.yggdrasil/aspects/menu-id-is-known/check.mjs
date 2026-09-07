const LAYOUT_PATH = 'src/main/resources/templates/fragments/layout.html';

// Navigation entries in the layout look like:
//   th:replace="~{::menuItem ('/owners/find','owners','find owners','search',#{findOwners})}"
// The second argument is the id a page must pass to be highlighted.
const MENU_ITEM = /::\s*menuItem\s*\(\s*'[^']*'\s*,\s*'([^']*)'/g;

// A page declares which entry it belongs to in its layout call:
//   th:replace="~{fragments/layout :: layout (~{::body},'owners')}"
const LAYOUT_CALL = /fragments\/layout\s*::\s*layout\s*\([^)]*?,\s*'([^']*)'\s*\)/g;

export function check(ctx) {
  const violations = [];

  const layout = ctx.files.find((f) => f.path === LAYOUT_PATH);
  if (!layout) {
    return [{ message: `layout fragment ${LAYOUT_PATH} is missing — the set of valid menu ids is defined there and cannot be derived without it` }];
  }

  const known = new Set();
  let entry;
  MENU_ITEM.lastIndex = 0;
  while ((entry = MENU_ITEM.exec(layout.content)) !== null) known.add(entry[1]);
  if (known.size === 0) {
    return [{ file: LAYOUT_PATH, line: 1, column: 0, message: 'no navigation entries found in the layout fragment — every page would render with nothing highlighted' }];
  }

  for (const file of ctx.files) {
    if (file.path === LAYOUT_PATH) continue;
    LAYOUT_CALL.lastIndex = 0;
    let call;
    while ((call = LAYOUT_CALL.exec(file.content)) !== null) {
      const id = call[1];
      if (known.has(id)) continue;
      violations.push({
        file: file.path,
        line: lineOf(file.content, call.index),
        column: 0,
        message: `menu id '${id}' matches no navigation entry (${[...known].sort().join(', ')}) — the page renders with nothing highlighted and no error anywhere`,
      });
    }
  }
  return violations;
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}
