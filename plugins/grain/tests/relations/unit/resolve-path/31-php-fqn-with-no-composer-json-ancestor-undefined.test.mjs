import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('PHP FQN with no composer.json ancestor → undefined', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'resolve-path-bare-'));
  mkdirSync(path.join(root, 'svc'), { recursive: true });
  mkdirSync(path.join(root, 'app'), { recursive: true });
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(path.join(root, 'svc', 'handler.go'), 'package svc\n', 'utf-8');
  writeFileSync(path.join(root, 'app', 'start.php'), '<?php\n', 'utf-8');
  writeFileSync(path.join(root, 'src', 'lib.rs'), '// lib\n', 'utf-8');
  try {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('App\\Payment\\Gateway', 'app/start.php', 'php')).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
