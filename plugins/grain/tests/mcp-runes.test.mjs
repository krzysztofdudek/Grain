// The MCP server stands on the family's one adapter, @chrisdudek/runes/mcp (vendored under engine/vendor/runes/). These
// tests hold it there with the adapter's own test kit: parity between the command table, the usage text and the tools
// the running server lists (assertParity), and the size of that list against the family's budget (measureTools) — a
// number reported on every run and a warning when over, never a failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertParity, parityProblems } from '../engine/vendor/runes/dist/testkit/parity.mjs';
import { measureTools, formatToolsMeasure } from '../engine/vendor/runes/dist/testkit/measure.mjs';
import { listToolsOverStdio } from '../engine/vendor/runes/dist/testkit/client.mjs';
import { COMMANDS } from '../engine/grain-commands.mjs';
import { USAGE } from '../engine/grain-usage.mjs';
import * as mcp from '../bin/grain-mcp.mjs';

const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain-mcp.mjs');
const listed = await listToolsOverStdio({ command: process.execPath, args: [SERVER] });

test('parity (Runes testkit): the table, the usage text and the tools the running server lists say the same thing', () => {
  assertParity({ table: mcp.TABLE, usage: USAGE, tools: listed, toolOptions: mcp.TOOL_OPTIONS });
});

test('parity (Runes testkit): a tool that loses a field, or a command with no tool, is caught', () => {
  const lost = listed.map(t => {
    if (t.name !== 'grain_where') return t;
    const { top, ...properties } = t.inputSchema.properties;
    return { ...t, inputSchema: { ...t.inputSchema, properties } };
  });
  assert.match(parityProblems({ table: mcp.TABLE, tools: lost, toolOptions: mcp.TOOL_OPTIONS }).join('\n'), /tool grain_where lacks "top"/);
  const fewer = listed.filter(t => t.name !== 'grain_decide_rm');
  assert.match(parityProblems({ table: mcp.TABLE, tools: fewer, toolOptions: mcp.TOOL_OPTIONS }).join('\n'), /command "decide rm" has no tool grain_decide_rm/);
});

test("the table is the CLI's: every command, and the server lists exactly the tools buildTools generates", () => {
  assert.deepEqual(Object.keys(mcp.TABLE.commands).sort(), Object.keys(COMMANDS).sort());
  assert.deepEqual(listed, JSON.parse(JSON.stringify(mcp.buildTools())));
});

test('budget step 1: a tool description is what it writes, one sentence, and the CLI command; the full usage is grain_help', async () => {
  for (const t of listed) {
    if (t.name === 'grain_help') continue;
    const cmd = Object.keys(COMMANDS).find(c => mcp.toolName(c) === t.name);
    assert.ok(t.description.endsWith(` CLI: grain ${cmd}.`), t.description);
    assert.equal(t.description.slice(0, -` CLI: grain ${cmd}.`.length).replace(/^(WRITES [^.]*\.|Read-only\.) /, ''), COMMANDS[cmd].summary, t.name);
    assert.ok(COMMANDS[cmd].summary.split(/(?<=[.!?])\s+(?=[A-Z])/).length === 1, `${cmd}: one sentence`);
  }
  const help = await mcp.callTool('grain_help', {});
  assert.ok(help.content[0].text.startsWith(USAGE), 'grain_help answers with the usage text');
  assert.match(help.content[0].text, /grain_completeness: .*grain-completeness\/1/, 'and with what a JSON answer holds');
});

test('a number field takes a number or its text; anything else is refused before the CLI runs', () => {
  assert.deepEqual(mcp.argvFor('report', { top: 5 }), ['report', '--top=5']);
  assert.throws(() => mcp.argvFor('report', { top: 'many' }), e => e.code === -32602 && /"top" must be a number/.test(e.message));
});

test('tools/list is measured against the budget (8.5k tokens per server): reported, a warning when over, never a failure', t => {
  const m = measureTools(listed, { label: 'grain tools/list' });
  const line = formatToolsMeasure(m, 'grain tools/list');
  t.diagnostic(line);
  if (m.over) process.emitWarning(line, { code: 'RUNES_TOOLS_BUDGET' });
  if (m.over && process.env.GITHUB_ACTIONS) console.log(`::warning title=MCP tools/list budget::${line}`);
  assert.ok(m.tokens > 0 && m.perTool.length === listed.length);
});
