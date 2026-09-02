# Did 0.4.0 move the number that matters? — a paired trial

**Question.** The north star is an agent that works faster, cheaper and better *with* grain than without.
The only measurement so far was negative and predated every change of the last 36 hours: in 19 paired runs
agents used 2 of 16 commands, 5 runs never touched grain, and no observed case existed of a grain answer
changing a diff. Wave 2 changed `completeness`, `used by`, `what`, `how`, `where`'s named stratum, the
advertisement (067) and added `obligation`. **Did any of it move mean tool calls before the first write?**

**Answer, in one line: adoption was fixed and reach was not.** Grain went from consulted in 1 of 6 prior
with-arm runs to consulted in every run of this trial — and the pre-write tool-call count did not fall.

---

## 1. Design

Paired, same task, same repo, same worker model (Sonnet), same turn budget, two arms:

- **with** — the 0.4.0 plugin loaded (`--plugin-dir`), hooks on, index pre-built before the clock starts,
  so index-build time never enters a measurement.
- **without** — no plugin, `.grain/` removed.

Both arms get a byte-identical prompt and an identical `--allowedTools` set. Each arm is a fresh clone of
the source repository, **frozen at the replayed commit's parent**, with every other ref deleted so the
commit being reproduced — and everything after it — is unreachable to grain's history walk. The task is the
commit's intent restated in product language, with no path, filename or directory named, so neither arm can
read the answer out of the prompt.

### What is measured, and how

Everything is extracted from the `stream-json` transcript mechanically; nothing is scored by reading.

| metric | definition |
|---|---|
| **pre-write tool calls** | every `tool_use` before the first `Write`/`Edit`. The catalog metric. |
| total tool calls | all `tool_use` in the run |
| grain invocations | Bash commands containing `grain.mjs`, with the subcommand parsed |
| **answer-changed-behaviour** | a repo path appearing in a grain *answer* is `Read`/`Edit`/`Write`n **later** in the same run |
| **answer-changed-diff** | a path grain named that the with-arm's final diff touches **and the without-arm's does not** |
| placement correctness | files each arm touched ∩ files the historical commit touched |

The prior harness (`tests/stress/agent-trial.sh`) was reused, not rebuilt. It was extended in three
places, all under `.temp/` (untracked): freezing a clone at a commit's parent, a parametrised turn budget,
and a new extractor that counts *all* tool calls before the first write (the committed one counts only
read-shaped ones) and resolves each grain answer to the paths it names. The extractor was validated by
re-running it over a prior trial's transcripts: it reproduces that trial's cost, turns and per-tool counts
exactly.

### Corpus

Network access is blocked in this environment, so the corpus is the set of clones already on disk. That
ruled out petclinic, telescope.nvim and leveldb. Three public repositories with deep real history were
used, two tasks each, plus one same-task re-run on a private repository:

| repo | language | commits | tasks |
|---|---|---|---|
| express | JavaScript | 6163 | `f6f78e5f` res.append, `e6eeec3f` req.hostname |
| flask | Python | 5556 | `01621485` session ordering, `3351a867` errorhandler typing |
| CleanArchitecture | C# | 937 | `0c929505` centralise constants, `1c2ef456` paging boundary |
| the private replay repository | TypeScript | 332 | `4104e8c4` — with-arm only (see §3) |

### The null, and why the old numbers cannot be compared across tasks

Two nulls are available. The first is the without-arm of each pair — the only fair one, because it holds
task, repo and model fixed. The second is the with-arm's own numbers from the pre-0.4.0 replay trials,
re-extracted here with the *same* extractor so the definitions match.

That second null turns out to matter more as a **measurement of noise** than as a baseline. Across the six
pre-0.4.0 with-arms grain was called **once in total** — it was, in effect, not used. Any paired difference
in those runs is therefore run-to-run variance and nothing else:

| | pre-write, with | pre-write, without | paired delta |
|---|---|---|---|
| the six pre-0.4.0 replay arms | 66, 119, 136, 89, 73, 49 | 125, 74, 123, 101, 104, 133 | −59, +45, +13, −12, −31, −84 |
| | mean 88.7 | mean 110.0 | **mean −21.3, sd 47.1** |

So when grain was demonstrably *not being consulted*, the with-arm still came out 21 calls cheaper on
average, with a standard deviation of 47. **That −21 is noise.** It is a caution against reading any single
paired difference in this metric as an effect, and it is why the numbers below are reported with their
dispersion rather than as a headline mean. It is also why the catalog's "39 overall / 99 on realistic tasks"
cannot be compared with a number from a different repository: pre-write call counts are dominated by how
large and how open-ended the task is.

---

## 2. Finding 1 — adoption is fixed

This is the unambiguous positive, and it is a large change.

| | pre-0.4.0 (6 with-arms) | 0.4.0 (6 with-arms) |
|---|---|---|
| runs that called grain at least once | **1 of 6** | **6 of 6** |
| total CLI invocations | **1** | **11** |
| distinct commands used | 1 (`where`) | 3 (`where` ×6, `check` ×3, `how` ×1) |
| runs where grain was the *first* tool call | 0 | 2 |

The seventh with-arm — the `4104e8c4` re-run in §3 — adds 8 more calls on its own, and is the first run
in the programme to reach `what` and `status`.

Whatever 067 changed about the advertisement, it worked. The agent no longer has to be told twice that grain
exists, and in two runs `grain where` was the very first thing it did, before any file was opened.

Two qualifications keep this honest. **Breadth barely moved**: 3 of 16 commands across the six paired
runs, 5 of 16 counting the seventh — against 2 of 16 before.
`obligation <path>` — built in this wave specifically so the agent could ask what a change owes — was
**never invoked in any of the 13 runs**, and neither were `completeness`, `review` or `spectrum`. `what` and
`status` were reached exactly once each, both in the single largest run. And adoption is not the same as
usefulness, which is the next two findings.

---

## 3. Finding 2 — the number that matters did not move

### Per-run table

Pre-write = every tool call before the first `Write`/`Edit`. Delta is with − without, so **negative is
grain winning**. "Truth files hit" counts files the arm touched that the historical commit also touched.

| pair | lang | pre-write with | pre-write w/o | delta | total with | total w/o | grain calls (cmds) | answers acted on | answer-changed-diff | truth hit with / w/o |
|---|---|---|---|---|---|---|---|---|---|---|
| `0c929505` ca-constants | C# | 17 | 26 | **−9** | 37 | 44 | 3 (`where`×2, `check`) | 0 | 0 | 4/6 vs 4/6 |
| `1c2ef456` ca-paging | C# | 10 | 9 | +1 | 18 | 18 | 2 (`where`, `check`) | 1 | 0 | 2/2 vs 2/2 |
| `f6f78e5f` express-append | JS | 9 | 7 | +2 | 28 | 24 | 1 (`where`) | 1 | 0 | 3/3 vs 3/3 |
| `e6eeec3f` express-hostname | JS | 21 | 9 | **+12** | 42 | 33 | 1 (`where`) | 0 | 0 | 3/3 vs 3/3 |
| `01621485` flask-session | Py | 3 | 4 | −1 | 47 | 47 | 1 (`where`) | 1 | 0 | 2/3 vs 2/3 |
| `3351a867` flask-typing | Py | 43 | 44 | −1 | 53 | 64 | 3 (`where`, `how`, `check`) | 0 | 0 | **0/4 vs 2/4** |

### The paired delta

```
with     17, 10,  9, 21,  3, 43     mean 17.2   median 13.5
without  26,  9,  7,  9,  4, 44     mean 16.5   median  9.0
delta    -9, +1, +2, +12, -1, -1    mean +0.7   median 0.0   sd 6.8   se 2.8
```

**The mean paired delta is +0.7 tool calls — 0.24 standard errors from zero.** Grain's arm was cheaper in
3 of 6 pairs and more expensive in 3 of 6: a coin flip. Cost tracked the same way ($3.66 with vs $3.58
without, +2%), as did wall time (1269s vs 1157s, +10%). **The number that matters did not move.**

Sign, stated plainly: the point estimate is *positive*, i.e. slightly worse with grain. It is not
distinguishable from zero and should not be reported as a regression either — but nothing in this data
supports the claim that 0.4.0 made agents faster.

### Placement

Identical in 5 of 6 pairs — both arms hit exactly the same truth files, including both pairs where both
arms were wrong in the same way. The sixth pair, `3351a867`, went **against** grain: the with-arm produced
`tests/typing/typing_route.py` alone (0 of 4 truth files, and it never touched the source at all), while
the unaided arm produced `src/flask/typing.py`, `src/flask/scaffold.py` and `tests/typing/typing_errorhandler.py`
— 2 exact truth hits plus a one-underscore miss on the third. That run made 3 grain calls and acted on none.

### The same-task before/after — `4104e8c4`, the private replay repository

The one place where the *identical* task exists on both sides of the version boundary. Prior arms are from
the three earlier replay trials; all numbers re-extracted with this trial's extractor.

| | pre-write | grain calls | truth files hit | cost |
|---|---|---|---|---|
| pre-0.4.0 with (trial 1) | 119 | 0 | — | $2.73 |
| pre-0.4.0 with (trial 2) | 89 | 1 | — | $3.32 |
| pre-0.4.0 with (trial 3) | 49 | 0 | 4 | $2.80 |
| pre-0.4.0 **without** (trial 3) | 133 | 0 | 3 | $3.61 |
| **0.4.0 with** | **109** | **8** | **4** | $3.23 |

Adoption again jumps — 8 calls, and the first run in the whole programme to reach `what` and `status`.
Everything else is flat: 109 pre-write calls against a pre-0.4.0 with-arm mean of 86, and the same 4 truth
files as the best prior arm. Every arm in every trial, 0.4.0 included, still files the e2e specs under
`onboarding-and-navigation/` where the author used `admin-panel/` — the exact miss the previous trial
documented, unchanged.

This run also gives the trial's cleanest example of the gap between the two reach metrics. Two `where`
answers **did** change behaviour: grain named `AdminTabs.tsx` and `admin._index.tsx`, and the agent opened
both. Neither file appears in the final diff. The answers moved what the agent *read* and not what it
*wrote* — answer-changed-behaviour without answer-changed-diff.

---

## 4. Finding 3 — reach is zero, and here is every case, one by one

**There are no answer-changed-diff cases.** Not one file in any with-arm's final diff was there because
grain named it and the without-arm missed it. Since the brief asks for those cases quoted individually, what
follows is every occasion grain came closest, with its actual output.

An earlier version of this analysis reported one such case. It was an artefact of the measurement:
`grain check <file>` echoes the path you pass it, so the extractor credited grain with "naming" a file the
agent had itself just typed. Paths appearing in the invocation are now subtracted from the answer before
matching. **Corrected count: zero.**

### 4a. The one answer that changed behaviour and was right — `f6f78e5f`, express `res.append`

`grain where res.append header set` — its top two hits are irrelevant test file-cards; the load-bearing
line is the third-order co-change note:

```
map: «res.append header set» → file test/res.sendFile.js — 66 scopes (match 57%) · matching here: `res` …
map: «res.append header set» → file test/res.send.js — 55 scopes (match 57%) …
  historically co-changes with: lib/response.js (21/38 commits)
```

The agent opened `lib/response.js` next, and the run reproduced the historical commit exactly — all three
files, `History.md` included. **But so did the without-arm, in fewer calls (7 vs 9).** `res.*` → `response.js`
is inferable from the filename alone. Grain was right, was used, and changed nothing.

### 4b. The answer that was right, and was ignored — `0c929505`, CleanArchitecture constants

This is the one task where placement was genuinely non-obvious: the author created a new directory,
`src/Domain/Constants/`, and both arms had to decide which project shared constants belong in. Grain was
asked twice and hedged both times — correctly, as it turns out, because the directory does not yet exist and
so has no siblings to learn from:

```
no confident match for "authorization policy constants role name" — the best lexical hit scored 37%
but its words are covered by unrelated, disagreeing parts of the repo, so it is not trustworthy.
```

```
weak match: the best hit covers 34% of the query's weight — a hint, not an answer.
in: src/Domain/ValueObjects/ … map: → file src/Domain/ValueObjects/Colour.cs
in: src/Domain/Common/ …
```

The second answer does point into `src/Domain/`, which is where the author put the constants. The agent
ignored it and created `src/Application/Common/Constants/`. **So did the without-arm** — both arms scored
4 of 6 truth files, missing the same two. Grain's honesty machinery worked exactly as designed; the
hedged framing that made it honest also made it discountable, and the model had nothing certified to say
because the answer is a directory that does not exist yet.

### 4c. The answer that was wrong and cost time — `e6eeec3f`, express `req.hostname`

```
note: the top hit matches only «property» of your 3 words — verify before building on it.
map: «req.hostname property» → file test/res.render.js …
map: «req.hostname property» → group expose+should+app — 8 members …
  historically co-changes with: lib/response.js (11/14 commits)
```

The task concerns `lib/request.js`; grain's co-change line names `lib/response.js`. The agent did not act on
it — the disclosure line did its job — but the with-arm still spent **21** pre-write calls against the
without-arm's **9**, the largest gap in the trial and in the wrong direction.

### 4d. The empty confirmations — `check`

`check` was called three times and never produced a finding. Representative:

```
check src/Application/Common/Models/PaginatedList.cs — 3 scopes + file · governed by 4 convention(s)
· 0 deviation(s) in your change, 0 pre-existing
conforms to: package src/Application: types here are named PascalCase (100% of 54)
```

True, and empty — the case grain's own SKILL warns about ("zero deviations is not a review").

---

## 5. Threats to validity — stated, not buried

1. **The noise floor is wide relative to the effect.** §1 shows paired deltas of −84…+45 in runs where
   grain was not being called. Six pairs cannot resolve an effect smaller than that band. This trial can
   say "no large improvement" and "no reach"; it cannot say "no small improvement".
2. **Small n.** Six pairs, one run each. No repetitions, so per-pair numbers carry full run-to-run variance.
3. **Public repositories are in training data.** express, flask and CleanArchitecture commits predate the
   model cutoff, so the unaided arm may recall the real implementation. That biases *against* grain showing
   value — the without-arm is unusually strong. The private-repository task (§4) is the control for this.
4. **Task size.** These tasks are smaller than the catalog's "realistic" ones (2–6 files). Pre-write counts
   here are 3–43, not 99. A tool that pays off mainly on large, open-ended work would be under-measured.
5. **A harness blemish.** Both arms' working branch was named `grain-trial`, so the string "grain" appears
   in `git status` output in the without-arm too. No plugin, binary or advertisement was present there and
   every without-arm made zero grain calls, so capability did not leak — but the branch should be renamed
   for future runs.
6. **`where`'s query is the agent's, not ours.** The agent phrases its own intent. A weak query producing a
   weak answer is a real property of the deployed system, but it means these results measure grain *plus*
   the agent's querying, not grain alone.

---

## 6. For the director — one paragraph, and what the next wave should be about

**0.4.0 fixed adoption and did not move reach; the next wave should be about reach, and adoption should not
be spent on again.** The advertisement work (067) worked completely and can be considered done: grain went
from 1 CLI call across six pre-0.4.0 with-arms to 11 across six here, consulted in every single run, and the
first tool call of the run in two of them. Nothing downstream of that changed. Pre-write tool calls did not
fall; placement was identical to the unaided arm in every pair, including the two pairs where both arms were
wrong in the same way; and across six pairs there is **not one case** of a grain answer putting a file into
the diff that the without-arm missed. The three near-misses in §4 all say the same thing about why. First,
`where`'s answer is ranked wrongly for the job it is being asked to do: its top hits are lexically-matched
file cards that were irrelevant in every case observed, while the one line that actually moved an agent —
`historically co-changes with:` — sits underneath them as a subordinate note; in the single run where grain
demonstrably changed behaviour, that co-change line was the entire useful payload. Second, on the only task
where placement was genuinely hard — creating a directory that does not exist yet — grain correctly had
nothing certified to say, which is precisely the case where an agent cannot help itself and where the tool is
currently silent; this is the same structural blind spot the previous trial named, now confirmed on a second
language. Third, `obligation` was built this wave for exactly the completeness question these tasks pose and
was invoked **zero** times in eleven grain calls, alongside `what`, `completeness`, `review` and `spectrum` —
a command the agent never reaches for cannot help it, so command *reachability* is a measurement problem in
its own right and should be instrumented before anything new is added to the surface. Concretely, the
evidence supports three next steps: promote co-change above lexical file-cards in `where`'s output; give
`where` an answer for the new-directory case; and measure why 11 of 16 commands were never called once in
13 runs, before building a 17th.

---

## 7. Cost, and how to re-run this

13 worker runs: 6 pairs plus one with-arm-only re-run of `4104e8c4` (its pre-0.4.0 without-arm already
existed, so re-running it would have bought nothing).

| | with | without | total |
|---|---|---|---|
| the 6 paired runs | $3.66 / 1269s | $3.58 / 1157s | $7.24 / 40.4 min |
| `4104e8c4` with-arm | $3.23 / 662s | — | $3.23 / 11.0 min |
| **trial total** | | | **$10.47 / ~51 min of worker wall time** |

Six pairs ran concurrently, so real elapsed time was far below the sum.

One deliberate deviation from the brief: the runs were driven as parallel background invocations of the
harness rather than as `Agent`-tool sub-agents. The workers are still Sonnet (`--model sonnet`), but they
are `claude -p` subprocesses launched by the script, which is what keeps the two arms clean — a sub-agent
would inherit this session's own plugin and settings, and the without-arm would no longer be a without-arm.

The harness lives under `.temp/stress/h040/` (untracked), and is a thin extension of the committed
`tests/stress/agent-trial.sh` rather than a replacement:

- `trial040.sh` — clone, freeze at `<sha>^`, delete every other ref, run both arms, extract.
- `metrics040.py` — the extractor. Validated against a prior trial's transcript: it reproduces that
  trial's cost, turn count, per-tool counts and written-file list exactly (`regress.sh`, PASS).
- `analyse.py` / `table.py` — pair-level metrics and the tables above.
- `noisefloor.py` — the §1 variance calculation from the pre-0.4.0 trials.

Two measurement bugs were found and fixed during the run, both of which had inflated grain's apparent
performance, and both worth remembering:

1. **Echo counted as an answer.** `check <file>` and `obligation <file>` repeat the path you hand them.
   The first version of the extractor credited grain with "naming" those paths, which manufactured a
   spurious answer-changed-diff case. Paths present in the invocation are now subtracted from the answer.
2. **The wrong baseline.** An early reading compared a 0.4.0 pre-write count against the pre-0.4.0 *replay*
   numbers and looked like a large win. Those runs are a different repository and a much larger task; the
   only valid comparator is the paired without-arm. §1's noise-floor calculation exists so this mistake is
   harder to repeat.
