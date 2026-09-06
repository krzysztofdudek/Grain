// grain engine · birth obligations — what a new file under a module has historically come with
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { CFG } from './config.mjs';
import { refineModOf } from './relations.mjs';
import { S } from './base.mjs';
import { sufOf } from './core.mjs';
import { clearsOwnRate, currentPathOf, kt } from './facts.mjs';

// ===== BIRTH OBLIGATIONS (ticket 073) =====
// What a NEW file under a (module, suffix) class has historically come with — "add tests/libtest/*.c" implying
// "touch tests/libtest/Makefile.inc" — mined from `H.fps[*].added` (the birth signal history.mjs now carries
// alongside `files`, never set for a rename's `R` status) using only path, extension and git status: no name list,
// no ORM knowledge, no lexical match. The (module, suffix) key is the exact `refineModOf`/`sufOf` pair `cellsOf`
// (just below, in `learn`'s change-archetype pass) derives per file for a commit footprint's `m:`/`k:` cells, and
// certification below applies the SAME KT/BIC contrast + λ display bound + `CFG.minRaw` support floor that pass's
// own cell certification uses (`archetypes` loop, `core.mjs`) — no new tunable constant anywhere in this table.
//
// One class record: `{ m, suf, n, co }` — `n` births of this class ever recorded, `co` a Map of every OTHER file
// (never a file that is itself of the SAME class — "for each file O outside that class") to how many of those `n`
// births also touched it.
//
// A commit's OWN base rate for `O` (`fileCommits`/`nonMegaCommits`) is recomputed HERE from the same `fps`/`live`
// pair, current-path-keyed — never read off `H.fileCommits` (historical-path-keyed, §J2.4b), because a companion
// renamed partway through history would otherwise undercount under its old name while `rec.co` (built through the
// same `currentOf`) counts it under its new one; the two populations must agree on what a "file" is.
export function certifyObligationRules(rec, { fileCommits, nonMegaCommits, idxCost, live }) {
  const rules = [],
    ambient = [];
  if (rec.n < CFG.minRaw) return { rules, ambient }; // gate 3: the support floor — measured, not assumed (§3 of the design doc: without it, a single spurious n=3 rule dominated a corpus repo's entire firing set)
  const K = 2,
    N = nonMegaCommits;
  for (const [o, k] of rec.co) {
    if (!live.has(o)) continue; // gate 4: liveness — a rule naming a file dead at HEAD does not speak (same disease class as wave-3 recommendation 5, and ticket 066's `how` liveness filter)
    const gp = fileCommits.get(o) || 0;
    const local = { present: k, absent: rec.n - k };
    const glob = { present: gp, absent: Math.max(N - gp, 0) };
    let data = 0;
    for (const v of ['present', 'absent']) {
      const nv = local[v];
      if (nv) data += nv * Math.log2(kt(local, K, v, rec.n) / kt(glob, K, v, N));
    }
    const bits = data - 0.5 * (K - 1) * Math.log2(Math.max(rec.n, 2)) - idxCost; // gate 1: the contrast — the same KT data term + BIC half-log model term changeArchetypes' own cell loop applies
    const clearsDisplay = (k + 0.5) / (rec.n + K / 2) >= 1 - 1 / CFG.lambda; // gate 2: the display bound (docs/mathematics.md, "naming an expected value"), λ = 8
    if (bits > 0 && clearsDisplay) {
      rules.push({ file: o, k, n: rec.n, bits: +bits.toFixed(2), share: +(k / rec.n).toFixed(3) });
    } else if (clearsOwnRate(gp, N)) {
      // not a discovery about THIS class: O's OWN base rate over the whole history already clears the identical λ
      // bound (§074 shares this exact test for co-change partners too), so it would read this high beside almost
      // ANY class. Reported separately (never silently dropped) so a reader can see it is background, not signal.
      ambient.push({ file: o, k: gp, n: N, share: +(gp / N).toFixed(3) });
    }
  }
  rules.sort((a, b) => b.share - a.share || b.k - a.k || (a.file < b.file ? -1 : 1));
  ambient.sort((a, b) => b.share - a.share || (a.file < b.file ? -1 : 1));
  return { rules, ambient };
}
// the batch builder `learn` calls over the FULL retained `H.fps`, and `obligationEval` (§073's instrument) calls
// incrementally over a chronological prefix — both funnel through `certifyObligationRules` above so the gates can
// never drift between the shipped table and the harness that scores it.
// one footprint's birth EVENTS: one per distinct (module, suffix) class its `added` files fall into (a commit
// adding two files of the SAME class is one event, not two — "how many of the commits", commit-level counting).
// Shared by the batch fold below and `obligationEval`'s incremental sweep so the two can never define an "event"
// differently.
export function classEventsOf(fp, { currentOf, refinedM }) {
  const out = [];
  if (!fp.added || !fp.added.length) return out;
  const seen = new Set();
  for (const raw of fp.added) {
    const cur = currentOf(raw);
    const m = refinedM(cur),
      suf = sufOf(cur) || '';
    const key = m + S + suf; // `S` = the module's own cell-key separator (a control byte, never inside a path)
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ cur, m, suf, key });
  }
  return out;
}
// folds ONE footprint's contribution into a running `classes`/`fileCommits` accumulator — the batch builder below
// calls this once per footprint over the WHOLE history; `obligationEval` calls it in a chronological sweep,
// scoring each candidate against the accumulator's state BEFORE folding that candidate's own footprint in, so a
// candidate's own commit is never part of the table that scores it (the same discipline `leakSubtractedH` names).
export function foldObligationFootprint(fp, { currentOf, refinedM, classes, fileCommits }) {
  const curFiles = fp.files.map(currentOf);
  for (const f of curFiles) fileCommits.set(f, (fileCommits.get(f) || 0) + 1);
  for (const { cur, m, suf, key } of classEventsOf(fp, { currentOf, refinedM })) {
    let rec = classes.get(key);
    if (!rec) {
      rec = { m, suf, n: 0, co: new Map() };
      classes.set(key, rec);
    }
    rec.n++;
    for (const f of curFiles) {
      if (f === cur) continue;
      if (refinedM(f) === m && sufOf(f) === suf) continue; // "outside that class": another file of the SAME (module, suffix) is not an obligation, it IS the class
      rec.co.set(f, (rec.co.get(f) || 0) + 1);
    }
  }
}
export function buildObligationTable(fps, { refinedM, live }) {
  const currentOf = currentPathOf(fps, live);
  const classes = new Map(); // "module\x01suffix" -> { m, suf, n, co: Map(file -> count) }
  const fileCommits = new Map();
  for (const fp of fps) foldObligationFootprint(fp, { currentOf, refinedM, classes, fileCommits });
  const nonMegaCommits = fps.length; // the exact population `fileCommits` above was drawn from — self-consistent by construction, never H's own (possibly fpsCap-truncated) count
  let universe = 0;
  for (const rec of classes.values()) universe += rec.co.size; // the index cost counted ONCE over the real candidate population, the same shape changeArchetypes/bridgeBits count it
  const idxCost = Math.ceil(Math.log2(Math.max(universe, 2)));
  const obligations = [];
  for (const rec of classes.values()) {
    const { rules, ambient } = certifyObligationRules(rec, { fileCommits, nonMegaCommits, idxCost, live });
    obligations.push({ module: rec.m, suffix: rec.suf, n: rec.n, rules, ambient });
  }
  obligations.sort(
    (a, b) =>
      b.n - a.n || (a.module < b.module ? -1 : a.module > b.module ? 1 : a.suffix < b.suffix ? -1 : 1)
  );
  return obligations;
}
// the render-time lookup `cmdObligation`/`check --as`/`map --json` all share: a path need not exist (the whole
// point — asking BEFORE the file is written), so this derives only its (module, suffix) class and reads the
// pre-certified table `learn` already built. Absent from the table entirely (n: 0) is a genuinely different case
// from present-but-uncertified (n > 0, rules/ambient both empty below CFG.minRaw) — the renderer must tell them
// apart rather than collapsing both to silence (§6: "never say (complete)", the coverage-note lesson).
export function obligationFor(model, rel) {
  const refined = model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || [], model.srcRoots || []));
  const suffix = sufOf(rel) || '';
  const module = refined(rel);
  const rec = (model.obligations || []).find(o => o.module === module && o.suffix === suffix);
  return { module, suffix, n: rec ? rec.n : 0, rules: rec ? rec.rules : [], ambient: rec ? rec.ambient : [] };
}
// the standalone `grain obligation <path>` text renderer AND the single-line hook `check <file> --as <path>` uses
// (`{ top: 1 }`, first rule only) — one function, one wording, never two copies drifting apart.
// the ambient half of a "two labelled sets" answer — ticket 073's obligation table and ticket 074's completeness
// partners both split a candidate list into a specific set and this one, and BOTH print it with this same
// wording/shape so a reader never has to learn a second phrasing for the identical judgment call ("this repo
// touches these with almost everything"). `a.k`/`a.n` are always the candidate's OWN global rate (never a
// case-specific count) — that is what makes a candidate ambient in the first place.
export function ambientLines(ambient, top) {
  if (!ambient.length) return [];
  const out = ['ambient (this repo touches these with almost everything):'];
  for (const a of ambient.slice(0, top)) out.push(`  ${a.file}  ${a.k} of ${a.n} commits`);
  return out;
}
export function obligationLines(model, rel, { top = 5 } = {}) {
  const { module, suffix, n, rules, ambient } = obligationFor(model, rel);
  const kindWord = suffix ? `*.${suffix}` : '(no extension)';
  const dirWord = module === '.' ? 'the repo root' : module + '/';
  if (!n) return [`a new ${kindWord} under ${dirWord} has no recorded births in this repo's history — nothing to certify`];
  const out = [];
  if (rules.length) {
    out.push(`a new ${kindWord} under ${dirWord} has come with:`);
    for (const r of rules.slice(0, top)) out.push(`  ${r.file}  ${r.k} of ${r.n} such commits`);
  } else {
    out.push(
      `a new ${kindWord} under ${dirWord} has been born ${n} time${n === 1 ? '' : 's'} — nothing certifies as a specific obligation`
    );
  }
  out.push(...ambientLines(ambient, top));
  return out;
}
