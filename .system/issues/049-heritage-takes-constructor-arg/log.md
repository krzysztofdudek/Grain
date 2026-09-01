# 049 — investigation and fix log

Branch `fix/049`. Engine change only (`core.mjs`); `config.mjs` untouched (EXTR_V g31 batched by the orchestrator).

## Why `argument_list` is in `heritageRe` — the answer, per grammar

`heritageRe` is tested against the **direct named children of a scope node**, so `argument_list` only ever
matters where an argument-shaped node is a direct child of a class-like node. Across all 19 shipped
grammars that is exactly three, and only one of them is real heritage:

| grammar | scope node | slot | what it holds | verdict |
|---|---|---|---|---|
| **python** | `class_definition` | field **`superclasses`** | `argument_list` | **parent specification — real heritage. The sole justification for the token.** |
| java | `enum_constant` | field **`arguments`** | `argument_list` | constructor call — never heritage |
| groovy | `enum_constant` | field **`arguments`** | `argument_list` | constructor call — never heritage |

Derived mechanically from `node-types.json`: the only `(node, field)` pair in any grammar where a
**heritage-named field holds an argument-shaped node** is `python:class_definition.superclasses`. Every other
field that holds an `argument_list` is a call — `call_expression.arguments`, `object_creation_expression.arguments`,
`method_invocation.arguments`, `annotation.arguments`, `enum_constant.arguments`.

So the token stays. Removing it would cost Python its entire base-class extraction.

## The Scala/Kotlin defect was never about the token

`class HomeController @Inject() (cc: ControllerComponents) extends AbstractController(cc)` parses as
`extends_clause > [type_identifier "AbstractController", arguments > identifier "cc"]`. The direct child is
`extends_clause` (matched via `extends`, not `argument_list`); `cc` leaks because the walk uses
`descendantsOfType` and **descends into the argument list**. Same in Kotlin
(`delegation_specifier > constructor_invocation > [user_type, value_arguments]`), C#
(`base_list > [identifier, argument_list]`), Solidity (`inheritance_specifier > [user_defined_type, call_argument]`),
C++, and JavaScript (`class_heritage > extends_clause > call_expression > arguments`).

Every grammar that can reach an argument node from a heritage node, from `node-types.json`:

```
c_sharp   base_list, primary_constructor_base_type, argument_list, attribute_argument_list, bracketed_argument_list
cpp       base_class_clause, argument_list
kotlin    delegation_specifier, delegation_specifiers
scala     extends_clause
solidity  inheritance_specifier
python    argument_list
groovy    annotation_argument_list        java  annotation_argument_list
rust      trait_bounds                    ruby/go/c  argument_list
tsx/typescript  class_heritage, extends_clause, extends_type_clause
```

## The rule

One new field-driven predicate in `bindingFor`, in the style of `genArgRe`, no language names, no constant:

```js
argRe: /(^|_)arg(ument)?s?(_list)?$/
```

Applied in two places, both reading structure the grammar already declares:

1. **The clause's role comes from the FIELD NAME that holds it.** A heritage-matched direct child sitting in
   an argument-named field is a call, not a parent list — skipped whole. Python's `superclasses` survives;
   Java/Groovy's `enum_constant.arguments` does not.
2. **Within a genuine clause, the type-named child beats the argument list.** The existing `inGenArg`
   ancestor-walk (which already excluded generic slots like `AbstractValidator<TQuery>`) now also stops on an
   argument node. Singular and plural both, because Solidity's operands are `call_argument`, Kotlin's
   `value_argument`, C#'s `argument`. `varargs`-style names (no separator) deliberately do not match, and
   `keyword_argument` is reached only in Python, where the `superclasses` field path supplies the same
   identifiers anyway — so Python's output is byte-identical before and after.

## Blast radius

**Fixtures**, 13 languages, before vs after — 12 rows changed, every one an argument, **0 supertypes added**:

| lang | class | before | after |
|---|---|---|---|
| scala | HomeController | `AbstractController, cc` | `AbstractController` |
| scala | OtherController | `AbstractController, c` | `AbstractController` |
| scala | WithMix | `Base, x, Helper, Other` | `Base, Helper, Other` |
| kotlin | A / C / R | `B, x, I` / `D, yy` / `S, zz` | `B, I` / `D` / `S` |
| c_sharp | Foo / Rec | `Bar, x, IBaz` / `Base, A, IR` | `Bar, IBaz` / `Base, IR` |
| java, groovy | enum constant B | `zz` | (none) |
| solidity | D2 | `E2, arg1, F2` | `E2, F2` |
| javascript | Baz | `mixin, A, B` | `mixin` |

Unchanged: **typescript, tsx, python, cpp, php, rust, ruby** and every plain-heritage case in the changed
languages.

**Real corpus** — playframework, 1658 files, 3621 type scopes:

| grammar | types | changed | files | supertype entries dropped | added |
|---|---|---|---|---|---|
| scala | 2336 | 234 | 169 | 559 | **0** |
| java | 1284 | 4 | 1 | 8 | **0** |

`cc×43`, `c×24` — the reported symptom, at scale. Only **4** scopes lost their last supertype, all four Java
enum constants (`ReadUncommitted(Connection.TRANSACTION_READ_UNCOMMITTED)`), where the dropped names are
literally the constructor argument.

Worked examples, all verified against source:

- `class CaffeineCacheModule extends SimpleModule((environment, configuration) => {…})` — **38** fabricated
  supertypes (the whole lambda body: `bind`, `to`, `toProvider`, `asScala`, `getString`, …) → `SimpleModule`.
- `class BuiltinModule extends SimpleModule((env, conf) => {…})` — 22 → `SimpleModule`.
- `class ScalaCacheSpec extends AbstractController(Helpers.stubControllerComponents()) with PlaySpecification`
  → `AbstractController, PlaySpecification`. **Both** real supertypes kept, only `Helpers` dropped.
- `class TestDBApiSpec extends DBApiSpec(Mode.Test)` / `DevDBApiSpec extends DBApiSpec(Mode.Dev)` /
  `ProdDBApiSpec extends DBApiSpec(Mode.Prod)` — three siblings that were in three different groups
  (`+Mode+Test` / `+Dev` / `+Prod`) now all share `["DBApiSpec"]`. The clustering complaint, in the wild.

**No language loses a real supertype.**

## Tests — `plugins/grain/tests/heritage-ctor-args.test.mjs`, 12 tests

The Scala fixture recording `AbstractController` not `cc`; the two-identical-controllers case asserted to
share one clustering key (`feats` minus name tokens); Kotlin, C#, Solidity, Java/Groovy enum constants and
JavaScript; a Python test asserting the base list IS an `argument_list` and its heritage is kept; a **GUARD**
over 12 languages that a plain supertype still survives; and two **per-grammar canaries** over
`node-types.json` — one baselining every grammar whose heritage node can reach an argument node, one
asserting exactly one grammar expresses a parent specification as an argument-shaped node. A new or upgraded
grammar with this shape fails the suite and points back here.

Verified in **both arms** (the pre-fix engine run from `HEAD:core.mjs`): the 8 defect tests fail before and
pass after; the GUARD, the Python test and both canaries pass **before and after**.

Full suite **1113 → 1125**, 0 failures. (The brief said 1825; this tree at `509e786` reports 1113 before the
change — 924 test files, all globs expanding.)

## Out of scope, found on the way (not fixed here)

- **Python** `class Foo(Bar, metaclass=Meta)` records `metaclass` and `Meta` as supertypes. `metaclass` is a
  keyword name and `Meta` is a metaclass, not a base. It arrives via the separate `superclasses`-field path
  above the heritage walk, so this fix does not touch it. Same defect class as 049.
- **Python** `class Baz(mod.Base)` records `mod`, `Base` and `mod.Base` — three entries for one base.
- **Kotlin** `class E : F by delegateThing` records `delegateThing`. It is an `explicit_delegation`, not an
  argument node, so `argRe` does not reach it. Same defect class, different shape.
- **Ruby** records no supertypes at all (`class Foo < Bar` → `[]`): the grammar's `superclass` node is not a
  heritage-matched direct child of its `class` scope node. A gap, not a fabrication.
- Kotlin fixtures need real newlines as statement separators inside class bodies; `class A : B { fun f() = 1 }`
  on one line fails to parse and yields no scopes silently.

---

## Rebase onto 0.3.0 (`ac1e8f2`) — re-measured, number reproduces exactly

The worktree was created from `601aa23`, **before** the 0.3.0 baseline, so the first pass measured a stale
engine (suite read 1113; a diff against main would have deleted 18k lines of release code). Rebased; the
`core.mjs` hunk conflicted with g30's `supKind`/`extendsClauseRe`/`implementsClauseRe` and was re-derived by
content, not by line:

- `argRe` inserted after `genArgRe`, among the new binding fields (`paramLike`/`retField`/`namedValueSpec`/
  `rcvCallable` all kept intact).
- The heritage walk keeps g30's `supKind` classification whole. The clause filter gained
  `&& !b.argRe.test(fieldOf.get(c2.id) || '')`; the single combined ancestor walk — which now also assigns
  `hKind` — stops on `b.genArgRe.test(anc.type) || b.argRe.test(anc.type)`. `inGenArg` renamed `inArg`.

g30's own comment ("the dedicated `superclasses` field and heritageRe's generic `argument_list` match are
never classified by anything more specific … so their names stay 'ext'") stays true, and becomes narrower:
after this change the only surviving `argument_list` heritage match is Python's `superclasses`.

**Re-measured on playframework against `main:core.mjs` — identical to the pre-rebase run:**

```
type scopes (before-arm): .java=1284  .scala=2336
changed=238   dropped=567   ADDED=0   emptied=4
```

The four emptied scopes are the same four Java enum constants in the same single file
(`ReadUncommitted(Connection.TRANSACTION_READ_UNCOMMITTED)`, …). The uppercase dropped names are unchanged
(`Helpers`×9, `Seq`×7, `Connection`×4, `Mode`×3, …), every one a call operand. So 0.3.0's extraction did not
move this result at all.

**A measurement trap worth recording.** An intermediate run reported 199 changed / 470 dropped and apparent
per-grammar type counts of scala 1815 / java 963, which looked like "0.3.0 extracts 22% fewer type scopes".
That was false. The probe walked the repo with 0.3.0's `EXT2GRAMMAR`, which now also admits yaml/json/toml/
properties; loading those grammars alongside scala/java in one process exhausted WASM memory, every later
`parse` threw `Aborted()`, and the probe's `catch { continue; }` silently dropped those files from BOTH arms.
Restricting the walk to the seven code extensions that can actually change put the numbers back exactly.
Two engine copies in one process is already near the WASM ceiling — keep such probes narrow, and treat a
`catch`-and-continue over parser failures as a silent undercount, not a clean sample.

Suite **1846 → 1858**, 0 failures (1846 baseline + the 12 new tests). `config.mjs` untouched.
Commit `4907893` on `fix/049`, +21/−4 in `core.mjs` plus the 210-line test file — no release code touched.

**Correction to the two lines above.** `main` advanced to `5470fe4` (instrument-D disclosure fixtures) while
this ran, so the branch was rebased once more — clean, no conflict. Final numbers: suite **1856 → 1868**,
**0 failures**. Four `# TODO` disclosure instruments (§041/046/053/057) report ✖ in the runner's output but
are counted `fail 0`; they fail identically with this hunk reverse-applied, so they are pre-existing and not
this change. Final commit **`17f5e08`** on `fix/049`: +21/−4 in `core.mjs` plus the 210-line test file,
`config.mjs` untouched, nothing else in the diff against main.
