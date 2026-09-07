# 145 · Yggdrasil: `yg drill add --violates <file>@<sha>` copies a real incident into a rule's drill corpus

**Status:** LANDED — committed 8b7e4e3b, pushed
**Found by:** director, 2026-09-06
**Severity:** medium
**Repo:** <yggdrasil> · branch `claude/grain-agent-tool-b89y0x` · same worker, after 144
**Ruling:** `production-is-the-corpus` · mission §6 E20
**Class:** opus

## What

1. `yg drill add --aspect <id> --violates <path>@<sha> [--satisfies …] [--why "…"]`: reads the file at that
   commit (`git show <sha>:<path>`), writes it into the aspect's drill corpus under the aspect's existing
   violates/satisfies convention with a name that carries provenance (sha, date), records the why in the
   aspect's log the way other aspect changes are recorded, then runs the drill for that aspect and reports
   whether the rule catches the case. A rule that does not catch its own incident is reported as such (exit
   non-zero with what/why/next: the rule needs work), and the case stays — that is the point.
2. Refusals: aspect unknown, file absent at that sha, deterministic aspect whose checker cannot run, duplicate
   case (same content already in the corpus).
3. Graph before code; docs (drills page) and CLI reference; CHANGELOG `[Unreleased]` for the adopter (a real
   failure can now become a permanent test of the rule that should have caught it); tests on real fixtures;
   repo-check green except the two known environmental failures; commit with session trailers.

## Acceptance

- [ ] E20b: a case added from a sha; the drill catches it (exit 0) or reports it does not (exit non-zero,
      case kept); refusals.
- [ ] Repo-check; commit; report.
