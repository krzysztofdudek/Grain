# 057 · `what "schemaLocation"` says "no declarations anywhere in this repository's code" — 455 XML files were never read

**Status:** OPEN — HIGH (same class as 041: a certified absence). Found by round 4, PHP/symfony, 2026-09-01
Inconsistent across surfaces: `check psalm.xml` correctly says "no grammar for .xml" and lists supported grammars
(good). `explain psalm.xml` says "(no scopes extracted)" — reads as empty content, not unsupported format.
`what "schemaLocation"` (XML-only content) **confidently asserts absence with zero disclosure** that XML is unread.
**Fix shape:** the honest-negative path in `what` must consult the set of files grain could not read (by
extension, no grammar) and say so when the query appears in them — the same peer-anomalous logic as 037, but for
"no grammar at all", which is a stronger, cheaper signal. `explain` must distinguish "no grammar" from "no scopes".
