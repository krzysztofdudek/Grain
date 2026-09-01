// J8.1: dispatch ↔ commands ↔ reference audit. There was no prior test enforcing this — this file is new, not an
// extension of an existing one (the ticket that requested it assumed one already existed; it did not). Every
// command `grain.mjs` actually dispatches (its main `switch (cmd)` plus the hook/dev `if (cmd === '…')` guards
// ahead of it) must have EITHER a documented reason to be exempt (a hook, a dev-only harness, or the trivial
// `version`/`help`) or a corresponding `commands/<name>.md` file and a mention in `docs/reference.md`'s command
// table — so a new command added to the dispatcher can never silently ship without a slash-command doc or a
// reference row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(here, '..');
const grainSrc = readFileSync(join(pluginRoot, 'engine', 'grain.mjs'), 'utf8');
const referenceMd = readFileSync(join(pluginRoot, '..', '..', 'docs', 'reference.md'), 'utf8');
const commandsDir = join(pluginRoot, 'commands');

// every `case 'x':` inside grain.mjs's one and only `switch` (the main dispatcher) — confirmed single-switch by
// this test itself, so a second switch added later cannot silently smuggle in unaudited cases
test('grain.mjs has exactly one switch statement (the dispatcher) — this test\'s case-extraction assumes that', () => {
  assert.equal((grainSrc.match(/\bswitch\s*\(/g) || []).length, 1, 'a second switch would need its cases excluded from the dispatch-command extraction below');
});

const switchCases = [...grainSrc.matchAll(/case '([\w-]+)':/g)].map(m => m[1]);
// the hook/dev-only commands handled by `if (cmd === '…')` guards BEFORE the switch is ever reached
const preSwitchCommands = [...grainSrc.matchAll(/if \(cmd === '([\w-]+)'\)/g)].map(m => m[1]);
const dispatchCommands = new Set([...switchCases, ...preSwitchCommands]);

test('sanity: extraction found the commands this file is known to dispatch', () => {
  for (const known of ['where', 'how', 'what', 'map', 'check', 'review', 'decide', 'seed', 'selftest', 'session-context', 'check-hook', 'how-hook'])
    assert.ok(dispatchCommands.has(known), `expected to find "${known}" in the extracted dispatch set — extraction regex may be stale`);
});

// hooks (never a slash command — invoked by the host, not typed), the dev-only mutation harness alias (J0.4:
// `selftest` is its documented, USAGE-listed counterpart), and the two trivial one-liners with no doc of their own
const EXEMPT = new Set(['session-context', 'check-hook', 'edit-hook', 'read-hook', 'how-hook', 'commit-hook', 'mutate-test', 'version', 'help']);
// commands whose canonical doc file is not simply `<name>.md` — `seed` is `decide`'s original name and its own
// doc file is the one-line redirect `steer.md` (naming the `seed add` example in its own frontmatter)
const DOC_FILE = { seed: 'decide.md' }; // seed add lives in steer.md, but add-boundary/list/rm are decide.md's — decide.md is the honest pointer for `seed` as a whole

const commandFiles = new Set(readdirSync(commandsDir).filter(f => f.endsWith('.md')));

for (const cmd of dispatchCommands) {
  if (EXEMPT.has(cmd)) continue;
  test(`commands/ has a doc file for dispatched command "${cmd}"`, () => {
    const file = DOC_FILE[cmd] || `${cmd}.md`;
    assert.ok(commandFiles.has(file), `expected plugins/grain/commands/${file} for dispatch command "${cmd}"`);
  });
  test(`docs/reference.md mentions dispatched command "${cmd}"`, () => {
    assert.ok(referenceMd.includes('`' + cmd) || referenceMd.includes(cmd + ' '),
      `expected docs/reference.md's command table to mention "${cmd}"`);
  });
}

// every command doc file must correspond to something grain.mjs actually dispatches (or be one of the four
// one-line redirects this release introduced, which document an ALIAS name rather than a `case` literal)
const REDIRECT_ONLY = new Set(['review.md', 'spectrum.md', 'steer.md']); // completeness.md deliberately kept as a full, standalone doc — verified still distinct from check/how's `missing:` block, not a stale alias
test('every commands/*.md file names a command grain.mjs actually dispatches', () => {
  const known = new Set([...dispatchCommands].filter(c => !EXEMPT.has(c)));
  for (const file of commandFiles) {
    if (REDIRECT_ONLY.has(file)) continue;
    const name = file.replace(/\.md$/, '');
    assert.ok(known.has(name), `commands/${file} does not correspond to any command grain.mjs dispatches`);
  }
});

// J0.1's voice unification: these exact pre-unification shapes must never reappear in the docs this ticket touched
test('no stale pre-J0.1 voice shapes remain in the docs', () => {
  for (const [path, text] of [
    ['README.md', readFileSync(join(pluginRoot, '..', '..', 'README.md'), 'utf8')],
    ['docs/reference.md', referenceMd],
    ['plugins/grain/skills/grain/SKILL.md', readFileSync(join(pluginRoot, 'skills', 'grain', 'SKILL.md'), 'utf8')],
  ]) {
    for (const stale of ['steer (maintainer decision', 'maintainer decision (', 'history bridge:'])
      assert.ok(!text.includes(stale), `${path} still contains the stale voice shape "${stale}"`);
  }
});

// the four commands this release added no doc for would be a silent regression of J8.1 itself
test('the six new J8.1 command docs exist', () => {
  for (const f of ['what.md', 'how.md', 'decide.md', 'explain.md', 'map.md', 'selftest.md'])
    assert.ok(existsSync(join(commandsDir, f)), `expected plugins/grain/commands/${f}`);
});

// docs/validation.md's suite-size line is a MEASUREMENT, so it goes stale on any ticket that adds a test — it has
// already shipped stale twice (1449 while the suite was 1721, then 1721 while it was 1767). The count itself
// cannot be checked from inside the suite without running the suite, so what is pinned here is the part that can
// be: the claim is anchored to an engine version, and that version must be the CURRENT one. A count carried
// forward across a release bump is the failure that actually misleads — a count drifting by a few within a
// release is visibly scoped by the version it names.
test('docs/validation.md states its test count against the current engine version', () => {
  const validationMd = readFileSync(join(pluginRoot, '..', '..', 'docs', 'validation.md'), 'utf8');
  const engineVersion = /ENGINE_VERSION\s*=\s*'([^']+)'/.exec(
    readFileSync(join(pluginRoot, 'engine', 'config.mjs'), 'utf8'))?.[1];
  assert.ok(engineVersion, 'could not read ENGINE_VERSION from config.mjs — this test\'s extraction is stale');
  const claim = /\((\d[\d,]*) tests under engine ([\d.]+)/.exec(validationMd);
  assert.ok(claim, 'docs/validation.md no longer carries a "(N tests under engine X" claim — if the count was ' +
    'deliberately removed, delete this test with it; if it was reworded, update the pattern');
  assert.equal(claim[2], engineVersion,
    `docs/validation.md reports its test count as measured under engine ${claim[2]}, but the engine is now ` +
    `${engineVersion} — re-run the suite and update the count, or the number is a claim about a past release`);
});
