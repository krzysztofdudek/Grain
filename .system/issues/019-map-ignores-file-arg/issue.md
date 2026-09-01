# 019 · `grain map <file>` silently swallows the file argument and prints the whole-repo map

**Status:** FIXED (verified independently by orchestrator; EXTR_V bumped g26→g27)
**Found by:** round 2, Rust/axum, 2026-09-01
**Severity:** low — but it is a silent wrong-answer, which this project treats as a first-class defect

## Symptom

`grain map <file>` produces output byte-identical to bare `grain map` — the whole-repo map. The argument is
accepted and dropped without a warning or error. `grain help` confirms the documented form is `map [--json]`,
taking no file — so the CLI is right and the behavior is wrong: it should reject what it does not support.

Easy to misread as a per-file report, especially since `check`, `explain`/`spectrum` and `completeness` are all
file-scoped, so `map <file>` looks like it belongs to that family.

## Expected

Either reject the argument with a one-line usage error naming the file-scoped alternative
(`explain`/`spectrum` for a per-file view), or implement a file-scoped map. Rejecting is the smaller, honest fix
and matches how other commands handle unsupported input.

Check the same class of bug on every other argument-less command while in there (`status`, `report`, `rules`,
`selftest`) — `parseArgv` is shared, so if `map` drops extra args silently, its siblings may too. Fix them
together or report which ones are already correct.

## Acceptance

`grain map foo.rs` exits non-zero with a usage message pointing at `explain`. Bare `grain map` unchanged
(byte-identical). Sibling argument-less commands audited, and either fixed or confirmed correct in the log.
