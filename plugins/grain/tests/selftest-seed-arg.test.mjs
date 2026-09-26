// `grain selftest --null|--cochange --seed N` is documented in its space form: `--seed 1` must read 1 as the seed,
// never as a positional argument (which the argument-less `selftest` then refuses after a full index).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgv } from '../engine/grain-context.mjs';

test('--seed takes a value in both the space and the = form', () => {
  for (const argv of [
    ['selftest', '--null', '--seed', '7', '--runs', '2'],
    ['selftest', '--null', '--seed=7', '--runs=2'],
  ]) {
    const { cmd, args, opts } = parseArgv(argv);
    assert.equal(cmd, 'selftest');
    assert.deepEqual(args, [], `no positional argument may be left over: ${JSON.stringify(args)}`);
    assert.equal(opts.seed, '7');
    assert.equal(opts.runs, '2');
    assert.equal(opts.null, true);
  }
});
