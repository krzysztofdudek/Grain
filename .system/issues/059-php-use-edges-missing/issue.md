# 059 · PHP cross-component `use` dependencies are not resolved — Symfony shows 2 edges (both bogus), 44 real ones missed in one package

**Status:** OPEN — HIGH. Found by round 4, PHP/symfony, 2026-09-01
`map --json`: 68 modules, 67 layer-0 "leaves", **0 edges**. `report`: "2 directed dependencies", both from
`.github/` CI scripts. Meanwhile 44 files in HttpKernel `use Symfony\Component\EventDispatcher\…` (grep-verified),
undetected. PHP was earlier tested only on Slim (tiny, single-package) so this never showed.
Same family as 041 (C/C++ include edges): a language with a grammar but no working resolver, and the coverage
note presumably counts it as covered. **Establish:** does `relations.mjs` resolve PSR-4 namespaces via
composer.json autoload? If not, that is the fix; if it tries and fails on Symfony's monorepo layout, say why.
Either way 041's floor applies: the coverage note must not certify an absence.
