// Relation conformance — issue 113.
// Case: Java resolves a SIMPLE type name against the file's own package without any import (JLS §6.5.5.1 and
// §7.5: types of the same package are in scope by declaration, an import declaration is only for OTHER packages).
// The vendored extractor emits a candidate for `import_declaration` and `scoped_type_identifier` only, so a bare
// `Owner owner;` next to `Owner.java` produced no candidate at all — on spring-petclinic that was 31 real
// file -> file reference pairs the miner could not see, including every entity/repository/controller edge inside
// a domain package.
//
// Invariant: a simple type name that names a type declared in the SAME package binds to that type's file, in
// heritage, field, parameter, return, generic-argument, construction and class-literal position; a simple name
// with no declaration in the package (a JDK type, a type reached by import) stays silent; and an import wins
// over the package, so an imported name is never re-bound to a same-named sibling.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test('java-same-package-reference-without-import', () => {
  const fx = {
    'src/main/java/com/acme/shop/Order.java': 'package com.acme.shop;\npublic class Order {}\n',
    'src/main/java/com/acme/shop/Base.java': 'package com.acme.shop;\npublic abstract class Base {}\n',
    'src/main/java/com/acme/shop/Repo.java':
      'package com.acme.shop;\nimport java.util.List;\npublic interface Repo {\n  List<Order> findAll();\n}\n',
    'src/main/java/com/acme/shop/Service.java':
      'package com.acme.shop;\n' +
      'import java.util.ArrayList;\n' +
      'public class Service extends Base {\n' +
      '  private final Repo repo;\n' +
      '  Service(Repo repo) { this.repo = repo; }\n' +
      '  Order make() { return new Order(); }\n' +
      '  Class<?> what() { return Order.class; }\n' +
      '  ArrayList<String> spare() { return new ArrayList<>(); }\n' +
      '}\n',
    // a DIFFERENT package that happens to declare the same simple name; Service imports nothing from it, and
    // Elsewhere imports com.acme.shop.Order explicitly, so its own sibling `Order` must not shadow the import
    'src/main/java/com/acme/other/Order.java': 'package com.acme.other;\npublic class Order {}\n',
    'src/main/java/com/acme/other/Elsewhere.java':
      'package com.acme.other;\nimport com.acme.shop.Order;\npublic class Elsewhere {\n  Order o;\n}\n',
    // a MEMBER type of the same simple name shadows the package member (JLS §6.5.5.1), and a type PARAMETER
    // named like a sibling declares a name rather than referencing one
    'src/main/java/com/acme/shop/Shadow.java':
      'package com.acme.shop;\n' +
      'public class Shadow<Base> {\n' +
      '  static class Order {}\n' +
      '  Order mine;\n' +
      '  Base b;\n' +
      '}\n',
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    const S = 'src/main/java/com/acme/shop/Service.java';
    expectEdge(edges, S, 'src/main/java/com/acme/shop/Base.java', 'extends');
    expectEdge(edges, S, 'src/main/java/com/acme/shop/Repo.java'); // field + parameter type
    expectEdge(edges, S, 'src/main/java/com/acme/shop/Order.java'); // return type, `new`, class literal
    // generic argument inside an interface, no import anywhere
    expectEdge(edges, 'src/main/java/com/acme/shop/Repo.java', 'src/main/java/com/acme/shop/Order.java');
    // an explicit single-type import wins over the same simple name declared in the file's own package (JLS §7.5.1)
    expectEdge(edges, 'src/main/java/com/acme/other/Elsewhere.java', 'src/main/java/com/acme/shop/Order.java');
    forbidEdge(edges, 'src/main/java/com/acme/other/Elsewhere.java', 'src/main/java/com/acme/other/Order.java');
    // a JDK type named simply is not a repository dependency
    forbidEdge(edges, S, 'src/main/java/com/acme/other/Order.java');
    // shadowing: `Order` is Shadow's own member type and `Base` is its type parameter — neither is a sibling file
    forbidEdge(edges, 'src/main/java/com/acme/shop/Shadow.java', 'src/main/java/com/acme/shop/Order.java');
    forbidEdge(edges, 'src/main/java/com/acme/shop/Shadow.java', 'src/main/java/com/acme/shop/Base.java');
  } finally {
    cleanup();
  }
});
