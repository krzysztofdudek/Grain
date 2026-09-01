# 035 log

Implemented the design as specified in the ticket, no redesign.

## Fix

`engine/history.mjs`:
- New `partialCloneFilter(gitdir)`, placed directly beside `isShallow` (same shape, same cost — pure `git config`
  reads, no network). Reads `remote.*.promisor` via `git config --get-regexp '^remote\..*\.promisor$'` (regexp
  form deliberately, never hardcoding `origin` — a repo can name its promisor remote anything) and, only if that
  confirms a `true` promisor entry, reads `remote.*.partialclonefilter` the same way and returns the configured
  filter string (`blob:none` / `tree:0` / `blob:limit=N`, whichever is set) or `'unknown filter'` if a promisor is
  confirmed but no filter was recorded. Returns `null` for an ordinary clone (no promisor key at all — the normal,
  by-far-most-common case, handled by a single try/catch exactly like `isShallow`'s).
- `loadHistory` consults it in the same guard site as `isShallow`, immediately after it, same return shape:
  `{ H: null, mode: 'none', reason: 'partial clone (<filter>) — history unavailable, weights flat; run
  `git backfill` to fetch missing blobs, or `grain refresh --full` again once backfilled' }`. Detect-and-degrade
  BEFORE the walk starts — `walk()`/`parseBlobs()` are never invoked when a partial clone is detected.
- `git backfill` is named as the remedy but never auto-run — opt-in only, per the ticket's explicit constraint.

## On the "secondary safety net" (converting a raw promisor git stderr into a clean message mid-walk)

Not implemented, and I don't think it needs to be: grepped `engine/*.mjs` for any `git log -S`/pickaxe usage (the
call that hard-failed in the ticket's own diagnosis) — there is none in grain's own code; that call belongs to the
finder's live diagnostic tooling, not a codepath grain runs. The only place grain could hit "could not fetch ...
from promisor remote" is `parseBlobs`'s `git cat-file --batch` on a missing blob, which only happens because
`walk()` ran — and `walk()` is now never called at all on a repo `partialCloneFilter` detects. Since detection is a
static git-config read, independent of `mode`/`range`, this closes off BOTH failure modes (the serialized crawl
AND the hard fetch failure) for every case the ticket describes, before either forming a codepath. The stderr-wrap
would only matter if the git-config detection under-detects (e.g. a repo with missing objects but no promisor
config, a different/corrupt-repo problem) or if a caller invokes `walk()`/`parseBlobs()` directly, bypassing
`loadHistory`'s guard — flagging this for the team lead to confirm out of scope rather than silently skipping it.

## Tests

New file `tests/partial-clone.test.mjs`, unit-style against `loadHistory`/`partialCloneFilter` directly (no real
partial clone/network needed — detection is a pure config read, so setting the same config keys git itself sets on
a real partial clone is a faithful fixture):
1. ordinary full clone → `partialCloneFilter` null, `loadHistory` walks normally (byte-identical to before).
2. `promisor=true` + `partialclonefilter=blob:none` → detected, `loadHistory` returns `{H:null, mode:'none'}` with
   `blob:none` named, `git backfill` and `grain refresh --full` both named in the reason text.
3. `tree:0` and `blob:limit=1m` both surfaced correctly (distinct filters, per the ticket's severity note).
4. a non-`origin`-named promisor remote (`upstream-mirror`) is still detected.
5. an ordinary shallow clone (real `--depth 1`): `partialCloneFilter` is null, `loadHistory`'s reason is still
   exactly `'shallow clone — history unavailable, weights flat'`, byte-identical to before this fix.
6. shallow clone WITH partial-clone config also set: the shallow check (checked first) wins, reason is still the
   shallow one — proves the two guards don't interfere in either direction.

Confirmed load-bearing by hand-reverting the `loadHistory` guard via Edit (test 2 failed: `loadHistory` walked the
fixture and returned real, non-null `H` instead of degrading) and restoring via Edit.

Result: `tests/partial-clone.test.mjs` (6/6), `tests/shallow-unshallow.test.mjs` and `tests/history-footprints.test.mjs`
(existing shallow/history suites) still green.
