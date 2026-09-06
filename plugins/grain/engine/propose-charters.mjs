// grain engine · proposal writer · charter.md, one per proposed node
// Split out of propose.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { PREAMBLE } from './propose-base.mjs';

// ==================================================================================================
// 7c-bis. THE CASCADE, AS YGGDRASIL RUNS IT (ticket 114).
//
// A grain proposal attaches every mined rule to a TYPE (`a.host` is a type id, written into
// `yg-architecture.yaml` under `node_types.<type>.aspects`). The node that actually OWNS the files is often a
// nested one whose own type hosts nothing: on spring-petclinic the 30 Java files belong to
// `src/main/java/org`, while all 8 mined rules sit on the `src-main-java` type one level up. Yggdrasil
// resolves that correctly — `yg context --file` lists all 8 — because its cascade
// (`core/graph/aspects.ts`, `iterateAttachments`) walks six channels, in this order:
//
//   1. the node's own `aspects:`            4. an ANCESTOR node's architecture type's `aspects:`
//   2. an ANCESTOR node's own `aspects:`    5. flow aspects
//   3. the node's own architecture type's `aspects:`   6. port-consumption aspects
//
// The charter was per-node and flat, so the owner assigned to the node holding the code read "none certified
// yet at this node" about code governed by eight rules — and the charter is the ONLY file the layer above the
// graph reads (Horde's `node.mjs show` prints it verbatim; nothing there opens `yg-architecture.yaml`).
//
// This walk is the same walk, restricted to the channels a grain proposal can populate. Channels 5 and 6 are
// structurally empty here — this renderer writes no `yg-flow.yaml` and no `ports:` — so they are not walked
// rather than walked and found empty. Channels 1 and 2 ARE walked, off `n.aspectIds`, even though the node
// writer attaches nothing there today: the moment it does, the charter follows without a second edit.
// Ancestors are the node-path chain, ROOT-FIRST, exactly as `collectAncestors` returns it.
//
// Effective STATUS is not recomputed here. Yggdrasil takes max() across the channels that attach an aspect;
// this renderer writes a bare id at every attach site (no `status:` override — see `writeArchitecture`), so
// the only status in play is the aspect's own, which is what each row prints.
const ancestorNodesOf = (n, nodes) => nodes
  .filter(p => p !== n && p.id !== n.id && n.id.startsWith(p.id + '/'))
  .sort((a, b) => a.id.split('/').length - b.id.split('/').length);
export function effectiveAspectsForNode(n, nodes, aspects) {
  const ancestors = ancestorNodesOf(n, nodes);
  const byId = new Map(aspects.map(a => [a.id, a]));
  const seen = new Set();
  const own = [], inherited = [];
  const take = (a, into, via) => { if (!a || seen.has(a.id)) return; seen.add(a.id); into.push(via ? { a, via } : a); };
  for (const id of n.aspectIds || []) take(byId.get(id), own);                                  // channel 1
  for (const a of aspects) if (a.host && a.host === n.type) take(a, own);                       // channel 3
  for (const p of ancestors) for (const id of p.aspectIds || []) take(byId.get(id), inherited, `inherited from ancestor node \`${p.id}\``); // channel 2
  for (const p of ancestors) for (const a of aspects) if (a.host && a.host === p.type) take(a, inherited, `inherited from type \`${p.type}\`, on ancestor node \`${p.id}\``); // channel 4
  return { own, inherited };
}
// One rule, one line, in the words the report and the aspect file already use. `status` is the word Yggdrasil's
// own `yg-aspect.yaml` carries (`yg schemas read aspect`), and the drill numbers are the ones the proposal's
// report prints for the same rule — so a reader meeting a rule in the charter and again in the report meets one
// account of it, not two.
const charterStatusOf = a => a.finalStatus || 'draft';
// A drill with nothing planted (`violates: 0`) says nothing about the check, so the row says nothing about the
// drill — "caught 0 of 0" reads as a failure and is not one.
const charterDrillOf = a => (a.drill?.violates ? ` · drill: caught ${a.drill.catches} of ${a.drill.violates} · ${a.drill.falseAlarm} false alarm(s)` : '');
const charterShareOf = a => (typeof a.share === 'number' ? a.share.toFixed(3) : String(a.share));
export function renderNodeCharter(n, { nodes, aspects, sizingByNode, cochangeByNode, asOf, repo }) {
  const L = [`# Charter — \`${n.id}\``, '', ...PREAMBLE.map(l => (l ? `> ${l}` : '>')), ''];
  // THE CHARTER OPENS WITH WHAT THE NODE OBLIGES, NOT WITH HOW IT WAS CUT (ticket 109). `n.why` is the
  // miner's reason for the grouping; it is still here, one line down, under "grouped because". What a session
  // opening this file needs first is which files it is responsible for and what it may reach.
  L.push(n.organizational
    ? `Organizational node — it owns no file of its own. Every file under \`model/${n.id}/\` belongs to one of its children; attach a rule to the child that owns the file, never here.`
    // A ROOT-GLOB NODE HAS NO DIRECTORY (ticket 109 round 2). `n.dir` is `null` for the type cut from a
    // partition whose files all sit at the repository root, and interpolating it printed "Everything under
    // `null/`" at a maintainer.
    : `${n.dir ? `Everything under \`${n.dir}/\`` : 'Every file that sits at the repository root itself'} is this node's: ${n.files.size} tracked file${n.files.size === 1 ? '' : 's'}${n.ownFiles.size === n.files.size ? ', all of them owned here' : `, ${n.ownFiles.size} owned here and ${n.files.size - n.ownFiles.size} by a nested node below it`}. A rule attached to this node applies to every file it owns.`, '');

  if (!n.organizational) {
    L.push('## What lives here', '', `- ${n.files.size} tracked files mapped to ${n.dir ? `\`${n.dir}/\`` : 'the repository root'}${n.ownFiles.size === n.files.size ? '' : ` (${n.ownFiles.size} owned directly; the other ${n.files.size - n.ownFiles.size} belong to a nested node)`}`);
    const extCounts = new Map();
    for (const f of n.ownFiles) { const m = /\.([A-Za-z0-9]+)$/.exec(f); const ext = m ? m[1] : '(no extension)'; extCounts.set(ext, (extCounts.get(ext) || 0) + 1); }
    const topExts = [...extCounts].sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (topExts.length) L.push(`- file types: ${topExts.map(([e, c]) => `\`.${e}\` ×${c}`).join(' · ')}`);
    if (n.contains?.length) L.push(`- groups: ${n.contains.map(id => `\`${id}\``).join(' · ')}`);
    L.push(`- grouped because: ${n.why}`);
    L.push('');
  }

  L.push('## What this node may depend on', '');
  const dep = n.relations || [];
  const used = nodes
    .filter(x => x !== n)
    .flatMap(x => (x.relations || []).filter(r => r.target === n.id).map(r => ({ from: x.id, n: r.n })))
    .sort((a, b) => b.n - a.n);
  L.push(dep.length
    ? `- may depend on: ${dep.map(r => `\`${r.target}\` (${r.n} resolved import${r.n === 1 ? '' : 's'})`).join(' · ')}. A dependency on any other node is refused by \`yg check\` until it is declared here.`
    : '- may depend on: nothing is declared yet. `yg check` refuses a dependency on another node until it is declared here, so declare the relation before the first import.');
  L.push(used.length
    ? `- depended on by: ${used.map(r => `\`${r.from}\` (${r.n} resolved import${r.n === 1 ? '' : 's'})`).join(' · ')}. Changing what this node exposes breaks them.`
    : '- depended on by: no other node imports this one.', '');

  // An aspect's `host` is the TYPE that carries it in `yg-architecture.yaml`; a node's own `id` is a PATH
  // (`src/main/java`) and `n.type` is that type id (`src-main-java`). Matching the host against the id is
  // a category error that empties every charter the moment a directory name is not already its own slug —
  // and the charter is the one file the layer above the graph reads. `effectiveAspectsForNode` above walks
  // the rest of the cascade, so a node whose OWN type hosts nothing still reads the rules that reach its
  // files from an ancestor (ticket 114).
  const { own: hosted, inherited } = effectiveAspectsForNode(n, nodes, aspects);
  const certified = hosted.filter(a => a.origin === 'certified-convention');
  const subgate = hosted.filter(a => a.origin === 'sub-gate-lattice');
  L.push('## Certified conventions', '');
  if (certified.length) {
    for (const a of certified) {
      L.push(`- ${a.name} — share ${charterShareOf(a)} · n ${a.n} conforming, ${a.deviating} deviating · status \`${charterStatusOf(a)}\`${charterDrillOf(a)} (\`${a.id}\`)`);
      if (a.exemplars?.length) L.push(`  exemplars to copy: ${a.exemplars.map(e => `${e.rel}:${e.line}`).join(', ')}`);
    }
  } else {
    // NEVER A DEAD END WHERE RULES DO REACH THE FILES. "none certified yet at this node" was literally true
    // and practically false on the one node that owns the code: the rules are attached one level up, and the
    // reader is told where to look rather than told there is nothing.
    L.push(inherited.length
      ? `- (none attached at this node itself — but ${inherited.length} rule${inherited.length === 1 ? '' : 's'} reach${inherited.length === 1 ? 'es' : ''} these files from above; they are in **Rules inherited from above** below and they are in force here)`
      : '- (none certified yet at this node)');
  }
  L.push('');
  // The same rules `yg context --file` lists for a file this node owns, arriving through the cascade rather
  // than attached here. Each row says where it comes from, so a reader knows which file to edit to change it.
  L.push('## Rules inherited from above', '');
  if (inherited.length) {
    for (const { a, via } of inherited) {
      L.push(`- ${a.name} — ${via} · status \`${charterStatusOf(a)}\` · share ${charterShareOf(a)} · n ${a.n} conforming, ${a.deviating} deviating${charterDrillOf(a)} (\`${a.id}\`)`);
      if (a.exemplars?.length) L.push(`  exemplars to copy: ${a.exemplars.map(e => `${e.rel}:${e.line}`).join(', ')}`);
    }
    L.push('', 'These are not attached here and cannot be changed here: each one is declared on the type or node named beside it, and applies to every file below it. `yg check` judges this node\'s files against them exactly as it judges the node that declares them.');
  } else {
    L.push('- (no rule reaches this node from an ancestor node or type)');
  }
  L.push('');
  L.push('## Sub-gate candidates — evidence, not yet law', '');
  if (subgate.length) {
    for (const a of subgate) {
      L.push(`- ${a.name} — share ${charterShareOf(a)} · practised in ${a.n} · ${a.deviating} sites do not · status \`${charterStatusOf(a)}\`${charterDrillOf(a)} (\`${a.id}\`)`);
    }
  } else {
    L.push('- (none below the certification bound worth naming)');
  }
  L.push('');

  L.push('## Co-change partners', '');
  const cc = cochangeByNode.get(n.id) || [];
  L.push(cc.length ? cc.map(c => `- \`${c.partner}\` — ${c.support} shared commit${c.support === 1 ? '' : 's'}`).join('\n') : '- (no other node co-changes with this one above the support floor)', '');

  L.push('## Sizing', '');
  const sz = sizingByNode.get(n.id);
  L.push(sz
    ? `- ${sz.files} files · ${sz.bytes} bytes · ${sz.codelengthLines} lines · ${sz.scopes == null ? 'scopes unavailable (no `.grain/cache/tree.json`)' : `${sz.scopes} scopes`} (see \`sizing.json\`)`
    : '- (no sizing recorded — organizational node, or `sizing.json` was not written)', '');

  L.push('## As of', '', `\`${asOf}\`${repo ? ` — ${repo}` : ''}`, '');
  return L.join('\n');
}
