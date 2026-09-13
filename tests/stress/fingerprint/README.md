# Fingerprint lab harness

A measurement harness for the "feature fingerprint" idea: can the deviation of a change from the environment it
lands in — bits under the repository's own model, novelty of identifiers and file shapes, Grain's convention and
co-change instruments, the coupling between the change and its brief — say whether the change will need a fix?

Everything here is an instrument; nothing here ships. The record of what was run and what came out is in
`.system/research/fingerprint-lab-2026-09-13.md` (Polish) and the rows it adds to `docs/results.md`.

## Protocol

- Corpus: public repositories cloned in full (`corpus/<name>`), first-parent landings on the main line.
- Cutoff `T` at 70% of the landings. Every model (zstd dictionary, identifier vocabulary, trigram, Grain's own model
  in a detached worktree, the change-shape index) is built from history at or before `T` only.
- Candidates: the first 80% of the landings after `T`; the remaining 20% is the fix horizon.
- Labels: SZZ-lite. A fix landing (message matches a fix pattern, or a revert) has its deleted lines blamed at its
  parent; a candidate is "defective" when a fix blames a line it introduced. Fixes touching more than 40 files are
  skipped. Provenance (fix sha, issue link, revert, blamed lines) is kept per label so labels can be re-cut offline.
- Scoring: 5-fold stratified cross-validation of an L2 logistic regression (features standardized inside each
  fold), AUC and precision at the top 10%, three seeds; paired bootstrap on ΔAUC; leave-one-repository-out
  transfer with per-repository standardization.

## Files

| file | what it does |
| --- | --- |
| `run.py` | the pipeline: history, labels, JIT baseline features, zstd surprise, identifier/import novelty, Grain change-level instruments (`grain review --range`, `grain obligation`) in a worktree frozen at `T`; writes one cache per repository |
| `features2.py` | local (per top-level directory) and self (the file's own previous version) dictionaries, token-trigram bits per token |
| `features3.py` | size-controlled surprise: bits per byte over fixed 512-byte chunks against the cost of the repository's own chunks |
| `features4.py` | brief-to-code coupling (identifier and byte level, merge landings carry their inner messages) and change-shape novelty against the commits before `T` |
| `partners.py` | recovers the names of Grain's co-change partners for the missing-file test |
| `analyze.py` | offline evaluation over the caches: label variants, filters, strata, feature sets, size-adjusted single-feature AUC, transfer |
| `missing.py` | missing-file test with a random same-directory control and a popularity-matched control |
| `partner_effect.py` | does an untouched co-change partner mark a landing that is later fixed |
| `locate.py` | inside a defective landing, does surprise point at the blamed file |
| `drift.py` | window-level: is a period's mean surprise a leading indicator of its fix share |
| `followup.py` | same-issue return within a window as a "not done the first time" label |

## Running

```
python3 harness/run.py --corpus corpus --repos chi,gin --out .lab/workspace/exp-N --features jit,zstd,grain,vocab
python3 harness/features3.py --out .lab/workspace/exp-N --corpus corpus
python3 harness/features4.py --out .lab/workspace/exp-N --corpus corpus
python3 harness/analyze.py --out .lab/workspace/exp-N --code-only --sets size,jit,size+brief,jit+chunk --transfer
```

Dependencies: Python 3 with `numpy` and `zstandard`; `git`; Node.js and the Grain plugin (`bin/grain.mjs`) for the
Grain instruments. Every constant (chunk size 512, dictionary 1 MiB, cutoff 0.7, fix window) is an experiment
parameter, printed with the results, never a shipped threshold.
