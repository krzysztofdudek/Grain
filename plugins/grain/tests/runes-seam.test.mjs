// Every branch of the Runes seam verdict (tests/runes-seam.mjs), without a Yggdrasil checkout: the seam job is the
// only place the real comparison runs, so the decision it acts on is held here, where every run of the suite sees it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { grainRunesVersion, yggdrasilRunesVersion, isReleaseRef, runesSeamVerdict, readRunesSeam } from './runes-seam.mjs';

const PIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'engine', 'vendor', 'runes.pin.json');

test('the versions are read from the pin tag and from any dependency field of Yggdrasil\'s package.json', () => {
  assert.equal(grainRunesVersion({ tag: 'v0.1.0' }), '0.1.0');
  assert.equal(grainRunesVersion({}), null);
  assert.equal(yggdrasilRunesVersion({ dependencies: { '@chrisdudek/runes': '0.1.0' } }), '0.1.0');
  assert.equal(yggdrasilRunesVersion({ dependencies: { 'web-tree-sitter': '0.27.0' } }), null);
  assert.equal(yggdrasilRunesVersion(null), null);
});

test('a release branch is the pushed ref or either side of a pull request', () => {
  assert.equal(isReleaseRef({ GITHUB_REF_NAME: 'release/6.1.0' }), true);
  assert.equal(isReleaseRef({ GITHUB_REF_NAME: '12/merge', GITHUB_BASE_REF: 'release/6.1.0', GITHUB_HEAD_REF: 'jarl/470-runes' }), true);
  assert.equal(isReleaseRef({ GITHUB_REF_NAME: 'main' }), false);
  assert.equal(isReleaseRef({}), false);
});

test('no Runes dependency in Yggdrasil skips with a note; the same version matches', () => {
  assert.equal(runesSeamVerdict({ grain: '0.1.0', yggdrasil: null, release: true }).kind, 'skip');
  assert.equal(runesSeamVerdict({ grain: '0.1.0', yggdrasil: '0.1.0', release: true }).kind, 'match');
});

test('a mismatch warns on a working branch and fails on a release branch, a range included', () => {
  assert.equal(runesSeamVerdict({ grain: '0.1.0', yggdrasil: '0.2.0', release: false }).kind, 'warn');
  assert.equal(runesSeamVerdict({ grain: '0.1.0', yggdrasil: '0.2.0', release: true }).kind, 'fail');
  assert.equal(runesSeamVerdict({ grain: '0.1.0', yggdrasil: '^0.1.0', release: true }).kind, 'fail');
  assert.equal(runesSeamVerdict({ grain: null, yggdrasil: '0.1.0', release: false }).kind, 'fail');
});

test('Grain\'s own pin names a tag', () => {
  assert.match(readRunesSeam(PIN, '/nonexistent').grain ?? '', /^\d+\.\d+\.\d+/);
});
