// grain engine · proposal writer · the drill corpora and the aspect bodies they accompany
// Split out of propose.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { lstatSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { PREAMBLE, pct } from './propose-base.mjs';

// ---- drills, cut from the export's own sites ----
//
// A drill case is one source FILE under a `satisfies-*` / `violates-*` directory (Yggdrasil's corpus layout).
// The counsel memo's hold-out is BY TIME and non-negotiable for the measurement ticket (097); here it is
// available and LABELLED. `--holdout <YYYY-MM-DD>` keeps only sites whose first appearance post-dates the cut,
// using the per-site `lifecycle.firstSeen` the export already carries. Without it every corpus says, in its own
// CORPUS.md, that the rule and the drill are the same data — which is the honest label, not a footnote.
export function cutDrills(repo, aspect, holdout, cap = 5) {
  const kept = { satisfies: [], violates: [] }, dropped = { satisfies: 0, violates: 0 };
  const repoRoot = resolve(repo);
  // A DRILL CASE IS A FILE; A CONVENTION'S SITE IS OFTEN A SCOPE INSIDE ONE. A file holding one conforming
  // method and one deviating method is NOT a `satisfies-` case — the check runs over the whole file and is
  // right to refuse it. Cutting it as `satisfies-` blames the check for the corpus's own mislabelling, and did:
  // 13 of the 13 remaining FALSE-ALARMs on the pattern repo were this, not a defect in any rendered rule.
  // So a file that carries ANY deviating site is a `violates-` case, whatever else it also carries.
  const deviatingFiles = new Set((aspect.drills.violates || []).map(s => s?.rel).filter(Boolean));
  for (const side of ['satisfies', 'violates']) {
    const seen = new Set();
    for (const s of aspect.drills[side] || []) {
      if (!s?.rel || seen.has(s.rel)) continue;
      if (side === 'satisfies' && deviatingFiles.has(s.rel)) continue;
      if (holdout) {
        const born = s.lifecycle?.firstSeen;
        if (!born || born <= holdout) { dropped[side]++; continue; }
      }
      let content;
      // A DRILL CASE IS COPIED OUT OF THE REPOSITORY AND INTO A TREE THE MAINTAINER IS INVITED TO MOVE IN AND
      // COMMIT, so the only thing that may become one is a REGULAR FILE INSIDE the repository. Two refusals,
      // both about the same rule:
      //   - CONTAINMENT. A site path that resolves outside the repository is not this repository's evidence,
      //     whatever produced it. This is the one place a repository-derived string becomes several path
      //     components of a write, so it is the one place the check has to be.
      //   - NO LINKS. `readFileSync` follows a symlink, and git tracks a symlink as an ordinary entry — so a
      //     hostile repository shipping `src/handler.ts -> ../../../.ssh/id_rsa` could hand the proposal the
      //     content of a file it does not contain, in a directory the adopter is being asked to commit.
      //     `lstatSync` does not follow, so a link is simply not a case.
      // Both are silent for the same reason every other unreadable site is: there is no case to cut, so there
      // is nothing to report about one.
      const abs = resolve(repo, s.rel);
      if (abs !== repoRoot && !abs.startsWith(repoRoot + sep)) continue;
      try { const st = lstatSync(abs); if (!st.isFile() || st.size > 200 * 1024) continue; content = readFileSync(abs, 'utf8'); } catch { continue; }
      seen.add(s.rel);
      kept[side].push({ rel: s.rel, content, name: s.name || null, born: s.lifecycle?.firstSeen || null });
      if (kept[side].length >= cap) break;
    }
  }
  return { kept, dropped };
}
export function contentMd(c, profile, evidenceLine, whyProse, name) {
  const L = [];
  L.push(...PREAMBLE.map(l => (l ? `> ${l}` : '>')));
  // The heading and "## The rule" are the aspect's OWN `name` — the obligation the reviewer is asked to judge
  // against — not the indicative sentence grain mined it from (ticket 109). A `content.md` whose first line
  // disagrees with the `name:` in the yaml beside it gives the reviewer two rules and no way to pick.
  L.push('', `# ${name}`, '', '## The rule', '', name, '', '## Evidence', '', evidenceLine, '',
    '## Why this is prose and not a check', '',
    `Grain renders a deterministic \`check.mjs\` wherever the convention's class has a shape a syntax tree can`,
    `be asked about. This one does not: ${whyProse || 'no template renders this class'}`,
    'A prose rule costs a reviewer call every time it is answered, and it cannot be replayed or drilled for free.',
    'If you can restate it as a rule about a NAME, delete this aspect and write the check instead.', '');
  if (c.exemplars?.length) {
    L.push('## What passing looks like', '');
    L.push(`Follow \`${c.exemplars[0].rel}\` line ${c.exemplars[0].line}${c.exemplars[0].name ? ` (\`${c.exemplars[0].name}\`)` : ''}.`, '');
  }
  if (profile?.skel) {
    L.push('The shared shape every conforming site anti-unifies to (grain\'s superposition template — the parts', `all ${profile.n} members hold in common, ${pct(profile.coverage ?? 0)} coverage):`, '', '```', profile.skel, '```', '');
  }
  if (c.deviatingSites?.length) {
    L.push('## Sites that do not follow it yet', '');
    for (const d of c.deviatingSites.slice(0, 20)) L.push(`- \`${d.rel}\`${d.name && d.name !== d.rel.split('/').pop() ? ` (\`${d.name}\`)` : ''} — ${d.phrase || 'deviates'}`);
    if (c.deviatingSites.length > 20) L.push(`- … and ${c.deviatingSites.length - 20} more`);
    L.push('');
  }
  L.push('## Before promoting this out of `draft`', '', 'Decide whether this is a RULE or merely a HABIT. Grain measured that the code does this; it cannot know', 'whether it should. If it is a habit, delete this aspect. If it is a rule, say WHY it is a rule here —', 'that sentence is the part no miner can write.', '');
  return L.join('\n');
}
export function subGateMd(r, statement, evidenceLine, whyProse, absence = false) {
  const L = [];
  L.push(...PREAMBLE.map(l => (l ? `> ${l}` : '>')));
  // AN ABSENCE ROW IS NOT HEADED "The rule" (ticket 115). Its own sentence says it is not one, and a heading
  // that contradicts the sentence under it is the whole failure this section exists to stop.
  L.push('', `# ${statement}`, '', absence ? '## The observation' : '## The rule', '', statement, '', '## Evidence', '', evidenceLine, '',
    absence ? '## Why this is an OBSERVATION and not a rule' : '## Why this is a DRAFT and not a certified convention', '',
    ...(absence
      ? [`This row reports that ${pct(r.share)} of the population does NOT use the identifier above. A count of`,
        'what is missing is not a prohibition: the minority that DOES use it is very often exactly the code the',
        'identifier is for. So grain refuses to word it as "no file here may ...", renders no check for it, and',
        'holds it out of every status a check could earn — it can be read, and made into a rule by you if it is',
        'one, without ever being enforced by accident.']
      : [`This row is below grain's own gate. It is practised by ${pct(r.share)} of the population, which clears the`,
        "repository's two-thirds supermajority but not the certification bound — so grain refuses to state it as a",
        'fact. That refusal is right for an agent mid-edit and wrong for you: a rule that most of the code follows',
        'and some of it does not is either a rule with a backlog, or a habit to drop. Only you can say which.']), '',
    '## Why this is prose and not a check', '',
    `${whyProse || 'no template renders this class'}`, '');
  if (r.deviants.length) {
    L.push(absence ? '## The sites that DO use it' : '## The sites that do not follow it', '');
    for (const d of r.deviants.slice(0, 30)) L.push(`- \`${d}\``);
    if (r.deviants.length > 30) L.push(`- … and ${r.deviants.length - 30} more`);
    L.push('');
  }
  return L.join('\n');
}
// ---- the human-readable documents ----
export function mdTable(head, rows) {
  if (!rows.length) return '_(none)_\n';
  const w = head.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] ?? '').length)));
  const line = cells => '| ' + cells.map((c, i) => String(c ?? '').padEnd(w[i])).join(' | ') + ' |';
  return [line(head), '|' + w.map(x => '-'.repeat(x + 2)).join('|') + '|', ...rows.map(line)].join('\n') + '\n';
}
