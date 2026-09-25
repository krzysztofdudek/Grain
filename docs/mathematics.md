# The mathematics

Grain analyses code purely mathematically, as far as that can honestly be pushed. This document states the one
principle everything reduces to, what each visible artifact is as a special case of it, and the residue that no
amount of mathematics removes. Nothing here is aspiration: every mechanism below ships in the engine and is measured
in [validation.md](validation.md).

## One objective

**A claim exists iff stating it compresses the repository.** Formally: the engine prefers the model M that minimises
the two part codelength L(M) + L(corpus given M), where the data term uses Krichevsky–Trofimov coding, the model term
is a BIC style penalty of half a log per free parameter, and an index cost charges for the choice of which cell
speaks at all, so multiple comparisons are paid for inside the objective rather than patched afterwards.

Everything the tool prints is a special case:

| Artifact | What it is mathematically |
| --- | --- |
| a convention | a cell whose codelength gain is positive |
| a group (role) | a mixture component that compresses the scope population (greedy MDL agglomeration over feature bags) |
| a template | a shared subtree with holes whose instances anti-unify (Plotkin's least general generalization) |
| a partition | a cut of the directory tree that compresses the file style distributions |
| a deviation | an instance whose pointwise codelength excess clears the loss bound |
| drift, nucleation | the arrival process of a rule's instances along the history |
| a commit archetype | a sub-population of past commit footprints whose codelength gain, against the whole history's own base rate, is positive |
| a value concordance | a set of values whose joint presence across files compresses better than treating them independently |
| a structural twin | two role groups whose anti-unified templates share a core exceeding both sides combined |

## The one loss constant

Six tuned thresholds used to guard speech: a bits margin on every fact, four family specific taus, and `minShare`, a share floor below which no fact was displayed. λ replaced those six. Evidence is codelength alone: a fact exists iff its bits are positive. The decision to *speak* is one loss ratio, λ = 8, applied to three questions consistently:

1. **Naming an expected value.** Grain names it only when the KT posterior predictive bounds the error at one wrong
   steer per λ followed ones: (n_expected + ½) / (n_total + K⁄2) ≥ 1 − 1/λ.
2. **The printed population.** The same bound must hold on the survived raw counts the message prints, so survival
   weighting can never carry a claim its own display denies.
3. **Accusing an instance.** A deviation fires only when the deviant's pointwise excess costs at least log₂ λ bits,
   computed on the same population the accusation cites. Three cells in the validation corpus sit at 7.0 to 7.8 : 1
   odds, just under 8 : 1, and grain stays silent there by contract; the misses are the frontier made visible.

Vacuity is not a threshold problem and is handled by the null model instead: structural facts (node type presence,
statement shapes, first statement, return shape, arity, variable shape) speak only as a *contrast*, in a group or
directory whose default differs from the partition's. "Methods here always contain a member_expression" describes the
language, not a choice anyone made, and no bar on bits can know that; the reference distribution can.

λ is not the only number the engine compares against. Power floors, compute guards, display and ranking weights remain, and so do evidence gates that λ does not derive: the absence floors, the trend detector, the co-change single-file floor, the calibration margins. One of them is a bits margin again: where history calibrates a convention and its repair precision is below 0.8, an accusation needs log₂ λ + 1.5 bits instead of log₂ λ. Every such number is listed with its file and role in *The numeric register* at the end of this page, and a test keeps that list and the code in step.

## What counts as the repository

Git decides. Anything gitignored is never processed; anything tracked is code, because a repository that commits its
vendor tree or its fixtures made that choice. In git mode the universe is the HEAD tree, where gitignore already
holds by construction, and only the tool's own store (`.grain/`, `.git/`) is invisible. Name lists such as
`node_modules|dist|fixtures` gate nothing on tracked paths and survive only in the no git fallback, where there is no
gitignore to consult. Package manifests (`package.json`, `go.mod`, `tsconfig.json`) are read for *resolution*, that
is workspaces, path aliases and the module graph, never as a statistical prior.

On the JVM the same role is played by the *source root*, and it is read from the language rather than from a manifest:
a file's package declaration must be its directory path (JLS §7.2.1), so the directory with that path removed as a
suffix is where the package hierarchy starts; the Maven and Gradle standard layout, `src/<sourceSet>/<language>`,
says the same thing from the build side. A reference resolves against every source root of the repository, not only
the ancestors of the file making it, which is what lets a test under `src/test/java` reach the production type it
imports. And the module cut is taken below the source root, advanced through its non-branching prefix: a package
opens with a reverse-domain name the spec requires and every file shares, so cutting there would put a whole source
tree in one module. Within a package, Java needs no import at all — a simple type name binds to the sibling that
declares it — so those references are read from the syntax directly and resolve only when the package really
declares that type.

## Partitions from compression

The populations a file is judged against are cut from the directory tree by a post order dynamic program: a directory
either codes its whole subtree as one region or splits, paying log₂(number of directories) per new region root. The
features are exactly what a partition means, an independent style population: grammar plus the lexical layer (quote
style, semicolons, indentation, declaration keyword). Directory signatures such as file name shape are deliberately
excluded; they belong to the directory cells inside a partition, and cutting on them shreds the tree (measured).

The vindication: the test and example name heuristics this project deleted re-emerged as mathematics. On express the
cut finds `examples/`, `lib/`, `test/`, `test/acceptance/`, `test/support/`; on flask it finds `docs/`, `examples/`,
`src/`, `tests/`. No name list exists anywhere in the product.

## Groups, and the ambiguous member's half vote

A role group is a mixture component, so membership in one is a number rather than a fact: `m1` is a scope's weighted
Jaccard to the nearest medoid, `m2` its best score against a genuinely different one. A scope is *ambiguous* when
those two sit within `ambGap`, or when `m1` alone falls below `minMemb`; it fits one reading barely better than a
rival, or fits nothing well. Ambiguity is silence. An ambiguous scope receives no role conditioned speech, is absent
from the printed population of every role fact, and is never an exemplar, a deviant, a template instance or a profile
member. It enters its nearest group's evidence counts at half weight, and that is the only place it enters at all.

The half is a responsibility, not a hedge. A scope torn between two readings holds about half the mixture weight of
each, and measured over 4350 ambiguous scopes in eight repositories the mean rank one responsibility m1/(m1+m2) is
0.557, or 0.533 over the gap case alone. Crediting the nearest medoid only, at half a vote, is the soft assignment
that number describes; the rank two contribution is dropped rather than shared, which is the conservative side.

The cost is real and it runs both ways, which is the reason the weighted side was not simply aligned with the printed
one. A group whose established members are unanimous can fail to certify because ambiguous non members disagreed: on
flask one setup method group carries `expression_statement(call(attribute,argument_list))` in 12 of 12 established
members and stays silent, because ambiguous scopes contribute 1.5 of opposing weight against 0.5 supporting.
Dropping ambiguous scopes from the evidence entirely, so that the evidence population equals the governed one, was
measured across nine repositories: 110 further facts certify and 31 stop speaking, and the 31 are the mirror image —
groups whose ambiguous members had been agreeing. gin's `ginS` wrappers lose "these call `engine()`, 10 of 10"
because the other wrappers in that same file, ambiguous by clustering, also call `engine()`, and it was their
agreement that carried the fact over the bar. Ambiguous members are not noise: they agree with their group's
established majority 91.4% of the time by weight against 95.8% for unambiguous members, and inside a cell whose
established side is unanimous they agree 95.9%. Nor are they a fringe: they are 48.7% of every role eligible scope
in the corpus and 29.2% of a role cell's weight.

## Superposition

Every scope carries a skeleton of its syntax tree: nested scopes fold to opaque leaves so a class does not drown in
its methods' bodies, identifiers stay literal so an invariant call survives in the shared template by itself, string
and number payloads collapse to `str` and `num`. A cluster's skeletons fold by anti-unification into one template
with numbered holes, and the per hole label distributions are the statistics of the superposition: zero entropy means
invariant, one distinct value per instance means a parameter, anything between gets its counts. The code clustering
leaves behind is swept by the same machinery through coarse silhouette buckets (same kind, same depth two shape with
identifiers folded, so a per instance name cannot split a bucket the way it splits a feature bag); a bucket's
template stands only on its own terms. A template's time axis is the arrival process of its instances, read from the
lifecycle rows without re-extracting any old blob.

## Commit archetypes

A commit's footprint is a feature bag — the refined module of each file it touched, the role group of each scope it
changed, each touched file's suffix — and the same greedy MDL agglomeration that clusters scopes into role groups
(generalised to take any feature bag, not only a scope's own) clusters footprints into recurring shapes. A cell of a
shape is certified only when coding its rate WITHIN the shape's own members costs fewer bits than coding it at the
rate of every footprint the history holds — a likelihood-ratio contrast against the whole population, the same
branch `mine()` uses to test a role cell against its partition, never the uniform coin-flip null a package-wide
predicate is judged by. A cell every commit in the repository touches carries no shape, however unanimous it is
inside one archetype; the contrast is what tells the two apart, where a flat evidence-only test cannot. `how`'s
certified-shape line and `missing: change shape:`'s residual cells both read straight off this certification —
which commits cluster together is a modelling choice, not itself a claim; only which of the resulting cells survive
the contrast is.

## Birth obligations

A class is every file ever ADDED under one (refined module, suffix) pair — the same two features a commit
footprint's `m:`/`k:` cells above already carry, read here off the git status byte instead of a scope. For each
class and each other file the class's births ever touched, coding that co-occurrence at the class's own rate is
contrasted, by the identical likelihood-ratio test commit archetypes use, against coding it at the file's own rate
over the whole history; the display bound (above, "The one loss constant") and a five-birth support floor gate the result the same way
they gate everything else in this document — the floor is not a convenience default, it is what a corpus
measurement found necessary: below it, a single three-birth class produced a fabricated rule that fired repeatedly
and was wrong every time. A file whose own history-wide rate already clears the display bound needs no class to
explain it — it is reported separately, as ambient, so a genuinely class-specific companion is never crowded out
by one every commit happens to touch anyway. A rename is never mined as a birth: git already reports it as a
distinct status, and only a genuine add counts.

## Value concordance

An enum's members, and the string literals that appear inside one syntactic container (a switch, an object literal,
another enum), are values; a shared container identity groups them into siblings. Whether a set of siblings
travels together — every file carrying most of them carries all of them — is a codelength question over a
two-outcome cell (complete carrier vs. not) coded against a flat 50/50 null, not a fitted base rate: unlike the
language bridge below, there is no natural per-file prior for "carries the whole set". A candidate is one whole
container, never one (container, file) or (container, value) pair, so the index cost does not grow with how many
files a set could appear in. A file counts as carrying a member only when that member sits inside THAT container
in THAT file, never merely somewhere in the file — reading membership globally would silently inflate both the
sibling set and its carrier count on any repository with more than one container reusing an identifier, and was
measured to do exactly that before the fix (see [validation.md](validation.md)).

## Structural twins

Two role groups' superposition templates can themselves be anti-unified against each other, the same operation
that builds either group's own template from its members. A shared core exceeding what each side keeps to itself —
more than half of the combined, non-shared total — makes them twins: one shape, developed twice under two
different names or in two different directories. The threshold is the same supermajority proportion a marker's
established value, a deviation's rejected-value verdict, and a rename's placement precedent (below) all use, not
a distance metric invented for this one comparison.

## The language bridge

Every commit is a translation pair: natural language in the message, code in the touched files. A token-file pair
is a bridge when coding the file's touched/untouched outcome at the token-conditional rate (the file's own share of
the commits that say the token) compresses better than coding it at the file's plain base rate over the same
commit population — the identical KT/BIC/index-cost cell every other convention uses, so evidence grows linearly
with how many commits say the token, never demoted for being common. There is no separate filler list: a
genuinely uninformative but frequent word (`feat`, `fix`) fails on the ratio itself — its rate on any one file
barely differs from that file's base rate — not on a document-frequency cutoff bolted on afterward. An earlier,
cheaper heuristic filtered by raw frequency instead; it was removed once the acceptance test alone was shown to
reject the same filler words for the right reason, and to certify at least one bridge the heuristic had been
discarding purely for being common. The file's base rate is counted over the SAME commit population the token's
rate is drawn from (messages a commit actually has, mass commits aside) — counting it over every commit including
the mass ones once silently deflated that base rate, and with it inflated the apparent strength of a token that
merely said what most ordinary commits already say.

## Placement

For a file the accepted tree does not know, three path only rules ask whether its name kin already concentrate
somewhere else: same suffix files sharing a basename token (two thirds in one directory, none where the file is), the
suffix subtree (80 percent under one prefix, file outside it), and the root dweller case (every kin lives one level
deeper). A fourth signal joins these once history is available: a compressed record of historical renames, grouped
by a moved file's suffix and name token, and when a supermajority of the recorded moves out of the kin directory
already named went the same way, the note names the destination directory as one more path already taken — counts only, same as
the other three. Competing kin argue inside one note, strongest count first, and the note is delivered *before* the
write, because the third agent trial measured that a note after the write loses to sunk cost. Everything is phrased
as an observation with counts; deliberate placement is explicitly left alone.

## The honest residue

What remains that mathematics does not decide, on the record:

- the alphabet: the tree-sitter grammars and their machine readable node type inventories;
- the measure: git, both as the file universe and as the history every weight comes from;
- the choice of universal code (KT plus BIC plus index cost); a different standard code changes constants, not
  conclusions;
- λ = 8 itself, one interpretable constant in place of six tuned ones;
- statistical power floors kept as compute short circuits (a partition below 30 scopes says nothing; below the raw
  minimum, positive bits are unreachable anyway) and the clustering ambiguity constants `ambGap`/`minMemb` (the
  half vote those two gate is derived, not tuned — see *Groups, and the ambiguous member's half vote*);
- the co-change thresholds `cochangeMinSup` (a pair must co-occur in at least 8 commits before it is named at all)
  and `cochangeMinConf` (a partner is spoken only once it covers 75% of the edited file's own commits) — configured
  floors in the same family as the statistical power floors above, not a conclusion the KT/λ test derives;
- `fpsCap` (20 000 per-commit footprints retained, newest kept) and `scopePairCap` (200 scope-pairs per commit) —
  compute/memory guards on how much of history a match-by-example query or a scope-level co-change count walks,
  the same role `megaCap` already plays for files per commit; no MDL role, and no claim rests on where they sit;
  the retained-pair budget on scope co-change (5000) is a guard of the same family, with one refinement that is
  not a threshold: the budget is split between pairs whose two declarations live in ONE file and pairs that span
  two, each half ranked by its own support and either half's unused share going to the other. The two populations
  are not comparable — two declarations in one file move whenever that file moves — so a single ranking is won
  outright by the within-file half on any repository with large files, and the cross-file half is emptied before
  any query sees it. Measured, and the number of pairs retained is unchanged
  (maintainer note *node-cochange-measurement* §9);
- `valueDfMin`/`valueDfMaxShare` — a population gate on what enters the value-concordance index (a value in one
  file has no concordance to report; a value in a fifth of the repository is furniture, not a concept), the same
  kind of floor as the vocabulary support constants above, not a second or third λ; whether anything is SAID about
  a value that clears the gate is still decided downstream by the one loss constant;
- the two-thirds supermajority — one interpretable share behind a marker's own established value, a value
  container's certified population threshold, a structural twin's shared core, and a historical rename's placement
  precedent, named once here rather than re-derived at each site (a role group's name-stem kinship with another
  group uses a different, deliberately non-MDL floor — 0.6 over at least 4 members, see `impliedOf.companion`);
- the evidence gates, weights and display bars in *The numeric register* below — declared, not derived, and most of them without a recorded measurement behind the value;
- the boundary between form and meaning: grain measures the shape of code, not its semantics; two behaviourally
  identical implementations with different trees are different to it, and it never pretends otherwise.

## The numeric register

Every non-integer numeric literal and every literal ratio (`2 / 3`, `(n * 2) / 3`) in the top-level engine files (`plugins/grain/engine/*.mjs`; the vendored runtime and the grammars are not scanned), and every literal day window (`N * 86400`, `/ 86400 <= N`), is on this list with its role. Each row quotes enough of its line to pin that one site, so a new use of the same number elsewhere in the file needs a row of its own. A few integer floors that decide speech are listed too, but integers are not audited: `n >= 4` and its kin can still enter unlisted. The test `numeric-register.test.mjs` fails when a literal of the audited kinds appears in those files without a row here, when a row's code no longer appears in its file, and when a row's value is not the number in its code, so a changed value cannot keep an old row. Two blind spots: a literal inside a template string's `${…}` is not scanned (the report's alarm row below is listed by hand), and a multi-line string is not stripped.

Roles:

- **derived** — follows from the KT code, the BIC penalty, λ, or a standard statistic; not a choice.
- **declared** — a named constant already described on this page.
- **gate** — decides whether a claim is spoken or a fact is kept, and λ does not derive it.
- **weight** — scales how much a scope or an event counts as evidence.
- **extraction** — decides the value a predicate records for a file or a template slot.
- **dedup** — two sets this similar are treated as one.
- **retrieval** — decides which matches a query returns or in which order.
- **display** — changes wording, a label or an order only; no claim appears or disappears.
- **instrument** — used only by a measurement command.

The named constants in `config.mjs` come first. The test compares every value here with the code, and fails when a constant is added there without a row here.

| constant | value | role |
|---|---|---|
| `lambda` | 8 | the one loss constant |
| `minRaw` | 5 | power floor: below it positive bits are unreachable anyway |
| `minEff` | 3 | power floor on the survival-weighted count |
| `valueDfMin` | 2 | value-index population gate |
| `valueDfMaxShare` | 0.2 | value-index population gate |
| `ambGap` | 0.15 | clustering ambiguity |
| `minMemb` | 0.35 | clustering ambiguity |
| `survDays` | 120 | the window of "recent" code the agent share is measured over |
| `freshDays` | 14 | code younger than this weighs half |
| `agentBase` | 0.15 | agent-written code's starting weight |
| `promoteDays` | 180 | days over which agent-written code is promoted to full weight |
| `floor` | 0.05 | the lowest weight a scope can have |
| `calibHorizonDays` | 365 | calibration's temporal split; a history shorter than this is not calibrated |
| `calibSettleDays` | 30 | departures younger than this are not yet judged repaired or kept |
| `calibMinEv` | 12 | departures needed before calibration speaks |
| `denyMinEv` | 35 | departures needed before `denyEligible` |
| `targetPrec` | 0.8 | repair precision under which the accusation margin applies |
| `cochangeMinSup` | 8 | commits a pair must share before it is named |
| `cochangeMinConf` | 0.75 | share of the edited file's commits a partner must cover |
| `megaCap` | 30 | commits touching more files than this are left out of pairing |
| `fpsCap` | 20000 | per-commit footprints retained |
| `scopePairCap` | 200 | scope pairs counted per commit |
| `trendWinDays` | 90 | width of one trend window |
| `dirMin` | 25 | scopes of a kind a directory needs to be its own context |
| `NCAP` | 700 | role clustering sample cap |
| `SUP` | nodeType 20, call 8, imp 5, ext 4, shape 15, deco 8, ret 4, pt 4 | vocabulary support floors per enumerator |
| `TOPK` | nodeType 30, call 80, imp 60, ext 30, shape 40, deco 40, ret 30, pt 30 | vocabulary top-K per enumerator |

The literals in the code follow. "Cited" names the measurement a value rests on where one is recorded; `none` means neither the code comment nor [results.md](results.md) records one.

| value | file | code | role | cited |
|---|---|---|---|---|
| ½ | arch.mjs, commit-log.mjs, mine.mjs, obligations.mjs, propose-lattice.mjs, spectrum.mjs | `data - 0.5 * (K - 1) * Math.log2(Math.max(` | derived — BIC penalty, ½ log₂ n per free parameter | — |
| ½ | commit-log.mjs | `data - 0.5 * (K3 - 1) * Math.log2(Math.max(df, 2))` | derived — BIC penalty, ½ log₂ n per free parameter | — |
| ½ | learn.mjs | `data - 0.5 * (KD - 1) * Math.log2(Math.max(neff, 2))` | derived — BIC penalty, ½ log₂ n per free parameter | — |
| ½ | learn.mjs | `data - 0.5 * (KV - 1) * Math.log2(Math.max(neff, 2))` | derived — BIC penalty, ½ log₂ n per free parameter | — |
| ½ | arch.mjs, mine.mjs | `(ne + 0.5) / (neff + K / 2) >= 1 - 1 / CFG.lambda` | derived — KT posterior predictive | — |
| ½ | commit-log.mjs | `(k + 0.5) / (df + K3 / 2) >= 1 - 1 / CFG.lambda` | derived — KT posterior predictive | — |
| ½ | commit-log.mjs | `(k + 0.5) / (n + K / 2) >= 1 - 1 / CFG.lambda` | derived — KT posterior predictive | — |
| ½ | facts.mjs | `0) + 0.5) / (n + K / 2);` | derived — KT posterior predictive | — |
| ½ | facts.mjs | `(k + 0.5) / (n + K2 / 2) >= 1 - 1 / CFG.lambda` | derived — KT posterior predictive | — |
| ½ | learn.mjs | `(local.has_fix + 0.5) / (neff + KD / 2) >= 1 - 1 / CFG.lambda` | derived — KT posterior predictive | — |
| ½ | learn.mjs | `(ne + 0.5) / (neff + KV / 2) >= 1 - 1 / CFG.lambda` | derived — KT posterior predictive | — |
| ½ | mine.mjs | `0) + 0.5) / (sraw + K / 2) >= 1 - 1 / CFG.lambda` | derived — KT posterior predictive | — |
| ½ | obligations.mjs | `(k + 0.5) / (rec.n + K / 2) >= 1 - 1 / CFG.lambda` | derived — KT posterior predictive | — |
| ½ | mine.mjs | `nc * h + 0.5 * Math.log2(Math.max(nc, 2))` | derived — BIC penalty in the role clustering codelength | — |
| ½ | partition.mjs | `c += 0.5 * Math.max(0, vs.length - 1)` | derived — BIC penalty in the partition codelength | — |
| 1 − 1/8 | propose-base.mjs | `LAMBDA_BOUND = 1 - 1 / 8` | derived — the λ bound | — |
| 1.96 | weights.mjs | `const z = 1.96,` | derived — 95% Wilson interval | — |
| ½ | mine.mjs | `ri.amb.has(i) ? 0.5` | derived — the ambiguous member's half vote | — |
| 2/3 | propose-base.mjs | `SUPERMAJORITY = 2 / 3` | declared — the two-thirds supermajority | none |
| 2/3 | learn.mjs | `den >= CFG.minRaw && num / den >= 2 / 3)` | declared — a fact is "held mostly by agent-authored code" | none |
| 2/3 | learn.mjs | `top2[1] >= Math.ceil((n * 2) / 3)` | declared — a marker's own established value | none |
| 2/3 | learn.mjs | `k >= Math.ceil((n * 2) / 3)) obs.push` | declared — a marker's own established value (per-carrier observations) | none |
| 2/3 | learn.mjs | `Math.ceil((declaring * 2) / 3);` | declared — a value container's sibling key set | none |
| 2/3 | learn.mjs | `Math.min(Math.ceil((m * 2) / 3), m - 1)` | declared — a value container's certified population threshold | none |
| 3 | learn.mjs | `if (n < 3) continue;` | gate — a marker speaks from 3 carriers | none |
| 2/3 | mine.mjs | `if (n / ofDeviants < 2 / 3) return null;` | declared — an alternative marker among deviants | none |
| 2/3 | mine.mjs | `if (topCount / credited < 2 / 3) return null;` | declared — one author holds a convention | none |
| 2/3 | placement.mjs | `n / T.length < 2 / 3) continue;` | declared — a placement precedent | none |
| 2/3 | placement.mjs | `&& tn >= 2 && tn / total >= 2 / 3)` | declared — a placement precedent by pair | none |
| 2/3 | weights.mjs | `t >= CFG.minRaw && r / t >= 2 / 3)` | declared — a value tried and reverted | none |
| 0.6 | partition.mjs | `topComp[1] / mf.length >= 0.6)` | declared — `impliedOf.companion` | none |
| 0.6 | partition.mjs | `topImp[1] / mf.length >= 0.6 && topImp[1] >= 4` | declared — `impliedOf.companion` | none |
| 0.6 | partition.mjs | `top2[1] / mf.length >= 0.6 && top2[1] >= 4` | declared — `impliedOf.companion` | none |
| 0.6 | partition.mjs | `best.n / fa.length < 0.6) continue;` | declared — group name-stem kinship | none |
| 0.2 | config.mjs | `valueDfMaxShare: 0.2` | declared — value-index population gate | none |
| 0.15 | config.mjs | `ambGap: 0.15,` | declared — clustering ambiguity | none |
| 0.35 | config.mjs | `minMemb: 0.35,` | declared — clustering ambiguity | none |
| 0.75 | config.mjs | `cochangeMinConf: 0.75` | declared — co-change partner floor | none |
| 0.8 | config.mjs | `targetPrec: 0.8,` | gate — calibrated repair precision under which the accusation margin applies | none |
| 1.5 | weights.mjs | `Math.log2(CFG.lambda) + 1.5` | gate — accusation margin in bits for a convention history calibrates below `targetPrec` | none |
| 0.9 | weights.mjs | `denyEligible: lb >= 0.9 && n >= CFG.denyMinEv` | gate — Wilson lower bound for `denyEligible` (report only; nothing blocks) | none |
| 0.15 | config.mjs | `agentBase: 0.15,` | weight — agent-written code's starting weight, promoted over `promoteDays` | none |
| 0.05 | config.mjs | `floor: 0.05,` | weight — the lowest weight a scope can have | none |
| 0.3 | weights.mjs | `if (!L) return 0.3;` | weight — a scope with no history row | none |
| ½ | weights.mjs | `CFG.freshDays ? 0.5` | weight — code younger than `freshDays` | none |
| ¼ | weights.mjs | `* wp * (L.churn ? 0.25 : 1));` | weight — code rewritten right after birth | none |
| 14 days | history.mjs | `e.c.ts - L.first <= 14 * 86400` | weight — "rewritten right after birth" window (equal to `freshDays` today, not tied to it) | none |
| ½ | mine.mjs | `Math.min(sd.weight, 0.5 * neffReal)` | weight — a maintainer seed counts at most half the cell | none |
| 0.1 | mine.mjs | `partitionTrueShare(f.kind, f.pid) >= 0.1` | gate — a partition-wide absence needs 10% use of the thing | none |
| 0.3 | mine.mjs | `partitionTrueShare(f.kind, f.pid) >= 0.3` | gate — a local absence needs 30% partition-wide use | none |
| 0.1 | mine.mjs | `confCarriers / f.conform.length >= 0.1` | gate — an alternative marker must be rare among conformers | none |
| 0.1 | arch.mjs | `outsideShare(n) >= 0.1` | gate — an architecture absence norm needs 10% reach elsewhere | none |
| 0.2 | propose-lattice.mjs | `0) / tot < 0.2) continue; }` | gate — a sub-gate "never X" row, which `propose` may turn into an advisory rule, needs 20% partition-wide use | none |
| 0.2 | spectrum.mjs | `0) / tot < 0.2) continue;` | display — `explain` shows a "never X" lattice row only at 20% partition-wide use | none |
| 0.02 | weights.mjs | `if (slope > 0.02 && minority` | gate — drift slope per window for nucleation | none |
| 0.05 | weights.mjs | `1 - last.share > 0.05` | gate — nucleation needs 5% current deviation | none |
| 2 | weights.mjs | `minority[1].size >= 2` | gate — nucleation needs 2 human authors of the minority value | none |
| 4 | weights.mjs | `if (n >= 4) shares.push` | gate — a trend window counts from 4 scopes | none |
| ½ | weights.mjs | `attractor = last.share >= 0.5 ? fact.exp` | gate — the attractor is the expected value while it holds half | none |
| 1/3 | cards.mjs | `minConf = file ? 1 / 3 : CFG.cochangeMinConf` | gate — single-file co-change partner floor | none |
| 1/3 | completeness.mjs | `changed.length === 1 ? 1 / 3` | gate — single-file co-change partner floor | none |
| 1/3 | grain-advise.mjs | `MUTUAL_CONF_FLOOR = 1 / 3` | gate — co-change advice floor, both directions | none |
| ½ | propose-base.mjs | `MIN_WHEN_FIDELITY = 0.5` | gate — a drafted `when` must select half its own set | none |
| 0.08 | lexical.mjs | `if (c >= sp * 0.08) {` | extraction — an indentation width counts from 8% of indented lines | none |
| 0.8 | lexical.mjs | `sq >= (sq + dq) * 0.8 ?` | extraction — a file's quote and semicolon style needs 80% | none |
| 0.8 | lexical.mjs | `semi >= (semi + nosemi) * 0.8 ?` | extraction — a file's quote and semicolon style needs 80% | none |
| 0.8 | lexical.mjs | `c >= tot * 0.8 ? k :` | extraction — a file's dominant lexical value needs 80% | none |
| 0.8 | superposition.mjs | `n2 >= tot * 0.8 ? k :` | extraction — a file's dominant module export form needs 80% | none |
| 0.8 | superposition.mjs | `Math.max(3, sl.total * 0.8));` | extraction — a template slot is per-instance at 80% distinct | none |
| 0.8 | superposition.mjs | `sl.distinct < sl.total * 0.8` | extraction — a template slot is per-instance at 80% distinct | none |
| 0.6 | superposition.mjs | `sl.top[0][1] / sl.total >= 0.6` | extraction — a template slot is skewed at 60% one value | none |
| ½ | superposition.mjs | `pf.coverage < 0.5) continue;` | gate — a template needs a cluster prior covering half | none |
| ½ | relations.mjs | `files.length * 0.5` | extraction — a dominant module holds half the files (and at least 40) | none |
| 0.6 | mine.mjs | `jacW(medoids[b].feats, md.feats) >= 0.6)` | dedup — two role medoids this close are one role | none |
| 0.9 | mine.mjs | `jac(oppP, oppQ) >= 0.9` | dedup — redundant predicates | none |
| 0.9 | mine.mjs | `c.conform)) >= 0.9` | dedup — facts over the same conformers | none |
| 0.9 | propose-family.mjs | `jaccard(g.files, a.files) >= 0.9);` | dedup — a family candidate is its host | none |
| 0.9 | propose-types.mjs | `host.files) >= 0.9` | dedup — a type candidate is its host | none |
| ½ | placement.mjs | `cands.length * 0.5` | retrieval — a token in over half the candidates places nothing | none |
| 0.8 | placement.mjs | `cands.length >= 0.8` | retrieval — a placement directory holds 80% of candidates | none |
| 0.34 | how.mjs | `if (score >= 0.34) scored.push` | retrieval — `how` match floor | none |
| 0.34 | how.mjs | `if (score >= 0.34 && (!best` | retrieval — `how` match floor | none |
| 0.34 | where.mjs | `&& hits[0].score < 0.34) {` | retrieval — `where` weak-match floor | none |
| ½, ¼ | where.mjs | `cover >= 0.5 ? Math.max(c.score, 1) : Math.min(1, c.score + 0.25)` | retrieval — card scoring | none |
| ½ | where.mjs | `cover >= 0.5 ? Math.max(c.score, 1) : Math.max(c.score, cover)` | retrieval — card scoring | none |
| ½ | where.mjs | `(c.degenerate) c.score *= 0.5;` | retrieval — a degenerate card counts half | none |
| 1.5, ¼ | where.mjs | `: 1.5) + (c.facts.length ? 0.25` | retrieval — card order by kind | none |
| ½ | where.mjs | `concentration >= 0.5` | retrieval — a concentrated partial match | none |
| ½ | grain.mjs | `matches.filter(m => m.score >= 0.5).length >= 2` | retrieval — an unsolicited `how` injection needs two matches at 0.5 | none |
| ¾, ½ | cards.mjs | `fact: 0.75, imp: 0.5, doc: 0.5` | retrieval — card vocabulary weights | none |
| 0.6 | cards.mjs | `suffix: share < 0.6 ?` | display — "(mixed)" module label | none |
| 0.1 | mine.mjs | `0) + f.bpi * 0.1 + 0.1;` | display — role lift order | none |
| 0.1 | report.mjs | `if (Math.abs(b2 - a) >= 0.1` | display — a fact listed as moving | none |
| 0.85 | report.mjs | `model.agentShare >= 0.85` | display — the agent-share alarm | none |
| 0.6 | report-facts.mjs | `if (!(c.share >= 0.6)` | display — an uncertified "usually" row | none |
| 180 days | learn.mjs | `(H.NOW - f) / 86400 <= 180` | display — the "fresh" count in a rule's history line | none |
| ½ | oracle.mjs | `const HIT = 0.5;` | instrument — oracle hit at Jaccard 0.5 | results.md |
| 0.8 | oracle.mjs | `hit8: rows.filter(r => r.best >= 0.8)` | instrument — oracle strong-hit count | results.md |
