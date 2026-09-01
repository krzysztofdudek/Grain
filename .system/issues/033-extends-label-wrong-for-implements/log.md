# Work log — 033

Decision handed down: `auto.extends:` stays the pid; fix only the rendered text. Derive the implements/extends
distinction, don't guess; don't invent a language-name list.

## Is the distinction derivable? Yes — from real node-type structure, per grammar

Inspected every shipped `tree-sitter-*.node-types.json` directly (not assumed). Result:

- **PHP**: `base_clause` (extends — single base class) vs `class_interface_clause` (implements), two distinct node
  types, both direct children of `class_declaration`.
- **Java/Groovy**: `superclass` (extends) vs `super_interfaces` (implements a list), plus `extends_interfaces` (an
  INTERFACE extending other interfaces — genuinely the `extends` keyword, not `implements`).
- **TypeScript/TSX**: `extends_clause`/`extends_type_clause` (extends) vs `implements_clause` (implements), both
  nested inside a `class_heritage` wrapper node (not direct children of `class_declaration` — required walking one
  level deeper than the old flat heritage-identifier scan did).
- **C#**: `base_list` is one undifferentiated list for the base class AND every implemented interface — genuinely
  no syntactic marker. Confirmed by inspection, not assumption: the issue's framing ("C# distinguishes the two
  keywords") is not accurate — C# has no `implements` keyword at all.
- **Kotlin**: `delegation_specifier` holds `constructor_invocation` (parens ⇒ likely a real superclass call) or a
  bare `type` (ambiguous — could be an abstract class with no primary-ctor args) — not reliably classifiable
  without over-reaching; left unclassified.
- **Rust/Scala/Solidity/C++**: no distinct implements-shaped clause type either; left unclassified.
- **Go/Python**: confirmed structurally excluded (Go: no heritage clause node type exists at all; Python: single
  `superclasses` field, always inheritance-shaped, no interface concept).

So: the distinction is genuinely present in the AST for PHP/Java/Groovy/TS, and genuinely ABSENT (not merely
unextracted) for C#/Kotlin/Rust/Scala/Solidity/C++/Go/Python. It did NOT previously survive into the model — `sup`
was (and stays) a flat array of names with no per-name clause-kind tag.

## What was built

1. `bindingFor` gains two narrow regexes, `extendsClauseRe`/`implementsClauseRe`, built from the exact node-type
   names found above — same word-list-on-node-type-name idiom as `TYPE_LIKE_RE`/`FUNC_LIKE_RE` already use (not a
   language-name branch).
2. `extractScopes`' heritage walk now also builds `s.supKind` (name → 'ext'/'impl'), reusing the SAME upward walk
   that already excludes generic-argument identifiers, extended one level to also classify by the nearest matching
   clause ancestor (or `c2` itself, for PHP/Java where there's no wrapper).
3. `serializeScope` persists `supKind`; `hydrateScope`'s existing `{...r}` spread carries it through for free.
4. `learn()` builds `model.heritageKind` once, repo-wide: a name classified the same way everywhere is trusted; a
   name classified BOTH ways (rare — a class and interface sharing a name across files) is dropped, not guessed.
5. `verbalize`/`deviationPhrase` read `f.heritageKind` off the fact object passed in (no new function parameter) —
   'impl' → "implement(s)", anything else (including absent) → "extend(s)", the pre-existing wording.
6. `heritageKindOf(pid, model)` exported helper, used to attach `.heritageKind` at every place a fact-shaped object
   reaches verbalize: the canonical `ef` construction in `learn()` (plus its `siblings` array), and every ad hoc
   `{pid, exp, kind}` built for a steer/waiver at render time (`checkFile`, `buildCards`, `report`, `rulesMarkdown`,
   `grain.mjs`'s `scopeSurfaces`/`cmdSeed`). Real fact objects sourced from `part.facts` (or spread from one, e.g.
   `{...sb, kind: f.kind}`) already carry `.heritageKind` for free — no touch needed at those call sites.

## Before / after

TS fixture (`tests/fixtures/build-fixture.mjs`): `CanActivate` is `export interface CanActivate {...}`, and
`FooGuard implements CanActivate`.

- Before: `local (src/guards/): types here extend \`CanActivate\` — 100% of 29 established ...`
- After: `local (src/guards/): types here implement \`CanActivate\` — 100% of 29 established ...`
  (negative polarity too: `group «BaseDto+dto»: types here do not implement \`CanActivate\` — 100% ...`)
- `BaseDto`/`BaseService` (genuine `extends`) unchanged: `types here extend \`BaseDto\` — 100% ...`

`tests/grain.test.mjs`'s pre-existing `report finds the planted conventions` test hardcoded the OLD (buggy)
`'types here extend \`CanActivate\`'` — updated to `'types here implement \`CanActivate\`'`, with a comment
explaining why.

## Tests added

New file `tests/heritage-kind-label.test.mjs` (11 tests):
- Extraction-level: PHP (`base_clause`→ext, `class_interface_clause`→impl), Java (`superclass`→ext,
  `super_interfaces`→impl, `extends_interfaces`→ext), TypeScript (`extends_clause`→ext, `implements_clause`→impl,
  both nested in `class_heritage`), C# (`base_list` → unclassified, confirmed for base class AND every interface),
  Go (no node type matches either classification regex), Rust (a supertrait bound stays unclassified), Python
  (dedicated `superclasses` field → ext, unchanged).
- Render-level: `verbalize`/`deviationPhrase` unit tests for unclassified (byte-identical "extend"/"extends"),
  'impl' (both polarities), explicit 'ext' (genuine inheritance keeps its word).

## Load-bearing proof

1. Hand-reverted the extraction loop's classification (regex checks removed, back to the original flat walk) —
   PHP/Java/TS unit tests in `heritage-kind-label.test.mjs` failed exactly as expected (supKind undefined).
   Restored, re-verified green.
2. Hand-reverted the `ef` construction's `heritageKind`/siblings-mapping lines — `grain.test.mjs`'s report test
   failed (`CanActivate` reverted to "extend"). Restored, re-verified green.

## MODEL_V / EXTR_V

**Correction to the brief**: this needs `EXTR_V`, not `MODEL_V`. `supKind` is a new field on the EXTRACTED scope
object (`extractScopes`/`serializeScope`), not a model-shape addition over already-extracted data — config.mjs's
own EXTR_V comment history (g25/g26/g27/g28/g29) is explicit that "extraction output changes ⇒ cached
scopes/blobs from before this version must be rebuilt" is an EXTR_V bump, and MODEL_V's own doc says it "forces a
re-learn, not a re-parse" — a MODEL_V-only bump would re-mine over STALE cached scopes that never got `supKind`,
silently degrading to "unclassified" (safe, never wrong, just delayed) until every file is naturally reparsed.
Did not touch config.mjs, per instruction — reporting the exact bump needed instead.

## Process note

Same shared-tree concurrency issue as 030 — `engine/core.mjs` and `engine/grain.mjs` were both fully reverted to
pre-my-edit state by a concurrent write from another agent partway through this task (confirmed via grep going
from "present" to "completely absent" between two of my own tool calls, no error). Re-applied every hunk from
scratch, re-verified with `node --check` + grep counts + full suite run immediately before finishing.
