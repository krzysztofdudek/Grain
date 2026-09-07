# 129 · Horde: disciplines modelled on Superpowers as role law rendered into briefs; drills that assert `.horde/` state; production as the corpus

**Status:** LANDED — merged 286e437 on Horde feature branch
**Found by:** director, 2026-09-06
**Severity:** high
**Repo:** <horde> · branch `claude/grain-agent-tool-b89y0x` · work in a worktree, do not push
**Rulings:** `disciplines-are-rules`, `production-is-the-corpus` · mission §6 E9
**Source to model on:** `<scratchpad>/superpowers` (obra/superpowers v6.3.0, MIT). Read: `skills/test-driven-development/` (SKILL.md, writing-good-tests.md), `skills/systematic-debugging/` (SKILL.md, root-cause-tracing.md, condition-based-waiting.md, test-pressure-*.md), `skills/verification-before-completion/`, `skills/requesting-code-review/` + `code-reviewer.md`, `skills/receiving-code-review/`, `skills/brainstorming/SKILL.md` + `spec-document-reviewer-prompt.md`, `skills/writing-skills/` (SKILL.md, testing-skills-with-subagents.md).
**Class:** opus

## Why

Horde's briefs say what a role does; they do not carry the disciplines that make an agent hold under pressure
(time, sunk cost, authority). Superpowers has them, tested by pressure scenarios, with rationalization tables.
Ported as skills they would be a second system claiming the first move. As role law rendered into the brief,
enforced by `premerge` where mechanical, they are one system. And Horde's state files make the hardest part of
Superpowers' method free: real `.horde/` state is the pressure fixture.

## What

1. **Texts**, one source each, in `skills/horde/reference/discipline/`: `tdd.md`, `debugging.md`,
   `verification.md`, `review.md`, `framing.md`, plus `README.md` naming obra/superpowers (MIT) as the model and
   what was deliberately dropped. Written in Horde's voice (plain, short, no slop), each mapped to Horde's
   mechanics: the revert test is the mechanical proof that tests are load-bearing, so **test-first is not a
   rule** (say so); three failed fixes → `dissent.mjs add`, not a fourth fix; no key without the command's
   output (`verify record --ran/--saw`); findings Critical/Important/Minor and Minor never re-enters the loop;
   framing asks one question at a time, offers two or three approaches, and evidence rows are things a verifier
   reproduces. Each carries a rationalization table and red flags, seeded from Superpowers' published baselines
   and marked "unverified on Horde briefs until a drill run says otherwise". Match the form to the failure
   (recipe for shape problems, prohibition + table for discipline problems, conditionals on observable
   predicates); no nuance clauses.
2. **Rendering.** `brief.mjs` has a role → disciplines table (worker: tdd, debugging; verifier: verification,
   review; owner: review; architect: framing's checklist; director section of `SKILL.md`: framing). Briefs get a
   `## Law` section with the texts inline; role `.md` files reference the discipline by name. Also the worker
   progress rule: `tk.mjs log NNN "…"` every few commits, so a lost session resumes from the log.
3. **Drills.** `scripts/drill.mjs`:
   - `list` — disciplines and their cases;
   - `check <discipline> --repo <dir> [--ticket NNN]` — asserts state, not prose: tdd = on the ticket branch a
     commit exists whose new tests fail on the parent before the commit that makes them pass (derive from git,
     reuse `premerge`'s revert-test machinery), verification = the verdict block has `--ran`/`--saw` and a
     gate sha equal to the tip, review = findings carry severities and Minor did not bounce the ticket, scope =
     premerge item 3 clean;
   - `run <discipline>` — runs `check` over the corpus `scripts/tests/drills/<discipline>/{violates-*,satisfies-*}/`
     (the same violates/satisfies convention as `yg drill`), expects red on violates and green on satisfies;
   - `record <name> --discipline d --expect violates|satisfies [--horde h]` — snapshots the current `.horde/`
     state and the relevant branch refs into a new corpus case, so a real mission's hard moment becomes a
     fixture (production is the corpus).
   Corpus cases are built by the tests themselves with the real scripts (no fabricated JSON).
4. Attribution: README "Acknowledgements" naming obra/superpowers (MIT); `scripts/README.md` for `drill.mjs`;
   CHANGELOG `[Unreleased]` in adopter language (every role now carries the discipline it is held to; a
   discipline can be drilled against real mission state).

## What is NOT in scope

Any hook. Skills outside `skills/horde/`. Running LLM pressure scenarios (the maintainer runs those with the
harness this ticket provides). The fix-loop mechanics (128).

## Acceptance

- [ ] E9: rendered worker brief contains the TDD and debugging law with tables; verifier brief the verification
      law; `drill.mjs run tdd` is red on a violates case and green on a satisfies case built with real scripts;
      `drill.mjs record` produces a case `run` then accepts.
- [ ] Full suite green; attribution present; docs and CHANGELOG updated; commits with session trailers; report
      branch, test count.
