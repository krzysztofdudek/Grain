# Promoting co-change above `where`'s lexical cards — measured, and rejected

**Verdict: not shipped. The lever was built, gated five ways, and measured; what it actually surfaces is the
repository's hottest file.** Across three repositories in three languages it fires on 7–27% of queries and emits
**one** distinct answer: `lib/response.js` ×25 of 27 on express, `CHANGES.rst` ×6 of 7 on flask,
`lib/sinatra/base.rb` ×5 of 6 on sinatra. A rule that answers the same thing whatever you ask it carries no
information, and cannot pay for the line it occupies at the top of `where`.

Written for ticket 079, whose brief came from `.system/research/trial-0.4.0.md` §4/§6. **No constant was added
and none was changed.** `plugins/grain/` is byte-identical to its pre-ticket state.

---

## 1. What the ticket asked, and why it looked right

§6 of the trial doc names three next steps, the first being "promote co-change above lexical file-cards in
`where`'s output". The evidence was §4a: `grain where res.append header set` on express, where the top two hits
were irrelevant test file-cards and the load-bearing line was the subordinate note
`historically co-changes with: lib/response.js (21/38 commits)`. The agent opened `lib/response.js` next. It was
the only occasion in six paired trials where a grain answer demonstrably changed what an agent did.

The counter-case was §4c, `req.hostname property` on the same repository, where the co-change line named
`lib/response.js` and was **wrong** — the task concerned `lib/request.js`. The agent ignored it because the
weak-match disclosure fired.

## 2. What was built

`cochangeLead(model, cards, hits)` — a vote over the query's own lexical neighbourhood (every file card scoring
above zero), promoting a partner as a lead line above the card list. Five gates, every one an acceptance rule
already in the file, no new tunable:

1. **the answer must be undisclosed** — none of §070's no-content-foothold, the weak-match banner, §018/§037's
   concentration note, or the suppressed no-confident-match path may have fired. A partner is evidence *about*
   its anchor, so a disclaimed anchor may not lend its partner the lead.
2. **§063's single-file confidence floor of 1/3**, directional, on the voter's own denominator.
3. **§074's ambient contrast test** — `clearsOwnRate` against `model.nonMegaCommits`.
4. **liveness at HEAD**, from the house-wide `pathsAll ∪ filesAll` set.
5. **corroboration** — at least two distinct neighbourhood files naming the same partner.

It worked on both trial cases. On express frozen at `f6f78e5f^` (the trial's own repo state) it made
`start with lib/response.js — 6 of the files this query matches historically change with it` the first line of
the answer, where today the line does not appear at all. On `e6eeec3f^` it correctly stayed silent: the
weak-match banner fires at 18%, and — measured with gates 1 and 5 both disabled — §4c promotes nothing even
then, because its wrong line came from the *directory-aggregate* arm of `cochangePartners`, which this never
reads.

Both target scenarios passed. That was not enough.

## 3. What the corpus said

Measured over `selftest --where`'s own candidates (a commit, the files it added, its message as the query),
100/32/65 candidates on express/flask/sinatra. `distinct` is how many different files the rule ever names.

| variant | express fired | distinct | flask fired | distinct | sinatra fired | distinct |
|---|---|---|---|---|---|---|
| **as built** (neighbourhood vote, 1-way conf, ≥2 voters) | 27/100 | **2** | 7/32 | **2** | 6/65 | **2** |
| mutual confidence (min of both directions ≥ 1/3), ≥2 | 0 | 0 | 0 | 0 | 2/65 | 1 |
| shown hits only, mutual, ≥1 | 0 | 0 | 0 | 0 | 0 | 0 |
| shown hits only, mutual, ≥2 | 0 | 0 | 0 | 0 | 0 | 0 |
| shown hits only, 1-way, ≥1 | 5/100 | 1 | 2/32 | 2 | 2/65 | 1 |

The most-repeated answer, in every firing variant: **`lib/response.js` ×25** (express), **`CHANGES.rst` ×6**
(flask), **`lib/sinatra/base.rb` ×5** (sinatra). The promoted file was one of the files the replayed commit
actually touched 7% / 14% / 33% of the time; on those same queries the top lexical card was 81% (express).

Every variant is either silent or a constant. Tightening does not rescue it: requiring both directions of the
pair to clear the floor — the natural anti-hub test, and free, since `cochangeData` already computes both
confidences and takes their max — takes the rule to **zero fires** on two of three repositories.

### Why the corroboration gate made it worse

Votes from a shared neighbourhood are not independent. Six `test/res.*.js` files naming `lib/response.js` is
not six pieces of evidence; it is one fact — express's tests move with the response module — counted six times.
Requiring corroboration therefore *selects for* hubs, which is the opposite of what it was added to do.

### Why §074's ambient gate did not catch them

`clearsOwnRate(k, n)` is `(k + 0.5)/(n + 1) ≥ 1 − 1/λ` at λ=8: a partner is ambient only once it changes in
roughly 87.5% of every commit in the repository. `lib/response.js` changes in 40 of express's 4531 non-mega
commits. No real file in a real repository reaches that bar, so at repository scale the gate is close to inert
and every hub passes it. This is not an argument for moving λ (decision
`zero-conventions-is-three-diseases-not-lambda` forbids it, and rightly): it is the observation that §074's
gate is calibrated for a different question — one changed file's companions — than the one asked here.

This is the same finding `.system/research/obligations-design.md` §2 already recorded from the other side:
pooled over 20 repositories, raw co-change recall@3 (0.285) *loses* to the null "3 hottest recently-changed
files" (0.336), and the whole deficit is the ambient half. Promotion turns out to be a way of printing that
null at the top of `where`.

## 4. The instruments

`whereEval` reads only `whereCmd`'s `hits`, never its `lines`, so a lead line cannot move the strata by
construction. Measured rather than argued, over five repositories, with the lever active:

| repo | named n | named hit@3 before → after | leak-free n | leak-free hit@3 before → after |
|---|---|---|---|---|
| express | 61 | 0.8852 → 0.8852 | 39 | 0.5897 → 0.5897 |
| flask | 22 | 0.6818 → 0.6818 | 10 | 0.3000 → 0.3000 |
| gin | 33 | 0.5455 → 0.5455 | 24 | 0.0833 → 0.0833 |
| sinatra | 48 | 0.7500 → 0.7500 | 17 | 0.1176 → 0.1176 |
| spring-petclinic | 8 | 0.5000 → 0.5000 | 6 | 0.6667 → 0.6667 |

Identical to four decimal places, `place@3` included. **The lever was rejected on information content, not on a
strata regression** — there was none to have.

## 5. What this says about the trial's own reading

§6's summary — "the one line that actually moved an agent" — is not quite what §4a records. §4a's own closing
sentence is: "**But so did the without-arm, in fewer calls (7 vs 9).** `res.*` → `response.js` is inferable
from the filename alone. Grain was right, was used, and changed nothing." The measurement explains why the two
readings differ. The co-change line was right in §4a for the same reason it is "right" on `«config test»`,
`«ejs test»` and `«added req path test»`: it names the hub, and in a 148-file repository the hub is often in
the commit. It was wrong in §4c for the same reason. One signal, one answer, two verdicts by luck of the task.

So the answer to the ticket's design question — *what should `where`'s first answer be?* — is: **the lexical
card, as now.** The trial's §4 complaint was largely an artefact of a ranking that has since been fixed. On the
frozen `f6f78e5f^` state the pre-012 answer was `test/res.sendFile.js` then `test/res.send.js`; today's is
`test/res.set.js`, `test/res.links.js`, `test/res.location.js`, and on the unfrozen repository §012 puts
`lib/response.js` first at 100%. Named hit@3 on express went 0.639 → 0.885 in that work.

## 6. What is left unfixed, and the one hypothesis worth a ticket

The real defect §4a exposes survives: at `f6f78e5f^` the truth file `lib/response.js` shares **no** query token
with `res.append header set`, so no amount of lexical re-weighting can reach it. That is
`where-leak-free-is-a-coverage-boundary` again — blindness, not ranking — and co-change was the wrong evidence
to reach for because it is not query-specific.

The hypothesis that fits **both** trial cases, and is not co-change: the *source companion of the test files the
query matched*. `test/res.*` → `lib/response.js` is right in §4a; `test/req.*` → `lib/request.js` is right in
§4c, where co-change was wrong. Unlike a co-change hub this varies with the query, which is the property every
variant above lacked. It is a structural signal, not a historical one, so it is out of 079's scope and
unmeasured here — recorded as a candidate, explicitly not a recommendation, and it needs the same corpus
measurement before anyone writes a line of it. Grain already carries a same-stem companion notion
(`markerImplied.companion`), but `res` → `response` is a prefix relation, not a shared stem, so the existing
machinery does not answer it as-is.

## 7. How to re-run this

The three scratch harnesses used here are not committed (they are throwaway readers of an indexed corpus):
a candidate rebuilder mirroring `whereEval`'s birth/rename derivation, a variant sweep over the five gate
combinations in §3, and the frozen-clone recipe — `git clone <corpus>/express D && git -C D checkout --detach
<sha>^`, which is a faithful freeze because every history read in `history.mjs` is HEAD-relative (`git log`,
`ls-tree HEAD`, no `--all`), so no ref deletion is needed.
