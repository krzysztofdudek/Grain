# 122 · Horde (feature branch): yg check w bramce premerge przy nodeSource yggdrasil, node.mjs show pokazuje reguły węzła (yg context --node / aspekty ze statusami, sekcja odziedziczona z charteru), test regresyjny nie przechodzi po cichu (testGlobs), config set zapisuje tablice, detectGates poza npm, horde charter edit, jeden zapis scalenia

**Status:** FIXED — All seven Horde items delivered on the feature branch claude/grain-agent-tool-b89y0x (7 commits, pushed, not merged): yg check in the premerge gate under nodeSource yggdrasil; node.mjs show lists a node's effective rules with status words via yg context --json/text or the graph files; the regression test refuses instead of passing silently when testGlobs is unknown, and horde init detects gates+testGlobs for npm/Maven/Gradle/Cargo/Go/Python/Make and says what it could not work out; config set writes lists; horde.mjs charter show|edit; queue.mjs set merged writes the wave-journal bullet itself; plus tk node-count, verify --revert no-new-tests and the README coverage note. Test suite 328/328.
**Found by:** 112 §7, 2026-09-06
**Severity:** high
**Class:** G

## Symptom

## Suspected area

## What is NOT in scope

## Acceptance
