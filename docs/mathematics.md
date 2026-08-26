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
|---|---|
| a convention | a cell whose codelength gain is positive |
| a group (role) | a mixture component that compresses the scope population (greedy MDL agglomeration over feature bags) |
| a template | a shared subtree with holes whose instances anti-unify (Plotkin's least general generalization) |
| a partition | a cut of the directory tree that compresses the file style distributions |
| a deviation | an instance whose pointwise codelength excess clears the loss bound |
| drift, nucleation | the arrival process of a rule's instances along the history |

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

## The language bridge

Every commit is a translation pair: natural language in the message, code in the touched files. The history walk
accumulates message token to file affinity (the bulk commit cap is the only gate; a single file commit is the
sharpest pair there is), and `where` consults it only for query words no code card carries, always citing the
evidence. Repo fillers such as `feat` and `fix` are demoted by document frequency over that repository's own commits,
never by a word list.

## Placement

For a file the accepted tree does not know, three path only rules ask whether its name kin already concentrate
somewhere else: same suffix files sharing a basename token (two thirds in one directory, none where the file is), the
suffix subtree (80 percent under one prefix, file outside it), and the root dweller case (every kin lives one level
deeper). Competing kin argue inside one note, strongest count first, and the note is delivered *before* the write,
because the third agent trial measured that a note after the write loses to sunk cost. Everything is phrased as an
observation with counts; deliberate placement is explicitly left alone.

## The honest residue

What remains that mathematics does not decide, on the record:

- the alphabet: the tree-sitter grammars and their machine readable node type inventories;
- the measure: git, both as the file universe and as the history every weight comes from;
- the choice of universal code (KT plus BIC plus index cost); a different standard code changes constants, not
  conclusions;
- λ = 8 itself, one interpretable constant in place of six tuned ones;
- statistical power floors kept as compute short circuits (a partition below 30 scopes says nothing; below the raw
  minimum, positive bits are unreachable anyway) and the clustering ambiguity constants;
- the boundary between form and meaning: grain measures the shape of code, not its semantics; two behaviourally
  identical implementations with different trees are different to it, and it never pretends otherwise.
