// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby-resolve.test.ts (MIT, same author).
// describe: resolveRubyRequireRelative via makeResolvePathToFile (disk-backed)
//
// Ruby's `require_relative '<lit>'` resolves relative to the requiring file's directory,
// `.rb` appended. This test builds a real temp tree and drives the production
// makeResolvePathToFile (disk-backed existence) through the `ruby` branch.
import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test("resolves a sibling require_relative './helper'", () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ruby-resolve-'));
  try {
    mkdirSync(path.join(root, 'app', 'services'), { recursive: true });
    mkdirSync(path.join(root, 'app', 'models'), { recursive: true });
    writeFileSync(path.join(root, 'app', 'services', 'order_service.rb'), '# order\n', 'utf-8');
    writeFileSync(path.join(root, 'app', 'models', 'helper.rb'), '# helper\n', 'utf-8');

    const resolve = makeResolvePathToFile(root);
    expect(resolve('./helper', 'app/models/order.rb', 'ruby')).toBe('app/models/helper.rb');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
