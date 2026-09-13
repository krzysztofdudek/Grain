# Lab config — fingerprint (odcisk cechy) on real repositories

## Objective
Test how far "feature fingerprint" (deviation of a change from the conventions and obligations mined from the repository's own history) can go as a measurable signal: does it predict later defects, does its "missing mass" dimension name what a later fix actually adds, and does it work as an audit-sampling ranker.

## Primary metric (drives keep/discard)
Mean over repositories of ΔAUC = AUC(baseline JIT features + candidate fingerprint features) − AUC(baseline JIT features), for ranking defect-inducing landings (SZZ-lite labels), 5-fold CV logistic regression, bootstrap CI. Higher is better. Noise threshold: a keep needs mean ΔAUC > 0 with the paired sign over repos not worse than 5/8.

## Secondary metrics
- precision@10% of the ranked list vs. baseline (audit-sampling use)
- AUC of each single feature
- missing-file precision: for landings with a `missing:` item, fraction where a later fix touches that file
- coverage: fraction of landings on which the fingerprint is non-silent

## Scope
harness/ (this lab's code), corpus clones under corpus/ (read-only), Grain CLI at /home/user/Grain/plugins/grain/bin/grain.mjs (read-only).

## Constraints
No new tuned constants beyond what is disclosed in results; model at cutoff T uses only history ≤ T; labels use only fix commits after the candidate; no modification of Grain or the corpus.

## Run command
python3 harness/run.py --repos <list> --out .lab/workspace/exp-N

## Wall-clock budget per experiment
30 minutes.

## Termination
Until the experiment program (E0–E10 in log.md) is exhausted or three consecutive discards after the program.

## Baseline / best
baseline: to be recorded as experiment #0; best: none yet.
