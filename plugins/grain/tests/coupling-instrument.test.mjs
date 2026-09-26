// Guard for the hidden-coupling instrument: tests/stress/coupling.mjs (research B4, issue 265). It certifies node
// pairs by the engine's own co-change cell over node-level commits and names a channel for each undeclared one. It
// reports; it gates nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { certify, channelOf } from './stress/coupling.mjs';
import { rng } from '../engine/selftest-null.mjs';

// 400 commits: `api` and `api-tests` change together in 40 of them; `a`..`h` fill the rest, one or two at a time,
// independently of each other
function history() {
  const fps = [];
  const others = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const r = rng(7);
  const pick = () => others[Math.floor(r() * others.length)];
  for (let i = 0; i < 400; i++) {
    if (i % 10 === 0) fps.push({ files: ['api', 'api-tests'] });
    else fps.push({ files: [...new Set([pick(), ...(r() < 0.3 ? [pick()] : [])])].sort() });
  }
  return fps;
}

test('a pair that changes together far above its base rates is certified; independent pairs are not', () => {
  const { N, pairs } = certify(history());
  assert.equal(N, 400);
  const hit = pairs.find(p => p.a === 'api' && p.b === 'api-tests');
  assert.ok(hit && hit.bits > 0, 'the coupled pair is certified');
  assert.equal(hit.sup, 40);
  assert.equal(hit.dir, 'both');
  const rest = pairs.filter(p => p !== hit && p.bits != null);
  assert.deepEqual(rest.map(p => `${p.a}-${p.b}`), [], 'no independent pair is certified');
});

test('the channel of an undeclared pair: a test named after its subject, documentation, shared vocabulary', () => {
  const g = {
    byId: new Map([
      ['cli/commands/advise', { files: new Set(['src/commands/advise.ts']) }],
      ['cli/tests/unit/core/advise', { files: new Set(['tests/advise.test.ts']) }],
      ['docs/guides', { files: new Set(['docs/a.md', 'docs/b.md']) }],
      ['cli/knowledge', { files: new Set(['src/knowledge/index.ts']) }],
      ['cli/portal/contract', { files: new Set(['src/portal/contract.ts']) }],
      ['cli/portal/views', { files: new Set(['src/portal/views.js']) }],
    ]),
  };
  const vocab = { score: (a, b) => (a.includes('portal') && b.includes('portal') ? 0.2 : 0.01) };
  assert.equal(channelOf(g, 'cli/commands/advise', 'cli/tests/unit/core/advise', vocab, 0.07), 'test-of');
  assert.equal(channelOf(g, 'cli/knowledge', 'docs/guides', vocab, 0.07), 'docs');
  assert.equal(channelOf(g, 'cli/portal/contract', 'cli/portal/views', vocab, 0.07), 'vocabulary');
  assert.equal(channelOf(g, 'cli/knowledge', 'cli/portal/views', vocab, 0.07), 'none');
});
