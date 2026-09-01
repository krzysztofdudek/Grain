# Log — 019 map ignores file arg

## Diagnosis

`grain.mjs`'s `cmdMap` destructures `{ model, opts, stamp }` — `args` is never even pulled out of `ctx`, so any
positional argument (`grain map foo.rs`) is silently dropped and the whole-repo map prints regardless. Confirmed:
`main()`'s dispatch (`const ctx = { model, meta, head, root, isGit, args, opts, stamp, store }; ... case 'map':
lines = await cmdMap(ctx); break;`) always passes `args` through in `ctx`; it's each handler's own choice whether
to read it.

Audited every OTHER command the ticket named (`status`, `report`, `rules`, `selftest`) plus everything else in the
`main()` switch/dispatch, checking each one's actual parameter destructuring and body for any use of `args`:

| command | documented (USAGE) | reads `args`? | same bug? |
|---|---|---|---|
| `map` | `map [--json]` | no (not destructured) | **yes** (reported) |
| `status` | `status ... [--json]` | no (not destructured) | **yes** |
| `report` | `report [--top N] [--json]` | no (not destructured) | **yes** |
| `rules` | `rules [--out <file>] [--top N]` | no (not destructured) | **yes** |
| `export` | `export [--out <file>] ...` | no (not destructured) | **yes** |
| `refresh` | `refresh [--full]` | no (inline case, never reads `args`) | **yes** |
| `selftest` | `selftest [--json]` / `selftest --how ...` | no (inline case, never reads `args`) | **yes** |
| `version` | `version` | no (checked before the switch, never reads `args`) | **yes** |
| `review` | alias, "bare `check` (no file argument)" | `args` IS destructured but never READ anywhere in the ~40-line function body | **yes** (found during audit, not in the ticket's list) |
| `where`/`how`/`what`/`check`/`completeness`/`explain`/`spectrum`/`decide`/`seed` | all take real positional args by design | n/a — not argument-less | out of scope |

So `map`'s bug is not unique: **8 commands** silently dropped a positional argument (the 4 named in the ticket,
plus `export`, `refresh`, `version`, `selftest`, and `review` found during the audit).

Also audited (informational, not fixed — different bug shape): `cmdCheck`/`cmdSpectrum` read only `args[0]` and
silently ignore a SECOND positional argument (`grain check a.js b.js` checks only `a.js`). These are NOT
"argument-less" commands (they correctly require exactly one file), so this is a different bug and out of this
ticket's scope. Reported, not fixed.

## Fix

All 8 commands now reject a positional argument with a one-line usage error, matching the EXACT existing style
already used by `cmdWhat`/`cmdSpectrum` (`if (!args[0]) throw new Error('usage: grain <cmd> ...')`) — here
inverted to `if (args.length) throw new Error('usage: grain <cmd> ...')`:

- `map`: names the file-scoped alternative per the ticket (`` `grain explain <file>` (or `spectrum`) ``).
- `review`: found during the audit to have a natural file-scoped alternative too — names `` `grain check <file>` ``.
- `status`/`report`/`rules`/`export`/`refresh`/`selftest`/`version`: plain "takes no arguments" usage messages
  (no natural file-scoped sibling to point at — these are model-wide summaries, not per-file operations).

`cmdMap`, `cmdStatus`, `cmdReport`, `cmdRules`, `cmdExport` needed `args` added to their destructured parameters
(none of them had it before). `cmdReview` already destructured `args`, just never read it. `refresh`/`selftest`
guards were added inline in the `main()` switch (where those commands are already handled inline, not via a
`cmdXxx` function). `version`'s guard was added at its own early `if (cmd === 'version')` check, before the model
is even built (matching where that command is already dispatched, ahead of `ensureFresh`).

No existing test asserted the buggy (silently-drops-args) behavior — grepped for tests invoking `grain map`,
`status`, `report`, etc. with a trailing file argument: none existed before this ticket.

## Tests

`plugins/grain/tests/argless-command-args.test.mjs` — 12 tests, real end-to-end CLI invocations (`spawnSync` on
`bin/grain.mjs`) against one shared tmp git fixture repo, matching the existing pattern in
`map-command.test.mjs`/`missing-shape.test.mjs`:

1. `grain map foo.rs` → non-zero exit + usage message naming `explain` (the ticket's own acceptance case).
2. Bare `grain map` → unchanged (still exits 0, still prints the whole-repo map).
3. One case each for `status`, `report`, `rules`, `export`, `refresh`, `selftest`, `version` → non-zero exit +
   `usage: grain <cmd>` message (the siblings found during the audit).
4. `review <file>` → non-zero exit + usage message naming `check` (found during the audit, included since it has
   the same "natural alternative" shape as `map`).
5. Bare `review` → unchanged (still exits 0).
6. `grain explain` (no file) → already correctly rejects, unaffected — included as the audit's documented negative
   result (a file-scoped command that was never broken this way).

RED confirmed against the unmodified dispatch: 9/12 failed (everything except bare `map`, bare `review`, and
`explain`'s existing correct rejection — exactly the commands with the bug). Fix applied → 12/12 green.

## Full suite

Ran together with issue 015's fix, in the same working tree. Final: **1505/1505 passing** (see 015's log for the
count breakdown and the one nearby regression this session found and fixed along the way — in 015's own
extraction change, not in this issue's CLI-dispatch change; nothing in this issue's diff needed a second pass).

## Nearby, not fixed (reported per instructions)

- `check`/`explain`/`spectrum` silently ignore a second positional file argument (`args[1]`+) — see Diagnosis
  above. Different bug shape (not "argument-less"), out of this ticket's scope.
