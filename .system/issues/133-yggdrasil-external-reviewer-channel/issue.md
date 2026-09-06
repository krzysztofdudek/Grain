# 133 · Yggdrasil: an external judge fetches the exact review package for an aspect/file pair and records a hash-bound verdict under its name; CI re-proves it

**Status:** LANDED — committed 4bc0173f on Yggdrasil feature branch, pushed
**Found by:** director, 2026-09-06
**Severity:** high
**Repo:** /home/user/Yggdrasil · branch `claude/grain-agent-tool-b89y0x` · same worker as 130/132, after 132 lands
**Rulings:** `verifier-is-yggdrasil-reviewer`, `layered-family` · mission §6 E3
**Class:** opus

## Why

Prose rules are judged by a reviewer provider (`ReviewerProvider`, `model/graph.ts:157`: hosted APIs or the CLI
providers `claude-code`, `codex`, `gemini-cli`). In a horde the natural judge is the verifier: a fresh-context
agent at a class not below the ticket's, already reading the diff. Today it has no way to hand Yggdrasil a verdict
with provenance; a steward without an API key gets a red graph and merges nothing. The chain must not bypass
Yggdrasil's binding: the verdict must be tied to the same content hashes as any other, re-provable in CI without a
key, and show who judged.

## What

Derive the exact command shapes from `yg`'s own conventions (`yg knowledge`, `yg schemas`, the existing
`check`/`approve` flows and the lock model) — the requirements are:

1. **Package.** A command that, for one pending (unverified or refused) pair of an LLM-judged aspect and a file,
   prints the exact review package the configured provider would receive (rule text, file content, companions,
   the tier's constraints) as one JSON document with a `schema` field, including the hashes the verdict will
   bind to. Deterministic aspects are refused here: they are machine-only.
2. **Record.** A command that records a verdict for that pair — `pass` or `refused` with a violation report —
   under a judge name (`--by <name>`), bound to the same hashes, into the lock exactly as a provider verdict is,
   with provenance (`reviewer: <name>`, a `provider: external` marker or whatever the lock's model makes
   natural). It refuses when the hashes no longer match the working tree (the file changed since the package was
   printed) and when the pair is deterministic.
3. **Visibility.** `yg check` (text and `--json`) shows who judged an externally recorded pair; CI re-proves it by
   hash like any verdict. `yg check --approve` semantics are unchanged: recording is not approving; the human's
   suppression and status rules are untouched.
4. Graph before code (the node owning the reviewer/lock paths), docs (`docs/` reviewer page and CLI reference in
   `templates/knowledge/cli-reference.ts`), CHANGELOG `[Unreleased]` for the adopter (a person or another tool
   can now judge a rule and have Yggdrasil keep the verdict as its own), tests on real fixtures (record a pass,
   see `yg check` green without any provider configured; change the file, see it red; try a deterministic
   aspect, see the refusal), `scripts/repo-check.sh` green except the two known environmental failures; commit
   with session trailers.

## What is NOT in scope

Horde's verifier brief that uses this (135). Any change to provider behaviour.

## Acceptance

- [ ] E3 exactly, on a fixture with an LLM-judged aspect and no provider configured.
- [ ] Refusals: hash mismatch, deterministic aspect, unknown pair — each what/why/next.
- [ ] Graph, docs, CLI reference, CHANGELOG, tests; repo-check; commit; report with the command shapes chosen
      and why they fit `yg`'s conventions.
