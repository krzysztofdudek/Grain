// grain engine · the mutation harness and the extraction-recall selftest (dev and test only)
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extname } from 'node:path/posix';
import { GRAMMAR_DIR } from './config.mjs';
import { checkFile } from './check.mjs';
import { isLocationNode, scopeName } from './extract.mjs';
import { part } from './facts.mjs';
import { bindingFor, parseFile, tokenize } from './parse.mjs';
import { extractScopes } from './scopes.mjs';

// ===== MUTATION HARNESS (dev/test only: plants real deviations into conforming exemplars, verifies detection) =====
function mutate(src, f, ex) {
  const p = f.pid;
  if (p.startsWith('auto.deco:') && f.exp === 'true') {
    const d = p.slice(10).replace('@', '');
    const re = new RegExp('^\\s*@' + d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b.*$', 'gm');
    return re.test(src) ? src.replace(re, '') : null;
  }
  if (p.startsWith('auto.extends:') && f.exp === 'true') {
    const e = p.slice(13);
    const re = new RegExp('(extends|implements|\\()\\s*' + e.replace(/[$.]/g, '\\$&') + '\\b');
    const lineOff = src
      .split('\n')
      .slice(0, Math.max(0, (ex.line || 1) - 1))
      .join('\n').length; // mutate the exemplar's own heritage, not the file's first
    const tail = src.slice(lineOff);
    return re.test(tail)
      ? src.slice(0, lineOff) + tail.replace(re, '$1 SomethingElse')
      : re.test(src)
        ? src.replace(re, '$1 SomethingElse')
        : null;
  }
  if (p.startsWith('auto.imp:') && f.exp === 'false') {
    const spec = p.slice(9);
    if (spec.startsWith('~/')) return null;
    // one candidate per import syntax family — re-extraction keeps whichever this file's grammar accepts
    return {
      candidates: [
        `import __planted from '${spec}';\n` + src,
        `import ${spec}\n` + src,
        `from ${spec} import __planted\n` + src,
        `#include <${spec}>\n` + src,
      ],
      imp: spec,
    };
  }
  if (p === 'auto.nameshape' && ex) {
    const nn = tokenize(ex.name).join('_');
    if (!nn || nn === ex.name) return null;
    return src.split(ex.name).join(nn);
  }
  if (p.startsWith('auto.call:') && f.exp === 'false') {
    const call = p.slice(10);
    if (/[^\w.$]/.test(call)) return null;
    const lineOff = src
      .split('\n')
      .slice(0, Math.max(0, (ex.line || 1) - 1))
      .join('\n').length; // anchor at the exemplar's own line
    const at = src.indexOf(ex.name, lineOff);
    if (at < 0) return null;
    const cands = [];
    let brace = src.indexOf('{', at);
    for (let k = 0; k < 10 && brace >= 0; k++) {
      cands.push(src.slice(0, brace + 1) + `\n  ${call}();` + src.slice(brace + 1));
      brace = src.indexOf('{', brace + 1);
    }
    const lines = src.split('\n');
    for (let li = Math.max(0, (ex.line || 1) - 1); li < Math.min(lines.length, (ex.line || 1) + 5); li++) {
      if (!/:\s*(#.*)?$/.test(lines[li])) continue;
      const indent = (lines[li].match(/^\s*/)[0] || '') + '    ';
      cands.push([...lines.slice(0, li + 1), indent + call + '()', ...lines.slice(li + 1)].join('\n'));
    }
    return cands.length ? { candidates: cands, call } : null;
  }
  return null;
}
const PLANTABLE_PID = /^auto\.(deco|extends|imp|call):|^auto\.nameshape$/;
export async function mutateTest({ model, root }) {
  const res = { detected: 0, missed: 0, silentOK: 0, falseFire: 0, unsupported: 0, cases: [] };
  for (const part of model.partitions) {
    const withExemplars = part.facts.filter(f => f.exemplars.length);
    // §046: a certified fact whose pid carries no mutation strategy below (lexical/shape/birth facts, not
    // deco/extends/imp/call/nameshape) used to be dropped HERE, before the loop, so it never touched `unsupported`
    // either — a repo whose only certified conventions are of such a kind (telescope.nvim: auto.has/auto.filebirth/
    // auto.lex/auto.stshape) got a bare, unexplained 0/0/0/0 instead of an accounted "N unsupported". Count it now,
    // without touching the plantable candidate pool or its 16-per-partition cap below.
    for (const f of withExemplars) if (!PLANTABLE_PID.test(f.pid)) res.unsupported++;
    const cands = withExemplars.filter(f => PLANTABLE_PID.test(f.pid)).slice(0, 16);
    for (const f of cands) {
      const ex = f.exemplars[0];
      let src;
      try {
        src = readFileSync(join(root, ex.rel), 'utf8');
      } catch {
        continue;
      }
      const b0 = await checkFile({ model, root, rel: ex.rel, content: src });
      const before = b0.msgs;
      if (before.some(m => m.pid === f.pid && m.scope === ex.name)) {
        res.falseFire++;
        res.cases.push({ FALSEFIRE: f.cid + ' ' + f.pid + '=' + f.exp, file: ex.rel, scope: ex.name });
        continue;
      }
      // the fact must actually GOVERN the exemplar before the mutation (an ambiguous member is outside role governance
      // by the ambGap policy) — planting on an ungoverned scope measures that policy, not detection
      if (f.kind !== 'file' && !b0.governed.some(g0 => g0.pid === f.pid && g0.scope === ex.name)) {
        res.unsupported++;
        continue;
      }
      res.silentOK++;
      let mut = mutate(src, f, ex);
      if (mut === null) {
        res.unsupported++;
        continue;
      }
      if (mut.candidates) {
        // injected mutations: keep the candidate where the planted artifact really lands (ground truth = extraction)
        // the grammar is resolved from the file's OWN content once (§040: `.h` names two), never re-decided per
        // mutated candidate — a mutation must not be able to flip the grammar the comparison is made under
        const { p: pp, tree: t00 } = await parseFile(extname(ex.rel), src);
        t00.delete();
        const bb = bindingFor(pp._g);
        let picked = null;
        for (const cand of mut.candidates) {
          const tr2 = pp.parse(cand);
          const ss = extractScopes(ex.rel, tr2, bb);
          tr2.delete();
          const ok = mut.call
            ? ss.find(x => x.name === ex.name && x.calls.has(mut.call))
            : ss.find(x => x.kind === 'file' && x.imports.includes(mut.imp));
          if (ok) {
            picked = cand;
            break;
          }
        }
        if (!picked) {
          res.unsupported++;
          continue;
        }
        mut = picked;
      }
      // ground truth by re-extraction, as for injections: a mutation that breaks the parse (a multiline decorator's
      // opening line removed) or fails to flip the surface measures ITSELF, not detection — count it unsupported
      {
        const { p: pp2, tree: tr0 } = await parseFile(extname(ex.rel), src);
        const bb2 = bindingFor(pp2._g);
        const ss0 = extractScopes(ex.rel, tr0, bb2);
        tr0.delete();
        const orig = ss0.find(x => x.name === ex.name);
        const tr3 = pp2.parse(mut);
        const ss3 = extractScopes(ex.rel, tr3, bb2);
        tr3.delete();
        const still = ss3.find(
          x => x.name === ex.name || (f.pid === 'auto.nameshape' && x.name === tokenize(ex.name).join('_'))
        );
        const intact = still && (!orig || still.nt === orig.nt); // error recovery yielding a syntax wreck (nt degraded) measures the mutation, not detection
        const flipped = f.pid.startsWith('auto.deco:')
          ? intact && !still.decos.includes(f.pid.slice(10).replace('@', ''))
          : f.pid.startsWith('auto.extends:')
            ? intact && !still.sup.includes(f.pid.slice(13))
            : !!intact;
        if (!intact || !flipped) {
          res.unsupported++;
          continue;
        }
      }
      const after = (await checkFile({ model, root, rel: ex.rel, content: mut })).msgs;
      const hit = after.some(
        m =>
          m.pid === f.pid &&
          (m.scope === ex.name || (f.pid === 'auto.nameshape' && m.scope === tokenize(ex.name).join('_')))
      );
      res[hit ? 'detected' : 'missed']++;
      if (!hit) res.cases.push({ fact: f.cid + ' ' + f.pid + '=' + f.exp, file: ex.rel });
    }
  }
  return res;
}
// ===== SELFTEST --extract: declaration RECALL/PRECISION against a grammar-derived oracle (§3.B, loop-v2) =====
// The oracle answers "what does this grammar's OWN node-types.json say a declaration looks like", independent of
// bindingFor's `b.scope` (whose loosebody branch additionally keyword-matches a type's own NAME — class/function/
// object/…, §bindingFor above). A "declaration candidate" here is any NAMED node type that (a) carries a `name`
// field or a `declarator` field — the same two ingredients `b.scope`'s PRIMARY rule uses — AND (b) has, somewhere
// in its OWN node-types.json schema (a field's declared types, or an unnamed child's declared types), something
// shaped like a body or a block. No language, keyword or per-grammar list: (b) is read off the same `fields`/
// `children` schema bindingFor already parses, just without the loosebody branch's NAME-based keyword match —
// "kod to kod", ask the grammar, don't pattern-match a word list. Where this makes the oracle DISAGREE with
// bindingFor's own `b.scope` (wider on a `_declaration`-suffixed node whose schema shows a body-shaped child but
// whose keyword prefix the loosebody list does not carry; narrower on a grammar with no such node at all) is
// itself a finding, not a defect in either rule — see `extractCoverage`'s `boundary` flag below.
// One exclusion, reused from extraction rather than reinvented: `isLocationNode` (namespace/package/mod) — a
// location statement names WHERE code lives, not a unit of code, and extraction never turns one into a scope on
// purpose (§extractScopes, the same predicate, same comment). Applying it here too keeps both artifacts agreed on
// what "a declaration" fundamentally excludes; without it, every namespace block would count as a permanent,
// uninteresting "miss" that swamps the real ones (measured on leveldb: 10 of the first 10 misses were `namespace
// leveldb { … }`, none of them a genuine silence bug).
const oracleTypesCache = {};
export function declCandidateTypes(gname) {
  if (oracleTypesCache[gname]) return oracleTypesCache[gname];
  const nt = JSON.parse(readFileSync(join(GRAMMAR_DIR, `tree-sitter-${gname}.node-types.json`), 'utf8'));
  const bodyShaped = t => /body|block/i.test(t);
  const out = new Set();
  for (const n of nt) {
    if (n.named === false || isLocationNode(n.type)) continue;
    const f = n.fields || {};
    if (!f.name && !f.declarator) continue;
    if (f.body) {
      out.add(n.type);
      continue;
    } // a `body` FIELD is body-shaped by its own name, whatever type it holds
    const fieldTypes = Object.values(f).flatMap(spec => (spec.types || []).map(t => t.type));
    const childTypes = (n.children?.types || []).map(t => t.type);
    if (fieldTypes.some(bodyShaped) || childTypes.some(bodyShaped)) out.add(n.type);
  }
  oracleTypesCache[gname] = out;
  return out;
}
// per-file recall/precision of `extractScopes` against the oracle above, matched at the SAME LINE — never by
// name (a right-line-wrong-name declaration is a different failure class; §A's claim auditor covers it). `files`
// and `read` are supplied by the caller (grain.mjs decides whether the universe is the HEAD tree or a no-git
// worktree walk, exactly as `learn()`'s own `tree` parameter does), so this stays as git-agnostic as
// `extractScopes` itself. The mandatory `kind: 'file'` wrapper scope every file gets (line 1, always, regardless
// of grammar) is excluded on both sides — it is a container, never a declaration, and counting it would make any
// real declaration that happens to start on line 1 a free "hit" no matter what extractScopes actually saw.
// `boundary: true` on a grammar means its node-types.json has NO node type shaped like (a)+(b) above at all (the
// data grammars — JSON/YAML/TOML/properties — are exactly bindingFor's own `b.data` set, §bindingFor):
// recall/precision are not meaningful there, and every scope extractScopes records for it is, by the oracle's own
// admission, unfalsifiable — reported as a boundary, not a score.
export async function extractCoverage({ root, files, read }) {
  const readOne =
    read ||
    (rel => {
      try {
        return readFileSync(join(root, rel), 'utf8');
      } catch {
        return null;
      }
    });
  const grammars = {};
  let noParse = 0;
  const misses = [],
    extras = [];
  for (const rel of files) {
    const src = readOne(rel);
    if (src == null) {
      noParse++;
      continue;
    }
    let p, tree;
    try {
      ({ p, tree } = await parseFile(extname(rel), src));
    } catch {
      noParse++;
      continue;
    }
    const gname = p._g,
      b = bindingFor(gname);
    const G =
      grammars[gname] ||
      (grammars[gname] = {
        candidates: 0,
        scopes: 0,
        hits: 0,
        matchedScopes: 0,
        boundary: declCandidateTypes(gname).size === 0,
      });
    const scopes = extractScopes(rel, tree, b, gname).filter(s => s.kind !== 'file');
    G.scopes += scopes.length;
    const scopeLines = new Set(scopes.map(s => s.line));
    const types = [...declCandidateTypes(gname)];
    const candLines = new Set();
    if (types.length)
      for (const n of tree.rootNode.descendantsOfType(types)) {
        if (n.isMissing) continue; // a synthetic recovery node names no real declaration in the source
        const line = n.startPosition.row + 1;
        candLines.add(line);
        G.candidates++;
        if (scopeLines.has(line)) G.hits++;
        else if (misses.length < 10) misses.push(`${rel}:${line} ${scopeName(n)}`);
      }
    for (const s of scopes) {
      if (candLines.has(s.line)) G.matchedScopes++;
      else if (extras.length < 10) extras.push(`${rel}:${s.line} ${s.name}`);
    }
    tree.delete();
  }
  const div = (a, d) => (d > 0 ? a / d : null);
  for (const g of Object.values(grammars)) {
    g.recall = div(g.hits, g.candidates);
    g.precision = div(g.matchedScopes, g.scopes);
  }
  const total = { candidates: 0, scopes: 0, hits: 0, matchedScopes: 0 };
  for (const g of Object.values(grammars))
    for (const k of ['candidates', 'scopes', 'hits', 'matchedScopes']) total[k] += g[k];
  total.recall = div(total.hits, total.candidates);
  total.precision = div(total.matchedScopes, total.scopes);
  return { grammars, total, files: files.length, noParse, misses, extras };
}
