// grain engine · the verbalizer: units, shapes, and the English a convention or a deviation is said in
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.

// ===== VERBALIZER =====
export const unitOf = kind =>
  ({
    method: 'methods',
    type: 'types',
    file: 'files',
    module: 'directories',
    catch: 'catch blocks',
    finally: 'finally blocks',
    case: 'named callbacks',
  })[kind] || kind;
// §061 — a catch/finally clause has no name field of its own in any shipped grammar (a catch/finally block is
// anonymous by nature — it is not a named declaration); `extractScopes`' blockScope still gives it a `.name`
// (borrowed from its enclosing method/type, "named after its owner") purely so it survives as its own mined
// population instead of being swept up by the anonymous-scope filter (`all[i].name === '<anon>'`). That borrowed
// string must never be SPOKEN as if it were the clause's own declared name — `catch \`findOwner\`` reads as
// though a catch block were named `findOwner`, the exact fabrication instrument A caught on PetController.java.
// Every render site that turns a scope into a "kind `name`" phrase for a human goes through one of these two
// helpers instead of inlining `${s.kind} \`${s.name}\`` — so the honesty fix lives in one place.
export const ANON_SCOPE_KINDS = new Set(['catch', 'finally']);
// for text that already says "Your ${kind} …" — genuine declarations keep exactly that shape (`method
// \`findOwner\``); an anonymous clause reads "catch in `findOwner`", never "catch `findOwner`".
export const scopeNamed = s => (ANON_SCOPE_KINDS.has(s.kind) ? `${s.kind} in` : s.kind) + ` \`${s.name}\``;
// for text that names the scope with no leading kind word at all (a waiver's "`findOwner` (line 42) …") — a
// genuine declaration stays bare (unchanged from before this fact existed); only an anonymous clause needs the
// kind spelled out here, since without it the borrowed name alone would read as the ENCLOSING declaration itself.
export const scopeBacktick = s =>
  ANON_SCOPE_KINDS.has(s.kind) ? `${s.kind} in \`${s.name}\`` : `\`${s.name}\``;
// a statement shape cut at a node boundary, never mid-token: `expression_statement(call_expression(member_expression,…))`
export const shapeShort = (sh, max = 64) => {
  if (sh.length <= max) return sh;
  let cut = sh.lastIndexOf(',', max);
  if (cut < max / 2) cut = sh.lastIndexOf('(', max);
  if (cut < 0) cut = max;
  const head = sh.slice(0, cut);
  const open = (head.match(/\(/g) || []).length - (head.match(/\)/g) || []).length;
  return head + ',…' + ')'.repeat(Math.max(0, open));
};
// the casing style a name shape denotes, in words — a reader should not have to reverse-engineer `(Ua)+`
export function shapeWords(shape) {
  const m = {
    '(Ua)+': 'PascalCase',
    'a(Ua)+': 'camelCase',
    'a(_a)+': 'snake_case',
    'U(_U)+': 'UPPER_SNAKE_CASE',
    a: 'a single lowercase word',
    U: 'a single uppercase word',
    'a(-a)+': 'kebab-case',
    'a(.a)+': 'dotted lowercase (like `a.b`)',
    'a(.a)+(Ua)+': 'dotted with a PascalCase tail',
    '(_a)+': 'underscore-prefixed lowercase',
    '(_)+a(_)+': 'dunder-style (`__x__`)',
    aU: 'lowercase with an uppercase tail (like `iOS`)',
    'a(Ua)+(_a)+': 'camelCase with a snake tail',
    '(Ua)+(_a)+': 'PascalCase with a snake tail',
    '(Ua)+_(Ua)+': 'PascalCase pairs joined by `_` (like `TestX_Y`)',
    'a(.a)+(-a)+': 'dotted kebab',
    'a(-a)+(.a)+': 'kebab-case with a dotted tail (like `a-b.c`)',
    'a(Ua)+(.a)+': 'camelCase with a dotted tail (like `aB.c`)',
    '(Ua)+(.a)+': 'PascalCase with a dotted tail (like `Ab.c`)',
    'a(_a)+(.a)+': 'snake_case with a dotted tail (like `a_b.c`)',
  };
  if (m[shape]) return m[shape];
  const parts = [];
  if (/\(Ua\)\+/.test(shape)) parts.push('PascalCase words');
  if (/\(_a\)\+/.test(shape)) parts.push('snake parts');
  if (/\(-a\)\+/.test(shape)) parts.push('kebab parts');
  if (/\(\.a\)\+/.test(shape)) parts.push('dots');
  return parts.length ? 'shaped like `' + shape + '` (' + parts.join(', ') + ')' : null;
}
export function verbalize(f, exNames) {
  const unit = unitOf(f.kind);
  const neg = f.exp === 'false';
  const p = f.pid;
  // an accepted marker with a real statistical alternative (§altMarkerFor) is a two-way split, not a single rule —
  // "X (162) or Y (5)" instead of accusing Y's carriers of departing from a convention they equally satisfy
  const alt = f.altMarker;
  const ownPhrase = name =>
    alt ? `\`${name}\` (${f.sraw - f.deviantsN}) or \`${alt.name}\` (${alt.n})` : `\`${name}\``;
  if (p.startsWith('auto.has:'))
    return `${unit} here ${neg ? 'never contain' : 'always contain'} a \`${p.slice(9)}\``;
  if (p.startsWith('auto.call:')) return `${unit} here ${neg ? 'never call' : 'call'} \`${p.slice(10)}\``;
  if (p.startsWith('auto.deco:'))
    return `${unit} here ${neg ? 'are not annotated with' : 'are annotated with'} ${ownPhrase(p.slice(10))}`;
  if (p.startsWith('auto.imp:')) return `${unit} here ${neg ? 'do not import' : 'import'} \`${p.slice(9)}\``;
  // §033: the pid stays `auto.extends:` (a breaking rename for a cosmetic gain — see the issue), but the SENTENCE
  // says "implement" when the target is known, repo-wide, to be an interface conformed to rather than a class
  // inherited from — `f.heritageKind`, attached once per fact wherever one is built (§heritageKindOf), from
  // extractScopes' own supKind. Unclassified — every language without a syntactic extends/implements distinction,
  // or a name classified both ways — keeps "extend", exactly as before this fact existed.
  if (p.startsWith('auto.extends:')) {
    const verb = f.heritageKind === 'impl' ? 'implement' : 'extend';
    return `${unit} here ${neg ? `do not ${verb}` : verb} ${ownPhrase(p.slice(13))}`;
  }
  if (p.startsWith('auto.returns:'))
    return `${unit} here ${neg ? 'do not declare a return type of' : 'declare a return type of'} ${ownPhrase(p.slice(13))}`;
  if (p.startsWith('auto.ptype:'))
    return `${unit} here ${neg ? 'take no parameter of type' : 'take a parameter of type'} \`${p.slice(11)}\``;
  if (p.startsWith('auto.stshape:'))
    return `${unit} here ${neg ? 'never use' : 'use'} the structure \`${shapeShort(p.slice(13))}\``;
  if (p === 'auto.nameshape' || p === 'auto.filenameshape') {
    const w = shapeWords(f.exp);
    return `${unit} here are named ${w ? w + ' ' : 'like '}(${[...new Set(exNames)]
      .slice(0, 3)
      .map(n => '`' + n + '`')
      .join(', ')})`;
  }
  if (p === 'auto.first1') return `${unit} here start with a \`${f.exp}\``;
  if (p === 'auto.ret') return `${unit} here return a \`${f.exp}\``;
  if (p === 'auto.arity') return `${unit} here take ${f.exp} parameter(s)`;
  if (p === 'auto.varshape') return `${unit} here name local variables like \`${f.exp}\``;
  if (p === 'auto.ctorshape')
    return `${unit} here declare their constructor ${{ primary: 'inline in the type header (a primary constructor)', classic: 'as a classic body constructor', both: 'both inline in the header and as a classic body constructor', none: 'nowhere — no explicit constructor' }[f.exp] || `as \`${f.exp}\``}`;
  if (p === 'auto.filebirth')
    return `${unit} here ${f.exp === 'new' ? 'usually start a new file' : 'are usually added to an existing file'}`;
  if (p.startsWith('auto.dir')) return `${unit} here live under \`${f.exp}/\``;
  if (p === 'auto.modexport') return `${unit} here export via \`${f.exp}\``;
  if (p === 'auto.namesuffix') return `${unit} here are named ending in \`${f.exp}\``;
  if (p === 'auto.mods')
    return f.exp === 'none'
      ? `${unit} here carry no modifiers`
      : `${unit} here carry the modifiers \`${f.exp}\``;
  if (p === 'auto.memberorder') return `${unit} here order their members \`${f.exp}\``;
  if (p.startsWith('auto.lex:')) return `${unit} here ${lexWords(p.slice(9), f.exp)}`;
  if (p.startsWith('auto.mod')) return `${unit}: ${p.slice(8)} = \`${f.exp}\``;
  return `${p} = ${f.exp}`;
}
// the deviation phrase is the negation of the verbalizer row — "does not", or "is `<observed>`" for categoricals (§11.2)
// lexical surfaces in words: (surface, value) → predicate
export function lexWords(surface, v) {
  if (surface === 'quote')
    return v === 'single'
      ? 'quote strings with single quotes'
      : v === 'double'
        ? 'quote strings with double quotes'
        : `quote strings ${v}`;
  if (surface === 'semi')
    return v === 'semi'
      ? 'end statements with semicolons'
      : v === 'nosemi'
        ? 'end statements without semicolons'
        : `end statements ${v}`;
  if (surface === 'indent')
    return v === 'tab'
      ? 'indent with tabs'
      : /^space\d$/.test(v)
        ? `indent with ${v.slice(5)} spaces`
        : `indent ${v}`;
  if (surface === 'bom')
    return v === 'bom' ? 'start with a UTF-8 byte-order mark' : 'start without a byte-order mark';
  if (surface === 'directive')
    return v === 'none' ? 'start without a directive' : `start with the directive \`${v}\``;
  if (surface === 'decl') return `declare variables with \`${v}\``;
  if (surface === 'imports') {
    const [ord, grp] = v.split('-');
    return `${ord === 'sorted' ? 'sort imports' : 'do not sort imports'}, ${grp === 'grouped' ? 'in blank-line-separated groups' : 'in one block'}`;
  }
  return `have ${surface} = \`${v}\``;
}
export function deviationPhrase(f, obs) {
  const p = f.pid;
  const neg = f.exp === 'false';
  if (p.startsWith('auto.lex:')) {
    const w = lexWords(p.slice(9), obs);
    return w.replace(
      /^(quote|end|indent|start|declare|have|sort|do)\b/,
      m =>
        ({
          quote: 'quotes',
          end: 'ends',
          indent: 'indents',
          start: 'starts',
          declare: 'declares',
          have: 'has',
          sort: 'sorts',
          do: 'does',
        })[m]
    );
  }
  if (p.startsWith('auto.has:'))
    return neg ? `contains a \`${p.slice(9)}\`` : `does not contain a \`${p.slice(9)}\``;
  if (p.startsWith('auto.call:'))
    return neg ? `calls \`${p.slice(10)}\`` : `does not call \`${p.slice(10)}\``;
  if (p.startsWith('auto.deco:'))
    return neg ? `is annotated with \`${p.slice(10)}\`` : `is not annotated with \`${p.slice(10)}\``;
  if (p.startsWith('auto.imp:'))
    return neg ? `imports \`${p.slice(9)}\`` : `does not import \`${p.slice(9)}\``;
  // §033 — see verbalize's own note just above it; `f.heritageKind` is attached wherever the fact/steer object is built
  if (p.startsWith('auto.extends:')) {
    const isImpl = f.heritageKind === 'impl';
    return neg
      ? `${isImpl ? 'implements' : 'extends'} \`${p.slice(13)}\``
      : `does not ${isImpl ? 'implement' : 'extend'} \`${p.slice(13)}\``;
  }
  if (p.startsWith('auto.returns:'))
    return neg
      ? `declares a return type of \`${p.slice(13)}\``
      : `does not declare a return type of \`${p.slice(13)}\``;
  if (p.startsWith('auto.ptype:'))
    return neg
      ? `takes a parameter of type \`${p.slice(11)}\``
      : `takes no parameter of type \`${p.slice(11)}\``;
  if (p.startsWith('auto.stshape:')) return neg ? `uses that structure` : `does not use that structure`;
  if (p === 'auto.nameshape' || p === 'auto.filenameshape') {
    const w = shapeWords(obs);
    return w ? `is ${w}` : `is shaped \`${obs}\``;
  }
  if (p === 'auto.namesuffix') return `is named ending in \`${obs}\``;
  if (p === 'auto.mods') return obs === 'none' ? 'carries no modifiers' : `carries the modifiers \`${obs}\``;
  if (p === 'auto.memberorder') return `orders its members \`${obs}\``;
  if (p.startsWith('auto.dir')) return `lives under \`${obs}/\``;
  return `is \`${obs}\``;
}
// Cargo.toml's OWN declared crate name (the `[package] name = "..."` line, dash/underscore-normalized exactly as
// Rust `use` paths reference it — §017): a small, independent re-implementation of the identical parse the vendored
// rust-resolve.mjs already does for the CALLING file's own crate. Duplicated, not imported: the vendored module's
// `readCrateName` isn't exported (and is "do not edit" — regenerated from Yggdrasil), and workspace discovery here
// runs at model-BUILD time (this file walks every workspace member), while the vendored one runs at resolve time
// (walking up from one file to ITS OWN nearest Cargo.toml) — two different callers, same small grammar.
export function readCargoCrateName(text) {
  let inPackage = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      inPackage = line === '[package]';
      continue;
    }
    if (!inPackage) continue;
    const m = line.match(/^name\s*=\s*["']([^"']+)["']/);
    if (m) return m[1].replace(/-/g, '_');
  }
  return undefined;
}
