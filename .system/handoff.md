# Handoff

at: 2026-09-01T21:46:33.021Z
by: director
head: main@c02d103

## Summary
Wave 1 closed except instr/F (waiting on Symfony full-history ladder) and research/where-lever (running). Main c02d103+, suite 1958/1958 (4 todo). Director skill + committed .system state landed (688efa8, tools via skill/director-tools and -2). G catalog merged: product gap = precedents yes, obligations no; wave 3 = completeness/adoption/usedBy/testedBy/how-liveness. 67 tickets, 22 open.

## In flight
- 1 branch:instr/corpus-ladder —  (since 2026-09-01T21:46:32.973Z, reports to lead)
- 2 branch:research/where-lever —  (since 2026-09-01T21:46:32.973Z, reports to lead)
- instr/F corpus-ladder branch:instr/corpus-ladder — corpus.json + scale ladder; blocked on its own Symfony run (since 2026-09-01T21:46:32.999Z, reports to director)
- research/where-lever branch:research/where-lever — where ranking: failure attribution by evidence source, 3 lever experiments (since 2026-09-01T21:46:33.022Z, reports to director)

## Pending decisions
(none)

## Waiting on
(none)

## Last actions
- - 2026-09-01 audit-claims.mjs had 4 literal NUL bytes (git saw binary) — replaced with \0 escapes, fadc886
- - 2026-09-01 merged: 045 9064c23
- - 2026-09-01 merged: 044 423119e
- - 2026-09-01 merged: 016 8d9a1a7
- - 2026-09-01 merged: instr/D 5470fe4
- - 2026-09-01 merged: instr/B 35f054b
- - 2026-09-01 merged: 049 17f5e08
- - 2026-09-01 merged: instr/A 7375fa1
- - 2026-09-01 merged: research/G-catalog cc66d8e
- - 2026-09-01 merged: skill/director-tools-2 7ac3822

## Next actions
- REFORMAT engine (Prettier, one statement per line, comments untouched, one no-logic commit) — window is open NOW: F and where-lever branches don't touch core.mjs
- EXTR_V g30→g31 single bump covering 018/040/043/045/016/049 (after reformat or before — one commit either way)
- spawn the LEAD (Sonnet, long-lived) with SKILL.md + system.md + queue: it runs wave 2+3 from the queue; director drops to escalations + audit
- when research/where-lever lands: rule on the lever, then queue G rec 2 (where symbol-first)
- chore for lead: prune finished agents' worktrees (15 listed; keep F's and where-lever's)

## Notes
- Worktree isolation branches from a stale ref: EVERY worker's first action is git merge main (5 agents hit it; 049 merge had to be aborted)
- Agents' SendMessage to 'grain-34' resolved to peer session 'grain-4d' — reports arrive via task notifications regardless; give the lead an unambiguous name
- Symfony petclinic fixture store under the session scratchpad was rebuilt on 0.2.1 by a stale-base agent — rebuild before measuring against it
