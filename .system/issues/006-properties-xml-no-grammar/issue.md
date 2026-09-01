# 006 · No `.properties` / XML coverage — blind on Spring's (and many JVM repos') primary config surface

**Status:** DONE — `.properties` shipped (EXTR_V g27→g28, verified); XML declined (ships no wasm)
**Found by:** field test, Java/spring-petclinic, 2026-09-01
**Severity:** medium — scoped, honest gap, but it lands squarely on a major ecosystem

## Symptom

spring-petclinic has 17 `.properties` files plus `pom.xml` and checkstyle XML. None get structural coverage —
`grain version`/`report` confirm no `properties` or `xml` entry in the grammar list.

- `grain what "spring.jpa.hibernate.ddl-auto"` → "no declarations or values anywhere in this repository's code"
- `grain what "database"` (the literal key `database=h2` in application.properties) → same

By contrast YAML support (new in 0.3.0) worked well on the same repo: `grain what "runs-on"` correctly found the
GitHub Actions key across 3 workflow files with real sibling keys (`branches`, `steps`, `ubuntu-latest`).

## Context

0.3.0 added JSON/YAML/TOML via tree-sitter grammars (ticket J7.2), with a measured cost gate and a key/value
distinction derived from each grammar's own `node-types.json` (`b.data`, `b.keyField`, `KEY_LIKE_RE`). Adding
`.properties` is NOT symmetrical with that work: `.properties` is a line-oriented format with no tree-sitter
grammar in the shipped set, and XML is a genuinely large grammar whose value to this tool is unproven.

## Decision needed before any implementation

This is a scoping question for the maintainer, not a bug to be fixed reflexively:
1. Is a `.properties` reader worth a NON-tree-sitter special case, when the project's constitutional rule is
   "kod to kod" and every other format goes through a real grammar? A hand-rolled line parser would be the first
   exception to that rule.
2. Is `tree-sitter-xml` worth its size/cost, measured the same way J7.2 measured JSON/YAML/TOML (a real
   before/after cost run on a real corpus, not an estimate)?

Do not implement either without an explicit decision recorded here.

---

## Decision (2026-09-01) — and a correction to this issue's own premise

**This issue was written on a false premise, by me (the orchestrator).** It claimed `.properties` "has no
tree-sitter grammar in the shipped set, so supporting it means a hand-rolled line parser — the first exception to
this project's 'everything goes through a real grammar' rule." That framing drove it to the maintainer as a
principled scoping question. It was wrong, and checking took two commands:

```
tree-sitter-properties@0.3.0                    → ships tree-sitter-properties.wasm + src/node-types.json
@tree-sitter-grammars/tree-sitter-xml@0.7.0     → ships src/node-types.json, NO .wasm
```

So:

**`.properties` — APPROVED, and it is NOT an exception to anything.** It is an ordinary grammar addition of
exactly the shape J7.2 already performed three times (json/yaml/toml): a package that ships both a prebuilt wasm
and node-types.json. The "kod to kod" rule is untouched — the key/value distinction will be derived from the
grammar's own node-types metadata via the existing `b.data`/`b.keyField`/`KEY_LIKE_RE` machinery, not from a
hand-written parser.

**XML — DECLINED for now.** `@tree-sitter-grammars/tree-sitter-xml` ships no prebuilt wasm, which is precisely the
failure mode `build-grammars.mjs:40-42` already documents for dart/elixir/haskell/ocaml/julia/powershell/fsharp
("its npm wasm does not load in web-tree-sitter 0.26" / "ships no prebuilt wasm"). Adding it would mean building
wasm ourselves — a separate decision about build tooling, not about grammar coverage. Record it in that same
comment alongside the others rather than silently omitting it.

## Sequencing caveat — read 011 before expecting value from this

Issue 011 established, by measurement on express, that JSON/YAML key indexing only pays off where a repo has
SEVERAL structurally similar config files: a key present in one file alone has df=1 and is removed by
`CFG.valueDfMin = 2`.

For `.properties` this is likely fine and possibly ideal — Spring repos characteristically carry
`application.properties` plus `application-dev/-test/-prod.properties`, and spring-petclinic (the repo whose field
test raised this issue) has **17 `.properties` files**. That is exactly the multi-file shape the df gate rewards.

But it means the acceptance test must NOT be a single `.properties` file — that would pass or fail for reasons
unrelated to this work. Test with several, mirroring a real Spring layout.

## Acceptance

`.properties` added to `build-grammars.mjs` + `ALL_EXT2GRAMMAR`; `bindingFor` derives `b.data`/`b.keyField` for it
with no language-specific code; a multi-file Spring-shaped fixture makes a real property key findable via `what`;
`grain version` lists `properties`; the J7.2 cost gate (scopeless-grammar blob skip) covers it automatically —
verify that it does. XML's exclusion recorded in `build-grammars.mjs`'s existing comment.
