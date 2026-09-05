// Reading a Yggdrasil graph: the YAML subset its files are written in, the glob/predicate semantics its
// `when:`/`mapping:` entries carry, and the reader that turns a `.yggdrasil/` directory into plain objects.
//
// Shared engine code, not an instrument. `grain propose` (engine/propose.mjs) writes such a graph and has to
// expand its own drafted predicates to know what they select; `tests/stress/reconstruct.mjs` reads a
// hand-written one to score grain against it. Both used to import this from reconstruct.mjs, which put a
// product command downstream of a test instrument — the code below moved here VERBATIM (ticket 104) and
// reconstruct.mjs re-exports it, so every existing consumer keeps the same names and the same behaviour.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';

// ==================================================================================================
// 1. A YAML subset parser.
//
// The grain plugin ships with ZERO runtime dependencies (`plugins/grain/package.json` carries devDependencies
// only, all of them tree-sitter grammars, and there is no node_modules/ under the plugin at all), so the `yaml`
// package is not available and adding it would give the plugin its first runtime dep for a test-only
// instrument. This parser covers exactly the subset the Yggdrasil graph files use — block mappings, block
// sequences, flow sequences and mappings, plain/single/double-quoted scalars including multi-line ones, and
// `|`/`>` block scalars — and nothing else. It was validated by diffing its output against the real `yaml`
// package over every graph file in the pattern repo (see the report). A construct outside the subset throws
// rather than silently mis-parsing.
// ==================================================================================================

const isBlank = l => /^\s*$/.test(l);
const isComment = l => /^\s*#/.test(l);
const indentOf = l => l.length - l.replace(/^ */, '').length;

// Strip a trailing `# ...` comment from a plain scalar. `#` only opens a comment after whitespace or at the
// start of the line, so `a#b` stays one scalar.
function stripTrailingComment(s) {
  let inS = false, inD = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inS) { if (c === "'") inS = false; continue; }
    if (inD) { if (c === '\\') { i++; continue; } if (c === '"') inD = false; continue; }
    if (c === "'") { inS = true; continue; }
    if (c === '"') { inD = true; continue; }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}

const DQ_ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', 0: '\x00', '\\': '\\', '"': '"', '/': '/' };
function unquote(raw) {
  const s = raw.trim();
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") return s.slice(1, -1).replace(/''/g, "'");
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    return s.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (m, g) => {
      if (g[0] === 'u' || g[0] === 'x') return String.fromCharCode(parseInt(g.slice(1), 16));
      return Object.prototype.hasOwnProperty.call(DQ_ESCAPES, g) ? DQ_ESCAPES[g] : g;
    });
  }
  return s;
}

function coerce(s) {
  if (s === '' || s === '~' || s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  return s;
}
// A scalar written quoted stays a string; only plain scalars are coerced.
const scalarFrom = raw => {
  const t = raw.trim();
  return t[0] === '"' || t[0] === "'" ? unquote(t) : coerce(t);
};

// ---- flow collections: `[a, b]`, `{k: v}`, nested, already joined into one line ----
function skipWs(src, i) { while (i.p < src.length && /\s/.test(src[i.p])) i.p++; }
function flowValue(src, i) {
  skipWs(src, i);
  const c = src[i.p];
  if (c === '[') {
    i.p++;
    const arr = [];
    for (;;) {
      skipWs(src, i);
      if (src[i.p] === ']') { i.p++; break; }
      arr.push(flowValue(src, i));
      skipWs(src, i);
      if (src[i.p] === ',') { i.p++; continue; }
      if (src[i.p] === ']') { i.p++; break; }
      throw new Error('yaml: bad flow sequence near ' + src.slice(i.p, i.p + 30));
    }
    return arr;
  }
  if (c === '{') {
    i.p++;
    const obj = {};
    for (;;) {
      skipWs(src, i);
      if (src[i.p] === '}') { i.p++; break; }
      const k = flowScalar(src, i, ':,}]');
      skipWs(src, i);
      if (src[i.p] !== ':') throw new Error('yaml: bad flow mapping near ' + src.slice(i.p, i.p + 30));
      i.p++;
      obj[String(k)] = flowValue(src, i);
      skipWs(src, i);
      if (src[i.p] === ',') { i.p++; continue; }
      if (src[i.p] === '}') { i.p++; break; }
      throw new Error('yaml: bad flow mapping near ' + src.slice(i.p, i.p + 30));
    }
    return obj;
  }
  return flowScalar(src, i, ',}]');
}
function flowScalar(src, i, stops) {
  skipWs(src, i);
  const c = src[i.p];
  if (c === '"' || c === "'") {
    const q = c;
    let j = i.p + 1, out = q;
    for (; j < src.length; j++) {
      if (q === '"' && src[j] === '\\') { out += src[j] + src[j + 1]; j++; continue; }
      out += src[j];
      if (src[j] === q) { if (q === "'" && src[j + 1] === "'") { out += src[++j]; continue; } break; }
    }
    i.p = j + 1;
    return unquote(out);
  }
  let j = i.p;
  while (j < src.length && !stops.includes(src[j])) j++;
  const raw = src.slice(i.p, j).trim();
  i.p = j;
  return coerce(raw);
}
const flowOpen = ch => ch === '[' || ch === '{';

// ---- the block parser ----
export function parseYaml(text) {
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
  const st = { lines, i: 0 };
  skipNoise(st);
  if (st.i >= lines.length) return null;
  return parseNode(st, indentOf(lines[st.i]));
}
function skipNoise(st) {
  while (st.i < st.lines.length &&
    (isBlank(st.lines[st.i]) || isComment(st.lines[st.i]) || /^(---|\.\.\.)\s*$/.test(st.lines[st.i]))) st.i++;
}
function peek(st) { skipNoise(st); return st.i < st.lines.length ? st.lines[st.i] : null; }

function parseNode(st, indent) {
  const l = peek(st);
  if (l === null || indentOf(l) < indent) return null;
  const body = l.slice(indentOf(l));
  // a flow collection opened on its own line (`relations:` then an indented `[ … ]` block) is a value, not a map
  if (flowOpen(body[0])) { st.i++; return valueFromInline(st, body, indent - 1); }
  if (indentOf(l) === indent && /^\s*-(\s|$)/.test(l)) return parseSeq(st, indent);
  return parseMap(st, indent);
}

function parseSeq(st, indent) {
  const out = [];
  for (;;) {
    const l = peek(st);
    if (l === null || indentOf(l) !== indent || !/^\s*-(\s|$)/.test(l)) break;
    const rest = l.slice(indent + 1);
    const restTrim = rest.replace(/^ */, '');
    if (restTrim === '' || /^#/.test(restTrim)) {
      st.i++;
      const inner = peek(st);
      out.push(inner !== null && indentOf(inner) > indent ? parseNode(st, indentOf(inner)) : null);
      continue;
    }
    const itemCol = indent + 1 + (rest.length - restTrim.length);
    if (mapKeyOf(restTrim) !== null) {           // `- key: value` opens a mapping whose first key is at itemCol
      st.lines[st.i] = ' '.repeat(itemCol) + restTrim;
      out.push(parseMap(st, itemCol));
      continue;
    }
    st.i++;                                       // `- [a,b]` / `- {k: v}` / `- scalar  # comment`
    out.push(valueFromInline(st, stripTrailingComment(restTrim).trim(), indent));
  }
  return out;
}

// If `s` opens a block mapping, return [key, restAfterColon]; else null.
function mapKeyOf(s) {
  if (s[0] === '[' || s[0] === '{') return null;
  let inS = false, inD = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inS) { if (c === "'") { if (s[i + 1] === "'") i++; else inS = false; } continue; }
    if (inD) { if (c === '\\') { i++; continue; } if (c === '"') inD = false; continue; }
    if (c === "'") { inS = true; continue; }
    if (c === '"') { inD = true; continue; }
    if (c === '#' && i > 0 && /\s/.test(s[i - 1])) return null;
    if (c === ':' && (i + 1 === s.length || /\s/.test(s[i + 1]))) return [unquote(s.slice(0, i)), s.slice(i + 1)];
  }
  return null;
}

function parseMap(st, indent) {
  const out = {};
  for (;;) {
    const l = peek(st);
    if (l === null || indentOf(l) !== indent) break;
    const body = l.slice(indent);
    if (/^-(\s|$)/.test(body)) break;
    const kv = mapKeyOf(body);
    if (kv === null) throw new Error(`yaml: expected "key:" at line ${st.i + 1}: ${JSON.stringify(l)}`);
    const [key, rest] = kv;
    const restTrim = stripTrailingComment(rest).trim();
    if (restTrim === '') {
      st.i++;
      const inner = peek(st);
      if (inner === null) { out[key] = null; continue; }
      const ii = indentOf(inner);
      // `key:` followed by a sequence at the SAME indent is legal YAML and common in these files
      if (ii > indent) out[key] = parseNode(st, ii);
      else if (ii === indent && /^\s*-(\s|$)/.test(inner)) out[key] = parseSeq(st, ii);
      else out[key] = null;
      continue;
    }
    st.i++;
    out[key] = valueFromInline(st, restTrim, indent);
  }
  return out;
}

// A value written on the same line as its `-` or `key:` — a flow collection, a block-scalar header, or a scalar
// that may continue onto following lines indented deeper than its owner.
function valueFromInline(st, first, ownerIndent) {
  if (/^[|>][-+]?\d*\s*$/.test(first)) {
    const buf = [];
    while (st.i < st.lines.length) {
      const l = st.lines[st.i];
      if (isBlank(l)) { buf.push(''); st.i++; continue; }
      if (indentOf(l) <= ownerIndent) break;
      buf.push(l.trim());
      st.i++;
    }
    while (buf.length && buf[buf.length - 1] === '') buf.pop();
    return first[0] === '|' ? buf.join('\n') : buf.join(' ');
  }
  if (flowOpen(first[0])) {
    let src = first;
    while (!flowBalanced(src) && st.i < st.lines.length) { src += ' ' + st.lines[st.i].trim(); st.i++; }
    const i = { p: 0 };
    return flowValue(src, i);
  }
  let raw = first;
  const openQuote = (first[0] === '"' || first[0] === "'") && !quotedClosed(first);
  while (st.i < st.lines.length) {
    const l = st.lines[st.i];
    // a blank line ends a plain scalar, but a still-open quoted scalar may legally contain one (a paragraph
    // break inside a long `description:`) — it folds to a newline, and to a space for our purposes
    if (isBlank(l)) { if (!openQuote) break; raw += ' '; st.i++; continue; }
    if (indentOf(l) <= ownerIndent) break;
    if (!openQuote && isComment(l)) break;
    raw += ' ' + (openQuote ? l.trim() : stripTrailingComment(l).trim());
    st.i++;
    if (openQuote && quotedClosed(raw)) break;
  }
  return scalarFrom(raw);
}
function quotedClosed(s) {
  const q = s[0];
  if (q !== '"' && q !== "'") return true;
  for (let i = 1; i < s.length; i++) {
    if (q === '"' && s[i] === '\\') { i++; continue; }
    if (s[i] === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } return true; }
  }
  return false;
}
function flowBalanced(s) {
  let d = 0, inS = false, inD = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inS) { if (c === "'") { if (s[i + 1] === "'") i++; else inS = false; } continue; }
    if (inD) { if (c === '\\') { i++; continue; } if (c === '"') inD = false; continue; }
    if (c === "'") { inS = true; continue; }
    if (c === '"') { inD = true; continue; }
    if (c === '[' || c === '{') d++;
    else if (c === ']' || c === '}') { d--; if (d === 0) return true; }
  }
  return d === 0;
}

// ==================================================================================================
// 2. Glob expansion — minimatch semantics over a fixed file list.
// ==================================================================================================

// `*` inside one segment, `**` across segments, `?` one char, `{a,b}` alternation, `[abc]` a class.
export function globToRe(glob) {
  let re = '';
  const g = glob;
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        i++;
        if (g[i + 1] === '/') { i++; re += '(?:[^/]+/)*'; }   // `/**/` == zero or more whole segments
        else re += '.*';                                      // trailing/leading `**` swallows everything
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      let j = i + 1, d = 1;
      while (j < g.length && d > 0) { if (g[j] === '{') d++; else if (g[j] === '}') d--; if (d > 0) j++; }
      const alts = splitTop(g.slice(i + 1, j));
      re += '(?:' + alts.map(a => globToRe(a).source.replace(/^\^/, '').replace(/\$$/, '')).join('|') + ')';
      i = j;
    } else if (c === '[') {
      let j = i + 1;
      if (g[j] === '!' || g[j] === '^') j++;
      if (g[j] === ']') j++;
      while (j < g.length && g[j] !== ']') j++;
      re += '[' + g.slice(i + 1, j).replace(/^!/, '^') + ']';
      i = j;
    } else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}
function splitTop(s) {
  const out = [];
  let d = 0, cur = '';
  for (const c of s) {
    if (c === '{' || c === '[') d++;
    else if (c === '}' || c === ']') d--;
    if (c === ',' && d === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

// A graph `path:` pattern or a `mapping:` entry. A trailing `/` means a directory prefix; a pattern with no glob
// metacharacter matches that exact path AND everything beneath it (the graph writes bare directory prefixes).
export function pathMatcher(pattern) {
  const p = String(pattern).replace(/^\.\//, '');
  if (p.endsWith('/')) { const re = globToRe(p + '**'); return rel => re.test(rel); }
  const re = globToRe(p);
  if (/[*?{[]/.test(p)) return rel => re.test(rel);
  const dirRe = globToRe(p + '/**');
  return rel => re.test(rel) || dirRe.test(rel);
}

const CONTENT_BYTES = 256 * 1024;
export function fileHead(root, rel, cache) {
  if (cache.has(rel)) return cache.get(rel);
  let t = '';
  try {
    const st = statSync(join(root, rel));
    if (st.isFile()) t = readFileSync(join(root, rel)).subarray(0, CONTENT_BYTES).toString('utf8');
  } catch { t = ''; }
  cache.set(rel, t);
  return t;
}

// Expand a `when:` predicate (path / content / all_of / any_of / not) over `files`.
export function expandWhen(when, files, ctx) {
  if (!when || typeof when !== 'object') return new Set();
  return new Set(files.filter(rel => evalWhen(when, rel, ctx)));
}
const WHEN_KEYS = ['path', 'content', 'all_of', 'any_of', 'not'];
function evalWhen(w, rel, ctx) {
  if (Array.isArray(w)) return w.every(x => evalWhen(x, rel, ctx));
  if (!w || typeof w !== 'object') return false;
  for (const k of Object.keys(w)) if (!WHEN_KEYS.includes(k)) ctx.unknownWhenKeys?.add(k);
  return Object.keys(w).every(k => {
    const v = w[k];
    if (k === 'path') return matchPath(v, rel, ctx);
    if (k === 'content') return matchContent(v, rel, ctx);
    if (k === 'all_of') return v.every(x => evalWhen(x, rel, ctx));
    if (k === 'any_of') return v.some(x => evalWhen(x, rel, ctx));
    if (k === 'not') return !evalWhen(v, rel, ctx);
    return true;                                  // unknown key — neutral, and recorded above
  });
}
function matchPath(pattern, rel, ctx) {
  let m = ctx.pathCache.get(pattern);
  if (!m) { m = pathMatcher(pattern); ctx.pathCache.set(pattern, m); }
  return m(rel);
}
function matchContent(pattern, rel, ctx) {
  let re = ctx.contentCache.get(pattern);
  if (re === undefined) { try { re = new RegExp(pattern); } catch { re = null; } ctx.contentCache.set(pattern, re); }
  return re ? re.test(fileHead(ctx.root, rel, ctx.headCache)) : false;
}

export function expandMapping(entries, files, ctx) {
  const out = new Set();
  for (const raw of entries || []) {
    if (typeof raw !== 'string') continue;
    let m = ctx.pathCache.get(raw);
    if (!m) { m = pathMatcher(raw); ctx.pathCache.set(raw, m); }
    for (const rel of files) if (m(rel)) out.add(rel);
  }
  return out;
}

export const intersectSize = (a, b) => {
  let n = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) n++;
  return n;
};
export const jaccard = (a, b) => {
  if (!a.size && !b.size) return 0;
  const inter = intersectSize(a, b);
  return inter / (a.size + b.size - inter);
};

// ==================================================================================================
// 3. Reading the pattern graph.
// ==================================================================================================

function walkDir(dir, pred, out = []) {
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents.sort((x, y) => (x.name < y.name ? -1 : 1))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkDir(p, pred, out);
    else if (pred(p)) out.push(p);
  }
  return out;
}

export function readGraph(repo) {
  const ygg = join(repo, '.yggdrasil');
  const read = p => parseYaml(readFileSync(p, 'utf8'));
  const arch = existsSync(join(ygg, 'yg-architecture.yaml')) ? read(join(ygg, 'yg-architecture.yaml')) : {};
  const config = existsSync(join(ygg, 'yg-config.yaml')) ? read(join(ygg, 'yg-config.yaml')) : {};
  const nodes = [];
  for (const f of walkDir(join(ygg, 'model'), p => p.endsWith(sep + 'yg-node.yaml'))) {
    const id = relative(join(ygg, 'model'), dirname(f)).split(sep).join('/');
    let doc;
    try { doc = read(f); } catch (e) { throw new Error(`${f}: ${e.message}`); }
    nodes.push({ id, file: f, ...(doc || {}) });
  }
  const aspects = [];
  for (const f of walkDir(join(ygg, 'aspects'), p => p.endsWith(sep + 'yg-aspect.yaml'))) {
    const dir = dirname(f);
    const id = relative(join(ygg, 'aspects'), dir).split(sep).join('/');
    let doc;
    try { doc = read(f); } catch (e) { throw new Error(`${f}: ${e.message}`); }
    aspects.push({ id, dir, ...(doc || {}), hasCheck: existsSync(join(dir, 'check.mjs')), hasContent: existsSync(join(dir, 'content.md')) });
  }
  return { arch: arch || {}, config: config || {}, nodes, aspects };
}
