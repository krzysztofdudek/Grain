# Oracle: yggdrasil

The difference between the architecture graph `grain propose` wrote for this repository and the graph its
maintainer actually accepted. It is an oracle by the same definition as the four hand-written ones beside it:
a graph a maintainer of that repository decided to live with, which grain did not write.

| | |
|---|---|
| **Target** | `/home/user/Yggdrasil` |
| **Revision** | `3a351e16dc693fa2db3ae9fd86472520f555b510` |
| **Tracked files** | 3056 |
| **Recorded** | 2026-09-06T17:35:25.106Z by grain 0.4.0 |
| **Proposal** | 107 node types · 85 nodes · 173 rule drafts |
| **Accepted** | 36 node types · 436 nodes · 70 rules · 1 port |

## The correction

Nodes: 2 kept · 26 renamed · 0 remapped · 5 merged · 30 split · 8 recut · 7 dropped · 4 added.
Relations: 29 kept · 10 added by the adopter · 12 removed.
Rules: 0 kept · 0 promoted · 0 demoted · 0 edited · 173 dropped · 70 the adopter wrote themselves.

No draft appears in the accepted graph under its own name at all: that graph was not grown from this
proposal, so the rule line above is a comparison of two independent sets, never a review of the drafts.

## What is in here, and what is not

Recorded: node types and their predicates, nodes with their mappings, relations, ports and attached rules,
rules with their statuses and the identifiers their checks police, and — for every one of those — the set of
tracked paths it selected at the revision above. Not recorded: file contents, prose, charters, drill corpora,
commit history, lock files. The file sets were expanded once, against the real repository, so scoring needs
no clone: `grain oracle score yggdrasil`.
