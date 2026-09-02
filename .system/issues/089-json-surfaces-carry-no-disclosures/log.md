
## 2026-09-02 11:01 — Class C at its worst: the disclosure register (relCoverageNote, weak-answer, no-grammar, never-parsed-file, cycle granularity, dirty tree…) is rendered ONLY on the text path. Every --json surface (where, what, explain, completeness, obligation, check/review JSON) must carry the SAME disclosures as a structured field — additive to the published interface: disclosures: [{ kind, text }] (kinds = the register's names), plus schemaNotes explaining it. Acceptance: (1) a generic test — for every command with --json, every disclosure line the text emits appears as a disclosures[] entry (extend cross-check-json-text / instrument C to iterate the disclosure register); (2) instrument A reads disclosures[] and stops counting a disclosed weak/never-parsed answer as a fabrication — the auditor's confident-wrong rate on where should fall accordingly (report before/after on the corpus); (3) no text change. Do it once, generically, in the JSON renderer — not per command.

## 2026-09-02 — worker session: merged main (2168/2168 green, above the 2164 floor), clean tree. Spawned an
Explore agent to map the disclosure/JSON architecture before touching code — found the command handlers live in
`grain.mjs` (not `core.mjs`), no shared JSON renderer exists (every `cmd*` independently does its own
`JSON.stringify`), and — importantly — `explain`/`spectrum` and `completeness` have NO `--json` support at all
today (confirmed by direct read of `cmdSpectrum` and the `completeness` switch case). Decided (documented in
issue.md's "What is NOT in scope" rather than escalated, since the ruling's own text is "every --json surface" —
a surface that doesn't exist has nothing to make additive) to scope this to where/what/check/review, and to audit
`obligation` rather than blindly touching it (found it needs no change: its only non-numeric text branch is already
fully mirrored by an existing JSON field).

Implemented, in order: (1) `whereCmd` (core.mjs) — added a `disclosures` array alongside `lines`, pushed at every
existing hedge site (noContentFoothold, weak-answer, partial-word-coverage, the §085 ranked ungrammared banner, the
zero-hit ungrammared/honest-negative variants), same string object as the text line, never re-derived. Ran
`tests/where*.test.mjs` after — 43/43 green. (2) `whatCmd` (core.mjs) — same pattern via a sibling `disclosures`
array; deliberately did NOT add a `text` field onto the existing `note` object (my first attempt did this, then
reverted it — `note`'s shape must stay untouched per the ticket's "no existing key changes shape" rule, and a
sibling array is cleaner anyway). `tests/what*.test.mjs` — 62/62 green. (3) `cmdWhere`/`cmdWhat` (grain.mjs) —
threaded the core-level `disclosures` into the JSON branch, plus added `dirty-tree` (from the existing
`DIRTY_TREE_NOTE` constant — text already had this, JSON never did) and, for `where` only, a model-signal
disclosure (`sparse-model`/`empty-model`/`no-source-partition`, derived from `signal()`'s own verdict text via the
same regex the text line already tests). (4) `check`/`review` (grain.mjs) — four boolean-backed cases already
present in JSON as raw flags (`noGrammar`, `noPartition`, `parseFailed`, `hasError`) got a matching `disclosures[]`
entry, built from the exact same string literal used for the text line in each case (extracted into a shared local
var so text and JSON can't drift); `fileVerdictJson` (shared by check's main path and review's per-file
`findings[]`) got the `parse-degraded` entry. Audited review's own no-grammar branch and found it has NO
"no grammar" sentence in its text at all (a file with no grammar and no placement hit is silently dropped) — left
alone, documented as a pre-existing asymmetry, not something to invent prose for. `tests/check*.test.mjs
tests/review*.test.mjs` — 48/48 green, including the two frozen-key-list tests (top-level shape unaffected since
`disclosures` only nests inside per-file objects, never review's own top level).

Instrument C: extended `cross-check-json-text.test.mjs` with a generic `assertDisclosureParity` helper plus 5
dedicated minimal fixtures (adapted, not reinvented, from working fixtures already proven to fire each condition —
what-weak-answer-disclosure.test.mjs's blind-weak repo, check-json-contract.test.mjs's no-grammar/no-partition
repos, cross-check-check-review-parity.test.mjs's broken.ts snippet). One fixture (parse-degraded) needed bumping
from 4 to 10 filler classes before `partitionFor` actually certified a partition for `src/broken.ts` to join —
found by running it and reading the real failure (`noPartition:true` instead of the expected `parse-degraded`),
not guessed. 28/28 green after that fix.

Instrument A: `checkNoDeclarationsAnywhere` (audit-claims.mjs) now reads `j.disclosures`, skips the fabrication
increment (never `checked`) when an `ungrammared` entry is present. Added two unit tests (the exact red-before/
green-after pattern the sibling test above already used) — one proving suppression on a matching disclosure, one
proving an UNRELATED disclosure kind does NOT launder a genuine fabrication. `tests/audit-claims.test.mjs` —
15/15 green.

Measurement: found a real, already-cloned corpus at /private/tmp/gcv/corpus (leveldb, okhttp, CleanArchitecture,
others) left over from a prior session — no network needed. Wrote a throwaway script (scratchpad, not committed)
that runs the SAME real `where --json` calls once per candidate and computes both the old and new fabrication
predicate side by side, so the before/after numbers are measured off one real subprocess call per candidate, not
simulated. Results: leveldb 4→3/30, CleanArchitecture 9→7/40, okhttp 10→10/40 (unchanged — every sampled candidate
there was a plain English word, not an identifier-shaped compound, so where's own §085 scan-discipline gate never
attempts the scan for them — an honest finding about instrument A's own candidate-sampling breadth, not a shortfall
of this fix). Aggregate 23→20/100 (13% relative reduction), concentrated exactly on identifier-shaped candidates —
recorded in issue.md's Acceptance section. Did not run the full versioned stress corpus (network/time cost too
high for this worktree's budget) — flagged honestly rather than skipped silently.

Added `docs/reference.md`'s `disclosures[]` documentation section (the closest equivalent to `schemaNotes` for
these commands, since none of where/what/check/review carry an inline `schemaNotes` object the way
`export`/`obligation` do) and updated the "Recipe for a CI PR comment" paragraph.

One pre-existing test needed an intentional update, not a workaround: `missing-renderer.test.mjs`'s J1.2 frozen-
key-list test asserted `check <file> --json`'s exact key set, which now includes the new `disclosures` key — its
own inline comment/history shows its REAL purpose is guarding against `cochangePartners` (a review-only key)
leaking into check's single-file shape, so updated the expected key list to include `disclosures` (kept the
`!('cochangePartners' in j)` assertion, the actual invariant, unchanged) rather than treating the new field as a
violation of it.

Full suite: `npm test` → 2175/2175 green (base after merge was 2168; net +7 from this ticket's own new tests, after
folding in the missing-renderer.test.mjs update).
