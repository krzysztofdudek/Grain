// Every place a host starts Grain goes through one guard: the host substitutes the plugin's own
// directory into the command, and when that directory is a path from somewhere else — a VS Code
// session attached to a dev container hands the container the HOST's install path — `node <path>`
// used to die with MODULE_NOT_FOUND on every session start, command and MCP launch. The guard checks
// the file exists; if not, it says so on one stderr line and exits 0, and if it does, it runs Grain
// with the same arguments and exit code as calling it directly. It is written as `node -e` rather
// than a shell `if`, because the slash commands only allow `Bash(node:*)`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARD_RE = /^node -e ("(?:[^"\\]|\\.)*") "\$\{(?:CLAUDE_|CURSOR_)?PLUGIN_ROOT\}\/bin\/[\w-]+\.mjs"/;

function hookCommands(file) {
  const out = [];
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if ((k === 'command' || k === 'bash') && typeof v === 'string') out.push(v);
        else walk(v);
      }
    }
  };
  walk(JSON.parse(readFileSync(join(PLUGIN, file), 'utf8')));
  return out;
}

function everySite() {
  const sites = [];
  for (const f of ['hooks.json', 'hooks/hooks.json', 'hooks/codex-hooks.json', 'hooks/cursor-hooks.json']) {
    for (const c of hookCommands(f)) sites.push({ where: f, cmd: c });
  }
  for (const f of readdirSync(join(PLUGIN, 'commands')).filter((n) => n.endsWith('.md'))) {
    for (const m of readFileSync(join(PLUGIN, 'commands', f), 'utf8').matchAll(/!`([^`]*grain\.mjs[^`]*)`/g)) sites.push({ where: `commands/${f}`, cmd: m[1] });
  }
  return sites;
}

const GUARD_BODY = JSON.parse(readFileSync(join(PLUGIN, '.mcp.json'), 'utf8')).mcpServers.grain.args[1];

test('every hook, every slash command and the MCP server start Grain through the one guard', () => {
  const sites = everySite();
  assert.ok(sites.length >= 20, `found ${sites.length} launch sites`);
  for (const s of sites) {
    const m = GUARD_RE.exec(s.cmd);
    assert.ok(m, `${s.where} starts Grain without the guard: ${s.cmd.slice(0, 80)}`);
    assert.equal(JSON.parse(m[1]), GUARD_BODY, `${s.where} carries a different guard than the MCP server`);
  }
  const mcp = JSON.parse(readFileSync(join(PLUGIN, '.mcp.json'), 'utf8')).mcpServers.grain;
  assert.equal(mcp.command, 'node');
  assert.equal(mcp.args[0], '-e');
  assert.equal(mcp.args[2], '${CLAUDE_PLUGIN_ROOT}/bin/grain-mcp.mjs');
});

test('a plugin directory that is not there: exit 0 and one stderr line, not a crash', () => {
  const r = spawnSync(process.execPath, ['-e', GUARD_BODY, '/no/such/host/path/bin/grain.mjs', 'session-context', '--mode', 'copilot'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
  const lines = r.stderr.trim().split('\n');
  assert.equal(lines.length, 1, r.stderr);
  assert.match(lines[0], /^grain: \/no\/such\/host\/path\/bin\/grain\.mjs is not reachable from this environment/);
  assert.doesNotMatch(r.stderr, /MODULE_NOT_FOUND/);
});

test('a plugin directory that is there: the same output and exit code as calling Grain directly', () => {
  const bin = join(PLUGIN, 'bin', 'grain.mjs');
  for (const args of [['--help'], ['no-such-command']]) {
    const direct = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
    const guarded = spawnSync(process.execPath, ['-e', GUARD_BODY, bin, ...args], { encoding: 'utf8' });
    assert.equal(guarded.status, direct.status, `exit code for ${args.join(' ')}`);
    assert.equal(guarded.stdout, direct.stdout, `stdout for ${args.join(' ')}`);
  }
});
