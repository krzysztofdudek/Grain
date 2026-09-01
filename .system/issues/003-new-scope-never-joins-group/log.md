# Work log — 003 (new scope never joins group)

## Provenance

**CORRECTED BY THE ORCHESTRATOR (team lead) — the original text of this section was wrong, and the error was
mine, not either agent's.**

The A1/A2/B implementation in `plugins/grain/engine/core.mjs` / `plugins/grain/engine/grain.mjs`, the (C)
`docs/validation.md` "Known boundaries" entry, AND that agent's own first test file and red/green verification were
all written by **`fix-003-disclosure`**, which was alive and working continuously throughout. It self-verified
(hand-reverted its own hunks via `Edit`, confirmed red, restored, confirmed green), ran the full suite at
1476/1476, and reported completion.

What actually happened: `fix-003-disclosure` emitted an `idle_notification` carrying
`idleReason: "failed"` after a transient mid-response API error. **I read that as the agent having died and
dispatched a duplicate (`fix-003-disclosure-2`) on the false premise that nothing had been written.** The agent had
in fact recovered and continued. My follow-up state check compounded the error: I looked only for the test file and
`log.md`, saw neither, and concluded the tree was untouched — without checking the source diff, where the entire
implementation was already sitting.

`fix-003-disclosure-2` caught the collision immediately and correctly stood down. I then overrode that — telling it
the first agent was definitively dead — and reassigned it the remaining work. Both agents behaved correctly at
every step; the duplicate dispatch, the "dead predecessor" narrative, and the resulting overwrite of this file's
original provenance section are all attributable to my misreading of a failure notification.

**Division of work, accurately:** `fix-003-disclosure` wrote and verified the implementation, docs entry, and its
own tests. `fix-003-disclosure-2` independently re-verified that implementation (six distinct hunk-reverts, each
producing a named red symptom), contributed the test file now on disk (which `fix-003-disclosure` reviewed and
chose to keep over its own), and judged the `factTiers` question. The orchestrator additionally spot-checked one
revert (the sticky-assignment guard) and confirmed the suite twice at 1477/1477.

**Lesson recorded for this loop:** an `idleReason: "failed"` notification means a turn failed, NOT that the agent
is gone — dead and recovered agents look identical in the roster. Before declaring an agent dead and re-dispatching,
check the working tree's **source diff**, not just the artifacts the brief asked for.

## What this agent actually did

1. **Wrote `plugins/grain/tests/new-scope-disclosure.test.mjs` from scratch** (6 tests) — this file did not exist
   before this agent's work. Since the implementation under test already existed, red evidence was produced the
   way the team lead asked: write the test, hand-revert the SPECIFIC existing hunk it targets via `Edit`, run,
   paste the red failure, restore via `Edit`, confirm green again. Six revert/restore cycles were run (one per
   test — two for the two "(B)" tests, which needed two different hunks reverted independently to get a clean red
   for each). No `git stash`/`checkout`/`commit` was used at any point; every revert and restore was a targeted
   `Edit` call, verified afterward by `git diff | grep TEMP-REVERT` showing nothing left behind.
2. **Verified (C)** (`docs/validation.md`'s "Known boundaries" paragraph) was already present, on disk, matching
   the brief's required content (same-measurement framing, "grain does not report it, silence is not approval",
   the four tautology-share numbers with provenance). This is almost certainly why the team lead's own grep for it
   came back empty earlier: it searched for the literal phrase "same measurement as membership", but the actual
   prose (written by the first agent) says "measured by the same signal that forms the group's own membership" —
   different wording, same claim. No edit was needed; this agent re-read the paragraph for accuracy and left it
   unchanged.
3. **Scrutinized the unauthorized `factTiers` change** (core.mjs `factTiers`, ~line 2984): the first agent filtered
   marker-tautology facts out of `report`/`rulesMarkdown`'s domain/structural/lexical tier lists entirely, replacing
   them with an aggregate `(N group-defining marker(s) not listed …)` footnote in both renderers. This was outside
   the brief's explicit scope (which only covered `check`'s "conforms to:" line) and directly adjacent to the "do
   NOT suppress" instruction, so it needed a judgment call, not just a test. Verified empirically (see report to
   team lead) that it does not silently vanish — the count renders in both `report()` and `rulesMarkdown()` — and
   that a genuinely non-tautological role fact on the same role is untouched. Added a test pinning this exact
   behavior (5th test in the new file) rather than changing the implementation, since the "no silent vanishing" bar
   the team lead set is met; a design nit (tautologies get a bare count while the structural/lexical tiers get
   itemized listings under their own heading) was reported as an observation, not fixed unilaterally.

## Verification

- New file alone: 6/6 pass (`node --test plugins/grain/tests/new-scope-disclosure.test.mjs`).
- Full suite before this agent's file existed: 1471/1471 (confirmed by team lead).
- Full suite after: `node --test 'plugins/grain/tests/**/*.test.mjs'` → **1477/1477** (1471 + 6 new).
- `git diff` on `core.mjs`/`grain.mjs` after this agent's work carries no leftover `TEMP-REVERT` markers or other
  unintended changes — only the pre-existing (first agent's) A1/A2/B/factTiers hunks remain, untouched by this
  agent except for the revert/restore cycles used to produce red evidence, all restored byte-for-byte.

## Open observation: an intermittent failure nobody could reproduce

Recorded because unexplained flakes are corrosive, not because it is settled.

`fix-003-disclosure` observed **2 failures in ~50 runs** of `new-scope-disclosure.test.mjs` shortly after the file
landed — always test 1, always `expected a new-scope disclosure for OrderCommand: []` — then 0 failures in ~40
subsequent runs, with no code change in between.

Reproduction attempts, all clean:
- `fix-003-disclosure-2`: 20 sequential + 18 parallel (3 rounds × 6 concurrent) = **38/38 clean**
- orchestrator: full suite twice back-to-back, cache wiped between = **1477/1477 both times**

Total: ~78 clean runs after the 2 failures, across three independent testers.

**Working theory (both agents, independently): transient resource contention** on a shared machine running many
concurrent agents at that moment — the fixture shells out to a `grain status` child process, and an empty result
is what you would get if that child were starved or timed out. The "early only, then stable, self-resolved
without a code change" shape fits contention better than a logic bug.

**Not ruled out:** a rare timing dependency inside the fixture's own child-process step. Neither agent could
provoke it under deliberate parallel load, so there is no evidence for it beyond the two original failures.

**If this recurs:** the suspect is the `grain status` (or equivalent index-build) child call in this fixture's
setup, not the assertion or the disclosure logic — those were each independently revert-verified. Check whether
the child's exit status and stderr are being asserted on at all, and whether an empty/partial `model.json` can be
read before the child has finished writing it.
