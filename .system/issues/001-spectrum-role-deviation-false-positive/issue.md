# 001 · `spectrum`/`explain` marks "THIS FILE DEVIATES" on rows the file conforms to — contradicts `check`

**Status:** FIXED (verified independently by orchestrator, 1453/1453)
**Found by:** field test, independently in TWO repos (C#/CleanArchitecture, Python/flask), 2026-09-01
**Severity:** high — two commands state contradictory facts about the same file; the label is read as authoritative

## Symptom

On a file `check` reports as fully conforming (0 deviations), `spectrum`/`explain` marks NORM rows at 100% share
with `← THIS FILE DEVIATES`.

- **C#/CleanArchitecture**: `CreateTodoItem.cs` — `check` → 0 deviations. `explain` → `r3:type
  auto.extends:IRequestHandler = true` tagged `← THIS FILE DEVIATES`, on a `[NORM]` row at 100% share.
- **Python/flask**: `src/flask/sansio/blueprints.py` — `check` → "0 deviations, conforms to setupmethod+add+app
  (100% of 12)". `explain` → that exact NORM row marked `← THIS FILE DEVIATES`, and 18 of 20 rows total flagged,
  including several other 100%-share rows.

## Root cause (confirmed by reading the code, not inferred)

`core.mjs`, in `spectrum`'s row construction:

```js
const mine3 = fileScopes.filter(s => s.kind === kind && s.preds[pid] !== undefined).map(s => s.preds[pid]);
const dev = mine3.some(v => v !== exp);
```

`mine3` filters only by `kind`, never by ROLE — but `cid` can be role-conditioned (`r3:type`, `r5:method`). So a
role-conditioned row is tested against EVERY same-kind scope in the file, including scopes belonging to other
roles (or to no role at all), which were never part of that row's population.

Concretely in the C# case: `CreateTodoItem.cs` holds two types — the handler (role 3, correctly extends
`IRequestHandler`) and `CreateTodoItemCommand` (a different type, correctly does NOT extend it). The row is about
role 3 only, but `mine3` sees both, finds `false` among the values, and sets `dev = true`.

The cells themselves are built correctly role-aware a few lines above (`const r = roleOf(s, i); if (r !==
undefined && myRoles.has('r' + r + ':' + s.kind)) add2('r' + r + ':' + s.kind, pid, v);`) — only the per-file
deviation check forgot the same filter.

## Expected

`dev` must be computed over the same population the row's `cid` describes:
- `cid` starting `r<N>:` → only this file's scopes whose resolved role is `N`
- `cid` starting `d[...]:` → only scopes in that directory subtree (already true via `s.rel`, but confirm)
- `_all:` → every same-kind scope in the file (current behavior, correct for this case only)

The `roleOf(s, i)` helper already exists in `spectrum`'s own scope and is what the cell construction uses — reuse
it, do not introduce a second role-resolution path.

## Acceptance

A file containing two same-kind scopes in DIFFERENT roles, where the role-A row's expected value is not carried by
the role-B scope: `spectrum` must NOT mark that row as deviating, and must still mark a genuine deviation (the
role-A scope itself carrying the wrong value) when one exists. `check` and `spectrum` must agree on the same file.
