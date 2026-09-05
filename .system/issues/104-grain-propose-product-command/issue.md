# 104 · grain propose jako komenda produktu w formie cichej: jedno polecenie od klona do ładowalnego .yggdrasil/; domyślny raport = architektura + enforced + kandydaci wg siły dowodu; reszta za flagą; bramka reachability

**Status:** FIXED — grain propose is a product command in the quiet form: renderer moved to engine/propose.mjs (proposal tree byte-identical, diff -r zero), engine/yggdrasil-graph.mjs carved out so the command no longer depends on a test instrument, tests/stress/propose.mjs kept as a thin wrapper with every flag and export intact. Quiet report plus --full and --json <path>; out-dir .yggdrasil-proposal/ is self-ignoring and never the repository's own graph. Reachability: one conditional SessionStart line (index present, no graph), SKILL description and body, USAGE, commands/propose.md. Tests: e2e through the built bin.js on a real fixture plus a staged yg check, JSON-to-text parity, reachability; 2288/2288 green. Ticket 102's 13/11 reproduced exactly and explained: --no-history yields 0 conventions, so all of its aspects came from the sub-gate lattice instead. NO VERSION BUMPED, director's call: ENGINE_VERSION 0.3.0 to 0.4.0 is the analogous move under wave-close-versions-0-4-0 (a new command surface); EXTR_V, HIST_V and MODEL_V must not move.
**Found by:** director, odbiór fali 8, 2026-09-05
**Severity:** high
**Class:** 6

## Symptom

## Suspected area

## What is NOT in scope

## Acceptance
