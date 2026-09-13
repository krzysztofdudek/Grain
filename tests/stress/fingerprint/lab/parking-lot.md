# Parking lot

- code-only evaluation: drop landings that add no code lines (README, version bumps) — they dilute and are rarely defect-inducing
- dense deviation features that do not depend on sparse conventions: identifier novelty (fraction of identifiers in added lines unseen at T), import novelty (new imports never seen at T), local-vs-global dictionary surprise (module dictionary vs repo dictionary)
- label variants: reverts-only; fixes with issue references only; window-limited fixes; store label provenance per landing
- missing-file precision: for landings with co-change partners named by Grain, does a later fix touch exactly that partner?
- class-conditional norm: z-score of surprise within landings of the same top directory / extension mix
- staleness: rebuild the Grain model at checkpoints (T, T+25%, T+50%) instead of frozen at T
- audit-sampling use: precision@10% and defect mass captured in top 10% vs random
- dispersion test: is the fingerprint of non-defective landings tighter than of defective ones (CV comparison)
