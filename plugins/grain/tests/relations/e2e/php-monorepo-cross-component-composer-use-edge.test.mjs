// Issue 059: PHP monorepos (Symfony's real layout: src/Symfony/Component/<Name>/composer.json, one manifest
// per component, no single repo-root composer.json) declare PSR-4 autoload PER COMPONENT. The vendored
// per-file resolver (php-resolve.mjs) walks UP from the REFERENCING file to find the NEAREST ancestor
// composer.json and only ever sees THAT component's own namespace prefix — a `use` reaching into a sibling
// component's namespace found no match and silently failed to resolve (0 edges on Symfony's real HttpKernel,
// which alone has 44 such cross-component `use`s to EventDispatcher). Fixed by merging every composer.json in
// the tree into one repo-wide PSR-4 map (core.mjs) that a second resolver pass (relations.mjs
// phpAutoloadResolverFor) consults when the per-file/nearest-ancestor resolution comes up empty.
// Invariant: two components, each with its own composer.json declaring only its own namespace prefix; a
// `use` in one component reaching a class declared in the OTHER component resolves to that file.
import { test } from 'node:test';
import { edgesOf, expectEdge } from '../harness.mjs';

test('php-monorepo-cross-component-composer-use-edge', () => {
  const fx = {
    'src/Symfony/Component/HttpKernel/composer.json':
      '{\n  "name": "symfony/http-kernel",\n  "autoload": {\n    "psr-4": {\n      "Symfony\\\\Component\\\\HttpKernel\\\\": ""\n    }\n  }\n}\n',
    'src/Symfony/Component/EventDispatcher/composer.json':
      '{\n  "name": "symfony/event-dispatcher",\n  "autoload": {\n    "psr-4": {\n      "Symfony\\\\Component\\\\EventDispatcher\\\\": ""\n    }\n  }\n}\n',
    'src/Symfony/Component/HttpKernel/HttpKernel.php':
      '<?php\nnamespace Symfony\\Component\\HttpKernel;\nuse Symfony\\Component\\EventDispatcher\\EventDispatcherInterface;\nclass HttpKernel {\n  private EventDispatcherInterface $dispatcher;\n}\n',
    'src/Symfony/Component/EventDispatcher/EventDispatcherInterface.php':
      '<?php\nnamespace Symfony\\Component\\EventDispatcher;\ninterface EventDispatcherInterface {}\n',
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(
      edges,
      'src/Symfony/Component/HttpKernel/HttpKernel.php',
      'src/Symfony/Component/EventDispatcher/EventDispatcherInterface.php',
      'import'
    );
  } finally {
    cleanup();
  }
});
