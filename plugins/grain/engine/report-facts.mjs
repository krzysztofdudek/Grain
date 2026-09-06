// grain engine · the fact tiers, the standing notes and the health rows a report is built from
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { extname } from 'node:path/posix';
import { EXT2GRAMMAR, CFG } from './config.mjs';
import { relSupported, relPathOnly } from './relations.mjs';
import { baselineClause } from './cards.mjs';
import { STRUCT_PID, archCellLabel, factLabel, isDefiningFact, part, pct, scopeLabel } from './facts.mjs';
import { deviationPhrase } from './verbalize.mjs';

// three tiers, each under its own --top cap: domain conventions (a choice someone made) first, structural-shape
// contrasts (the language showing through a group/directory boundary, not a chosen convention) second, lexical
// style (quotes, semicolons, indentation) last — bpi alone conflates them, since a crisp small sample can
// out-score a large one on codelength gain per instance without being more worth a reader's attention (measured:
// a 10-member arity contrast outranked a 30-member decorator convention by bpi alone). Shared by report() and
// rulesMarkdown() so the two renderers can never drift on what counts as a "chosen" convention.
export function factTiers(p) {
  const shown = p.facts.filter(f => !isDefiningFact(p.medoids, f));
  const taut = p.facts.filter(f => isDefiningFact(p.medoids, f)).length;
  const isLex = f => f.pid.startsWith('auto.lex:');
  const domain = shown.filter(f => !STRUCT_PID.test(f.pid) && !isLex(f));
  const structural = shown.filter(f => STRUCT_PID.test(f.pid));
  const lexical = shown.filter(isLex);
  return { domain, structural, lexical, taut };
}
// (§013/§024 ruling) `+dirty` is spoken for: it means "this answer incorporates your uncommitted edits", true
// only of `check`/`review` (always) and `spectrum`/`explain` (for the one file asked about, since §013 made them
// read it live). A HEAD-reading command (where/how/what/map/status/report/rules/completeness — grain.mjs) never
// reads the worktree at all, so it may never claim `+dirty` — but a dirty tree still means today's answer may not
// match what's on disk, and that is worth saying. Same register as relCoverageNote/intraModuleNote just below: a
// plain declarative sentence, not a hedge, not voice()-wrapped, and never confusable with `+dirty` itself.
// Exported so grain.mjs's CLI layer (which alone knows whether the worktree is actually dirty) and rulesMarkdown's
// own generated-document text (below) share one wording instead of two that could drift apart.
export const DIRTY_TREE_NOTE =
  'the worktree has uncommitted changes — this answer is computed from the indexed commit, not the current files on disk';
// §042: a lexical style surface is a per-FILE majority vote (lexicalPreds) — `auto.lex:quote` reads `double` while at
// most 20% of the file's literals are single-quoted. So a conforming file can hold, or GAIN, many departing literals
// without the value ever moving: measured, telescope.nvim's buffer_previewer.lua absorbs 50 new single-quoted literals
// in silence and flips only at 51; express's test/acceptance/mvc.js absorbs 12 and flips at 15; the budget is 0.25 ×
// the majority count, so it grows with file size (957 / 2050 / 1067 literals repo-wide on telescope.nvim / express /
// flask). The vote is the right unit to MINE — a delimiter forced by the content (`'he said "hi"'`) is not a style
// choice, and 11 of 11 minority literals in telescope.nvim are exactly that — but `check` must not call the file
// conforming without saying what a file-granularity vote cannot see. Same register and same one-constant-two-renderers
// discipline as TEMPLATE_DESCRIPTIVE_NOTE below.
const LEX_UNIT = {
  'auto.lex:quote': ['string literal', 'string literals'],
  'auto.lex:semi': ['statement', 'statements'],
  'auto.lex:decl': ['declaration', 'declarations'],
  'auto.lex:indent': ['indented line', 'indented lines'],
};
// §077 (director-approved follow-up to §042, esc-1): of the minority-quote literals a per-file quote vote counts
// as departing (lexTally's `off`, below), a delimiter forced by the literal's OWN body (`'he said "hi"'` in a
// double-quote file — the other quote would need escaping) is not a style choice; §042 already measured this
// holds for 11/11 telescope.nvim, 19/31 flask and 2/24 express minority literals. This is the one content test
// that tells a genuine departure apart from a forced one — reused here rather than reimplemented, and gated on
// nothing but `exp` already being a real majority (`checkFile` only ever calls this for a certified fact, so
// there is no new tunable: the file-level convention's own acceptance decides whether this can ever run).
export function quoteFlags(exp, literals) {
  if (exp !== 'single' && exp !== 'double') return []; // no per-literal flag on an uncertified/`mixed` vote
  const majority = exp === 'single' ? "'" : '"';
  const minority = exp === 'single' ? '"' : "'";
  return (literals || []).filter(l => l.q === minority && !l.body.includes(majority));
}
// null when there is nothing to disclose; otherwise the counts AND the sentence, from one computation, so the JSON
// field and the printed clause can never disagree about the same file. `flags` (§077) is the subset of the hidden
// instances that are genuine violations, not delimiter-forced (quoteFlags above) — always [] for the three
// non-quote lexical surfaces, so their note is byte-for-byte unchanged from §042.
export function lexTally(pid, exp, tally, flags = []) {
  const unit = LEX_UNIT[pid];
  if (!unit || !tally || tally[exp] === undefined) return null; // `mixed`/`other` name no instance: nothing to count
  const total = Object.values(tally).reduce((a, c) => a + c, 0);
  const conforming = tally[exp];
  const off = total - conforming;
  if (total <= 0 || off <= 0) return null; // every instance conforms: the file-level verdict is true per instance too
  const flagged = flags.length;
  const flagClause = flagged
    ? `, ${flagged} flagged as a genuine violation${flagged > 1 ? 's' : ''} (not delimiter-forced): ${flags
        .slice(0, 6)
        .map(f => `line ${f.line}`)
        .join(', ')}${flagged > 6 ? ` · +${flagged - 6} more` : ''}`
    : ' and none of them is flagged';
  return {
    conforming,
    total,
    flagged,
    flagLines: flags.map(f => f.line),
    note: ` — scored per file, not per ${unit[0]}: ${off} of ${total} ${unit[1]} here depart from it${flagClause}`,
  };
}
// §030: a `report`/`rules` TEMPLATE line (mineTemplates/profileOf — unclustered residue, never a role group) is a
// render-only structural superposition: it has no cell in `part.facts`, so `check`/`review`/hooks cannot fail a
// member for breaking its shape — not even the partial bridge J5.8 gives CLUSTERED role-group profiles
// (`part.profiles[r].req`, checked only in the "missing a required signature" direction). A reader who sees "held
// since 2008" here reasonably assumes `check` guards it; it does not, in either direction, ever. Same register as
// DIRTY_TREE_NOTE/relCoverageNote/intraModuleNote just above: a plain declarative sentence, not a hedge. One
// constant, used by both report() and rulesMarkdown() so the two can never say different things about the same
// template line (§007 — the exact drift this repo already fixed once for a different disclosure).
export const TEMPLATE_DESCRIPTIVE_NOTE =
  "descriptive only — check has no cell for a template's shape, so a member breaking it is never flagged";
// how much of the indexed file set the relation/architecture layer can even see — a grammar with no relSupported()
// extractor contributes file/module edges of exactly zero, indistinguishable from a real, measured "this language
// imports nothing" without this disclosure; pure render from data the model already has, zero heuristics about
// WHICH languages (driven by relSupported's capability list, and relPathOnly's — relations.mjs, issue 041 — for
// an extractor that IS registered but can only ever see a literal #include-style path, never a real symbol
// reference) (§G21). `relSupported(g) && !relPathOnly(g)` is "genuinely covered"; either false lands a grammar in
// `uncovered` — a path-only extractor's near-total real-world resolution failure (leveldb: 0 of 134 files'
// dependencies computed, issue 041) must never read as "resolution covers this, the code just imports nothing".
// The {n, grammars} shape is exported (not just the prose below) so export.mjs (§027) can carry the identical
// fact `report`/`status` print — one function computes it, so the two surfaces can never drift apart the way
// rules/report once did (§007).
// issue 059: PHP is NOT `relPathOnly` — its extractor resolves call/type-ref/instanceof references through
// the symbol table like any full-featured language, not a literal-path grep — so `relSupported && !relPathOnly`
// alone reads it as genuinely covered. But EVERY one of those resolutions still bottoms out in a PSR-4 lookup
// (`resolvePhpFqn`, php-resolve.mjs): with no psr-4 autoload map anywhere in the tree (no composer.json, or one
// with no `autoload`/`autoload-dev` psr-4 section) that lookup can never succeed for ANY `use`, and grain's own
// merged map (`model.phpAutoload`, relations.mjs `phpAutoloadResolverFor`) stays empty — the same "near-total
// real-world resolution failure reading as covered" 041 caught for path-only extractors, just keyed on repo
// CONTENT (a PSR-4 map to consult) instead of extractor STRUCTURE. A PHP repo that pins its architecture down
// to composer.json (Symfony, Slim, virtually every modern framework) is unaffected — flagged only when that
// signal is entirely absent, the one case a real edge could never have existed.
// issue 086: 041/059 both catch a WHOLE grammar with no real edges anywhere. This is the narrower shape: a
// repo dominated by one grammar (okhttp: Kotlin+Java, playframework: Java+Scala+asset-pipeline JS, groovy-spock:
// Java+Groovy+Kotlin) where a SMALL secondary grammar's own files carry literally zero in/out edges even though
// that grammar is fully `relSupported` and not `relPathOnly` elsewhere in a single-grammar repo (a standalone
// Java or Kotlin fixture with the identical import shape resolves fine — verified live). Root cause traced to
// the vendored SymbolTable partitioning declarations by LANGUAGE on purpose (crosslang-symbol-table-partition
// test) so a same-named Java/Kotlin/Groovy/Scala type never collides across languages — but that also means a
// secondary population whose real-world references mostly cross INTO the dominant grammar (the common shape once
// one language is being migrated to another) can never resolve there; teaching every extractor pair to cross a
// language boundary safely is genuinely new work, out of scope here. The FLOOR instead: any grammar meeting the
// same small-population floor `CFG.minEff` already uses repo-wide for "too little evidence to claim anything"
// (§9.4's absence-boundary idiom), with a real file population here but not one edge touching any of its files,
// joins the same disclosed-uncovered set 041's relPathOnly and 059's phpNoAutoload already populate — a purely
// OUTCOME-keyed check (never a hardcoded grammar-pair name) that generalizes to any future grammar combination.
export function relCoverageData(model) {
  const uncovered = new Map(); // grammar name -> file count
  const phpNoAutoload = !(model.phpAutoload && model.phpAutoload.length);
  const filesByGrammar = new Map(); // grammar -> its own file list, reused below for the issue-086 zero-edge check
  for (const f of model.filesAll || []) {
    const g = EXT2GRAMMAR[extname(f)];
    if (!g) continue;
    (filesByGrammar.get(g) || filesByGrammar.set(g, []).get(g)).push(f);
    if (!relSupported(g) || relPathOnly(g) || (g === 'php' && phpNoAutoload))
      uncovered.set(g, (uncovered.get(g) || 0) + 1);
  }
  const edgedFiles = new Set();
  for (const e of model.edges || []) {
    edgedFiles.add(e.from);
    edgedFiles.add(e.to);
  }
  for (const [g, list] of filesByGrammar) {
    if (uncovered.has(g) || list.length < CFG.minEff) continue;
    if (!list.some(f => edgedFiles.has(f))) uncovered.set(g, list.length);
  }
  const n = [...uncovered.values()].reduce((a, b) => a + b, 0);
  return { n, grammars: [...uncovered.keys()].sort() };
}
export function relCoverageNote(model) {
  const { n, grammars } = relCoverageData(model);
  if (!n) return null;
  return `resolution does not cover ${n} file${n > 1 ? 's' : ''} (${grammars.join(', ')}) — conventions layer only for those`;
}
// the sibling gap (§004): every import CAN be resolution-supported and genuinely resolved (model.edges nonempty)
// and the module graph can still show zero directed dependencies — module ids are directory buckets (moduleOf /
// refineModOf, relations.mjs) and a package too small to trip the dominant-module refinement keeps its entire
// real architecture INSIDE one node, so every resolved edge is `a === b` and folded away by moduleGraph's own
// edge-folding step. Without this, "N modules · 0 directed dependencies" reads as a measured "this code imports
// nothing" instead of a module-granularity artifact — confirmed live on flask's src/flask/ (118 real edges, 0
// surviving module-level). Pure render off model.edges/model.moduleGraph, no new heuristics.
export function intraModuleNote(model) {
  const mg = model.moduleGraph;
  const n = (model.edges || []).length;
  if (!mg || mg.edges.length || !n) return null;
  return `${n} file-level edge${n > 1 ? 's' : ''} resolved, none crossing a module boundary — the architecture graph only counts cross-module dependencies`;
}
// §038: a "module" here is a directory bucket — moduleOf/refineModOf (relations.mjs), refined one path segment
// deeper once a root holds most of the repo — never a build-declared source set. A directory holding more than
// one source set (a Gradle/Kotlin-Multiplatform `src/` with `commonMain`/`jvmMain`/`jvmTest` trees, `src/main` +
// `src/test` under one module root, any multi-sourceSet Java layout) folds all of them into a single node, so an
// edge from that node's test code counts identically to one from its production code. A reported cycle can
// therefore be entirely a test-only dependency (one source set importing another's test helpers) with no
// production cycle behind it at all — confirmed live on Kotlin/okhttp's jvmTest → test-support edges. Fires on
// every cycle report, not only ones that look test-shaped: grain has no name-based test detection (config.mjs's
// DESIGN RULING, "kod to kod"), so there is no structural signal to select on without inventing one. Same register
// as DIRTY_TREE_NOTE/relCoverageNote/intraModuleNote above: a plain declarative sentence, not a hedge. Exported so
// report() and rulesMarkdown() say the identical thing about the identical cycle (§007 — the drift this repo
// already fixed once for a different disclosure).
export const CYCLE_GRANULARITY_NOTE =
  'modules here are directory buckets (refined one level under a dominant root), not build-declared source sets — a module that folds together more than one source set, such as production and test code under one src/ tree, can show a cycle that is entirely a test-only dependency, not a production one';
// an exemplar for a (partition, role) group, resolved off the same role-defining fact convention twins/archetypes
// already carry a `cid` prefix of `r<role>:` for — used only to anchor a health suggestion in a real, copy-pasteable
// `<path>#<name>` (§J5.5), never to render the fact itself
export function roleExemplar(model, part, role) {
  const p = (model.partitions || []).find(x => x.name === part);
  const f = p && p.facts.find(x => x.cid.startsWith('r' + role + ':') && x.exemplars && x.exemplars[0]);
  return f ? { f, ex: f.exemplars[0] } : null;
}
// == health == (§J5.5): repo-wide signals that suggest a maintainer decision, composed from fields ALREADY on the
// model (J5.1 f.cost, J5.2 f.rejected, J5.3 f.agentShare, J3.4 model.twins, J4.1 model.changeArchetypes, J1.3
// model.waivers, E4 baselineClause) plus, when the caller supplies it, `check-outcomes.json` (J5.4) — report()/
// rulesMarkdown() are pure functions of `model` and cannot read files themselves, so `outcomes` travels in as a
// parameter from cmdReport/cmdRules, which do the reading. Every row here is later wrapped in `voice('practiced',
// …)` by the caller and is deliberately colon-free at the start (the `word: ` prefix trips voices.test.mjs's marker
// detector — the SAME trap §J4.1 hit once already). Each row ends in a plain-text `grain decide …` suggestion —
// descriptive only, never executed — anchored on a real scope wherever one is cheaply resolvable.
export function healthRows(model, outcomes) {
  const rows = [];
  for (const p of model.partitions || [])
    for (const f of p.facts) {
      // 1: costly to deviate from (J5.1)
      if (!f.cost || !f.cost.baseK) continue;
      const ex = f.exemplars[0];
      if (!ex) continue;
      const mult = (f.cost.k / f.cost.n / (f.cost.baseK / f.cost.baseN)).toFixed(1);
      rows.push(
        `${factLabel(p, f)} costs ${mult}× more fixes when deviated from (${f.cost.k} of ${f.cost.n} vs ${f.cost.baseK} of ${f.cost.baseN})` +
          ` → grain decide steer ${ex.rel}#${ex.name} --surfaces ${f.pid} --note "codify — deviating costs ${mult}× more fixes"`
      );
    }
  for (const p of model.partitions || [])
    for (const f of p.facts) {
      // 2: rejected alternatives (J5.2)
      if (!f.rejected) continue;
      const ex = f.exemplars[0];
      if (!ex) continue;
      for (const r of f.rejected)
        rows.push(
          `${factLabel(p, f)} — ${deviationPhrase(f, r.v)} tried ${r.tried}×, reverted ${r.reverted}× — a rejection, not an alternative` +
            ` → grain decide steer ${ex.rel}#${ex.name} --surfaces ${f.pid} --note "value already rejected ${r.tried}× — document it so it is not re-litigated"`
        );
    }
  for (const p of model.partitions || [])
    for (const f of p.facts) {
      // 3: echo chambers (J5.3)
      if (f.agentShare == null) continue;
      const ex = f.exemplars[0];
      if (!ex) continue;
      rows.push(
        `${factLabel(p, f)} is held mostly by agent-authored code (${pct(f.agentShare)}% of recent conformers)` +
          ` → grain decide steer ${ex.rel}#${ex.name} --surfaces ${f.pid} --note "ratify — currently held mostly by agent-authored code"`
      );
    }
  if (outcomes && outcomes.byFact) {
    // 4: ignored after warning (J5.4) — silent whenever the caller has no outcomes file
    const entries = Object.entries(outcomes.byFact)
      .filter(([, k]) => k >= 2)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 5);
    for (const [key, k] of entries) {
      const i = key.indexOf('::');
      if (i < 0) continue;
      const pname = key.slice(0, i),
        pid = key.slice(i + 2);
      const p = (model.partitions || []).find(x => x.name === pname);
      const f = p && p.facts.find(x => x.pid === pid);
      const dv = f && f.deviants && f.deviants[0],
        ex = f && f.exemplars[0];
      if (dv)
        rows.push(
          `${scopeLabel(pname)} keeps ignoring the \`${pid}\` warning at ${dv.rel}:${dv.line} (flagged and ignored ${k}×)` +
            ` → grain decide waive ${dv.rel}#${dv.name} --on ${pid} --note "flagged and ignored ${k}×"`
        );
      else if (ex)
        rows.push(
          `${scopeLabel(pname)} keeps ignoring the \`${pid}\` warning (flagged and ignored ${k}×)` +
            ` → grain decide steer ${ex.rel}#${ex.name} --surfaces ${pid} --note "reconsider — flagged and ignored ${k}×"`
        );
    }
  }
  // 5 (structural twins, J3.4) is DELIBERATELY ABSENT — the slot is kept numbered so this stays legible against
  // §J5.5's own list. `model.twins` still exists, `export` still publishes it, and `where`'s group card still
  // prints `twin: structurally the same as «B» …`. What was removed is only the health row, which turned that
  // observation into an unsolicited `grain decide steer … "duplicate of … unify or document why both exist"`.
  // MEASURED (§044, 3 languages, 75 rows hand-adjudicated against a criterion fixed before the pairs were seen,
  // ties scored in the tool's favour so the figure is an upper bound): precision 18/75 = 0.24 — 0.36 on
  // OpenZeppelin, 0.32 on flask, 0.04 on gin. The cause is not a loose threshold but a MISSING BASELINE:
  // `3*shared > A.shared + B.shared` is a within-pair test that never asks what two ARBITRARY role groups of that
  // construct already share. Measured over 861 same-root pool pairs in gin the median shared core is 10 — and
  // gin's ACCEPTED twins median 10 too, i.e. the gate admits pairs that are exactly typical. The cores it accepts
  // there are bare declaration syntax (`func X(t *testing.T) { … }` and nothing else).
  // Do NOT "fix" this with a minimum skeleton size: measured, gin's whole population is 6–23 nodes and flask's
  // 5–12, so any floor clearing gin's noise deletes flask's true rows with it. Subtracting the measured per-root
  // median (constant-free) was also tried: it lifts precision to 0.56 but zeroes Go and loses 4 of 18 true rows.
  // Rows were also not independent — 33 of OpenZeppelin's 83 were `Packing.sol` pairing with itself, one fact
  // rendered as 33 separate instructions — and `rules` wrote every one of them into the user's committed
  // CONVENTIONS.md. Full measurement: .temp/issues/044-twins-duplicate-noise/log.md.
  for (const a of model.changeArchetypes || []) {
    // 6: incomplete change shapes (J4.1) — usually, not always: certification's
    // own λ bound puts every CERTIFIED cell's share at >= 0.89, so 0.6 <= share < certification is exactly "usually,
    // not always" without inventing a new upper-bound constant (the 0.6 floor already has three precedents in this file)
    let anchor = null;
    for (const c of a.cells) {
      if (c.certified && c.cell.startsWith('g:')) {
        const v = c.cell.slice(2);
        const i = v.lastIndexOf('#');
        anchor = roleExemplar(model, v.slice(0, i), +v.slice(i + 1));
        if (anchor) break;
      }
    }
    if (!anchor) continue;
    for (const c of a.cells) {
      if (!(c.share >= 0.6) || c.certified) continue;
      rows.push(
        `change shape "${a.label}" usually but not always touches ${archCellLabel(model, c.cell)} (${c.k} of ${a.n}, ${pct(c.share)}%)` +
          ` → grain decide steer ${anchor.ex.rel}#${anchor.ex.name} --surfaces ${anchor.f.pid} --note "confirm ${archCellLabel(model, c.cell)} as a required part of '${a.label}' changes"`
      );
    }
  }
  {
    const groups = new Map(); // 7: conventions riddled with waivers (J1.3) — grouped by partition + '::' + pid, never pid
    // alone: a waiver carries no `cid`, and grouping by pid alone would merge unrelated conventions across partitions/cells
    for (const wv of model.waivers || []) {
      if (!wv.found) continue;
      const key = wv.partition + '::' + wv.pid;
      (groups.get(key) || groups.set(key, []).get(key)).push(wv);
    }
    for (const [, list] of groups) {
      if (list.length < 3) continue;
      const wv = list[0];
      rows.push(
        `\`${wv.pid}\` in ${scopeLabel(wv.partition)} carries ${list.length} waivers (e.g. ${wv.path}#${wv.name})` +
          ` → grain decide steer ${wv.path}#${wv.name} --surfaces ${wv.pid} --note "${list.length} waivers recorded here — consider promoting this scope's own value instead"`
      );
    }
  }
  for (const st of model.steers || []) {
    // 8: dead steers (E4) — baseline only ever rides on a steer's first pid, and
    // only ever for a PARTITION-WIDE convention (baselineShare reads just the `_all:` cell), so a steer over a purely
    // group/directory-local convention structurally never gets a baseline at all and can never fire this row — a known,
    // accepted coverage gap from §E4, not something to fix here
    if (!st.found) continue;
    for (const sf of st.surfaces) {
      if (sf.retires || !sf.baseline) continue;
      const clause = baselineClause(sf);
      if (!clause.includes('no movement')) continue;
      rows.push(
        `steer ${st.id} on ${st.path}#${st.name} has not moved the needle${clause} → grain decide rm ${st.id}`
      );
    }
  }
  return rows;
}
