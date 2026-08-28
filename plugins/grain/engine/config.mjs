// grain engine configuration — the only place where paths and numeric constants live.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENGINE_VERSION = '0.2.0';
export const EXTR_V = 'g23';
export const HIST_V = 'h6'; // replay-state schema version — bump when a per-scope lifecycle field is added (forces a full history re-walk, not just a re-learn): h6 adds `newFile` (birth-file status, §13.3), which only a fresh replay can backfill onto scopes born before the upgrade
export const MODEL_V = 'm14'; // model schema version — bump when the model gains fields queries depend on (forces a re-learn, not a re-parse)

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

// EXCLUSION RULING (maintainer, 2026-08-25): git decides what is not the repo's code — anything gitignored is never
// processed, anything TRACKED is code (a repo that commits vendor/ chose to). In git mode the universe is the HEAD
// tree, where gitignore already holds, and only HARD_EXCL applies (grain's own store; .git for symmetry). The EXCL
// name list below survives ONLY as the no-git fallback, where there is no gitignore to consult.
export const HARD_EXCL = /(^|\/)\.(git|grain)(\/|$)/;
export const EXCL = /(^|\/)(node_modules|dist|build|out|vendor|\.git|\.yggdrasil|\.grain|__pycache__|migrations|coverage|\.next|bin|obj|fixtures?|benchmarks?|__mocks__|target)(\/|$)|\.min\.|generated|\.d\.ts$/;
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
export const CFG = { lambda: 8, minRaw: 5, minEff: 3, ambGap: 0.15, minMemb: 0.35,
  survDays: 120, freshDays: 14, agentBase: 0.15, promoteDays: 180, floor: 0.05,
  calibHorizonDays: 365, calibSettleDays: 30, calibMinEv: 12, denyMinEv: 35, targetPrec: 0.8,
  cochangeMinSup: 8, cochangeMinConf: 0.75, megaCap: 30,
  trendWinDays: 90, dirMin: 25 };
export const NCAP = 700;                                                   // role clustering: distinct-feature-bag sample cap
export const SUP = { nodeType: 20, call: 8, imp: 5, ext: 4, shape: 15, deco: 8, ret: 4, pt: 4 }; // vocabulary support floors per enumerator
export const TOPK = { nodeType: 30, call: 80, imp: 60, ext: 30, shape: 40, deco: 40, ret: 30, pt: 30 }; // vocabulary top-K per enumerator
export const AGENT_AUTHOR_RE = /claude|copilot|cursor|codex|devin|\bbot\b|gpt|gemini|dependabot/i;
export const FIX_RE = /^(fix|hotfix|bugfix)\b|(^|\s)revert(s|ed)?\b|^fix[(:]|This reverts commit/i;
