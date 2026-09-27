// The skill sends the agent to the MCP tools (grain_where, grain_check, …), with the CLI kept to one closing section
// for a session that has no tools. The tools are generated from the command table (bin/grain-mcp.mjs), so the skill
// can drift from them silently: a renamed command, a field the tool never had, a tool nobody is told about. These
// tests hold SKILL.md to the generated tool set in both directions, and hold every field it writes down to the
// tool's own schema.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTools } from '../bin/grain-mcp.mjs';

const SKILL = readFileSync(new URL('../skills/grain/SKILL.md', import.meta.url), 'utf8');
const TOOLS = Object.fromEntries(buildTools().map(t => [t.name, t]));
const CLI_HEADING = '## The CLI, when the tools are not there';
const named = text => new Set([...text.matchAll(/\bgrain_[a-z][a-z_]*[a-z]\b/g)].map(m => m[0]));

test('every grain_* name in SKILL.md is a tool the server offers', () => {
  const unknown = [...named(SKILL)].filter(n => !TOOLS[n]);
  assert.deepEqual(unknown, [], `SKILL.md names tools the server does not have: ${unknown.join(', ')}`);
});

test('SKILL.md names every tool the server offers, before the CLI section', () => {
  const body = SKILL.slice(0, SKILL.indexOf(CLI_HEADING));
  const missing = Object.keys(TOOLS).filter(n => !named(body).has(n));
  assert.deepEqual(missing, [], `SKILL.md never names these tools: ${missing.join(', ')}`);
});

test('every field SKILL.md passes to a tool is one of its fields, and a call written out gives its required ones', () => {
  let calls = 0;
  let lists = 0;
  // a call written out: grain_x { field: "…", other: [ … ] } — keys read after dropping the quoted values
  for (const m of SKILL.matchAll(/\b(grain_[a-z_]+) \{([^}]*)\}/g)) {
    const [, name, body] = m;
    const schema = TOOLS[name]?.inputSchema;
    assert.ok(schema, `${m[0]}: no such tool`);
    const keys = [...body.replace(/"[^"]*"/g, '""').matchAll(/([a-z][a-z-]*):/g)].map(k => k[1]);
    assert.ok(keys.length, `${m[0]}: a call with no field`);
    for (const k of keys) assert.ok(schema.properties[k], `${m[0]}: ${name} has no field "${k}"`);
    for (const r of schema.required || []) assert.ok(keys.includes(r), `${m[0]}: leaves out the required "${r}"`);
    calls++;
  }
  // the fields listed after a tool's name: **`grain_x`** (`a`, `b`)
  for (const m of SKILL.matchAll(/`(grain_[a-z_]+)`\*\* \(([^)]*)\)/g)) {
    const [, name, list] = m;
    for (const [, f] of list.matchAll(/`([a-z][a-z-]*)`/g)) assert.ok(TOOLS[name].inputSchema.properties[f], `${m[0]}: ${name} has no field "${f}"`);
    lists++;
  }
  assert.ok(calls >= 10 && lists >= 5, `read ${calls} written-out calls and ${lists} field lists from SKILL.md`);
});

test('the argument fields SKILL.md lists are every tool argument there is', () => {
  const line = SKILL.split('\n').find(l => l.startsWith('- each argument under its name:'));
  assert.ok(line, 'SKILL.md has the line listing the argument fields');
  for (const [name, t] of Object.entries(TOOLS))
    for (const r of t.inputSchema.required || []) assert.ok(line.includes(`\`${r}\``) && line.includes(`\`${name}\``), `the argument "${r}" of ${name} is not on the line`);
});

test('the CLI appears only in its own closing section, and the skill opens with the tools', () => {
  const at = SKILL.indexOf(CLI_HEADING);
  assert.ok(at > 0, `SKILL.md has the section "${CLI_HEADING}"`);
  assert.equal(SKILL.slice(at + CLI_HEADING.length).match(/^## /m), null, 'it is the last section');
  const before = SKILL.slice(0, at);
  assert.doesNotMatch(before, /bin\/grain\.mjs/, 'no CLI invocation before that section');
  assert.match(SKILL.slice(at), /node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/grain\.mjs" <command>/);
  assert.ok(before.indexOf('## Call it through its MCP tools') < before.indexOf('## Four questions'), 'the tools come first');
});
