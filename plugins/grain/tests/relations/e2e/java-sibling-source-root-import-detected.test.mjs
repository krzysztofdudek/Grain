// Relation conformance — issue 113.
// Case: Maven's Standard Directory Layout (and Gradle's default source sets) put production and test code in
// SIBLING source roots — `src/main/java` and `src/test/java` — and a test's `import com.acme.core.Service;`
// crosses between them. The vendored `resolveJavaFqn` walks only the ancestor directories of the referencing
// file, so from `src/test/java/...` it tries `src/test/java/`, `src/test/`, `src/`, `<root>/` and never the
// sibling root that actually holds the type. On spring-petclinic that dropped all 14 test -> main imports.
//
// Invariant: an import that names a type living under a SIBLING source root resolves to that type's file; and
// the module cut is taken BELOW the source root (at package granularity), never at `src/main/java/com`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgesOf, expectEdge } from '../harness.mjs';

test('java-sibling-source-root-import-detected', () => {
  const fx = {
    'pom.xml': '<project><artifactId>demo</artifactId></project>\n',
    'src/main/java/com/acme/core/Service.java': 'package com.acme.core;\npublic class Service {}\n',
    'src/main/java/com/acme/web/Controller.java':
      'package com.acme.web;\nimport com.acme.core.Service;\npublic class Controller {\n  Service s;\n}\n',
    'src/test/java/com/acme/web/ControllerTests.java':
      'package com.acme.web;\nimport com.acme.core.Service;\npublic class ControllerTests {\n  Service s;\n}\n',
  };
  const { edges, moduleGraph, cleanup } = edgesOf(fx);
  try {
    // the control: an import inside the file's OWN source root already resolved before this change
    expectEdge(
      edges,
      'src/main/java/com/acme/web/Controller.java',
      'src/main/java/com/acme/core/Service.java',
      'import'
    );
    // the fix: the same import from the SIBLING test root resolves too
    expectEdge(
      edges,
      'src/test/java/com/acme/web/ControllerTests.java',
      'src/main/java/com/acme/core/Service.java',
      'import'
    );
    // and the module cut lands on the packages, so the resolved edge survives aggregation
    const ids = new Set(moduleGraph.nodes.map(n => n.id));
    assert.ok(
      ids.has('src/main/java/com/acme/core') && ids.has('src/main/java/com/acme/web'),
      `expected package-granular modules under the source root, got: ${[...ids].join(', ')}`
    );
    const pair = moduleGraph.edges.find(
      e => e.from === 'src/main/java/com/acme/web' && e.to === 'src/main/java/com/acme/core'
    );
    assert.ok(pair, `expected a module edge web -> core, got: ${JSON.stringify(moduleGraph.edges)}`);
  } finally {
    cleanup();
  }
});
