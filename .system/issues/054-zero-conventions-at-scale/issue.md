# 054 · The convention engine certifies ZERO conventions on Symfony — 89,174 scopes, 94 packages, `"conventions": []`

**Status:** FIXED — three diseases fixed: shallow-clone gate now keys on visible-window vs freshDays (054a), PHP #[ sigil recognized (054b), history state streamed record-by-record with loud failure on read/save (055)
Three clones (shallow, ~80k shallow-marked, full) all give `total: 0` for every package. Not a history artifact.
Proof it is not "nothing to learn": `rules` DOES cluster 8 sibling Command classes sharing
`#[AsCommand(name,description)] final class X extends Command` — then labels it *"descriptive only — check has no
cell for a template's shape, so a member breaking it is never flagged."* Planted `SecretsFooCommand.php` omitting
`#[AsCommand]` (all ~30 peers carry it): `check` → "governed by 0 convention(s)". Attributes are seen, clustered,
never enforced. `selftest` then reports 0/0 — vacuous.
**Establish:** why acceptance yields nothing at this scale (idxCost over 89k scopes? neff? the template path not
feeding `check`?). This is the engine's core claim failing on the largest repo tested. Measure before touching λ.


## Measurement result (2026-09-01, Opus; full analysis in log.md, 245 lines)

**Disease 1 — the history fail-closed gate fires on ANY shallow clone regardless of depth.** It kills 14,674
cells that had ALREADY cleared bits>0 and the λ bound. Forcing survival: **0 → 1,446 conventions**. This is
the actual cause of `"conventions": []` on the shallow and ~80k clones. → **054a** (fix: the gate must key on
whether history is actually needed/available for the cell, not on the clone being marked shallow).

**Disease 2 — PHP `#[Attr]` attributes are never extracted.** `extractScopes`' sigil test is `/^[@[]/` — it
accepts `@` and `[`, not `#[`. Symfony's model holds **zero `auto.deco:` predicates against 6,305 attributes**.
Widening the sigil to `#[` makes the ticket's planted `#[AsCommand]` case enforceable (0 → 37 attribute facts).
→ **054b** (a sigil, same category as `@`/`[`, not a language name).

**Disease 3 — the full clone does not "return 0", it crashes** at `history.mjs:270` on `JSON.stringify` over
V8's string length cap. → root cause of **055**; the crash is being swallowed, which is the silent-death symptom.

Caveat from the measuring agent: another agent rebuilt the `petclinic` fixture store mid-investigation with the
older 0.2.1/g24/m15 engine (wrong worktree base — see loop-v2 §5 first-action rule). None of 054's numbers
use it, but that store is now version-inconsistent for anyone else measuring against it. Rebuild before use.
