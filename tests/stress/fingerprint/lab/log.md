# Lab log

## THINK — before Experiment 1
Convergence signals: none yet. Untested assumptions: (a) SZZ-lite labels are usable at ~15% base rate; (b) Grain's change-level instruments fire often enough to carry signal; (c) zstd-dictionary bits/byte of added lines is a dense, honest "bits under the repository's model" proxy. Invalidation risk: smoke on chi shows Grain governs 1/60 landings (sparse), co-change fires 13/60; zstd fires on every code landing. Next hypothesis: on the full nine-repo corpus, JIT baseline is strong (AUC ~0.75–0.85); zstd adds a small positive delta on repos with enough source to train a dictionary; Grain counts add nothing on small repos and something on express/flask/sinatra/Slim where conventions exist.

## Experiment 1 — full corpus, harness v1
Branch: research/fingerprint / Type: real / Parent: #0
Hypothesis: fingerprint features add ranking power over JIT baseline for defect-inducing landings.
Changes: none in code; first full run over 9 repos, cutoff 0.7, eval-frac 0.8, all landings.
Result: pending
Result (Experiment 1 → superseded by 2; v1 run stopped after chi): chi n=145 jit 0.843, jit+zstd 0.874.

## Experiment 2 — full corpus, harness v2 (9 repos, 3 parallel groups)
Branch: research/fingerprint / Type: real / Parent: #1
Hypothesis: same as #1, with label provenance and vocabulary novelty.
Changes: harness v2; features jit, zstd, grain, vocab.
Result: ALL landings: mean AUC jit 0.802 → jit+zstd 0.843 (Δ +0.041, wins 8/9, CI>0 2/9). CODE-ONLY landings: jit 0.684 → jit+zstd 0.703 (Δ +0.018, median −0.006, wins 3/9); jit+grain +0.017 (4/9); jit+vocab +0.002; all together +0.028 (4/9). grain alone 0.605, zstd alone 0.697, vocab alone 0.704.
Duration: ~25 min wall (3 groups)
Status: interesting
Insight: (1) The all-landings gain is an artifact: zstd features encode "no code added", which JIT lacks; trivial negatives inflate AUC. (2) On code landings, size (log lines added, single AUC 0.745) is the signal; naive bits/byte is size-confounded and points the WRONG way (z_bpb_raw single AUC 0.303, i.e. more compressible = more defect-prone, because larger additions compress better and larger changes break more). (3) Grain's convention instruments are silent on most landings; no robust gain. (4) Positives per repo 9–78: CI widths ±0.05–0.10; nothing in the code-only setting is significant. Literature calibration: LApredict (lines added only) AUC 0.71 within-project (Zeng 2021) — consistent with jit 0.684 here.
Next: size-normalized surprise (residual on log bytes, fixed-length chunks, n-gram bits/token, local/self deltas), label cleaning (issue-linked, window), size strata, archetype norms.

## THINK — before Experiment 3
Convergence signals: the naive fingerprint (bits/byte of the added lines) is a re-encoding of size (larger additions compress better) and every "gain" so far vanishes on code-only landings. Untested assumptions: (a) a size-controlled surprise (fixed-length chunks measured against chunks of the repository's own code) still carries defect signal; (b) label cleaning (issue-linked fixes only) sharpens anything; (c) a signal that exists within a repository also transfers across repositories (leave-one-repository-out). Next hypothesis: size-controlled surprise adds ≤ 0.02 AUC over size alone; nothing in the compression family survives leave-one-repository-out with a margin.

## Experiment 3 — size-controlled surprise, size residuals, strata, transfer
Branch: research/fingerprint / Type: real / Parent: #2
Hypothesis: surprise measured on fixed-length chunks against the repository's own chunk cost (c_excess), and surprise residualized on log size, carry defect signal beyond size.
Changes: features3.py (c_bpb_chunk, c_ref, c_excess, c_excess_head); analyze.py (size residuals d_res_*, --stratum, --nonzero, size-adjusted single AUC, rank correlation with size, leave-one-repository-out transfer); label variants --labels issue.
Result (code-only landings, 9 repos): single feature log_la AUC 0.745; c_excess 0.668 but rho(size) +0.54 and AUC after removing the size line 0.543; restricted to landings with ≥512 added bytes c_excess AUC 0.547. Models: size alone 0.724, jit (10 features) 0.684, size+c_excess 0.717 (Δ vs size −0.002, wins 4/9, CI>0 0/9), size+chunk 0.718, jit+chunk 0.695. Transfer (leave-one-repo-out): size 0.745, jit 0.739, size+cx 0.747, size+chunk 0.743. Issue-linked labels only: size 0.728, jit 0.704, jit+chunk 0.712 (Δ +0.009, 4/8). l2=10: same picture (size 0.726, jit 0.694). Chunk-normalized residual d_res_chunk single AUC 0.503. Local/self/ngram deltas: jit+local +0.014 (3/9), jit+ngram +0.010 (4/9), jit+novel +0.004 (4/9), none with a CI above zero.
Duration: ~12 min wall
Status: discard (for the compression family as a defect predictor)
Insight: once size is held fixed, no compression-based surprise carries more than ~0.04 AUC above chance and none adds to a size-only model, within repositories or across them. The best baseline for this corpus is a single feature — lines added — which also beats the ten-feature JIT set (overfitting on 9–78 positives per repository). Fix-labeled commits are themselves more often re-fixed (is_fix_msg size-adjusted AUC 0.672) — a known fix-on-fix effect, not a fingerprint.
Next: the brief-to-code coupling (the user's own formulation: brief analysed against the code) and change-shape novelty; the locator test (does surprise point at the blamed file inside a landing); the missing-file test with recovered partner names; replication on six more repositories.

## Experiment 4 — brief-to-code coupling and change-shape novelty
Branch: research/fingerprint / Type: real / Parent: #3
Hypothesis: (a) a landing whose code the brief does not explain (identifier and byte level) is more often fixed later; (b) a landing whose file set has no precedent in the repository's history (shape novelty) is more often fixed later.
Changes: features4.py — brief = commit message plus, for a merge landing, the messages of the commits it brought in; b_log_words, b_issue_ref, b_overlap, b_code_cov, b_explained (unigram-bits share of the code's identifiers the brief pays for), b_paths, b_zgain (1 − bits(code|brief)/bits(code) under the repository dictionary); shape: a_nn_jac, a_dir_nn_jac, a_pair_unseen, a_dirext_unseen against up to 4000 commits before T.
Result (code-only, 9 repos): single features: b_overlap 0.625 (rho size +0.37, size-adjusted 0.539), b_zgain 0.386 (inverted: the more of the code the brief pays for, the fewer fixes; size-adjusted 0.477), b_code_cov 0.440 (adjusted 0.526), b_log_words 0.593; shape features 0.53–0.57 raw, all ≤ 0.46 after size adjustment (they encode file count). Within-repo CV: size 0.724, size+brief 0.698, jit+brief 0.677 (overfit on 9–78 positives). Transfer (leave-one-repo-out): size 0.745 → size+brief 0.754 (+0.009, wins 8/9), jit 0.739 → jit+brief 0.753 (+0.014); shape alone 0.586, size+brief+shape 0.752 (shape adds nothing). Largest transfer gains: gin +0.050, CleanArchitecture +0.036, axum +0.020; loss: chi −0.077.
Duration: ~6 min wall
Status: interesting (brief), discard (shape)
Insight: the brief-to-code coupling is the only fingerprint dimension so far that is size-independent and points the expected way (unexplained code → more fixes), but it is small: about +0.01 AUC over lines-added when trained across repositories, and it does not survive within-repository training on this corpus. Change-shape novelty is a re-encoding of file count.
Next: replication on six more repositories; locator and missing-file tests.

## Experiment 5 — locator: inside a defective landing, does surprise point at the blamed file?
Branch: research/fingerprint / Type: real / Parent: #3
Hypothesis: within one landing (so size is not a confound across landings), the file a later fix blames has the highest bits/byte.
Changes: locate.py — re-blames every labeling fix to the files of the landing; ranks the landing's files by surprise (repository dictionary at T), self-surprise (the file's previous version as dictionary), added bytes, prior change count, and inverse surprise; hit@1, MRR, within-landing AUC; 176 landings with ≥2 code files and a proper subset blamed.
Result: pooled over 8 repos (153 landings): chance hit@1 0.34; surprise hit@1 0.27 (AUC 0.44), self 0.33 (0.50), size 0.48 (0.63), hot 0.42 (0.55), inverse surprise 0.35 (0.56). sinatra (23 landings, no dictionary could be trained): surprise 0.57 (0.63), size 0.43, hot 0.70.
Duration: ~4 min wall
Status: discard
Insight: the fix lands in the biggest and busiest file of the landing; per-byte surprise falls with file size, so it points away from the fault in 6 of 9 repositories. The one repository where it points the right way is the one with the poorest model (raw compression, no dictionary), which is noise, not a law.

## Experiment 6 — missing-file test with a popularity-matched control, and the partner-as-marker test
Branch: research/fingerprint / Type: real / Parent: #2
Hypothesis: (a) a co-change partner Grain names that the landing did not touch is touched by a later landing, and by a later fix, more often than a comparable file; (b) a landing with such an untouched partner is itself fixed later more often.
Changes: partners.py (recovers partner names run.py v2 had dropped); missing.py with a second control: the file, anywhere in the repository, whose change count before T is closest to the partner's; partner_effect.py (defect rate and size-adjusted odds ratio of has_partner).
Result (window 50 landings, 808 landings, 2035 partners): partner touched later 0.50, by a later fix 0.16; random same-directory control 0.41 / 0.09; popularity-matched control 0.58 / 0.16. Partner as a marker of the landing: pooled defect rate 0.130 with vs 0.133 without, size-adjusted odds ratio 1.09 (issue-linked labels: 1.28); per-repo odds ratios 0.28–2.92 with both signs.
Duration: ~15 min wall
Status: discard
Insight: the partner's apparent lift over a random neighbour is entirely its popularity: a file that changes as often is touched, and fixed, just as often. Naming the partner is still a useful reminder for the agent (half of them are touched within 50 landings), but it is not evidence that the landing is incomplete or defective.

## Experiment 7 — window drift
Branch: research/fingerprint / Type: real / Parent: #3
Hypothesis: a period's mean size-controlled surprise is a leading indicator of that period's fix share.
Changes: drift.py — landings after T in windows of 40 and 30; Spearman of the window's mean c_excess with its later-fixed share; partial on the window's mean log size and on its share of ≥512-byte landings; pooled after per-repository standardization.
Result: 9 repos, 39 windows of 40: +0.46 raw, +0.38 | size, +0.29 | size + big share; 53 windows of 30: +0.31 / +0.23 / +0.16. 15 repos, 49 windows of 40: +0.44 / +0.32 / +0.24; 70 windows of 30: +0.32 / +0.28 / +0.25. Per-repository signs mixed (express −0.72 after controls, Slim +1.00 on 5 windows).
Duration: ~2 min wall
Status: interesting, underpowered
Insight: a residual of about +0.25 after size controls at 70 windows sits at the edge of significance and the windows inside one repository are not independent; it is a suggestion for a corpus with power, not a result to design on.

## Experiment 8 — same-issue return as a delivery label
Branch: research/fingerprint / Type: real / Parent: #4
Hypothesis: a landing referencing an issue that is referenced again within 200 landings is "not done the first time", and brief coupling predicts it.
Changes: followup.py.
Result: 14 of 15 repositories have fewer than 8 such cases; sinatra 17 of 213 (0.08) with no feature above AUC 0.58.
Duration: ~2 min wall
Status: discard (unmeasurable here)
Insight: a delivery label cannot be read out of commit history in these repositories; it needs an issue tracker or the house's own evidence layer.

## Experiment 9 — replication on six more repositories, fifteen pooled
Branch: research/fingerprint / Type: real / Parent: #4
Hypothesis: 150–153 hold on click, requests, koa, mux, logrus, serde json, and on all fifteen pooled.
Changes: none in code; run.py + features3/4 + partners on corpus2; combined cache view for the 15-repository analyses.
Result: mux (3 positives) and json (6) fall below the 8-positive floor; 13 usable repositories, 2483 code landings, 361 positives. Four new usable repos: size 0.707 within / 0.721 transfer, jit 0.667 / 0.682, size+c_excess 0.702 / 0.724, size+brief 0.701 / 0.726, brief 0.671 / 0.692, shape 0.543 / 0.560. Fifteen pooled, within-repository: size 0.719, jit 0.679, size+cx 0.712, size+chunk 0.713, size+brief 0.699, size+bcc 0.709, shape 0.542. Transfer: size 0.737, jit 0.732, size+cx 0.741, size+chunk 0.741, size+brief 0.747 (wins 10/13 vs size, losses chi −0.074, koa −0.009, requests −0.010), jit+brief 0.744, brief 0.726, size+bcc 0.742, shape 0.581. Issue-linked labels (12 usable): transfer size 0.729 → size+brief 0.738, size+cx 0.739; within size 0.715, size+cx 0.715, size+brief 0.690. Single features on 13: log_la 0.737 (size-adjusted 0.497), c_excess 0.643 (0.551, rho +0.47), b_overlap 0.635 (0.557), b_zgain 0.397 (0.476), b_code_cov 0.467 (0.544), a_pair_unseen 0.571 (0.453). Locator pooled over 231 landings: chance hit@1 0.36, surprise 0.31, self 0.37, size 0.47, prior changes 0.49. Missing file over 1250 landings / 3049 partners: partner touched later 0.59, by a fix 0.17; random neighbour 0.46 / 0.08; popularity-matched 0.60 / 0.17. Partner as marker over 2575 landings: 0.127 vs 0.133, size-adjusted odds ratio 1.03.
Duration: ~45 min wall (two parallel groups plus the chain)
Status: confirmed (every verdict of 2–6 holds on the larger corpus)
Insight: the replication moves no verdict. The brief-coupling gain stays at +0.010 in transfer with 10 of 13 wins and still loses within-repository; size-controlled surprise gains +0.004 (+0.010 on issue-linked labels) with no CI above zero; surprise still points away from the blamed file; the co-change partner is still its popularity.
