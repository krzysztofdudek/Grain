// The shared field fragments take their label as the first argument:
//
//   ~{fragments/inputField  :: input  (#{firstName}, 'firstName', 'text')}
//   ~{fragments/selectField :: select (#{type},      'type',      ${types})}
//
// That first argument must be a message key. A quoted English string there is
// invisible to the repository's own untranslated-text test, because that test
// only inspects text between tags.
const FRAGMENT_CALL = /~\{\s*fragments\/(inputField|selectField)\s*::\s*(input|select)\s*\(\s*([^,]+),/g;

export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    FRAGMENT_CALL.lastIndex = 0;
    let match;
    while ((match = FRAGMENT_CALL.exec(file.content)) !== null) {
      const label = match[3].trim();
      if (label.startsWith('#{')) continue;
      if (label.startsWith('${')) continue; // a value computed by the page, judged elsewhere
      violations.push({
        file: file.path,
        line: lineOf(file.content, match.index),
        column: 0,
        message: `field label ${label} is a literal, not a message key — it renders in English in all eleven locales, and the untranslated-text test cannot see it because it is an attribute argument rather than text between tags`,
      });
    }
  }
  return violations;
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}
