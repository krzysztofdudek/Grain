// The Runes release both relation consumers run. Grain vendors Runes at a tag (engine/vendor/runes.pin.json) and
// Yggdrasil installs `@chrisdudek/runes` from npm at an exact version (source/cli/package.json); at a family release
// both must be the same Runes, or an edge in Grain's proposal is not the edge `yg check` sees. This module turns the
// two facts and the branch into a verdict; the seam job (tests/seams.test.mjs, seam 6) acts on it, and
// tests/runes-seam.test.mjs holds every branch of it.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const RUNES_PACKAGE = '@chrisdudek/runes';

/** The Runes version Grain's pin names (`v0.1.0` → `0.1.0`), or null when the pin has no tag yet. */
export function grainRunesVersion(pin) {
  return typeof pin?.tag === 'string' && pin.tag !== '' ? pin.tag.replace(/^v/, '') : null;
}

/** The Runes version a Yggdrasil package.json depends on, as written, or null when it does not depend on Runes. */
export function yggdrasilRunesVersion(pkg) {
  for (const field of ['dependencies', 'peerDependencies', 'devDependencies'])
    if (pkg?.[field]?.[RUNES_PACKAGE]) return String(pkg[field][RUNES_PACKAGE]);
  return null;
}

/** A release branch blocks on a mismatch; any other branch only warns. The ref of a push, or both sides of a PR. */
export function isReleaseRef(env = process.env) {
  return [env.GITHUB_REF_NAME, env.GITHUB_BASE_REF, env.GITHUB_HEAD_REF].some(r => typeof r === 'string' && r.startsWith('release/'));
}

/**
 * { kind: 'skip' | 'match' | 'warn' | 'fail', text }. Yggdrasil without a Runes dependency is a skip with a note,
 * not a pass: there is nothing to compare yet. A spec that is not the exact version Grain pins (a range, another
 * version) is a mismatch.
 */
export function runesSeamVerdict({ grain, yggdrasil, release }) {
  if (grain === null) return { kind: 'fail', text: 'Grain\'s Runes pin names no tag; run scripts/runes.mjs update' };
  if (yggdrasil === null)
    return { kind: 'skip', text: `Yggdrasil does not depend on ${RUNES_PACKAGE} yet, so there is no Runes version to compare with Grain's pin (${grain})` };
  if (yggdrasil === grain) return { kind: 'match', text: `Grain's Runes pin and Yggdrasil's ${RUNES_PACKAGE} are both ${grain}` };
  const text = `Grain vendors Runes ${grain}, but Yggdrasil depends on ${RUNES_PACKAGE} ${yggdrasil}: the two tools would extract relations with different Runes releases`;
  return { kind: release ? 'fail' : 'warn', text };
}

/** Reads both facts from disk: Grain's pin and a Yggdrasil checkout's CLI package.json (null when absent). */
export function readRunesSeam(pinPath, yggDir) {
  const pin = JSON.parse(readFileSync(pinPath, 'utf8'));
  const pkgPath = join(yggDir, 'source', 'cli', 'package.json');
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : null;
  return { grain: grainRunesVersion(pin), yggdrasil: yggdrasilRunesVersion(pkg), havePackage: pkg !== null, pkgPath };
}
