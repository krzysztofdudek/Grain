# 048 · Solidity modifiers render as `@onlyOwner` — grain prints a sigil the language does not have

**Status:** OPEN — cosmetic, but it is an honesty defect
**Found by:** fix-040-043 agent, reported not fixed, 2026-09-01
**Severity:** low

## Symptom

With §043 landed, Solidity modifier facts render with an `@` prefix: `auto.deco:@onlyOwner`,
"annotated with @onlyOwner". Solidity has no `@` sigil — the source reads `function f() onlyOwner { … }`.

## Why it is worth fixing rather than shrugging at

Grain's whole claim is that it reports this codebase in this codebase's own terms — "kod to kod". Printing
syntax the language does not have is a small violation of exactly that, and a reader who copies the rendered
form gets something that will not compile. It also makes the output look like it was written for Java and
retrofitted.

## Cost, as reported

Correcting it means threading a per-grammar sigil through **eight** pid/render sites. That is real work, not a
drive-by — which is why it was correctly reported rather than bundled into §043.

## Constraint

The sigil must be **derived**, not listed. A hardcoded `{solidity: '', java: '@'}` map is a language name list
and is forbidden. Establish whether the grammar's own node types expose the decoration's introducing token — if
they do, the rendered form should come from the source text rather than a constant. **If it cannot be derived,
say so**; that is a boundary, and rendering the bare name with no sigil at all may then be the honest fallback.

## Acceptance

Solidity modifier facts render in a form that appears in Solidity source, without a language list. Test asserting
the rendered form for at least one sigil language and one sigil-less language.
