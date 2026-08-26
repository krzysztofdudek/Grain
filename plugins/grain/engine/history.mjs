// grain history layer — the ENTIRE git history, walked once and then resumed.
//   · every distinct historical blob is parsed exactly once EVER (content-addressed cache, sharded by the blob
//     sha's first two hex chars, keyed by extractor version — §13.2)
//   · the per-scope lifecycle / value-event replay (§13.3) and the co-change accumulation (§13.5) are persisted as
//     a replay state stamped with the last walked commit, so a later learn walks only `lastSha..HEAD` and parses
//     only the blobs those commits introduce — "a freshly landed commit costs exactly its new blobs"
//   · a HEAD that does not descend from lastSha (branch switch to a divergent line, rebase, history rewrite) makes
//     the state unusable: the walk starts over from the root — still warm, because the blob cache survives
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { getParser, bindingFor, extractScopes, hashStr, CODE_RE } from './core.mjs';
import { HARD_EXCL, EXT2GRAMMAR, CFG, EXTR_V, HIST_V, AGENT_AUTHOR_RE, FIX_RE } from './config.mjs';
import { tokenize, normTok, QSTOP, DOC_STOP } from './core.mjs';

const PAIR = '\u0001'; // co-change pair-key separator (a control byte — never inside a path; '' split every pair into characters)

export function git(gitdir, args, opts = {}) { return execFileSync('git', ['-C', gitdir, ...args], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'], ...opts }).toString(); }
export function gitOk(gitdir, args) { const r = spawnSync('git', ['-C', gitdir, ...args], { stdio: 'ignore' }); return r.status === 0; }
export function headSha(gitdir) { try { return git(gitdir, ['rev-parse', 'HEAD']).trim(); } catch { return null; } }
export function headTs(gitdir) { try { return +git(gitdir, ['log', '-1', '--format=%ct', 'HEAD']).trim() || 0; } catch { return 0; } }
export function isShallow(gitdir) { try { return git(gitdir, ['rev-parse', '--is-shallow-repository']).trim() === 'true'; } catch { return false; } }
export const isAncestor = (gitdir, a, b) => gitOk(gitdir, ['merge-base', '--is-ancestor', a, b]);

/** The mining input: every code file tracked at HEAD (built-in exclusions and the mining-only test exclusion applied) and a
 *  reader that returns its HEAD content — so the model is a pure function of the commit, never of the worktree. */
export function headTree(gitdir, { skip = () => false } = {}) {
  const shas = new Map();
  for (const line of git(gitdir, ['ls-tree', '-r', '-z', 'HEAD']).split('\0')) { const m = line.match(/^\d+ blob ([0-9a-f]+)\t(.+)$/); if (m) shas.set(m[2], m[1]); }
  const files = [...shas.keys()].filter(p => !HARD_EXCL.test(p) && CODE_RE.test(p) && EXT2GRAMMAR[extname(p)]).sort(); // tracked ⇒ code: gitignore already held at add time
  const contents = new Map();
  // only the files the caller cannot serve from its extraction cache are fetched — a refresh after one commit reads one blob
  const need = files.filter(f => !skip(f, shas.get(f)));
  for (let i = 0; i < need.length; i += 400) {
    const chunk = need.slice(i, i + 400);
    const out = spawnSync('git', ['-C', gitdir, 'cat-file', '--batch'], { input: chunk.map(f => 'HEAD:' + f).join('\n') + '\n', maxBuffer: 1 << 30 }).stdout;
    let off = 0, k = 0;
    while (off < out.length && k < chunk.length) { const nl = out.indexOf(10, off); if (nl < 0) break;
      const hdr = out.slice(off, nl).toString().split(' ');
      if (hdr[1] === 'missing' || hdr[1] === 'ambiguous') { off = nl + 1; k++; continue; }
      const size = +hdr[2]; contents.set(chunk[k], out.slice(nl + 1, nl + 1 + size).toString('utf8')); off = nl + 1 + size + 1; k++; } }
  return { files, allPaths: [...shas.keys()].sort(), sha: rel => shas.get(rel), read: rel => contents.get(rel) ?? null }; }

function atomicWrite(path, data) { const tmp = path + '.tmp-' + process.pid; writeFileSync(tmp, data); renameSync(tmp, path); }

// ----- blob cache: blobs/<2hex>.json = { "<sha>": scopeRecords[] } -----
class BlobCache {
  constructor(dir) { this.dir = dir; this.shards = new Map(); this.dirty = new Set();
    mkdirSync(dir, { recursive: true });
    const vf = join(dir, 'VERSION');
    if (!existsSync(vf) || readFileSync(vf, 'utf8').trim() !== EXTR_V) { // extractor changed ⇒ the whole cache is invalid by key
      for (const f of readdirSync(dir)) if (f.endsWith('.json')) rmSync(join(dir, f));
      writeFileSync(vf, EXTR_V + '\n'); } }
  shard(sha) { const k = sha.slice(0, 2); let s = this.shards.get(k);
    if (!s) { const f = join(this.dir, k + '.json'); s = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}; this.shards.set(k, s); } return s; }
  has(sha) { return Object.prototype.hasOwnProperty.call(this.shard(sha), sha); }
  get(sha) { return this.shard(sha)[sha]; }
  set(sha, sc) { this.shard(sha)[sha] = sc; this.dirty.add(sha.slice(0, 2)); }
  flush() { for (const k of this.dirty) atomicWrite(join(this.dir, k + '.json'), JSON.stringify(this.shards.get(k))); this.dirty.clear(); }
}

// ----- the walk: one streaming `git log --raw` over a commit range -----
async function walk(gitdir, range) {
  // streamed: the raw log of a large repository is hundreds of MB; only the parsed records are kept
  const { spawn } = await import('node:child_process'); const { createInterface } = await import('node:readline');
  const child = spawn('git', ['-C', gitdir, 'log', '--reverse', '--raw', '--no-abbrev', '--no-merges', '-M', '--format=%x01%H%x00%ct%x00%an <%ae>%x00%s', ...(range ? [range] : [])], { stdio: ['ignore', 'pipe', 'ignore'] });
  const events = []; const commits = []; let cur = null; const blobExt = new Map();
  for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
    if (line.startsWith('\x01')) { const p = line.slice(1).split('\x00');
      cur = { sha: p[0], ts: +p[1], agent: AGENT_AUTHOR_RE.test(p[2]), author: hashStr(p[2]), fix: FIX_RE.test(p[3] || ''), msg: (p[3] || '').slice(0, 120), files: [] };
      commits.push(cur); continue; }
    const m = line.match(/^:\d+ \d+ [0-9a-f]+ ([0-9a-f]+) ([AMD]|R\d+)\t(.+)$/);
    if (!m || !cur) continue;
    const st = m[2][0]; let path = m[3], oldPath = null;
    if (st === 'R') { const [o, n] = m[3].split('\t'); oldPath = o; path = n; }
    if (HARD_EXCL.test(path)) continue;          // only grain's own store is invisible — a path committed at the time was the repo's code at the time
    if (!CODE_RE.test(path)) { cur.files.push(path); continue; }
    cur.files.push(path);
    events.push({ sha: st === 'D' ? null : m[1], st, path, oldPath, c: cur });
    if (st !== 'D' && !/^0+$/.test(m[1])) blobExt.set(m[1], extname(path)); }
  await new Promise(res => child.on('close', res));
  return { events, commits, blobExt }; }

async function parseBlobs(gitdir, cache, blobExt, log) {
  const shas = [...blobExt.keys()].filter(s => !cache.has(s)); let parsed = 0, bytes = 0;
  for (let i = 0; i < shas.length; i += 400) {
    const chunk = shas.slice(i, i + 400);
    const out = spawnSync('git', ['-C', gitdir, 'cat-file', '--batch'], { input: chunk.join('\n'), maxBuffer: 1 << 30 }).stdout;
    let off = 0;
    while (off < out.length) { const nl = out.indexOf(10, off); if (nl < 0) break;
      const hdr = out.slice(off, nl).toString().split(' ');
      if (hdr[1] === 'missing') { off = nl + 1; continue; }
      const size = +hdr[2]; const body = out.slice(nl + 1, nl + 1 + size); off = nl + 1 + size + 1;
      bytes += size; const sha = hdr[0]; if (size > 1.5e6) { cache.set(sha, []); continue; }
      // language from the HISTORICAL path's extension recorded in the walk — never by sniffing content (§13.2)
      try { const ext = blobExt.get(sha); const p = await getParser(ext); const b = bindingFor(p._g);
        const tr = p.parse(body.toString());
        const sc = extractScopes('b.tmp', tr, b).filter(s => s.kind !== 'file').map(s => ({ k: s.kind, n: s.name, o: s.ord,
          bh: hashStr(s.preds['auto.first1'] + '|' + [...s.seen].sort().join(',') + '|' + [...s.calls].sort().join(',') + '|' + s.decos.join(',') + '|' + s.sup.join(',') + '|' + s.preds['auto.nameshape']),
          val: { ns: s.preds['auto.nameshape'], f1: s.preds['auto.first1'] || '', ret: s.preds['auto.ret'] || '', deco: [...s.decos].sort(), sup: [...s.sup].sort() } }));
        tr.delete(); cache.set(sha, sc); parsed++;
      } catch { cache.set(sha, []); } }
    if (log && shas.length > 400) log(`  blobs ${Math.min(i + 400, shas.length)}/${shas.length}`); }
  cache.flush();
  return { parsed, bytes, total: blobExt.size }; }

// ----- replay state (persisted) -----
const freshState = () => ({ x: EXTR_V, h: HIST_V, lastSha: null, commits: 0, events: 0, blobShas: Object.create(null), firstTs: null, msgAff: Object.create(null), msgAffEx: Object.create(null), msgTokCommits: Object.create(null),
  lc: Object.create(null), vev: Object.create(null), prevState: Object.create(null), pairSup: Object.create(null), fileCommits: Object.create(null) });
function replay(state, events, commits, cache) {
  for (const e of events) {
    if (e.st === 'R' && e.oldPath) { const s0 = state.prevState[e.oldPath];
      if (s0) { state.prevState[e.path] = s0; delete state.prevState[e.oldPath];
        // a renamed file's scopes keep their timelines (§13.3): move lifecycle rows and value events to the new path, else
        // every moved scope is born again at the rename and drops out of the established population (measured: after a
        // directory move the old repo-wide norm flagged every moved file)
        for (const k of Object.keys(s0)) { const ok = e.oldPath + '#' + k, nk = e.path + '#' + k;
          if (state.lc[ok] && !state.lc[nk]) { state.lc[nk] = state.lc[ok]; state.lc[nk].path = e.path; delete state.lc[ok]; }
          if (state.vev[ok] && !state.vev[nk]) { state.vev[nk] = state.vev[ok]; delete state.vev[ok]; } } } }
    if (e.st === 'D') { delete state.prevState[e.path]; continue; }
    const scopes = cache.get(e.sha) || []; const curM = Object.create(null);
    for (const s of scopes) curM[s.k + '#' + s.n + (s.o ? '#' + s.o : '')] = s;
    const prev = state.prevState[e.path] || Object.create(null);
    for (const k of Object.keys(curM)) { const s = curM[k]; const key = e.path + '#' + k; let L = state.lc[key];
      if (!L) { L = { path: e.path, first: e.c.ts, last: e.c.ts, mods: 0, churn: false, fix: 0, agentLast: e.c.agent }; state.lc[key] = L;
        if (state.firstTs == null || e.c.ts < state.firstTs) state.firstTs = e.c.ts;
        (state.vev[key] ||= []).push({ ts: e.c.ts, author: e.c.author, agent: e.c.agent, val: s.val }); }
      const pv = prev[k];
      if (pv && pv.bh !== s.bh) { L.mods++; if (e.c.fix) L.fix++; if (e.c.ts - L.first <= 14 * 86400) L.churn = true;
        L.last = e.c.ts; L.agentLast = e.c.agent;
        if (JSON.stringify(pv.val) !== JSON.stringify(s.val)) state.vev[key].push({ ts: e.c.ts, author: e.c.author, agent: e.c.agent, val: s.val }); } }
    state.prevState[e.path] = curM; }
  // co-change (mega-commit cap excludes mass refactors and lockfile sweeps that would couple everything to everything)
  for (const c of commits) { const fs2 = [...new Set(c.files)].filter(f => !HARD_EXCL.test(f)).sort();
    // commit-message affinity: every commit is a translation pair — natural language on one side, the touched files on
    // the other. This is the repo teaching its own vocabulary ("endpoint" ↔ the controller files); a single-file commit
    // is the SHARPEST pair there is, so the gate is only the bulk cap, not the co-change pair minimum
    if (fs2.length >= 1 && fs2.length <= CFG.megaCap && c.msg) {
      const toks = [...new Set(tokenize(c.msg).map(normTok))].filter(t2 => t2.length >= 3 && !QSTOP.has(t2) && !DOC_STOP.has(t2)).slice(0, 12);
      for (const t2 of toks) { const m2 = (state.msgAff[t2] ||= Object.create(null)); for (const f of fs2) m2[f] = (m2[f] || 0) + 1;
        state.msgTokCommits[t2] = (state.msgTokCommits[t2] || 0) + 1;
        if (!state.msgAffEx[t2]) state.msgAffEx[t2] = [c.sha.slice(0, 7), c.msg.slice(0, 80)]; } }
    if (fs2.length < 2 || fs2.length > CFG.megaCap) continue;
    for (const f of fs2) state.fileCommits[f] = (state.fileCommits[f] || 0) + 1;
    for (let i = 0; i < fs2.length; i++) for (let j = i + 1; j < fs2.length; j++) {
      const k = fs2[i] + PAIR + fs2[j]; state.pairSup[k] = (state.pairSup[k] || 0) + 1; } }
  state.commits += commits.length; state.events += events.length;
  if (commits.length) state.lastSha = commits[commits.length - 1].sha; }

function toH(state, gitdir) {
  const cochange = [];
  for (const k of Object.keys(state.pairSup)) { const sup = state.pairSup[k]; if (sup < CFG.cochangeMinSup) continue; const [a, b] = k.split(PAIR);
    const commitsA = state.fileCommits[a] || 1, commitsB = state.fileCommits[b] || 1;
    const ca = Math.max(sup / commitsA, sup / commitsB);
    // commitsA/commitsB are persisted so a consumer can gate DIRECTIONALLY (editing `a` names `b` iff sup/commitsA ≥ minConf);
    // the store keeps every pair above the support floor — confidence is a query-time decision, and a build-time cut threw
    // away real partners (cli.py→tests/test_cli.py at 0.38) before the directional gate ever saw them
    cochange.push({ a, b, sup, conf: +ca.toFixed(2), commitsA, commitsB }); }
  cochange.sort((p, q) => q.sup - p.sup || (p.a < q.a ? -1 : p.a > q.a ? 1 : p.b < q.b ? -1 : 1));
  const lc = new Map(Object.entries(state.lc)); const vev = new Map(Object.entries(state.vev));
  return { lc, vev, cochange, msgAff: state.msgAff || {}, msgAffEx: state.msgAffEx || {}, msgTokCommits: state.msgTokCommits || {}, commitsN: state.commits, NOW: headTs(gitdir), firstTs: state.firstTs ?? 0,
    stats: { commits: state.commits, events: state.events, blobs: Object.keys(state.blobShas).length } }; }

/**
 * Load (resuming if possible) the history of `gitdir`, persisting under `store.dir`.
 * Returns { H, mode: 'full'|'incremental'|'unchanged'|'none', parsed, reason }.
 */
export async function loadHistory({ gitdir, store, log = () => {}, full = false }) {
  const head = headSha(gitdir);
  if (!head) return { H: null, mode: 'none', reason: 'not a git repository (or no commits yet)' };
  if (isShallow(gitdir)) return { H: null, mode: 'none', reason: 'shallow clone — history unavailable, weights flat' };
  const t0 = Date.now();
  const cache = new BlobCache(join(store.dir, 'blobs'));
  let state = null;
  if (!full && existsSync(store.historyPath)) { try { state = JSON.parse(readFileSync(store.historyPath, 'utf8')); } catch { state = null; } }
  let mode = 'full', range = null;
  if (state && state.x === EXTR_V && state.h === HIST_V && state.lastSha) {
    if (state.lastSha === head) { mode = 'unchanged'; }
    else if (isAncestor(gitdir, state.lastSha, head)) { mode = 'incremental'; range = state.lastSha + '..HEAD'; }
    else { state = null; mode = 'full'; } // divergent line of history or rewrite ⇒ the replay state cannot be continued
  } else state = null;
  if (mode === 'unchanged') { return { H: toH(state, gitdir), mode, parsed: 0, ms: Date.now() - t0 }; }
  if (!state) state = freshState();
  log(mode === 'full' ? 'walking full history' : `walking ${range}`);
  const { events, commits, blobExt } = await walk(gitdir, range);
  const { parsed, total } = await parseBlobs(gitdir, cache, blobExt, log);
  for (const sha of blobExt.keys()) state.blobShas[sha] = 1; // distinct blobs over the whole history — identical whether walked at once or resumed
  replay(state, events, commits, cache);
  // a range walk of `lastSha..HEAD` can be empty when HEAD moved by merge commits only; the stamp must still advance
  state.lastSha = head;
  atomicWrite(store.historyPath, JSON.stringify(state));
  log(`[history] ${commits.length} commits, ${total} blobs (${total - parsed} cached, ${parsed} parsed), ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { H: toH(state, gitdir), mode, parsed, ms: Date.now() - t0 }; }
