# Command reachability — why 13 of 18 commands are never called

**Ticket 081.** trial-0.4.0 §6 asked for this before a 17th command is built: `obligation` was invoked
**zero** times in the 0.4.0 trial, alongside `what`, `completeness`, `review` and `spectrum`. This
document measures *reach* — advertised where, invoked how often, at what point in the run — over every
agent transcript on disk, and tests the ticket's three hypotheses against it.

**Answer in one line: an agent calls what the SessionStart text names, and nothing else — 0 of 63 calls,
across 36 runs, went to a command absent from both the SessionStart text and the SKILL description.**

Two things the ticket assumed turn out to be wrong, and both change the recommendation. The pre-write
hook `obligation` supposedly needs **already exists and already fired** at all 8 file-creation events in
the 0.4.0 trial. And `obligation` would have had nothing to say at any of them.

---

## 1. What counts as an advertisement, measured

Five surfaces name commands. Only the first two are read by an agent that never asks.

| surface | when an agent sees it | commands named |
|---|---|---|
| `sessionContext()` (SessionStart hook) | injected into every session, unbidden | **4** in the fixed body: `where`, `check`, `status`, `report`; `refresh` and `seed list` appear only in conditional lines |
| `SKILL.md` frontmatter `description` | the skill-listing line | **4**: `where`, `how`, `what`, `check` |
| `SKILL.md` body (214 lines) | only if the skill is opened | 17 of 18 — **`obligation` absent entirely** |
| `commands/*.md` (18 files) | only when a human types `/grain:<cmd>` | 18 |
| `USAGE` | only on `grain help`, no args, or an unknown command | 16 |

The SessionStart text is 8 lines; 3 are command lines:

```
1  grain is available here: a convention oracle mined from this repo's code and git history. …
2    grain where <intent words>   — before creating a source file or when unsure where something belongs; …
3    grain check <file>           — after you wrote or edited a file: deviations IN YOUR CHANGE …
4    grain status | report        — size, freshness, top conventions. …
5  Index: ready: 1130 files, 183 groups, 0 conventions …
6  Architecture (measured): 20 modules, 5 dependencies, 0 cycle(s) … `grain report` prints the graph.
7  map: concepts: …
8  changes: …
```

**12 of 18 dispatcher commands appear nowhere in it.** `obligation` appears in exactly one markdown file
in the entire plugin — `commands/obligation.md`, its own slash-command definition. It is named in no
surface an autonomous agent reads. `completeness` is named once, at SKILL.md line 207 of 214.

Note line 2: `where` is advertised with the trigger **"before creating a source file"** — which is
`obligation`'s own natural moment. `where` already owns it.

---

## 2. The reachability table

**Corpus.** Every agent transcript on disk: 23 pre-0.4.0 runs / 46 transcripts (`.temp/stress/trials/`,
Aug 23–26) plus the 13 runs of the 0.4.0 trial (7 with-arms). 63 agent-chosen CLI calls in total. Hook
invocations are excluded — they are not choices the agent made.

| command | in SessionStart | in SKILL desc | SKILL body line | pre-0.4.0 | 0.4.0 | **total** | when in the run |
|---|---|---|---|---|---|---|---|
| `where` | **line 2** | yes | 3 | 22 | 9 | **31** | early — median position 0.009; 12 of 17 runs called it at index 0 or 1 |
| `check` | **line 3** | yes | 3 | 22 | 7 | **29** | late — median 0.935; 19 of 22 past the two-thirds mark |
| `status` | line 4 (bundled) | no | 166 | 0 | 1 | **1** | mid (index 28 of 144) |
| `how` | absent | yes | 3 | 0 | 1 | **1** | mid (index 27 of 53) |
| `what` | absent | yes | 3 | 0 | 1 | **1** | mid (index 30 of 144) |
| `report` | line 4 (bundled) | no | 49 | 0 | 0 | **0** | — |
| `map` | absent | no | 54 | 0 | 0 | **0** | — |
| `review` | absent | no | 37 | 0 | 0 | **0** | — |
| `rules` | absent | no | 49 | 0 | 0 | **0** | — |
| `decide` | absent | no | 170 | 0 | 0 | **0** | — |
| `export` | absent | no | 185 | 0 | 0 | **0** | — |
| `seed` | conditional | no | 190 | 0 | 0 | **0** | — |
| `explain` | absent | no | 195 | 0 | 0 | **0** | — |
| `spectrum` | absent | no | 197 | 0 | 0 | **0** | — |
| `selftest` | absent | no | 198 | 0 | 0 | **0** | — |
| `refresh` | conditional | no | 206 | 0 | 0 | **0** | — |
| `completeness` | absent | no | **207** | 0 | 0 | **0** | — |
| `obligation` | absent | no | **ABSENT** | 0 | 0 | **0** | — |

### The law

- **61 of 63 calls (96.8%)** went to a command named in the SessionStart command block.
- **2 of 63** went to a command named only in the SKILL description (`how`, `what` — once each, both
  mid-run, both in the 0.4.0 era).
- **0 of 63** went to any of the 11 commands named in neither.

Position is bimodal and stable across both eras: `where` opens the run, `check` closes it, and nothing
is asked in between. That is the shape the question-catalog already recorded over 19 runs (§4:
*"`where` to orient, `check` to validate, nothing in between"*) and it did not change.

### 0.4.0 per-run detail

| run | arm | tools | grain calls (subcommand@index) | files created |
|---|---|---|---|---|
| ca-constants | with | 37 | `where`@0 `where`@13 `check`@27 | 2 |
| ca-paging | with | 18 | `where`@3 `check`@17 | 1 |
| express-append | with | 28 | `where`@0 | 1 |
| express-hostname | with | 42 | `where`@0 | 1 |
| flask-session | with | 47 | `where`@1 | 0 |
| flask-typing | with | 53 | `where`@0 `how`@27 `check`@52 | 0 |
| replay-4104e8c4 | with | 144 | `status`@28 `where`@29 `what`@30 `where`@34 `check`@140–143 | 3 |
| (all 6 without-arms) | without | 230 | none | 6 |

The advertisement was delivered in **7 of 7** with-arms (the literal text appears in every transcript)
and in 0 of 6 without-arms. Adoption is not the constraint; the roster is.

---

## 3. The three hypotheses

### H1 — "the advertisement leads with `where`/`check` and buries the other 14" — **CONFIRMED, and understated**

Not buried: **absent**. 12 of 18 commands are named nowhere in the SessionStart text, and `obligation`
is named in no agent-readable surface at all. The correlation between advertisement and invocation is
near-total (§2), so this is the binding constraint on *which* commands get called.

### H2 — "`obligation`'s trigger never fires because a plain `Write` has no pre-step" — **REFUTED, twice**

**The pre-step exists.** `hooks.json` registers `PreToolUse` on `Write` → `grain.mjs check-hook --pre`.
It ran at every file creation in the trial. Proof is grain's own state, written mid-run into each
with-arm's `.grain/cache/`: `hook-seen.json`, `placement-pending.json` and (in one run)
`placement-outcomes.json`. Aggregate across the 7 with-arms:

| hook namespace | notes spoken |
|---|---|
| `check:` (PostToolUse findings + PreToolUse placement) | 13 |
| `cochange:` | 5 |
| `read:` | 7 |
| **total push notes delivered** | **25** |

What the hook does *not* do is compute `obligation`. On `opts.pre` it evaluates `placementHit()` only,
and its call-to-action names `grain where`, never `grain obligation` — so at the creation moment both
the pull text (§1, line 2) and the push note point at the same already-dominant command.

**And wiring `obligation` in would have changed nothing.** Asking the frozen with-arm models what
`obligation <path>` would have answered at each of the 8 paths the with-arms actually created:

| run | created path | `obligation` would have said |
|---|---|---|
| ca-constants | `src/Application/Common/Constants/Policies.cs` | *nothing certifies as a specific obligation* (16 births) |
| ca-constants | `src/Application/Common/Constants/Roles.cs` | *nothing certifies* (16 births) |
| ca-paging | `tests/…/PaginatedListTests.cs` | *nothing certifies* (5 births) |
| express-append | `test/res.append.js` | *no recorded births … nothing to certify* |
| express-hostname | `test/req.hostname.js` | *no recorded births … nothing to certify* |
| replay-4104e8c4 | `apps/e2e/tests/…/a-non-admin-gets-no-admin-pill….spec.ts` | *nothing certifies* (14 births) |
| replay-4104e8c4 | `apps/e2e/tests/…/an-admin-gets-a-third-header-pill….spec.ts` | *nothing certifies* (14 births) |
| replay-4104e8c4 | `apps/frontend/…/BriefWorkspace.test.tsx` | *nothing certifies* (3 births) |

**0 of 8.** This is consistent with the capability's own design measurement
(`obligations-design.md` §3: coverage 0.096, 6 of 20 repos fire) and with its instrument run against
Grain itself: `grain selftest --obligation` reports `n 86, coverage 0` — 86 birth events, zero certified
rules. `obligation`'s zero invocation count is not, on this corpus, costing anyone an answer.

### H3 — "sub-agents receive a different or no advertisement" — **CONFIRMED on 0.4.0 data**

| | 0.4.0 trial |
|---|---|
| `Agent` spawns | 4 (2 with-arms, 2 without-arms) |
| tool calls made **inside** sub-agents | **98** of 599 (16.4%) |
| grain calls made inside a sub-agent | **0** |

The largest instance is `replay-4104e8c4`'s `Explore` sub-agent: **48 inner calls, 43 of them locate work**
(Read 23, Grep 10, Glob 10) — exactly the work `where` answers — in the same run whose *parent* called
grain 8 times. The parent knew; the delegate did not.

**The root cause differs from 067's.** 067 documented that the built-in `Explore` agent skips CLAUDE.md
by design. But grain does not advertise through CLAUDE.md — it advertises through SessionStart
`additionalContext`, which is parent-session context. A sub-agent runs in its own context and does not
inherit it. Fixing CLAUDE.md loading would not close this gap; 067's "bounded limitation" ruling was
right about the outcome and wrong about the mechanism.

---

## 4. The push channel was never measured, and it is where grain was right

The trial extractor reads the `stream-json` transcript. That transcript contains hook records for
**SessionStart only** — no `PreToolUse` or `PostToolUse` record appears in it at all. So the trial
counted 19 pull-channel calls and **0 of the 25 push notes** in §3. Grain's own feedback loop, which
does record them, was never read.

In `replay-4104e8c4` it recorded this:

```
placement-outcomes.json   {"followed":0,"deviated":2}
check-outcomes.json       {"acted":0,"ignored":1,"byFact":{…"auto.call:expect":1}}
```

The placement hook fired **twice** and said, both times:

```
[grain] placement: `*.spec.ts` files named like `admin` live in `apps/e2e/tests/admin-panel/`
— 9 of 13; `apps/e2e/tests/onboarding-and-navigation/` holds none.
Deliberate placement is fine — but if you guessed, ask `grain where admin spec` first.
```

The historical commit `4104e8c4` put its two e2e specs in **`apps/e2e/tests/admin-panel/`**. Grain named
the author's own directory, unbidden, before the write, and was **followed 0 of 2**.

trial-0.4.0 §3 records this miss as *"the exact miss the previous trial documented, unchanged."* It is
unchanged in outcome, but grain was **not silent** — it was correct and overridden. Placement fired at 2
of 8 creation events (25%); at the other 6, `placementHit` returned null.

---

## 5. Recommendation

### 5.1 The instrument (primary — this is what gates a 17th command)

The harness must read both channels. After each with-arm run, read from `<with-repo>/.grain/cache/`:

| file | yields |
|---|---|
| `hook-seen.json` | notes spoken, by hook namespace (`check:` / `cochange:` / `read:` / `how:` / `commit:`) |
| `placement-outcomes.json` | `{followed, deviated}` — the only follow-rate grain produces |
| `check-outcomes.json` | `{acted, ignored, byFact}` |

These files already exist, are already written, and already carry the numbers. It is ~10 lines in
`metrics040.py` and it doubles the observable surface. Without it every future trial repeats this one's
blind spot and will keep reporting "grain was silent" where grain in fact spoke and was overridden.

### 5.2 The gate on a 17th command

Not *"is it advertised"* but **"does it certify an answer often enough to deserve one of the three
advertisement slots"**, measured by its own `selftest` before it is advertised. Applied now:

- **`obligation` — do not advertise yet.** Coverage 0.096 corpus-wide, 6 of 20 repos, 0 of 86 birth
  events on Grain itself, 0 of 8 on the trial's real creation events. Advertising it would spend a slot
  on a command that answers *"nothing certifies"* roughly nine times in ten — and the question-catalog
  documents that exact failure as what destroys a session's trust (§4: `where` returned `no lexical
  match` on its first call in two runs; *"neither run called `where` again"*).
- **`completeness` — same verdict, same reason.** Catalog §3.2: it answers for 6–17% of files and for 1
  of the 45 hottest. Fix the answer before buying the reach.

The ordering follows: **make the command certify, then advertise it.** Reach bought ahead of an answer
is spent trust.

### 5.3 The one change the evidence positively supports

Not a new advertisement line — the wording of the note that already fires at the creation moment and was
already right. It ends `Deliberate placement is fine — but if you guessed, ask \`grain where admin spec\`
first.`: a hedge that offers an easy out, plus a redirect to a second command, when the correct
directory (`apps/e2e/tests/admin-panel/`, 9 of 13) was already in the note's own first sentence.

**n = 2. That is far too small to ship a rewording on**, which is exactly why 5.1 comes first:
`placement-outcomes.json` measures follow rate directly, so once the harness reads it a wording change
becomes a cheap, decidable A/B instead of a guess.

### 5.4 Sub-agent reach

Real (43 blind locate calls in one run) and **out of scope for a text change** — SessionStart
`additionalContext` cannot reach a context grain does not author. Its own ticket, and it should carry
the §5.1 instrument with it, since a sub-agent's inner calls are already visible in the transcript via
`parent_tool_use_id` and can be counted without any new machinery.

---

## 6. How to verify a shipped change

Do not re-run the full trial ($10.47). Re-run **one arm of one scenario**: `replay-4104e8c4`, with-arm
only (its without-arm already exists) — ~$3.23, ~11 minutes, via `h040/pair.sh`. It is the only scenario
in the corpus where placement is genuinely non-obvious and where the truth commit disagrees with what
every arm produced.

Pass/fail is mechanical and needs no reading:

1. `placement-outcomes.json` shows `followed ≥ 1` where it is currently `{"followed":0,"deviated":2}`.
2. The created `*.spec.ts` files land under `apps/e2e/tests/admin-panel/` — the truth commit's own
   directory — instead of `apps/e2e/tests/onboarding-and-navigation/`.

Both come from files on disk after the run, so the check is a `diff`, not a judgement.

---

## 7. Threats to validity

1. **n = 2 on the only follow-rate we have.** Every claim in §4 about *why* the placement note was
   ignored is unsupported; only *that* it was ignored is measured.
2. **`obligation`'s 0-of-8 is corpus-bound.** Four repos, none of them among the 6 of 20 that produce
   obligation rules. It says the command would not have helped *here*, not that it never helps.
3. **Hook state is a lower bound on notes spoken.** `hook-seen.json` keeps the latest signature per key,
   not a history, so a note repeated after its TTL counts once. 25 is a floor.
4. **Position data mixes eras.** The `where`-early/`check`-late medians pool pre-0.4.0 and 0.4.0 runs;
   the shape is identical in both, which is why they are pooled, but they are not independent samples.
5. **`--allowedTools` did not list `Agent`, yet 4 spawns occurred.** Sub-agent availability in the
   harness is therefore not controlled, and H3's 4 spawns are an uncontrolled sample.
