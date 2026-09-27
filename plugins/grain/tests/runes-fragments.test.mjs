// SKILL.md carries the shared Runes skill fragment `mcp-first` between its RUNES markers, pinned in
// engine/vendor/runes.pin.json beside the vendored code. `npm test` runs the offline check first; these tests prove
// that check turns red on a hand edit inside the block and stays green on an edit around it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeTemp } from './remove-temp.mjs';

const PLUGIN = fileURLToPath(new URL('..', import.meta.url));
const check = plugin =>
  spawnSync(process.execPath, [join(plugin, 'scripts', 'runes.mjs'), 'check', '--offline', '--pin', join(plugin, 'engine', 'vendor', 'runes.pin.json')], { encoding: 'utf8' });

const tmps = [];
after(() => {
  for (const d of tmps) removeTemp(d);
});

// A throwaway repository holding what the pin covers, at the same paths: the copy, the tool and SKILL.md.
function copyOfPlugin() {
  const repo = mkdtempSync(join(tmpdir(), 'grain-runes-'));
  tmps.push(repo);
  mkdirSync(join(repo, '.git'));
  const plugin = join(repo, 'plugins', 'grain');
  cpSync(join(PLUGIN, 'engine', 'vendor'), join(plugin, 'engine', 'vendor'), { recursive: true });
  mkdirSync(join(plugin, 'scripts'), { recursive: true });
  cpSync(join(PLUGIN, 'scripts', 'runes.mjs'), join(plugin, 'scripts', 'runes.mjs'));
  mkdirSync(join(plugin, 'skills', 'grain'), { recursive: true });
  cpSync(join(PLUGIN, 'skills', 'grain', 'SKILL.md'), join(plugin, 'skills', 'grain', 'SKILL.md'));
  return plugin;
}

test('the pin carries the mcp-first fragment, placed once in SKILL.md, and the check passes', () => {
  const pin = JSON.parse(readFileSync(join(PLUGIN, 'engine', 'vendor', 'runes.pin.json'), 'utf8'));
  assert.deepEqual(pin.fragments.map(f => [f.name, f.target]), [['mcp-first', '../../skills/grain/SKILL.md']]);
  const skill = readFileSync(join(PLUGIN, 'skills', 'grain', 'SKILL.md'), 'utf8');
  for (const edge of ['START', 'END']) assert.equal(skill.split(`<!-- RUNES:mcp-first:${edge} -->`).length, 2, edge);
  const r = check(PLUGIN);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1 skill fragments and the tool match/);
});

test('a hand edit inside the block turns the check red and names the fragment', () => {
  const plugin = copyOfPlugin();
  const path = join(plugin, 'skills', 'grain', 'SKILL.md');
  const text = readFileSync(path, 'utf8');
  const edited = text.replace('**The CLI is the fallback.**', '**The CLI comes first.**');
  assert.notEqual(edited, text);
  writeFileSync(path, edited);
  const r = check(plugin);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stderr, /fragment mcp-first in \.\.\/\.\.\/skills\/grain\/SKILL\.md: the block between the markers differs/);
});

test('an edit around the block leaves the check green', () => {
  const plugin = copyOfPlugin();
  const path = join(plugin, 'skills', 'grain', 'SKILL.md');
  const text = readFileSync(path, 'utf8');
  const edited = text.replace("**grain's server.**", "**The grain server.**");
  assert.notEqual(edited, text);
  writeFileSync(path, edited);
  assert.equal(check(plugin).status, 0);
});
