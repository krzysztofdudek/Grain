# 034 · `report` states a commit count that silently excludes merges, and the documented build-cost table is ~2× optimistic

**Status:** FIXED (verified independently)
**Found by:** round 3, TypeScript/nest, 2026-09-01
**Severity:** low-medium — two small honesty gaps, both in numbers a reader takes at face value

## (a) The commit count is filtered, and does not say so

nest's `git log` reports **21,710** commits. grain's model reports **"history: 12,435 commits"** — roughly half.

The cause is almost certainly correct and deliberate: `walk()` (`history.mjs`) runs `git log … --no-merges`, so
merge commits never enter the history layer. That is a defensible choice (a merge introduces no new blob of its
own). **But the rendered line says "12,435 commits" with no qualifier**, so a reader comparing against
`git log --oneline | wc -l` concludes grain lost half their history.

Confirm the mechanism before writing the fix — `--no-merges` is the obvious candidate but `CFG.megaCap` and the
`nonMegaCommits` accounting (added in J2.4b for exactly this class of "which population is this number drawn
from" problem) may also be involved. Note h8's own comment already establishes the precedent that a
population-qualified count deserves saying so.

Fix shape: qualify the number ("12,435 non-merge commits"), or state the exclusion once nearby. Cheap, same
register as the coverage disclosures already shipped.

## (b) `docs/validation.md`'s corpus table understates cold-build cost

The table claims **nest: 55.7 s**. Measured this round on the same repo: **114 s real** — roughly 2×.

The table is honest about being one machine's numbers, and hardware/OS/node version differ, so this is not a
false claim so much as a stale one. But `docs/validation.md`'s own framing is "every number below comes from a run
that can be repeated" — a number that reproduces at 2× on a contemporary machine fails that standard as written.

Note the same document already carries a "known boundaries" entry conceding that cold builds "cost minutes, not
seconds, and the corpus above does not bound how many", citing a field report of 460 s. So the honest framing
exists; the table just has not been re-measured. Also relevant: the corpus table **predates** JSON/YAML/TOML and
`.properties` support (J7.2, issue 006), which by construction add files to every build — the table's numbers
cannot be current.

Fix shape: re-measure, or mark the table with the engine version it was measured at and note that later grammar
additions raise it. Do NOT quietly edit the numbers to match one new machine — that would repeat the problem.

## Acceptance

(a) The commit count is qualified wherever it renders, or the exclusion is stated once. (b) The corpus table
carries the engine version it was measured under, and either fresh numbers or an explicit note that grammar
additions since then have raised them.
