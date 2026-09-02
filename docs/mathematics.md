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

Six tuned thresholds (a bits margin, four family specific taus, a display share floor) used to guard speech. They are
gone. Evidence is codelength alone: a fact exists iff its bits are positive. The decision to *speak* is one loss
ratio, λ = 8, applied to three questions consistently:

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

## What counts as the repository

Git decides. Anything gitignored is never processed; anything tracked is code, because a repository that commits its
vendor tree or its fixtures made that choice. In git mode the universe is the HEAD tree, where gitignore already
holds by construction, and only the tool's own store (`.grain/`, `.git/`) is invisible. Name lists such as
`node_modules|dist|fixtures` gate nothing on tracked paths and survive only in the no git fallback, where there is no
gitignore to consult. Package manifests (`package.json`, `go.mod`, `tsconfig.json`) are read for *resolution*, that
is workspaces, path aliases and the module graph, never as a statistical prior.

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
- `valueDfMin`/`valueDfMaxShare` — a population gate on what enters the value-concordance index (a value in one
  file has no concordance to report; a value in a fifth of the repository is furniture, not a concept), the same
  kind of floor as the vocabulary support constants above, not a second or third λ; whether anything is SAID about
  a value that clears the gate is still decided downstream by the one loss constant;
- the two-thirds supermajority — one interpretable share behind a marker's own established value, a value
  container's certified population threshold, a structural twin's shared core, and a historical rename's placement
  precedent, named once here rather than re-derived at each site (a role group's name-stem kinship with another
  group uses a different, deliberately non-MDL floor — 0.6 over at least 4 members, see `impliedOf.companion`);
- the boundary between form and meaning: grain measures the shape of code, not its semantics; two behaviourally
  identical implementations with different trees are different to it, and it never pretends otherwise.
