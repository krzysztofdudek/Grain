// grain engine configuration — the only place where paths and numeric constants live.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENGINE_VERSION = '0.1.0';
export const EXTR_V = 'g20';
export const HIST_V = 'h2';
export const MODEL_V = 'm3'; // model schema version — bump when the model gains fields queries depend on (forces a re-learn, not a re-parse)
// a call that IS a test case: its string argument names the callback scope (it/test/specify, Go's t.Run) — the one piece of
// ecosystem vocabulary grain allows itself beside the test-path patterns above; a new test body is otherwise anonymous and
// ungoverned (measured: `check` on a new test file said `0 scopes` in three review rounds)
export const TEST_CASE_RE = /(^|\.)(it|xit|fit|test|xtest|specify|run)$/i; // replay-state version — bump when the persisted replay (lifecycle rows, co-change pairs) changes shape without the blobs changing // extractor version — bump on any extraction change; invalidates the blob cache and the replay state by key

const here = dirname(fileURLToPath(import.meta.url));
// Grammar assets (`tree-sitter-<g>.wasm` + `tree-sitter-<g>.node-types.json`) live inside the plugin by default;
// GRAIN_GRAMMAR_DIR overrides (e.g. to point at a larger grammar set).
export const GRAMMAR_DIR = process.env.GRAIN_GRAMMAR_DIR || join(here, 'grammars');

// The extension→grammar map is the ONLY per-language datum in the product (§6.1). It is filtered at load to the
// grammars actually present in GRAMMAR_DIR, so dropping a new `tree-sitter-<g>.wasm` + node-types pair in is all it
// takes to add a language; files whose grammar is not shipped are simply not parsed.
const ALL_EXT2GRAMMAR = { '.ts': 'typescript', '.mts': 'typescript', '.cts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
  '.py': 'python', '.go': 'go', '.java': 'java', '.rb': 'ruby', '.rs': 'rust', '.cs': 'c_sharp', '.php': 'php', '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hh': 'cpp', '.hxx': 'cpp', '.kt': 'kotlin', '.kts': 'kotlin', '.scala': 'scala', '.sc': 'scala',
  '.sh': 'bash', '.bash': 'bash', '.lua': 'lua', '.zig': 'zig', '.groovy': 'groovy', '.gradle': 'groovy', '.sol': 'solidity' };
export const EXT2GRAMMAR = Object.fromEntries(Object.entries(ALL_EXT2GRAMMAR).filter(([, g]) =>
  existsSync(join(GRAMMAR_DIR, `tree-sitter-${g}.wasm`)) && existsSync(join(GRAMMAR_DIR, `tree-sitter-${g}.node-types.json`))));
export const GRAMMARS = [...new Set(Object.values(EXT2GRAMMAR))].sort();

// Built-in exclusions (§6.8): EXCL gates every surface; MINE_EXCL gates convention mining only — test files stay
// fully counted in lifecycle, value events and co-change.
export const EXCL = /(^|\/)(node_modules|dist|build|out|vendor|\.git|\.yggdrasil|\.grain|__pycache__|migrations|coverage|\.next|bin|obj|fixtures?|benchmarks?|__mocks__|target)(\/|$)|\.min\.|generated|\.d\.ts$/;
// Test code is MINED — in its own partition (`<pkg>#tests`), so test norms are queryable ("where do tests for X go",
// "what does a test here look like") without ever feeding the production norm. A test tree below the partition floor is
// simply not mined (it still counts for history and co-change). Detection is by path: directory names and the file-name
// patterns the major ecosystems use.
export const TEST_DIR_RE = /(^|\/)(tests?|__tests__|specs?|testing|e2e|integration-tests?|test-?utils?|__mocks__)(\/|$)/;
export const TEST_FILE_RE = /(\.(test|spec|tst|e2e-spec|test-d)\.[^.]+$)|(_tests?\.(go|py|rb|rs|ts|js|php|ex|exs)$)|(^test_[^/]*\.py$)|(Tests?\.(java|kt|cs|scala|groovy)$)|(_spec\.rb$)|(^spec_[^/]*\.rb$)|(\.spec\.[a-z]+$)/;
// directory names count only in the first two segments under the package root (`test/`, `src/test/`, `examples/`) — a deep
// `…/samples/petclinic/` is a Java package, not an examples tree (measured: spring-petclinic's whole source became "examples")
const layout = (rel, inPkg) => (inPkg ?? rel).split('/').slice(0, 2).join('/') + '/';
// test DIRECTORIES count at any depth, but measured inside the package — a PACKAGE named `testing` (nest's shipped
// packages/testing) is a product, not a test tree; axum's src/routing/tests/ still lands in the tests partition
export const isTestPath = (rel, inPkg) => { const p2 = inPkg ?? rel; return TEST_DIR_RE.test(p2.slice(0, p2.lastIndexOf('/') + 1)) || TEST_FILE_RE.test(rel.split('/').pop()); };
export const TESTS_SUFFIX = '#tests';
// Examples, templates, scripts and docs are observed in their own partition, never authoritative for the product code:
// measured, `examples/` outvoted `lib/` on express and a scaffold under `templates/` became the top naming exemplar of a
// .NET repository.
export const EXAMPLE_DIR_RE = /(^|\/)(examples?|samples?|demos?|templates?|scaffolds?|scripts?|tools?|docs?|playground|sandbox)(\/|$)/;
export const EXAMPLES_SUFFIX = '#examples';
export const auxOf = (rel, inPkg) => isTestPath(rel, inPkg) ? TESTS_SUFFIX : EXAMPLE_DIR_RE.test(layout(rel, inPkg)) ? EXAMPLES_SUFFIX : '';
// kept for the history layer's compatibility; mining no longer excludes test files — it partitions them
export const MINE_EXCL = /a^/;

// Statistical constants (every one carries a config key in the spec §4.5; the values are the spec defaults)
// minShare: the survived-raw share a spoken convention must show. The spec's 2/3 lets categorical facts speak at 80%
// ("methods here start with an expression_statement — 80% of 367" fired nine times on one flask file); 0.85 is where a
// reader stops arguing with the number.
export const CFG = { margin: 4.0, minRaw: 5, minEff: 3, tau: 2.5, tauAbs: 3.5, minShare: 0.85, ambGap: 0.15, minMemb: 0.35,
  survDays: 120, freshDays: 14, agentBase: 0.15, promoteDays: 180, floor: 0.05,
  calibHorizonDays: 365, calibSettleDays: 30, calibMinEv: 12, denyMinEv: 35, targetPrec: 0.8,
  cochangeMinSup: 8, cochangeMinConf: 0.75, megaCap: 30,
  trendWinDays: 90, dirMin: 25, tauAbsStruct: 4.5,
  // structural PRESENCE ("methods here always contain a <node type>") draws from the same huge family as structural absence:
  // at 2.5 bits the corpus produced "always contain a member_expression — 90% of 1758" on express and "always contain an
  // expression_list — 87% of 1014" on gin, both trivially true of most code. 3.5 bits (share ≈ 0.92) rejects those.
  tauHasPresence: 3.5 };
export const NCAP = 700;                                                   // role clustering: distinct-feature-bag sample cap
export const SUP = { nodeType: 20, call: 8, imp: 5, ext: 4, shape: 15, deco: 8, ret: 4, pt: 4 }; // vocabulary support floors per enumerator
export const TOPK = { nodeType: 30, call: 80, imp: 60, ext: 30, shape: 40, deco: 40, ret: 30, pt: 30 }; // vocabulary top-K per enumerator
export const AGENT_AUTHOR_RE = /claude|copilot|cursor|codex|devin|\bbot\b|gpt|gemini|dependabot/i;
export const FIX_RE = /^(fix|hotfix|bugfix)\b|(^|\s)revert(s|ed)?\b|^fix[(:]|This reverts commit/i;
