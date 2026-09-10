// The proposal renderer — turn grain's model into a PROPOSED `.yggdrasil/` graph.
//
// The north star (decisions.md `north-star-brownfield-miner`) is a maintainer adopting Yggdrasil on a brownfield
// repository. `tests/stress/reconstruct.mjs` (ticket 093) measured how much of a hand-written graph grain's
// export ALREADY holds; this module is the other half — it writes the graph grain can propose, so the maintainer
// starts from a draft with evidence attached instead of from an empty directory.
//
// It was an instrument (`tests/stress/propose.mjs`, ticket 094) until ticket 104 made `grain propose` a product
// command: the whole render pipeline moved here VERBATIM, and the instrument is now a thin wrapper that imports
// this module, adds the `--score` comparison against a hand-written graph, and keeps its own CLI flags. The
// dispatcher's `propose` command (`cmdPropose`, engine/grain.mjs) drives `propose()` below and renders the
// report; nothing about what lands on disk depends on which of the two called it.
//
// THREE RULES THIS MODULE OBEYS.
//
//   1. NEVER write into the repository's own `.yggdrasil/`. Everything lands under `<out-dir>/.yggdrasil/`, a
//      directory the maintainer reads and edits, then accepts with `yg adopt <out-dir>` (ticket 123) rather
//      than moving by hand. The repository is untouched but for one
//      thing, named here rather than glossed over: the export this module spawns for itself is written to
//      `.grain/cache/`, the disposable half of grain's own store, which `.grain/.gitignore` already ignores —
//      so a run leaves the working tree clean, and nothing it wrote can be committed by accident.
//   2. EVERY proposed element carries an evidence line — counts, paths, shares — naming what in the repository
//      made grain propose it. A proposal without evidence is a guess with a YAML syntax, and the whole point of
//      the north star is that the graph comes from the code rather than from imagination. The evidence is both a
//      `# evidence:` comment in the YAML and a row in `<out-dir>/proposal.json`.
//   3. NOTHING IS ASSERTED AS TRUE UNTIL IT HAS EARNED IT. Every aspect ships `status: draft` by default (the
//      reviewer is skipped, no verdict, no baseline); no type ever carries `enforce: strict`. A prose aspect
//      (`content.md`, an LLM judgment call) NEVER leaves draft here — ticket 101 measured its sense rate under
//      a keyless gate at 0% (ruling `prose-aspects-draft-by-default`) — and its `content.md` says so. A
//      deterministic aspect (`check.mjs`) is promoted to `status: enforced` ONLY when a Yggdrasil CLI resolves
//      and a REAL `yg drill` on the just-written proposal, in a throwaway staging copy, confirms it: zero
//      FALSE-ALARMs and at least one caught `violates-*` case. A check that false-alarms stays draft with
//      `draftReason: file-scope-approximation-fa` (ruling `drill-fa-labelling-is-acceptance-not-defect` — the
//      convention's own subject is a symbol inside the file, Yggdrasil's unit is the file, and the label is
//      what is wrong, not the check); a check that catches nothing stays draft with `draftReason: no-catch`
//      (ruling `no-catch-rules-stay-draft`). With no Yggdrasil CLI every deterministic aspect stays draft too,
//      unverified. The honest limits — above all that a rule about an ABSENCE can never come from mining — are
//      printed at the top of every file a human opens either way.
//
// `grain export` is driven as a SUBPROCESS (`bin/grain.mjs export --out …`) rather than called in-process: it is
// the same code path either way, and the subprocess keeps the export's own memory profile (a full parse of every
// tracked file) out of the process that then renders. `core.mjs` is imported dynamically, only when the sub-gate
// lattice is actually computed. Verifying against Yggdrasil (`yg drill`) runs the built CLI as a subprocess over
// a throwaway copy of this renderer's own output, exactly as `tests/propose.test.mjs` already does.
//
// This file is now a FACADE. The work itself lives in the sibling modules re-exported below, one
// per seam the file already had; nothing here does any work. Every name this file exported before
// the split is re-exported from here under the same name, so a caller imports from it as it did.

// proposal writer · the admission constants, the Yggdrasil CLI resolution, the file walk and the YAML emitter
export {
  SUPERMAJORITY,
  LAMBDA_BOUND,
  MIN_SUPPORT,
  MIN_PROMOTE_FILES,
  MIN_GROUP_MEMBERS,
  MIN_WHEN_FIDELITY,
  MIN_CONVENTION_SITES,
  FAMILY_MIN_MEMBERS,
  SUBGATE_PER_PARTITION,
  resolveYg,
  progressiveReference,
  slug,
  yq,
  yamlEmit,
  PREAMBLE,
} from './propose-base.mjs';
// proposal writer · candidate localities and the words that describe a level
export {
  localities,
  TYPE_LEVELS,
  typeEvidence,
  evidenceContext,
  levelSentence,
  contentRegexFor,
  caseTolerant,
} from './propose-levels.mjs';
// proposal writer · node_types — choosing the level a type is cut at
export { buildTypes } from './propose-types.mjs';
// proposal writer · relations and the coarse node cut
export { buildRelations, nodePathFor, typeGlob, nestedProjectRoots, buildNodes } from './propose-nodes.mjs';
// proposal writer · the sub-gate lattice and the identifiers a rule is written in
export {
  partitionLattice,
  subGate,
  identifierOf,
  shapeToRegex,
  DRAFT_NOTE,
  statusNote,
} from './propose-lattice.mjs';
// proposal writer · the deterministic check.mjs a drafted aspect ships
export { renderCheck } from './propose-checks.mjs';
// proposal writer · which lattice rows are renderable, which direction they hold in, and why
export { RENDERABLE, isAbsenceRow, renderableDirection, WHY_PROSE } from './propose-classify.mjs';
// proposal writer · sizing.json — what the graph costs to review
export { computeSizing } from './propose-sizing.mjs';
// proposal writer · the render pipeline: read the model, write the staging tree
export { propose, nodeDescription } from './propose-write.mjs';
// proposal writer · the obligation form and the aspect drafts
export {
  unitOne,
  obligationSentence,
  obligationOfStatement,
  describeRow,
  buildAspects,
} from './propose-aspects.mjs';
// proposal writer · provenance, and the status an aspect earns from a real drill
export {
  provenanceFor,
  SLOWEST_OBSERVED_DRILL_MS,
  DRILL_TIMEOUT_MS,
  promoteEnforceableAspects,
} from './propose-status.mjs';
// proposal writer · the family-without-law adapter
export { buildFamilyCandidates } from './propose-family.mjs';
// proposal writer · the drill corpora and the aspect bodies they accompany
export { cutDrills } from './propose-drills.mjs';
// proposal writer · what `grain propose` prints, and what --json writes
export { proposeReport } from './propose-report.mjs';
