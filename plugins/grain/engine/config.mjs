// grain engine configuration — the only place where paths and numeric constants live.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENGINE_VERSION = '0.3.0';
export const EXTR_V = 'g32'; // g24: iterative (non-recursive) walk in extractScopes so a deeply-nested expression no longer crashes extraction (G1); Rust struct_expression/mod_item are no longer misclassified as types (G15); a PHP call assigned to a variable no longer creates a phantom method scope (G16); a lone CR in a `//` comment no longer swallows the declaration after it (G17); g25 adds four new scope/file predicates (J5.6) — `auto.namesuffix`, `auto.mods`, `auto.memberorder` (extractScopes) and `auto.lex:imports` (lexicalPreds, now grammar-aware via `b`) — extraction output changes, so cached scopes/blobs from before this version must be rebuilt; g26 (Phase 7) adds JSON/YAML/TOML grammars (J7.2) — `bindingFor`'s `.data`/`.keyField` derived fields, `STR_TYPES` extended with data-grammar scalar/key node types, and the data-branch value normalization — extraction output for these three extensions changes, so cached scopes/blobs from before this version must be rebuilt; g27 fixes a named return value's IDENTIFIER being recorded as its TYPE (J-loop 015) — Go `(err error)` and Scala named-tuple returns recorded `err`/the slot name instead of `error`, via a new grammar-derived `b.paramLike` (node types whose own node-types.json declares both a `name` and a `type` field); every other grammar verified byte-identical, but Go/Scala extraction output changes, so cached scopes/blobs from before this version must be rebuilt; g28 adds the `.properties` grammar (issue 006) — `STR_TYPES` gains the generically-named `key`/`value` node types, so `.properties` files now yield keys and values where they previously yielded none; a `.properties`-bearing repo's cached scopes/blobs from before this version must be rebuilt; g29 closes two silent extraction gaps, both by deriving from node-types.json rather than name lists (issues 014/021): `b.namedValueSpec` (a node whose own `name` field is `multiple` and which has a `value` but no `body` — uniquely Go's `const_spec`/`var_spec`) makes Go package-level consts and vars findable as values, and `b.retField` (the result field of a callable-shaped node, discovered per grammar) replaces the hardcoded result/return_type/type list and so records C# return types for the first time; Go and C# extraction output changes, so their cached scopes/blobs from before this version must be rebuilt; g30 adds `s.supKind` (issue 033) — each recorded supertype is tagged as an `extends` or an `implements` where the grammar's own node types distinguish them (PHP `base_clause`/`class_interface_clause`, Java/Groovy `superclass`/`super_interfaces`, TS `extends_clause`/`implements_clause`), so a class that only implements is no longer rendered as if it extended; languages with no structural distinction (C# `base_list`, Kotlin, Rust, Scala, C++) stay unclassified and keep the previous wording verbatim, and Go/Python are structurally excluded — extraction output changes wherever the distinction exists, so those repos' cached scopes/blobs must be rebuilt g31 batches six extraction changes landed 2026-09-01: §018 macro bodies re-parsed and kept only when the whole region parses cleanly (new scopes on Rust); §040 a declaration decorated by a macro is named by its declarator, never the macro token, and .h is parsed with both C and C++ and read from whichever parses strictly cleaner, ties keep C (EXT_ALT); §043 Solidity modifier_invocation derived as a decoration (0→140 on OpenZeppelin); §045 macro-invocation identifiers no longer recorded as file supertypes (85.5% were phantoms); §016 Go methods bind to their receiver type via the paramLike type slot; §049 heritage inside a constructor-call clause records the type, not the argument (567 fabricated supertypes dropped on Play). Extraction output changes for C, C++, Rust, Go, Solidity, Scala, Kotlin, C#, JS — every cached store from before this version must be rebuilt. g32 batches the wave-2 extraction/classification changes of 2026-09-02: §060 the walk descends into an ERROR node's children (salvaging clean declarations beside unparseable ones, extracting nothing from the ERROR itself); §050 Scala's bodiless object/companion is type-like (TYPE_LIKE_RE widened to the bare word object, census-verified across 23 grammars); §075 a catch/finally clause is walked once, not once per enclosing method and class; §076 type-like gaps closed in five more grammars; §042 a per-literal quote-style deviation is flagged under the file-level convention. Cached scopes/blobs from g31 must be rebuilt.
export const HIST_V = 'h11'; // replay-state schema version — bump when a per-scope lifecycle field is added (forces a full history re-walk, not just a re-learn): h6 adds `newFile` (birth-file status, §13.3), which only a fresh replay can backfill onto scopes born before the upgrade; h7 adds `fps` — per-commit footprints (sha/ts/author/agent/fix/toks/files/scopes/renames, J2.1) that a match-by-example query walks — only a fresh replay can backfill footprints for commits walked before the upgrade; h8 adds `nonMegaCommits` (J2.4b) — the count of commits `fileCommits`/`msgTokCommits` are actually drawn from, so the language bridge's base rate stops being deflated by the mass-commit share; only a fresh replay can count it; h9 adds `scopePairSup`/`scopeCommits` (J5.7b) — the scope-level mirror of `pairSup`/`fileCommits` that `H.scopeCochange` is finalized from — only a fresh replay can backfill scope-pair co-change support for commits walked before the upgrade; h10 (Phase 7) widens `CODE_RE` to JSON/YAML/TOML (J7.2) — these paths now generate `events`/rename-tracking during the walk (though their blobs are never parsed, `parseBlobs`'s scopeless-grammar gate), so `fps[*].files`/`fps[*].renames` for commits walked before this version are missing these paths entirely; only a fresh replay backfills them h11 (§073, 2026-09-02): per-commit footprints now carry the git status byte (A/M/D/R) per path so a file's birth is a recorded event; renames resolved through the existing rename walk so R is never a birth. A store from h10 must re-walk history to backfill.
export const MODEL_V = 'm25'; // model schema version — bump when the model gains fields queries depend on (forces a re-learn, not a re-parse): m15 corrects role-cell established/share counts to exclude ambiguous members (G9), fixes a symbol literally named `constructor`/etc. silently zeroing the whole architecture layer (G6), and makes archNorms/computeArchHits agree with moduleGraph's own refined module IDs instead of a flatter, inconsistent one (G11); m16 adds `endLine` to the partition's `fileScopes` tuple so exemplar/carrier/deviant pointers can print a precise `file:from–to` range (J0.3), and adds `model.waivers` — maintainer exceptions that excuse one scope from one convention, render-time only (J1.3); m17 adds `bits` to each `msgAffinity` file entry — the codelength evidence a language bridge earned, now the sort key too (J2.4/J2.4b) — and adds `model.moves`, a compressed rename-affinity map (`<suffix>#<token>` → `<oldDir>→<newDir>` counts) that lets placement advice cite a supermajority historical move without `check`'s hot path ever touching git history (J2.5); m18 adds `model.valueIndex`/`model.valueSiblings`/`model.valueContainer`/`model.valueNorms` — the value-concordance index and its certified co-travel norms (J3.1/J3.2) — `part.groupKin` — a partition's certified name-stem pairing between role groups (J3.2) — and `model.twins` — structurally-identical role groups named differently (J3.4); m19 adds `model.changeArchetypes` — recurring, certified shapes of past commits (J4.1) — `nodes[].layer` on `model.moduleGraph` — SCC-condensed dependency depth (J4.3a) — and `model.concepts` — the repo's top tokens where commit messages and code vocabulary agree (J4.3b); m20 (Phase 5) adds `f.cost` — the codelength cost of a deviation, certified once cross-partition (J5.1) — `f.rejected` — values this repo tried and reverted from, a supermajority away (J5.2) — `f.agentShare`/`exemplars[].why` — per-fact agent-authored share and exemplar-choice rationale, render-only (J5.3) — `archNorms[].fromKind` and its second, (role-group, module) candidate population (J5.7a) — `model.scopeCochange` — scope-pair co-change, remapped through `currentPathOf` at learn-time (J5.7b) — and `part.profiles[r].req` — a role profile's literal-signature occurrence counts, the persisted substitute for the non-enumerable `_tpl` (J5.8); m21 (Phase 7) changes `mdlCuts`' partition cut set now that JSON/YAML/TOML scopes exist to key cuts by (J7.2), and fixes value-container sibling/population math to read per-container membership instead of a global, container-agnostic lookup (J7.3) — both change which conventions and value norms a re-learn certifies, even for code files untouched by Phase 7 itself; m22 (field-test loop) fixes two long-standing model-content bugs with no extraction change: `STRUCT_PID` was unanchored so its `ret` alternative prefix-matched `auto.returns:`, barring every declared-return-type fact from the repo-wide `_all:` population since the first commit (issue 022) — repo-wide return-type conventions can now certify, in every language; and Cargo workspaces are now discovered (`[package] name` per member, dash/underscore normalized) and consulted by the Rust resolver, so cross-crate `use` edges resolve and the architecture graph stops reporting zero dependencies for a workspace (issue 017); m23 adds `model.partitions[].fileTypeRefs` — per-file, threshold-free return/parameter type names, the sibling of the existing `fileSups`, so `what <a vendor type declared outside the repo>` can report the files that structurally reference it by exact name instead of silently undercounting via token overlap (issue 032); `whatCmd` degrades to heritage-only without it rather than crashing m24 (2026-09-02): §073 adds model.obligations — the birth-obligation table keyed on (refined module, suffix), gated by KT+BIC base-rate contrast, the λ bound, CFG.minRaw and liveness; §063 completeness ranks partners by max directional confidence; §044 twin health rows retired from report/rules (model.twins kept). Stores from m23 re-learn. m25 adds `model.partitions[].fileScopesTotal` — sparse, one entry per file whose `fileScopes` list was actually truncated at the existing 200-scopes-per-file cap, holding that file's true scope count — so a consumer ranking or reporting per-file scope counts (e.g. the `too-much` stress instrument) can tell "exactly 200" from "truncated at 200" without re-parsing (issue 099); a file at or under 200 scopes gets no entry and its true count is just `fileScopes[rel].length`, unchanged.

const here = dirname(fileURLToPath(import.meta.url));
// Grammar assets (`tree-sitter-<g>.wasm` + `tree-sitter-<g>.node-types.json`) live inside the plugin by default;
// GRAIN_GRAMMAR_DIR overrides (e.g. to point at a larger grammar set).
export const GRAMMAR_DIR = process.env.GRAIN_GRAMMAR_DIR || join(here, 'grammars');

// The extension→grammar map is the ONLY per-language datum in the product (§6.1). It is filtered at load to the
// grammars actually present in GRAMMAR_DIR, so dropping a new `tree-sitter-<g>.wasm` + node-types pair in is all it
// takes to add a language; files whose grammar is not shipped are simply not parsed.
const ALL_EXT2GRAMMAR = {
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.cs': 'c_sharp',
  '.php': 'php',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  '.hxx': 'cpp',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',
  '.sc': 'scala',
  '.sh': 'bash',
  '.bash': 'bash',
  '.lua': 'lua',
  '.zig': 'zig',
  '.groovy': 'groovy',
  '.gradle': 'groovy',
  '.sol': 'solidity',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.properties': 'properties',
};
export const EXT2GRAMMAR = Object.fromEntries(
  Object.entries(ALL_EXT2GRAMMAR).filter(
    ([, g]) =>
      existsSync(join(GRAMMAR_DIR, `tree-sitter-${g}.wasm`)) &&
      existsSync(join(GRAMMAR_DIR, `tree-sitter-${g}.node-types.json`))
  )
);
export const GRAMMARS = [...new Set(Object.values(EXT2GRAMMAR))].sort();

// AMBIGUOUS EXTENSIONS (§040). An extension names one language above, and for all but one of them that is simply
// true. `.h` is the exception: the same name means a C header in a C project and a C++ header in a C++ project,
// and nothing in the path says which. leveldb keeps its entire public API in `.h`, where the C grammar has no
// `class`, no `namespace` and no templates at all — 47 of its 56 headers failed to parse, and `what Comparator`
// could not name the interface at include/leveldb/comparator.h:20 because nothing there was ever extracted.
// EXT_ALT names the OTHER grammar an extension may denote; `parseFile` in core.mjs decides per file, by asking
// both grammars and keeping the one that actually parsed the bytes (see the tie-break there).
//
// Deliberately ONE entry, and deliberately not a search. Measured over 5.6k files of 17 extensions across 20
// repositories, asking for every extension whether a family sibling ever parses strictly cleaner:
//   · `.h`   — 1011 files, 550 errored under C, **384 strictly cleaner under C++**. The real ambiguity.
//   · `.c`   — 30 of 1240 would move, every one a jemalloc header where BOTH grammars fail badly and C++ merely
//              fails less (210 errors → 200). Noise, not a second reading of the extension. Excluded.
//   · `.cc`  — 2 of 565, same character, in the other direction. Excluded.
//   · every other extension measured (`.ts` `.tsx` `.js` `.mjs` `.jsx` `.json` `.yaml` `.yml` `.toml` `.gradle`
//     `.hpp` `.cpp` `.scala` `.groovy`) — **zero** files where a sibling parses cleaner. Not ambiguous at all.
// A search over ALL shipped grammars instead of a declared sibling is worse than useless: php, yaml and
// properties accept arbitrary text and so "parse cleaner" than any real grammar on anything — measured, the php
// grammar beat C on 20 of leveldb's 56 headers, 75 errors down to 0. Ambiguity is a property of the file-NAMING
// convention, which is exactly the kind of per-language fact this map already is (§6.1), so it is declared here.
const ALL_EXT_ALT = { '.h': 'cpp' };
export const EXT_ALT = Object.fromEntries(
  Object.entries(ALL_EXT_ALT).filter(([e, g]) => EXT2GRAMMAR[e] && GRAMMARS.includes(g))
);

// EXCLUSION RULING (maintainer, 2026-08-25): git decides what is not the repo's code — anything gitignored is never
// processed, anything TRACKED is code (a repo that commits vendor/ chose to). In git mode the universe is the HEAD
// tree, where gitignore already holds, and only HARD_EXCL applies (grain's own store; .git for symmetry). The EXCL
// name list below survives ONLY as the no-git fallback, where there is no gitignore to consult.
export const HARD_EXCL = /(^|\/)\.(git|grain)(\/|$)/;
export const EXCL =
  /(^|\/)(node_modules|dist|build|out|vendor|\.git|\.yggdrasil|\.grain|__pycache__|migrations|coverage|\.next|bin|obj|fixtures?|benchmarks?|__mocks__|target)(\/|$)|\.min\.|generated|\.d\.ts$/;
// DESIGN RULING (maintainer, 2026-08-25): no semantic recognition of tests, examples or any other role by NAME —
// "kod to kod": across this many languages a name-based test detector is a guess, and grain does not guess. Partitions
// come from directory structure (package roots); everything else must emerge from raw AST analysis. The measured
// accidents the removed axes once fixed (express's examples/ outvoting lib/; a small test tree judged by production
// norms) are accepted costs, to be re-measured, not silently re-patched with word lists.
export const MINE_EXCL = /a^/; // kept for the history layer's compatibility; mining excludes nothing

// Statistical constants (every one carries a config key in the spec §4.5; the values are the spec defaults)
// minShare: the survived-raw share a spoken convention must show. The spec's 2/3 lets categorical facts speak at 80%
// ("methods here start with an expression_statement — 80% of 367" fired nine times on one flask file); 0.85 is where a
// reader stops arguing with the number.
// THE decision constant (constitution stage 2): evidence is pure codelength — a fact exists iff bits > 0, where bits
// already carries the KT code, the BIC penalty and the index cost. What used to be six tuned thresholds (margin, four
// taus, minShare) is ONE loss ratio: λ = the cost of a wrong steer in silences — grain speaks an expected value only
// when the KT posterior predictive says at most 1 wrong steer per λ followed ones, and a deviation fires only when the
// deviant's pointwise excess costs ≥ log2(λ) bits. Vacuity ("always contains a member_expression") is not a threshold
// problem and stays where it belongs: the structural-contrast null model. minRaw/minEff survive only as compute
// short-circuits — below them bits > 0 is unreachable anyway.
// valueDfMin/valueDfMaxShare are a POPULATION gate on what enters the value index (§J3.1), structurally the same
// kind of constant as the `SUP`/`TOPK` vocabulary floors below or as minRaw/minEff's "compute short-circuit" role —
// NOT a second or third λ. Nothing is claimed on their strength: a value in one file alone has no concordance to
// report, and a value in a fifth of the repository is furniture, not a concept. Whether anything is SAID about a
// value is decided downstream by the one loss constant, exactly as everywhere else.
export const CFG = {
  lambda: 8,
  minRaw: 5,
  minEff: 3,
  valueDfMin: 2,
  valueDfMaxShare: 0.2,
  ambGap: 0.15,
  minMemb: 0.35,
  survDays: 120,
  freshDays: 14,
  agentBase: 0.15,
  promoteDays: 180,
  floor: 0.05,
  calibHorizonDays: 365,
  calibSettleDays: 30,
  calibMinEv: 12,
  denyMinEv: 35,
  targetPrec: 0.8,
  cochangeMinSup: 8,
  cochangeMinConf: 0.75,
  megaCap: 30,
  fpsCap: 20000, // per-commit footprint history retained (§J2.1); newest kept, oldest dropped
  scopePairCap: 200, // §J5.7b: megaCap bounds FILES per commit — a commit within that bound can still touch 200+ SCOPES (every method of a 30-file mega-refactor), which would otherwise pair ~19900-strong per commit. A plain compute/blow-up guard, same category as megaCap itself — no MDL role, just a sane cap on one commit's own pairing work.
  trendWinDays: 90,
  dirMin: 25,
};
export const NCAP = 700; // role clustering: distinct-feature-bag sample cap
export const SUP = { nodeType: 20, call: 8, imp: 5, ext: 4, shape: 15, deco: 8, ret: 4, pt: 4 }; // vocabulary support floors per enumerator
export const TOPK = { nodeType: 30, call: 80, imp: 60, ext: 30, shape: 40, deco: 40, ret: 30, pt: 30 }; // vocabulary top-K per enumerator
export const AGENT_AUTHOR_RE = /claude|copilot|cursor|codex|devin|\bbot\b|gpt|gemini|dependabot/i;
export const FIX_RE = /^(fix|hotfix|bugfix)\b|(^|\s)revert(s|ed)?\b|^fix[(:]|This reverts commit/i;
