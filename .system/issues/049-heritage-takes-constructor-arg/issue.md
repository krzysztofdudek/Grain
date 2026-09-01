# 049 · `extends Type(args)` records the constructor ARGUMENT as the supertype — Play's commonest class shape groups by parameter name

**Status:** FIXED (verified: 4/8 red before merge → 12/12 after; main 1878). `argument_list` STAYS in heritageRe — Python `class_definition.superclasses` IS an argument_list, the only such pair in 23 grammars. Real cause: `descendantsOfType` descending into a call's arguments inside a genuine clause (Scala, Kotlin, C#, Solidity, C++, JS). Fix: `argRe` field-driven predicate — clause held in an argument-named field is a call, skipped; ancestor walk stops on an argument node. Play: 238 scopes changed, 567 fabricated supertypes dropped, 0 added, 4 emptied (Java enum constants whose "supertype" was their ctor arg). No language loses real heritage. EXTR_V g31 pending.
**Found by:** round 4 field test, Scala/playframework, 2026-09-01
**Severity:** HIGH — a wrong fact, stated confidently, on the most common class shape in the repo

## Symptom

```scala
class HomeController @Inject() (cc: ControllerComponents) extends AbstractController(cc)
```
grain reports `--surfaces auto.extends:cc`. Written `extends AbstractController(c)`, it reports
`auto.extends:c`.

Two structurally identical controllers land in **different** synthetic groups
(`Inject+AbstractController+cc` vs `…+c`) purely because of a local parameter name.

## Root cause — confirmed, `core.mjs:35`

```js
heritageRe: /heritage|extends|implements|superclass|super_interfaces|base_|superclasses|argument_list|…/
```

**`argument_list` is in the heritage vocabulary.** For a language whose extends clause is a constructor call,
that matches the call's argument list, and the identifier taken from it is the *argument*, not the type. The
type name is right there in the same clause and is being passed over.

## Why it matters beyond Scala

- It is a **fabricated fact**, not a gap: grain asserts a supertype relationship that does not exist. Same class
  as §045 (`what assert_eq` → "implements/extends it in 230 files") and §040 (`LEVELDB_EXPORT` as a scope name).
- It **poisons clustering by a purely local name**, which is the opposite of "kod to kod": two identical classes
  are separated by what someone called a constructor parameter.
- The reporter suspects it is a contributing cause of the twin-suggestion noise measured in §044. Worth checking,
  but do not assume it — §044's null model found the gate admits at the population median, which is a separate
  fault.
- **Check every language whose extends clause can carry arguments** — Scala, Kotlin, and any other grammar where
  `argument_list` is reachable from a heritage node. This may not be Scala-only.

## Constraint

`argument_list` is presumably in `heritageRe` because some grammar expresses the parent list that way. Removing
it blindly may lose real heritage. Establish per-grammar which node types actually reach it, and prefer the
type-named child over the argument list within the same clause — derived from `node-types.json`, no language
names.

## Acceptance

`extends AbstractController(cc)` records `AbstractController`. A per-language diff showing no other grammar's
heritage output changes, or an explanation of any that does. Test over a Scala fixture plus whichever other
languages are reachable.
