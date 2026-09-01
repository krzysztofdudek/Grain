# 047 · A deviant is pushed out of the group that would have judged it — by the very feature it deviates on

**Status:** MEASURED (Opus, 2026-09-01; log.md) — GENERAL, CONTAINED, leave-one-feature-out REJECTED on evidence. DIRECTOR DECISION: ship the disclosure (queued as fix/047, Sonnet), gated on a measured fire rate on clean new files — the 018/037 standard (18.6% was rejected, 1.58% shipped).

**Measured:**
- General across 5 languages, similarity with→without marker vs floor 0.35: Java `@Test` 0.824→0.647, Python `extends MethodView` 0.905→0.429, Solidity `@onlyOwner` 0.800→0.250, C# `extends IRequestHandler` 0.778→0.444, TypeScript `@Inject` 0.714→0.333.
- **The real shape: the identical omission is caught 95% on code already indexed, 21% on code just written.** Sticky assignment protects indexed scopes; new code is placed by the similarity the omission just destroyed. `check` fails precisely in its primary use case.
- Three exclusion modes, not one: reassigned 8, below-floor 4, ambiguity-gap collapsed 3 → **no floor adjustment fixes two thirds of it.**
- Cost: 80 of 269 role-scoped certified facts (29.7%) have a member a clean omission would expel; 36 (13.4%) would lose every member.
- Containment holds and is tighter than assumed: directory and partition-wide facts provably immune (role 7→1, dir 0→0, partition 1→1); every role fact on a surface outside the clustering bag immune.
- 100% case demonstrated (`contracts/mocks` `@onlyOwner`, share 1.00 of 10), separate from the 60% mixed reading.
- Leave-one-feature-out: built and measured. Cost nil; +4 genuine catches vs **+42 findings on untouched code, 0 genuine among them** (source read for every family). Rejected.

**Approved change (disclosure, class D):** in `checkFile`'s below-floor branch, name the nearest certifying group and what it requires — information the engine already computes and withholds exactly where exclusion is worst. Acceptance: (1) the planted omissions in all five languages surface the requirement; (2) **fire rate on clean, conforming new files measured on ≥3 repos and reported** — if it is 018-class (double digits), narrow it before shipping; (3) directory-level catches unchanged; (4) tests per language.
**Found by:** fix-040-043 agent, measuring why OZ's planted function stayed unflagged after modifiers became visible, 2026-09-01
**Severity:** HIGH — structural: it limits what `check`/`review` can ever catch, in every language

## The observation

After §043 made Solidity modifiers extractable, `onlyOwner` became a certified convention (`where onlyOwner` →
"annotated with @onlyOwner — 100% of 10, held since 2023-10"). The planted `emergencyTransferOwnership` — a
public state-mutating function with the modifier omitted — **still is not flagged**, and this is no longer an
extraction gap.

The measurement, on a function planted where the convention certifies:

| variant | similarity to the group | group floor |
|---|---|---|
| WITH `onlyOwner` | **0.83** | 0.35 |
| WITHOUT `onlyOwner` | **0.33** | 0.35 |

The member that omits the feature falls below the floor and **leaves the group**. The population that would have
judged it no longer contains it, so there is nothing to deviate from.

Reported as general to role clustering, not Solidity-specific. That claim is the thing to verify first.

## Why this is structural

Deviation detection assumes the deviant is a member of the population whose norm it violates. Role clustering
assigns membership by feature similarity — including the feature under test. So the more cleanly a member
violates a convention, the more likely it is excluded from the group that certifies it. The mechanism works
against the tool's purpose, and it gets *worse* as a convention gets stronger.

Note what saves it in practice today: where a fact certifies at **directory** level rather than role level, the
deviation IS caught — a fixture proves `check` → "1 known deviation", `review` → "1 finding". So the defect is
confined to role-scoped facts, whose membership is similarity-based. That containment is the first thing to
confirm or refute.

Second-order note: OZ's own certification is 60% (`share 0.60 n 5`), because internal `_transferOwnership`
helpers legitimately omit the modifier. So part of what looks like a miss is an honest reading of a genuinely
mixed population — separate that from the exclusion effect before attributing anything.

## What must NOT be done

**Do not add a threshold**, do not lower the group floor, and do not special-case "the feature under test".
Six tuned thresholds were deliberately collapsed into `CFG.lambda`; a new constant contradicts the constitution
and would be tuned against the very examples it was invented for. The fix-043 agent measured this, added
nothing, and reported it — that was the correct response.

## What to establish

1. **Is it general?** Reproduce on ≥3 languages with role-scoped decorator/annotation conventions (Java, Python,
   C#). Measure the same before/after similarity for a planted omission. If it only bites Solidity, the ticket is
   much smaller.
2. **How much does it cost?** Over a corpus, how many real deviations are unreachable because the deviant leaves
   its group? This is the number that decides whether anything is worth doing.
3. **Is the directory-level containment real?** Confirm that role-scoped facts are the only affected kind.
4. Only then: is there a principled formulation — e.g. judging a candidate against the group it would join
   *without* the feature under test — that introduces no constant? A leave-one-feature-out assignment is the
   obvious candidate; whether it is affordable and whether it stays honest are open.

## Acceptance

A measured answer to (1)–(3) and a recorded decision. A well-evidenced "this is a bounded limitation, disclosed"
is a first-class outcome — §008, §031, §016(3) and one gate in §037 all shipped that way this release.
