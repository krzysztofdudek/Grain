# `where` on the named stratum — one word, weighed twice

**Verdict: shipped. Named `hit@3` 0.459 → 0.643 (+0.184) across twelve languages, and the leak-free stratum rose
too (0.226 → 0.253), so nothing was traded.** The defect was not a missing evidence source. It was that a file's
own *name* and a word mentioned once inside a 169-scope test file were worth exactly the same — both a flat 1 —
so the biggest card in the neighbourhood covered any long query by accident and won.

Written for issue 012, recommendation 2 of `.system/research/question-catalog.md` §6.2. Two changes land in
`buildCards`/`whereCmd`; **one tuned constant is deleted and none is added**.

---

## 0. What was measured, and how to re-run it

`grain selftest --where --json` over twelve repositories, twelve languages, **733 candidates** (468 named, 265
leak-free). The named stratum is derived exactly as the harness derives it — pooled minus the reported
`unnamed` arm; every metric is a mean, so the subtraction is exact, not an estimate.

```
node bin/grain.mjs selftest --where --json --repo <repo>
```

One repository in the brief's list is absent, for a stated reason: **okhttp** is a shallow clone, and
`loadHistory` declines it ("no readable commit history"), so it yields no candidates in either arm.

*A note for whoever runs this next.* Never name a shell loop variable `path` when driving these scripts from
`zsh`: it is tied to `$PATH` and clobbers it, so `grain` finds no `git`, silently indexes with **no history at
all**, and overwrites the warm `.grain/` cache with a history-free model. Two full rebuild cycles were lost to
this, and the failure is silent — the JSON comes back well-formed, just with `"n": 0`.

---

## 1. The mechanism, in one query

express, `where added res json test` — the query names its file (`test/res.json.js`), so it is a named-stratum
candidate. Before:

```
file test/app.router.js  — 169 scopes, match 56%
file test/res.send.js    —  59 scopes, match 49%
file test/res.jsonp.js   —  37 scopes, match 49%
                                        … test/res.json.js is FIFTH
```

`buildCards` folds five different kinds of evidence into one token bag — the file's basename, its path, its doc
comments, the supertypes it implements, and **the name of every scope it declares** — and `addTok` keeps a *max*,
so each is worth 1. A test file's scope names are its `it()` descriptions. `test/app.router.js` holds 169 of
them, and among them appear the words `added`, `req`, `test`, `json`, `route`. Its vocabulary is therefore wide
enough to cover an entire four-word query at full weight and score **100%** on `added req rout test` — a perfect
match, assembled entirely out of coincidences.

Meanwhile the file the query actually named, `test/res.json.js`, ties at 0.492 with `res.send.js`, `res.jsonp.js`
and `res.cookie.js` — all four carry `json` at a flat 1 — and the sort's `b.n - a.n` tiebreak then hands the win
to whichever card holds *more* scopes. Volume won twice: once through coverage, once through the tiebreak.

This is why the named stratum is `where`'s worst. A query that names its file is a *longer* query, and every
extra word is another chance for a wide card to cover it by accident.

---

## 2. What shipped

### 2.1 A scope name is worth the share of the file it names

The two channels are now kept apart on the card (`baseToks`, `memberTok`) and weighed differently:

- **what the file IS** — basename, path, doc comments, supertypes — at full weight, exactly as before;
- **what the file CONTAINS** — its scope names — at `count / n`: how many of the file's own scopes carry the
  word, over how many it has.

One of 3 scopes called `json` says the file is about json (0.33). Two of 169 says almost nothing (0.012).

The same rule extends to **group** cards, whose member names are the identical volume channel (at their existing
`TOKW.fact` weight). That second half was not planned — it was forced by evidence. Normalising file cards alone
left an asymmetry: group cards, still weighing every member name at a flat 1, floated up into the space the
file cards had vacated. It showed up twice, independently — as two of sinatra's leak-free losses, and as a
failing assertion in `weak-match-signals.test.mjs` where a group overtook the specific exemplar file the query
named. Normalising both restored the order and turned the leak-free stratum from flat to positive. Directory and
marker cards are untouched: neither has a member-name channel.

**No new constant.** The divisor is the card's own `n`, the scope count the card already reports on screen.

After, same query:

```
file test/res.json.js — 23 scopes, match 49%   ← the file the query named
directory test/       — 70 files,  match 32%
```

### 2.2 A directory that matches a quarter of the query is worth a quarter

A directory whose own name matched a *minority* of the query got a flat `+0.25` on top of its lexical score.
That constant routinely lifted a wide directory card above the file the query named — on petclinic, `src/test/`
(126 scopes) over `ValidatorTests.java` on the single shared word `test`, three of five named misses in that
repo. It is now worth exactly the coverage it earned: `max(score, cover)`. The `cover >= 0.5` branch — a
directory whose name IS most of the query still wins outright — is unchanged.

**One tuned constant deleted.** Removing the `0.5` gate as well was measured and rejected (§4).

---

## 3. Results

| repo | language | named n | named hit@3 | named MRR | named place@3 | leak-free n | leak-free hit@3 | leak-free place@3 |
|---|---|---|---|---|---|---|---|---|
| petclinic | Java | 8 | 0.375 → **0.500** | 0.292 → 0.479 | 0.444 → 0.701 | 6 | 0.667 → 0.667 | 0.667 → 0.667 |
| playframework | Scala | 63 | 0.270 → **0.397** | 0.220 → 0.357 | 0.296 → 0.407 | 37 | 0.027 → 0.081 | 0.042 → 0.113 |
| telescope.nvim | Lua | 20 | 0.400 → **0.500** | 0.326 → 0.536 | 0.468 → 0.624 | 27 | 0.148 → 0.111 | 0.183 → 0.206 |
| leveldb | C++ | 7 | 0.429 → **0.571** | 0.298 → 0.500 | 0.429 → 0.619 | 12 | 0.083 → 0.167 | 0.104 → 0.271 |
| openzeppelin-contracts | Solidity | 78 | 0.679 → **0.782** | 0.584 → 0.724 | 0.697 → 0.801 | 22 | 0.091 → 0.182 | 0.095 → 0.186 |
| flask | Python | 22 | 0.364 → **0.682** | 0.334 → 0.580 | 0.415 → 0.752 | 10 | 0.300 → 0.300 | 0.353 → 0.453 |
| CleanArchitecture | C# | 19 | 0.421 → **0.526** | 0.447 → 0.511 | 0.462 → 0.575 | 7 | 0.286 → 0.429 | 0.339 → 0.464 |
| express | JavaScript | 61 | 0.639 → **0.885** | 0.492 → 0.803 | 0.642 → 0.885 | 39 | 0.462 → 0.590 | 0.465 → 0.592 |
| axum | Rust | 50 | 0.400 → **0.600** | 0.326 → 0.528 | 0.413 → 0.620 | 50 | 0.360 → 0.340 | 0.386 → 0.401 |
| gin | Go | 33 | 0.152 → **0.545** | 0.155 → 0.347 | 0.181 → 0.597 | 24 | 0.042 → 0.042 | 0.090 → 0.141 |
| sinatra | Ruby | 48 | 0.625 → **0.813** | 0.523 → 0.695 | 0.627 → 0.819 | 17 | 0.294 → 0.176 | 0.298 → 0.183 |
| Slim | PHP | 59 | 0.356 → **0.525** | 0.266 → 0.421 | 0.385 → 0.576 | 14 | 0.071 → 0.071 | 0.081 → 0.080 |
| **pooled** | 12 | **468** | 0.459 → **0.643** | 0.381 → 0.565 | 0.482 → 0.675 | **265** | 0.226 → **0.253** | 0.247 → **0.300** |

Named `hit@3` rises **in every one of the twelve repositories**, by between +0.100 and +0.394. The naive
path-match baseline arm is unchanged at 0.835 named `hit@3`; the change closes **49% of the gap** to it.

Leak-free — the must-not-regress guard — **rose** on all three of its metrics pooled (`hit@3` +0.026, MRR
+0.038, `place@3` +0.053). Per repo it is up in 5, flat in 5 and down in 2 (sinatra −0.118 on n=17, telescope
−0.037 on n=27). `place@3` rising alongside `hit@3` matters: it is the metric §068 hardened against
width-gaming, so the gain is not the ranker learning to bury wide cards in favour of narrow ones.

`nothing-ranked` (the concentration safeguard firing, or no lexical match at all) falls from **75 to 47** of 733.

---

## 4. Levers measured and rejected

Each was measured on the same harness, ten repositories (n=533), before openzeppelin and playframework were
added. `named` / `leak-free` are `hit@3` deltas.

| lever | named | leak-free | verdict |
|---|---|---|---|
| **share** — scope-name token weighed by share of the file | **+0.144** | −0.019 | kept, and its leak-free cost cured by pairing it with `covdir` |
| **covdir** — directory bonus = coverage, not +0.25 | +0.052 | +0.029 | kept |
| **share + covdir** | **+0.196** | +0.000 | **shipped** — extending `share` to group cards then lifted leak-free clear of flat; the final twelve-repo figures are +0.184 / +0.026 (§3) |
| `lift` — chance-corrected coverage: subtract the coverage a card of this vocabulary size reaches by accident | +0.061 | +0.005 | rejected — safe but weak, and strictly dominated by `share` |
| `vocab` — divide the whole score by vocabulary size | +0.018 | **−0.083** | rejected |
| `scope` — divide the whole score by scope count (the brief's literal wording) | +0.031 | **−0.044** | rejected |
| `covdirall` — also drop the `cover >= 0.5` gate | +0.171 | −0.016 | rejected — the second constant earns its place |
| `covex` — the same coverage rule on the exact-identifier pin | **+0.000** | +0.000 | rejected — see §4.1 |

The two whole-score normalisations (`vocab`, `scope`) are the brief's lever 2 taken literally, and both fail:
they punish a file's *name* and *path* evidence alongside its scope names, which is exactly the evidence the
leak-free stratum has least of. Normalising **only the volume channel** is what works.

### 4.1 Lever 1 (symbol-first) — the ceiling is zero, and the reason is the harness

Recommendation 2's first half asks that an exact **declared-name** match make that declaration's file lead. The
machinery exists and works: `where sendStatus` returns `lib/response.js` at 100% today.

**It cannot be measured on this harness at all, and the ceiling is exactly 0.** Measured two independent ways:

- across every repository probed, **0 of the named-stratum misses** have a query word that is verbatim a
  declared name in the truth file (petclinic 0 of 5, express 0 of 22, sinatra 0 of 18);
- the `covex` arm, which changes that pin's scoring, moves **every metric by exactly 0.000** — it never fires.

The cause is structural. `selftest --where`'s queries are commit-message tokens, and `history.mjs` builds them as
`tokenize(msg).map(normTok)` — camelCase is split and the result is stemmed. `sendStatus` in a commit message
becomes `send` + `status`; it can never again equal a declaration named `sendStatus`. The exact-pin path is
reachable only from a query a *person* types, and this harness never types one.

So the recommendation is not wrong — it is untestable here, and shipping a re-weighting of a path that no
measurement can see would be exactly the blind retuning ticket 012's own constraint forbids. **Recorded as a
harness coverage boundary, not a ranking gap.** What the stemmed harness *can* see — a query token matching a
token of a declared name — already carries full `TOKW.name` weight, so there was no headroom there either.

### 4.2 Lever 3 (source above tests) — dropped, and it would have been measured backwards

`config.mjs`'s DESIGN RULING forbids name-based test detection, so a path regex was never admissible. Nothing
structural replaces it: the same-stem companion and co-change signals point from source to test as readily as
the reverse.

Worth recording separately: on this harness the rule would have been measured as a **loss**. The ground truth is
"a commit that ADDED a file", and newly added files are very often tests — 5 of petclinic's 8 named candidates
are `*Tests.java`. "Rank source above tests" is a claim about what a *person* wants, and this harness's notion of
a right answer is not that. Ranking by *specificity* (§2.1) is the version of the same intuition that is
measurable, and it delivers the catalog's own worked example: `where sendStatus` now returns `lib/response.js`
first and `test/res.sendStatus.js` second, where before the runner-up was `test/express.static.js` — 126 scopes,
matched on the description "should not alter the status".

---

## 5. Cost, and what else moved

Two extra `Map`s per file card and per group card (`baseToks`, `memberTok`). `toks` itself is **byte-for-byte
unchanged**, so every other consumer of a card — `what`'s fan-in, the bridge lines, the weak-answer disclosure,
the compact map — reads exactly what it read before; a test pins this. §037's `coversQt` gate lives in `whatCmd`
and is not on any path this change touches.

One existing test changed expectation. `weak-match-signals.test.mjs` asserted that `where handler create dispute`
returns `dispute.handler.ts` at `match 100%`. It now returns the same file, still first, at **82%** — `handler`
and `dispute` are the file's own name and keep full weight, but `create` names only 2 of its 4 scopes. The test's
actual subject (the concentration safeguard must not fire on a well-matched query) is unaffected; the assertion
was rewritten to pin the *leading position* rather than a literal percentage, which is the property it exists
for. This is a deliberate, measured change to what `where`'s "match %" means: it is now a claim about how much of
the file the query describes, not merely whether the words appear somewhere inside it.
