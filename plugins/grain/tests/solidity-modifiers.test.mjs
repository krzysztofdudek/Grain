// Issue 043 — Solidity modifiers (`onlyOwner`, `nonReentrant`, `onlyRole`) were not modelled at all, so the one
// command whose job is to catch a missing access-control idiom passed the edit clean. Modifiers are Solidity's
// decorator equivalent, and grain already weights decorators as a heavy clustering signal.
//
// The grammar's own view, which decides the shape of the fix. tree-sitter-solidity DOES expose a modifier
// invocation structurally — `function_definition` declares `modifier_invocation` among its own non-field
// children — but as a node type with NO fields of its own:
//
//   modifier_invocation   named=true   fields={}   children=[call_argument, identifier]
//
// So the strictly field-driven route `b.scope`/`b.retField`/`b.namedValueSpec` take is unavailable, and the
// node-type-NAME vocabulary that fills `b.deco` (`/decorator|annotation|attribute_list/`) does not match it
// either. The derivation used instead reads the node's SHAPE off node-types.json: a decoration is a named,
// field-less node type that a scope declares among its own non-field children, is not already read as heritage,
// and whose own declared children include BOTH a name-shaped type and a call/argument-shaped one — "apply this
// named thing, with arguments, to this declaration". The conjunction is what carries the rule: it admits
// `modifier_invocation` while rejecting every neighbour sharing that position — a heritage list (names, no
// arguments), a bare keyword (`virtual`, `visibility`), a type constraint, and an argument list with nothing
// named (C#'s `constructor_initializer`, C/C++'s `attribute_specifier`).
//
// Second half of the fix: a Solidity modifier is written with no sigil, and `take()` in `extractScopes` only
// accepted text starting with `@` or `[`. The sigil-less spelling is admitted only for the structurally-derived
// node types (`b.decoBare`), because the node-type-name vocabulary matches only constructs every shipped grammar
// writes WITH a sigil, and reading bare text for those swallows a modifier keyword that shares the node type's
// name — measured: Kotlin's `annotation` in `annotation class Foo` became a decoration called `annotation`.
// `no_other_grammar_gains_a_decoration` and the Kotlin guard below pin both halves.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getParser, extractScopes, bindingFor } from '../engine/core.mjs';
import { GRAMMARS, GRAMMAR_DIR } from '../engine/config.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');

const scopesOf = async (ext, src) => {
  const p = await getParser(ext); const g = p._g; const b = bindingFor(g);
  const t = p.parse(src); const out = extractScopes('f' + ext, t, b, g).filter(s => s.kind !== 'file')
    .map(s => ({ kind: s.kind, name: s.name, decos: s.decos })); t.delete(); return out; };

// ---- the derivation, held to every shipped grammar ----
test('043: the decoration derivation adds `modifier_invocation` to Solidity and nothing to any other grammar', () => {
  // The pre-existing node-type-NAME vocabulary, replayed here so the test measures what the DERIVATION added
  // rather than restating the union.
  const byName = new Set();
  const added = {};
  for (const g of GRAMMARS) {
    const nt = JSON.parse(readFileSync(join(GRAMMAR_DIR, `tree-sitter-${g}.node-types.json`), 'utf8'));
    for (const n of nt) if (/decorator|annotation|attribute_list/.test(n.type)) byName.add(g + '/' + n.type);
    const extra = [...bindingFor(g).deco].filter(t => !byName.has(g + '/' + t)).sort();
    if (extra.length) added[g] = extra;
  }
  assert.deepEqual(added, { solidity: ['modifier_invocation'] });
});

test('043: only the structurally-derived node types accept a sigil-less spelling', () => {
  const bare = {};
  for (const g of GRAMMARS) { const s = [...bindingFor(g).decoBare].sort(); if (s.length) bare[g] = s; }
  assert.deepEqual(bare, { solidity: ['modifier_invocation'] });
});

// ---- extraction ----
test('043: a function carrying a modifier records it as a decoration, arguments and all', async () => {
  const got = await scopesOf('.sol', `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Ownable {
    modifier onlyOwner() { _; }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        _transferOwnership(newOwner);
    }

    function grant(bytes32 role) public virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        _grant(role);
    }

    function _transferOwnership(address newOwner) internal virtual {
        _owner = newOwner;
    }
}
`);
  assert.deepEqual(got, [
    { kind: 'type', name: 'Ownable', decos: [] },
    { kind: 'method', name: 'onlyOwner', decos: [] },
    { kind: 'method', name: 'transferOwnership', decos: ['onlyOwner'] },
    { kind: 'method', name: 'grant', decos: ['onlyRole'] },       // applied WITH arguments; the name is the decoration
    { kind: 'method', name: '_transferOwnership', decos: [] }]);  // the internal helper genuinely carries none
});

test('043: the modifier is never confused with the heritage clause that sits beside it', async () => {
  const got = await scopesOf('.sol', `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Vault is Ownable, Pausable {
    function pull() public virtual onlyOwner { _pull(); }
}
`);
  assert.deepEqual(got.map(s => s.decos), [[], ['onlyOwner']]);
});

// ---- the regression the sigil-less branch could have caused ----
test('043: Kotlin\'s `annotation class` modifier keyword is not read as a decoration', async () => {
  const got = await scopesOf('.kt', `@Retention(BINARY)
@Target(CLASS)
internal annotation class SuppressSignatureCheck
`);
  assert.deepEqual(got, [{ kind: 'type', name: 'SuppressSignatureCheck', decos: ['Target', 'Retention'] }]);
});

test('043: a TypeScript type annotation is still not a decoration', async () => {
  const got = await scopesOf('.ts', '@Injectable()\nexport class S { run(x: string): number { return 1; } }\n');
  assert.deepEqual(got, [
    { kind: 'type', name: 'S', decos: ['Injectable'] },
    { kind: 'method', name: 'run', decos: [] }]);
});

// ---- end to end: the convention is learnable, and the omission is flagged ----
// A repository of guarded setters, all carrying `onlyGuard`, with a scripted backdated history so they are
// established by HEAD; the modifier and the internal helper live in a base contract in their own directory, so
// contracts/vault/ holds nothing but the guarded setters. The planted edit is the ticket's own: a peer of those
// setters, same body, same name stem, that OMITS the modifier.
let tmp, repo;
const H = '// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\n';
const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'];
const meters = ['Amp', 'Volt', 'Ohm', 'Watt', 'Farad', 'Henry'];
const setter = (c, k) => `
    function set${c}Target${k}(address target) public virtual onlyGuard {
        _store(target, ${k});
        emit TargetChanged(target);
    }
`;
const vault = (c, extra = '') => H + `import {GuardBase} from "../base/GuardBase.sol";

contract ${c}Vault is GuardBase {
${[0, 1, 2, 3, 4].map(k => setter(c, k)).join('')}${extra}}
`;
const meter = m => H + `contract ${m}Meter {
    uint256 private _reading;
${[0, 1, 2, 3, 4].map(k => `
    function read${m}${k}() public view virtual returns (uint256) {
        uint256 v = _reading + ${k};
        return v;
    }
`).join('')}}
`;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-sol-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  const env = { ...process.env, GIT_AUTHOR_NAME: 'F', GIT_AUTHOR_EMAIL: 'f@x', GIT_COMMITTER_NAME: 'F', GIT_COMMITTER_EMAIL: 'f@x', TZ: 'UTC', HOME: repo };
  const g = (a, x = {}) => execFileSync('git', ['-C', repo, ...a], { env: { ...env, ...x }, stdio: ['ignore', 'pipe', 'pipe'] });
  const w = (rel, c) => { const p = join(repo, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, c); };
  let day = 0; const T0 = Date.UTC(2024, 0, 15, 12, 0, 0);
  const commit = (m) => { day += 60; const d = new Date(T0 + day * 86400000).toISOString();
    g(['add', '-A']); g(['commit', '-q', '-m', m], { GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d }); };
  g(['init', '-q', '-b', 'main']); g(['config', 'commit.gpgsign', 'false']);
  w('contracts/base/GuardBase.sol', H + `contract GuardBase {
    address internal _guard;
    event TargetChanged(address target);
    error NotGuard();

    modifier onlyGuard() {
        if (msg.sender != _guard) { revert NotGuard(); }
        _;
    }

    function _store(address target, uint256 slot) internal virtual {
        _guard = target;
    }
}
`);
  for (const [a, b] of [[0, 2], [2, 5], [5, 8]]) {
    for (const n of names.slice(a, b)) w(`contracts/vault/${n}Vault.sol`, vault(n));
    for (const m of meters.slice(a, b)) w(`contracts/meter/${m}Meter.sol`, meter(m));
    commit('feat: wave'); }
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' });
  assert.equal(st.status, 0, st.stdout + st.stderr);
});
after(() => rmSync(tmp, { recursive: true, force: true }));

test('043: the modifier certifies as a convention of its own', () => {
  const model = JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));
  const facts = model.partitions.flatMap(p => p.facts);
  // §048: Solidity has no `@` sigil at all, so the pid and every rendering of it stay bare — `onlyGuard`, not `@onlyGuard`.
  const f = facts.find(x => x.pid === 'auto.deco:onlyGuard' && x.exp === 'true');
  assert.ok(f, `no accepted onlyGuard convention: ${JSON.stringify(facts.map(x => x.pid))}`);
  assert.equal(f.share, 1);
  assert.ok(f.sraw >= 5, `population too small to be a convention: ${f.sraw}`);
});

// ---- §048: no other surface reconstructs an `@` this language never had ----
// `what` was checked too (the ticket names it alongside check/rules) but never renders a decoration label at all
// — its answer shape is defined/values/spread/siblings/changes/usedBy/testedBy/referenced, none of them a
// convention sentence — so it has no surface for this bug either way; verified by probing it directly with the
// pre-fix `decoLabel` still reinstated, which left `what onlyGuard`'s output unchanged. `where`'s marker card
// (buildCards' `label`/`mpid`, §048) is the one other real surface, so it is exercised here instead.
test("048: `where onlyGuard` names the marker bare, never as a fabricated `@onlyGuard`", () => {
  const r = spawnSync('node', [BIN, 'where', 'onlyGuard'], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /marker onlyGuard — \d+ carriers/, r.stdout);
  assert.match(r.stdout, /methods here are annotated with `onlyGuard`/, r.stdout);
  assert.doesNotMatch(r.stdout, /@onlyGuard/, r.stdout);
});

test('048: `grain rules` documents the modifier bare, never as a fabricated `@onlyGuard`', () => {
  const r = spawnSync('node', [BIN, 'rules', '--top', '40'], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /methods here are annotated with `onlyGuard`/, r.stdout);
  assert.doesNotMatch(r.stdout, /@onlyGuard/, r.stdout);
});

test('043: a peer that omits the modifier is flagged by check, and by review', () => {
  // planted as an uncommitted edit — the shape `check`/`review` are made to catch
  const f = join(repo, 'contracts/vault/AlphaVault.sol');
  const anchor = setter('Alpha', 4);
  const src = readFileSync(f, 'utf8');
  assert.ok(src.includes(anchor));
  writeFileSync(f, src.replace(anchor, anchor + `
    function setAlphaTargetEmergency(address target) public virtual {
        _store(target, 9);
        emit TargetChanged(target);
    }
`));
  const chk = spawnSync('node', [BIN, 'check', 'contracts/vault/AlphaVault.sol'], { cwd: repo, encoding: 'utf8' });
  assert.equal(chk.status, 0, chk.stderr);
  assert.match(chk.stdout, /1 known deviation\(s\) in your change/, chk.stdout);
  // §048: no `@` — Solidity modifiers are written bare in real source (`function f() onlyGuard { ... }`)
  assert.match(chk.stdout, /methods here are annotated with `onlyGuard`/, chk.stdout);
  assert.doesNotMatch(chk.stdout, /@onlyGuard/, chk.stdout);
  assert.match(chk.stdout, /`setAlphaTargetEmergency`[^\n]*is not annotated with `onlyGuard`/, chk.stdout);

  const rev = spawnSync('node', [BIN, 'review'], { cwd: repo, encoding: 'utf8' });
  assert.equal(rev.status, 0, rev.stderr);
  assert.match(rev.stdout, /1 finding\(s\)/, rev.stdout);
  assert.match(rev.stdout, /setAlphaTargetEmergency/, rev.stdout);
});
