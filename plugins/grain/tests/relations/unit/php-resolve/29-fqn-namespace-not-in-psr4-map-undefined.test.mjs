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

test('returns undefined for an FQN whose namespace is not in the psr-4 map', () => {
  const root = tempRepo(true);
  try {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('Vendor\\Lib\\Thing', 'src/Order/Handler.php', 'php')).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
