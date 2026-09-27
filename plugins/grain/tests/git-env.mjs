// Loaded before every test file (`node --import ./tests/git-env.mjs --test …`: package.json's `test` script and CI's
// direct `node --test` lines), so every git a test runs inherits it — the git that builds a fixture, and every git
// the grain CLI under test runs in turn.
//
// Why (issue 409): a `git commit` starts `git maintenance run --auto` DETACHED, and with git 2.55 that background
// run packs a fixture's loose objects while the fixture is still being built (the advise fixture: 35 commits in a
// tight loop, packed in the background on every build). Packing prunes the loose copies and removes each emptied
// `objects/xx` directory, so the next `git add` in the loop can find `objects/xx` gone, create it, and lose it again
// before it writes into it: "error: unable to create temporary file: No such file or directory". Reproduced under
// git 2.55 with parallel builds; never with maintenance off. A fixture is written, then read — background
// housekeeping on it can only race with the test, so it is off for every repository the suite touches. Environment
// config (GIT_CONFIG_COUNT/KEY/VALUE) outranks every config file, and a test that points HOME at a temporary
// directory keeps it too.
const settings = { 'maintenance.auto': 'false', 'gc.auto': '0' };
const count = Number(process.env.GIT_CONFIG_COUNT) || 0;
const present = new Set(Array.from({ length: count }, (_, i) => process.env[`GIT_CONFIG_KEY_${i}`]));
let n = count;
for (const [key, value] of Object.entries(settings)) {
  if (present.has(key)) continue; // the test runner's own process loaded this already, and its children inherit it
  process.env[`GIT_CONFIG_KEY_${n}`] = key;
  process.env[`GIT_CONFIG_VALUE_${n}`] = value;
  n++;
}
process.env.GIT_CONFIG_COUNT = String(n);
