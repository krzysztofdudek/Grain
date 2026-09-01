# 043 work log — Solidity modifiers are now modelled

## The grammar's own view — reachable, so no boundary here

The ticket asked first whether tree-sitter-solidity exposes a modifier invocation as its own node with a field.
It exposes it as its own **named node**, declared among `function_definition`'s own non-field children — but with
**no fields at all**:

```
function_definition   children = [modifier_invocation, override_specifier, state_mutability, virtual,
                                  visibility, parameter]
modifier_invocation   named=true   fields={}   children=[call_argument, identifier]
```

So the strictly field-driven route (`b.scope`, `b.retField`, `b.namedValueSpec`) is unavailable, and the
node-type-NAME vocabulary that fills `b.deco` (`/decorator|annotation|attribute_list/`) does not match it either.
That is why 0 of 134 conventions mentioned a modifier: `s.decos` was simply always empty for Solidity.

## The derivation used instead — shape, not name

A decoration is a **named, field-less** node type that a scope declares among its own non-field children, is not
already read as heritage (`b.heritageRe`), and whose own declared children include **both** a name-shaped type and
a call/argument-shaped one — "apply this named thing, with arguments, to this declaration".

The conjunction is what carries the rule. Every neighbour that shares `modifier_invocation`'s position fails one
half of it, and the intermediate rules were measured before settling on this one:

| candidate | children | verdict |
| --- | --- | --- |
| `modifier_invocation` (solidity) | `call_argument`, `identifier` | **admitted** |
| `base_list` (c_sharp), `base_clause` / `class_interface_clause` (php) | types/names, no arguments | rejected (also heritage) |
| `visibility_modifier` (rust), `virtual` / `visibility` (solidity) | bare keyword | rejected — no arguments |
| `type_parameter_constraints_clause` (c_sharp) | `identifier`, `type_parameter_constraint` | rejected — no arguments |
| `constructor_initializer` (c_sharp), `attribute_specifier` (c/cpp) | `argument_list` only | rejected — names nothing |
| `override_specifier` (solidity) | `user_defined_type` | rejected — no arguments |

Two earlier, looser versions were measured and discarded: requiring only a name-shaped child dragged in heritage
clauses and visibility keywords across 7 grammars; requiring only a call-shaped child dragged in C#'s `base_list`
and `constructor_initializer` and C/C++'s `attribute_specifier`.

**Result across all 23 shipped `node-types.json`: adds `modifier_invocation` to Solidity and nothing whatsoever to
the other 22.** Pinned by a test that replays the pre-existing node-type-name vocabulary and asserts the
*difference* is exactly `{ solidity: ['modifier_invocation'] }`.

## Second half: the sigil

`take()` in `extractScopes` only accepted decoration text starting with `@` or `[`, and a Solidity modifier is
written bare. Adding a sigil-less branch unconditionally caused **one** measured regression on the corpus: Kotlin's
`annotation` in `internal annotation class SuppressSignatureCheck` — a modifier *keyword* whose node type is
literally named `annotation`, so it was already in `b.deco` — became a decoration called `annotation`
(okhttp, `SuppressSignatureCheck.kt`, kotlin decoTotal 3998 → 3999).

Fixed by confining the bare spelling to `b.decoBare`, the structurally-derived set: the node-type-name vocabulary
matches only constructs every shipped grammar writes *with* a sigil, so bare text is never right for those. The
bare pattern is also anchored on the **whole** text (a name, optionally applied to an argument list), never a
prefix — so TS's `type_annotation` (`: string`), `asserts_annotation` (`asserts x`), Java/Groovy's
`annotation_type_element_declaration` (`String value();`) and `annotation_type_body` (`{ … }`) all fail it anyway.

## Per-language decorator diff (the check the task asked for)

Corpus: leveldb, OpenZeppelin, telescope.nvim, 5 Rust repos, 9 wcorpus repos, the Grain repo. After the
`decoBare` confinement, **exactly one grammar moves**:

```
grammar     decoScopes(b→a)  decoTotal(b→a)  distinct(b→a)
solidity        0 → 140         0 → 140        0 → 20
(c_sharp, java, javascript, kotlin, php, python, scala, typescript, tsx: all byte-identical)
```

Solidity's top decorations, previously empty: `initializer` 20, `onlyRole` 17, `onlyOwner` 17, `onlyGovernance` 13,
`onlyInitializing` 13, `nonReentrant` 12, `onlyAuthorized` 11, `whenNotPaused` 6. Solidity's scope, type and
method counts are unchanged (4383 / 597 / 3346) — this fix adds decorations only.

## OpenZeppelin, before → after

- `grain where onlyOwner` now returns a **marker card**: `marker @onlyOwner — 10 carriers (package
  contracts/mocks)`, carrying the certified convention *"methods here are annotated with `@onlyOwner` — 100% of
  10 · held since 2023-10, last reinforced 2026-06"*. The ticket's first acceptance clause — "`onlyOwner` is
  learnable as a convention on OZ" — is met.
- Role groups now form on modifiers: «initializer+initialize», «onlyInitializing+init+sample»,
  «authorized+erc7821+executor». Structural templates now carry `modifier_invocation(onlyGovernance)` etc.
- Conventions 134 → 141.

### The planted `emergencyTransferOwnership` in `Ownable.sol` is still not flagged — measured, and not extraction

`grain explain contracts/access/Ownable.sol` now shows a row that could not exist before this fix:

```
[obs ] r7:method auto.deco:@onlyOwner = true   share 0.60  n 5  bits 1.6   ← THIS FILE DEVIATES
```

The fact is computed and carries positive bits, but **share 0.60** — within that role group only 3 of 5 members
carry `onlyOwner`, because OZ's internal `_transferOwnership` helpers legitimately omit it. Grain correctly
declines to certify a 60% fact. That is the loss constant doing its job on a genuinely mixed population, not a
gap in extraction.

A second, sharper measurement isolates the general mechanism. Planting the same function in
`contracts/mocks/account/paymaster/PaymasterERC721OwnerMock.sol`, where the convention *does* certify at 100% of
10, the identical function differs only by the modifier:

```
WITH    onlyOwner: nearest «onlyOwner+stake+withdraw» (10 members, requires @onlyOwner) at 0.83
WITHOUT onlyOwner: matched no group — best 0.33, floor 0.35 (CFG.minMemb)
```

So the deviant is pushed out of the group **by the very feature it deviates on**: `dec:` is a heavy clustering
signal, and dropping it costs more similarity than the floor allows. This is a general property of role
clustering, not Solidity-specific — it applies equally to a Java `@Transactional` or a Python decorator. No new
threshold was introduced and `CFG.minMemb` was not tuned, per instruction.

Where the convention certifies at directory level rather than group level, the omission **is** caught — see next.

## End-to-end proof, controlled fixture

A Solidity repo of guarded setters (8 contracts × 5 setters, all carrying `onlyGuard`), with the modifier and the
internal helper in a base contract in their own directory so `contracts/vault/` holds nothing but the guarded
setters, and a scripted backdated history so they are established by HEAD:

```
[NORM] d[contracts/vault]:method auto.deco:@onlyGuard = true   share 1.00  n 40  bits 21.8
```

An accepted convention. Planting the ticket's edit — a peer setter, same body, same name stem, no modifier:

```
grain check  → 1 known deviation(s) in your change
  local (contracts/vault/) convention: methods here are annotated with `@onlyGuard`
    25/25 established methods conform. Your method `setAlphaTargetEmergency` (line 33) is not annotated
    with `@onlyGuard`.
  (held since 2024-03, last reinforced 2024-07)  (preference gap 5.67 bits)
grain review → 1 finding(s)
```

Both acceptance clauses met in the fixture: the convention is learnable, and the omission is flagged.

## Known cosmetic wart, not fixed

Predicate ids are built as `'auto.deco:' + (d.startsWith('[') ? d : '@' + d)`, so a Solidity modifier renders as
`@onlyOwner` — a token that does not exist in the language. Correcting it means carrying a per-grammar sigil
through eight render/pid sites (`core.mjs` lines ~939, 1334, 1424, 1468, 2453, 2758–2768, 4051, 4101), which is
well outside this ticket and would change stored pid strings. Reported, not attempted.

## Tests — `plugins/grain/tests/solidity-modifiers.test.mjs`, 8 tests

Derivation confinement (the difference from the name vocabulary is exactly Solidity's `modifier_invocation`;
`b.decoBare` likewise). Extraction (a modifier is recorded, arguments and all; `onlyRole(DEFAULT_ADMIN_ROLE)`
records `onlyRole`; an internal helper genuinely records none; the modifier is never confused with the heritage
clause beside it). Regression guards for the sigil-less branch (Kotlin's `annotation class`; a TS type
annotation). End-to-end: the convention certifies, and `check` and `review` both flag the omission.

Verified red before the change: all four derivation/extraction tests fail on the pre-change engine. The two
regression guards pass on both, which is their job.

## Process

- `EXTR_V g30 → g31` **is required** — Solidity extraction output changes (decorations where there were none), so
  cached scopes/blobs for any repo containing `.sol` must be rebuilt. Not applied here; `config.mjs` untouched.
- Regression named: `tests/declaration-extraction.test.mjs` — its two per-grammar regressions (`b.namedValueSpec`,
  `b.retField`) iterate every shipped grammar including solidity, and both still pass.
- Full suite: **1797/1797 before → 1825/1825 after** (the extra 7 are §040 part 2, the extension mapping).
