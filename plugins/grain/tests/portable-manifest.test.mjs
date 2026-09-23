// Copilot (Agent Plugins 1.0) and Codex read a portable `plugin.json` at the plugin root before any
// host-specific manifest, and with it Copilot takes its hooks from `com.github.copilot/hooks/hooks.json`
// and its MCP servers from `mcp.json`, never from the legacy files. Claude Code and Cursor keep reading
// their own manifests, and an older Copilot still falls back to the legacy root `hooks.json`. So the
// same plugin is described in several files, and this pins them to one another: one name, one version,
// one description, the same Copilot hook in both places, the same MCP server in both configs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => JSON.parse(readFileSync(join(PLUGIN, rel), 'utf8'));

test('the portable manifest names the Agent Plugins schema and agrees with every host manifest', () => {
  const portable = read('plugin.json');
  assert.equal(portable.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  for (const rel of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', '.cursor-plugin/plugin.json']) {
    const host = read(rel);
    for (const field of ['name', 'version', 'description']) {
      assert.equal(portable[field], host[field], `${rel} says a different ${field}`);
    }
  }
  const codex = read('.codex-plugin/plugin.json');
  assert.equal(portable.extensions['com.openai'].hooks, [].concat(codex.hooks)[0], 'Codex must get the same hooks either way');
});

test('Copilot gets the same session hook from the portable layout as from the legacy one', () => {
  assert.deepEqual(read('com.github.copilot/hooks/hooks.json'), read('hooks.json'));
});

test('the portable mcp.json starts the same server as .mcp.json, through the host-neutral plugin root', () => {
  const portable = read('mcp.json');
  assert.equal(portable.$schema, 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
  const a = portable.mcpServers.grain;
  const b = read('.mcp.json').mcpServers.grain;
  assert.equal(a.command, b.command);
  assert.equal(a.args[1], b.args[1], 'the same guard');
  assert.equal(a.args[2], '${PLUGIN_ROOT}/bin/grain-mcp.mjs');
  assert.equal(b.args[2], '${CLAUDE_PLUGIN_ROOT}/bin/grain-mcp.mjs');
});
