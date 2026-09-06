// grain engine core — the emergent repo-convention engine, vendored from the MIT-licensed `roots2.mjs`
// prototype (github.com/krzysztofdudek/Yggdrasil, branch claude/document-review-13yoty, planning/roots/).
// The pristine original lives in that repository (planning/roots/prototype-roots2.mjs); this file is that engine with:
//   · the two hardcoded paths made configurable (vendored web-tree-sitter runtime, grammar dir — see config.mjs)
//   · the CLI globals (CMD/REPO/MODEL/OPTS/ARGS) replaced by explicit parameters
//   · the literal NUL / SOH bytes replaced by '\u0000' / '\u0001' escapes (behaviour identical)
//   · command functions returning lines instead of printing, so the CLI can stamp every answer
//   · history learning split into a resumable replay (history.mjs) so new commits cost only their new blobs
// Nothing about any language, framework or style is written down here: language bindings are DERIVED from
// each grammar's node-types.json, features are enumerated generically from raw ASTs and paths, and
// conventions are the statistically broken symmetries in that space (MDL acceptance, KT posteriors).
//
// This file is the ENGINE FACADE. The engine itself lives in the sibling modules re-exported below, one
// per seam the code already had; nothing here does any work. Every name the engine exported before the
// split is re-exported from here under the same name, so a caller imports from `./core.mjs` as it did.

// the cell-key sentinels and the two path/extension primitives every layer shares
export { toPosix, CODE_RE } from './base.mjs';
// generic language binding derived from each grammar's node-types.json, the parser pool, and the file/token primitives
export { bindingFor, getParser, parseFile, walkFiles, tokenize, nameShape, hashStr } from './parse.mjs';
// the node-type predicates and the declaration, member and modifier helpers extraction is built from
export { scopeName, TYPE_LIKE_RE, FUNC_LIKE_RE, isLocationNode } from './extract.mjs';
// extractScopes — the extraction pipeline itself: one walk of one file's AST into scopes and their predicates
export { extractScopes } from './scopes.mjs';
// skeletons, role profiles, templates and twins: the structural superposition a scope is read against
export {
  skelOf,
  skAu,
  skRender,
  profileOf,
  skSil,
  mineTemplates,
  twinsOf,
  exportShape,
  DOC_STOP,
  docTokens,
} from './superposition.mjs';
// the file-scope lexical layer (the surfaces an AST cannot carry) and the scope-to-line map
export { lexicalPreds, fileLevelPreds, scopeLine, scopeLineEnd } from './lexical.mjs';
// the objective and the fact vocabulary: KT posteriors, Jaccard, feature weights, cell labels and ordering
export {
  ptr,
  skeyR,
  decoSigiled,
  decoLabel,
  applyVocab,
  isBool,
  STRUCT_PID,
  BODY_KINDS,
  jac,
  jacW,
  isDefiningFact,
  kt,
  clearsOwnRate,
  currentPathOf,
  archCellLabel,
  part,
  scopeLabel,
  pct,
  factLabel,
} from './facts.mjs';
// birth obligations — what a new file under a module has historically come with
export { buildObligationTable, obligationFor, obligationLines } from './obligations.mjs';
// clustering, roles and the MDL/lambda miner, plus the deviant, marker, held and authorship summaries
export {
  induceClusters,
  induceRoles,
  assignAll,
  countCandidates,
  mine,
  topDeviants,
  altMarkerFor,
  heldSummary,
  authorConcentration,
  voice,
  authorConcClause,
  factNotes,
  deviantLine,
  skipLineNote,
  roleLift,
} from './mine.mjs';
// history weighting (survival x provenance x churn), value trends and calibration
export { mkWeightFn, valOf, trendsFor, rejectedValues, calibrate, heritageKindOf } from './weights.mjs';
// the verbalizer: units, shapes, and the English a convention or a deviation is said in
export {
  unitOf,
  scopeNamed,
  scopeBacktick,
  shapeShort,
  shapeWords,
  verbalize,
  lexWords,
  deviationPhrase,
  readCargoCrateName,
} from './verbalize.mjs';
// package roots, MDL cuts, the current-tree extraction, the vocabulary, and scope (de)serialization
export {
  findPackageRoots,
  mdlCuts,
  partOfFn,
  partitionFor,
  normalizeCR,
  extractTree,
  addModuleScopes,
  buildVocab,
  lexDomain,
  groupPartitions,
  serializeScope,
  hydrateScope,
} from './partition.mjs';
// learn — the current tree plus history folded into the model every query is answered from
export { learn } from './learn.mjs';
// placement on create: a new file whose name-kin already live in one place, from path evidence alone
export { QSTOP, sufOf, nameTokens, placementHit } from './placement.mjs';
// checkFile — the verdict for one file against the model — and the grouping of its deviations
export { checkFile, groupDeviations } from './check.mjs';
// the measured architecture: dependency norms, architecture hits, and the relation layer of a learn pass
export { architectureNorms } from './arch.mjs';
// the full local-to-global convention lattice for one file, with no acceptance cut
export { spectrum } from './spectrum.mjs';
// card building and the card-level line renderers every answer is assembled from
export {
  buildCards,
  normTok,
  cochangePartners,
  practicedBy,
  baselineShare,
  baselineClause,
  inLineForCard,
  inLineForFile,
} from './cards.mjs';
// whereCmd — intent to place, expectations and a pattern to copy
export { whereCmd } from './where.mjs';
// howCmd — intent to the past commits that look like it
export { howCmd } from './how.mjs';
// value-kind evidence, type-reference hits, tested-by evidence and the blind/ungrammared file lists
export { blindFiles, ungrammaredFiles, testedByEvidence } from './evidence.mjs';
// whatCmd — words to the concept card
export { whatCmd } from './what.mjs';
// the leave-one-out self-evaluations behind selftest --how, --where and --obligation
export { howEval, leakSubtractedH, whereEval, obligationEval } from './evals.mjs';
// the fact tiers, the standing notes and the health rows a report is built from
export {
  factTiers,
  DIRTY_TREE_NOTE,
  quoteFlags,
  lexTally,
  TEMPLATE_DESCRIPTIVE_NOTE,
  relCoverageData,
  CYCLE_GRANULARITY_NOTE,
  healthRows,
} from './report-facts.mjs';
// report, rules, status and the structural map
export { report, moduleLayers, mapSections, rulesMarkdown, statusLines } from './report.mjs';
// completeness, scope and file co-change, recipes, value-kin gaps and the missing lines
export {
  completeness,
  cochangeData,
  scopeCochangeLines,
  completenessDirectional,
  valueKinGaps,
  missingLines,
} from './completeness.mjs';
// the mutation harness and the extraction-recall selftest (dev and test only)
export { mutateTest, declCandidateTypes, extractCoverage } from './harness.mjs';
