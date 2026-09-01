# 007 · `grain rules` omits the relation-coverage disclosure that `report` carries

**Status:** FIXED (verified independently by orchestrator, 1471/1471)
**Found by:** fix-004 agent, 2026-09-01 (reported, deliberately not fixed — out of that issue's scope)
**Severity:** low-medium — same class of honesty gap as §G21 and 004, on a different surface

## Symptom

`rulesMarkdown()` (`core.mjs`, backing `grain rules`) never calls `relCoverageNote(model)`, so the generated
Markdown rules document can present an architecture picture without the "resolution does not cover N files
(...) — conventions layer only for those" line that `report()` prints for the identical model.

`grain rules` is explicitly the artifact meant for a reader with NO terminal and NO grain installed (see its own
description: "for a maintainer or a coding tool with no terminal and no grain plugin installed"), which makes an
undisclosed coverage gap arguably worse there than in `report`, not better.

## Expected

Whatever disclosure `report` makes about resolution coverage, `rules` makes too — the two must not disagree about
what is known. Check `intraModuleNote` (added by 004) for the same omission at the same time.

## Acceptance

A fixture repo with at least one file in a language lacking a relation extractor: `grain rules` output carries the
coverage disclosure, matching `grain report`'s. Same for the intra-module case from 004.
