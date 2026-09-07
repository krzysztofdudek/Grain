// grain engine · proposal writer · the family-without-law adapter and node co-change
// Split out of propose.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jaccard } from './yggdrasil-graph.mjs';
import { FAMILY_MIN_MEMBERS, slug } from './propose-base.mjs';
import { contentRegexFor } from './propose-levels.mjs';

// ==================================================================================================
// 7b. The `.family-candidates.json` adapter (ticket 100) — the seam to `yg advise`'s family-without-law class.
//
// Yggdrasil's OWN offline miner (`scripts/family-without-law.mjs`) clusters files by AST structural feature
// vectors and cuts a fitted predicate for a cluster that shares no rule of its own. Grain never re-implements
// that clustering: it already HOLDS the equivalent evidence in a different shape — a ROLE GROUP is exactly a
// structurally-uniform cluster within a partition (093/094's own vocabulary), and `buildTypes` above already
// drafts a generalising `content:` predicate for one (the `-content` alternative) whenever the group's evidence
// supports it (`viable`, § MIN_WHEN_FIDELITY). "A family without a law" in Grain's own terms is precisely a
// role-group alternative that (a) is `viable`, (b) clears the SAME size floor Yggdrasil's miner uses
// (`FAMILY_MIN_MEMBERS`), and (c) has NOT already become a certified convention of its own — i.e. `exp.conventions`
// holds no group-scoped row for that exact group. (a)+(b) is Grain's tightness/size evidence; (c) is what makes
// it a family WITHOUT a law rather than one that already has one.
export function buildFamilyCandidates(alternatives, exp, opts = {}, extra = {}) {
  const minMembers = Number.isFinite(opts.minMembers) ? opts.minMembers : FAMILY_MIN_MEMBERS;
  // `ts` MUST be a parseable calendar instant — Yggdrasil's `parseFamilyCandidates` runs `Date.parse` on it and
  // rejects the whole file (silently, as stale) otherwise. `exp.asOf` is a git SHA, not a date (grain's OWN
  // schemaNotes documents it as such); `exp.indexedAt` is the ISO instant this export was built, which is what
  // "local analysis since <ts>" means in `yg advise`'s rendered nomination. Bug found + fixed on sight
  // (ruling `fix-bugs-on-sight`): an earlier draft of this adapter used `exp.asOf` here and every family it
  // wrote was silently dropped by the freshness gate.
  const asOf = exp.indexedAt || new Date().toISOString();
  const certifiedGroups = new Set(
    (exp.conventions || [])
      .filter(c => c.context?.type === 'group')
      .map(c => `${c.partition}::${c.context.group}`)
  );
  const langOf = members => {
    const counts = new Map();
    for (const rel of members) {
      const m = /\.([A-Za-z0-9]+)$/.exec(rel);
      const ext = m ? m[1].toLowerCase() : 'unknown';
      counts.set(ext, (counts.get(ext) || 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
  };
  const families = [];
  for (const a of alternatives) {
    if (a.kind !== 'role group' || a.form !== 'content' || !a.viable) continue;
    if (!a.members || a.members.length < minMembers) continue;
    // `certifiedGroups` keys by (partition NAME, group id); `a.of` is the host TYPE id (a slug), not the raw
    // partition name, so match on the group-id half only — a group id is a small per-partition ordinal (`r0`,
    // `r1`, ...), and colliding across two DIFFERENT partitions' groups only ever suppresses a family that
    // would otherwise be offered, never fabricates one that has a law.
    const alreadyLawed = a.groupId != null && [...certifiedGroups].some(k => k.endsWith('::' + a.groupId));
    if (alreadyLawed) continue;
    const contentPred = a.when?.all_of?.find(x => x.content)?.content ?? null;
    const scopePath = a.when?.all_of?.find(x => x.path)?.path ?? null;
    families.push({
      id: `family-grain-${slug(a.groupId || a.id)}`.slice(0, 80),
      language: langOf(a.members),
      members: [...a.members].sort(),
      fittedPredicate: { kind: 'regex', value: contentPred || '' },
      scopeFilesDraft: scopePath ? [scopePath] : [],
      evidence: { clusterSize: a.members.length, tightness: a.fidelity ?? 0 },
      _groupId: a.groupId ?? null,
    });
  }
  // (ii) role groups whose membership IS its whole host type — `buildTypes` above never drafts a `-content`
  // ALTERNATIVE for one of these ("the candidate IS the host — nothing finer on offer", §4), because the
  // finer-cut alternative would classify exactly what the type already does. That is not the same thing as
  // "grain found no such family" — grain found the SAME structural cluster, it just cut it as an active TYPE
  // instead of a sub-type. Measured on Yggdrasil's own `family-planted-mono` fixture (5 structurally-identical
  // `*Repository.ts` files under their own directory): without this branch the adapter emitted ZERO families —
  // the fixture's whole point — because the group coincides exactly with its directory's active type. Every
  // group already covered by (i) above is skipped here (`seenGroupIds`) so a group never emits twice.
  const seenGroupIds = new Set(families.map(f => f._groupId).filter(Boolean));
  const { active = [], groups = [] } = extra;
  for (const g of groups) {
    const gid = g.group?.id;
    if (gid == null || seenGroupIds.has(gid)) continue;
    if (g.files.size < minMembers) continue;
    if ([...certifiedGroups].some(k => k.endsWith('::' + gid))) continue;
    const host = active.find(a => a.dir && jaccard(g.files, a.files) >= 0.9);
    if (!host) continue; // not coincident with any active type — (i) above should have offered it as an alternative instead
    const cr = contentRegexFor(g.group);
    if (!cr) continue;
    seenGroupIds.add(gid);
    families.push({
      id: `family-grain-${slug(gid)}`.slice(0, 80),
      language: langOf([...g.files]),
      members: [...g.files].sort(),
      fittedPredicate: { kind: 'regex', value: cr.regex },
      scopeFilesDraft: [`${host.dir}/**`],
      evidence: { clusterSize: g.files.size, tightness: 1 }, // exact match to the host type — the strongest fit this adapter reports
    });
  }
  for (const f of families) delete f._groupId;
  // PREDICATE FIT (ticket 101). A family handed to `yg advise` is a PAIR — a member list and the fitted
  // predicate that is supposed to describe it — and `yg advise` renders the predicate as the draft scope a
  // maintainer would adopt. A member the predicate does not actually select is therefore a claim the file
  // itself refutes, and the adapter has the file on disk, so it can check rather than assert. Measured before
  // this gate existed: on `family-planted-polyglot` the TS family carried 6 members (the 5 planted repositories
  // plus the `ConfigLoader.ts` decoy the fixture's README says must never join a cluster) and its predicate
  // selected NONE of them. Members that do not select are dropped; a family left under the size floor is
  // dropped whole, because a family below the floor is exactly what `FAMILY_MIN_MEMBERS` says is an anecdote.
  // Nothing is widened here — this gate can only ever remove.
  const fitted = [];
  const dropped = { members: 0, families: 0 };
  for (const f of families) {
    if (!extra.repo || !f.fittedPredicate?.value) { fitted.push(f); continue; }
    let re;
    try { re = new RegExp(f.fittedPredicate.value); } catch { fitted.push(f); continue; }
    const keep = f.members.filter(rel => {
      let text;
      try { text = readFileSync(join(extra.repo, rel), 'utf8'); } catch { return true; } // unreadable ⇒ no evidence against it
      return re.test(text);
    });
    dropped.members += f.members.length - keep.length;
    if (keep.length < minMembers) { dropped.families++; continue; }
    fitted.push({ ...f, members: keep, evidence: { ...f.evidence, clusterSize: keep.length } });
  }
  fitted.sort((x, y) => (x.id < y.id ? -1 : 1));
  return { v: 1, ts: asOf, families: fitted, _fit: dropped };
}

// ==================================================================================================
// 7c. `charter.md` — one per proposed node, beside `yg-node.yaml` (ticket 100, addendum on
// `two-granularities-rules-fine-nodes-ownership-sized`). Horde's `node.mjs show` reads this file VERBATIM from
// `.yggdrasil/model/<node>/charter.md` — no schema of its own, so this is written the way a `where` card reads
// a directory to a human: what lives here, depends on / used by, certified conventions with their evidence,
// exemplars to copy, co-change partners, sizing, and the sha it is all measured as of. Every line carries a
// number or a path; a section with nothing to report says so rather than being omitted, so an owner reading it
// cold knows the difference between "nothing found" and "not measured".
// ==================================================================================================
// Node-level co-change: `exp.cochange` pairs FILES; a node's own partners are the pairs whose two files land in
// two DIFFERENT nodes, aggregated by summing `support` over every such pair — the same aggregation `whereCmd`'s
// directory-level `cochangePartners` does at file granularity, done here at node granularity instead because a
// charter is read by the node's OWNER, who thinks in nodes, not files.
export function nodeCochangePairs(exp, nodeOfFile, top = 5) {
  const agg = new Map();
  const add = (x, y, support) => { const m = agg.get(x) || agg.set(x, new Map()).get(x); m.set(y, (m.get(y) || 0) + support); };
  for (const p of exp.cochange || []) {
    const a = nodeOfFile.get(p.a), b = nodeOfFile.get(p.b);
    if (!a || !b || a === b) continue;
    add(a, b, p.support || 0);
    add(b, a, p.support || 0);
  }
  const out = new Map();
  for (const [id, m] of agg) out.set(id, [...m].sort((x, y) => y[1] - x[1]).slice(0, top).map(([partner, support]) => ({ partner, support })));
  return out;
}
