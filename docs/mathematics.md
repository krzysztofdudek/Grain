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
| drift, nucleation | a change point in the birth order of a rule's instances, counted per commit, whose codelength gain is positive |
| an architecture norm | a (source, target module) cell whose reach rate, contrasted with the reach rate outside both, has a positive codelength gain |
| a commit archetype | a recurring cluster of past commit footprints; a cell of it is certified when, over every commit carrying the shape's other cells, its rate in the remaining files has a positive codelength gain against as many random files |
| a value concordance | a set of values whose joint presence across files compresses better than treating them independently |
| a co-change partner | a file whose touched rate over the edited file's commits, contrasted with the rate the size of those commits gives it by chance, has a positive codelength gain |
| a deviation's fix rate | the share of edits to a convention's deviants made by fix commits, contrasted with the share over edits to its whole population |
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

Evidence weights come from a scope's own history and nothing else: code younger than `freshDays` counts half, code rewritten within two weeks of its birth counts a quarter, and no weight falls below `floor`. Who wrote the code does not enter. Every commit counts the same, whether a person or an agent made it, because a commit does not reliably say which: agent-assisted work is committed under a person's name as often as under the agent's.

Vacuity is not a threshold problem and is handled by the null model instead: structural facts (node type presence,
statement shapes, first statement, return shape, arity, variable shape) speak only as a *contrast*, in a group or
directory whose default differs from the partition's. "Methods here always contain a member_expression" describes the
language, not a choice anyone made, and no bar on bits can know that; the reference distribution can.

λ is not the only number the engine compares against. Power floors, compute guards, display and ranking weights remain, and so do evidence gates that λ does not derive: the display floor for absences in `spectrum`, the node-level co-change floor in `advise`, the calibration margins. One of them is a bits margin again: where history calibrates a convention and its repair precision is below 0.8, an accusation needs log₂ λ + 1.5 bits instead of log₂ λ. Every such number is listed with its file and role in *The numeric register* at the end of this page, and a test keeps that list and the code in step.

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

A group cell is contrasted with the scopes its label is dealt among. Role induction assigns only scopes with some content of their own and clusters them on their predicates, so the scopes it assigns differ from the ones it leaves out by construction. In Grain's own tests every group of methods is named in camelCase, and the methods left unassigned are one-word `it` callbacks. Coded against the whole partition, each such group restated that difference, and with the role labels shuffled among the assigned scopes the same 9 cells certified in every run. So where a kind has more than one group, a group cell is coded against every scope of that kind assigned to any group, and a group absence against the rest of those scopes. Where a kind has one group, that group is the assigned population itself and keeps the partition as its reference; shuffling the labels cannot move such a cell, so the null says nothing about it either way.

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

## Drift and nucleation

A rule's instances arrive in an order: the order their scopes were born, read from the history's lifecycle rows
without re-extracting any old blob. The unit is the commit. Each commit contributes one observation per distinct value
it bore, 1 for the expected value and 0 for any other, so eleven accessors one rename generates are one departure,
not eleven. One KT code for the whole sequence is compared with two KT codes split at a commit boundary τ, plus
log₂ of the number of boundaries, which names τ. A change point exists when that gain, less one index cost over
every fact that had a boundary to cut at, is positive. KT is exchangeable, so each segment's code depends only on its
counts and the search is linear in the number of commits.

After a certified τ the λ bound is read on the observations that follow it. When the expected value's KT predictive
there is below 1 − 1/λ and lower than before τ, the rule is *fading*: `check` no longer accuses new code under it,
because the code written since does not carry it at the odds an accusation needs. When another value's predictive
there reaches 1 − 1/λ, that value is *nucleating*, and `check` stands down on it. With two values, three commits after the cut that all carry the new one already reach that bound, (3 + ½) / (3 + 1) = 7/8, so nucleation can rest on three commits; only the change point's gain, less its index cost, guards that edge. typeorm's cut where its errors began to extend `TypeORMError` has three births after it and certifies at 3.1 bits. A change point towards the
expected value is reported as a trend and nothing more.

The axis is commits, never calendar days. The earlier detector fitted a slope through 90-day windows and needed three
of them, so no repository younger than about 270 days could show drift at all, whatever its pace. It also rested on
four hand thresholds (a slope, two authors, a 5% deviation, four scopes a window), all gone.

## Architecture norms

A layering norm is a statement about one source (a module, or a role group one level finer) and one target module: "files here reach it" or "files here do not". It is decided as a contrast between two populations, the same cell the language bridge and the birth obligations use, never against a flat coin. Only *capable* files enter it, meaning files with at least one resolved out-edge: a file that imports nothing says nothing about which modules it avoids. For a source A and a target B, k_A of the n_A capable files of A reach B, and k_O of the n_O capable files outside A and outside B do. The gain codes A's reach/no-reach outcomes at A's own KT rate instead of at the outside KT rate, pays the BIC half log, and pays one index cost over every (A, B) pair where B is reached by at least the raw floor of capable files and the outside population is at least that large. That universe includes the pairs A never crosses: a boundary nobody has crossed is a candidate. On Yggdrasil, none of the 77 capable end-to-end test files reaches the model module, against 323 of 807 capable files elsewhere, and that absence certifies at 40 bits. A norm speaks when the gain is positive, when the λ posterior names its value, and when the contrast points the way the value says: an absence only where A reaches B less often than the rest of the repository, a presence only where it reaches B more often. That direction replaces the old 10% "reach elsewhere" floor.

The same contrast now decides a group or directory absence inside a partition: the cell is coded against the scopes of its kind outside the cell, and the absence stands only where the gain survives and the cell uses the thing less. That replaces a 30% partition-wide floor. A partition-wide absence is contrasted the same way with the same predicate in the repository's other partitions, whose weighted outcomes `learn()` hands to `mine()`; that replaces a declared 10% floor. It also still needs the thing accepted as present in another cell of its own partition. With one partition, or a kind that lives only in this one, there is nothing to contrast it with and no partition-wide absence is stated. Both absence tests pay one index cost again on a cell that already paid it when it was accepted. They are a second test of the same candidate against another population, so the double charge is deliberate and makes them stricter, never looser.

Measured under an edge-permutation null (validation.md, *False certifications under a null*): the flat coin certified 12.9 absence norms per shuffle on Grain and 17.7 on Yggdrasil, as many as or more than on the real edges; the contrast certifies 0 on both.

## The sub-gate band

`propose` also reads the lattice below certification: rows practised by a supermajority that did not clear the λ bound. They can become `advisory` rules, so a row enters the band only where the objective holds for it. Its contrast bits must be positive: a role row against the assigned scopes of its kind (the partition, where the kind has one group), a partition-wide absence against the same predicate in every other partition, a partition-wide presence under the flat code, and one index cost over the whole repository's lattice. A structural predicate enters only as a contrast, as in `mine()`. The KT posterior Beta(k + ½, n − k + ½) may put at most 1/λ of its mass below the two-thirds supermajority, which is λ applied to the band's lower edge instead of a raw share. The posterior predictive must still sit below 1 − 1/λ, or the row would be certified. The per-partition reading cap keeps the rows with the most bits, not the highest share. Each row's contrast must point its own way: an absence row uses the thing less often than its reference, any other row carries its value more often (no row of the bands measured was affected). The index cost is paid over every cell the lattice builds, about one bit more than the certification's own candidate count. Paying the certification's count instead was measured: the band grows from 36 to 62 rows on Grain, 52 to 59 on Yggdrasil and 48 to 50 on typeorm on that bit, and it is not shipped without a review of the rows it adds.

## Commit archetypes

A commit's footprint is a feature bag — the refined module of each file it touched, the role group of each scope it
changed, each touched file's suffix — and the same greedy MDL agglomeration that clusters scopes into role groups
(generalised to take any feature bag, not only a scope's own) clusters footprints into recurring shapes. A cell of a
shape is certified only when coding its rate WITHIN the shape's own members costs fewer bits than coding it at the
rate of every footprint the history holds — a likelihood-ratio contrast against the whole population, the same
branch `mine()` uses to test a role cell against its reference population, never the uniform coin-flip null a package-wide
predicate is judged by. A cell every commit in the repository touches carries no shape, however unanimous it is
inside one archetype; the contrast is what tells the two apart, where a flat evidence-only test cannot. That contrast only makes a cell a
*candidate*. It is paid on the footprints the clustering chose because they share the cell, so on its own it
certified about as many cells on a swap-randomised history as on the real one (36.4 against 38 a run on Grain, 150.8
against 167 on Slim; validation.md, *False certifications under a null*).

A candidate is certified by a second test that the selection does not decide. Its *anchor* is the shape's other
candidates, minus the ones that live in the same files as this cell among the members: a module and its own suffix
are one file, not two places a change goes. Over every footprint of the history (members or not) in which each anchor
cell is carried by a file that does not carry this cell, and which has at least one file carrying no anchor cell,
the outcome is whether one of those s remaining files carries the cell. Had those files been drawn at random from the
history's file touches that carry no anchor cell, one would carry it with probability 1 − (1 − p)^s, p that
population's KT share. The outcomes coded at their own KT rate must beat those expectations after the BIC half log
and the family's index cost, and the rate must be the higher one. So a bigger commit is expected to touch more by
chance, a cell that only rides along with big commits earns nothing, a suffix that is simply what is left once the
anchor's files are set aside earns nothing, and a shape whose candidates all live in one file certifies nothing: it
is a place commits touch, not a shape of what else they touch. `how`'s certified-shape line and `missing: change
shape:`'s residual cells both read off this certification; which commits cluster together is a modelling choice, not
itself a claim. On the same randomised histories the test certifies 0 cells on 8 of 10 repositories and at most 0.4 a
run on the other two. The family's index cost is log₂ of the cells the history carries at the raw floor, paid once; the conditional test is
really searched over (shape, cell) pairs, one anchor per shape, so it under-pays by about log₂ of the number of shapes.
It is left that way because the null does not show it (the counts above, and at most 0.67 a run under `selftest
--null` since, validation.md); paying for the pairs would only remove real cells.

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

## Co-change partners

A partner is named for one direction at a time, the edited file's own, by the obligation cell. Of the n commits that touched the edited file, k also touched the partner, whose own commits are g of the N commits the counts were drawn from. Coding the partner's touched/untouched outcome at the edited file's KT rate instead of at its base rate must pay the BIC half log and one index cost over every directed pair the model holds, and the rate must be the higher one. A partner that changes with a third of every commit is not named for changing with a third of this file's; a hub names a test file only when the hub's own commits raise that file's rate, and it prints the hub's count ("8 of 392"), not the test's. Nothing else gates the answer: the old 75% floor for a multi-file change and the one-third floor for a single file are gone, and `cochangeMinSup` only decides which pairs are stored. A partner that fails the contrast but whose own rate clears the λ display bound is reported apart, as ambient. Scope-level co-change uses the same cell over the commits that touched between one and `scopePairCap` scopes, the population its scope counts are drawn from, with the base rate g/N.

The base rate of a file pair accounts for commit size. A commit of s files leaves a partner s − 1 places to appear in, so a file committed with twenty others meets a busy partner in many of its commits by nothing but their size, and g/N, the partner's share of all commits, cannot see that. The file touches of the N commits number T; the edited file takes n of them and leaves S = T − n, of which the partner holds g, so its share of a place is π = (g + ½)/(S + 1), the KT estimate. The edited file's commits carried o other files in all, m = o/n per commit, and the base rate is 1 − (1 − π)^m: the chance that m places drawn at the partner's share include it. This is what the swap-randomised null keeps (every commit its size, every file its commit count), and taking the mean m instead of each commit's own size never expects less than the sizes would, because 1 − (1 − π)^m is concave in m. The rate is observed, as g/S, for the requirement that the partner be touched more often than it. No constant is added. The ambient label is not sized: a partner that fails the contrast is reported apart as ambient when its own share of all commits, g/N, clears the λ bound. It never makes a partner named; it only decides whether one that was not named is shown as background.

The λ bound itself was measured as the display gate and rejected. Over 14 repositories (validation.md, *Co-change partners, prospective*), a partner whose rate over the edited file's commits must reach 7 of 8 is named in 2.6% of cases, and recovers a companion in 2.5% of them against 21.5% for the old gate. The contrast alone recovers 22.8%, names a true companion first more often (0.50 against 0.44 of fired cases), and certifies far fewer partners on a swap-randomised history: 175 against 454 per run summed over the 14. With the base rate g/N it was not uniformly better on that null: on typeorm, Slim and flask, which commit many files at once, it certified more than the old gate (94 against 23 on typeorm), because a base rate over all commits ignores commit size. With the commit-size base rate the same null names 8.7 partners a run summed over the 14, none on typeorm or flask; hit@3 moves from 0.228 to 0.217, the non-obvious hit@3 stays at 0.108 and precision@1 rises from 0.50 to 0.51 (validation.md, *Co-change base rate by commit size*). `grain selftest --cochange` runs this measurement on one repository.

## Deviation fix rate

Is an edit to a scope that departs from an accepted convention more often a fix commit than an edit to the convention's whole population? One cell per accepted fact, over modification events, not scopes: the deviants' fix edits and plain edits coded at their own KT rate instead of at the population's (conformers and deviants, the parent tally that contains them), with the BIC half log and one index cost over every fact with enough observable deviants. The claim needs the excess direction and the λ bound on it: the KT posterior Beta(fix + ½, plain + ½) of the deviants' per-edit rate may put at most 1/λ of its mass at or below the population's rate. The unit used to be the scope ("did it ever get a fix"), and that measured exposure: on Grain's own history P(fix > 0) climbs from 0.13 at one or two edits to 0.53 at six or more, so deviants that were simply edited more read as costly. The output says what was counted, as an association: "edits to deviants were fixes N× as often (k of m edits vs K of M; fixes in s of S deviants)". It never says a deviation costs anything. The bound treats edits as independent, and they are not: edits cluster within scopes, so a few deviants edited many times can carry the whole rate. No bound at the level of scopes is applied; the note says instead how many of the deviants the fix edits fell on, so a reader sees when a claim rests on a handful (typeorm's `github-issues` claim: 9 fix edits in 7 of 44 deviants).

## Value concordance

An enum's members, and the string literals that appear inside one syntactic container (a switch, an object literal,
another enum), are values; a shared container identity groups them into siblings. Whether a set of siblings
travels together — every file carrying most of them carries all of them — is a codelength question over a
two-outcome cell (complete carrier vs. not) coded against independence of the members given their own shares. Among
the files that declare the container, member j is carried by a share p_j; had the members been carried
independently, a qualifying file (at least t of the m members) would be complete with probability Π p_j / P(X ≥ t),
X the Poisson-binomial count over the p_j, computed exactly. A set whose members are each near-ubiquitous, a schema's
required keys, is complete by the marginals alone and compresses nothing; a set whose members are each optional but
travel together does. The old null was a flat 50/50 coin, and every norm it certified on Grain and Yggdrasil was a
pair of YAML schema keys. A candidate is one whole
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
- the co-change support floor `cochangeMinSup` (a pair must co-occur in at least 8 commits before it is stored at
  all) — a compute guard in the same family as the statistical power floors above; whether a stored pair is named is
  decided by the co-change cell;
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

Every non-integer numeric literal and every literal ratio (`2 / 3`, `(n * 2) / 3`) in the top-level engine files (`plugins/grain/engine/*.mjs`; the vendored runtime and the grammars are not scanned), and every literal day window (`N * 86400`, `/ 86400 <= N`), is on this list with its role. Each row quotes enough of its line to pin that one site, so a new use of the same number elsewhere in the file needs a row of its own. A few integer floors that decide speech are listed too, but integers are not audited: `n >= 4` and its kin can still enter unlisted. The test `numeric-register.test.mjs` fails when a literal of the audited kinds appears in those files without a row here, when a row's code no longer appears in its file, and when a row's value is not the number in its code, so a changed value cannot keep an old row. Two blind spots: a literal inside a template string's `${…}` is not scanned, and a multi-line string is not stripped.

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
| `freshDays` | 14 | code younger than this weighs half |
| `floor` | 0.05 | the lowest weight a scope can have |
| `calibHorizonDays` | 365 | calibration's temporal split; a history shorter than this is not calibrated |
| `calibSettleDays` | 30 | departures younger than this are not yet judged repaired or kept |
| `calibMinEv` | 12 | departures needed before calibration speaks |
| `denyMinEv` | 35 | departures needed before `denyEligible` |
| `targetPrec` | 0.8 | repair precision under which the accusation margin applies |
| `cochangeMinSup` | 8 | commits a pair must share before it is stored |
| `megaCap` | 30 | commits touching more files than this are left out of pairing |
| `fpsCap` | 20000 | per-commit footprints retained |
| `scopePairCap` | 200 | scope pairs counted per commit |
| `dirMin` | 25 | scopes of a kind a directory needs to be its own context |
| `nullTrades` | 50 | curveball trades per retained commit in `selftest --null` and `--cochange` (measurement only; counts are flat from 20, validation.md) |
| `NCAP` | 700 | role clustering sample cap |
| `SUP` | nodeType 20, call 8, imp 5, ext 4, shape 15, deco 8, ret 4, pt 4 | vocabulary support floors per enumerator |
| `TOPK` | nodeType 30, call 80, imp 60, ext 30, shape 40, deco 40, ret 30, pt 30 | vocabulary top-K per enumerator |

The literals in the code follow. "Cited" names the measurement a value rests on where one is recorded; `none` means neither the code comment nor [results.md](results.md) records one.

| value | file | code | role | cited |
|---|---|---|---|---|
| ½ | arch.mjs, commit-log.mjs, facts.mjs, mine.mjs, obligations.mjs, propose-lattice.mjs, spectrum.mjs | `data - 0.5 * (K - 1) * Math.log2(Math.max(` | derived — BIC penalty, ½ log₂ n per free parameter | — |
| ½ | commit-log.mjs | `data - 0.5 * (K3 - 1) * Math.log2(Math.max(df, 2))` | derived — BIC penalty, ½ log₂ n per free parameter | — |
| ½ | learn.mjs | `data - 0.5 * (KD - 1) * Math.log2(Math.max(nMods, 2))` | derived — BIC penalty, ½ log₂ n per free parameter | — |
| ½ | learn.mjs | `data - 0.5 * (KV - 1) * Math.log2(Math.max(neff, 2))` | derived — BIC penalty, ½ log₂ n per free parameter | — |
| ½ | mine.mjs | `(ne + 0.5) / (neff + K / 2) >= 1 - 1 / CFG.lambda` | derived — KT posterior predictive | — |
| ½ | arch.mjs | `(ne + 0.5) / (nA + K / 2) >= 1 - 1 / CFG.lambda` | derived — KT posterior predictive | — |
| ½ | propose-lattice.mjs | `(r.ne + 0.5) / (r.n + r.K / 2) < LAMBDA_BOUND` | derived — KT posterior predictive: a sub-gate row is still below the certification bound | — |
| ½ | propose-lattice.mjs | `r.ne + 0.5, r.n - r.ne + 0.5)` | derived — the KT posterior Beta(k + ½, n − k + ½) whose mass below two thirds gates a sub-gate row | — |
| ½ | propose-lattice.mjs | `? 1 : 0.5; y < x; y++)` | derived — Γ(½) = √π starts the exact half-integer log Γ recursion | — |
| ½ | commit-log.mjs | `(k + 0.5) / (df + K3 / 2) >= 1 - 1 / CFG.lambda` | derived — KT posterior predictive | — |
| ½ | commit-log.mjs | `(k + 0.5) / (n + K / 2) >= 1 - 1 / CFG.lambda` | derived — KT posterior predictive | — |
| ½ | commit-log.mjs | `const p = (freeC + 0.5) / (free + 1);` | derived — KT estimate of the share of anchor-free file touches that carry an archetype cell | — |
| ½ | commit-log.mjs | `const rate = (k + 0.5) / (n + 1);` | derived — KT rate of an archetype cell over the footprints that carry its anchor | — |
| ½ | commit-log.mjs | `data - 0.5 * Math.log2(Math.max(n, 2)) - idxCost` | derived — BIC penalty, ½ log₂ n for the one free rate | — |
| ½ | weights.mjs | `lgh[k - 1] + Math.log(k - 0.5)` | derived — Γ(k + ½) by the recurrence Γ(x + 1) = x·Γ(x), for the KT code of a birth sequence | — |
| ½ | weights.mjs | `((post[v] || 0) + 0.5) / (m + K / 2)` | derived — KT posterior predictive after a change point | — |
| ½ | facts.mjs | `0) + 0.5) / (n + K / 2);` | derived — KT posterior predictive | — |
| ½ | facts.mjs | `(k + 0.5) / (n + K2 / 2) >= 1 - 1 / CFG.lambda` | derived — KT posterior predictive | — |
| ½ | learn.mjs | `betaCdf(q, local.fix + 0.5, local.plain + 0.5) <= 1 / CFG.lambda` | derived — the KT posterior Beta(k + ½, n − k + ½) whose mass below the population rate gates a deviation's fix rate | — |
| ½ | learn.mjs | `(ne + 0.5) / (neff + KV / 2) >= 1 - 1 / CFG.lambda` | derived — KT posterior predictive | — |
| ½ | mine.mjs | `0) + 0.5) / (sraw + K / 2) >= 1 - 1 / CFG.lambda` | derived — KT posterior predictive | — |
| ½ | obligations.mjs | `(k + 0.5) / (rec.n + K / 2) >= 1 - 1 / CFG.lambda` | derived — KT posterior predictive | — |
| ½ | mine.mjs | `nc * h + 0.5 * Math.log2(Math.max(nc, 2))` | derived — BIC penalty in the role clustering codelength | — |
| ½ | partition.mjs | `c += 0.5 * Math.max(0, vs.length - 1)` | derived — BIC penalty in the partition codelength | — |
| 1.96 | weights.mjs | `const z = 1.96,` | derived — 95% Wilson interval | — |
| ½ | mine.mjs | `ri.amb.has(i) ? 0.5` | derived — the ambiguous member's half vote | — |
| 2/3 | propose-base.mjs | `SUPERMAJORITY = 2 / 3` | declared — the two-thirds supermajority | none |
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
| 0.8 | config.mjs | `targetPrec: 0.8,` | gate — calibrated repair precision under which the accusation margin applies | none |
| 1.5 | weights.mjs | `Math.log2(CFG.lambda) + 1.5` | gate — accusation margin in bits for a convention history calibrates below `targetPrec` | none |
| 0.9 | weights.mjs | `denyEligible: lb >= 0.9 && n >= CFG.denyMinEv` | gate — Wilson lower bound for `denyEligible` (report only; nothing blocks) | none |
| 0.05 | config.mjs | `floor: 0.05,` | weight — the lowest weight a scope can have | none |
| 0.3 | weights.mjs | `if (!L) return 0.3;` | weight — a scope with no history row | none |
| ½ | weights.mjs | `CFG.freshDays ? 0.5` | weight — code younger than `freshDays` | none |
| ¼ | weights.mjs | `ws * (L.churn ? 0.25 : 1));` | weight — code rewritten right after birth | none |
| 14 days | history.mjs | `e.c.ts - L.first <= 14 * 86400` | weight — "rewritten right after birth" window (equal to `freshDays` today, not tied to it) | none |
| ½ | mine.mjs | `Math.min(sd.weight, 0.5 * neffReal)` | weight — a maintainer seed counts at most half the cell | none |
| 0.1 | mine.mjs | `confCarriers / f.conform.length >= 0.1` | gate — an alternative marker must be rare among conformers | none |
| 0.2 | spectrum.mjs | `0) / tot < 0.2) continue;` | display — `explain` shows a "never X" lattice row only at 20% partition-wide use | none |
| 1/3 | grain-advise.mjs | `MUTUAL_CONF_FLOOR = 1 / 3` | gate — node-level co-change advice floor, both directions (a node has no commit count to contrast with; the scope-pair contrast was measured and passes nearly every stored pair, validation.md) | none |
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
| 0.6 | report-facts.mjs | `if (!(c.share >= 0.6)` | display — an uncertified "usually" row | none |
| 180 days | learn.mjs | `(H.NOW - f) / 86400 <= 180` | display — the "fresh" count in a rule's history line | none |
| ½ | oracle.mjs | `const HIT = 0.5;` | instrument — oracle hit at Jaccard 0.5 | results.md |
| 0.8 | selftest-cochange.mjs | `const TRAIN_SHARE = 0.8;` | instrument — `selftest --cochange` learns from the oldest 80% of the footprints and scores the rest | validation.md |
| 0.8 | oracle.mjs | `hit8: rows.filter(r => r.best >= 0.8)` | instrument — oracle strong-hit count | results.md |
