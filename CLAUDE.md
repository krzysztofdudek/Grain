# Grain

## Purpose

This repository exists so the author can develop and version the grain plugin. The canonical plugin is `plugins/grain/`: `bin/` (the CLI entry), `engine/` (the miner, the model, every answer), `commands/` (one slash command per verb), `hooks/` and `hooks.json` (session start, pre-write, post-edit), `skills/grain/SKILL.md` (what teaches the agent when to ask), `scripts/` (the grammar build, whose outputs are committed, and `runes.mjs`, the Runes vendoring tool and gate), and `tests/`. People install it as a Claude Code plugin, a GitHub Copilot CLI plugin, a Codex CLI plugin or a Cursor plugin, or run `bin/grain.mjs` from a terminal. Nothing outside `plugins/grain/` may affect the plugin's behaviour.

Grain is the survey in the core of the Yggdrasil family. Yggdrasil (the law) enforces an architecture graph; Grain mines the first graph for a repository that has none, out of its own code and full git history, and writes only what Yggdrasil reads (`grain propose` → `yg adopt`). Jarl is the loop, and Horde plans a mission onto the law on Jarl's loop; Horde requires Grain, because its architect always measures with it (`grain cochange`, `grain measure`, `grain advise`). Grain needs Yggdrasil for the proposal to land anywhere; the agent-facing questions (`where`, `check`, `how`, the hooks) answer on their own. The add-ons — Ratatoskr, Urd, Researcher, Skald — attach to the agent, not to the graph, and Grain's SKILL.md follows the same plain-language rules Ratatoskr sets.

This repo never names or links Vision (the author's private practice hub) or any client repository. The measurement corpus in `docs/validation.md` is public repositories only; a private repository used for a gate contributes numbers, never its name.

## Layout beyond the plugin

- `docs/` — `reference.md` (every command and flag), `mathematics.md` (the objective and the one loss constant), `results.md` (the complete measurement record, negatives included — the whole claim), `validation.md` (the corpus and the per-grammar table).
- `tests/` — `fixtures/` (the deterministic fixture repository the plugin's own tests build against) and `stress/`.
- `.grain/` — Grain's own store on itself: `seeds.jsonl` and `decisions.jsonl` are committed maintainer decisions; `cache/` is gitignored and disposable.

Plugin manifests, and where the version lives:
- `plugins/grain/.claude-plugin/plugin.json`, `plugins/grain/.codex-plugin/plugin.json`, `plugins/grain/.cursor-plugin/plugin.json`, `plugins/grain/package.json` — the plugin manifests. Their `version` MUST match the latest released version in `CHANGELOG.md` and is bumped together with it.
- `.claude-plugin/marketplace.json` — single-plugin marketplace listing for Claude Code (`/plugin marketplace add krzysztofdudek/Grain`, `/plugin install grain@grain-marketplace`). Codex discovers the marketplace from the same file.
- `.github/plugin/marketplace.json` — the listing GitHub Copilot CLI reads. Mirrors the Claude listing and additionally carries the plugin `version` and the `skills` array; its `version` MUST be kept in lockstep with the plugin manifests.
- `.cursor-plugin/marketplace.json` and `.agents/plugins/marketplace.json` — the listings Cursor and the `.agents` convention read. Same plugin, same source.
- The marketplace name is `grain-marketplace`, the plugin name is `grain`, matching the `<name>-marketplace` convention of every sibling repo.

## Developing

```
cd plugins/grain
npm install --legacy-peer-deps  # dev dependencies only: the npm-sourced grammars, tree-sitter-cli and the runtime to vendor
npm run build:grammars      # materialize every grammar pinned in the vendored Runes manifest (engine/vendor/runes/grammars/manifest.json; npm, release asset or source build, sha256-verified) and vendor web-tree-sitter (outputs are committed)
npm run runes:update -- --tag vX.Y.Z   # move the vendored Runes copy (relations, ast, grammars, the runtime pin check, the grammar manifest, the command table and MCP adapter the MCP server is built on, and the test kit's parity, measure and client parts) and the skill fragment SKILL.md carries between its RUNES markers (mcp-first) to a Runes release; commit the copy, SKILL.md and engine/vendor/runes.pin.json together; never edit a block between the markers by hand
npm test                    # the Runes gate (the copy byte for byte against its pin, offline), then the whole suite, end to end over the fixture repository
```

Every number in `README.md` traces to `docs/results.md`; a claim without a row there does not go into the README. A negative result is recorded with the same care as a positive one.

## Versioning

This project maintains a [CHANGELOG.md](CHANGELOG.md) following the [Keep a Changelog](https://keepachangelog.com/) format. Its version numbers follow the Yggdrasil family's one-number policy, not Semantic Versioning: the core (Yggdrasil, Grain and Horde) ships together under one number, so a release may carry breaking changes under a minor number, and its CHANGELOG section says so and names them.

When the user says "bump version":
1. Move `[Unreleased]` entries in `CHANGELOG.md` into a new version section with today's date
2. Update the comparison links at the bottom of `CHANGELOG.md` (add the new `[X.Y.Z]: …compare/vA.B.C...vX.Y.Z` line and point `[Unreleased]` at the new version)
3. Update the `version` in `plugins/grain/.claude-plugin/plugin.json`, `plugins/grain/.codex-plugin/plugin.json`, `plugins/grain/.cursor-plugin/plugin.json`, `plugins/grain/package.json` (and its lockfile) and `.github/plugin/marketplace.json` (plugin entry) to match
4. Commit the bump and push to `main` — that's it.

Do not create or push tags manually. The `.github/workflows/release.yml` workflow runs on every push to `main`, reads the top version from `CHANGELOG.md`, and if `v<version>` does not already exist it creates the tag, pushes it, and publishes a GitHub Release with notes extracted from the matching changelog section. The README's release badge reads the GitHub Releases API, so a tag without a Release leaves the badge one version behind the text — which is exactly what the workflow prevents.

### Changelog register

`CHANGELOG.md` is written for the adopter, not the developer. Plain language, zero jargon, zero narration, facts only — no file names, no internal mechanics, no reasoning about why a change was made. State only what changed, the way someone deciding whether to install this would want to read it. Every entry gets the plain-language discipline from Ratatoskr, Krzysztof's own voice, and the stop-slop pass before it ships.
