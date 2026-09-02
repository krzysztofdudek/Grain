#!/usr/bin/env node
// Claim auditor (loop v2, instrument A) — takes grain's own `export`/`report`/`where` output for a repository and
// checks every verifiable claim against the source text, emitting a fabrication rate per claim type.
//
// This turns anecdote into a number: §040 (a macro token recorded as a scope name), §045 (a macro's own name
// recorded as a supertype so `what assert_eq` claimed "implements/extends it in 230 files"), §049 (a constructor
// argument recorded as a supertype: `extends AbstractController(cc)` → `auto.extends:cc`), §041 (a coverage note
// that hides a grammar with real, measured zero edges), §057 (an absence claim standing in for content grain
// simply never reads) are all one failure class — a confident claim that is false. This script measures it.
//
//   node tests/stress/audit-claims.mjs <repoDir> [--fail-above <rate>] [--json-out <path>] [--top-samples N]
//
// Read-only against the engine: this drives `grain` as a subprocess and reads its .grain/cache/model.json — it
// never edits core.mjs behaviour. Exits 0 unless --fail-above is given and the overall rate exceeds it (no
// default threshold is baked in: an untuned repo is not a failure, a caller who wants a gate must ask for one).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(here, '..', '..', 'bin', 'grain.mjs');
const CONFIG_PATH = resolve(here, '..', '..', 'engine', 'config.mjs');

// ---------- CLI ----------
function parseArgs(argv) {
  const opts = { failAbove: null, jsonOut: null, topSamples: 10, whereQueries: 12, coverageMin: 3, quiet: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) { const a = argv[i];
    if (a === '--fail-above') opts.failAbove = +argv[++i];
    else if (a === '--json-out') opts.jsonOut = argv[++i];
    else if (a === '--top-samples') opts.topSamples = +argv[++i];
    else if (a === '--where-queries') opts.whereQueries = +argv[++i];
    else if (a === '--coverage-min') opts.coverageMin = +argv[++i];
    else if (a === '--quiet') opts.quiet = true;
    else pos.push(a); }
  if (!pos[0]) { console.error('usage: audit-claims.mjs <repoDir> [--fail-above <rate>] [--json-out <path>] [--top-samples N]'); process.exit(2); }
  opts.repo = resolve(pos[0]);
  return opts; }

// ---------- process helpers ----------
function grain(args, cwd) {
  const r = execFileSync('node', [BIN, ...args], { cwd, encoding: 'utf8', maxBuffer: 1 << 29, timeout: 30 * 60_000 });
  return r; }
function gitFiles(cwd) {
  try { return execFileSync('git', ['-C', cwd, 'ls-files'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean); }
  catch { return null; } }

// ---------- text helpers ----------
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function boundaryRe(name) { return new RegExp('(^|[^A-Za-z0-9_$])' + escapeRe(name) + '($|[^A-Za-z0-9_$])'); }
const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*/g;
const DECL_KEYWORDS = 'class|struct|interface|trait|enum|type|object|record|protocol|union';
const KEYWORD_SET = new Set(['class', 'struct', 'interface', 'trait', 'enum', 'type', 'object', 'record', 'protocol', 'union',
  'public', 'private', 'protected', 'internal', 'final', 'abstract', 'static', 'sealed', 'open', 'virtual', 'override', 'extends', 'implements', 'const', 'var', 'val', 'fun', 'func', 'def']);
// SHOUTY_SNAKE_CASE — the C/C++ macro/constant convention (`LEVELDB_EXPORT`, `CLOCK_MODE`). Deliberately narrower
// than "no lowercase letters": plenty of real type names ARE all-caps-and-digits with no underscore at all
// (Solidity's `EIP712`, `ERC20`, `IERC4626` — standards-numbered names are the norm in that corpus) and must not
// be mistaken for a macro token.
const MACRO_SHAPE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/;
// the part of a declaration head before any heritage list starts — `interface IERC4626 is IERC20, IERC20Metadata`
// legitimately carries several real, unrelated identifiers after the declared name, and none of them is a
// candidate for "the real name a macro token stands in for"
const HERITAGE_INTRO = /\b(is|extends|implements)\b|[:({]/;

// ---------- corpus: every tracked file's text + an identifier inverted index, built once ----------
export function buildCorpus(root, files, EXT2GRAMMAR) {
  const text = new Map(); // rel -> text (or null if unreadable/binary-looking)
  const index = new Map(); // identifier -> Set(rel)  (files that MENTION it, any position)
  const grammarOf = new Map(); // rel -> grammar name | null
  for (const rel of files) {
    grammarOf.set(rel, EXT2GRAMMAR[extname(rel)] || null);
    let t = null;
    try {
      const st = statSync(join(root, rel));
      if (st.size > 0 && st.size < 3_000_000) t = readFileSync(join(root, rel), 'utf8');
    } catch { /* unreadable (symlink, binary, gone) — just absent from the corpus */ }
    text.set(rel, t);
    if (!t || /\0/.test(t.slice(0, 2000))) continue; // skip binaries
    const seen = new Set();
    for (const m of t.matchAll(IDENT_RE)) { const id = m[0]; if (seen.has(id)) continue; seen.add(id); }
    for (const id of seen) { let s = index.get(id); if (!s) index.set(id, s = new Set()); s.add(rel); }
  }
  return { text, index, grammarOf };
}
export function linesOf(corpus, rel) { const t = corpus.text.get(rel); return t == null ? null : t.split(/\r?\n/); }
// does [from,to] (1-based, inclusive, capped) contain `name` at an identifier boundary anywhere?
const SIMPLE_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
export function spanHasName(corpus, rel, from, to, name, pad = 3) {
  const lines = linesOf(corpus, rel); if (!lines) return null; // null = file unreadable, can't judge
  // pad: `line` is often the START of a declaration's modifiers/decorators/doc-comment (a real, multi-line head),
  // and a group/marker-only site (no measured endLine — the caller widens `pad` for these) would otherwise search
  // exactly one line — the annotation or comment line, not the signature line the name is actually on
  const a = Math.max(1, from), b = Math.min(lines.length, Math.max(from, Math.min(to, from + 60)) + pad);
  // a `case`-kind scope ("named callback") is named after a test-description STRING LITERAL (`it('…', fn)`),
  // truncated to a fixed length — not an identifier, so the identifier-boundary regex is the wrong oracle (it
  // demands a non-word char after an already-whitespace-terminated fragment and never matches); a plain substring
  // test is both correct and tolerant of the truncation, since the stored fragment is a true prefix of the source
  const test = SIMPLE_IDENT.test(name) ? boundaryRe(name) : null;
  for (let i = a; i <= b; i++) { const line = lines[i - 1]; if (test ? test.test(line) : line.includes(name)) return true; }
  return false;
}
// first (rel,line) anywhere in the corpus where `name` is declared with an OO-shaped keyword right before it
export function findDeclarationShape(corpus, name) {
  const files = corpus.index.get(name); if (!files) return null;
  const re = new RegExp('\\b(' + DECL_KEYWORDS + ')\\s+' + escapeRe(name) + '\\b');
  for (const rel of files) { const lines = linesOf(corpus, rel); if (!lines) continue;
    for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return { rel, line: i + 1 }; }
  return null;
}

// ---------- claim collection from `grain export` ----------
function siteKey(s) { return s.rel + '\0' + s.kind + '\0' + s.name + '\0' + s.line; }
export function collectSites(model, extraSources) {
  const bySite = new Map(); // dedup — the same declaration is claimed by many surfaces (group/marker/convention)
  const add = (s, source) => { if (!s || s.kind === 'module' || s.kind === 'file' || !s.name || !s.line) return;
    const k = siteKey(s); const cur = bySite.get(k); const endLine = s.endLine || s.line;
    // several surfaces (group/marker/convention/where) claim the SAME declaration; group/marker members carry no
    // span at all (endLine defaults to line) while convention sites carry the real AST end line — always keep the
    // largest span seen for a site, or a real declaration whose annotation-line `line` differs from its signature
    // line reads as missing when only the annotation-less 1-line window from an earlier source survives
    if (cur) { cur.sources.add(source); if (endLine > cur.endLine) cur.endLine = endLine; }
    else bySite.set(k, { rel: s.rel, kind: s.kind, name: s.name, line: s.line, endLine, sources: new Set([source]) }); };
  for (const p of model.partitions || []) {
    for (const g of p.groups || []) for (const m of g.members || []) add(m, 'group');
    for (const mk of p.markers || []) for (const c of mk.carriers || []) add(c, 'marker');
  }
  for (const c of model.conventions || []) {
    for (const s of c.conformingSites || []) add(s, 'convention');
    for (const s of c.deviatingSites || []) add(s, 'convention');
  }
  for (const s of extraSources || []) add(s, 'where');
  return [...bySite.values()];
}
// heritage markers: "this scope, declared at rel:line, extends/implements NAME" — one row per (carrier, target)
export function collectHeritageClaims(model) {
  const claims = [];
  for (const p of model.partitions || []) for (const mk of p.markers || []) {
    if (mk.type !== 'supertype') continue;
    for (const c of mk.carriers || []) claims.push({ target: mk.name, rel: c.rel, kind: c.kind, name: c.name, line: c.line });
  }
  // positive (non-negated) `extends` conventions carry the same claim at the aggregate level ("N established")
  const aggregates = [];
  for (const c of model.conventions || []) {
    if (c.feature?.enumerator !== 'extends' || c.negated) continue;
    aggregates.push({ target: c.feature.argument, established: c.established, partition: c.partition, id: c.id });
  }
  return { claims, aggregates };
}
export function allDeclaredTypeNames(model) {
  const names = new Set();
  for (const p of model.partitions || []) {
    for (const g of p.groups || []) for (const m of g.members || []) if (m.kind === 'type') names.add(m.name);
    for (const mk of p.markers || []) for (const c of mk.carriers || []) if (c.kind === 'type') names.add(c.name);
  }
  for (const c of model.conventions || []) for (const s of [...(c.conformingSites || []), ...(c.deviatingSites || [])]) if (s.kind === 'type') names.add(s.name);
  return names;
}
export function importTargetNames(model) {
  const names = new Set();
  for (const e of model.edges || []) { if (e.kind !== 'import') continue;
    const base = (e.to || '').split('/').pop().replace(/\.[^.]+$/, ''); if (base) names.add(base); }
  return names;
}

// ---------- where --json sampling (representative query terms, cheap once the cache is warm) ----------
function sampleQueryTerms(model, n) {
  const terms = new Set();
  for (const p of model.partitions || []) {
    for (const mk of p.markers || []) if (mk.name && /^[A-Za-z_]\w*$/.test(mk.name)) terms.add(mk.name);
    for (const g of p.groups || []) for (const t of g.nameTokens || []) if (/^[A-Za-z_]\w{2,}$/.test(t)) terms.add(t);
    if (terms.size >= n * 3) break;
  }
  return [...terms].slice(0, n);
}
function whereMemberSites(model, repo, n) {
  const out = [];
  for (const q of sampleQueryTerms(model, n)) {
    let text; try { text = grain(['where', q, '--json'], repo); } catch { continue; }
    let j; try { j = JSON.parse(text); } catch { continue; }
    for (const hit of j.hits || []) for (const m of hit.members || []) out.push(m);
  }
  return out;
}

// ---------- checks ----------
export function checkDeclaredAtLine(sites, corpus) {
  const res = { claims: 0, checked: 0, fabricated: 0, samples: [] };
  for (const s of sites) {
    res.claims++;
    // a `convention` source carries the AST's real endLine; a group/marker/where-only site never does, and a
    // multi-line doc comment ahead of the declaration can push the real signature line further than a small
    // fixed pad reaches — widen the search only where there is no real span to trust instead
    const pad = s.sources.has('convention') ? 3 : 12;
    const has = spanHasName(corpus, s.rel, s.line, s.endLine, s.name, pad);
    if (has === null) continue; // file unreadable at audit time — not verifiable, not counted either way
    res.checked++;
    if (!has) { res.fabricated++; res.samples.push({ type: 'declaredAtLine', file: s.rel, line: s.line, claim: `${s.kind} \`${s.name}\` declared here`, detail: `\`${s.name}\` does not appear (as an identifier) on lines ${s.line}-${s.endLine} of ${s.rel}`, sources: [...s.sources] }); }
  }
  return res;
}
export function checkMacroTokenAsName(sites, corpus) {
  const res = { claims: 0, checked: 0, fabricated: 0, samples: [] };
  for (const s of sites) {
    if (s.kind !== 'type' || !MACRO_SHAPE.test(s.name)) continue;
    const lines = linesOf(corpus, s.rel); if (!lines || !lines[s.line - 1]) continue;
    res.claims++; res.checked++;
    const line = lines[s.line - 1];
    const m = line.match(new RegExp('\\b(' + DECL_KEYWORDS + ')\\b([^{;]*)'));
    if (!m) continue;
    const head = m[2]; const cut = head.search(HERITAGE_INTRO);
    const idents = [...(cut < 0 ? head : head.slice(0, cut)).matchAll(IDENT_RE)].map(x => x[0]).filter(t => !KEYWORD_SET.has(t));
    if (idents.length < 2 || !idents.includes(s.name)) continue;
    const better = idents.find(t => t !== s.name && /^[A-Z][a-zA-Z0-9]*[a-z]/.test(t));
    if (better) { res.fabricated++; res.samples.push({ type: 'macroTokenAsName', file: s.rel, line: s.line, claim: `scope name is \`${s.name}\``, detail: `\`${s.name}\` is an ALL-CAPS token before the declaration keyword on this line; \`${better}\` on the same line looks like the real type name — line: ${line.trim().slice(0, 140)}` }); }
  }
  return res;
}
export function checkHeritageTargetReal(model, corpus, declaredTypeNames, importTargets) {
  const res = { claims: 0, checked: 0, fabricated: 0, samples: [] };
  const memo = new Map();
  // A heritage target can be real without grain (or this harness) being able to prove it: a vendored dependency
  // whose source is not in this clone (leveldb's `testing::Test`, gtest not checked out) is exactly as invisible
  // to a grep oracle as a fabricated one. The spec's own line for a bare local name (`cc`) is the discriminator
  // that actually generalizes: a real type name is PascalCase-shaped; a fabricated one (a constructor/parameter
  // name lifted from the same heritage clause, §049) is not. So: proven-in-repo or proven-as-an-import always
  // passes; unproven only passes if it is at least SHAPED like a type (`^[A-Z]`, not an ALL-CAPS macro token,
  // which is §040's failure and audited separately) — conservative in the direction of not fabricating a
  // fabrication, per the instrument's own constraint.
  const isReal = (y) => { if (memo.has(y)) return memo.get(y);
    let verdict; if (declaredTypeNames.has(y)) verdict = { real: true, reason: 'declared elsewhere in the model' };
    else if (importTargets.has(y)) verdict = { real: true, reason: 'matches an import target' };
    else { const d = findDeclarationShape(corpus, y);
      if (d) verdict = { real: true, reason: `declared at ${d.rel}:${d.line}` };
      else { const typeShaped = /^[A-Z]/.test(y) && !MACRO_SHAPE.test(y);
        verdict = { real: typeShaped, reason: typeShaped ? 'unproven but type-shaped (possibly a vendored/external dependency not in this clone)' : 'not declared or imported anywhere, and not shaped like a type name' }; } }
    memo.set(y, verdict); return verdict; };
  const { claims } = collectHeritageClaims(model);
  for (const c of claims) {
    res.claims++; res.checked++;
    const v = isReal(c.target);
    if (!v.real) {
      const ctorArg = new RegExp('[(,]\\s*' + escapeRe(c.target) + '\\s*:').test((linesOf(corpus, c.rel) || []).slice(Math.max(0, c.line - 1), c.line + 2).join('\n'));
      res.fabricated++;
      res.samples.push({ type: 'heritageTargetReal', file: c.rel, line: c.line, claim: `${c.kind} \`${c.name}\` extends/implements \`${c.target}\``, detail: `\`${c.target}\` is not declared as a type anywhere in the repo and does not match an import target${ctorArg ? ' — it does match a same-clause constructor/parameter name, the §049 shape' : ''}` });
    }
  }
  return { res, isReal };
}
export function checkUsedByFileCount(model, corpus, isReal) {
  const res = { claims: 0, checked: 0, fabricated: 0, samples: [] };
  const byTarget = new Map();
  for (const p of model.partitions || []) for (const mk of p.markers || []) { if (mk.type !== 'supertype') continue;
    const n = new Set((mk.carriers || []).map(c => c.rel)).size; const cur = byTarget.get(mk.name) || 0; byTarget.set(mk.name, Math.max(cur, n)); }
  for (const [target, claimedN] of byTarget) {
    if (!isReal(target).real) continue; // already counted as a fabrication of a different type — don't double count a count built on a name that doesn't exist
    res.claims++; res.checked++;
    const oracleN = corpus.index.get(target)?.size ?? 0;
    if (claimedN > oracleN) { res.fabricated++; res.samples.push({ type: 'usedByFileCount', file: null, line: null, claim: `\`${target}\` is extended/implemented by ${claimedN} file(s)`, detail: `only ${oracleN} file(s) in the repo mention \`${target}\` at an identifier boundary at all` }); }
  }
  return res;
}
// `whereJson(id, root) -> parsed `where <id> --json`` is injectable so this check is unit-testable without a real
// grain subprocess; the CLI's own default is the real thing.
export function checkNoDeclarationsAnywhere(model, root, corpus, opts, whereJson = (id, r) => JSON.parse(grain(['where', id, '--json'], r))) {
  const res = { claims: 0, checked: 0, fabricated: 0, samples: [] };
  const cachePath = join(root, '.grain', 'cache', 'model.json'); let cache; try { cache = JSON.parse(readFileSync(cachePath, 'utf8')); } catch { return res; }
  const filesAll = new Set(cache.filesAll || []); const pathsAll = cache.pathsAll || [];
  const noGrammarFiles = pathsAll.filter(p => !filesAll.has(p));
  if (!noGrammarFiles.length) return res;
  // identifiers that appear ONLY in no-grammar files, with some real frequency, and nowhere in code — the 057 shape
  const noGrammarSet = new Set(noGrammarFiles);
  const candidates = [];
  for (const [id, files] of corpus.index) { if (id.length < 5) continue;
    let inNoGrammar = 0, inCode = false;
    for (const rel of files) { if (noGrammarSet.has(rel)) inNoGrammar++; else if (filesAll.has(rel)) { inCode = true; break; } }
    if (inNoGrammar >= 2 && !inCode) candidates.push({ id, rel: [...files].find(r => noGrammarSet.has(r)) });
    if (candidates.length >= 40) break; }
  const sample = candidates.slice(0, opts.whereQueries);
  for (const { id, rel } of sample) {
    res.claims++; res.checked++;
    let j; try { j = whereJson(id, root); } catch { continue; }
    const hits = j.hits || [];
    const pointsAtTruth = hits.some(h => (h.members || []).some(m => m.rel === rel) || (h.directories || []).some(d => rel.startsWith(d.dir + '/')));
    const confidentHit = hits.some(h => h.score >= 0.3);
    // §089 — every candidate this check samples appears ONLY in a no-grammar file (`candidates`, above); that is
    // exactly the shape whereCmd's own `ungrammared` disclosure (core.mjs) exists to name — `where`'s text answer
    // has said so since §057/§085, and --json now carries the identical { kind: 'ungrammared', text } entry (§089's
    // own fix). A confident-looking top hit that ALSO ships this disclosure is not silent fabrication — grain told
    // the reader, in the same response, that the real text lives in a file it cannot read. Only an UNDISCLOSED
    // confident-wrong hit still counts: `disclosed` never suppresses `claims`/`checked`, only `fabricated`.
    const disclosed = (j.disclosures || []).some(d => d.kind === 'ungrammared');
    if (confidentHit && !pointsAtTruth && !disclosed) { res.fabricated++; res.samples.push({ type: 'noDeclarationsAnywhere', file: rel, line: null, claim: `where ${id} → ${hits[0].type} \`${hits[0].label}\` (score ${hits[0].score})`, detail: `\`${id}\` actually only occurs in ${rel}, a file with no grammar at all; grain's top hit does not mention it` }); }
  }
  return res;
}

// ---------- main ----------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { EXT2GRAMMAR } = await import(pathToFileURL(CONFIG_PATH).href);
  const root = opts.repo;
  const files = gitFiles(root);
  if (!files) { console.error(`audit-claims: ${root} is not a git repository (or git ls-files failed) — the corpus oracle needs the tracked file list`); process.exit(2); }

  if (!opts.quiet) console.error(`[audit-claims] ${root}: reading grain's index (\`export\` auto-refreshes only if this engine build's cache is missing or stale — no forced full rebuild of an already-fresh cache)`);
  // `export` itself auto-refreshes (ensureFresh, want='refresh'): a cache already built by THIS exact engine
  // build (engine/extractor/model/grammar versions + HEAD sha all match) returns instantly; anything else gets a
  // real rebuild — so this audits the current engine's output without ever paying for a needless full re-walk of
  // history on a warm cache. Retried once: a cold rebuild has been observed to lose a one-off race writing
  // .grain/cache/blobs/<shard>.json.tmp-<pid> (ENOENT), which did not reproduce on a second attempt. Noted for
  // the engine, not fixed here (this harness is read-only).
  let exportText; try { exportText = grain(['export'], root); } catch (e) { if (!opts.quiet) console.error(`[audit-claims] first export failed (${String(e.message || e).split('\n')[0]}) — retrying once`); exportText = grain(['export'], root); }
  const model = JSON.parse(exportText);
  let reportText = ''; try { reportText = grain(['report'], root); } catch {}

  if (!opts.quiet) console.error(`[audit-claims] ${root}: building the text corpus (${files.length} tracked files)`);
  const corpus = buildCorpus(root, files, EXT2GRAMMAR);
  const grammarLookup = rel => EXT2GRAMMAR[extname(rel)] || null;

  if (!opts.quiet) console.error(`[audit-claims] ${root}: sampling \`where\` queries`);
  const whereSites = whereMemberSites(model, root, opts.whereQueries);

  const sites = collectSites(model, whereSites);
  const declaredTypeNames = allDeclaredTypeNames(model);
  const importTargets = importTargetNames(model);

  const rDecl = checkDeclaredAtLine(sites, corpus);
  const rMacro = checkMacroTokenAsName(sites, corpus);
  const { res: rHeritage, isReal } = checkHeritageTargetReal(model, corpus, declaredTypeNames, importTargets);
  const rUsedBy = checkUsedByFileCount(model, corpus, isReal);
  const rCoverage = checkResolutionCoverage(reportText, root, grammarLookup, opts.coverageMin);
  const rAbsence = checkNoDeclarationsAnywhere(model, root, corpus, opts);

  const byType = { declaredAtLine: rDecl, macroTokenAsName: rMacro, heritageTargetReal: rHeritage, usedByFileCount: rUsedBy, resolutionCoverage: rCoverage, noDeclarationsAnywhere: rAbsence };
  let claims = 0, checked = 0, fabricated = 0; const allSamples = [];
  for (const [type, r] of Object.entries(byType)) { claims += r.claims; checked += r.checked; fabricated += r.fabricated;
    for (const s of r.samples) allSamples.push(s);
    r.rate = r.checked ? +(r.fabricated / r.checked).toFixed(4) : null; }
  const rate = checked ? +(fabricated / checked).toFixed(4) : 0;

  const out = { repo: model.repo || root, claims, checked, fabricated, rate,
    byType: Object.fromEntries(Object.entries(byType).map(([k, r]) => [k, { claims: r.claims, checked: r.checked, fabricated: r.fabricated, rate: r.rate }])),
    samples: allSamples.slice(0, opts.topSamples) };

  const line = `[audit-claims] ${out.repo}: ${fabricated}/${checked} fabricated (${(rate * 100).toFixed(1)}%) over ${claims} claims — ` +
    Object.entries(out.byType).filter(([, r]) => r.checked).sort((a, b) => (b[1].fabricated) - (a[1].fabricated)).map(([k, r]) => `${k} ${r.fabricated}/${r.checked}`).join(', ');
  console.log(line);
  if (opts.jsonOut) { const { writeFileSync } = await import('node:fs'); writeFileSync(opts.jsonOut, JSON.stringify(out, null, 1)); }
  else console.log(JSON.stringify(out, null, 1));

  if (opts.failAbove != null && rate > opts.failAbove) { console.error(`[audit-claims] rate ${rate} exceeds --fail-above ${opts.failAbove}`); process.exit(1); }
  process.exit(0);
}
// corrected coverage check (self-contained, no cache mutation) — grammarOf computed straight from EXT2GRAMMAR
export function checkResolutionCoverage(reportText, root, grammarOf, coverageMin) {
  const res = { claims: 0, checked: 0, fabricated: 0, samples: [] };
  const m = reportText.match(/resolution does not cover (\d+) files? \(([^)]*)\)/);
  const disclosed = new Set(m ? m[2].split(',').map(x => x.trim()).filter(Boolean) : []);
  let cache; try { cache = JSON.parse(readFileSync(join(root, '.grain', 'cache', 'model.json'), 'utf8')); } catch { return res; }
  const filesAll = new Set(cache.filesAll || []); const pathsAll = cache.pathsAll || [];
  const edgedFiles = new Set(); for (const e of cache.edges || []) { edgedFiles.add(e.from); edgedFiles.add(e.to); }
  const byGrammar = new Map();
  for (const rel of filesAll) { const g = grammarOf(rel); if (!g) continue; const e = byGrammar.get(g) || { n: 0, edged: 0 }; e.n++; if (edgedFiles.has(rel)) e.edged++; byGrammar.set(g, e); }
  for (const [g, e] of byGrammar) { if (e.n < coverageMin) continue; res.claims++; res.checked++;
    if (e.edged === 0 && !disclosed.has(g)) { res.fabricated++; res.samples.push({ type: 'resolutionCoverage', file: null, line: null, claim: m ? m[0] : '(report never discloses a coverage gap)', detail: `${e.n} ${g} file(s) have zero in/out edges and \`${g}\` is not in the disclosed list` }); } }
  const noGrammarByExt = new Map();
  for (const p of pathsAll) { if (filesAll.has(p)) continue; const ext = extname(p) || '(no ext)'; noGrammarByExt.set(ext, (noGrammarByExt.get(ext) || 0) + 1); }
  for (const [ext, n] of noGrammarByExt) { if (n < coverageMin) continue; res.claims++; res.checked++; res.fabricated++;
    res.samples.push({ type: 'resolutionCoverage', file: null, line: null, claim: m ? m[0] : '(report never discloses a coverage gap)', detail: `${n} file(s) with extension \`${ext}\` have no grammar at all and can never appear in the coverage note (model.filesAll excludes them by construction)` }); }
  return res;
}

// run only when invoked directly (`node audit-claims.mjs …`) — importing this module for unit tests must not
// launch the CLI or call process.exit
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(e => { console.error('[audit-claims] ' + (e?.stack || e)); process.exit(2); });
}
