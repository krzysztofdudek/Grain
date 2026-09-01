# 020 · `where` recommends a file deleted 15 versions ago; `how` marks the same fact `(deleted)`

**Status:** FIXED — dead co-change paths now marked `(deleted)` in both renderers; verified independently
**Found by:** round 2, JS/express, 2026-09-01
**Severity:** medium — sends a developer looking for a file that does not exist, and two commands disagree

## Symptom

```
grain where "response helper method"
  → historically co-changes with: lib/router/index.js (10/17 commits)
```

`lib/router/index.js` was deleted in commit `cec5780d`, many releases ago — express now uses the external `router`
package and `lib/` has 6 files with no `router/` directory. `where` presents it as a live recommendation with no
marker at all.

`how` gets the identical class of fact right, on the same repo:
```
grain how "fix bug"
  → places such a change touched: ... lib/express/plugins/view.js (1/5) — (deleted)
```

So the machinery to detect and disclose a dead path exists and is used — `where`'s co-change line simply does not
use it. Same underlying fact, two commands, inconsistent honesty.

## Suspected area

`whereCmd`'s co-change rendering in `core.mjs`. `howCmd`'s `places[]` carries an `exists` flag (populated from the
live file set) and renders `(deleted)` when false — find that and reuse it; do not write a second liveness check.
`model.filesAll` / the live-path set used by `currentPathOf` are the obvious sources.

Note the neighbouring precedent already in the codebase: `model.waivers` renders `found: false` for a scope that
no longer exists at HEAD, and `model.boundaries` marks a side that "names no indexed files — inert". Disclosing
dead references is established house style; this is a gap in one renderer, not a new policy.

## Wider check while fixing

`where`'s co-change is unlikely to be the only place. Audit every surface that names a historical path — the
`recipe:`/`kin:`/`cochange:` lines in `missingLines`, `completeness`, `model.moves`' rename targets — and either
mark dead paths consistently or report which are already correct. `how` and `waivers` show the intended shape.

## Acceptance

A fixture where a co-changing file is deleted before HEAD: `where` marks it `(deleted)` exactly as `how` does, or
omits it — decide which and document why. A live co-change partner is unchanged (regression). The audit result is
recorded in the log even for surfaces needing no change.
