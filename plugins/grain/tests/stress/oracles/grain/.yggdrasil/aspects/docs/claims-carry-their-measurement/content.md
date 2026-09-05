# A claim in the documentation carries its measurement

This product's whole position is that a statement about a repository should arrive with the evidence
that earned it. The documentation is held to the same standard it asks the tool to meet.

## Rules

### 1. A number names what produced it and what it ran on

Any quantitative claim — a detection rate, a timing, a memory figure, a corpus result, a trial outcome —
says which instrument produced it and on what: which corpus, how many repositories, which revision,
which machine class where that matters. A number with no method attached is an anecdote formatted as
evidence, and a reader has no way to tell the two apart.

### 2. The negative is reported beside the positive, not below it

Where a measurement produced a bad result, it appears in the same passage as the good one, at the same
prominence. Misses are counted and explained. A result that paused development is not a footnote. Where
an independent audit found a false claim, the audit is cited and so is the fix.

This is not modesty. A document that reports only wins cannot be checked, so none of its numbers can be
trusted, including the true ones.

### 3. A range is the corpus's range, not a ceiling

Where performance or size figures come from a corpus, they are stated as that corpus's own range and
explicitly not as a bound. Where an outside report exceeded the range, it is named with its own numbers
and the boundary it sets is stated.

### 4. Surface descriptions describe the surface as it is

Lists of commands, tools, hooks, languages and flags describe what ships today. This is the part that
rots fastest and the part a reader treats as fact rather than as a claim: an enumeration is read as
complete unless it says otherwise. A list that is deliberately partial says so; a list that has simply
fallen behind is a defect of the same kind as a wrong number, and it is currently the reason this rule
is advisory rather than enforced.

### 5. A claim about a boundary states the boundary, not a hedge

Where something does not work, is not validated, or was tried and left out, the document says so plainly
and says what would change the answer. "Parsed but not validated" and "validated" are different claims
and must read differently. A language, a host or an integration that has not been exercised is named as
unverified rather than listed alongside the ones that have.

### 6. A number that ages is anchored to something that moves with it

Counts that change with every change — suite sizes, rule counts, module counts — either carry the
version or commit they were computed at, or are not stated at all. A number frozen in prose is wrong
within a week and undetectably so.

## Why

The front door is where a stranger decides whether this is a serious instrument or a demonstration. The
strongest thing it can do is show its own negatives with the same care as its positives — and the fastest
way to lose that is a stale enumeration, because a reader who catches one wrong list stops believing the
measurements too.
