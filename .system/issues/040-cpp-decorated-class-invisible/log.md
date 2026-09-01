# 040 work log — C/C++ declarations behind an export/visibility macro

## Headline: the ticket's three symptoms have two different causes, and the dominant one is not in `extractScopes`

The ticket's suspected area was `bindingFor`/`extractScopes` scope-name resolution. Measuring first, as instructed,
showed that the numbers the ticket reports come from the **extension map**, not from name resolution.

`EXT2GRAMMAR` in `config.mjs` maps `'.h': 'c'`. leveldb keeps its whole public API in `.h`, so those files are
parsed by the **C** grammar — which has no `class`, no `namespace` and no templates at all.

| file | as shipped (`.h` → C) | forced to the C++ grammar |
| --- | --- | --- |
| `include/leveldb/comparator.h` | **3 scopes** (the ticket's number): the file, `leveldb` — the *namespace*, recovered as a function — and one scope literally named `LEVELDB_EXPORT` | `Comparator` extracted correctly |
| `db/skiplist.h` | **11 scopes** (the ticket's number), `SkipList` absent | **32 scopes, `hasError=false`**, `SkipList` at L40 as `class_specifier`/kind=type |

Whole-repo census, 56 `.h` files in leveldb:

```
C grammar (shipped): 47 files with parse errors, 319 scopes,  45 of kind=type
C++ grammar        : 20 files with parse errors, 515 scopes, 163 of kind=type
```

So **trigger 3 (templates) is not a template bug at all** — the C++ grammar handles template classes perfectly,
`hasError=false`. And `what WriteBatch`'s false external-vendor claim follows from the same cause: the class is
declared in `include/leveldb/write_batch.h` (→ C), while `write_batch.cc` yields only qualified `WriteBatch::Put`
method names, so nothing anywhere declares the bare name.

Fixing that means touching `EXT2GRAMMAR`. Reported to the maintainer with the measurements above; **ruled on and
authorised** (parse-both, declared mapping wins ties — see "Part 2" below, which carries the measurements the
ruling asked for). A blind `.h` → cpp remap would have been wrong: real C headers exist, and 570 of them were
measured to confirm they stay on C.

## Correction to the ticket: trigger 2 is not a defect

The ticket lists "trailing attribute macros on methods" as one of three triggers, on the reporter's authority.
Under the C++ grammar it is benign, and the log should say so plainly. `void CompactMemTable()
EXCLUSIVE_LOCKS_REQUIRED(mutex_);` — the form that actually appears in a header — parses as:

```
field_declaration {type=primitive_type «void», declarator=function_declarator «CompactMemTable()»}
declaration      {declarator=function_declarator «EXCLUSIVE_LOCKS_REQUIRED(mutex_)»}   ← a separate sibling
```

The real method's signature is recovered correctly and completely. Neither node declares a `body` field, so
neither is in `b.scope`, so neither becomes a scope and the macro's token never reaches a name. The only effect
is that the file reports `hasError`. Nothing was broken and nothing needed fixing.

The macro DOES capture a name in one related shape the ticket did not describe — a trailing attribute macro on a
method that has a **body** (`void Remove(…) EXCLUSIVE_LOCKS_REQUIRED(mutex_) { … }`, 10 sites in leveldb). That
one is recorded as a boundary below, not fixed.

## Part 1 — what was fixed in `extractScopes`, and why it is needed regardless of the mapping

`.cc`/`.cpp`/`.hpp` hit the same declaration shape, and under the C++ grammar it was mis-kinded and its members
lost. The grammar's own view — neither grammar can parse a macro between the keyword and the name, because
nothing in the source says the token is a macro, so both **recover**, the same way:

```
class LEVELDB_EXPORT Comparator { … };          (tree-sitter-cpp)
  function_definition {type=class_specifier «class LEVELDB_EXPORT», declarator=identifier «Comparator»,
                       body=compound_statement}
    class_specifier {name=type_identifier}  «class LEVELDB_EXPORT»    ← body-less; its name is the MACRO
    identifier  «Comparator»                                          ← the real class name
    compound_statement  «{ … }»                                       ← the real class body
```

The real name is already in the declarator, where `scopeName` reads it. The macro is only ever the body-less
specifier's own `name`, and nothing reads it.

**The rule added** (`extractScopes`, one block before `const name = scopeName(ch)`): a scope the grammar names
through a `declarator` field, whose declarator chain declares no `parameters` anywhere, is not a callable — a
callable's name and its parameter list come from the same declarator, so a chain without one never spelled a
function. Then, on the node's own `type` field:

- it holds a **body-less type-declaring specifier** ⇒ this is a type, named by its declarator (`recoveredType`
  feeds `typeLike`);
- anything else ⇒ a construct the grammar could not recover a name for (a range-for's loop variable). Record
  nothing, but keep walking into it, exactly as a location node already does.

No macro is named anywhere. The shape occurs **25×** in leveldb and names `Cache`, `Comparator`, `DB`, `Env`,
`Slice`, `Status`, `Table`, `WriteBatch`, `Options`, `Range`, … and also `LOCKABLE`/`SCOPED_LOCKABLE` sites the
ticket never mentions — it is a shape, not a list.

**Confinement.** C and C++ are the only two of the 23 shipped `node-types.json` that declare a scope node with
both a `body` and a `declarator` field, so no other language can reach this rule. Pinned by a test that re-derives
that fact from the grammars.

## Measured effect (whole corpus, before vs after)

leveldb + OpenZeppelin + telescope.nvim + 5 Rust repos + 9 wcorpus repos + the Grain repo itself:

```
grammar   scopes(b→a)     types(b→a)   methods(b→a)
c           335 →  232      45 →  49     233 →  126
cpp        1678 → 1648     162 =  162    1438 → 1408
(every other grammar byte-identical on scopes, types, methods)
```

- **c, types 45 → 49**: the four real declarations recovered — `Options`, `ReadOptions`, `WriteOptions`, `Range`.
  The C grammar has `struct` (unlike `class`), so `struct LEVELDB_EXPORT Options {` recovers the same way and the
  declarator holds the true name.
- **c, −103 scopes**: fabrications removed — `namespace X {` recovered as a method named `X`, and macro-mangled
  definitions.
- **cpp, −30 scopes**: all 30 are range-for loop variables (27 `<anon>` from `for (auto& kv : m)`, plus `st`,
  `snapshot`, `fd` — verified individually in the source). No real declaration is lost; nothing was added, because
  leveldb's 25 macro-class sites are in `.h` files the shipped map sends to C.

**Macro tokens recorded as scope names, leveldb, C and C++ together:**

```
before: 257  — TEST_F 177, TEST 52, LEVELDB_EXPORT 14, LOCKS_EXCLUDED 9, LOCKABLE 2,
               EXCLUSIVE_LOCKS_REQUIRED 1, TEST_P 1, SCOPED_LOCKABLE 1
after : 240  — TEST_F 177, TEST 52, LOCKS_EXCLUDED 9, EXCLUSIVE_LOCKS_REQUIRED 1, TEST_P 1
```

The export/visibility family — all 17 — is gone.

## Part 1 in isolation, real leveldb (`.h` mapping still untouched at this point)

Re-indexed with only the `extractScopes` rule in place, to separate its effect from the mapping change:

- `grain what Options` → `include/leveldb/options.h:34–148 Options (type)` — fixed
- `grain what ReadOptions` → `include/leveldb/options.h:151–165`; `WriteOptions` → `168–186`;
  `Range` → `include/leveldb/db.h:35–41` — fixed. All four are `struct`, and the C grammar has `struct`, so the
  rule recovers them even while the file is still being read as C.
- `grain what LEVELDB_EXPORT` → names no declaration at all — fixed
- `grain what Comparator` / `SkipList` / `WriteBatch` → still not naming the real declarations; they are `class`,
  which the C grammar does not have. Closed by Part 2.

## Boundaries recorded, with measurements

Three shapes this rule deliberately does not reach, each pinned by a test. In all three the macro does not sit
*beside* a declaration, it *stands in for* one, so nothing in the grammar distinguishes it from the real thing.

1. **A macro that expands to a whole definition.** `TEST_F(DBTest, Empty) { … }` is, to the grammar, a function
   named `TEST_F` with two parameters and a body — identical in every field to a real function definition.
   230 of the remaining 240.
2. **A trailing attribute macro on a method WITH a body.** The grammar splits it in two: a body-less
   `field_declaration` carrying the real signature (not a scope), and a `function_definition` pairing the macro's
   declarator with the real body. Telling that apart from an in-class constructor (also a `function_definition`
   with no return type) needs the declarator's name compared against the enclosing class's — a different kind of
   rule. 10 of the remaining 240. The **body-less** form, i.e. a header declaration, is already benign: neither
   node has a body, so neither becomes a scope and the macro never leaks.
3. **An empty-bodied macro-decorated class.** `class MYLIB_EXPORT Empty {};` parses cleanly as a variable
   declaration whose type is a body-less `class_specifier` named after the macro — indistinguishable from the
   genuine forward declaration `class Slice;`, which grain extracts on purpose. Does not occur in leveldb: all 14
   of its `LEVELDB_EXPORT` classes have members.

One incidental note: which macro spellings trigger the C-grammar name leak is a property of that parser's error
recovery, not of the macro (`MYLIB_EXPORT` reproduces it; `LIB_API` recovers differently and binds the class
name). The test fixture uses one that reproduces, so the assertion is not vacuous.

## Tests — `plugins/grain/tests/decorated-declarations.test.mjs`, 13 tests

Triggers: export macro on a class; the same on a struct; trailing attribute macro; template class. Negatives: the
macro token is never a scope name under **either** grammar, and the C++ grammar recovers the real name. Controls:
ordinary functions, constructors, destructors and conversion operators stay methods; a function whose *return*
type is a body-less struct specifier stays a method (told apart by the one thing that differs — it has a parameter
list); a range-for variable is no longer a method. Confinement: no grammar but C and C++ declares a
declarator-named scope. Plus the three boundaries above.

Verified red before the change: 040/1, 040/1b, the macro-token test and the range-for test all fail on the
pre-change engine. The controls, confinement and boundary tests pass on both, which is their job.

## Part 2 — the extension mapping, on the maintainer's ruling

**Ruling implemented:** parse with the mapped grammar; if that tree has errors AND the alternative parses
*strictly* cleaner, use the alternative; otherwise keep the mapped one. `config.mjs` authorised for this change
only (version constants untouched).

**Where it lives.** `EXT_ALT` in config.mjs names the second grammar an extension may denote — one entry,
`'.h': 'cpp'` — and `parseFile` in core.mjs makes the per-file decision. Every parse site now goes through it:
the four in core.mjs (`fileLevelPreds`, `mine`, `checkFile`, and `check`'s live re-extraction), the blob parse in
history.mjs, and both selftest sites. History included deliberately — a `.h` that reads as C++ at HEAD but as C
in its old blobs would make every scope in it look newborn at every commit. That does not weaken §13.2 (language
from the historical PATH, never sniffed): the path still picks the candidates and picks the same two for every
version of the file; only which of the two spelled the bytes is read off them.

The failure measure is ERROR nodes **plus MISSING** ones, because a grammar records a failure as either —
measured on `class LEVELDB_EXPORT Comparator {`, C leaves 4 ERRORs and 0 MISSING, C++ leaves 0 ERRORs and 1
MISSING. The walk descends only into subtrees that carry a failure, so a clean file costs one check at the root
and never loads the alternative at all.

### Q1 — cost. Material on a header-heavy C++ repo; negligible elsewhere.

Cold index, `grain status` on an empty `.grain`, EXT_ALT off vs on, median of three runs each (variance under
1%):

| repo | `.h` | double-parsed | off | on | delta |
| --- | --- | --- | --- | --- | --- |
| abseil-cpp | 385 | 361 (94%) | 16144 ms | 19566 ms | **+3.4 s, +21%** |
| leveldb | 56 | 47 (84%) | 16204 ms | 16765 ms | +0.56 s, +3.5% |
| redis | 312 | 104 (33%) | 15759 ms | 16107 ms | +0.35 s, +2.2% |
| curl | 258 | 38 (15%) | 10467 ms | 10614 ms | +0.15 s, +1.4% |

**Stated plainly: +21% on abseil is material.** Two things bound it. It is a COLD-index cost only — the tree/blob
cache is keyed by blob hash, so re-indexes and every query pay nothing. And it scales with the share of `.h`
files the C grammar already failed on, which is the same quantity that measures how much the change is buying:
abseil pays 21% and gets 329 files' worth of correct extraction (scopes 2520 → 6680, types 323 → 1255), while
curl pays 1.4% and correctly gets almost nothing. Part of the delta is not the second parse at all but mining
the code that is now visible for the first time.

### Q2 — a real C project. Extraction is unchanged; the few moves that happen are correct.

EXT_ALT off vs on, same engine otherwise, so this isolates the mapping change alone:

| repo | `.h` | grammar moved | files whose extraction differs | scopes | types | methods |
| --- | --- | --- | --- | --- | --- | --- |
| redis | 312 | 7 | **4** | 2731 → 2739 | 1283 → 1286 | 1136 → 1141 |
| curl | 258 | 3 | **2** | 3184 → 3186 | 2913 → 2915 | 13 → 13 |
| abseil-cpp | 385 | 329 | 267 | 2520 → 6680 | 323 → 1255 | 1812 → 5035 |
| leveldb | 56 | 45 | 42 | 216 → 484 | 49 → 178 | 111 → 250 |

Six files in 570 real-C headers change at all. Every one inspected:

- `redis deps/hiredis/adapters/qt.h` and `examples/example-qt.h` — **genuinely C++** (Qt adapters). Under C they
  yielded 4 methods at off-by-one lines and no class; under C++ they yield `type:RedisQtAdapter@37` plus its
  methods at correct lines. The migration is a straight improvement, not a false positive.
- `curl include/curl/curl.h` — loses exactly one scope (`type:curl_httppost`) out of 71. Both grammars fail
  catastrophically on this file (776 vs 768 failures), so this is recovery noise in a file grain can barely read
  either way.
- `curl lib/curl_setup.h` gains three `type:passwd` entries; `redis .../jemalloc/atomic.h` and `bitmap.h` move
  but extract identically (1 scope → 1 scope). Inert.

The tie-break carries this result: 83 redis headers and 34 curl headers tie, and every one stays C.

### Q3 — is the ambiguity only `.h`? Yes, measured.

For every extension, over 5.6k files in 20 repositories, does a family sibling ever parse strictly cleaner:

```
.h    c    1011 files   550 errored   384 strictly cleaner as cpp     ← the real ambiguity
.c    c    1240 files   470 errored    30 strictly cleaner as cpp     ← noise, excluded
.cc   cpp   565 files   335 errored     2 strictly cleaner as c       ← noise, excluded
.ts .tsx .js .mjs .jsx .json .yaml .yml .toml .gradle .hpp .cpp .scala .groovy   →  0, every one
```

`.c`'s 30 are all jemalloc headers where BOTH grammars fail badly and C++ merely fails less (210 failures → 200)
— a second reading of the extension is not what is being measured there, so `.c` is excluded. `.cc`'s 2 are the
same in the other direction.

One further result worth recording, because it rules out the obvious generalisation: a search over ALL 23 shipped
grammars instead of a declared sibling is not merely slower, it is **wrong**. php, yaml and properties accept
arbitrary text and so "parse cleaner" than any real grammar on anything — measured, the php grammar beat C on 20
of leveldb's 56 headers, 75 failures down to 0. Ambiguity is a property of the file-naming convention, which is
what `EXT2GRAMMAR` already is (§6.1), so it is declared rather than discovered.

### The residual: the tie-break is conservative, and that costs some C++ headers

Ties keep C, and the C grammar's error recovery is forgiving enough that a simple `namespace`/`class` header can
parse with zero failures. So some genuinely C++ headers stay on C:

- leveldb: 11 of 56 stay on C, **7 of them contain `namespace`/`class`/`template`**
- abseil-cpp: 56 of 385 stay on C, **29 of them do**

That is 8–13% of C++ headers left on the wrong grammar, in exchange for 100% of C headers protected. It is the
trade the ruling chose, and the number is here so it can be revisited rather than assumed. (leveldb's
`include/leveldb/options.h` is one of them — and Part 1's rule already recovers its four `struct` types under C,
so the two halves cover for each other there.)

### Acceptance — all three ticket symptoms, re-indexed leveldb

```
grain what Comparator  → include/leveldb/comparator.h:20–55 `Comparator` (type)      ✔ (ticket asked for :20)
grain what SkipList    → db/skiplist.h:40–140 `SkipList` (type) + 18 members         ✔ (ticket asked for :40)
grain what WriteBatch  → include/leveldb/write_batch.h:33–40 `WriteBatch` (type)     ✔ no external/vendor claim
```

Repo totals: 134 files, **2068 scopes** (was ~1400). `grain explain include/leveldb/comparator.h` still reports
3 scopes, but they are now `Slice`, `Comparator` and the file — where before they were the namespace recovered as
a function, the macro token, and the file. The class's six methods are pure-virtual **declarations** with no
body, and a bodiless `field_declaration` is not a scope in any language; that is pre-existing and unrelated.

### Definitive per-language census, bucketed by the grammar actually used

19 repositories, both halves of this ticket plus 043 in place:

```
grammar     files(b→a)      scopes(b→a)        types(b→a)      methods(b→a)   decoTotal(b→a)
c *        2253 →  1869   33583 →  29584   11248 →  10918   20082 → 16797         0  =
cpp *       575 →   959   14498 →  20279    1407 →   2827   12493 → 16465         0  =
solidity *  420  =         4383  =           597  =          3346  =              0 →  140
(bash, c_sharp, go, groovy, java, javascript, json, kotlin, lua, php, properties, python, ruby,
 rust, toml, typescript, yaml — every field byte-identical)
```

Net across C and C++: **+1090 types, +1782 scopes**. Exactly three grammars move, all three by design.

### Tests — `plugins/grain/tests/ambiguous-extension.test.mjs`, 7 tests

`EXT_ALT` is exactly the measured entry and names a shipped grammar (with `.c`/`.cc` asserted absent); a C++
header the C grammar fails on is read as C++ **and the arithmetic is asserted** (C 3 failures, C++ 0) so the test
pins the rule, not just its outcome; a plain C header stays C; a tie keeps C **when both grammars fail equally**
(2 vs 2) and again when both parse cleanly; an extension with no second reading is never re-parsed; and one repo
can hold both readings of `.h`, which is why the decision is per file rather than per repository.

## Process

- `EXTR_V g30 → g31` **is required** — C and C++ extraction output changes twice over (the `extractScopes` rule,
  and 384 `.h` files now read with a different grammar), so cached scopes/blobs for any repo containing them must
  be rebuilt. Not applied here, per instruction — it folds into the maintainer's single batched bump.
- `config.mjs` touched ONLY for `EXT_ALT`, on the maintainer's explicit authorisation. `ENGINE_VERSION`,
  `EXTR_V`, `MODEL_V` and `HIST_V` are untouched.
- Regression named: `tests/declaration-extraction.test.mjs` — "regression: `b.namedValueSpec` is empty for every
  shipped grammar except go" and "regression: `b.retField` is pinned exactly for every shipped grammar that has
  one" both iterate every grammar including cpp/solidity, and both still pass.
- Full suite: **1797/1797 before → 1825/1825 after** (`cd plugins/grain && npm test`).
