// grain engine · query surface · the command table: every command, its arguments and its flags, in one place.
//
// The CLI parses from it (which flags take a value) and the MCP server builds its tools from it, one tool per command
// and one field per argument and flag under the same name, so the two can never offer different surfaces. The usage
// text (grain-usage.mjs) stays hand-written; tests/mcp-server.test.mjs holds the two together in both directions.
//
// A flag is 'bool' (bare), 'value' (takes the next word) or 'path' (takes a file or directory the command resolves
// against the working directory — the MCP server refuses a relative one, since it does not run in the caller's
// directory). An argument is its name, with `?` when it may be left out and `...` when it takes one or more words.
// `repoPaths` names the arguments that are paths inside the repository (resolved against its root, so a relative one
// is fine everywhere); `paths` the arguments resolved against the working directory, like a 'path' flag; `pathOrName`
// an argument that is either a bare name or such a path. `writes` says what a command writes beyond Grain's disposable index: 'always', or the flag whose
// presence makes it write.

export const GLOBAL_FLAGS = { repo: 'path', 'no-refresh': 'bool', 'no-history': 'bool' };

export const COMMANDS = {
  where: { args: ['query'], flags: { top: 'value', 'map-rows': 'value', json: 'bool' } },
  how: { args: ['query'], flags: { top: 'value', json: 'bool' } },
  what: { args: ['query'], flags: { json: 'bool' } },
  map: { args: [], flags: { json: 'bool' } },
  obligation: { args: ['path'], repoPaths: ['path'], flags: { top: 'value', json: 'bool' } },
  check: {
    args: ['file?'],
    repoPaths: ['file'],
    flags: { as: 'value', content: 'path', all: 'bool', staged: 'bool', range: 'value', worktree: 'bool', json: 'bool' },
  },
  completeness: { args: ['files...'], repoPaths: ['files'], flags: {} },
  explain: { args: ['file'], repoPaths: ['file'], flags: { minbits: 'value', top: 'value' } },
  status: { args: [], flags: { json: 'bool' } },
  report: { args: [], flags: { top: 'value', json: 'bool' } },
  rules: { args: [], flags: { out: 'path', top: 'value' }, writes: 'out' },
  export: { args: [], flags: { out: 'path', 'max-sites': 'value', compact: 'bool', 'no-anchors': 'bool' }, writes: 'out' },
  propose: {
    args: ['out-dir?'],
    paths: ['out-dir'],
    flags: {
      full: 'bool',
      json: 'path',
      holdout: 'value',
      'family-candidates': 'path',
      'no-family-candidates': 'bool',
    },
    writes: 'always',
  },
  advise: { args: [], flags: { json: 'bool', graph: 'path' } },
  'oracle record': {
    args: [],
    flags: { proposal: 'path', graph: 'path', name: 'value', out: 'path', yes: 'bool' },
    writes: 'yes',
  },
  'oracle score': { args: ['name-or-dir'], pathOrName: ['name-or-dir'], flags: { json: 'bool' } },
  'decide steer': {
    args: ['target'],
    flags: {
      surfaces: 'value',
      'instead-of': 'value',
      weight: 'value',
      topic: 'value',
      author: 'value',
      note: 'value',
    },
    writes: 'always',
  },
  'decide boundary': {
    args: ['from'],
    flags: { 'never-imports': 'value', author: 'value', note: 'value' },
    writes: 'always',
  },
  'decide waive': { args: ['target'], flags: { on: 'value', author: 'value', note: 'value' }, writes: 'always' },
  'decide list': { args: [], flags: {} },
  'decide rm': { args: ['id'], flags: { author: 'value' }, writes: 'always' },
  selftest: {
    args: [],
    flags: {
      how: 'bool',
      where: 'bool',
      obligation: 'bool',
      extract: 'bool',
      null: 'bool',
      cochange: 'bool',
      last: 'value',
      runs: 'value',
      seed: 'value',
      json: 'bool',
    },
  },
  refresh: { args: [], flags: { full: 'bool' } },
  version: { args: [], flags: {} },
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
