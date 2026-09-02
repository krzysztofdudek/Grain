# Did 088 move `obligation`? — the second run of the decision-point instrument

**Question.** `trial-0.4.0.md` found adoption fixed and reach absent: grain calls went 1 → 11, pre-write tool
calls did not fall (+0.7, 0.24 se), and there were **zero** answer-changed-diff cases in 13 runs. It named one
cause it could act on immediately: `obligation` was invoked **0 times**, because 081's law says agents call what
the SessionStart advertisement names and nothing else. Exactly one change since then targets that metric —
**088** (`3379101`): the advertisement now names each command at its trigger moment, and the pre-write hook
volunteers `obligation <path>` for a new file, fire-rate gated. **Did it move anything?**

**Answer, in one line: 088 made the command reachable and the command had nothing to say.** `obligation` went
from 0 calls in 13 runs to 4 calls in 12; all four answered "nothing certifies as a specific obligation". The
pre-write hook fired **0 times**, and cannot fire on this corpus. Pre-write calls and answer-changed-diff are
unchanged — the latter is now **0 in 25 with-arm runs across both trials**.

---

## 1. Design — what is held fixed, and what is reused

Same six tasks, same worker model (Sonnet), same 80-turn budget, same harness, same prompts. Each task is a
real commit; the repo is a fresh clone frozen at that commit's parent with every other ref deleted, so the
commit being reproduced is unreachable to grain's history walk. Tasks are named by sha:

| task | lang | what the commit did |
|---|---|---|
| `0c929505` | C# | centralise role and policy constants into the domain layer (creates a new directory) |
| `1c2ef456` | C# | fix a paging boundary condition |
| `f6f78e5f` | JS | add `res.append` |
| `e6eeec3f` | JS | add `req.hostname` |
| `01621485` | Py | fix session/URL-matching ordering |
| `3351a867` | Py | add errorhandler typing tests |

Three arms:

- **without** — no plugin, `.grain/` removed. **Reused from the 0.4.0 trial, not re-run.** 088 changes an
  advertisement and a hook; an arm with no plugin loaded cannot be touched by either. Re-running it would have
  measured only run-to-run noise and cost six of the twelve worker runs. This is a deliberate deviation, and
  §6 states the threat it carries.
- **0.4.0** — the pre-088 with-arm, also reused, re-extracted with this trial's extractor.
- **+088** — the post-088 plugin, run fresh, **twice** (reps *a* and *b*). The baseline's own threat list put
  "small n, one run each, no repetitions" second; two reps buys a within-arm variance estimate and doubles the
  sample for the adoption question, which is a count.

### The arm-validity gate

An arm only tests 088 if the SessionStart text the worker actually saw carries 088's wording. This is checked
mechanically per run, not assumed. All 12 post-088 runs pass all three checks; all 13 baseline runs fail them,
confirming the middle column is genuinely pre-088:

| | names `grain obligation` | `Same moment` trigger | `Before you consider the change done` |
|---|---|---|---|
| 0.4.0 arms (13 runs) | no | no | no |
| +088 arms (12 runs) | **yes, 12/12** | **yes, 12/12** | **yes, 12/12** |

### Extractor

`metrics040.py` extended to `metrics088.py`. It reproduces the old extractor **exactly** on all 13 stored
baseline transcripts across pre-write count, total calls, per-tool counts, cost, turns, written files and
answer-changed-behaviour (regression PASS), and adds: per-command counts (so `obligation` is counted
separately rather than folded into a set), the advertisement gate above, and every hook utterance with its
text. The baseline's two known pitfalls are inherited intact — paths echoed back by `check <file>` /
`obligation <file>` are subtracted before matching, and the only valid comparator is the paired without-arm.

**One new extractor bug found and fixed.** Post-088 agents began chaining several grain calls into one Bash
command (`… obligation X; echo ---; … how Y`). The old parser read only the first subcommand, which both
undercounts invocations and mis-attributes the command. The parser now reads every occurrence. The baseline
contains **no** chained calls, so its published "11 calls" figure is unaffected — the chaining is itself new
behaviour in the 088 arm.

---

## 2. Finding 1 — 088 made `obligation` reachable, and that is a real change

| | without | 0.4.0 | +088 |
|---|---|---|---|
| runs | 6 | 6 | 12 |
| runs that consulted grain | 0/6 | 6/6 | **11/12** |
| grain invocations | 0 | 11 | **35** |
| invocations per run | 0 | 1.83 | **2.92** |
| distinct commands used | 0 | 3 | **6** |
| `where` / `check` / `how` | — | 7 / 3 / 1 | 12 / 11 / 4 |
| `what` | — | 0 | 2 |
| **`obligation`** | — | **0** | **4** (in 3 of 12 runs) |
| **`completeness`** | — | **0** | **2** (in 2 of 12 runs) |
| hook-volunteered `obligation` | — | 0 | **0** |

The sign is positive on every adoption measure. Command breadth doubled, 3 of 16 → 6 of 16. `obligation` and
`completeness`, which had **never once** been invoked in 13 runs of the previous trial, were both reached.
081's law — agents call what the advertisement names at a moment, and nothing else — now has a second,
causal confirmation: the only thing that changed was the wording, and the two commands that gained wording are
exactly the two that gained calls.

Two things keep this honest. **The effect is concentrated in one rep**: all four `obligation` calls are in rep
*a*; rep *b* made none. Against the 13 pre-088 runs the difference is 3 of 12 runs versus 0 of 13, Fisher's
exact **p = 0.096** — suggestive, not significant, and against the 6-run 0.4.0 arm alone p = 0.515. **And
adoption is not monotone**: `1c2ef456` rep *b* made zero grain calls, the first with-arm run since 0.4.0 landed
to ignore grain entirely.

---

## 3. Finding 2 — every `obligation` answer was empty, and three of four asked the wrong kind of question

This is the finding that matters. All four calls, quoted in full, with what the agent did next.

**`e6eeec3f` rep a, call #9** — `grain obligation lib/request.js`

```
a new *.js under lib/ has been born 10 times — nothing certifies as a specific obligation
as of 269dc53
```

Next three tool calls: `Read History.md`, `Edit lib/request.js`, `Edit lib/request.js`. The answer changed
nothing.

**`01621485` rep a, call #5** — `grain obligation src/flask/ctx.py`

```
a new *.py under src/flask/ has been born 16 times — nothing certifies as a specific obligation
as of 15f0fc2
```

Next: `Read tests/test_reqctx.py`, `Read tests/test_reqctx.py`, `Read CHANGES.rst`. Changed nothing.

**`3351a867` rep a, call #17** — `grain obligation tests/typing/typing_route.py`, chained with a `how` call

```
a new *.py under tests/typing/ has been born 1 time — nothing certifies as a specific obligation
as of 81be290
```

The chained `how` in the same command *did* produce content — a certified shape and five dated exemplars,
naming `src/flask/typing.py`, `src/flask/app.py`, `src/flask/blueprints.py` and `src/flask/scaffold.py`. The
agent later opened `blueprints.py` and `typing.py`. That is answer-changed-behaviour, and it belongs to `how`,
not to `obligation`.

**`3351a867` rep a, call #48** — `grain obligation tests/typing/typing_error_handler.py`

```
a new *.py under tests/typing/ has been born 1 time — nothing certifies as a specific obligation
as of 81be290
```

Next: `Write /tmp/check_mypy.py`. Changed nothing.

**Three of the four were asked about a file that already exists** — `lib/request.js`, `src/flask/ctx.py` and
`tests/typing/typing_route.py` are all present at the frozen parent, and the agent was about to *edit* them,
not create them. `obligation` answers a birth question: what a *new* file of this class has historically come
with. The advertisement folds it into the `where` line at the "before creating a source file" moment, and
agents generalised it to "the file I am about to touch". Only call #48 named a genuinely new path — and it
also certified nothing. So the command was reached at the wrong moment three times out of four, and on the one
occasion it was reached correctly it had no answer.

### `completeness`, for comparison, spoke once

**`e6eeec3f` rep a, call #40** — `grain completeness lib/request.js` → `no partner above 33% co-change
confidence`. Empty.

**`f6f78e5f` rep b, call #28** — `grain completeness lib/response.js` — the one non-empty new-command answer
in the trial:

```
[grain] Edits like this historically also touch:
  - test/res.jsonp.js (co-changed in 13/16 commits)
  - test/res.format.js (co-changed in 9/13 commits)
  - test/res.redirect.js (co-changed in 20/32 commits)
  - test/res.cookie.js (co-changed in 13/23 commits)
  - test/res.send.js (co-changed in 21/38 commits)
```

The agent ran one more grain command, then `git diff --stat`, and touched none of the five. They are also all
files the without-arm did not touch either, so acting on them would not have improved placement.

---

## 4. Finding 3 — the pre-write hook fired zero times, and cannot fire here

**0 hook utterances of any kind in 12 post-088 runs**, and 0 mentioning obligation. This is not a missed
opportunity for want of a `Write`. `hooks.json` matches the pre-write hook on `Write`, and the 12 runs issued
**14 `Write` calls** between them, in 10 of the 12 runs — so the hook was actually invoked 14 times and
returned silence 14 times. (The two exceptions, both reps of `01621485`, made 0 `Write` calls and edited
existing files only; they gave it no chance.) Every one of the six tasks also creates at least one file: each
commit's own `--name-status` shows an addition — `src/Domain/Constants/Policies.cs` and `Roles.cs` for
`0c929505`, `PaginatedListTests.cs` for `1c2ef456`, `test/res.append.js`, `test/req.hostname.js`,
`tests/test_session_interface.py` and `tests/typing/typing_error_handler.py` for the rest.

Because absence of firing could mean "the gate never came up" rather than "the gate never passes", the gate was
probed directly, outside the trial: `check-hook --pre` was invoked exactly as `hooks.json` wires it, on 14
paths that are guaranteed absent from disk and chosen to sit in the same (module, suffix) class as the files
these tasks actually create.

| | invoked | produced any output | spoke `obligation` | CLI certified a specific rule |
|---|---|---|---|---|
| in-trial: real `Write` calls, 12 runs | 14 | **0** | **0** | — |
| probe: 14 guaranteed-new paths, all six repos | 14 | **0** | **0** | **0 of 14** |

All 14 CLI answers are of the form `a new *.cs under src/Domain/ has been born 9 times — nothing certifies as a
specific obligation`, or, for a suffix class with no history, `has no recorded births in this repo's history —
nothing to certify`. The hook is silent here **by construction**, exactly as 088's own commit message predicted
(it measured a 0% fire rate on this repo's leave-one-out history and 0 of 8 on 081's trial creation events).
The wiring is correct and the gate is honest; the birth-obligation table simply certifies nothing on any of
these six repositories.

---

## 5. Finding 4 — the number that matters still has not moved, and reach is still zero

Pre-write = every tool call before the first `Write`/`Edit`. The +088 column is the mean of reps *a* and *b*.
Negative delta is grain winning.

| task | without | 0.4.0 | +088 a | +088 b | +088 mean | Δ vs without | Δ vs 0.4.0 |
|---|---|---|---|---|---|---|---|
| `0c929505` | 26 | 17 | 20 | 16 | 18.0 | −8.0 | +1.0 |
| `1c2ef456` | 9 | 10 | 7 | 6 | 6.5 | −2.5 | −3.5 |
| `f6f78e5f` | 7 | 9 | 13 | 11 | 12.0 | +5.0 | +3.0 |
| `e6eeec3f` | 9 | 21 | 10 | 11 | 10.5 | +1.5 | −10.5 |
| `01621485` | 4 | 3 | 10 | 6 | 8.0 | +4.0 | +5.0 |
| `3351a867` | 44 | 43 | 48 | 39 | 43.5 | −0.5 | +0.5 |
| **mean** | **16.5** | **17.2** | | | **16.4** | | |

```
paired delta  +088 − without   mean -0.08  median +0.5  sd 4.77  se 1.95  =>  0.04 se from zero
paired delta  +088 − 0.4.0     mean -0.75  median +0.8  sd 5.56  se 2.27  =>  0.33 se from zero
paired delta  0.4.0 − without  mean +0.67  median +0.0  sd 6.77  se 2.76  =>  0.24 se from zero
```

**Sign, stated plainly.** +088 against the unaided arm is **−0.08 tool calls** — the point estimate is
negative, i.e. nominally in grain's favour, and it is 0.04 standard errors from zero, which is as close to
exactly nothing as this instrument can produce. Against the 0.4.0 arm it is −0.75, 0.33 se. Neither is
distinguishable from zero, and both sit far inside the ±47 noise floor §1 of the baseline established for runs
where grain was demonstrably not consulted. The honest reading is unchanged from the first trial: **no
detectable effect on pre-write cost, in either direction.** What can be said additionally is that the
adoption gain of 088 — 35 invocations where there were 11 — did not make the arm *more* expensive either.

**Answer-changed-diff: 0 in all 12 runs.** Not one file in any post-088 arm's diff was there because grain
named it and the without-arm missed it. Combined with the baseline this is **0 cases in 25 with-arm runs**.

### Placement

| task | truth files | without | 0.4.0 | +088 a | +088 b |
|---|---|---|---|---|---|
| `0c929505` | 6 | 4 | 4 | **6** | **6** |
| `1c2ef456` | 2 | 2 | 2 | 2 | 2 |
| `f6f78e5f` | 3 | 3 | 3 | 3 | 3 |
| `e6eeec3f` | 3 | 3 | 3 | 3 | 3 |
| `01621485` | 3 | 2 | 2 | 2 | 2 |
| `3351a867` | 4 | 2 | 0 | 0 | **3** |

Two cells improved, and **neither was caused by grain**, which is worth stating carefully because both are
tempting.

`0c929505` — the new-directory task, the one place placement is genuinely hard — went 4/6 → 6/6 in *both* 088
reps, and both arms put the constants in `src/Domain/Constants/` where the author did. But grain's `where`
answer pointed the other way: `weak match … → group IPipelineBehavior+behaviour … lives in:
src/Application/Common/Behaviours/`, the wrong layer and the same wrong direction the 0.4.0 arm followed. The
agent ignored it, ran `Glob src/Domain/**` and `Glob **/Constants/**` on its own initiative, and found the
answer that way. `grain what Roles Constants` returned `has no declarations or values anywhere in this
repository's code`. The win is the agent's, not the tool's — and 080 already measured why grain has nothing
here: a directory that does not yet exist has no birth signal to mine.

`3351a867` rep *b* recovered from 0/4 to 3/4, but 3/4 only matches and slightly exceeds what the **unaided**
arm managed (2/4) without any tool. The 0.4.0 arm's 0/4 was an unlucky run, not a grain effect, and the
recovery is regression to the mean.

### Cost

| | without | 0.4.0 | +088 (12 runs) |
|---|---|---|---|
| total | $3.58 | $3.66 | $7.08 |
| per run | $0.596 | $0.610 | **$0.590** |
| total tool calls | 230 | 225 | 447 (223.5 per 6) |

Per-run cost is flat to three arms' worth of noise. 088 added 24 grain invocations across 12 runs and cost
nothing measurable.

---

## 6. Threats to validity

1. **The without-arm is reused, not re-run.** It cannot be affected by 088, but it was recorded on a different
   day. Any model-side drift between then and now lands entirely in the `+088 − without` comparison. The
   `+088 − 0.4.0` comparison shares that exposure; the `0.4.0 − without` row is reproduced here from stored
   transcripts and matches the published trial exactly, which is the only cross-check available.
2. **The obligation result rests on one rep.** All four calls are in rep *a*; rep *b* made none. p = 0.096
   against the 13 pre-088 runs. A third rep would be the cheapest way to firm this up.
3. **Small n, wide noise floor.** Six pairs. The baseline measured paired deltas of −84…+45 in runs where
   grain was not being called at all. This trial can say "no large effect on pre-write cost" and "no reach";
   it cannot exclude a small one.
4. **Public repositories are in training data**, biasing the unaided arm upward and against grain. No private
   control was run this time — the 0.4.0 trial's seventh run was not repeated, since its question (does the
   advertisement get grain used) is now answered.
5. **A harness fault, caught.** An interim re-extraction was run while rep *b* was still in flight and wrote
   metrics over partial transcripts, which briefly read as four truncated runs. The completion check now waits
   on the runner's own final marker rather than on the presence of metrics files. All 12 runs in the tables
   above carry a `success` result record with a non-zero cost; this was verified per run before analysis.
6. **The branch-name blemish is retained deliberately.** Both arms still work on a branch named `grain-trial`,
   which the baseline flagged. Renaming it would have made this arm differ from the 0.4.0 arm in two ways
   instead of one. It should be renamed once no further comparison against the 0.4.0 arm is needed.
7. **Twelve worker runs of the ~12 budgeted**, all spent on the +088 arm.

---

## 7. For the director — one paragraph

**088 worked on the axis it was aimed at and revealed that the axis was not the bottleneck; wave 5 should be
about what `obligation` can certify, not about who calls it.** The advertisement lever is now confirmed twice
and can be considered a solved, reusable mechanism: naming a command at a trigger moment took `obligation`
from 0 calls in 13 runs to 4 in 12 and `completeness` from 0 to 2, doubled command breadth from 3 of 16 to 6
of 16, and raised invocations per run from 1.83 to 2.92 at no measurable cost — 081's law holds, and anything
grain wants an agent to use must be named at a moment. But every one of those four `obligation` answers was
`nothing certifies as a specific obligation`, the single `completeness` answer with content was ignored, the
pre-write hook fired zero times, and a direct probe of 14 guaranteed-new paths across all six repositories
returned zero certifications and zero hook utterances — the gate is silent here by construction, exactly as
088's own commit message predicted. So the command is now reachable and empty, which is a worse place to be
than unreachable and empty, because an agent that asks and gets nothing learns not to ask. Two concrete things
follow. First, `obligation`'s certification floor is the thing to measure and move: 0 of 14 on six real
repositories is the number wave 5 should be trying to change, and until it moves, advertising the command
harder will only spend agent turns. Second, there is a semantics bug worth a small ticket on its own — three
of the four calls asked `obligation` about a file that already existed and was about to be *edited*, because
the advertisement folds a birth-question into the `where` line and agents generalise it to "the file I am
about to touch"; either the wording should say "a file that does not exist yet", or `obligation` should answer
the edit-time question too. Meanwhile the north-star metric is untouched and should be reported as such: −0.08
pre-write calls against the unaided arm at 0.04 standard errors from zero, and **zero answer-changed-diff cases
in 25 with-arm runs across both trials**. Nothing in two trials yet shows a grain answer putting a file into a
diff that an unaided agent missed, and the two placement cells that improved here were both won by the agent's
own globbing while grain pointed at the wrong layer.

---

## 8. Cost and how to re-run

12 worker runs (6 tasks × 2 reps), post-088 with-arm only; the without- and 0.4.0 arms are reused stored
transcripts, re-extracted.

| | runs | cost | worker wall |
|---|---|---|---|
| +088 rep a | 6 | $3.72 | 1052 s |
| +088 rep b | 6 | $3.35 | 981 s |
| **this trial** | **12** | **$7.08** | **~34 min** |
| (reused: 0.4.0 with) | 6 | $3.66 | 1269 s |
| (reused: without) | 6 | $3.58 | 1157 s |

Each rep ran its six tasks concurrently, so elapsed time was far below the sum.

The harness is an untracked extension of the 0.4.0 one, itself a thin extension of the committed
`tests/stress/agent-trial.sh`:

- `trial088.sh` — identical to the 0.4.0 runner except for the plugin under test and the extractor.
- `metrics088.py` — the extractor. Regression-tested against the old one on all 13 stored baseline
  transcripts (PASS) before any new run was analysed.
- `three.py` — the three-column tables above.
- `hookprobe2.py` — the §4 gate probe.
- `reextract_all.py` — re-parses every stored transcript so all three columns use one extractor.
- `wait2.sh` — waits on the runner's completion marker, per threat 5.
