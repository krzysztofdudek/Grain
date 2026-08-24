import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

function tempRepo(withComposer) {
  const root = mkdtempSync(path.join(tmpdir(), 'yg-php-resolve-'));
  mkdirSync(path.join(root, 'src', 'Payment'), { recursive: true });
  writeFileSync(
    path.join(root, 'src', 'Payment', 'Gateway.php'),
    '<?php\nnamespace App\\Payment;\nclass Gateway {}\n',
  );
  if (withComposer) {
    writeFileSync(
      path.join(root, 'composer.json'),
      JSON.stringify({ autoload: { 'psr-4': { 'App\\': 'src/' } } }),
    );
  }
  return root;
}

test('resolves an FQN to a class file when composer.json psr-4 maps the namespace', () => {
  const root = tempRepo(true);
  try {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('App\\Payment\\Gateway', 'src/Order/Handler.php', 'php')).toBe('src/Payment/Gateway.php');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
