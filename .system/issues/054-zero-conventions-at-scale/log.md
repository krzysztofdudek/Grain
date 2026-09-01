# 054 — investigation log

## Measurement — 2026-09-01 (engine 0.3.0 / g30 / m23, worktree copy, nothing landed)

Instrumented `mine()` with an env-gated acceptance funnel (a rejection-reason counter at every `continue`, plus
per-cell `bits`/`idxCost`/`neff`/`K`/λ rows for probed pids) and drove `learn()` from a standalone script that reads
the repo's cached scope tree and **never writes the repo's store**. Fixtures: scratchpad `symfony-mid`
(89,174 scopes, 12,476 files, 93 partitions), `symfony-full`, `petclinic`.

### The headline: §054 is three unrelated diseases, and none of them is λ

| clone | what actually happens |
| --- | --- |
| `symfony-shallow`, `symfony-mid` | history fail-closed → 0 conventions (D1) |
| `symfony-full` | **hard crash**, no model at all (D3) |

### D1 — the survived-population gate, on a clone that has 16 years of history

Funnel on `symfony-mid` (93 partitions, one shared repo-wide `idxCost` = 18):

```
00_scored              262591     cells reaching the codelength test
02_bits_le_0           242011     die on evidence
03_lambda_weighted       5906     die on the λ posterior-predictive bound
04_sraw_minRaw          14674  ←  clear BOTH, then die because sraw = 0
13_ACCEPTED                 0
```

All 14,674 survivors die at one line — `if (sraw < CFG.minRaw)`. `sraw` is zero for every cell because
`mkWeightFn(null)` returns `ageFn: null`, `learn()` substitutes `() => 0`, and `0 >= CFG.freshDays` is false for
every scope in the repository. Re-running the identical model with `surv` forced true:

```
0 conventions  →  1446 conventions        (9790 reach the post-filters; 1536 cells accepted before dedup)
```

So the acceptance mathematics is not what silences Symfony. The trigger is upstream: `loadHistory` returns
`{ mode: 'none' }` for **any** repository `git rev-parse --is-shallow-repository` calls shallow, regardless of depth.
`symfony-mid` is a depth-limited clone holding **79,767 commits back to 2010-12-10** — a graft boundary 15 years
older than `CFG.survDays` (120d) and `CFG.freshDays` (14d). Every survival question grain asks is answerable from
the commits present; grain discards all of them on the strength of a 10-line `.git/shallow` file.

Disclosure is uneven. `status` is exemplary:
> `0 conventions · … — no git history: nothing counts as established, so no convention is spoken`

`check` on a Command file is not:
> `governed by 0 convention(s) · no strong convention governs this file — grain has nothing certified for this kind
> of file here; that is not approval`

which reads as a statement about *this file*, when the true statement is *this repository, for this reason*.
`selftest` prints `0/0` (`mutateTest` iterates `part.facts`; with none there is nothing to plant) — §046's
"empty by construction" reading, with a knowable reason that is never printed.

### D2 — the ticket's headline surface is never extracted

The planted `SecretsFooCommand.php` could not have been caught with perfect history either. PHP writes attributes
`#[Attr]`; `extractScopes`'s decoration sigil test accepts only `@` or `[`:

```js
const m = /^[@[]/.test(t) ? t.match(/^[@[]\s*([\w.]+)/) : b.decoBare.has(d.type) ? … : null;
```

`b.deco` for PHP correctly holds `attribute_list`, the node is found, its text is `#[AsCommand(name: …)]`, and the
regex rejects it. Measured on `AboutCommand.php`: `decos=[]` beside `sup=["Command"]`. Repo-wide, Symfony's
model.json holds **zero** `auto.deco:` predicates and **zero** `deco:` markers against **6,305 attribute
occurrences in 2,173 files** (2,579 `#[DataProvider]`, 137 `#[AsCommand]`, 116 `#[Route]`, …). `rules` "sees"
`#[AsCommand]` only because the superposition skeleton renders raw syntax; the predicate layer never had it.

Every other shipped language is unaffected — `@` covers Java/Kotlin/Python/TS, `[` covers C#, `b.decoBare` covers
Solidity — so this is PHP-only and total.

Measured counterfactual (sigil widened to `#[`, full re-extraction of all 12,476 files, survival forced):

```
accepted auto.deco: facts        0  →  37
_all:type auto.deco:#[AsCommand]=true   raw 30        ←  §054's planted case, now enforceable
r9:method auto.deco:#[TestWith]=true    raw 23
r2:method auto.deco:#[DataProvider]=true raw 10
```

**A `SecretsFooCommand.php` omitting `#[AsCommand]` would be flagged by `check`.** Total conventions move
1446 → 1456; the deco facts largely displace weaker sibling surfaces through the existing dedup, so the value is
not the count but that the enforceable surface is the one a PHP reviewer actually names.

One detail for whoever lands it: `applyVocab` prefixes `@` unless the recorded name starts with `[`, so the pid
currently renders `auto.deco:@#[AsCommand]`. That test needs to accept `#[` too, so the sigil travels as written.

### D3 — the full clone does not return 0, it crashes

`grain refresh --full` on `symfony-full` (82,946 commits, genuinely not shallow), 14 GB heap, ~35 min:

```
[grain] [history] fps cap 20000: dropped 21895 oldest footprint(s)
[grain] RangeError: Invalid string length
    at JSON.stringify (<anonymous>)
    at loadHistory (engine/history.mjs:270:39)
```

`history.mjs:270` is `atomicWrite(store.historyPath, JSON.stringify(state))`. The replay state for 82,946 commits
exceeds V8's maximum string length, so the walk completes and then throws while serialising. No store is written,
no model exists, and the only user-visible output is the bare line `[grain] Invalid string length`.
**This is §055's answer**: not an unbounded walk, not OOM — a single `JSON.stringify` over the V8 string cap, at a
named line. It should go to that ticket.

### Q2 — the universe is NOT widened by data grammars

Tallied, per candidate cell, how many of its members are `json`/`yaml`/`toml`/`properties` scopes:

```
candidate cells                 262591
fed ONLY by data-grammar scopes     87
a data scope merely entered       6366
```

Removing data grammars from the universe entirely leaves `log2(C)` at 18. §058's cross-grammar leak is a real
bug about *what a cell says*; it is not the cause of §054. Symfony is 11,309 PHP files against 1,144
json/yaml files, and a data file yields one scope.

### Q3 — neff is not starving, and the index cost is not worth attacking

Counted, for every cell dying at `bits <= 0`, whether it would pass with a smaller index cost:

```
positive before idxCost, negative after      44321
would pass at idxCost − 1                      710
                       − 2                    1306
                       − 3                    2141
                       − 4                    2913
                       − 6                    5032
                       − 8                    7369
```

The index cost suppresses a great deal, but the band near the line is thin: pretending the repository were 256×
smaller (18 → 10 bits) recovers 7,369 of 44,321. Buying bits back is a bad trade compared with D1's 14,674, and a
hierarchical re-code (`log2(#contexts) + log2(#pids|context)`) only redistributes — it satisfies Kraft with
equality and sums to the same 18 on average, making *local* cells in crowded contexts dearer, which is the wrong
direction. **Recommend leaving λ and idxCost exactly as they are.**

The shape of what *does* certify at Symfony scale settles the "small populations cannot pay 18 bits" worry:

```
accepted by context     _all 282 · role 969 · dir 205
accepted by population  5-19: 677 · 20-49: 394 · 50-199: 270 · 200+: 115
```

Two thirds of accepted facts are role cells and 677 of 1,456 stand on populations of 5–19. A refinement cell's
`data` term is a likelihood ratio against a parent that *disagrees*, and that ratio can be large at n = 10; it is
unanimity-against-an-agreeing-parent (petclinic's 13-of-13 `@Test`, 4.05 bits) that cannot pay, at any repo size.
`neff` is not starving and the ambiguous half-vote (§008) is not the blocker here.

### The one obvious fact, dissected

`_all:file · auto.imp:Symfony\Component\Console\Attribute\AsCommand`, in the partition holding the Commands:

```
counts {true: 29, false: 2}   raw 31   neff 31   K 2
data 20.24 − BIC 2.48 − idxCost 18.00 = bits −0.24        λ 0.9219 ≥ 0.8750 ✓ (passes)
```

29 of 31 files import the attribute; the λ bound passes comfortably; the fact misses acceptance by **a quarter of
a bit**, with the index cost taking 18 of its 20.24 bits of evidence. Its sibling
`_all:type · auto.extends:Command` is 24 of 30 — `bits −12.12`, `λ 0.7903 < 0.875` — correctly silent, because
20% of the types in that partition genuinely do not extend `Command`. And
`d[…/Console/Tests/Fixtures]:type · auto.extends:Command` is 33 of 64: `bits +16.8` but `λ 0.5154` — also
correctly silent. Only the first is a near miss, and it is a near miss on a *proxy* for the attribute, because the
attribute itself (D2) does not exist as a predicate.

### Q4 — the template share

```
symfony-mid:  2655 role groups · 822 role profiles · 209 unclustered templates · 0 facts
```

1,031 template-shaped artifacts against zero enforceable ones, which is why every `rules` line carries
`TEMPLATE_DESCRIPTIVE_NOTE`. Under the D1 counterfactual it would be 1,031 template-shaped against ~1,446
enforceable — templates are ~42% of the artifacts, not the whole story. §030 already decided this asymmetry
(option 2, shipped): the note is a correct disclosure, not the §054 defect. Nothing here argues for feeding the
template path into `check`.

### Q5 — side by side, same fact shape

Both sides measured by the same instrumented 0.3.0 engine, in the same run shape. The annotation-on-a-role-group
fact is the same shape in both: petclinic's `@Test`, Symfony's `#[AsCommand]`.

```
petclinic    375 scopes ·  3 partitions · C =    424 · idxCost  9 · history full · 6 conventions
symfony-mid 89174 scopes · 93 partitions · C = 261673 · idxCost 18 · history NONE · 0 conventions
```

petclinic's `auto.deco:@Test` cells, all terms printed:

```
_all:method  @Test=true  74.5/95.5   data 22.92 − BIC 3.29 − idx 9 = +10.63   λ 0.777 ✗ (correctly silent)
r5:method    @Test=true  13/13       data  4.05 − BIC 1.85 − idx 9 =  −6.80   λ 0.964 ✓
```

Symfony has **no `auto.deco:` cell at all** (D2), so there is nothing to line up against these until the sigil is
fixed; once it is, `_all:type auto.deco:#[AsCommand]=true` certifies on raw 30 at the full idxCost 18.

The instructive row is petclinic's second one. A **unanimous 13-of-13** role cell earns only 4.05 bits, because a
refinement cell's `data` term is a likelihood ratio against its parent and that parent already predicts `true`
78% of the time. Unanimity against an agreeing parent carries almost no information, at any repository size. What
*does* pay is a cell whose parent disagrees — which is why 969 of Symfony's 1,456 counterfactual facts are role
cells and 677 stand on populations of 5–19, at the full 18-bit index cost. The scale headwind is real (`log2(C)`
grows while local contrast does not) but it is second-order here, and the Q3 ladder says paying it down is not
where the usefulness is.

(Provenance caveat: the petclinic store on disk was rebuilt mid-investigation by another agent running the older
0.2.1/g24/m15 engine. None of its numbers are used above — every figure in this section comes from the 0.3.0
instrumented run.)

### Recommendation

Ordered by measured usefulness. **No new constant is proposed, and λ and `idxCost` are untouched.**

**R1 — stop discarding a shallow clone's history when it is deep enough to answer the question.** `loadHistory`
refuses on `is-shallow-repository` alone. Every survival question grain asks is relative to `CFG.freshDays` (14d)
and `CFG.survDays` (120d); a clone whose graft boundary is older than those can answer all of them. Gate on the
graft's age against constants that already exist rather than on the shallow *flag* — a derived rule, not a tuned
one. Scopes born before the graft read as born at it, which is conservative in the safe direction (they look
younger, so they are *less* likely to count as established). `held since` dates become lower bounds and should say
so. **Measured: 0 → ~1,446 conventions on a clone holding 79,767 commits back to 2010.**

**R2 — accept `#[` as a decoration sigil (PHP).** One regex plus the matching render test. **Measured: 0 → 37
accepted attribute facts, including the `#[AsCommand]` cell §054 planted against.** Unblocks 6,305 attributes in
2,173 files; no other language changes.

**R3 — make the empty-model reason travel.** `status` already says "no git history: nothing counts as
established". `check`, `rules` and `selftest` do not. The invariant worth testing: *when the model holds zero facts
repo-wide for a knowable reason, every surface reporting an absence names that reason* — same register as
`relCoverageNote` / `TEMPLATE_DESCRIPTIVE_NOTE`. This is §046's disclosure half with a specific reason to print,
and it is the honest fallback whenever R1 does not apply (a genuine depth-1 clone).

**R4 — hand D3 to §055.** `history.mjs:270`, `JSON.stringify(state)` over V8's string cap, after a completed walk.
Shard the state the way `BlobCache.flush` already shards, or stream it; and make the failure name itself rather
than surfacing as a bare `Invalid string length`.

**Not recommended.** Lowering λ, adding a margin, deflating `idxCost`, or feeding templates into `check`. The
measurement does not support any of them: λ rejected 5,906 cells and was *correct* on every one inspected (24/30
and 33/64 are not conventions), the index-cost ladder buys 710 cells per bit against D1's 14,674, and §030 already
settled the template asymmetry with a shipped disclosure.

**Boundary to disclose honestly.** Even with R1 and R2, a *unanimous* local cell whose parent already agrees earns
only a few bits and can never pay a repo-wide `log2(C)` that grows with the codebase. That is a real property of
the discipline, not a bug, and it is the frontier `docs/mathematics.md` already promises to make visible.

## 2026-09-02 00:31 — 054b fixed: #[ now recognized as a decoration sigil alongside @ and [ (core.mjs take()); decoLabel()/decoSigiled() helper added and applied everywhere a stored deco's own sigil was reconstructed for display/pid (core.mjs x4 sites, export.mjs marker JSON), plus export.mjs's focusLines anchor-line regex (same #[ blind spot, found while proving red->green). PHP fixture (30 Symfony-style #[AsCommand] Command classes, 1 omitting it): red before fix (0 decos, 0 auto.deco:#[AsCommand] facts, check silent on the marker); green after (decos:['#[AsCommand]'], convention share=1, check flags SecretsFooCommand as a known deviation, review reports it). Suite 1962/1962 (1958 baseline + 4 new), 0 fail. EXTR_V bump needed — not done here, batched by director.
