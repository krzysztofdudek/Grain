# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `grain propose` now writes `.family-candidates.json` into the proposal's `.yggdrasil/`, beside the graph, so `yg adopt` installs it and `yg advise` names each group of similar files no rule covers as a rule to draft. Before, the file was only ever written by Grain's own measurement script, so an adopter never had it. `--family-candidates <path>` writes it somewhere else (a repository that adopted earlier points it at its own `.yggdrasil/`), and `--no-family-candidates` writes none. The report gains a `family candidates:` line and the JSON a `familyCandidates` field.
- `.family-candidates.json` now says who measured and what "without a law" meant: `producer: "grain"` and `gate: "no-certified-convention"`. Yggdrasil's own miner writes the same document from a different oracle (no narrow authored aspect), and without these fields a reader of `yg advise` could not tell which one found the gap. Both are optional fields inside `v: 1`, so a consumer that does not know them reads the file as before.

### Fixed

- Grain's MCP server now answers for a repository named by its path inside a dev container. VS Code starts the server on the host for a window attached to a container, while the agent that passes `repo` runs in the container, so the path it passes does not exist where Grain runs. Grain now reads the mounts of the running containers (`docker ps`, `docker inspect`) and uses the host directory behind the longest mount that contains the path. A path no container mounts is refused with a message that says so and asks for the host path, as before never swapped for another repository.
- A family candidate that coincides with its whole host type now reports the measured overlap as its `tightness`. Grain takes such a group when it shares at least nine files in ten with the type, and wrote `1` for every one, so `yg advise` presented a near fit as an exact one.
- Grain no longer mines the repository's own graph as code. After `yg adopt`, the root `.yggdrasil/` holds the proposal's drill corpora, which are full copies of the repository's files, and Grain's git mode counted them a second time in every convention, twin and co-change, and even cut a module out of them. The root `.yggdrasil/` is now excluded like `.grain/`; a `.yggdrasil/` deeper down still marks a nested project.
- `grain propose` no longer overwrites a `.family-candidates.json` that Yggdrasil's own miner wrote. The file carries one producer's families, so writing Grain's over it erased the miner's from `yg advise` without a word. Grain now leaves such a file as it is, prints `family candidates: N group(s) found, NOT written` naming the other producer, and carries `notWritten` in the JSON report; `--family-candidates <another path>` keeps Grain's apart.
- The `CORPUS.md` beside each proposed rule's drill cases now says to score them with `yg drill --aspect <id>`. It said `yg drill --aspect <id> --dir … --corpus grain-proposal`, and `--dir` records the run as an external hold-out, which `yg advise` and the health reading leave out, although the same file says the corpus is not a hold-out.
- The README's Status section said Grain needs Yggdrasil. It runs on its own, as the family section of the same README and every other family repository say; it writes only what Yggdrasil reads when Yggdrasil is present.
- `grain propose` no longer writes a rule as `enforced` when `yg drill` could not run its cases. The drill's footer also counts cases that did not run (a check that threw, a grammar that did not load) and cases it does not support, and exits 2 for them; Grain read only pass, MISS and FALSE-ALARM, counted catches as violates cases minus MISSes, and so read every unrun violates case as caught. A drill with any unrun or unsupported case now leaves the rule unverified, as a drill that printed nothing already did.
- In a repository that already has a graph, `grain propose` now previews its proposal with `yg adopt <out> --replace --dry-run`, and its `next:` line names that command and says accepting would replace the existing graph. It ran a plain `yg adopt <out> --dry-run`, which Yggdrasil refuses over an existing graph before it reaches the dry run, so the preview printed only the refusal, and the refusal pointed at the same command. A dry run still writes nothing.
- Two family candidates in `.family-candidates.json` could carry the same id, because the id came from the role group's number alone and every partition numbers its groups from `r0`. `yg advise` names each nomination by that id, so the second family could not be dismissed, deferred or filed on its own. The id now names the partition and the group (`family-grain-<partition>-<group>`), and a certified convention on one partition's group no longer silences the group with the same number in another partition. Ids of existing families change once.
- Grain no longer crashes a session when the host hands it a plugin path that does not exist where it runs. In a VS Code session attached to a dev container, Copilot substituted the host's install path into the `sessionStart` hook, and `node <path>` died with `MODULE_NOT_FOUND` on every session start. Every hook, slash command and the MCP server now start Grain through one guard: when the file is not there it prints one line on stderr and exits 0, and when it is, it runs Grain with the same arguments and exit code as before. The guard is a `node -e` call rather than a shell `if`, so the slash commands still fit their `Bash(node:*)` permission. Windows-only hook fields and Cursor's relative path are unchanged.
- The notes `grain propose` writes into each drill corpus's `CORPUS.md` and into `proposal.json`'s schema notes cited internal ticket numbers ("ticket 097 does the sha version", "ticket 102, three-way since 107") that mean nothing outside this project. They now name the instrument or the field instead. The code comments and test names across the plugin lost the same numbers and the `§NNN` anchors; each keeps its reasoning and names what it used to point at.
- `grain where --json <path>`, `grain check --json <file>` and each file in `grain review --json` now carry `location` — the module the path belongs in, whether the path and that module exist yet, and the nearest existing ancestor when they do not. Before, only the text output said where a path belongs and that it did not exist yet, which is exactly what an agent reading the JSON needed. `where --json` also carries the naming-pattern `placement` hint. No existing field changed.
- `grain where` given a single argument that contains a `/` and names a real place in the repository — an existing file or directory, a path that looks like a source file by its extension, or one that sits under a directory that already exists — now answers for that path too, as `grain check` does: which part of the repository it belongs to, or that it doesn't exist yet and which nearest part does, and where files with a similar name usually live. A slash-containing word that names nothing in the tree (an idiom like `async/await`) is still read as ordinary words, and the ranked results themselves are unchanged either way.

## [6.0.0] - 2026-09-12

### Added

- `grain propose` writes graphs in the 6.0.0 format; loading one needs Yggdrasil 6.0.0 or newer.

### Changed

- Marketplace renamed to `grain-marketplace`: `/plugin install grain@grain-marketplace`. Also installable from the same repository via GitHub Copilot CLI, Codex CLI and Cursor.
- `grain propose` no longer writes `charter.md` beside a proposed component. What it opens with is now the component's own description; conventions and co-change partners are a live answer from `grain explain`, `grain where` and `grain completeness` instead.
- A `boundary` decision recorded with `grain decide boundary` now also appears in what `grain propose` writes, as a forbidden dependency in the proposed graph.
- `grain advise`'s count of places a finer cut would help now separates places it could not read from places it could read but found too coarse.
- Session start in a repository that already has an architecture graph now says so and points at `yg prime`, and names how to install `yg` when it isn't on `PATH`.
- Session start now warns when the repository's index is sparse.
- `grain propose`'s report now names how many of its rules look ready to earn enforcement once Yggdrasil is installed, on a run with no Yggdrasil CLI to check them itself.

### Fixed

- The checks proving `grain propose` works with Yggdrasil and Horde now install Yggdrasil the way an adopter would, not a local build standing in for it.

## [0.4.0] - 2026-09-07

Experimental. The measured record behind every claim, negatives included, ships with the build.

### Added
- From a repository with no architecture graph to a proposed one, in a single command. It reads your code and your whole commit history and writes a complete draft: the kinds of part your repository is made of, the parts themselves, what depends on what, where those dependencies run in circles, and the rules your own code already keeps — each rule carrying the evidence that produced it and the count of places that break it today. It never touches a graph you already have. Yggdrasil accepts the draft with one command, and when Yggdrasil is on hand the preview of how much of your code the new rules would refuse runs before you decide anything.
- For a repository that already has a graph: what its own history says about it. Where a finer split of one part beats the current one on that part's own evidence, and which parts change together with nothing in the graph connecting them.
- Keeping the difference between the draft it wrote and the graph you actually accepted, and scoring itself against it in both directions. It records structure and paths, never the contents of your files, prints what it would store before storing anything, and writes nothing until you say so.
- Dependencies between parts are now resolved for thirteen languages. The other supported languages keep the conventions answers only.

### Changed
- What the tool is for. Mining the first graph for a repository that has none is now the first thing it does. The questions it has always answered — where does this belong, does my change match how this repository does things — work exactly as before, and are now the second thing.

## [0.3.0] - 2026-09-02

Released as a portfolio piece, with the complete measured record attached. Development had paused: across the paired trials on this build, an agent with grain produced the same change, in the same place, as an agent without it. The engine was in its best state and there was no evidence it helped anyone; both were true at once.

### Added
- Birth obligations for a path, a rewritten answer for what co-changes with a file, better hit rate on named queries, and structured disclosures on every machine-readable answer.

### Fixed
- Three classes of fabricated answer, in Python, Kotlin and Rust.
- Reading the history of a very large repository no longer fails silently.

## [0.1.0] - 2026-08-26

### Added
- First public release.

[Unreleased]: https://github.com/krzysztofdudek/Grain/compare/v6.0.0...HEAD
[6.0.0]: https://github.com/krzysztofdudek/Grain/compare/v0.4.0...v6.0.0
[0.4.0]: https://github.com/krzysztofdudek/Grain/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/krzysztofdudek/Grain/compare/v0.1.0...v0.3.0
[0.1.0]: https://github.com/krzysztofdudek/Grain/releases/tag/v0.1.0
