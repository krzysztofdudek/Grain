// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: A PSR-4 FQN `use App\B\Bar;` resolved via composer.json's psr-4 map is detected live and gates on the declared uses relation.
// Invariant: composer.json PSR-4 map (App\ -> src/) makes the FQN `use App\B\Bar;` resolvable to a file; detected live; undeclared -> refused (exit 1, mentions 'b' and 'src/A/Foo.php'); declared uses: b -> passes.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("php-psr4-use-import-detected", () => {
  const fx = {
  "composer.json": "{\n  \"autoload\": {\n    \"psr-4\": {\n      \"App\\\\\": \"src/\"\n    }\n  }\n}\n",
  "src/A/Foo.php": "<?php\nnamespace App\\A;\nuse App\\B\\Bar;\nclass Foo {\n  public ?Bar $bar = null;\n}\n",
  "src/B/Bar.php": "<?php\nnamespace App\\B;\nclass Bar {}\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/A/Foo.php", "src/B/Bar.php", "import");
  } finally { cleanup(); }
});
