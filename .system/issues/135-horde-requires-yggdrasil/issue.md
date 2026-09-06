# 135 · Horde: the manual node map is retired; `init` creates the graph through `yg` (and Grain when present); contracts are ports; the graph is read only through `yg`

**Status:** OPEN
**Found by:** director, 2026-09-06
**Severity:** high
**Repo:** /home/user/horde · branch `claude/grain-agent-tool-b89y0x` · worktree, do not push
**Rulings:** `horde-requires-yggdrasil`, `port-is-contract`, `verifier-is-yggdrasil-reviewer`, `layered-family` · after 130, 132, 133 (Yggdrasil) and 127 landed · mission §1–§3, §6 E10
**Class:** opus

## Why

Horde carries a second graph: `config.nodeSource = manual` with `<graphDir>/nodes/<node>/node.json`, and
`graph.json` with contracts and stamps — Yggdrasil in a weaker form, without rules and without a lock.
`node.mjs` parses `yg-node.yaml` with its own narrow parser, so a schema change in the layer below breaks the
layer above. The mission makes the layering real: Horde sits on Yggdrasil, reads it only through `yg`'s machine
documents (`yg-node/1`, `yg-context/1`, `yg-impact/1`), and writes to it only through `yg`.

## What

1. **Init.** `horde.mjs init` on a repository without `.yggdrasil/`: with `config.ygCommand` resolvable, runs
   `yg init` from the repository root (never a subdirectory — Yggdrasil's own rule), then, when a Grain command is
   configured or found (`config.grainCommand`; default: none — say how to set it), `grain propose` and
   `yg adopt` of the proposal with the baseline of existing violations; without either, refuses with the install
   step for Yggdrasil. `nodeSource`, `graphDir`, manual `node.json`, and the manual branches in every tool are
   removed. README: "Requirements: Yggdrasil" replaces "with or without"; the FAQ answer changes to "init
   creates the graph".
2. **Reading.** `node.mjs show|map|bind|contracts` read `yg node <p> --json`, `yg context --node <p> --json`,
   `yg impact --node <p> --json`; the YAML parser is deleted. Refuse clearly when the installed `yg` does not
   emit these documents (predates the mission): name the version needed.
3. **Contracts are ports.** `node.mjs contract propose` becomes a proposal to add or bump a port (name,
   version, test path) on a node; the architect files it by editing `yg-node.yaml` and `yg log add` (as
   `architect.md` already prescribes for graph changes); `node.mjs contracts` lists ports with version/test from
   `yg-node/1`; `graph.json` keeps only Horde's process objects (proposals) — decide, from reading topology.md
   and the code, whether stamps have any meaning left once the lock exists; if not, retire them and say so.
   Node charters stay where topology.md puts them for Yggdrasil mode.
4. **Prose rules.** `premerge` graph item runs `yg check --only-deterministic` for the free part and reports the
   pending LLM-judged pairs; the verifier brief (`brief.mjs verifier`) lists them with the package/record
   commands from 133 so the verifier judges them under its own name; the graph item is ✓ only when a full `yg
   check` is green on the branch (deterministic + recorded prose verdicts).
5. Tests rewritten for the one mode (real temp repos with a real `.yggdrasil/` created by the real `yg` build at
   `/home/user/Yggdrasil/source/cli/dist/bin.js`; the suite already does this for premerge's graph item); E10;
   `scripts/README.md`, topology.md, model.md, role briefs, README, CHANGELOG `[Unreleased]` in adopter
   language (Horde now needs Yggdrasil and creates the graph when missing; contracts live in the graph as
   ports).

## Acceptance

- [ ] E10; init on a repo without a graph and without `yg` refuses with the install step; with `yg` creates the
      graph; with a stub Grain command (a real script recording argv) runs propose + adopt.
- [ ] No reference to `nodeSource`, `graphDir`, `node.json` remains under `skills/horde/`.
- [ ] Suite green; commits with session trailers; report branch, test count, shas, and the list of what was
      retired.
