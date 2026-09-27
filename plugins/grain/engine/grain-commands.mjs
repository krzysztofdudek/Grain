// grain engine · query surface · the command table: every command, its arguments and its flags, in one place.
//
// The CLI parses from it (which flags take a value) and the MCP server builds its tools from it, one tool per command
// and one field per argument and flag under the same name, so the two can never offer different surfaces. The usage
// text (grain-usage.mjs) stays hand-written; tests/mcp-server.test.mjs holds the two together in both directions.
//
// A flag is 'bool' (bare), 'value' (takes the next word), 'number' (takes the next word, a number) or 'path' (takes a
// file or directory the command resolves against the working directory — the MCP server refuses a relative one,
// since it does not run in the caller's directory). An argument is its name, with `?` when it may be left out and `...` when it takes one or more words.
// `repoPaths` names the arguments and flags that are paths inside the repository (resolved against its root, so a
// relative one is fine everywhere; a `<path>#<name>` target counts by its path); `repoRelative` the ones the command
// takes as written, relative to the repository root (a module directory, a virtual path), where an absolute path is wrong; `paths` the arguments resolved against the working directory, like a 'path' flag; `pathOrName`
// an argument that is either a bare name or such a path. `writes` says what a command writes beyond Grain's disposable
// index: 'always', or the flag whose presence makes it write. `stdoutJson` marks a command that prints a JSON document
// with no --json asked for (unless it writes it to the file its `writes` flag names), so the MCP server answers it as
// one block, as it does any --json answer. `summary` is one sentence saying what the command does (and, for the questions an
// agent asks mid-task, when to ask it): the MCP tool's whole description after what it writes; the details are the usage
// text, which the grain_help tool answers with.

export const GLOBAL_FLAGS = { repo: 'path', 'no-refresh': 'bool', 'no-history': 'bool' };

export const COMMANDS = {
  where: { summary: 'Where new code belongs and what it is expected to look like: call it BEFORE creating a source file, in the repository\'s own words.', args: ['query'], flags: { top: 'number', 'map-rows': 'number', json: 'bool' } },
  how: { summary: 'The past commits that look like a planned change, and the files such a change touched.', args: ['query'], flags: { top: 'number', json: 'bool' } },
  what: { summary: 'The concept card for words of this codebase: declarations, values, spread, siblings, commit mentions, fan-in.', args: ['query'], flags: { json: 'bool' } },
  map: { summary: 'A structural overview: the dependency layers and how many maintainer decisions are in force.', args: [], flags: { json: 'bool' } },
  obligation: { summary: 'What a new file at a path has historically come with: call it before creating a file there.', args: ['path'], repoPaths: ['path'], flags: { top: 'number', json: 'bool' } },
  check: {
    summary: 'How a file, or without file the whole uncommitted change, sits against the local norm: call it AFTER writing or editing.',
    args: ['file?'],
    repoPaths: ['file'],
    repoRelative: ['as'],
    flags: { as: 'value', content: 'path', all: 'bool', staged: 'bool', range: 'value', worktree: 'bool', json: 'bool' },
  },
  completeness: { summary: 'The files this repository\'s commits show changing with the given ones: call it before considering a change done.', args: ['files...'], repoPaths: ['files'], flags: { json: 'bool' } },
  explain: { summary: 'The full local-to-global convention lattice for one file.', args: ['file'], repoPaths: ['file'], flags: { minbits: 'number', top: 'number' } },
  status: { summary: 'The model overview: size, freshness, health.', args: [], flags: { json: 'bool' } },
  report: { summary: 'The top conventions with their evidence, trends and freshness.', args: [], flags: { top: 'number', json: 'bool' } },
  rules: { summary: 'A Markdown document of the established conventions, answered or written to the file out names.', args: [], flags: { out: 'path', top: 'number' }, writes: 'out' },
  export: { summary: 'The whole mined model as one large JSON document (grain-export/1); prefer grain_map, grain_report or grain_advise when one of them answers.', args: [], flags: { out: 'path', 'max-sites': 'number', compact: 'bool', 'no-anchors': 'bool' }, writes: 'out', stdoutJson: true },
  propose: {
    summary: 'Mine a proposed Yggdrasil graph from the code and full history and write it with its reports to an output directory, never over your own .yggdrasil/.',
    args: ['out-dir?'],
    paths: ['out-dir'],
    flags: {
      full: 'bool',
      json: 'path',
      holdout: 'value',
      scope: 'value',
      'family-candidates': 'path',
      'no-family-candidates': 'bool',
    },
    writes: 'always',
  },
  advise: { summary: 'What history and imports say about the graph the repository already has: finer cuts, and places that change together with nothing connecting them.', args: [], flags: { json: 'bool', graph: 'path' } },
  cochange: {
    summary: 'Which parts of a set change together more often than chance, per file, directory or graph node, or how well a proposed cut into parts holds.',
    args: [],
    repoRelative: ['files'],
    flags: { files: 'value', nodes: 'value', level: 'value', partition: 'value', graph: 'path', runs: 'number', seed: 'number', json: 'bool' },
  },
  measure: {
    summary: 'What the work between two commits did to a territory: its files, the imports inside and across its edge, the undeclared dependencies.',
    args: [],
    flags: { from: 'value', to: 'value', scope: 'value', graph: 'path', json: 'bool' },
  },
  'oracle record': {
    summary: 'Keep the difference between a proposal and the graph you accepted; nothing is written without yes.',
    args: [],
    flags: { proposal: 'path', graph: 'path', name: 'value', out: 'path', yes: 'bool' },
    writes: 'yes',
  },
  'oracle score': { summary: 'Precision and recall of a proposal against the graph you accepted.', args: ['name-or-dir'], pathOrName: ['name-or-dir'], flags: { json: 'bool' } },
  'decide steer': {
    summary: 'Record a maintainer decision that promotes a value repository-wide.',
    args: ['target'],
    repoPaths: ['target'],
    flags: {
      surfaces: 'value',
      'instead-of': 'value',
      weight: 'number',
      topic: 'value',
      author: 'value',
      note: 'value',
    },
    writes: 'always',
  },
  'decide boundary': {
    summary: 'Record an architecture decision: new imports from one path into another are flagged.',
    args: ['from'],
    repoRelative: ['from', 'never-imports'],
    flags: { 'never-imports': 'value', author: 'value', note: 'value' },
    writes: 'always',
  },
  'decide waive': { summary: 'Excuse one scope from one convention, so check calls its departure deliberate.', args: ['target'], repoPaths: ['target'], flags: { on: 'value', author: 'value', note: 'value' }, writes: 'always' },
  'decide list': { summary: 'The maintainer decisions in force.', args: [], flags: {} },
  'decide rm': { summary: 'Withdraw one maintainer decision.', args: ['id'], flags: { author: 'value' }, writes: 'always' },
  selftest: {
    summary: 'How well this repository\'s own model catches planted deviations or predicts past commits (how, where, obligation, extract, null, cochange).',
    args: [],
    flags: {
      how: 'bool',
      where: 'bool',
      obligation: 'bool',
      extract: 'bool',
      null: 'bool',
      cochange: 'bool',
      last: 'number',
      runs: 'number',
      seed: 'number',
      json: 'bool',
    },
  },
  refresh: { summary: 'Rebuild Grain\'s disposable index now; every other tool refreshes it as needed.', args: [], flags: { full: 'bool' } },
  version: { summary: 'The engine, extractor and grammar versions.', args: [], flags: {} },
};

// Other names the CLI answers to: the same command under an older or shorter name. They get no tool of their own.
export const ALIASES = { review: 'check', spectrum: 'explain', seed: 'decide' };

// Commands the host or the developer runs, never an adopter: the hooks and the mutation harness. No usage line, no tool.
export const INTERNAL = {
  'session-context': { flags: { mode: 'value' } },
  'check-hook': { flags: { pre: 'bool' } },
  'edit-hook': { flags: {} },
  'read-hook': { flags: {} },
  'how-hook': { flags: {} },
  'commit-hook': { flags: {} },
  'mutate-test': { flags: {} },
};

// Every flag that takes a value, on any command: the CLI reads the word after it as its value. One set for all
// commands, because a flag may come before the command word (`grain --repo x where …`).
export const VALUE_FLAGS = new Set(
  [GLOBAL_FLAGS, ...Object.values(COMMANDS).map(c => c.flags), ...Object.values(INTERNAL).map(c => c.flags)].flatMap(f =>
    Object.entries(f)
      .filter(([name, kind]) => kind !== 'bool' && !(name === 'json' && kind === 'path'))
      .map(([name]) => name)
  )
);

// `--json` is a bare flag everywhere except where the table gives it a path (`propose --json <path>`).
export const jsonTakesPath = cmd => COMMANDS[cmd]?.flags?.json === 'path';
