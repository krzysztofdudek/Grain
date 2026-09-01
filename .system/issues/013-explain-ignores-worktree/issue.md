# 013 · `explain`/`spectrum` silently shows stale HEAD data for a file you are editing

**Status:** FIXED — explain now reads the worktree; DIRTY_TREE_NOTE added for the 8 HEAD-readers; verified independently
**Found by:** retest round 1, Python/flask, 2026-09-01
**Severity:** medium-high — silent staleness on the exact file the user is working in

## Symptom

With uncommitted edits in the worktree, `explain <file>` / `spectrum <file>` report the HEAD state, with no
indication that what they show is not what is on disk. Measured on flask's `src/flask/sansio/blueprints.py`:

- Added a whole new method to the dirty worktree → `explain` still reported **"43 scopes"**, unchanged.
- Removed `@setupmethod` from the real `add_url_rule` (a genuine deviation) → **`check` caught it instantly**;
  `explain` showed statistics identical to the clean file and flagged nothing.

So on a file being actively edited, `check` sees your live edits and `explain` does not — and nothing in
`explain`'s output says so.

## Why this is the same class as 004/007/011

`explain`'s job is "the full lattice for one file, no acceptance cut" — a user reaches for it precisely when
`check`'s summary was not enough, i.e. mid-edit. Answering from HEAD without saying so is the same defect pattern
this round already fixed twice: the tool knows something the reader does not, and states a measured-looking
result anyway. Compare `check`, which stamps `as of <sha>+dirty` when the worktree differs.

## Expected

Either `explain`/`spectrum` reads the worktree the way `check` does, or it stamps its output honestly (the
`+dirty` stamp already exists and is exactly this signal). Prefer reading the worktree if the cost is acceptable —
`check` already does it on the hot path, so the machinery exists; establish the actual cost before choosing.

Note `spectrum` already has a worktree-aware path for one case: §G20 made it parse a NEW untracked file directly
rather than claiming "no scopes". That precedent suggests reading live content here is in-character, not a
departure.

## Acceptance

With a real uncommitted deviation in a file: `explain` either reports it (like `check` does) or carries a visible
staleness marker. A clean worktree behaves exactly as today. Test both directions.

---

## Ruling (orchestrator, 2026-09-01) — sharper than originally written

The cross-check suite raised a genuine ambiguity: `cmdSpectrum` has stamped `as of <sha>+dirty` for a dirty target
file since the first engine commit (16fa901), **while rendering HEAD data**. Read literally, this issue's original
acceptance ("…or carries a visible staleness marker; the `+dirty` stamp already exists and is exactly this
signal") would be discharged by those three characters, with no engine change.

**Ruled: it is not discharged. `spectrum`'s `+dirty` is a FALSE CLAIM, and this issue is more serious than first
written.**

Reasoning: the stamp says what the answer was computed **from**. `as of <sha>` = computed from sha; `+dirty` can
therefore only honestly mean *"this answer incorporates your uncommitted edits"* — which is exactly what `check`
means by it. `spectrum` renders HEAD data and attaches that same marker, telling the reader it reflects edits it
never read.

That is worse than the silence this issue originally described: the strongest available reassurance, attached to
the least accurate answer. It is the same defect class as 004/007/011/018 — grain knowing something and stating
the opposite — in its most acute form, because here the misleading signal is *deliberate output*, not an omission.

**Acceptance is therefore unchanged in substance but stricter in effect:** `explain`/`spectrum` must either read
the worktree as `check` does, or emit a marker a reader can distinguish from `check`'s `+dirty`. A bare `+dirty`
does not satisfy this and must be removed or replaced if the worktree is not actually read.

Cross-reference 024, which owns the wider question of what `+dirty` means product-wide; the two must be decided
together and this ruling governs both.
