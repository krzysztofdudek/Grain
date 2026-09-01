# 037 · The zero-scope honest-negative is suppressed whenever any weak match exists

**Status:** FIXED (verified independently)
**Found by:** round 4, Kotlin/okhttp, 2026-09-01
**Severity:** high — turns an honest warning into false confidence, in exactly the case it was built for

## Symptom

`grain what MAX_CONCURRENT_STREAMS` (and `HEADER_TABLE_SIZE`) return unrelated **test-method** matches, with no
warning, and miss the real `const val` in `Settings.kt`.

The reason `Settings.kt` contributes nothing is a genuine parser failure, isolated to a minimal repro by the
tester: **tree-sitter-kotlin 1.1.0 emits one giant ERROR node for an entire class body when the class has both a
property and an `operator fun` of the same name** — here `private var set: Int` alongside `operator fun set(…)`.
`Settings.kt` therefore parses to **zero scopes**.

grain HAS the right disclosure for this — 018 Phase 1's *"parsed with zero extracted scopes… may be a real
declaration it missed"*. **But it only fires when there is no other match at all.** A weak, unrelated match
suppresses it, so the user gets a confidently-wrong answer instead of the honest warning.

## The defect is the gating, not the message

018 Phase 1 was scoped to the empty-answer path — reasonable at the time, and 011's own acceptance test
(a genuinely absent term must still get a short clean answer) pushed against making every answer verbose.

But the field shows the dangerous case is not the empty answer; it is the **weak** answer. An empty result already
reads as "grain found nothing". A page of unrelated test methods reads as "grain found your thing" — and that is
exactly when the blind-file caveat is most needed.

Note this compounds with 036 (same command, same session, both producing false confidence) and shares a root
instinct with 031: grain's disclosures fire on absence, when the real hazard is a confident partial answer.

## What to work out

When should the blind-file caveat accompany a NON-empty answer? Naively attaching it to every answer would
reintroduce the verbosity 011 guarded against. A defensible cut: attach it when the query string appears verbatim
in a blind file **and** no returned hit is an exact-name match — i.e. precisely when the answer is weak AND
grain can see it may be missing the real one. That is derivable from data already at hand (018 Phase 1 built the
blind-file scan; 036's fix makes exact-match status reliable).

Sequence after 036 — its fix makes "is there an exact match" trustworthy, which this gate depends on.

## Also worth recording

The upstream cause is a real tree-sitter-kotlin defect with a clean minimal repro (property + same-named
`operator fun` → whole-body ERROR). Worth capturing in the log even though grain cannot fix it: it is the kind of
thing that will resurface, and any Kotlin repo using that idiom silently loses a whole file.

## Acceptance

`what <a symbol that exists only in a zero-scope file>` carries the blind-file caveat even when weak unrelated
matches are returned. A query with a genuine exact-name hit does not carry it. A genuinely absent term still gets
the short clean answer (011's guard, unchanged).

---

## Work log — 2026-09-01 (fix-031-037-039) — **FIXED**

`what` now attaches the blind-file caveat to a NON-EMPTY answer. Suite 1755 → 1767, all green.

### The rule that shipped

Three conditions, all of which must hold:

1. **No exact-name match anywhere in the answer** — no returned declaration and no returned value *is* the query,
   case-insensitively (`weakName` in `whatCmd`). Trustworthy only because 036 computes `exactLocal` over the full
   set before the display cap; this gate would have been unreliable when 018 shipped.
2. **The query carries ≥2 name tokens.** This is not a new threshold — it is 002's own cut, for 002's own reason.
   For a single-token query `coversQt` already degrades to "any symbol containing this token"; by identical logic
   that token's verbatim appearance somewhere in a file is the birthday paradox, not evidence.
3. **The blind file is peer-ANOMALOUS and the match is at identifier boundaries, case-exact.** Peer-anomalous =
   its own grammar yields scopes elsewhere in this repository (`blindFiles(model, { peerAnomalous: true })`). A
   `.yml` that extracts nothing is behaving exactly as every other `.yml` here does; a `.kt` that extracts nothing
   among 566 that parse fine is an outlier, and the anomaly is the evidence. Threshold-free, language-free,
   model-only — no list of "data formats" anywhere.

The empty-answer path is deliberately **not** held to this bar and keeps 018's looser substring scan over every
blind file. That asymmetry is the design, not an oversight: an answer that already says "nothing found" cannot be
made overconfident by a hedge, while an answer the reader is already reading can. Different claims, different
evidentiary bars.

Among several qualifying blind files the one with the most occurrences is named — a tie-break among files that
already passed the gate, so it changes *which* file is cited, never *whether*. On axum this moves the citation from
`axum-extra/src/extract/mod.rs` (a one-line `pub use`) to `axum/src/extract/rejection.rs`, where the macro actually
emits the type.

### Measurement — the whole point of the dispatch

Nine real repos on disk (flask, gin, axum, Slim, sinatra, express, okhttp, spring-petclinic, CleanArchitecture),
1800 sampled queries drawn by four processes chosen independently of any candidate rule: exact scope names,
frequent single name-tokens, identifier-shaped tokens copied from source, compound identifiers, and word phrases.
825 of the 1800 produce a non-empty answer. **Fire rate over non-empty answers:**

| rule | fires | % of non-empty |
| --- | --- | --- |
| substring in any blind file (**the hypothesis as originally stated**) | 154 | **18.6%** |
| + word-boundary, case-exact | 105 | 14.4% |
| + peer-anomalous blind file only | 59 | 7.2% |
| **+ ≥2 name tokens — shipped** | **13** | **1.58%** |

18.6% is the 018 mistake again at one-in-five. The ≥2-token condition is what does the real work, and it does it
for a reason the codebase had already established rather than one invented to fit the data.

Two other gates were measured and **rejected**:

- **Confinement** (the query occurs at word boundaries in a blind file and in *zero* parsed files) looks
  irresistible — 1.5% fire rate — and is exactly backwards. It kills every true case: `MAX_CONCURRENT_STREAMS`
  appears in 3 parsed test files, `JsonDataError` in 2. A real declaration is *used*, so its name necessarily
  appears in files grain can see. Recorded here because the reasoning is seductive.
- **Occurrence count ≥2 inside the blind file** does not separate: `PathRejection` and `FormRejection` are true
  positives at 1 occurrence; `connection_status` is noise at 2 and `masked_token` at 5.

Audit of all 13 shipped fires: roughly 8 point at a declaration grain genuinely cannot see (`PathRejection`,
`FormRejection`, `service_ext` → `mod service_ext;`, `appcontext_tearing_down`, Slim's `connection_status` and
`is_readable` → closures defined in a zero-scope mock array, `masked_token` → an RSpec `let(:…)`, which is 031's
own mechanism); the rest land on doc comments and test strings (`TcpListener`, `WebSockets`, `StringBuilder`,
`NODE_ENV`). When wrong the claim is still factually true and hedged, and it names one file the reader checks in
seconds.

### Acceptance, checked

- `what MAX_CONCURRENT_STREAMS` / `what HEADER_TABLE_SIZE` on okhttp now carry the caveat naming
  `okhttp/src/commonJvmAndroid/kotlin/okhttp3/internal/http2/Settings.kt`, with the weak test-method hit still
  shown. Verified against the real repo.
- `what Interceptor` (genuine exact hit) does not carry it — verified on okhttp.
- 011's clean absent answer is byte-unchanged: `what-honest-negative.test.mjs` (1) still asserts exactly 3 lines,
  and the new file re-asserts it independently as (6).
- 018's empty-answer blind note still fires on its own path — new test (7).

### Upstream cause, recorded as the ticket asked

tree-sitter-kotlin 1.1.0 emits one ERROR node for an entire class body when the class declares a property and an
`operator fun` of the same name (`private var set: Int` alongside `operator fun set(…)`). grain cannot fix it; any
Kotlin repo using that idiom silently loses a whole file, which is exactly what this disclosure now says out loud.

### Files

- `plugins/grain/engine/core.mjs` — `blindFiles({ peerAnomalous })`, `whatCmd`'s `weakName` + caveat
- `plugins/grain/engine/grain.mjs` — `findBlindHit(…, strict)`, `cmdWhat`'s two-path scan
- `plugins/grain/tests/what-weak-answer-disclosure.test.mjs` — new, 12 tests

No `config.mjs` change and **no `MODEL_V` bump needed**: every change is read-time (`whatCmd`/`howCmd`/
`blindFiles`/`cmdWhat`); nothing `learn()` writes to the model is touched.
