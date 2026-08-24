// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: A grouped class import `use App\B\{Bar, Baz};` must not be over-silenced by a per-clause function/const guard — both classes must contribute cross-node edges.
// Invariant: Anti-over-silencing: a PHP group-use import naming multiple classes (`use App\B\{Bar, Baz};`) crosses the a->b boundary with NO declared relation; a guard exists to avoid flagging function/const group clauses, but it must NOT suppress ordinary class clauses — both Bar and Baz must contribute edges into b; refused (exit 1, mentions 'src/A/Foo.php' and 'b').
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("php-grouped-use-import-both-classes-flagged", () => {
  const fx = {
  "composer.json": "{\n  \"autoload\": {\n    \"psr-4\": {\n      \"App\\\\\": \"src/\"\n    }\n  }\n}\n",
  "src/A/Foo.php": "<?php\nnamespace App\\A;\nuse App\\B\\{Bar, Baz};\nclass Foo {\n  public ?Bar $bar = null;\n  public ?Baz $baz = null;\n}\n",
  "src/B/Bar.php": "<?php\nnamespace App\\B;\nclass Bar {}\n",
  "src/B/Baz.php": "<?php\nnamespace App\\B;\nclass Baz {}\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/A/Foo.php", "src/B/Bar.php", "import");
    expectEdge(edges, "src/A/Foo.php", "src/B/Baz.php", "import");
  } finally { cleanup(); }
});
