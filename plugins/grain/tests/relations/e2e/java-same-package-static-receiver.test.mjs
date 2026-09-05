// Relation conformance — issue 113.
// Case: a utility class of the same package is used only as the RECEIVER of a static call or a static field
// read — `EntityUtils.getById(...)`, `Consts.NAME`. There is no import (same package) and no type-position
// mention either, so neither the vendored extractor nor the same-package type walk sees it. On
// spring-petclinic this is the whole of `ClinicServiceTests` -> `EntityUtils`, the one declared relation of the
// hand oracle whose absence was grain's own miss rather than the oracle's debt.
//
// Invariant: a bare receiver that names a type declared in the file's own package binds to that type's file; a
// receiver that names a local, parameter or field of this file does not (a variable shadows the type, JLS
// §6.5.6.1 — and a variable named exactly like a sibling class is the case that would otherwise fabricate an
// edge out of ordinary code).
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test('java-same-package-static-receiver', () => {
  const fx = {
    'src/test/java/com/acme/svc/EntityUtils.java':
      'package com.acme.svc;\npublic abstract class EntityUtils {\n  public static int getById(int id) { return id; }\n}\n',
    'src/test/java/com/acme/svc/Consts.java':
      'package com.acme.svc;\npublic final class Consts {\n  public static final String NAME = "x";\n}\n',
    // a class whose SIMPLE NAME is also used as a local variable name in the file below
    'src/test/java/com/acme/svc/Registry.java': 'package com.acme.svc;\npublic class Registry {}\n',
    'src/test/java/com/acme/svc/ServiceTests.java':
      'package com.acme.svc;\n' +
      'public class ServiceTests {\n' +
      '  void run() {\n' +
      '    int id = EntityUtils.getById(1);\n' +
      '    String n = Consts.NAME;\n' +
      '    Object Registry = new Object();\n' +
      '    Registry.toString();\n' +
      '  }\n' +
      '}\n',
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    const T = 'src/test/java/com/acme/svc/ServiceTests.java';
    expectEdge(edges, T, 'src/test/java/com/acme/svc/EntityUtils.java');
    expectEdge(edges, T, 'src/test/java/com/acme/svc/Consts.java');
    forbidEdge(edges, T, 'src/test/java/com/acme/svc/Registry.java');
  } finally {
    cleanup();
  }
});
