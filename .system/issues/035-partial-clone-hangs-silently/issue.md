# 035 · A `blob:none` partial clone makes history mining crawl or hard-fail — silently, with no diagnostic

**Status:** FIXED (verified independently)
**Found by:** round 4, Kotlin/okhttp, 2026-09-01 — found incidentally while investigating something else
**Severity:** HIGH in practice — this is the default shape of a CI checkout, and the failure is silent

## Symptom

`grain refresh --full` on a `blob:none` partial clone ran **~20 minutes at near-zero CPU** with no output.
Diagnosed live with `sample`:

- grain's history walk shells out to `git cat-file --batch`.
- Every historical blob not already present triggers `promisor_remote_get_direct` → a fresh `git fetch`
  subprocess to the remote, **one blob at a time, serialized**. On a 6,447-commit repo that is potentially
  thousands of individual network round-trips.
- Separately, `git log -S … --all` **hard-failed**: `fatal: could not fetch … from promisor remote` — a ref in the
  commit-graph pointing at an object the remote will not serve.

So a partial clone can make grain either pathologically slow **or outright broken** — and grain reports neither.
It just hangs quietly.

## Why this matters more than its origin

The clone in question was created by the orchestrator with `--filter=blob:none`, so the *occurrence* was an
artifact of the test setup. **The exposure is not.** `blob:none` is what `actions/checkout` and most CI
configurations produce by default, and it is increasingly common for local clones of large repos too.

grain's central promise is "mined from your syntax trees and full git history". On the most common CI checkout
shape, that promise silently does not hold — and the user's first signal is a job that never finishes.

Compare the neighbouring, already-correct behaviour: **shallow clones are detected** (`isShallow()` in
`history.mjs`, `git rev-parse --is-shallow-repository`) and handled deliberately. The machinery and the precedent
for "detect an unminable repo and say so" already exist; partial clones simply were not considered.

## What to establish before designing

1. **Detection.** A `git config` read is enough and was used live to diagnose it: `remote.origin.promisor=true`
   and `remote.origin.partialclonefilter=blob:none`. Confirm the reliable minimal check, and put it beside the
   existing shallow-clone check rather than inventing a second mechanism.
2. **Refuse, warn, or degrade?** Both failure modes were observed (slow crawl AND hard fetch failure), and the
   right response differs:
   - refuse outright with instructions (`git backfill` / full fetch) — safest, most annoying;
   - warn and continue — honest, but the user still waits;
   - fall back to a HEAD-only index with an explicit disclosure that history-derived facts (co-change, lifecycle,
     `how`, archetypes) are unavailable — the most useful, and consistent with how this release handled every
     other coverage gap (`relCoverageNote`, `intraModuleNote`, `DIRTY_TREE_NOTE`).

   The third is probably right — a HEAD-only grain is still useful — but it must be an explicit, disclosed mode,
   not a silent degradation, which is the very defect being fixed.
3. Does the hard-fail case (`could not fetch from promisor remote`) surface as a catchable error, or does it kill
   the walk? That determines whether "warn and continue" is even available.

## Acceptance

On a `blob:none` partial clone: grain detects it before starting the walk and either refuses with an actionable
message or proceeds in a disclosed HEAD-only mode. A normal full clone is byte-identical to today. A shallow clone
keeps its existing behaviour unchanged (regression — the two checks must not interfere).

---

## Design, from the finder (adopted — implement as specified)

**Detection: beside `isShallow`, same shape, same cost.** The precedent is `history.mjs:22`
(`isShallow` → `git rev-parse --is-shallow-repository`), consumed at `history.mjs:219` with a
`{ H: null, mode: 'none', reason: 'shallow clone — history unavailable, weights flat' }` return.

Verified live on the okhttp corpus, **15 ms, no network**:
```
git config --get-regexp '^remote\..*\.promisor$'            → remote.origin.promisor true
git config --get-regexp '^remote\..*\.partialclonefilter$'  → remote.origin.partialclonefilter blob:none
```

**Do not hardcode `origin`** — a repo can have a differently-named promisor remote; hence the regexp form.

**Surface WHICH filter**, because they fail at different severities and the user's remedy differs:
- `blob:none` — stalls on blob reads (the case measured here)
- `tree:0` — far worse; stalls on tree reads too, i.e. almost everything
- `blob:limit=N` — only stalls on large files

**Behaviour: degrade, do not crawl or crash.** Mirror the shallow-clone path exactly — same guard in
`loadHistory`, same return shape:

```
{ H: null, mode: 'none',
  reason: 'partial clone (<filter>) — history unavailable, weights flat; run `git backfill` to fetch missing
           blobs, or `grain refresh --full` again once backfilled' }
```

**Do NOT auto-run `git backfill`.** It is a real network operation on the user's repository, and a tool whose
pitch is "no model calls, no network, never blocks" must not start fetching gigabytes because it found the index
inconvenient. Suggest the exact command; keep it opt-in.

**Weighting of the two failure shapes** (this changes the fix's priorities): the **serialized crawl is the
realistic one** — it occurs on `refresh --full`'s normal HEAD-reachable walk (measured: 16+ min to reach only
8000/8502 blobs). The hard `fatal: could not fetch … from promisor remote` came from `git log -S --all`, which
reaches stale/rewritten remote tips grain's own HEAD-only walk would not normally touch — less likely, still
possible (server-side GC of a reachable-looking blob), and should be converted into a clean message rather than a
raw git stderr crash if it surfaces mid-walk. So: detect-and-degrade is the primary job; stderr-to-message is the
secondary safety net.

For scale: `git backfill` fixed the corpus in **15 s**; the clean cold build afterwards was **173.5 s**. So the
fix converts "hangs quietly for 15+ minutes, twice" into "tells you immediately and names the 15-second remedy."

## Adjacent, filed separately — resume vs restart

Blobs fetched during the failed crawl **were** cached under `.grain/cache/blobs` (incremental progress was visible
across two separate run attempts), but `loadHistory` restarts rather than resuming. Orthogonal to this ticket, but
it is what turns a 15-minute failure into a 15-minute failure *repeated*. Worth its own look.
