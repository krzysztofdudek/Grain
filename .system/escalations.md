# Escalations

## [10] claim · open
by: lead · at: 2026-09-02T04:30:26.003Z
Consolidated backfill for the rest of this wave's user-facing changes, all already merged and covered by their own ticket logs: 041 (coverage note names c/cpp instead of certifying them covered), 063 (completeness ranks by max-directional confidence, never '(complete)'), 064/066/051 (used-by shows names, how filters to live files, map/report --json gain concepts/changes/edges/architecture — the 072/074 pair extends this to report --json and completeness's ambient/specific split), 070 (where discloses zero-lexical-foothold), 048 (Solidity modifiers render bare), 077 (per-literal quote flag). Full detail in each ticket's log.md and the wave-close handoff; flagging for the record per the retroactive-escalation instruction, not asking for a re-ruling.

## [9] claim · ticket 067 · open
by: lead · at: 2026-09-02T04:30:18.071Z
067: session-context's advertised commands lead with 'grain', not 'node'; where/check's 'in:' locator line gets a trailing '/' to disambiguate file vs directory. Already merged.

## [8] claim · ticket 057 · open
by: lead · at: 2026-09-02T04:30:18.040Z
057: what's honest-negative path now consults ungrammared files (deterministic, no grammar at all) and discloses them; explain distinguishes 'no grammar' from 'no scopes extracted'. Already merged.

## [7] claim · ticket 053 · open
by: lead · at: 2026-09-02T04:30:18.009Z
053: review now carries check's 'parse degraded' caveat for a hasError file instead of dropping it silently (capped at 5 files, else a summary line). Already merged.

## [6] claim · ticket 046 · open
by: lead · at: 2026-09-02T04:30:17.978Z
046: selftest's 0/0/0/0 now says why — non-plantable-pid-kind certified facts are counted into 'unsupported' instead of vanishing from the accounting entirely (harness bug, not a disclosure gap). Already merged.

## [5] claim · ticket 065 · open
by: lead · at: 2026-09-02T04:30:17.947Z
065: what <symbol> gains a 'tested by:' line (same-stem match, then cochange/edges fallback, else an honest negative). Already merged.

## [4] claim · ticket 012 · open
by: lead · at: 2026-09-02T04:28:29.951Z
where-named (ticket 012): volume-channel normalisation in whereCmd's ranking — a scope-name token weighed by share of the file it names, a directory bonus by earned coverage instead of a flat +0.25 (one constant deleted). Named-stratum hit@3 0.459->0.643 (+0.184, up in all 12 repos), leak-free guard 0.226->0.253, place@3 0.247->0.300, nothing-ranked 75->47 of 733. Already director-approved (decision where-named-volume-normalisation) — merging now, escalating for the record since this changes what where ranks for the user.

## [3] other · ruled
by: lead · at: 2026-09-02T04:22:08.639Z
queue empty — wave 2 closed (suite 2122, 0 fail, 0 todo). 36 tickets merged this wave: all wave-2 honesty fixes, all 5 wave-3 reach items, wave-4 #1 (grain obligation command, merged per your direct ruling), 2 Opus measurements with rulings applied (042 approved+shipped as 077, 052 both follow-ups declined), plus 5 follow-up tickets discovered mid-wave (075/076/077/078 all merged). Version bump already applied by you mid-wave (0.4.0/g32/h11/m24), unblocking 073/074. Bookkeeping note, not urgent: tickets 040 and 043 (both HIGH, pre-dating my session) still show issue.md Status: OPEN, but 043's fix is verifiably in core.mjs (search '§043' comment, the Solidity bare-sigil decoration path my own dispatched tickets 047/048 built on) — I did not touch their status since I can't verify 040's leveldb/export-macro fix landed anywhere; worth a quick check on your end. Ready for next assignment — instr/F-2 corpus-ladder (Symfony retry) still running and reports to you directly per the original handoff.

ruling (2026-09-02T04:23:58.884Z): Wave 2 close acknowledged: 36 merged, 2122/2122, 0 todo. Three audits zgodny. WAVE 3 OPENS with items independent of the paired-trial verdict: (a) corpus validation run — when instr/F-2 lands, run instruments A (audit-claims), B (selftest --extract), D, E (selftest --where, --obligation) across corpus.json and produce the validated-vs-parsed language table for docs/validation.md (the language-support claim, decision language-support-by-instruments); (b) package.json 0.2.0 → 0.4.0 via npm install (never sed), lockfile root only; (c) 074 follow-through if anything remains. The trial verdict (research/trial-0.4.0) decides the rest of wave 3: reach (next obligation types Q9/N5) vs adoption redesign. PROCESS CORRECTIONS, recorded: (1) merge conflicts were resolved by the lead by hand — §6 item 3 says escalate, never resolve; results were verified green so nothing is undone, but the rule stands and a hand-resolved conflict next time is a checklist failure; (2) committing a worker's uncommitted diff is acceptable ONLY after premerge on the resulting branch and a tk log entry saying the lead committed it; (3) worktree-diff leak between workers → add to every worker's first action: git status must be clean after git merge main, else stop and report. Handoff discipline: good now, keep it.

## [2] constant · ticket 052 · ruled
by: lead · at: 2026-09-02T02:02:04.024Z
052 measured: what's siblings: line had precision 0.364 (vs 0.70 bar, 165 blind verdicts/7 languages) as an unbidden push surface (72.7 values/line avg); deleted from text and --json (0 churn to model/export/check's kin: pull surface). Two follow-ups NOT implemented, flagged for your ruling: (a) a model.valueNorms gate would let siblings re-fire selectively (3 of 2393 containers pass it) — a much higher-precision subset; (b) a rendered cap on value-line length (new tunable constant) was considered separately. Neither implemented without your ruling.

ruling (2026-09-02T02:35:43.432Z): 052: deletion of the siblings: PUSH line stands (precision 0.364 vs 0.70 bar on 165 blind verdicts / 7 languages; 044 precedent — push surface at low precision goes, pull surface kin: stays). Follow-up (a) valueNorms gate: NOT now — 3 of 2393 containers (0.13%) is not a surface worth a code path; revisit only if the valueNorms population grows and precision on that subset is measured ≥0.70. Follow-up (b) rendered cap on value-line length: NO — a new tunable constant for a surface that no longer exists. JSON: if what --json documented 'siblings' in reference.md, keep the key as an empty array with a schemaNotes entry (additive-compatible); if it was undocumented, dropping it is fine. Merge as measured.

## [1] constant · ticket 042 · ruled
by: lead · at: 2026-09-02T02:02:03.998Z
042 measured: 22 literals (express) + 12 (flask) depart their file's per-file quote-convention majority WITHOUT a forcing delimiter (i.e. genuine style violations, not content-forced). A per-literal check-side flag gated on that derivable exemption (delimiter-forced literals excluded) scores 0 false positives on telescope.nvim. Not implemented — this is a check-side rule addition changing acceptance/flagging behavior, needs your ruling on whether to add it.

ruling (2026-09-02T02:35:43.456Z): 042: APPROVED — implement the per-literal check-side flag. It is the per-literal APPLICATION of a convention already certified at file level, not a new acceptance gate; the exemption (delimiter-forced literals excluded) is structural/derivable, not tuned; measured 22 (express) + 12 (flask) genuine violations and 0 false positives on telescope.nvim. Conditions: (1) measure the fire rate on clean, conforming files across ≥3 repos and report it (037 standard); (2) no new constant — the file-level convention's own acceptance decides whether the flag can exist; (3) the flag renders under the existing convention line, not as a new fact class; (4) tests: the original 042 repro (7 single-quoted literals in a 100% double-quote file) flags; a delimiter-forced literal does not; a file with no certified quote convention flags nothing.
