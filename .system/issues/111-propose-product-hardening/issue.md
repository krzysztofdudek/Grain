# 111 · D: engine/propose.mjs (2200 linii z instrumentu) jako kod produktu — przegląd adwersaryjny, uproszczenia, przegląd bezpieczeństwa ścieżki zapisu i spawn yg, pokrycie

**Status:** FIXED — 10 code commits + 2 docs commits on fix/111-hardening (branch point 3d249bf; the base branch has since moved on with the express oracle, no overlap). Eight defects found and fixed, each with a test that was red first: (1) an out-dir that is a symlink to the repository walked past the refuse-to-overwrite guard and the renderer then DELETED the repository's hand-written .yggdrasil/, exit 0, no warning — the guard compared resolve()d strings, it now canonicalizes; (2) a backslash in a tracked path was folded to a separator, fabricating a directory the file does not live in and sizing it at zero; (3) a line break in a repository path escaped the evidence comment and injected arbitrary YAML keys into yg-architecture.yaml — the same lever reaches an aspect's status:, confirmed by two parsers; (4) a control character in a path made the whole graph unreadable to a conforming parser (whole document, not the scalar); (5) the same gap on the comment side, closed after the first fix proved half; (6) no timeout on yg drill, so a wedged CLI hung the command forever — bound derived from the slowest drill measured on Yggdrasil's own proposal (2148 ms) x100, disclosed in the report when it fires; (7) the export the command spawns was left in the committable half of .grain/; (8) a repository whose git is present but broken silently mined a weaker file set with no .gitignore resolution — now produced, but disclosed. Security pass on a real hostile git fixture closed two: a tracked symlink handed the proposal the content of a file outside the repository, and a site path resolving outside it was trusted. Verified clean: argv arrays everywhere (no shell), aspect ids slug-built so never readable as a flag, check.mjs generation interpolates only closed enums and JSON.stringify'd identifiers. Simplification: five dead parameters removed, propose() split 243 -> 110 lines at the seams its own comments name. Byte-identity gate passed on every simplification commit and every fix (diff -r empty over the .yggdrasil tree from a pinned export; all five documents byte-identical). Suite 2311/2311 pass; engine/propose.mjs line coverage 71.01% -> 98.12%.
**Found by:** director, 2026-09-05
**Severity:** high
**Class:** D

## Symptom

## Suspected area

## What is NOT in scope

## Acceptance
