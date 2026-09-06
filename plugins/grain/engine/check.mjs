// grain engine · checkFile — the verdict for one file against the model — and the grouping of its deviations
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirname, extname } from 'node:path/posix';
import { CFG } from './config.mjs';
import { relFactsFor } from './relations.mjs';
import { computeArchHits } from './arch.mjs';
import { UNSEEN } from './base.mjs';
import { practicedBy } from './cards.mjs';
import { applyVocab, isBool, isDefiningFact, kt, part, ptr, scopeLabel, skeyR } from './facts.mjs';
import { lexicalPreds } from './lexical.mjs';
import { assignAll, factNotes, skipLineNote, voice } from './mine.mjs';
import { bindingFor, parseFile } from './parse.mjs';
import { normalizeCR, partitionFor } from './partition.mjs';
import { placementHit } from './placement.mjs';
import { lexTally, quoteFlags, roleExemplar } from './report-facts.mjs';
import { extractScopes } from './scopes.mjs';
import { sigCounts } from './superposition.mjs';
import {
  ANON_SCOPE_KINDS,
  deviationPhrase,
  scopeBacktick,
  scopeNamed,
  unitOf,
  verbalize,
} from './verbalize.mjs';
import { heritageKindOf } from './weights.mjs';

export async function checkFile({ model, root, rel, content, asPath, exemplarOk = () => true }) {
  const effRel = asPath || rel;
  const src = normalizeCR(content ?? readFileSync(join(root, rel), 'utf8'));
  const part = partitionFor(model, effRel);
  const { p, tree: tr } = await parseFile(extname(rel), src);
  const b = bindingFor(p._g);
  const hasError = tr.rootNode.hasError; // a real parse failure (e.g. unicode identifiers a vendored grammar can't
  // handle) leaves ERROR nodes in the tree; extractScopes silently skips them so partial content still mines, but
  // callers need this signal to tell "genuinely nothing here" apart from "the parser gave up on part of this file"
  const scopes = extractScopes(effRel, tr, b, p._g).filter(s => s.name !== '<anon>');
  const relFact = relFactsFor(effRel, src, tr, p._g);
  // §042 — the instance counts behind each per-file lexical vote, for `lexTallyNote`. Taken here because `tr` is freed
  // on the next line and the governed loop below runs after that. A second walk of one already-parsed file, on the
  // check path only; extraction and mining call `lexicalPreds` without a tally and are byte-for-byte unaffected.
  // `lexQ` (§077) is the raw per-instance quote-literal scan (`{q, body, line, endLine}`), filtered down to genuine,
  // non-delimiter-forced violations by `quoteFlags` below — same out-parameter discipline as `lexT`, never spread
  // into a scope's `preds`.
  const lexT = Object.create(null);
  const lexQ = [];
  lexicalPreds(tr, b, lexT, lexQ);
  tr.delete();
  const archHits = computeArchHits({ model, root, effRel, relFact });
  const placeHit = placementHit(model, effRel);
  if (!part)
    return {
      scopes: [],
      governed: [],
      msgs: [],
      archHits,
      placeHit,
      newScopeHits: [],
      partition: null,
      reason: 'no partition covers this file',
      hasError,
    };
  for (const s of scopes) applyVocab(s, part.vocab);
  const medoids = part.medoids;
  const { assign, amb, scores } = assignAll(scopes, medoids);
  const msgs = [];
  const governed = [];
  const waiverHits = [];
  // the waivers reaching THIS file: one scope excused from one surface, by name. Matched on (effRel, scope name, pid),
  // which is why `decide waive` refuses an ambiguous (path, name) — see cmdSeed's `waive` branch.
  const fileWaivers = (model.waivers || []).filter(wv => wv.found && wv.path === effRel);
  // specificity governance: for each pid, the most specific applicable context governs the scope —
  // role or directory over partition-wide (`_all`); among applicable facts the smallest evidence class wins.
  const ctxRank = f => (/^r\d/.test(f.cid) ? 0 : f.cid.startsWith('d[') ? 1 : 2);
  scopes.forEach((s, i) => {
    let role = assign.get(i);
    let roleOk = role !== undefined && !amb.has(i);
    const sticky = part.assignments[skeyR(effRel, s)];
    if (sticky !== undefined && sticky !== -1) {
      role = sticky;
      roleOk = true;
    } // STICKY FIRST (§8.6)
    const gov = new Map();
    for (const f of part.facts) {
      if (f.kind !== s.kind) continue;
      if (/^r\d/.test(f.cid)) {
        if (!roleOk || 'r' + role + ':' + s.kind !== f.cid) continue;
      } else if (f.cid.startsWith('d[')) {
        const d = f.cid.slice(2, f.cid.indexOf(']'));
        if (!effRel.startsWith(d + '/')) continue;
      }
      const g = gov.get(f.pid);
      if (!g || f.sraw < g.sraw || (f.sraw === g.sraw && ctxRank(f) < ctxRank(g))) gov.set(f.pid, f);
    }
    for (const f of [...gov.values()].sort((a, b) =>
      a.cid < b.cid ? -1 : a.cid > b.cid ? 1 : a.pid < b.pid ? -1 : 1
    )) {
      const isRole = /^r\d/.test(f.cid);
      const label = isRole
        ? medoids[role]?.label || 'group'
        : f.cid.startsWith('d[')
          ? `local (${f.cid.slice(2, f.cid.indexOf(']'))}/)`
          : f.pkgWide
            ? scopeLabel(part.name.replace(/#.*$/, '')) + ' incl. tests/examples'
            : scopeLabel(part.name);
      const lead = s.preds[f.pid];
      // `defining`: this fact's pid is the very feature (3× weighted) that formed the role group it governs — a
      // marker tautology (§003 resolution). Not suppressed here (report/rulesMarkdown's factTiers does that for
      // their own listing) — spoken instead, via a clause where this entry renders (cmdCheck's `conforms to:`).
      if (lead !== undefined)
        governed.push({
          scope: s.name,
          kind: s.kind,
          line: s.line,
          endLine: s.endLine || s.line,
          pid: f.pid,
          label,
          conforms: lead === f.exp,
          fact: f,
          tally: lexTally(
            f.pid,
            f.exp,
            lexT[f.pid],
            f.pid === 'auto.lex:quote' ? quoteFlags(f.exp, lexQ) : []
          ), // §042 — null unless the per-file vote hid departing instances; §077 — flags the genuine ones among them
          defining: isDefiningFact(medoids, f),
        });
      // the lead surface speaks for the cluster; a deviation on any sibling surface (same conform set) is still a deviation
      for (const sf of [f, ...(f.siblings || [])]) {
        const v = s.preds[sf.pid];
        if (v === undefined || v === sf.exp) continue;
        if (sf === f && f.suppressedValue && v === f.suppressedValue) continue; // nucleation stand-down
        if (sf === f && f.altMarker) {
          const am = /^auto\.(deco|extends|returns):/.exec(f.altMarker.pid); // an alternative-marker deviant already conforms — never a false accusation (§altMarkerFor)
          const arr = am && (am[1] === 'extends' ? s.sup : am[1] === 'deco' ? s.decos : s.rets);
          if (arr && arr.includes(f.altMarker.name)) continue;
        }
        const gc = sf.srawCounts || sf.counts; // the accusation's odds run on the SAME population the message prints (n/N established)
        const neff = Object.values(gc).reduce((a2, b2) => a2 + b2, 0);
        const K = isBool(sf.pid) ? 2 : sf.alphabet.length + 1;
        const known = sf.alphabet.includes(v);
        const d = Math.log2(kt(gc, K, sf.exp, neff) / kt(gc, K, known ? v : UNSEEN, neff));
        if (d < (sf.tau || Math.log2(CFG.lambda))) continue;
        const isDir = f.cid.startsWith('d[');
        const contrast =
          (isRole || isDir) && f.parentExp != null && f.parentExp !== f.exp
            ? `\n  This is the local default ${isDir ? 'of this directory' : 'of this group'} — the wider package's norm differs here.`
            : '';
        const conformN = f.sraw - Math.round((1 - f.share) * f.sraw);
        const exs = f.exemplars.filter(e => exemplarOk(e.rel) && !(e.rel === effRel && e.name === s.name)); // render-time re-validation; never the deviant itself
        const vf = { ...sf, kind: f.kind };
        // an active waiver on THIS (scope, pid): the maintainer already answered this one. The deviation is not raised —
        // a decided voice takes its place, carrying the same n/N denominator the deviation would have printed. `governed`
        // above is untouched on purpose: the scope still counts as non-conforming, only the accusation is withdrawn.
        const wv = fileWaivers.find(w => w.name === s.name && w.pid === sf.pid);
        if (wv) {
          waiverHits.push({
            scope: s.name,
            kind: s.kind,
            line: s.line,
            endLine: s.endLine || s.line,
            id: wv.id,
            pid: sf.pid,
            exp: sf.exp,
            obs: v,
            text: `[grain] ${voice(
              'decided',
              `${scopeBacktick(s)} (line ${s.line}) deliberately departs from ${verbalize(
                vf,
                f.exemplars.map(e => e.name)
              )} — ${conformN}/${f.sraw} established do it the other way${wv.note ? ` — ${wv.note}` : ''}`,
              { typ: 'waiver', who: wv.author, when: wv.createdAt, id: wv.id }
            )}`,
          });
          break;
        }
        msgs.push({
          scope: s.name,
          kind: s.kind,
          key: skeyR(effRel, s),
          line: s.line,
          endLine: s.endLine || s.line,
          pid: sf.pid,
          factKey: f.cid + '|' + f.pid,
          delta: +d.toFixed(2),
          exp: sf.exp,
          obs: v,
          label,
          exNames: f.exemplars.map(e => e.name),
          text:
            `[grain] ` +
            voice(
              'practiced',
              `${label} convention: ${verbalize(
                vf,
                f.exemplars.map(e => e.name)
              )}${
                sf !== f
                  ? ` (a sibling surface of: ${verbalize(
                      f,
                      f.exemplars.map(e => e.name)
                    ).replace(/^\w+ here /, '')})`
                  : ''
              }${
                f.seeded
                  ? ` — steered by a maintainer decision${
                      (model.steers || [])
                        .filter(st => f.seeded.includes(st.id) && st.note)
                        .map(st => ': ' + st.note)
                        .join('') || ''
                    }`
                  : ''
              }\n` +
                `  ${conformN}/${f.sraw} established ${unitOf(f.kind)} conform. Your ${scopeNamed(s)} (line ${s.line}) ${deviationPhrase(vf, v)}${known ? '' : ' — a value this repo has not used before'}.${contrast}` +
                (() => {
                  const here = scopes
                    .filter(s2 => s2 !== s && s2.kind === s.kind && s2.preds[sf.pid] === sf.exp)
                    .slice(0, 2);
                  if (here.length)
                    return `\n  In this file, ${here.map(s2 => scopeBacktick(s2) + ` (line ${s2.line})`).join(' and ')} conform${here.length === 1 ? 's' : ''}.`;
                  const near = exs[0];
                  // §061: an exemplar carries no `.kind` of its own (f.exemplars' shape), but every exemplar of
                  // this fact IS of the fact's own kind by construction — same borrowed-name honesty as `here` above.
                  return near
                    ? `\n  Nearest conforming exemplar: ${ptr(near.rel, near.line, near.endLine)} ${scopeBacktick({ kind: f.kind, name: near.name })}${skipLineNote(part, f, near)}.`
                    : '';
                })() +
                (exs.length
                  ? `\n  See: ${exs.map(e => `${ptr(e.rel, e.line, e.endLine)} ${scopeBacktick({ kind: f.kind, name: e.name })}${skipLineNote(part, f, e)}`).join(' · ')}`
                  : '') +
                // any note the fact carries, not only `held` — the cost of deviating is the one a reader most needs here,
                // and it can be present on a fact whose `held.since` is not
                (() => {
                  const n = factNotes(f);
                  return n ? `\n  (${n.replace(/^ · /, '')})` : '';
                })()
            ),
        });
        break;
      }
    }
  });
  // structural shape (§J5.8): a scope in a role group whose profile says every certified member carries `sig` at
  // least `need` times, and this one carries it fewer. No predicate drives it — the loop above runs on
  // `part.facts` × `s.preds[f.pid]` and a shape fact has neither — so it is its own pass with its own inline text,
  // the same way steerHits/archHits/waiverHits build theirs rather than routing through `verbalize`.
  scopes.forEach((s, i) => {
    if (!s.sk) return;
    const sticky = part.assignments[skeyR(effRel, s)];
    const role =
      sticky !== undefined && sticky !== -1
        ? sticky
        : assign.has(i) && !amb.has(i)
          ? assign.get(i)
          : undefined;
    const pf = role !== undefined && part.profiles && part.profiles[role];
    if (!pf || !pf.req) return;
    const have = sigCounts(s.sk);
    // ONE deviation per scope (the ticket's cap). Which one is a DECISION, not a derivation: the signature the
    // template carries most often, ties broken by signature ascending — deterministic, and independent of the
    // order `req` happens to have been serialized in.
    let worst = null;
    for (const [sig, need] of Object.entries(pf.req)) {
      const got = have[sig] || 0;
      if (got < need && (!worst || need > worst.need || (need === worst.need && sig < worst.sig)))
        worst = { sig, need, got };
    }
    if (!worst) return;
    // the cost, in the SAME KT estimator every other deviation here uses (never an ad-hoc occurrence shortfall,
    // which is not on the `delta` scale the sort and the "(preference gap N bits)" render speak). The population is
    // degenerate all-true by construction — every one of pf.n members carries the signature — so this is the
    // surprise of the one exception, and it grows with the group the way every other deviation's confidence does.
    const d = -Math.log2(kt({ true: pf.n, false: 0 }, 2, 'false', pf.n));
    const label = medoids[role]?.label || 'group';
    const unit = unitOf(s.kind);
    const sig = worst.sig.startsWith('id:') ? worst.sig.slice(3) : worst.sig; // same `id:` stripping skRender and the slot render do
    msgs.push({
      scope: s.name,
      kind: s.kind,
      key: skeyR(effRel, s),
      line: s.line,
      endLine: s.endLine || s.line,
      pid: 'auto.shape:' + worst.sig,
      factKey: 'r' + role + ':' + s.kind + '|auto.shape:' + worst.sig,
      delta: +d.toFixed(2),
      exp: String(worst.need),
      obs: String(worst.got),
      label,
      exNames: [],
      summary: `${unit} all carry \`${sig}\`${worst.need > 1 ? ` (${worst.need}×)` : ''}`, // the pre-existing-summary phrase, built here rather than in `verbalize`: this is a multiset-occurrence comparison, not a pid=value pair
      text:
        `[grain] ` +
        voice(
          'practiced',
          `${label} shape: ${unit} here all carry \`${sig}\`${worst.need > 1 ? ` (${worst.need}×)` : ''}\n` +
            `  ${pf.n}/${pf.n} established ${unit} conform. Your ${scopeNamed(s)} (line ${s.line}) is missing \`${sig}\` — every one of the ${pf.n} certified members of this group carries it at least ${worst.need} time${worst.need > 1 ? 's' : ''}, yours has ${worst.got}.\n` +
            `  (N of N by construction: the group's template is the anti-unification of all ${pf.n} members, so everything it carries is in every one of them — there is no partial counter behind this denominator.)`
        ),
    });
  });
  msgs.sort((a, b) => b.delta - a.delta || (a.pid < b.pid ? -1 : a.pid > b.pid ? 1 : a.line - b.line));
  // maintainer decisions that reach this file: a steer whose exemplar shares the scope's directory subtree or group. Not a
  // deviation (the numbers may still favour the old pattern — that is the point of a steer), a decision, printed as such.
  const steerHits = [];
  for (const st of model.steers || []) {
    if (!st.found || st.partition !== part.name) continue;
    const sdir = dirname(st.path);
    scopes.forEach((s, i) => {
      if (s.kind !== st.kind) return;
      const sticky = part.assignments[skeyR(effRel, s)];
      const role =
        sticky !== undefined && sticky !== -1
          ? sticky
          : assign.has(i) && !amb.has(i)
            ? assign.get(i)
            : undefined;
      // targeting: a PROMOTION reaches the exemplar's group (else its directory subtree) — a steer in tests/ must not nag every
      // test method; a RETIREMENT reaches the whole subtree, because only carriers of the retired value can depart at all
      const inScope = sf =>
        sf.retires
          ? effRel.startsWith(sdir + '/')
          : st.role !== null
            ? role === st.role
            : effRel.startsWith(sdir + '/');
      for (const sf of st.surfaces) {
        if (sf.value === null || !inScope(sf)) continue;
        const v = s.preds[sf.pid];
        if (v === undefined || v === sf.value) continue;
        const vf = { pid: sf.pid, exp: sf.value, kind: st.kind, heritageKind: heritageKindOf(sf.pid, model) };
        const promoted = st.surfaces.find(x => x.value !== null && !x.retires);
        const retiredName = (sf.pid.match(/^auto\.[a-z]+:(@?.+)$/) || [])[1];
        const head2 =
          sf.retires && promoted
            ? `${verbalize({ pid: promoted.pid, exp: promoted.value, kind: st.kind, heritageKind: heritageKindOf(promoted.pid, model) }, [st.name])}, not \`${retiredName || sf.pid}\` — ${practicedBy(promoted)}. Your ${scopeNamed(s)} (line ${s.line}) still carries \`${retiredName || sf.pid}\``
            : `${verbalize(vf, [st.name])} — ${practicedBy(sf)}. Your ${scopeNamed(s)} (line ${s.line}) ${deviationPhrase(vf, v)}`;
        steerHits.push({
          scope: s.name,
          kind: s.kind,
          line: s.line,
          endLine: s.endLine || s.line,
          id: st.id,
          pid: sf.pid,
          exp: sf.value,
          obs: v,
          text: `[grain] ${voice('decided', `${head2}.${st.note ? `\n  ${st.note}` : ''}\n  Copy: ${st.path}:${st.line} \`${st.name}\``, { typ: 'steer', who: st.author, when: st.createdAt })}`,
        });
      }
    });
  }
  // (§003-B, delivery revised §010) disclosure: a role-eligible scope the PERSISTED model has never certified — its
  // skeyR key is absent from part.assignments, so no role fact in `part.facts` governs it by construction; only the
  // partition-wide `_all` baseline does, and that baseline is nearly always trivially satisfied (the whole point of
  // this ticket). `scores` (assignAll, above) carries the live nearest/next-nearest medoid THIS run computed for it
  // — genuinely informational, never a certified role, never governance — the same honest-disclosure register as
  // relCoverageNote/intraModuleNote, not the `practiced` deviation voice: this is grain naming its own coverage
  // gap, not a claim about the codebase.
  //
  // §010(d): "nearest" is not always informative. On a marker-split population the nearest neighbour to a new
  // scope missing the marker is often the group's own undecorated COMPLEMENT — a real cluster certifying nothing,
  // whose label is frequently `induceRoles`' own 'group' fallback (no feature reached majority share), never mined
  // data. Leading with that taught a reader nothing and printed the fallback as though it were a name (field report:
  // flask). Fix: foreground the nearest group that certifies >=1 role fact for this kind, naming its defining
  // requirement — the raw nearest/next scores are still both reported, never hidden, just not foregrounded when the
  // nearer one has nothing to certify. §010(a): collapse per (kind, chosen neighbour) so one authoring decision
  // (several new scopes in one file, one group) produces one line, not one per scope, in the house `+N more` idiom.
  const newScopeHits = [];
  const roleMembers = idx => {
    let n = 0;
    for (const r of Object.values(part.assignments)) if (r === idx) n++;
    return n;
  };
  const roleFacts = (idx, kind) => part.facts.filter(f => f.cid === 'r' + idx + ':' + kind);
  // a mined label is only ever the literal string 'group' as induceRoles' OWN fallback, never real data (§010-d) —
  // so it is exactly the case that must never render as a name; everything else names the group verbatim
  const groupName = idx => {
    const n = roleMembers(idx);
    const l = medoids[idx]?.label;
    return `${l && l !== 'group' ? `«${l}»` : 'an unlabelled cluster'} (${n} member${n === 1 ? '' : 's'})`;
  };
  const groupTrait = (idx, kind) => {
    const def = roleFacts(idx, kind).find(f => isDefiningFact(medoids, f));
    const m = def && /^auto\.(deco|extends|returns):@?(.+)$/.exec(def.pid);
    return (
      m &&
      (m[1] === 'deco'
        ? `requires @${m[2]}`
        : m[1] === 'extends'
          ? `requires extends ${m[2]}`
          : `requires returns ${m[2]}`)
    );
  };
  const certN = (idx, kind) => roleFacts(idx, kind).length;
  // the LEADING group's full description — name plus what it actually certifies: its defining requirement when
  // there is one, else a bare convention count, else (only reached from the two "honest disclaimer" branches
  // below, never for a group chosen as lead) an explicit "certifies nothing"
  const groupDesc = (idx, kind) => {
    const cert = certN(idx, kind);
    return `${groupName(idx).slice(0, -1)}, ${groupTrait(idx, kind) || (cert ? `${cert} convention${cert === 1 ? '' : 's'}` : 'certifies nothing')})`;
  };
  const buckets = new Map(); // key: (kind, the neighbour(s) actually spoken) -> one collapsed hit
  scopes.forEach((s, i) => {
    if (s.kind === 'file' || s.kind === 'module' || s.ownCount < 2) return;
    if (part.assignments[skeyR(effRel, s)] !== undefined) return; // known to the persisted model already — sticky governs it properly
    const sc = scores.get(i);
    if (!sc) return;
    let key,
      lead = null,
      detail;
    if (sc.m1 < CFG.minMemb) {
      // (§047) below the floor is where exclusion is worst: the very feature a clean deviation omits is what
      // similarity assignment leans on, so a member that cleanly violates a convention can score BELOW its own
      // group's floor and never reach the population that would judge it. No accusation is made here (that
      // would resurrect the rejected leave-one-feature-out fix) — this is the same disclosure the bestCert/
      // secondCert branches below already make for an ambiguous scope, extended to the below-floor case using
      // the identical certN/groupDesc reads, no new threshold.
      //
      // Measured (5-repo fire-rate check, 047): a bare certN>0 gate fires on every weak, near-universal role fact
      // too (`returns:void`, `returns:t.Any`) — double digits on two of three corpora, one real group cited for a
      // dozen unrelated scopes each. The fix reuses `Math.log2(CFG.lambda)` — the SAME bar `d < tau ||
      // Math.log2(CFG.lambda)` already applies to every deviation accusation in this function — against the
      // cited fact's own `bpi` (already computed by mine(), never recomputed here): a fact mine() itself would
      // not consider strong enough to accuse a deviation over is not strong enough to name as "the nearest
      // certifying group" either. This is the identical comparator, not a new one. It costs the real OZ
      // `@onlyOwner` example nothing (bpi 5.63, comfortably clears it) while removing the generic-marker noise
      // (bpi 1.4–2.7 on every measured false lead).
      const strongCert = idx => roleFacts(idx, s.kind).some(f => f.bpi >= Math.log2(CFG.lambda));
      const bestCert = strongCert(sc.best),
        secondCert = sc.second >= 0 && strongCert(sc.second);
      if (bestCert) {
        lead = sc.best;
        key = `nogroup#${s.kind}#${lead}`;
        detail = `matched no group (best ${sc.m1.toFixed(2)}, floor ${CFG.minMemb}) — the nearest certifying group is ${groupDesc(sc.best, s.kind)} at ${sc.m1.toFixed(2)}`;
      } else if (secondCert) {
        lead = sc.second;
        key = `nogroup#${s.kind}#${lead}`;
        detail = `matched no group (best ${sc.m1.toFixed(2)}, floor ${CFG.minMemb}) — the nearest certifying group is ${groupDesc(sc.second, s.kind)} at ${sc.m2.toFixed(2)}`;
      } else {
        key = `nogroup#${s.kind}`;
        detail = `matched no group (best ${sc.m1.toFixed(2)}, floor ${CFG.minMemb})`;
      }
    } else {
      const bestCert = certN(sc.best, s.kind) > 0,
        secondCert = sc.second >= 0 && certN(sc.second, s.kind) > 0;
      if (bestCert) {
        lead = sc.best;
        key = `cert#${s.kind}#${lead}`;
        detail = `nearest ${groupDesc(sc.best, s.kind)} at ${sc.m1.toFixed(2)}${sc.second >= 0 ? `, next ${groupName(sc.second)} at ${sc.m2.toFixed(2)}` : ''}`;
      } else if (secondCert) {
        lead = sc.second;
        key = `cert#${s.kind}#${lead}`;
        detail = `nearest is ${groupName(sc.best)} at ${sc.m1.toFixed(2)}, which certifies nothing; the closest certifying group is ${groupDesc(sc.second, s.kind)} at ${sc.m2.toFixed(2)}`;
      } else {
        key = `nocert#${s.kind}#${sc.best}#${sc.second}`;
        detail = `nearest ${groupName(sc.best)} at ${sc.m1.toFixed(2)}${sc.second >= 0 ? `, next ${groupName(sc.second)} at ${sc.m2.toFixed(2)}` : ''} — no nearby group certifies a convention`;
      }
    }
    let b = buckets.get(key);
    if (!b) {
      b = { kind: s.kind, lead, detail, members: [] };
      buckets.set(key, b);
    }
    b.members.push({ name: s.name, line: s.line, endLine: s.endLine || s.line });
  });
  for (const b of buckets.values()) {
    // §061: `m.name` for a catch/finally member is its enclosing method/type's OWN name (blockScope's borrowed
    // "named after its owner"), never the clause's own — go through scopeBacktick so it reads as a location.
    const shown = b.members
      .slice(0, 3)
      .map(m => `${scopeBacktick({ kind: b.kind, name: m.name })} (line ${m.line})`)
      .join(', ');
    const who = b.members.length > 3 ? `${shown} and ${b.members.length - 3} more` : shown;
    // (§010-e) an exemplar to open, reusing the SAME resolver the "See:" line under a deviation already uses
    // (roleExemplar) rather than a second one — a group named but pointing nowhere is strictly less useful than
    // every neighbouring message; only offered when a lead group was actually chosen (never for "no group
    // certifies" or below-floor, where there is nothing conforming nearby to point at)
    const anchor = b.lead !== null ? roleExemplar(model, part.name, b.lead) : null;
    const first = b.members[0],
      last = b.members[b.members.length - 1];
    newScopeHits.push({
      scope: first.name,
      kind: b.kind,
      line: first.line,
      endLine: last.endLine,
      count: b.members.length,
      text:
        `[grain] ${who} ${b.members.length === 1 ? 'is' : 'are'} new to the index — ${b.detail}. Judged against the package baseline only.` +
        (anchor
          ? `\n  See: ${ptr(anchor.ex.rel, anchor.ex.line, anchor.ex.endLine)} ${scopeBacktick({ kind: anchor.f.kind, name: anchor.ex.name })}`
          : ''),
    });
  }
  return {
    scopes,
    governed,
    msgs,
    steerHits,
    waiverHits,
    archHits,
    placeHit,
    newScopeHits,
    partition: part.name,
    hasError,
  };
}
// one paragraph per (convention, observed value): the scopes that deviate, with lines, never nine identical paragraphs
export function groupDeviations(msgs, touched = null, fileKindTouched = null) {
  const groups = new Map();
  for (const m of msgs) {
    const k = m.factKey + '|' + m.pid + '|' + m.obs;
    let g = groups.get(k);
    if (!g) {
      g = { ...m, hits: [] };
      groups.set(k, g);
    }
    const isTouched =
      m.kind === 'file' && fileKindTouched
        ? fileKindTouched(m)
        : touched
          ? touched(m.line, m.endLine || m.line)
          : true;
    g.hits.push({ scope: m.scope, kind: m.kind, line: m.line, touched: isTouched });
  }
  const out = [];
  for (const g of groups.values()) {
    const t = g.hits.filter(h => h.touched),
      p = g.hits.filter(h => !h.touched);
    // §061: `h.scope` is the enclosing method/type's OWN name for a catch/finally hit (blockScope's borrowed
    // "named after its owner"), never the clause's own — prefixed "in " so it reads as a location, not a name.
    const who = hs =>
      hs
        .slice(0, 3)
        .map(h => `${ANON_SCOPE_KINDS.has(h.kind) ? 'in ' : ''}\`${h.scope}\` (line ${h.line})`)
        .join(', ') + (hs.length > 3 ? ` and ${hs.length - 3} more` : '');
    const head = g.text.split('\n');
    const first = head[0];
    const rest = head.slice(1).filter(l => !/^  \d+\/\d+ established/.test(l));
    const evidence = head.find(l => /^  \d+\/\d+ established/.test(l)) || '';
    const ev = evidence.replace(/ Your \w+ `[^`]*` \(line \d+\) /, ' ').replace(/\.$/, '');
    const kindWord = g.hits.length > 1 ? unitOf(g.kind) : g.kind;
    const dev = evidence.match(/\(line \d+\) (.*?)(?: — a value.*)?\.$/);
    const phrase = dev ? dev[1] : 'deviates'; // greedy to the FINAL period — `@app.get` carries a dot
    const novelty = /a value this repo has not used before/.test(evidence)
      ? ' — a value this repo has not used before'
      : '';
    out.push({
      ...g,
      touched: t.length,
      pre: p.length,
      text: `${first}\n  ${evidence.split('. Your')[0]}. ${t.length ? `Your ${t.length > 1 ? unitOf(g.kind) : g.kind} ${who(t)} ${phrase}${novelty}.` : ''}${p.length ? `${t.length ? ' Also' : 'Pre-existing:'} ${p.length} ${p.length > 1 ? unitOf(g.kind) : g.kind} not touched by your change (${who(p)}) ${phrase}.` : ''}\n${rest.join('\n')}`,
    });
  }
  return out.sort((a, b) => (b.touched > 0) - (a.touched > 0) || b.delta - a.delta);
}
