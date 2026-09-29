# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Version numbers follow the Yggdrasil family's one-number policy, not Semantic Versioning: the core of the family (Yggdrasil, Grain, Jarl and Horde) ships together under one number, so a minor release can include changes that ask something of you. From 6.1.0 on, a release lists them under **Before you upgrade** and walks through them under **Upgrading from** the previous version.

## [Unreleased]

## [6.1.0] - 2026-09-29

Grain 6.1.0 states a convention, a norm or a co-change partner only when it beats chance or the rest of the repository, so what it tells you is more often true. It finds dependencies with the same code as Yggdrasil 6.1.0, shows what changes together with `grain cochange`, measures a stretch of work with `grain measure`, and offers every command over MCP. The core of the family (Yggdrasil, Grain, Jarl and Horde) ships under one number, so this minor release includes a few changes that ask something of you: **Before you upgrade** lists them, and **Upgrading from 6.0.0** walks through the steps.

### Before you upgrade

- **Type-only imports count as dependencies.** Grain reads a TypeScript or JavaScript type-only import (`import type`, `typeof import('./m')` and the other forms) as a dependency between modules, as Yggdrasil 6.1.0 does. Expect the relations they imply in your next proposal and in `grain check` and `grain report`.
- **The six original MCP tools answer with the command line's text.** `grain_where`, `grain_how`, `grain_what`, `grain_check`, `grain_status` and `grain_report` keep their names and fields. Pass `json: true` wherever your client reads their JSON.
- **MCP paths are absolute.** The server does not run in your directory, so it takes an absolute path in every field the command resolves against its working directory, such as `repo`, `out`, `graph`, `proposal`, `content`, `family-candidates`, and `grain_propose`'s `out-dir` and `json`. A path inside the repository, such as `grain_check`'s `file`, can stay relative. A number field takes a number, and a field the tool does not list is refused. Pass absolute paths for `repo` and the other path fields.
- **`grain export` no longer carries `agentShare` and `lastByAgent`** (see **Removed**), and the schema stays `grain-export/1`. Drop those two fields from any script that reads the export.
- **Grain's family candidates have their own file and unique ids.** `grain propose` writes its look-alike groups to `.family-candidates.grain.json`, separate from the `.family-candidates.json` Yggdrasil's miner writes, and `yg advise` reads it from Yggdrasil 6.1.0 on. Each id now names the partition and the group (`family-grain-<partition>-<group>`), so a family you dismissed or deferred appears once more under its new id; dismiss or defer it again.
- **`grain completeness` takes at least one file.** Called with none, it prints its usage and exits 1, so a script that builds the list should pass at least one.

### Upgrading from 6.0.0

1. Update the plugin in each host you use: `claude plugin update grain@grain-marketplace` and restart the session, `copilot plugin update grain`, `codex plugin marketplace upgrade grain-marketplace`, or in Cursor `git pull` in your clone of Grain and **Developer: Reload Window**. Grain needs Node 22 or newer and git, as before.
2. Upgrade Yggdrasil to 6.1.0 alongside it, and pin the exact versions of the family tools your pipeline runs. Horde 6.1.0 needs Grain 6.1.0 or newer. `grain propose` checks whether the `yg` it finds accepts the new `root` parent for top-level types; with no `yg` on `PATH` it writes `root`, which Yggdrasil 6.1.0 accepts and 6.0.0 does not, and says so.
3. Give the first Grain command in each repository a little longer: it rebuilds the store and reads the whole history once.
4. Update MCP clients and scripts: absolute paths for `repo` and the other path fields, only the fields each tool lists, `json: true` wherever you read JSON from the six original tools, and no `agentShare` or `lastByAgent` from `grain export`.
5. In a repository that adopted a Grain proposal before 6.1.0, run `grain propose --family-candidates .yggdrasil` once from the repository root to give `yg advise` Grain's families; it writes `.yggdrasil/.family-candidates.grain.json`. Dismiss or defer again any family that shows under its new id.
6. In the same repository, drill an adopted rule with `yg drill --aspect <id>`. The `CORPUS.md` beside its cases names `--dir` and `--corpus grain-proposal`, which record the run as an external hold-out that `yg advise` and the health reading leave out; a new proposal's `CORPUS.md` names the plain command.

### Added

- The MCP server offers every command as a tool (`grain_propose`, `grain_advise`, `grain_decide_steer` and the rest), with the command's flags as its fields; `grain_help` returns the full usage. A call ends on cancel or after 10 minutes (60 for `propose` and `selftest`; see `GRAIN_MCP_TIMEOUT_MS` and `GRAIN_MCP_LONG_TIMEOUT_MS`).
- `grain cochange` shows which files, directories or nodes change together more often than chance and scores a proposed split into parts (`--partition`); `grain measure --from <commit> --to <commit>` compares one part of the repository at two commits. Their `--json` documents are `grain-cochange/1` and `grain-measure/1`.
- `grain advise` drafts rules the graph could take on (`kind: rule` items): a `grain decide boundary` the graph does not enforce yet, and a convention inside one node that no rule states.
- `grain propose --scope <nodes and paths>` proposes a graph for one part of the repository, and `--shape types` covers each file by its type and writes a node only where one type sits inside another (`--shape nodes` stays the default).
- `grain propose` writes its look-alike groups beside the proposed graph, so `yg adopt` installs them and `yg advise` suggests a rule for each; `--family-candidates <path>` and `--no-family-candidates` choose another place or none, and Grain leaves another producer's file alone.
- `grain report` names the smallest set of dependencies that breaks each dependency cycle between modules, with the file and line of each reference, also in `report --json` (`cycleCuts`) and the proposal's refactor backlog.
- `grain where`, `check` and `review` carry `location` in their JSON (the module a path belongs in and whether it exists yet), and `grain completeness --json` gives `grain-completeness/1`.
- `grain selftest --null` and `--cochange` measure how often Grain's claims survive shuffled evidence and how often its co-change partners come true, and `grain oracle score` also scores ownership units.
- Vue and Svelte components join the architecture through their `<script>` imports, and more Ruby and C++ files read as those languages (`Gemfile`, `.gemspec`, `.cppm`, `.ixx` and others).
- Copilot CLI and Codex load the plugin from the portable Agent Plugins 1.0 layout.

### Changed

- Architecture norms ("files here do not import that module"), "never X" statements, group conventions, value sets and commit shapes now have to beat chance or the rest of the repository before Grain states them. Expect different findings from `grain check` and `grain propose` on the same code: fewer false ones, and some new ones, such as a boundary no file has ever crossed.
- Co-change partners are the files that change beside yours more often than chance would bring them there, so busy files such as a changelog stay out of the list.
- `grain propose` offers a short list of below-the-bar candidate rules, each passing the same test as a convention: 37 and 61 on Grain and Yggdrasil, down from about 500 and 740.
- Grain spots a fading convention on a repository of any age, and `check` stops flagging new code under a convention the new code has left behind.
- Grain parses with Yggdrasil 6.1.0's grammars, so a relation in a proposal is one `yg check` sees, and it reads newer syntax such as TypeScript `using`, C++20 modules and C# 14 extension blocks.
- `grain decide list` marks a boundary promoted once the architecture graph forbids it, and Grain leaves that import to `yg check`.
- The skill and the session-start note point the agent to the MCP tools first, with the command line as the fallback.

### Fixed

- Dependencies: Grain resolves imports the way each language's toolchain does in Java, Kotlin, C#, Rust, Go, Python, Ruby, C, C++, PHP, TypeScript and JavaScript, and on a case-insensitive file system (the macOS and Windows default) it matches a file only under the exact name its directory lists, so a new proposal carries more real relations and fewer false ones.
- Proposals: `yg adopt` accepts a proposal for code with dependency cycles, because `grain propose` breaks each cycle at its weakest dependency and lists the cut in `REFACTOR-BACKLOG.md`. A rule whose drill cases could not all run stays unverified, and over an existing graph the `next:` line previews with `yg adopt <out> --replace --dry-run`.
- Mining skips the root `.yggdrasil/`, so the drill corpora `yg adopt` installs there stay out of conventions and co-change.
- Every family candidate has a unique id and reports its measured `tightness`.
- `grain check` gives one consistent verdict when a narrow convention and a wider one disagree about a function.
- Dev containers: in VS Code attached to a container, the hooks and the MCP server exit 0 with one line when the plugin path is missing inside, and the MCP server maps a container path to the host through the containers' mounts.
- The MCP server stops the running command on `SIGTERM`, `SIGINT` or `SIGHUP`, and answers `ping` while a command runs.
- Windows: the hooks accept short and differently cased paths, `grain propose` finds an npm-installed `yg`, and files with Windows line endings read as they do elsewhere.

### Removed

- Grain treats every commit the same, whether a person or an agent made it, and no longer reports who wrote the code. That retires the agent-authored share and its alarm in `status` and `report`, the "held mostly by agent-authored code" note, and `agentShare` and `lastByAgent` in `grain export`. A repository written mostly with an agent gets more conventions: 163 instead of 90 on Yggdrasil.

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

[Unreleased]: https://github.com/krzysztofdudek/Grain/compare/v6.1.0...HEAD
[6.1.0]: https://github.com/krzysztofdudek/Grain/compare/v6.0.0...v6.1.0
[6.0.0]: https://github.com/krzysztofdudek/Grain/compare/v0.4.0...v6.0.0
[0.4.0]: https://github.com/krzysztofdudek/Grain/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/krzysztofdudek/Grain/compare/v0.1.0...v0.3.0
[0.1.0]: https://github.com/krzysztofdudek/Grain/releases/tag/v0.1.0
