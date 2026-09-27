---
description: What this repository's own history and imports say about the architecture graph it ALREADY has — places a finer cut beats, rules the graph could take on, and (as data, not advice) places that change together with nothing connecting them
argument-hint: [--json] [--graph <dir>]
allowed-tools: Bash(node:*)
---
## grain advise: $ARGUMENTS

!`node -e "const f=process.argv[1];if(!require('fs').existsSync(f)){console.error('grain: '+f+' is not reachable from this environment (a host path inside a container?), so grain did not run');process.exit(0)}const r=require('child_process').spawnSync(process.execPath,process.argv.slice(1),{stdio:'inherit'});process.exit(r.status===null?1:r.status)" "${CLAUDE_PLUGIN_ROOT}/bin/grain.mjs" advise $ARGUMENTS`

The run above read the `.yggdrasil/` graph this repository **already has** — it never proposes one, never
writes anything, and never touches the graph. (`grain propose` is the command for a repository that has no
graph yet; they are not the same thing and must not be offered as if they were.)

Three kinds of finding, and they carry very different weight. Relay them at the weight they have:

- **A place a finer cut beats, on its own evidence — this IS advice.** It means one node owns a pile of files
  that is not one thing: either a directory inside it keeps more of its imports to itself than the node as a
  whole does, or a directory inside it holds files grain could read none of while the node around it is code it
  did read. Both are the same comparison the proposal writer's own type cut is made from, so a candidate here
  is the same kind of claim as a proposed type — and the user may act on it by splitting the node in their
  graph. Say which node, how many files, and which directories are on offer.
- **Rules the graph could take on — drafts, and advice.** Two origins. A boundary decision a maintainer recorded (`grain decide boundary`) that the architecture does not make law yet: the item says which type would have to stop reaching which, which declared relation contradicts the decision, and how many imports cross it today. And a convention grain certified, which a check can hold, every site of it inside one node, and which no aspect of the graph states: the item carries the aspect grain would write, attached to that node — one item per rule, naming every node it holds in. Relay each as a draft for the user to accept or not; never write one into the graph. A boundary the architecture already forbids is counted as promoted, and grain no longer flags it at edit time, because `yg check` refuses it.
- **Places that change together — this is NOT advice, and must not be relayed as a recommendation.** It was
  measured on four hand-written graphs before it shipped: it names almost nothing, and what it does name the
  graph usually already connects; every looser reading of the same evidence concentrates on whichever place
  the repository changes most. So the text output prints only the count, how many the graph does not connect,
  how concentrated they are, and how that compares to the declared rate among all pairs of places. Relay those
  numbers as numbers. Do **not** go looking for the pairs and do **not** suggest adding a relation because of
  them. If the user asks for them anyway, re-run with `--json` and hand them over as data, with the
  concentration figure attached.

`--json` emits the whole `grain-advice/1` document — every pair with both directional confidences, the two
declarations it was read from, the commit counts behind the rates, whether the graph declares the pair and how,
the split candidates with their evidence, and the rule drafts with theirs. That document is the machine surface another tool reads; the
text above is what a person reads.

`--graph <dir>` reads a hand-written graph held beside the repository instead of inside it — the shape a
scoring oracle has. Without a graph anywhere, the command says so and points at `grain propose`.

Do not edit the graph, and do not run any Yggdrasil command yourself. Changing an architecture graph is the
user's decision.
