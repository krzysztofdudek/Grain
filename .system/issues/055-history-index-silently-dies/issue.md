# 055 · `report`/`map` with full history never completes on Symfony — process silently vanishes after 17+ min

**Status:** ROOT CAUSE FOUND (via 054 measurement) — `history.mjs:270` `JSON.stringify` exceeds V8's max string length on 82,946 commits; the throw is swallowed, hence "process vanishes". Fix: chunked/streaming serialisation of the history state, AND a loud failure path (the swallow is the disclosure defect). Found by round 4, PHP/symfony (82,946 commits), 2026-09-01
Clone took 20s. History-free index: ~135s, 12,476 files, 89,174 scopes, consistent across three clones. With
history: never finished, **no crash, no stderr, process gone** after caching 259 blobs. A silent death with no
disclosure is the worst failure shape this project recognises. Likely V8/WASM memory (see engine gotchas) or an
unbounded walk. **Establish:** where it dies, whether it is memory, and — regardless — make the failure LOUD:
a bounded walk must say it was bounded, an OOM must say so. Add Symfony-scale to the scale ladder (see loop v2).
