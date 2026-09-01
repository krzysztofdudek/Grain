# log — 029

- 2026-09-01 · FIXED. Chose resolution (2): keep `session-context`'s catch-block stderr unconditional, not gated
  on `GRAIN_DEBUG` like the other five hooks. One-sentence justification, now also in `grain.mjs` as a comment at
  the call site: session-context runs once per session (not once per edit/prompt like the other five), so the
  noise cost of speaking is low, while a broken repo path there silently drops grain's entire SessionStart
  context for the whole session with no other signal — worth surfacing immediately rather than requiring a user
  to already know to set `GRAIN_DEBUG`.
  Before/after: no runtime behavior changed (the stderr was already unconditional) — this fix is the comment plus
  a pinning test, since acceptance allowed "keep it loud and say why" as one of two defensible resolutions.
  Confirmed via `cross-check-hook-robustness.test.mjs`'s baseline sweep that this really was the ONLY asymmetry:
  1/42 (hook, input-class) combinations wrote to stderr before any change (session-context / bad-path), matching
  the issue's own observation.
  Tests: added two assertions to `cross-check-hook-robustness.test.mjs`. (1) Without `GRAIN_DEBUG`, of
  session-context/commit-hook/how-hook (the three whose `badPath` fixture actually sets `cwd` to a missing
  directory, so all three genuinely hit the same `findRoot` "no such directory" throw) only session-context
  writes to stderr; the other two stay silent. (2) With `GRAIN_DEBUG=1`, all three now write to stderr — proving
  the asymmetry is the gate, not a difference in what actually failed underneath. Hand-reverted the fix (gated
  session-context's catch like its siblings) to confirm test (1) goes red without it, then restored — 45/45 green
  after restoring.
