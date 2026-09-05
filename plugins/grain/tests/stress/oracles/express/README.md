# Oracle: express

A hand-written Yggdrasil graph for [expressjs/express](https://github.com/expressjs/express),
authored to be the graph a careful maintainer of that repository would commit.
It exists to be measured against — a miner's output can be compared to it, so
its value is entirely in having been written **independently of any miner**.

| | |
|---|---|
| **Target** | `expressjs/express` |
| **Revision** | `023767fe9872e029271df1418f73401bff20ff40` (2026-08-22, on the 5.2.1 line) |
| **Authored** | 2026-09-05, by hand, from the source tree |
| **Validated with** | Yggdrasil v5.8.0 (`yg check`, `yg check --approve --only-deterministic`, `yg drill`, `yg aspect-test --check-determinism`) |
| **Coverage** | 213 of 213 tracked files owned by a node |

## How this was written

**Read:** every file under `lib/` and `index.js` in full; the whole `test/`
layout including `test/support/*` and the fixture tree; every `examples/*/index.js`
and the requires of every other example file; `package.json`, `.eslintrc.yml`,
`.editorconfig`, `.npmrc`, `.gitignore`, `.eslintignore`; all four
`.github/workflows/*.yml`; `History.md` (the Unreleased and 5.x sections in
full, the rest by search); `git log` for the commits that deleted `lib/router/`,
`lib/middleware/` and `benchmarks/`. Yggdrasil's format was learned only from
the installed CLI (`yg prime`, all five `yg schemas`, all fifteen
`yg knowledge` topics).

**Not read, deliberately:** no `grain` command was run on this repository or
its clone; no Grain research memo, proposal output, stress result or miner
source was opened. No prior express architecture write-up, blog post or the
express website was consulted — every claim in this graph is traceable to a
file in the checkout.

**Not written:** no `flows/`. Express is a library, not a set of business
processes; a flow here would be an invention. No log entries and no
`log_required` type, because this graph describes a repository as it stands
rather than accompanying live work in it.

**Deliberately not encoded:** rules that eslint already enforces in CI —
two-space indent, `eqeqeq`, `eol-last`, `no-trailing-spaces`, `no-unused-vars`,
and the ban on the global `Buffer`. All of them hold across the tree (checked:
zero trailing-whitespace lines in any `.js` file; all 13 files that use
`Buffer` import it from `node:buffer`). Re-encoding a linter rule in the graph
buys a second failure surface for one fact, and this graph is meant to carry
what the linter cannot see.

## What is not here that a reader of express 4 will expect

The brief this oracle was written against assumed a `router` module, a
`middleware` directory and a `benchmarks` tree. None of the three exists at
this revision, and the graph says so rather than modelling them:

| Expected | Reality at this sha |
|---|---|
| `lib/router/` | Removed in 2015 (`cec5780d`, "Use router module for routing"). Routing is the external `router` package; `lib/application.js` constructs one lazily and delegates every verb to it. |
| `lib/middleware/` | `middleware/init.js` was refactored away in 2014 (`78e50547`); `middleware/query.js` became a lazy getter on the request prototype. The middleware express *exports* (`json`, `raw`, `text`, `urlencoded`, `static`) are re-exports of `body-parser` and `serve-static` — third-party code, not files here. |
| `benchmarks/` | Deleted in 2026 (`5a4568ab`). `.gitignore` still excludes `benchmarks/graphs`, a directory that no longer exists — recorded in the config node's description. |

Consequently the library is six modules, and the node types are the **layers**
of those six, not a directory mirror.

## Node types

Fourteen types; eight carry `enforce: strict`, so a matching file that is in no
node of that type — or in a node of the wrong type — is a blocking error rather
than a silent gap. The five library types are strict because each one's
`relations:` block is that layer's import budget; a file that slipped out of
its type would lose the budget with it.

| Type | `when` | Strict | Files |
|---|---|---|---|
| `package-entry` | `index.js` | yes | 1 |
| `library-entry` | `lib/express.js` | yes | 1 |
| `library-core` | `lib/application.js` | yes | 1 |
| `library-prototype` | `lib/request.js`, `lib/response.js` | yes | 2 |
| `library-support` | `lib/utils.js`, `lib/view.js` | yes | 2 |
| `unit-test` | `test/*.js` | yes | 70 |
| `acceptance-test` | `test/acceptance/*.js` | yes | 18 |
| `test-support` | `test/support/*.js` | yes | 3 |
| `test-fixture` | `test/fixtures/**` | no | 21 |
| `example-app` | `examples/**` | no | 80 |
| `ci-workflow` | `.github/**` | no | 5 |
| `repo-config` | manifest + lint/editor/npm/git settings | no | 6 |
| `docs` | `Readme.md`, `History.md`, `LICENSE` | no | 3 |
| `subsystem` | *(organisational — no `when`, no mapping)* | — | 0 |

## Nodes

Twenty nodes; five are organisational, fifteen own files. Nodes are sized by
**ownership** — a node is the set of files one person would change together and
one rule would speak about — which for a library this small means one node per
library module, and one node per test or example population.

```
examples                    example-app        examples/
package                     subsystem          -
  package/entry             package-entry      index.js
  package/factory           library-entry      lib/express.js
  package/application       library-core       lib/application.js
  package/http              subsystem          -
    package/http/request    library-prototype  lib/request.js
    package/http/response   library-prototype  lib/response.js
  package/support           subsystem          -
    package/support/utils   library-support    lib/utils.js
    package/support/view    library-support    lib/view.js
repo                        subsystem          -
  repo/ci                   ci-workflow        .github/
  repo/config               repo-config        package.json, .eslintrc.yml, ...
  repo/docs                 docs               Readme.md, History.md, LICENSE
tests                       subsystem          -
  tests/unit                unit-test          test/*.js
  tests/acceptance          acceptance-test    test/acceptance/*.js
  tests/support             test-support       test/support/*.js
  tests/fixtures            test-fixture       test/fixtures/
```

## Relations

Fifteen declared edges, derived from the actual `require` graph plus the two
runtime edges the modules themselves reach for. Two ports.

| From | To | Type | Backed by |
|---|---|---|---|
| `package/entry` | `package/factory` | uses | `require('./lib/express')` |
| `package/factory` | `package/application` | uses *(consumes `settings`)* | `require('./application')` |
| `package/factory` | `package/http/request` | uses | `require('./request')` |
| `package/factory` | `package/http/response` | uses | `require('./response')` |
| `package/application` | `package/support/view` | calls | `new View(...)` |
| `package/application` | `package/support/utils` | uses | `methods`, `compileETag`, `compileQueryParser`, `compileTrust` |
| `package/http/response` | `package/support/utils` | uses | `normalizeType`, `normalizeTypes`, `setCharset` |
| `package/http/response` | `package/application` | uses *(consumes `settings`)* | **runtime only** — `this.app.get(...)`, `this.req.app.render(...)` |
| `package/http/request` | `package/application` | uses *(consumes `settings`)* | **runtime only** — `this.app.get(...)` in six getters |
| `tests/unit` | `package/entry` | uses *(consumes `public-api`)* | `require('..')` |
| `tests/unit` | `package/support/utils` | uses | `require('../lib/utils')` in five suites |
| `tests/unit` | `tests/support` | uses | `require('./support/utils')` |
| `tests/acceptance` | `examples` | uses | `require('../../examples/<name>')` |
| `tests/acceptance` | `tests/support` | uses | `require('../support/utils')` |
| `examples` | `package/entry` | uses *(consumes `public-api`)* | `require('../..')` |

**Ports.** `package/entry` exposes `public-api`, carrying
`example-uses-package-entry`: whatever consumes the published entry reaches it
the way a user would. `package/application` exposes `settings`, carrying
`app-access-through-this`: whatever consumes the application from inside a live
request reads it off `this`, never by requiring it. Both port aspects are
filtered by a `when` on node type, so the factory — which legitimately *does*
require the application module — consumes the port without inheriting a rule
written for the prototypes.

**Architecture relation policy** is `default: deny` on every type. `library-support`
is a pure sink. `example-app` may reach only `package-entry` — which is what
makes the two examples that require `../../lib/express` a blocking
`relation-undeclared-dependency`, caught by the built-in check with file and
line, without an aspect being involved at all.

## Cycles

**The static `require` graph of `lib/` is acyclic**, and that is a deliberate
property of this codebase rather than an accident:

```
index.js -> lib/express.js -> lib/application.js -> lib/view.js
                           -> lib/request.js      -> lib/utils.js
                           -> lib/response.js     -> lib/utils.js
```

`lib/request.js` requires nothing from this repository at all; `lib/utils.js`
and `lib/view.js` require nothing either.

**The runtime object graph is cyclic, in three places:**

1. `application ⇄ request` — `app.handle` re-points every live request at
   `this.request` (`lib/application.js:169`), and six getters in
   `lib/request.js` read `this.app.get(...)` (lines 231, 301, 341, 358, 388,
   419).
2. `application ⇄ response` — the same re-pointing at `this.response`
   (`lib/application.js:170`), against `this.app.get(...)` in `res.send`,
   `res.json`, `res.jsonp` and `res.sendFile` (lines 132, 236, 264, 402) and
   `this.req.app.render(...)` in `res.render` (line 895).
3. `response -> request` — `res.send` reads `req.fresh` and `req.method`;
   `res.render`'s default callback calls `req.next(err)` (line 912).

Express 4 carried these cycles *statically* as well, through `lib/router/`;
version 5 exported the router and left the coupling as a pure runtime
relationship, mediated by properties the factory attaches to each application.
That is precisely why `app-access-through-this` exists as an enforced rule:
the acyclic module graph survives only as long as the prototypes keep reading
the application off `this`.

**What the graph could not say about this.** Yggdrasil requires the four
structural relation types (`calls`, `uses`, `extends`, `implements`) to form a
DAG; declaring both directions raises a blocking `structural-cycle`. So only
one direction of each pair is declared — the direction where the module reaches
out by name (`request -> application`, `response -> application`) rather than
the direction where the factory hands a reference in. The consequence is that
`yg structure` reports *"All dependencies between groups flow one way (no
cycles)"* at every depth, which is true of the declared graph and false of the
running system. **A miner that reports these cycles is not wrong against this
oracle; it is reporting something this oracle's notation cannot hold.**
Modelling them as `emits`/`listens` would have made the graph pass while
describing a mechanism (events) that is not what the code does.

## Aspects

Twenty-three aspects: twenty deterministic (`check.mjs`), three judgment
(`content.md`). None is `draft` — every rule here was measured against the tree
before it was written down, so "unsure" never applied.

Status is honest in the sense the brief asked for: **enforced** means this graph
would block CI on it today, and it is enforced only where the whole population
already holds. **advisory** means the rule is right and the code violates it —
the counts below are the refusal counts from the real run, not estimates.

### Enforced — zero violations at this revision

| Aspect | Rule | Where | Population |
|---|---|---|---|
| `strict-mode-pragma` | `'use strict'` before any statement | library + `index.js` + unit tests | 77 files, 0 violations |
| `node-core-prefix` | built-ins required as `node:x` | every `.js` | 89 core requires, 0 bare |
| `license-banner` | `/*! ... MIT Licensed */` header | the 7 published modules | 7/7 |
| `commonjs-export-surface` | exports via `module.exports`/`exports.x`, no ESM syntax | the 7 published modules | 7/7 |
| `entry-module-is-a-reexport` | `index.js` holds banner, pragma, one re-export | `index.js` | 1/1 |
| `no-console-in-library` | no `console.log`/`warn`/`info`/… (only `console.error`) | the 7 published modules | 1 `console.error`, 0 others |
| `deprecations-through-depd` | deprecations via `depd('express')`; no hand-rolled warning | the 7 published modules | 3 `deprecate()` calls, all through depd |
| `library-layering` | intra-library requires within the layer's budget | the 7 published modules | 6-row budget, 0 breaches |
| `app-access-through-this` | a prototype must not require the application | via port, `library-prototype` only | 2 files, 0 violations |
| `test-declares-a-suite` | every mocha-loaded file has `describe` + `it` | unit + acceptance | 88/88 |
| `no-focused-tests` | no `.only`; no hard-coded `.skip` | unit + acceptance | 0 (the one `describe.skip` is computed, and passes) |
| `single-assertion-library` | no chai/should/expect/… | unit + acceptance | 0 |
| `acceptance-test-drives-its-example` | `acceptance/<n>.js` requires `examples/<n>` | acceptance | 18/18 |
| `actions-pinned-to-sha` | every action pinned to a 40-char SHA + version comment | workflows | 22/22 |

### Advisory — intended, and violated today (the refactor backlog)

| Aspect | Refusals | Where exactly |
|---|---|---|
| `strict-mode-pragma` *(advisory outside the enforced types)* | 21 | all 18 `test/acceptance/*.js`; `test/support/{env,tmpl,utils}.js` |
| `jsdoc-visibility-modern` | 14 in 3 files | `lib/utils.js` ×11 (L12, 27, 37, 48, 58, 72, 86, 127, 159, 191, 222); `lib/request.js` ×2 (L227, L441); `lib/express.js` ×1 (L33) |
| `every-example-has-an-acceptance-test` | 7 | `examples/`: online, route-middleware, search, session, static-files, view-constructor, view-locals |
| `example-app-is-requirable` | 6 | `examples/{online,route-middleware,search,session,static-files,view-locals}/index.js` |
| `example-uses-package-entry` | 2 | `examples/route-map/index.js:8`, `examples/route-middleware/index.js:7` — both `require('../../lib/express')` |
| `no-debug-output-in-tests` | 2 | `test/res.location.js:152` and `:153` — leftover `console.log`/`console.error` in a failure branch |
| `example-listen-is-guarded` | 1 | `examples/static-files/index.js:38` — binds port 3000 on require, with no `if (!module.parent)` guard |

Three of these are the same defect seen from three angles: `static-files`,
`online`, `search`, `session`, `view-locals` and `route-middleware` do not
export their app, therefore cannot be mounted, therefore have no acceptance
suite, therefore are the examples most likely to be wrong. Fixing
`example-app-is-requirable` is what unlocks the other two.

### Judgment rules (LLM) — all advisory

| Aspect | Why prose is the honest form |
|---|---|
| `public-api-documented` | Whether a doc comment is *true of the code beneath it* — especially whether its worked example still produces what it claims — is not a pattern. This repository has no generated reference; these comments are the reference. |
| `breaking-change-recorded` | Whether a change is user-visible, and whether the `History.md` entry is written in the user's terms rather than the implementer's, is a judgment about audience. |
| `response-escapes-untrusted-input` | The question is *provenance* — could this value have come from the request — which means following the value, not matching `escapeHtml(`. |

They are advisory rather than enforced because this graph ships no verified
reviewer output: enforcing them would mean 11 unverified enforced pairs and a
red build for rules nobody had actually run. The reviewer tier is configured
(`claude-code`, keyless) so a maintainer can buy those opinions with
`yg check --approve`, but the deterministic set is the gate.

### Drills

Nineteen of the twenty deterministic aspects ship a case corpus under
`aspects/<id>/drills/`; **71 cases, 71 pass, 0 MISS, 0 FALSE-ALARM**. Each
corpus includes the near-miss that would break a naive implementation — a
`require('fs')` inside a comment, a `describe.skip` selected by a ternary, a
`// console.log(err)` that is a note rather than output.

`every-example-has-an-acceptance-test` has no corpus, and that is stated rather
than faked: it is a whole-node rule that reads the `examples/` directory
through `ctx.fs`, and the graphless drill runner supplies only `ctx.files`. It
is exercised instead by `yg aspect-test --node tests/acceptance`, which
reproduces the seven findings.

## Validation

Run against a staged copy of the pinned checkout with the graph at its root,
using Yggdrasil v5.8.0.

```
$ yg check --approve --only-deterministic
Filling 789 unverified pairs across 12 nodes — 789 deterministic (no cost), 0 reviewer calls
  Deterministic-only mode — 11 LLM pairs will NOT be reviewed this run
... 788/789 filled (753 ok, 35 refused)

$ yg check --summary
yg check: FAIL  20 nodes · 213/213 files · 23 aspects · 0 flows · 754 verified (754 deterministic, 0 LLM)

Errors (1):
  examples  0 unverified (0 deterministic-free, 0 LLM), 0 refused, 1 other

Warnings (47):
  (repo)  0 unverified, 0 refused, 1 other
  examples  0 unverified, 9 refused
  package/application  2 unverified (0 deterministic-free, 2 LLM), 0 refused
  package/factory  2 unverified (0 deterministic-free, 2 LLM), 1 refused
  package/http/request  2 unverified (0 deterministic-free, 2 LLM), 1 refused
  package/http/response  3 unverified (0 deterministic-free, 3 LLM), 0 refused
  package/support/utils  1 unverified (0 deterministic-free, 1 LLM), 1 refused
  package/support/view  1 unverified (0 deterministic-free, 1 LLM), 0 refused
  tests/acceptance  0 unverified, 19 refused
  tests/support  0 unverified, 3 refused
  tests/unit  0 unverified, 1 refused

Next: Fix relation-undeclared-dependency in examples
```

**The graph loads with zero load-blocking codes.** No `unmapped-files`, no
`type-strict-orphan`, no `type-strict-misplaced`, no `strict-overlap-conflict`,
no `structural-cycle`, no `port-missing-consumes`, no `aspect-undefined`, no
`architecture-cycle`, no `prompt-too-large`.

Every remaining finding is a statement about express, not about the graph:

- **1 error** — `relation-undeclared-dependency` on `examples`: the two files
  that require `../../lib/express` instead of the package root. The
  architecture forbids `example-app -> library-entry`, so the built-in check
  refuses it with both file:line locations. This is the graph doing its job,
  and it is left red on purpose.
- **35 advisory refusals** — the backlog table above.
- **11 unverified** — the three judgment rules, no reviewer run.
- **1 `rules-digest-stale` warning** — this oracle ships `.yggdrasil/` only, not
  the `AGENTS.md` / `.clinerules` agent-rules install that `yg init` writes.
  Deliberate: the oracle is a description of a repository, not an adoption of
  Yggdrasil into it.

Two problems were found and fixed during validation, both in the graph rather
than in express: `subsystem` initially declared itself as its own allowed
parent (`architecture-cycle` — every type became unrootable), and
`breaking-change-recorded` referenced `History.md`, whose ~130KB blew the
default 50000-character prompt ceiling on four nodes.

## What Yggdrasil's schema could not express

Four things this graph wanted to say and could not:

1. **A cyclic runtime dependency.** Structural relations must be a DAG, so the
   application↔prototype cycles described above exist only in prose. The
   sanctioned alternative — `emits`/`listens` — would have named a mechanism
   that is not there.
2. **A reference to part of a file.** `breaking-change-recorded` needs the
   "Unreleased" section of `History.md`; `references:` takes whole files only,
   so the rule pays ~130KB of release history on every pair and needs its own
   reviewer tier to fit at all.
3. **A relation to a *file* rather than a node.** `index.js` and
   `lib/express.js` had to be separate nodes purely so the architecture could
   forbid examples reaching the second while allowing the first — the
   ownership-sized node would have held both, since one is a bare re-export of
   the other. Node granularity was decided here by what the relation check can
   distinguish, not by ownership.
4. **A rule about a file's absence.** "Every example directory has an
   acceptance suite" is a statement about a file that does not exist. It only
   works as a whole-node check reading `ctx.fs` from the *other* side of the
   relation (the acceptance node looking at `examples/`), which also puts it
   out of reach of `yg drill`.
