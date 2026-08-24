import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('resolves a nested-crate path and serves the crate root from the cache on a second file', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'resolve-path-langs-'));

  function w(rel, content = '// x\n') {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
  }

  // GO: a module rooted at example.com/app. The go.mod leads with a comment and a
  // blank line before the `module` directive so the comment/blank skip is exercised.
  w('go.mod', '// module manifest\n\nmodule example.com/app\n\ngo 1.21\n');
  w('svc/handler.go', 'package svc\n');
  w('svc/util.go', 'package svc\n');
  w('cmd/main.go', 'package main\n');
  w('cmd/extra.go', 'package main\n');

  // PHP: composer PSR-4 mapping App\ → src/.
  w('composer.json', JSON.stringify({ autoload: { 'psr-4': { 'App\\': 'src/' } } }) + '\n');
  w('src/Payment/Gateway.php', '<?php\n');
  w('app/start.php', '<?php\n');
  w('app/run.php', '<?php\n');

  // JAVA: package = directory; a wildcard import lists the package dir's .java files.
  // A non-.java sibling (package-info-less README) exercises the .java-only filter in
  // javaFilesIn (the directory entry that is skipped).
  w('com/foo/Bar.java', 'package com.foo;\n');
  w('com/foo/App.java', 'package com.foo;\n');
  w('com/foo/Baz.java', 'package com.foo;\n');
  w('com/foo/README.md', '# not java\n');

  // RUST: a crate named "my-crate" (hyphen → underscore identifier rule). A
  // `[workspace]` section with a key precedes `[package]`, so the crate-name scan
  // encounters a non-section line while OUTSIDE the [package] section (the
  // not-in-package skip), then finds the name inside [package].
  w('Cargo.toml', '[workspace]\nresolver = "2"\n\n[package]\nname = "my-crate"\nversion = "0.1.0"\n');
  w('src/lib.rs', '// lib\n');
  w('src/orders/mod.rs', '// orders\n');
  w('src/a.rs', '// a\n');
  w('src/b.rs', '// b\n');
  // A NESTED crate under crates/core (its Cargo.toml is not at the repo root), so
  // crate-root discovery returns a non-empty src dir; two files under its src/ make
  // the second resolution serve the crate root from the crateRootFor cache.
  w('crates/core/Cargo.toml', '[package]\nname = "core"\nversion = "0.1.0"\n');
  w('crates/core/src/lib.rs', '// core lib\n');
  w('crates/core/src/x.rs', '// x\n');
  w('crates/core/src/y.rs', '// y\n');

  // C/C++: a quoted include resolving relative to the including file.
  w('inc/foo.h', '/* h */\n');
  w('csrc/main.c', '#include "../inc/foo.h"\n');

  // RUBY: require_relative resolving relative to the requiring file.
  w('lib/order.rb', '# order\n');
  w('lib/app.rb', "require_relative 'order'\n");

  try {
    const resolve = makeResolvePathToFile(root);
    // crates/core has its OWN Cargo.toml (not at the repo root), so crate-root
    // discovery returns a non-root src dir. Resolving a second file under the same
    // crate dir serves the crate root from the crateRootFor cache rather than
    // re-walking to a fresh Cargo.toml read.
    expect(resolve('crate::x', 'crates/core/src/lib.rs', 'rust')).toBe('crates/core/src/x.rs');
    expect(resolve('crate::y', 'crates/core/src/y.rs', 'rust')).toBe('crates/core/src/y.rs');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
