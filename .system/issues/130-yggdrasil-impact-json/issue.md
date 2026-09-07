# 130 · Yggdrasil: `yg impact --json` (`yg-impact/1`) and `yg node --json` (`yg-node/1`) — the graph as machine documents for the layers above

**Status:** LANDED — committed 3a351e16 on Yggdrasil feature branch, pushed
**Found by:** director, 2026-09-06
**Severity:** high
**Repo:** <yggdrasil> · branch `claude/grain-agent-tool-b89y0x` · work directly on the branch (single worker), commit, do not push
**Rulings:** `layered-family`, `port-is-contract` · mission `.system/research/mission-one-system.md` (in Grain) §3 for the exact shapes, §6 E1
**Class:** opus · the same worker continues with 132 and 133 in sequence

## Why

Horde derives its plan from ports and relations, and today parses `yg-node.yaml` with its own narrow parser
(`node.mjs`) because `yg impact` speaks only text (`source/cli/src/cli/impact.ts`). A lower layer's file format
read by hand from a higher layer breaks at the first schema change. The graph must speak for itself.

## What

1. `yg impact --node <path> --json` (and `--file <path>` resolving the owner as today) prints one `yg-impact/1`
   document exactly as specified in the mission file §3: `subject`, `ports[]` with `name`, `version`, `test`
   (both `null` until 132), `consumers[]` from relations whose `consumes` names the port (`Relation.consumes`,
   `model/graph.ts:214`), `dependents[]` with `direct` and `relations[].ports`, `transitive[]` with `via`.
   Reuse `core/graph/impact-graph.ts` (`collectReverseDependents`, `buildTransitiveChains`); do not compute the
   graph a second way. `--json` with `--aspect/--flow/--type` refuses with a what/why/next message for now (or
   implements a document if it is trivially the same data — your call, say which).
2. `yg node <path> --json` prints `yg-node/1` (structure only: name, type, description, mapping, relations with
   `consumes`, ports with `version`/`test`/`aspects`, children, parent); text form without `--json` for people.
   Rules stay in `yg context --json` (`yg-context/1`, `formatters/context-json.ts`) — do not duplicate them.
3. Follow the repository's own rules without exception: `yg prime` first; `yg knowledge` and `yg schemas` before
   designing; graph before code (the node under `.yggdrasil/model/cli/` that owns `cli/impact*` and the new
   command: description, mapping, relations updated in the same commit, `yg check` accepting it); a formatter
   in `formatters/` like `context-json.ts`; docs under `docs/` and the CLI reference in
   `templates/knowledge/cli-reference.ts` (that is what `yg knowledge` prints); CHANGELOG `[Unreleased]` for the
   adopter (what they can now do, no internals); tests on real fixtures under `source/cli/tests/` including this
   repository's own graph (E1: `cli/io/atomic-write` has port `write-atomic`); message-builder for every
   refusal; no version bumps of package or schema; never hand-edit lock or digest; `scripts/repo-check.sh` green
   except the two known environmental failures (pack-smoke resolver, seven root-user tests) — confirm no new
   failure, and paste the step list in your report.
4. Commit with the session trailers. Then proceed to 132, then 133 (their tickets are in the same directory
   of the Grain repository: `.system/issues/132-*`, `.system/issues/133-*`).

## What is NOT in scope

Port version/test semantics (132), the external reviewer channel (133), any Horde change.

## Acceptance

- [ ] E1 exactly; `yg node --json` on a node with children and a parent; `--json` shapes stable across a run
      with and without `--file`.
- [ ] Graph, docs, CLI reference, CHANGELOG updated; repo-check as above; commit(s) on the branch; report with
      step list, test counts, and the shapes actually emitted (paste one document).
