# Ticket 080 — what can be said about a directory that does not exist yet

**Question.** `trial-0.4.0` §4b: an author created `src/Domain/Constants/`, and grain had nothing certified
to say. The honesty was correct; the silence was the gap. This asks what, if anything, can be said without
fabrication — and answers it with measurement rather than with a plausible mechanism.

**Answer, in one line.** All three of the ticket's hypotheses measure negative. Two are structurally absent
from the model; the third is present, mineable, and **fails ticket 073's own published acceptance bar by 10×
on coverage**. Nothing predictive ships. One false-confidence defect found along the way is fixed.

---

## 1. What the model already holds — verified in the code, not assumed

| Ticket hypothesis | Verdict | Where |
|---|---|---|
| 1. nearest certified sibling directory | **Partially present, aimed elsewhere** | directory cards exist but are admitted by a flat `≥ 8 scopes` rule (`buildCards`, core.mjs:6900), not by MDL cuts; `model.cuts` holds the partition roots; `refineModOf`/`partitionFor` are pure path functions and already work on a path that does not exist. `placementHit` (core.mjs:5803) is the ONLY routine written for a path outside the tree — but it answers *"is this file in the wrong subtree?"*, not *"this directory is new, here is the company it will keep"*, and it bails outright when the path has no file suffix (core.mjs:5806). It is unreachable from `where` and from `obligation`; only `check`/the check hook call it. |
| 2. what a new directory has been born with (073 generalised from files to directories) | **Present and mineable — and it does not work.** See §3. | `buildObligationTable`/`certifyObligationRules`, core.mjs:2553–2645 |
| 3. `model.changeArchetypes` captures directory-creation shape | **No.** `cellsOf` (core.mjs:5389–5406) reads only `fp.files` and `fp.scopes`. There is no third loop. `fp.added` — the birth signal — is never consulted anywhere in the archetype pass, so a commit that CREATED a directory and one that merely edited a file in it produce identical `m:`/`k:`/`g:` cells and cannot be told apart. | core.mjs:5381–5478 |

`fp.added` is read in exactly one place in the whole engine — `classEventsOf` (core.mjs:2593–2595), inside the
obligation table. **Nothing anywhere aggregates births to a directory.** The birth signal exists at two
granularities only: per scope (`auto.filebirth`, core.mjs:4345) and per file (`fp.added` → `model.obligations`).

### 1a. A finding that is not in the ticket

`grain where <a path>` has **no path handling at all**. `tokenize` (core.mjs:461) strips every non-alphanumeric
character, so `src/Domain/Constants/Roles.cs` reaches the ranker as the words `src domain constant role cs`;
the exact-name pin (core.mjs:7215–7225) strips `/` too and collapses the whole path into one garbage token that
its own `length > 2` filter then discards. The ticket's literal ask — "`where` must answer for a directory that
does not exist" — is currently not even parsed as a path.

Separately, the obligation table answers a new directory and an existing one **identically**, because its key is
the ≤2-segment refined module. On CleanArchitecture, verbatim:

```
$ grain obligation src/Domain/Constants/Roles.cs      # directory does not exist
a new *.cs under src/Domain/ has been born 10 times — nothing certifies as a specific obligation
$ grain obligation src/Domain/ValueObjects/Money.cs   # directory exists
a new *.cs under src/Domain/ has been born 10 times — nothing certifies as a specific obligation
```

This is not dishonest — it says "under `src/Domain/`", which is true — but the new-directory-ness is invisible
to the mechanism, which is why hypothesis 2 had to be tested directly rather than inferred from this output.

---

## 2. The instrument

**Ground truth, unlabelled, from real history.** Walking `H.fps` oldest-first, a **directory-birth event** is a
footprint `fp` in which some file of `fp.added` lands in a directory that has never appeared in any earlier
footprint. One event per (footprint, directory) pair. The **truth set** is everything else that commit touched,
current-path-mapped, *minus every file inside the newborn directory itself* — so the answer can never be scored
against a sibling the same commit was busy creating.

**Leave-one-out, prospective.** The class scoring a candidate is built only from strictly-older footprints; the
candidate's own footprint is folded in *after* it has been scored. This is `obligationEval`'s discipline
(core.mjs:9071) and `leakSubtractedH`'s, and the same `history-levers-must-hide-own-commit` guard tickets 069
and 073 are held to.

**Gates.** Identical to `certifyObligationRules`: KT data term + BIC half-log model term against the file's own
base rate, the λ = 8 display bound, the `CFG.minRaw` = 5 support floor, and liveness at HEAD. **No new constant
is introduced anywhere in this study.**

**Five candidate class keys**, since the ticket does not say which "a new directory" should be keyed on:

| key | reads as |
|---|---|
| `ALL` | "a new directory in this repo" (repo-wide pool) |
| `PARENT` | "a new directory under `<parent>/`" |
| `MOD` | "a new directory inside module `<m>`" |
| `DEPTH` | "a new directory at depth `d`" |
| `MODSUF` | "a new `*.<suf>` directory inside module `<m>`" |

**Nulls**, on the same events: the 3 hottest files by cumulative touch count as of that point in history —
the same null `obligationEval` and `obligations-design.md` §2 already use.

**Corpus.** 11 repositories from `tests/stress/corpus.json`, cloned in full (a `--filter=blob:none` partial
clone reports `history none` and must not be used for this): CleanArchitecture, spring-petclinic, express,
flask, gin, sinatra, Slim, axum, serde, openzeppelin-contracts, okhttp. **1 050 scored directory births.**

---

## 3. Results

```
=== POOLED: 1050 directory births, 11 repos ===
null "3 hottest": hot@1 16.8%   hot@3 27.8%

arm       cov%   p@1%   p@3%   nonObvN  nonObv-p@1%  repos-firing  medianClassN
ALL        0.8   25.0   25.0        0         0.0          2/11           57
PARENT     0.4   75.0  100.0        1         0.0          1/11            0
MOD        0.1    0.0    0.0        0         0.0          1/11            0
DEPTH      0.5   60.0   60.0        1         0.0          3/11           11
MODSUF     0.6   50.0   50.0        5        60.0          2/11            0

repo-macro p@1 (mean over repos that fire):
  ALL:    33.3%  over 2 repos — flask 0.0%(n=5), axum 66.7%(n=3)
  PARENT: 75.0%  over 1 repo  — axum 75.0%(n=4)
  DEPTH:  33.3%  over 3 repos — CleanArchitecture 0.0%(n=1), axum 100%(n=3), openzeppelin 0.0%(n=1)
  MODSUF: 37.5%  over 2 repos — CleanArchitecture 0.0%(n=2), axum 75.0%(n=4)
```

The result is stable as the corpus grows: coverage was 0.013 at 8 repos, 0.010 at 10, 0.008 at 11 — it moves
away from the bar, not toward it.

**Against ticket 073's own acceptance bar** (`obligations-design.md` §4: coverage ≥ 0.08 of birth events,
repo-macro precision@1 ≥ 0.80):

| | 073 shipped, file births | 080 measured, directory births | bar |
|---|---|---|---|
| coverage | 0.096 | **0.008** (best arm) | ≥ 0.08 — **missed by 10×** |
| repo-macro p@1 | 0.811 | **0.33** (best arm with >1 firing repo) | ≥ 0.80 — **missed** |
| repos firing | 6/20 | **2/11** | — |

The whole study fires **19 times in 1 050 events across all five arms combined**. Every per-arm precision above
is computed on n ≤ 5. There is no configuration of these keys under which the mechanism speaks often enough
for its precision to mean anything.

**What it says when it does speak.** The `ALL` arm's five fires on flask, in full:

```
flask artwork                     -> .gitignore   miss
flask docs/_static                -> .gitignore   miss
flask docs/_templates             -> .gitignore   miss
flask docs/_themes/flasky         -> .gitignore   miss
flask docs/_themes/flasky/static  -> .gitignore   miss
```

Repo furniture, wrong every time. This is the failure `obligations-design.md` §2 already recorded for raw
co-change against the null, reproduced exactly one level up the tree.

**Why it fails, stated plainly.** A commit that creates a new directory is, close to by definition, doing
something the repository has not done before. Its companions are therefore not the stable, repeated
co-travellers the contrast gate is built to find — they are either genuinely novel (nothing to learn from) or
ambient furniture (`.gitignore`, a build manifest), which is exactly what the λ bound lets through when a class
is small. File births work because a repository adds its tenth `*.cs` under `src/Domain/` much as it added its
ninth. Directory births have no such tenth case: the median class size for the `PARENT`, `MOD` and `MODSUF`
keys is **0**.

### 3a. The sibling answer is also thinner than it looks

Hypothesis 1 asks for "the nearest analogous, certified directory". Before building it, the same sweep counted
what is actually *true of the parent* at the moment a directory is born — a census, not a prediction:

```
parent directory already existed:             58.8%   (617/1050)
parent already held >=1 sibling directory:    49.0%
parent already held >=3 sibling directories:  31.6%
new dir's first-file suffix == parent's dominant suffix:  57.3%  (of 606 parents holding files)
sibling-directory count at birth: median 0, mean 3.9, p90 11
```

**The median new directory has no sibling directories at all**, and 41% are born with their parent — part of a
whole new subtree (`docs/_themes/flasky/static`), not hung off an established place. So "here is the nearest
certified sibling directory" is unavailable for **half** of real directory births, and the suffix agreement that
would let grain say "files under here are `*.cs`" runs at 57% — a coin flip, not a convention.

---

## 4. What ships

**Nothing predictive.** Forcing any arm above into the product would put a 1%-coverage, 33%-precision answer in
front of an agent in the one situation where it has no way to check the answer for itself. That is the opposite
of what this ticket asked for.

**One defect found along the way is fixed** (`inLineForFile`, core.mjs), because it is a false-confidence claim
rather than a missing capability. `refineModOf` is a pure path function — it names a module for any string,
existing or not — and `moduleGraph` has no node to contradict it, so the first file of a brand-new top-level or
second-level directory printed:

```
$ grain check <any file> --as tools/Codegen/Gen.cs
in: tools/Codegen/ · used by 0 modules          # a module no file lives under, and a measured-looking 0
```

Now:

```
in: tools/Codegen/ does not exist yet — nearest existing: the repo root · used by 0 modules
```

The absence is stated, and the only numbers in the line belong to the nearest ancestor that really holds files.
A path whose refined module *does* hold files is untouched — its layer and fan-in were always real. "Exists" is
a fact about `pathsAll ∪ filesAll`, the same liveness set `changeArchetypes` and `buildObligationTable` already
use; no threshold and no constant is added. This covers the ~20% of directory births whose new directory sits at
depth 1 or 2 (~1 in 5 in this corpus) — the cases where the module key itself vanishes.

**Filed as follow-up, not force-shipped:** the two capabilities this study shows are missing rather than broken.
See §5.

---

## 5. Follow-up — what a real answer would need

Neither item below is a tuning problem; both are new extraction, which is why they are not in this ticket.

**(a) `where` must parse a path.** Today it cannot: `tokenize` destroys path structure before anything sees it
(§1a). Routing a path-shaped query to the path-aware machinery that already exists (`placementHit`,
`obligationFor`, `inLineForFile`, `partitionFor` — all of which already accept a path that is not in the tree)
is a self-contained change with no new mining. It is the ticket's literal ask and it is not blocked by anything
measured here. It needs its own instrument, because it changes a ranking.

**(b) A directory-shaped birth signal, if one is wanted at all.** The measurement says co-change is the wrong
quantity. What a new directory plausibly *does* carry is **structural**: which layer it may import from, which
partition's conventions it inherits, whether the repo keeps `*.cs` in named subdirectories at that level. All of
that is in the model already and none of it needs history. The open question — genuinely open, and not answered
here — is whether stating it changes an agent's behaviour, since trial-0.4.0 §4b records the agent ignoring a
correct structural pointer (`in: src/Domain/…`) that grain had already given it. That is an adoption experiment,
not a mining one, and it should be run before any further extraction is built for this case.

---

## 6. Reproducing

The instrument is not shipped (it needs full clones and ~10 minutes); it lives with this study. Faithful copies
of `certifyObligationRules`' four gates are inlined in it, so a change to those gates in `core.mjs` must be
mirrored here before re-running — if this work is ever revived, the eval should move inside `core.mjs` and call
the private function directly, the way `obligationEval` does.

Clone each corpus repo **without** `--filter`, `grain refresh --full`, then run the sweep. Numbers above are at
engine 0.4.0, extractor g32, model m24.
