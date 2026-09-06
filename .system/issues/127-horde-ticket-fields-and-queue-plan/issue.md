# 127 · Horde: Files/Consumes/Produces/Evidence on the ticket, `queue plan` derives the DAG, premerge scope by declared files

**Status:** LANDED — merged 25ca1e2 on Horde feature branch
**Found by:** director, 2026-09-06
**Severity:** high
**Repo:** /home/user/horde · branch `claude/grain-agent-tool-b89y0x` · work in a worktree, do not push
**Rulings:** `port-is-contract`, `evidence-is-the-plan`, `layered-family` · mission `.system/research/mission-one-system.md` §3 (`yg-impact/1` shape, ticket fields), §6 E6 E7
**Class:** opus

## Why

`queue.mjs cmdNext` (332-345) takes queued items whose `dependsOn` are merged, sorted by severity then FIFO.
Edges are typed by hand (`steward.md:47-49`). Nothing derives them from ports, relations or files; nothing knows
which tickets collide; nothing knows the critical path; no ticket says which evidence rows it delivers, so an
uncovered row is silent until the end. Superpowers' plan carries the same facts as `Interfaces: Consumes/Produces`
and `Files:` and throws them away by linearising. Here the owner writes them per ticket, and the plan is derived.

## What

### Ticket fields (`templates/ticket.md`, `tk.mjs`)

```
**Files:** src/auth/policy.ts, src/auth/policy.test.ts
**Consumes:** auth/policy@1
**Produces:** auth/policy@2
**Evidence:** E2, E5
```

- `tk.mjs new --files a,b --consumes n/p@v[,…] --produces n/p@v[,…] --evidence E1,…`; `tk.mjs edit` keeps the
  header (already) and gains `--files/--consumes/--produces/--evidence` to change them with a log line.
- Validation at `new`/`edit`: every `Files` path lies inside the ticket's node boundary (share the boundary
  resolution `premerge.mjs checkScope` uses — move it to a helper both import); `Consumes`/`Produces` match
  `<node>/<port>@<int>`; a `Consumes` with no producer among the team's tickets (any state but dropped) and no
  such port in the graph is refused naming the missing port. Port existence: read through `node.mjs`'s current
  graph reading; 135 replaces that with `yg node --json`, so keep the lookup in one function.
- `**Evidence:**` ids must exist in the charter's evidence catalogue (`horde.mjs charter show` / the charter
  parser wave.mjs close already uses).

### `queue.mjs plan [--team t] [--json]`

Derives, prints, never dispatches:

1. Edges: (a) `Consumes X@v` depends on the ticket that `Produces X@v` (same team or `team:` refs); (b) a ticket
   that `Produces` a port depends on nothing new, but every ticket of a node whose relation `consumes` that port
   (from `yg-impact/1` when `config.ygCommand` can produce it, else from relations in `yg-node.yaml` /
   `node.json`) and that itself `Consumes` the old version must come after; (c) manual `--depends` (union).
2. Approvals: a ticket that bumps a port's version lists its consumers' nodes as extra approval slots; `tk.mjs
   review approve --node <consumer>` accepts such a node; `premerge` item 2 requires them. Keep the derivation in
   one function `consumersOf(node, port)`.
3. File locks: two tickets with no order between them whose `Files` intersect → conflict; `plan` proposes an
   order (fewer files first) and `queue plan --apply-order` records it as `dependsOn` with a note.
4. Layers (topological antichains), critical path (in tickets and in class weight), connected components,
   cycles (refuse, print the cycle), consumes without producer, hub files (declared by ≥3 tickets), uncovered
   evidence rows (charter rows no ticket names), cost estimate = Σ weight(class) × 2 (worker + verifier) per
   ticket, and estimated waves = layers under `config.parallelism`.
5. `--json` document `horde-plan/1` with all of the above, for `wave.mjs`/`status.mjs`/briefs (136–138 read it).

### premerge item 3

Diff ⊆ declared `Files` when declared, else node boundary as today; note `declared <n> files, touched <path>
outside them` — the fix is `tk.mjs edit --files` with a log line, never a silent widening.

### Briefs

`owner.md` proposals carry the four fields (this is where the plan is written: by the owner, per ticket);
`steward.md` planning step: `queue plan` before wave 1, after every `reconcile`, and its output is what the
architect reviews (`architect.md`: completeness, buildability, cycles, uncovered rows — the plan-review
checklist). `SKILL.md` framing: evidence rows get ids `E1…` in the charter template.

## What is NOT in scope

`queue next` changes (136), stacking (134), evidence coverage in `status`/`done` (137). `yg-impact/1` itself is
Yggdrasil's (130): build against a fixture JSON of the shape in the mission file and a fallback that reads
relations from the graph files.

## Acceptance

- [ ] E6: fixture with the six tickets of `one-system-design.md` §6 (101 auth produces `auth/policy@2`;
      102 api, 103 web, 104 cli consume it; 105 auth depends 102,103,104; 106 web unrelated, files disjoint from
      103) → layers L0 {101,106} L1 {102,103,104} L2 {105}, critical path 3, one component, no lock conflict,
      and one uncovered evidence row when the charter has a row nobody names.
- [ ] E7: premerge refuses a diff outside declared `Files` with the exact note; a ticket without `Files` falls
      back to the node boundary.
- [ ] Refusals: cycle, consumes without producer, `Files` outside the boundary, bad port format; cross-team
      produces/consumes resolve.
- [ ] Full suite green; `scripts/README.md`, role briefs, ticket template, CHANGELOG `[Unreleased]` (adopter
      language: a ticket now says which files it touches, what it needs and what it delivers, and which proof
      it earns; the plan is computed from that and shows what nobody is building).
- [ ] Commits on the worktree branch with the session trailers; report branch, test count, one paragraph.
