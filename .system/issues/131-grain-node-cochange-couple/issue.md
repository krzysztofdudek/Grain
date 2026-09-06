# 131 · Grain: `grain advise` — node-level co-change and split candidates as `grain-advice/1`, measured on four oracles: advisory or nothing

**Status:** FIXED — grain advise shipped and measured; relation kind --json-only with disclosure, split kind advisory
**Found by:** director, 2026-09-06
**Severity:** medium
**Repo:** /home/user/Grain · branch `claude/grain-agent-tool-b89y0x` · work in a worktree, do not push
**Rulings:** `layered-family` (Grain writes only Yggdrasil-shaped objects), `production-is-the-corpus`, and the standing Grain rulings (`where-cochange-promotion` memo: file-level co-change with one-way confidence surfaces the hottest file and was rejected; `examples-are-not-oracles`; `precision-holds-recall-tracks-imports`) · mission `.system/research/mission-one-system.md` §3 (`grain-advice/1` shape), §6 E4
**Class:** opus

## Why

Horde's plan needs the hidden edges: nodes that change together without a declared relation, and nodes that have
outgrown one context. Grain already has scope-level co-change (`learn.mjs` §J5.7b, `model.scopeCochange`, scope
keys not files) and type-level candidates (`propose-levels.mjs`). Whether node-level co-change carries
information or just points at the hottest directory is unknown — the file-level lever failed exactly that way.
So: build the instrument, measure, and ship only what the numbers allow.

## What

1. `grain advise [--json]` (dispatcher `grain.mjs`, a new `grain-advise.mjs` module under the 50k budget, 0
   cycles): reads the repository's `.yggdrasil/` graph (node paths and mappings — through the existing graph
   reading Grain has; if it reads Yggdrasil files directly, keep it in one function so 135-era `yg node --json`
   can replace it) and emits `grain-advice/1`:
   - `kind: relation`: node pairs aggregated from `scopeCochange` (scope → file → node by mapping), with
     **mutual** confidence (min of both directions) ≥ 1/3, support ≥ `CFG.cochangeMinSup`, liveness at HEAD, and
     `declared: true|false` from the graph's relations; text in plain language.
   - `kind: split`: for a node, finer type-level candidates that beat the parent on their own evidence (reuse
     `propose-levels.mjs`), as `candidates[]`.
   - `rule` and `port` kinds are reserved; do not fabricate them.
2. **Measure** on the four oracles (`plugins/grain/tests/stress/oracles/{grain,spring-petclinic,express}` and
   the Yggdrasil repo at `/home/user/Yggdrasil`, clones under the scratchpad `clones/` as the reconstruct test
   uses them): for each, the pairs emitted, how many are declared vs undeclared, the concentration (share of
   pairs touching the single hottest node), and a control (declared rate among random node pairs). Verdict per
   the standing rulings: if the instrument mostly names the hottest node, it ships as `--json`-only data with a
   disclosed weak-signal line, and the memo says "not advisory"; if undeclared pairs are concentrated on real
   seams (spot-check five by reading the code), it ships as advisory. Write
   `.system/research/node-cochange-measurement.md` with the tables and the verdict.
3. Tests on real fixtures/oracles (no fabricated data): shape of the document, mutual-confidence gate,
   declared detection, split candidates on the petclinic oracle. `docs/validation.md` test count, README/docs
   command list, CHANGELOG if Grain has one for the plugin (check; otherwise the release notes convention the
   repo uses). Log progress with `node .claude/skills/director/scripts/tk.mjs log 131 "…"`.

## What is NOT in scope

Wiring into `yg advise` (144, Yggdrasil). Any Horde change. Changing `CFG` constants (that is escalation #1 —
`escalate.mjs add` if the measurement demands it).

## Acceptance

- [ ] E4: `grain advise --json` on each oracle returns `grain-advice/1`; the memo has the four tables, the
      control, the five spot-checks, and one verdict sentence.
- [ ] Suite green with the new tests; budget and cycle tests green; commits with session trailers on the
      worktree branch; report branch, test count, verdict.
