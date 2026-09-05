# The cache-version keys are a contract, not a comment

Three keys in the constant table say what a stored index is compatible with: one for extraction output,
one for the history replay state, and one for the model's own fields. Everything expensive this product
does is cached against them. They are the only thing standing between a code change and an index that is
silently wrong.

## Rules

### 1. Change the output, move the key

If a change alters what extraction records for any file in any language — a new scope becomes visible,
an existing one is named differently, a field is added or dropped, a construct stops being recorded —
the extraction key moves.

If a change alters the replay state's shape or adds a per-scope or per-commit field that only a fresh
walk can fill, the history key moves.

If a change adds or alters a model field that a query reads, the model key moves.

The three are independent and are not moved together out of caution: moving the history key forces a
full history walk, which is the most expensive thing here, and moving it for a change that did not need
it costs every user of the tool minutes for nothing.

### 2. The key's own note says what changed and what it costs

Each key carries an accumulated note, one entry per bump, and each entry says three things: what
changed, which languages or surfaces it changes output for, and what a store from the previous version
must do about it — re-parse, re-learn, or re-walk. Anyone reading a slow rebuild must be able to find
the entry that explains it.

The note is written for the person whose index just got invalidated, not for the person who made the
change. "Refactored the walker" is not an entry; "a decorated declaration is now named by its declarator
rather than by the decorator token — extraction output changes for these languages, cached scopes from
before this version must be rebuilt" is.

### 3. When in doubt, the key moves

A stale index does not announce itself. It answers, confidently, from data derived by code that no
longer exists, and every one of those answers carries a stamp claiming it was computed from the current
commit. That is the failure this whole product exists to prevent in other people's repositories; it must
not be the failure it ships with. A needless bump costs one rebuild. A missed bump costs correctness,
silently, until someone notices an answer that cannot be right and has no way to tell why.

### 4. Nothing else may decide compatibility

The keys are the sole compatibility check. No other version, timestamp, file size, hash-of-a-hash or
heuristic may be introduced to decide whether a store is usable — a second mechanism means two answers
to one question, and the disagreement will be resolved in favour of whichever ran first.

## Why

Every answer this tool prints ends with the commit it was computed from. That stamp is a promise about
provenance, and it is only true while the stored data was produced by the code that is running now. The
keys are what make the promise checkable.
