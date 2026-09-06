// grain engine · placement on create: a new file whose name-kin already live in one place, from path evidence alone
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { basename, dirname } from 'node:path/posix';
import { normTok } from './cards.mjs';
import { voice } from './mine.mjs';
import { tokenize } from './parse.mjs';

// ===== CHECK (verdict for one file against the model; hermetic — same input ⇒ same answer, no session state) =====
// ===== PLACEMENT ON CREATE: a NEW file whose name-kin already live in one place — path evidence only, no parse.
// The replay trials' measured failure class: both arms filed admin e2e specs beside navigation specs while
// `admin-panel/` sat one directory over, and line-level checks were structurally silent. This speaks at creation,
// from the accepted tree alone, and never commands — deliberate placement is explicitly left alone.
// «endpoint» in the query, never in the code: the commits that SAY the word show which files they touch — a learned,
// per-repo, citable translation (never a global dictionary), consulted only for tokens no card carries
export function bridgeLines(model, qt, df) {
  const out = [];
  for (const t of qt) {
    if (df.get(t)) continue;
    const row = (model.msgAffinity || []).find(r2 => normTok(r2.t) === t || r2.t === t);
    if (!row) continue;
    const tot = row.files.reduce((a, [, n]) => a + n, 0);
    out.push(
      voice(
        'example',
        `«${row.t}» appears in no code card here, but commits saying it touched: ${row.files
          .slice(0, 3)
          .map(([f, n]) => `\`${f}\` (${n})`)
          .join(' · ')}${row.ex ? ` — e.g. "${row.ex[1]}" (${row.ex[0]})` : ''}`,
        { sha: row.ex ? row.ex[0] : null }
      )
    );
    if (out.length >= 2) break;
  }
  return out;
}
export const QSTOP = new Set([
  'a',
  'an',
  'the',
  'to',
  'for',
  'of',
  'in',
  'on',
  'with',
  'and',
  'or',
  'my',
  'our',
  'this',
  'that',
  'it',
  'is',
  'are',
  'be',
  'do',
  'doe',
  'can',
  'should',
  'would',
  'i',
  'we',
  'you',
  'how',
  'what',
  'where',
  'when',
  'so',
  'via',
  'from',
  'into',
  'onto',
  'up',
  'out',
  'new',
  'some',
  'any',
  'all',
]);
const PL_STOP = new Set([
  'index',
  'main',
  'mod',
  'util',
  'utils',
  'helper',
  'helpers',
  'common',
  'shared',
  'core',
  'base',
  'type',
  'types',
  'test',
  'tests',
  'spec',
  'specs',
  'lib',
  'libs',
  'app',
  'apps',
  'src',
  'file',
  'files',
  'data',
  'component',
  'components',
  'page',
  'pages',
  'view',
  'views',
  'service',
  'services',
  'controller',
  'controllers',
  'module',
  'modules',
  'model',
  'models',
  'config',
  'get',
  'set',
  'add',
  'the',
  'does',
  'not',
  'non',
  'see',
  'sees',
  'has',
  'have',
  'had',
  'was',
  'will',
  'then',
  'than',
  'its',
  'each',
  'every',
  'before',
  'after',
  'between',
  'without',
  'within',
  'still',
  'also',
  'only',
  'their',
  'them',
  'they',
]);
// hoisted out of placementHit so the placement feedback loop (grain.mjs check-hook) can compute the SAME
// suffix/token key for a later write and correlate it against a pending suggestion — one function, not two copies
export function sufOf(f) {
  const ps2 = basename(f).split('.');
  return ps2.length >= 3 ? ps2.slice(-2).join('.').toLowerCase() : (ps2[1] || '').toLowerCase();
}
export function nameTokens(rel) {
  return [...new Set(tokenize(basename(rel).split('.')[0]))].filter(
    t => t.length >= 3 && !PL_STOP.has(t) && !QSTOP.has(t)
  );
}
export function placementHit(model, rel) {
  const files = model.pathsAll || model.filesAll || [];
  if (files.length < 20 || files.includes(rel)) return null;
  const suf = sufOf(rel);
  if (!suf) return null;
  const dir = dirname(rel);
  const cands = files.filter(f => sufOf(f) === suf);
  if (cands.length < 3) return null;
  const toks = nameTokens(rel);
  const hits = [];
  for (const t of toks) {
    // name-kin: same-suffix files carrying this token in their BASENAME; directory segments only
    // as a fallback when basenames are silent — a directory named after the token otherwise inflates T past the
    // too-generic gate and mutes exactly the strongest signal (measured: `admin` vanished behind admin-panel/'s own files)
    let T = cands.filter(f => tokenize(basename(f).split('.')[0]).includes(t));
    if (T.length < 2)
      T = cands.filter(f =>
        dirname(f)
          .split('/')
          .some(sg => tokenize(sg).includes(t))
      );
    if (T.length < 2 || T.length > cands.length * 0.5) continue; // absent, or too generic to place anything
    if (T.some(f => dirname(f) === dir)) continue; // the chosen directory DOES keep such files — nothing to say
    const byDir = new Map();
    for (const f of T) byDir.set(dirname(f), (byDir.get(dirname(f)) || 0) + 1);
    const [topDir, n] = [...byDir].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    if (topDir === dir || n < 2 || n / T.length < 2 / 3) continue;
    hits.push({ t, n, of: T.length, topDir, share: n / T.length });
  }
  hits.sort((a, b) => b.n - a.n || b.share - a.share || (a.t < b.t ? -1 : 1));
  if (hits.length) {
    const best = hits[0];
    // competing name-kin are ARBITRATED in one note, strongest count first — measured (replay-3): sequential
    // contradictory notes made the worker follow the weaker statistic and sunk-cost past the stronger one
    const alts = hits.slice(1, 3).filter(h => h.topDir !== best.topDir);
    const rivalBit = alts.length
      ? ` Weaker name-kin point elsewhere: ${alts.map(h => `\`${h.t}\` → \`${h.topDir}/\` (${h.n} of ${h.of})`).join(' · ')} — the leading count is the one to argue with.`
      : '';
    // §J2.5: files that historically MOVED out of `best.topDir` (a directory change, not a rename in place) —
    // when a supermajority landed on one target, that target is the placement the note itself should have led with
    let moveBit = '';
    const moveRow = (model.moves || {})[suf + '#' + best.t];
    if (moveRow) {
      const outOfTop = Object.entries(moveRow).filter(([pair]) => pair.split('→')[0] === best.topDir);
      const total = outOfTop.reduce((a, [, c]) => a + c, 0);
      const [topPair, tn] = outOfTop.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0] || [];
      if (topPair && tn >= 2 && tn / total >= 2 / 3)
        moveBit = ` ${tn} of ${total} such files born here were later moved to \`${topPair.split('→')[1]}/\`.`;
    }
    return {
      kind: 'placement',
      token: best.t,
      dir: best.topDir,
      suf,
      text: `[grain] ${voice('practiced', `placement: \`*.${suf}\` files named like \`${best.t}\` live in \`${best.topDir}/\` — ${best.n} of ${best.of}; \`${dir}/\` holds none.${rivalBit} Deliberate placement is fine — but if you guessed, ask \`grain where ${best.t} ${suf.split('.')[0]}\` first.${moveBit}`)}`,
    };
  }
  if (cands.length >= 5) {
    // fallback: the suffix itself is kept in one subtree and this file is outside it
    const cnt = new Map();
    for (const f of cands) {
      const segs = dirname(f).split('/');
      for (let k = 1; k <= segs.length; k++) {
        const p2 = segs.slice(0, k).join('/');
        cnt.set(p2, (cnt.get(p2) || 0) + 1);
      }
    }
    let node = null;
    for (const [p2, c] of cnt)
      if (c / cands.length >= 0.8 && p2 !== '.' && (!node || p2.length > node.p.length)) node = { p: p2, c };
    if (node && !(dir + '/').startsWith(node.p + '/'))
      return {
        kind: 'placement',
        token: null,
        dir: node.p,
        suf,
        text: `[grain] placement: ${node.c} of ${cands.length} \`*.${suf}\` files live under \`${node.p}/\`; this one is outside it (\`${dir}/\`). Deliberate is fine — if you guessed, look there first.`,
      };
    if (node && dir === node.p && !cands.some(f => dirname(f) === node.p)) {
      // everyone lives one level deeper — the root holds none
      const subs = new Map();
      for (const f of cands)
        if ((f + '/').startsWith(node.p + '/')) {
          const nxt = f.slice(node.p.length + 1).split('/')[0];
          if (f.slice(node.p.length + 1).includes('/')) subs.set(nxt, (subs.get(nxt) || 0) + 1);
        }
      const top3 = [...subs]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, 3)
        .map(([d2, c2]) => `\`${d2}/\` (${c2})`);
      if (subs.size)
        return {
          kind: 'placement',
          token: null,
          dir: node.p,
          suf,
          text: `[grain] placement: every \`*.${suf}\` file under \`${node.p}/\` lives in a named subdirectory — ${top3.join(' · ')}${subs.size > 3 ? ` · +${subs.size - 3} more` : ''}; none sit at the root, where this file is. Deliberate is fine — if you guessed, pick the closest subdirectory.`,
        };
    }
  }
  return null;
}
