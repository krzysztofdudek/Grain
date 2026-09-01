# 010 · work log

## Files touched

- `plugins/grain/engine/core.mjs` — `checkFile`'s `newScopeHits` construction rewritten (§010 d/a/e/b).
- `plugins/grain/engine/grain.mjs` — `cmdCheck`'s headline and new-scope rendering (§010 c), `newIn`/`newCount`
  hoisted ahead of the headline.
- `plugins/grain/tests/new-scope-disclosure.test.mjs` — 5 new tests + shared `bareSrc`/`plantGroup`/`REAL_EXEMPLAR`
  helpers.
- `plugins/grain/tests/grain.test.mjs` — 2 existing assertions updated (headline wording changed for a fixture that
  itself contains new-to-index scopes).

## What changed and why

**(d) — lead with the nearest CERTIFYING group.** `checkFile` now asks, of the two candidates `assignAll` already
computes (`sc.best`/`sc.second`), which is the nearest one carrying >=1 role-conditioned fact for this kind
(`certN`). That one is foregrounded (named + its `requires ...` clause via `groupTrait`, reusing `isDefiningFact`
exactly as `groupDesc` did before). The genuinely-nearest score is still reported, honestly, just not foregrounded
when it certifies nothing. A mined label that is the literal string `'group'` (induceRoles' own no-majority-feature
fallback) is treated as unlabelled ("an unlabelled cluster (N members)") and never rendered as `«group»`. When
neither candidate certifies anything, the line says so plainly ("— no nearby group certifies a convention").

**(a) — collapse per (kind, chosen neighbour), not per scope.** Since `checkFile` runs on one file at a time, "per
file" collapsing is just "per bucket key" here. Scopes are grouped by `` `cert#${kind}#${leadIdx}` ``,
`` `nocert#${kind}#${best}#${second}` `` or `` `nogroup#${kind}` `` and rendered as one hit, naming up to 3 scopes
then `and N more` (the house idiom, matching `deviantLine`/`archCellLabel` etc.). The outer 8-line cap in
`cmdCheck` is unchanged — it now caps collapsed lines, which is the actual fix for "volume".

**(e) — exemplar pointer.** Reuses `roleExemplar(model, part.name, leadIdx)` (the same resolver the "See:" line
under a deviation uses) — no second resolver written. Only offered when a lead group was actually chosen (never
for the below-floor or "nothing certifies" branches, where there is no conforming neighbour to point at).

**(c) — headline qualifies the deviation count in place.** `cmdCheck` now computes `newIn`/`newCount` (the raw
scope count, from each hit's new `count` field) *before* building the headline, and the headline reads
`` `${inChange.length} known deviation(s) in your change, ${preOnly.length} pre-existing, ${newCount} unclassified
scope(s)` `` whenever a disclosure is pending. When `newCount` is 0 the wording is byte-identical to before this
fix — verified by a dedicated test and confirmed by the full suite (no other test's headline assertion needed to
change except the one below).

**(b) — shortened tail.** Replaced the two-clause, ~40-word epistemic disclaimer with a single six-word factual
caveat ("Judged against the package baseline only."). The full argument stays in `docs/validation.md`'s Known
boundaries, untouched.

## Addendum — Python/flask tester's follow-up acceptance criterion

After the initial pass, a follow-up arrived from the Python/flask tester with a concrete target ("0 known
deviations, 1 unclassified scope" for (c), and a fresh reproduction for (a)+(d) combined: three new setup-style
methods added in ONE edit, where **both** neighbours happened to carry induceRoles' bare `'group'` fallback in
their live data — not just the nearer one). Checked the existing implementation against it:

- Headline shape already matches the spirit (`N known deviation(s) in your change, M pre-existing, C unclassified
  scope(s)`, qualifying the count in place) — the `(s)` idiom instead of grammatical pluralization is deliberate,
  matching the SAME line's existing `convention(s)`/pre-existing/`maintainer decision(s)` style, not a hedge.
- `groupName`/`groupDesc` were already written generically (never assumed the *lead* group has a real label) —
  so the "both neighbours unlabelled" case should already degrade to "an unlabelled cluster (N members, requires
  X)" rather than `«group»`, even when the unlabelled one is the one being foregrounded for its requirement.

Added one more test to pin this compound case explicitly (the follow-up specifically asked for a fixture that
exercises dedup and naming together, not in isolation) — see `(§010 d+a compound)` below. It passed on the first
run against the already-shipped implementation: no source change was needed, only test coverage for a case the
implementation happened to already get right by construction.

## Tests

Added to `new-scope-disclosure.test.mjs`:
1. `(§010-d)` — flask's exact shape (marker splits population into an unlabelled 0-convention catch-all and a
   labelled certifying group; catch-all is nearer). Asserts the line names the CERTIFYING group + its requirement,
   still discloses both raw scores (0.50 and 0.20), and never contains the literal `«group»`.
2. `(§010-d negative)` — neither neighbour certifies (one bears the `'group'` fallback, one a real-but-uncertified
   label). Asserts an honest "no nearby group certifies a convention" line, the real label may still be named, the
   literal `«group»` never appears, and no exemplar pointer is offered.
3. `(§010-e)` — asserts the `See: src/handlers/Order.ts:1 \`OrderCommand\`` pointer appears and independently
   verifies the target file's line 1 really is `class OrderCommand`.
4. `(§010-a)` — 5 new scopes in one file, one group → `newScopeHits.length === 1`, `hit.count === 5`, plural verb,
   `and 2 more`.
5. `(§010 d+a compound)` — the tester's exact fresh reproduction: 3 new scopes in one edit, BOTH the nearest and
   the certifying neighbour carry the bare `'group'` fallback. Asserts collapse to 1 hit with `count: 3`, never
   `«group»`, both neighbours render as "an unlabelled cluster (N members[, requires ...])", and the exemplar
   pointer is still offered (a group need not be named to be pointed at).
6. `(§010-c)` — a file with no pending disclosure keeps the pre-existing headline wording verbatim (and never
   contains "known deviation"/"unclassified scope"); a genuinely new, uncommitted file (reusing the top-level
   fixture's persisted Command role, via the real CLI path) produces a headline containing
   `N known deviation(s) in your change, M pre-existing, 1 unclassified scope(s)`.

Updated in `grain.test.mjs` (existing behavior change, not new behavior): the "steering" test's `zz.handler.ts`
fixture is itself a brand-new, never-committed file with 3 top-level scopes, so it now also carries a pending
new-scope disclosure — its headline assertions (lines ~165 and ~168) were updated from
`0 deviation(s) in your change, 0 pre-existing[...]` to
`0 known deviation(s) in your change, 0 pre-existing, 3 unclassified scope(s)[...]`.

## Red evidence

**grain.test.mjs (headline wording, existing-behavior change):** hand-reverted the `cmdCheck` headline line back to
its pre-fix form via `Edit`, ran `node --test tests/grain.test.mjs`:
```
✖ steering: a committed seed promotes a pattern — the retired rule mutes, where/check/report carry the decision, and rm withdraws it
  AssertionError: The input did not match /0 known deviation\(s\) in your change, 0 pre-existing, 3 unclassified scope\(s\) · 1 maintainer decision\(s\).../
  actual: '...governed by 13 convention(s) · 0 deviation(s) in your change, 0 pre-existing · 1 maintainer decision(s) your change departs from...'
```
14/15 passed, 1 failed as expected. Restored via `Edit`; back to 15/15.

**new-scope-disclosure.test.mjs (new §010 tests):** hand-reverted `checkFile`'s entire `newScopeHits` block back to
the pre-§010 implementation via `Edit` (saved the new block to a scratch file first), ran
`node --test tests/new-scope-disclosure.test.mjs`:
```
✖ (§010-d) ... never render a bare «group» placeholder
  actual: "... nearest «group» (11 members, 0 conventions) at 0.50, next «AcctBase» (6 members, requires extends AcctBase) at 0.20. Judged against the package baseline only — a new scope that omits..."
✖ (§010-e) ... expected the exemplar pointer — none present (old implementation never adds one)
✖ (§010-d negative) ... expected /no nearby group certifies/ — old text has no such branch
✖ (§010-a) ... 5 !== 1 — old implementation emits one hit per scope, not per group
```
7/11 passed (the 6 old + the already-independently-verified (§010-c) headline test, which is orthogonal to this
block), 4 failed exactly as expected. Restored via `Edit` from the scratch copy; back to 11/11.

**new-scope-disclosure.test.mjs, addendum (`§010 d+a compound`):** same hand-revert, ran again after adding the
compound test:
```
✖ (§010-d) ... nearest «group» (11 members, 0 conventions) at 0.50, next «AcctBase» ...
✖ (§010 d+a compound) ... one authoring decision must collapse to ONE disclosure, even with nothing to name:
  3 !== 1 — three near-identical hits, each: "nearest «group» (11 members, 0 conventions) at 0.50, next «group»
  (12 members, requires @setup) at 0.20" — reproduces the tester's exact fresh-repro shape (both neighbours bare
  `«group»`, one paragraph per scope).
```
7/12 passed, 5 failed exactly as expected (the same 4 as before, plus the new compound test). Restored via `Edit`
from the scratch copy; back to 12/12.

## Suite counts

- Baseline (before any change): `npm test` → **1477 pass / 1477 total**.
- Final (after all changes): `npm test` → **1483 pass / 1483 total** (1477 + 6 new §010 tests; the 2 updated
  `grain.test.mjs` assertions replace existing assertions, no count change there).
- `new-scope-disclosure.test.mjs` alone re-run 3 extra times after restoring the fix (before adding the compound
  test): 11/11 every time — the documented historical flake (2/~50) did not reproduce.

## Things noticed but out of scope

- `docs/validation.md`'s "Known boundaries" section still reads "grain does not report this, and its silence on new
  code is not approval" for the new-scope gap — stale since 003-B shipped disclosure (the tool DOES report it now).
  The issue brief explicitly says not to touch that doc from this ticket ("do not delete it there"), so left as-is;
  flagging for a follow-up doc pass.
- `fileVerdictJson` (the `check --json` schema) does not carry `newScopeHits` at all, before or after this fix —
  left untouched deliberately, consistent with this repo's stance that the JSON export schema is a published
  interface not to be changed incidentally.
