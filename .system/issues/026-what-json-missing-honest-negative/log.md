# log — 026

- 2026-09-01 · filed by the cross-check test-suite designer at the orchestrator's request, after observing
  011's text fix land mid-run: `cross-check-honest-silence.test.mjs` (d1) flipped RED → GREEN between two g27
  runs while (d1-json) stayed RED. Filed so the JSON half is tracked rather than remembered — "exactly the
  kind of half-fix that survives because nothing asserts it" (it is asserted now; this ticket is its name).

- 2026-09-01 · found already resolved on arrival, before any change of mine: `engine/grain.mjs`'s `cmdWhat`
  already carried `note: note && note.kind !== 'absent' ? note : null` in its `--json` return (matching
  018's own `whatCmd`/`findBlindHit` work in `engine/core.mjs`, landed concurrently on this shared tree).
  Ran `cross-check-honest-silence.test.mjs` first, unmodified: (d1)/(d1-json)/(d2)/(d2-json) all GREEN —
  this ticket's own acceptance, (d1-json), among them. Only (d3)/(d3-json) are RED, and those are 014's
  acceptance (Go const/var never extracted), explicitly out of scope here and correctly still open. No code
  change made for this ticket; verified MCP `grain_what` needs no separate check (it is not part of the
  curated MCP tool set — `tests/mcp-server.test.mjs` lists exactly six tools and `grain_what` is not among
  them, so there is no MCP mirror to keep in sync for this command).
