# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
