# The proposal renderer — from a grain export to a proposed `.yggdrasil/`

**What this is.** The design of `plugins/grain/tests/stress/propose.mjs`: for each Yggdrasil artifact, the exact
mapping from export fields, the evidence line every proposed element carries, and — where a choice existed — the
measurement that settled it. The measured result of running it is
[proposal-yggdrasil.md](proposal-yggdrasil.md); the reconstruction it builds on is
[reconstruction-yggdrasil.md](reconstruction-yggdrasil.md).

**The consumer.** A maintainer adopting Yggdrasil on a brownfield repository
(`north-star-brownfield-miner`). Yggdrasil's own `getting-started` §4 tells that person to hand-write five to
eight nodes before anything works, and its `showcase` §"The Phase 0 Reality" says the honest cost is "the
equivalent of several days restructuring code" before a single YAML file. This renderer's job is to hand them
that first day's output with the evidence attached, and to be explicit about the part it cannot do.

**Three rules the renderer obeys.**

1. **Never write into the repository's own `.yggdrasil/`.** Everything lands under `<out-dir>/.yggdrasil/`. The
   CLI refuses an out-dir equal to the repo or inside its graph directory.
2. **Every proposed element carries an evidence line** — counts, paths, shares — naming what in the repository
   made grain propose it. It appears twice: as a `# evidence:` comment in the YAML, and as a row in
   `<out-dir>/proposal.json` with the structured fields behind it. A proposal without evidence is a guess with
   a YAML syntax.
3. **Nothing is asserted as true.** Every aspect ships `status: draft` (reviewer skipped, no verdict, no
   baseline, no cost); no type carries `enforce: strict`; and the honest limits are printed at the top of every
   file a human opens.

---

## 0. Inputs, and what each is used for

| input | used for | required? |
|---|---|---|
| `grain export --compact --no-anchors` | partitions, groups, directory cards, `moduleGraph`, `edges`, `archNorms`, `conventions` (with `check` descriptor, `conformingSites`, `deviatingSites`), `twins` | yes (`--export <json>` reuses one) |
| `<repo>/.grain/cache/model.json` | each partition's explicit file list, per-scope role assignments, accepted facts | optional; without it a partition's set is derived from its directory prefix |
| `<repo>/.grain/cache/tree.json` | the HEAD scopes the sub-gate lattice is computed over | optional; without it there is no sub-gate half and the proposal says so |
| `git ls-files` | the file universe every `when` is expanded against | yes |

The engine is imported READ-ONLY (`core.mjs` for `hydrateScope` / `buildVocab` / `applyVocab` / `skeyR` /
`isBool` / `kt`), the same way `reconstruct.mjs` imports `refineModOf`. Zero changes under `engine/`.

---

## 1. `yg-architecture.yaml` → `node_types`

### 1.1 The three levels, and how the level is chosen

093 §2 measured which level of grain's model actually matches a hand-written node type. Partitions match where
the hand type is a directory; **seven more hand types sit inside grain's role groups and directory cards with
nothing surfacing them**, and that was named the cheapest recall available anywhere in the report. So all three
levels are generated. The ACTIVE cut is built from directory-shaped candidates, in this order:

| # | source | export field | evidence line carries |
|---|---|---|---|
| 1 | grain **partition** | `partitions[].name` (file set from the cache; else the directory prefix minus deeper partitions) | kind, file count, scope count, number of role groups |
| 2 | grain **module** | `moduleGraph.nodes[].id` | file count, dependency layer |
| 3 | grain **directory card**, exactly one level below a partition root | `partitions[].directories[].dir` | card's file and scope counts, the partition it sits in |
| 4 | the **uncovered remainder**, by top-level directory | `git ls-files` minus the above | file count, and the words "a grouping from the layout alone, with no mining behind it" |

`_repo` — grain's residue partition — is never a type. It is "everything else", not a locality; its own
directory cards enter at level 3 and its leftovers at level 4.

**The cut is NESTED, not an antichain, and no parent is hollowed out.** The first version took the deepest
candidate and cut each parent's `when` down with `not:` exclusions. Measured against the pattern repo it LOST
recall — **15/36 against the 19/36 reconstruction baseline** — because the hand `engine` type is the WHOLE of
`source/cli/src/core`, and hollowing it to make room for three sub-directories destroyed the type grain
reproduces best. Both levels now ship, both classify, and the overlap is stated rather than resolved: Yggdrasil
permits overlapping `when` (only two `enforce: strict` types may not overlap, and this renderer sets `strict`
on nothing). Recall went to **21/36**.

**A directory card is admitted only one level below its partition root.** Grain publishes a card only for a
directory that carries scopes, so a published card is evidence of its own — but it publishes the whole ancestor
chain, and deeper cards on the pattern repo are drill corpora and fixture sub-trees. One level is where a hand
architecture actually splits (`portal/api`, `portal/server`). This level is the expensive one: it is what buys
those two types, and it costs precision (§6).

### 1.2 The `when`, and the renderer checking its own work

An active type's `when` is `{ path: "<dir>/**" }` (or `{ path: "*" }` for the root-file type). The renderer then
**expands its own predicate against `git ls-files`** and records the fidelity — the Jaccard overlap between the
file set the evidence names and the set the predicate actually selects. That number is in the evidence line and
in `PROPOSAL.md`. It is the difference between proposing a predicate and proposing a *verified* predicate.

### 1.3 Alternatives — presented, never silently substituted

093 §2 class (c) is the finding this answers: hand types are often ONE LEVEL FINER than grain's cut, split by a
`content:` predicate (`command` vs `command-support` in the pattern repo is literally "does this file export
`register<X>Command`"). So every role group and every unpromoted directory card whose file set is not already
one of the active types becomes a CANDIDATE SUB-TYPE — written to `alternatives.md`, never to
`yg-architecture.yaml` — in **both** forms a hand-written architecture actually uses, because they fail
differently:

- **`-content`** — `{ all_of: [ {path: "<host>/**"}, {content: "<regex>"} ] }`. It GENERALISES: a new file that
  matches joins the type by itself. It may over- or under-select, and the row says by exactly how much.
- **`-list`** — the membership frozen as `{ any_of: [{path: …}, …] }`. EXACT today and DEAD tomorrow: it
  classifies no file grain has not already seen. Yggdrasil's own architecture uses this shape (`showcase`:
  "`persistence-adapter` uses `any_of` across 14 explicit paths").

Each row carries: the group's size, the drafted predicate, its origin, **the measured count of tracked files the
predicate selects**, how many of those are the candidate's own, the Jaccard, and whether it clears the viability
floor. Adopting one is two edits the document spells out (paste the `when`; add a `not:` to the parent).

**Drafting the `content:` regex**, in descending order of how directly the group names itself — the first that
yields a predicate wins, and a group that yields none is not a type and says so:

| # | source | export field | regex |
|---|---|---|---|
| 1 | a decorator marker | `groups[].markers[] {type: decorator}` | `@Name\b` |
| 2 | a supertype marker | `groups[].markers[] {type: supertype}` | `\b(extends\|implements)\s+Name\b` |
| 3 | the members' own **name shape** — longest common prefix AND suffix over `groups[].members[].name` | | `\bpre[A-Za-z0-9_]*Suf\b` |
| 4 | a common prefix (≥5) or suffix (≥5) alone | | `\bpre[A-Za-z0-9_]*\b` |
| 5 | a single shared import | `groups[].imports` | the specifier, escaped |
| 6 | the group's defining name token | `groups[].nameTokens` | `\b[A-Za-z0-9_]*tok[A-Za-z0-9_]*\b` |

Rule 3 is the one that matters: it reproduces the hand shape exactly, because a hand `content:` predicate over a
symbol name IS a common prefix plus a common suffix.

---

## 2. `relations:` — allow-lists, and the one thing an established negative may not become

**Allow-lists** are aggregated from `edges[]` (resolved file→file imports), each file mapped through its owning
type. Only `uses:` is populated: grain's edge kinds on a typed repository are imports, and an import is a use,
never necessarily a call — writing `calls:` from an import would assert something the evidence does not say.
The evidence line carries the number of allowed targets and the number of resolved imports behind them.

**`default: deny`** (093 §4). Grain's `archNorms exp:"false"` rows are established NEGATIVES: "this module does
not reach that one, and the absence itself compresses". Yggdrasil's `deny` is a statement about what is
PERMITTED. On the pattern repo one of the two published negatives (`relations → core`, share 0.941) sits on a
pair the hand architecture explicitly ALLOWS. Both statements are true about different things.

> A `default: deny` is emitted **only** when the source type has NO resolved outgoing edge at all — so the deny
> contradicts nothing observed. Otherwise the negative becomes a line in `REFACTOR-BACKLOG.md` §5, labelled as
> class (c), undecidable without a human, with the reason it is not a deny spelled out.

On the pattern repo that rule produced **0 denies and 2 backlog lines** — the correct answer for both.

**Cycles.** Yggdrasil refuses a graph whose node relations form a loop (`structural-cycle`, blocking), and the
code has loops. An intermediate version broke each loop at its weakest edge to make the proposal green.
**Measured, that trade was bad**: dropping 8 edges turned one `structural-cycle` error — which names the real
defect and the real fix — into 4 `relation-undeclared-dependency` errors whose suggested fix is to put the edges
back. So every resolved edge is declared, the loops are found by DFS and reported at the top of the backlog, and
the proposal is honestly RED on a repository whose imports form a cycle. That is the finding, not a defect.

---

## 3. `model/**/yg-node.yaml` — the coarse cut, deliberately

093 §3: the pattern repo's hand graph has **250 nodes that map exactly one file**. Imitating that would be
imitating a granularity choice, not recovering evidence — how finely to review is a decision, and grain has
nothing to say about it. So: **one node per active type**, nested in `model/` so a child node's directory sits
under its parent's. Finer candidates are the appendix (`alternatives.md`), exactly as they are for types.

Four mechanics, each of which was a measured failure first:

| mechanic | why | measured |
|---|---|---|
| **organizational nodes for gaps** — every missing intermediate segment gets a `type: module`, no-mapping node | Yggdrasil reads the hierarchy from the directory chain under `model/`; a gap silently loses the whole subtree | 82 node files written, **12 loaded** |
| **dot-prefixed segments rewritten** (`.yggdrasil/aspects` → `dot-yggdrasil/aspects`); the mapping still names the real path | the model walker does not descend into a dot directory | same |
| **`parents:` lists every ancestor type** | a nested node's parent type must be declared, or `parent-type-forbidden` | 7 errors |
| **nested projects get types but no nodes**; a subtree carrying its own `.yggdrasil/` is a separate project every Yggdrasil check skips | a node whose whole mapping is invisible to the checker can never carry a verdict | 11 `mapping-path-missing` |
| **directory mapping where the directory is whole, explicit list otherwise — minus every descendant's files** | child precedence applies to a directory glob, NOT to an explicit list | **591** `file-duplicate-mapping` from two nodes |

`relations:` on a node are `edges[]` aggregated through the **deepest** owning node (Yggdrasil's own child
precedence). Evidence line: files mapped, outgoing dependencies, resolved imports behind them.

---

## 4. `aspects/<id>/` — rendered checks first, prose only for what has no shape

Two sources, one shape (`sub-gate-rows-are-the-product`, counsel memo §2 B1):

**(i) The certified set** — `conventions[]` with `established ≥ 5`. Each carries a `check` descriptor
(`enumerator`, `argument`, `expected`, `negated`, `context`), `conformingSites`, `deviatingSites` and a
`statement`.

**(ii) The sub-gate lattice** — the rules grain refuses to certify. `explain <file>` (`spectrum()` in
`core.mjs`) already exposes these as its `[obs ]` rows, as against `[NORM]` — but it conditions its cells on ONE
file's roles and directory chain and then keeps only rows that file has, so it is a per-file debug dump.
**The aggregation ticket 095 asked for** is implemented as `partitionLattice()`: the same cells, built once per
PARTITION over all its scopes from `tree.json`, with `_all:<kind>` and `r<role>:<kind>` cell ids, the same
KT/BIC/index-cost codelength, the partition's own `facts` as the NORM set — and each row carrying the sites that
do NOT conform. The **sub-gate band** is `share ≥ 2/3` (the repository's own supermajority constant, named once
in `mathematics.md`) and `< 1 − 1/λ = 0.875` (the certification bound), with `n ≥ 8` (the same support-floor
family as `cochangeMinSup`). No new constant is introduced.

### 4.1 Which enumerator classes render as `check.mjs`

The director's steer: render a deterministic check wherever the class has a shape a syntax tree can be asked
about; prose only for what has no shape, and say so per aspect. Templates exist for `imp`, `call`, `deco`,
`extends`, `returns`, `nameshape`, `filenameshape`, `lex`. Grain and Yggdrasil parse with the same tree-sitter
grammars, so a rendered check reads the same tree grain counted.

`nameshape` / `filenameshape` compile mechanically. Grain's shape alphabet (`nameShape`, `core.mjs`) is `U` a
run of uppercase, `a` a run of lowercase/digits, `_ - $ .` themselves, `?` anything else, `(XY)+` a repeated
pair — so `(Ua)+` → `^(?:[A-Z]+[a-z0-9]+)+$`, `a(-a)+(.a)+` → `^[a-z0-9]+(?:\-[a-z0-9]+)+(?:\.[a-z0-9]+)+$`. A
shape carrying `?` does not compile, and that is an answer rather than a gap.

### 4.2 `errs: under` is EARNED, not declared — and the measurement that shaped it

Every template reports a violation **only where the tree proves the negation**. A rule about a declared return
type fires on a declaration that declares a DIFFERENT one and stays silent on one that declares none. A rule
"never imports X" fires only where the import is present.

That discipline alone was not enough. A drill sweep of the first version (`yg drill` over the corpora, on the
pattern repo) returned **86 rendered checks, 423 cases, 314 pass, 56 MISS, 53 FALSE-ALARM**. For an `errs: under`
check MISS is the permitted direction and FALSE-ALARM is a broken contract, and every false alarm had one shape:

> A convention's subject is a DECLARATION inside a file; a deterministic check's unit is the FILE. "Methods in
> this role group declare a return type of `Promise`" is true of four methods in a file holding twenty, and a
> file-scoped check then refuses the file for the other sixteen.

Two closures followed, each measured:

1. **A POSITIVE rule renders only where its subject IS the file** — an import at file scope, a file name, a
   lexical layer, or a name shape the whole partition shares. A NEGATIVE rule renders in every class, because it
   fires on evidence it can see and never on absence. → 53 → 13 FALSE-ALARM.
2. **A GROUP-SCOPED rule never renders, in either direction.** The counsel memo said group-scoped conventions
   *without a marker* are unrenderable; the drill says the marker does not save them either, because a
   `content:` predicate selects FILES and a role group is a set of SCOPES. → 13 → **0 FALSE-ALARM**.

A third fix was in the corpus, not the rule (§4.4). Final sweep: **43 rendered checks, 237 cases, 208 pass,
29 MISS, 0 FALSE-ALARM, 0 unrun, 0 unsupported.**

Each rendered aspect ships `status: draft`, `errs: under`, `review_by`, a `scope: { per: file, files: … }`
predicate (path for a partition/directory rule; path + the group's `content:` regex where one exists), and the
provenance — share, n conforming, n deviating, adoption %, bits/instance, context, `asOf` sha — in both the
`description:` and the check's own header comment.

`filebirth` is excluded from drafting entirely: "types here are new" is a statement about the repository's
history, not about how a file should be written.

### 4.3 Prose, and saying which class it fell out of

An aspect that cannot render ships `content.md` with the statement, the evidence, the exemplar, the group's
superposition template (`groups[].profile.skel` — the anti-unified shape all members hold in common, with its
coverage) as "what passing looks like", the deviating sites, **and a `## Why this is prose and not a check`
section naming the class and the reason**. Prose costs a reviewer call every time it is answered and cannot be
replayed or drilled for free; the aspect says so and asks to be restated as a rule about a name.

### 4.4 Drills

Beside each rendered check, `drills/satisfies-*` from `conformingSites` and `drills/violates-*` from
`deviatingSites`, in Yggdrasil's corpus layout (each source file under such a directory is one case), capped at
5 per side, plus a `CORPUS.md` carrying the provenance and the hold-out label.

**A file carrying ANY deviating site is a `violates-` case, whatever else it also carries.** A drill case is a
file; a convention's site is often a scope inside one. Cutting a mixed file as `satisfies-` blames the check for
the corpus's own mislabelling — and did: the last 13 FALSE-ALARMs were entirely this.

**The time hold-out** is available and always labelled. `--holdout <YYYY-MM-DD>` keeps only sites whose first
appearance post-dates the cut, using the per-site `lifecycle.firstSeen` the export already carries. It is by
DATE, not by cut sha — ticket 097 does the sha version and the `yg simulate` / `yg drill` scoring. **Without the
flag every `CORPUS.md` says, in its own words, that the rule and the drill are the same data and a passing drill
proves only that the rendered check reproduces grain's own count.**

---

## 5. The refactor backlog (markdown, not YAML)

`REFACTOR-BACKLOG.md` — not part of the graph; the list of places the repository disagrees with itself, ranked
by how much of it already agrees. Every row is a decision: spread the rule, or drop it.

1. **Certified conventions with deviating sites** — adoption %, conforming/deviating counts, the rule, then the
   named paths per rule (`deviatingSites[].rel/name/phrase`).
2. **Candidate house rules below grain's gate** — the sub-gate lattice per partition: adoption %, n, scope,
   the candidate rule in words, and the count of sites to fix. This is the 095 surface.
3. **Structural twins** — `twins[]` filtered to `namedDifferently`: one shape kept under two names.
4. **Dependency cycles** — grain's `moduleGraph.cycles` and the loops found in the proposed node graph, with the
   weakest edge of each named. Marked as the reason the proposal is red.
5. **Established negatives that are NOT proposed as `deny`** — class (c), with the reason.

---

## 6. What must be said at the top of every proposal

The preamble is printed in every YAML file, every `content.md`, and all three markdown documents:

- **A rule about an ABSENCE cannot come from mining.** Grain mines what the code does; a rule forbidding
  something the repository never does leaves no evidence. 093 §6: 6 of 57 hand mechanical rules were exactly
  this shape. They must be written by hand.
- **A rule with no identifier in it cannot come from mining.** 20 of the same 57 assert a SHAPE.
- **`relations:` come from resolved imports.** On a repository whose CI already forbids an undeclared import
  they look near-perfect (093 §4 measured 0.998 precision, which is Yggdrasil's own gate reflected back); on one
  without such a gate they are incomplete in proportion to how much of the dependency graph is dynamic,
  reflective, or in a language grain has no grammar for.
- **An established negative is about what is PRACTICED, not what is PERMITTED.**

And, counted rather than described, in `PROPOSAL.md`'s header: how many group-scoped conventions were left out
as unrenderable, how many history facts were dropped as not-rules, how many drafts are prose and by which class,
whether the drills carry a hold-out, and whether the proposed node graph is acyclic.

---

## 7. Constants, and where each comes from

| constant | value | origin |
|---|---|---|
| `SUPERMAJORITY` | 2/3 | `mathematics.md` "The honest residue" — one interpretable share already behind a marker's established value, a value container's certified population and a twin's shared core |
| `LAMBDA_BOUND` | 0.875 | 1 − 1/λ, λ = 8 — the certification bound itself |
| `MIN_SUPPORT` | 8 | the same support-floor family as `cochangeMinSup` |
| `MIN_TYPE_FILES` | 2 | a one-file type is a node, not a category |
| `MIN_PROMOTE_FILES` | 3 | below it a directory split is noise a maintainer would merge back |
| `MIN_GROUP_MEMBERS` | 3 | the floor grain's own `buildCards` uses to publish a group at all |
| `MIN_WHEN_FIDELITY` | 0.5 | the same J ≥ 0.5 bar the reconstruction instrument scores at |
| `MIN_CONVENTION_SITES` | 5 | a stated admission floor; unmeasured |
| `SUBGATE_PER_PARTITION` | 6 | a cap on how much a maintainer is asked to read, not on what is measured |

The first three are the repository's own; the rest are admission floors. `MIN_TYPE_FILES` is the one whose cost
is measured: on the seven examples it removes every one-file directory, which is why `layered-architecture`
scores 0/3 where the reconstruction baseline scored 3/3 from the module fallback.

---

## 8. Running it

```
node plugins/grain/tests/stress/propose.mjs <repo> <out-dir> \
  [--export <grain export json>] [--no-history] [--holdout <YYYY-MM-DD>] \
  [--score <repo with a hand-written .yggdrasil/>] [--json <path>] [--quiet]
```

Writes `<out-dir>/.yggdrasil/{yg-config.yaml,yg-architecture.yaml,model/**,aspects/**}` plus `PROPOSAL.md`,
`alternatives.md`, `REFACTOR-BACKLOG.md` and `proposal.json`. `--score` runs the symmetric comparison against a
hand-written graph in both directions at both granularities.

Guarded by `plugins/grain/tests/propose.test.mjs` (11 tests) over a real 7-file git repository and a real
`grain export`: the proposal directory is written and never into the repo, every element has an evidence row
with a count in it, every YAML carries the preamble and an inline evidence comment, every aspect is `draft` with
exactly one rule source, **Yggdrasil's own CLI loads the staged graph and reports the same node count the
proposal wrote with no load-failure code and a clean exit**, and unit coverage of the shape compiler, the
group `content:` predicate, the render-direction rule, the node-path rewriting and the YAML emitter's quoting.
