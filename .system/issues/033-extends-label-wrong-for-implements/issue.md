# 033 · A class that only `implements` is reported as `auto.extends:` — the label is factually wrong

**Status:** FIXED (verified independently; EXTR_V g29→g30 for 033)
**Found by:** round 3, PHP/Slim, 2026-09-01
**Severity:** low-medium — small fix, but it is grain stating something untrue in its own output

## Symptom

`grain explain Slim/Middleware/ErrorMiddleware.php`:

```
d[Slim/Middleware]:type auto.extends:MiddlewareInterface = true, share 1.00, bits 3.8
```

`ErrorMiddleware` **implements** `MiddlewareInterface`. It extends nothing. A PHP developer reading that line
literally is told something false about their own class — `extends` and `implements` are distinct keywords with
distinct semantics in PHP (single inheritance vs multiple interface conformance), and conflating them is not a
harmless abbreviation.

The same conflation presumably reaches Java, C#, TypeScript and Kotlin, all of which distinguish the two.

## Not a bug in the mechanism — only in the name

The underlying fact is correct and useful: the tester confirmed clustering genuinely uses it
(`Slim/Middleware` earned its own group at share 1.00 rather than collapsing into one blob), which was one of the
open questions about whether interface-driven codebases cluster at all. So the extraction and the mining are
right; the pid's human-facing name is wrong.

`sup:` (the internal feature) is neutral and fine. The rendered `auto.extends:` is the problem.

## Complication worth checking before renaming

`auto.extends:` is a **pid string**, and pids appear in places a rename would touch:
- `.grain/seeds.jsonl` — committed maintainer decisions reference pids by name (`--surfaces auto.extends:X`)
- `grain export`'s published schema and its `featureOf()` mapping (`export.mjs`)
- `STRUCT_PID` and other regexes that match on pid prefixes
- `docs/reference.md`'s documented vocabulary

So this is not a one-line string edit. Options: rename the pid (breaking, needs a migration story for existing
seeds); keep the pid and fix only the *rendered* text (`verbalize`); or introduce a separate pid and treat the old
one as an alias. **The middle option is probably right** — the pid is an internal key, the rendered sentence is
what a human reads — but establish where `auto.extends:` is user-visible versus internal before choosing.

Whatever is chosen, grammars where the distinction does not exist (Go's implicit interfaces, Rust traits, Python)
must keep working unchanged.

## Acceptance

A PHP/Java/TS fixture where a class only implements: the rendered convention says "implements", not "extends". A
class that genuinely extends still says "extends". Existing `.grain/seeds.jsonl` files referencing
`auto.extends:` keep working, or a migration is documented. `export`'s schema consumers are considered explicitly.
