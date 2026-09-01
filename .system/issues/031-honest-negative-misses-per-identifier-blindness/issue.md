# 031 · The honest-negative disclosure only covers zero-scope FILES, not per-identifier invisibility

**Status:** RESOLVED — measured unreachable by any evidence-based rule; boundary recorded in docs/validation.md
**Found by:** round 3, Ruby/sinatra, 2026-09-01
**Severity:** medium-high — the disclosure's claim is narrower than a reader will assume

## Symptom

Sinatra's core settings (`views`, `root`, `environment`, and every `set :x` value) exist ONLY via
`define_singleton` → `define_method` / `class_eval` in `base.rb`. There is no literal `def views` anywhere.

- `grain what views` → only string-literal hits, no method, **no disclaimer**.
- `grain what environment` → **actively wrong**: presented sinatra-contrib's unrelated `environment_keys?` /
  `from_environment_key` and a `test/integration_helper.rb` `environment` method as "what it is", never
  mentioning `base.rb`, the concept's actual home. No disclaimer.

The tester read the source and identified the boundary precisely: the honest-negative mechanism
(`core.mjs` ~3037, *"Grain cannot see inside it"*) fires only when a whole file parses to **zero** scopes. A file
that parses fine, but where a specific identifier is a runtime product of metaprogramming, gets nothing.

## Relationship to 018 and 014 — same family, third boundary

- **018 Phase 1 (fixed)** — whole file parses to zero scopes (Rust macros). Covered.
- **014 (open)** — a declaration category never extracted, in a file with other real scopes (Go const/var).
  Not covered by 018; being fixed as extraction work.
- **031 (this)** — the identifier never exists in the tree at all because it is generated at runtime, in a file
  full of real scopes. Not covered by either, and **not fixable by extraction** — no syntax tree contains it.

031 is the case where extraction genuinely cannot win, which makes disclosure the only available answer.

## The harder half: the answer was WRONG, not just silent

`what environment` did not merely fail to mention `base.rb` — it presented unrelated symbols as the answer. Note
this is *consistent with* the `coversQt` rule fixed in 002 (all query tokens must be covered by the candidate):
for a SINGLE-token query, that degrades to "any symbol containing this token matches", so `environment_keys?`
legitimately matches `environment`.

So there are two separable defects here, and they should not be conflated:
1. **No disclosure** that the concept may live in metaprogrammed code grain cannot see.
2. **Ranking/presentation**: a single-token query surfaces incidental token-containers as though they were the
   concept's home. That is arguably correct matching presented as a wrong answer — related to 012's
   `where`/`what` reachability question.

## What is plausibly cheap

Grain cannot know an identifier is metaprogrammed. But it can know a file contains metaprogramming *constructs*
whose node types it can see (a dynamic-definition call is a real node even when its product is not) — and it
already derives such things from `node-types.json` rather than language name lists. Whether a useful signal exists
here is an open question worth measuring before designing; do not assume it does.

If nothing reliable is derivable, the honest fallback is to state the boundary in `docs/validation.md`'s Known
boundaries register, as was done for the near-member limit in 003.

## Acceptance

Either `what <a metaprogrammed identifier>` discloses that the concept may be defined dynamically, or the
limitation is recorded in Known boundaries — and either way, the single-token-match presentation problem is
separated out and tracked (here or with 012), not silently bundled in.

---

## Work log — 2026-09-01 (fix-031-037-039) — **CLOSED: recorded as a Known boundary, not fixed**

Dispatched together with 037 and 039 on the hypothesis that one rule would close all three. It does not. 037 and
039 are fixed; **031 is unreachable**, and this is the measured reason rather than a judgement call.

### Every signal the disclosure mechanism runs on is absent here, by construction

Measured directly against sinatra's live model:

- **`lib/sinatra/base.rb` is not a blind file.** It parses to real scopes — plenty of them. The 018 mechanism only
  ever names files that yielded *zero* scopes, so the concept's actual home is invisible to it.
- **`environment` and `views` appear verbatim in zero blind files** (of sinatra's 44). There is nothing for a
  bounded re-scan to find.
- **Both queries have a genuine exact-name match.** `what environment` returns a real method literally named
  `environment` at `test/integration_helper.rb:32`; `what views` returns an exact value hit. Any rule gated on
  "no exact-name match" — which 037's shipped rule is, and must be — excludes them deliberately. That gate is not
  an accident to route around: an exact hit is precisely the case where grain *did* find something carrying the
  name.

So this is not "the rule needs widening". Widening it to fire here would mean firing when there is no evidence at
all, which is the 018 over-hedge the cross-check oracle already rejected once.

### The ticket's own proposed fallback, measured

The issue suggests flagging files that contain metaprogramming *constructs* whose node types grain can see, and
explicitly says to measure before designing. Measured, with a deliberately generous language-spanning probe
(`define_method`, `define_singleton_method`, `class_eval`, `instance_eval`, `attr_accessor`, `method_missing`,
`__getattr__`, `Object.defineProperty`, `Proxy(`, `eval(`, `getattr(`, `Reflect.`, `macro_rules!`):

| repo | parsed files | contain a dynamic-definition construct |
| --- | --- | --- |
| sinatra | 113 | 29 (26%) |
| flask | 66 | 16 (24%) |
| gin | 96 | 13 (14%) |
| okhttp | 637 | 27 (4%) |
| express | 132 | 3 (2%) |
| axum, Slim, CleanArchitecture, spring-petclinic | 293–46 | 0 (0%) |

On the one repository where the defect actually lives the signal fires on **a quarter of all parsed files**, and it
says nothing about *which identifier* is generated. A disclosure reading "the concept may be defined dynamically in
one of these 29 files" is not a disclosure, it is a shrug. Pointing at `base.rb` specifically would require knowing
that `set :environment, …` produces a method named `environment` — Ruby semantics, not a syntax tree.

### Outcome

Recorded in `docs/validation.md`'s Known boundaries register, the same disposition 003 took for the near-member
limit, with the measurements above so a future reader does not re-derive them.

### The second half is untouched, as instructed

The ranking/presentation defect — a single-token query surfacing incidental token-containers (`environment_keys?`)
as though they were the concept's home — was explicitly out of scope and nothing here touches it. It remains open
and belongs with 012. Worth noting that 037's shipped rule *depends* on that behavior being left alone: the
≥2-token condition exists precisely because single-token matching is known-loose, and it sidesteps rather than
fixes it.
