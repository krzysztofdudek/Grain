# An instrument measures; it does not gate

Instruments are why this project's claims are believed rather than asserted. Each one measures one class
of defect over the whole fixed corpus and produces a number per repository and per class. Triage happens
on the number. The instrument is the retest, permanently — there is no separate confirmation pass and no
scout sent to check by hand.

## Rules

### 1. It reports; it does not pass or fail

An instrument's output is a measurement. It does not decide whether a build is good, and it is not wired
into the push gate: it runs a corpus of real clones that this repository does not contain, and it takes
minutes to hours. What belongs in the gate is a small guardian test holding the instrument's contract.

### 2. Negatives are reported beside positives, at the same prominence

The number that is bad for the project is reported in the same place, in the same form, as the number
that is good for it. An instrument that reports only its wins is not an instrument; it is a claim.
Development on this product has already been paused once by a negative result an instrument produced,
which is the standard the outputs are held to.

### 3. Every floor is stated and derived, never tuned

An instrument may use a floor — a minimum sample, a cut-off, a confidence bound. It must say what the
floor is, where it came from, and what the result would look like without it. What it must never do is
choose a floor because it produces a better number: a threshold with no derivation is a result about the
threshold. Thresholds are derived from the data and the pattern, written down before the run, and
disclosed with the method.

### 4. A run that did not finish is a row, not an absence

Every command an instrument drives carries a timeout, and a command that hangs becomes a row saying it
did not complete and why. A missing row and a failed row must never look the same, because the missing
one silently improves every aggregate computed over the rest.

### 5. The corpus is a mapping, not a sample

Repositories are chosen to cover axes — every shipped grammar at least once, idioms hostile to the
engine's own assumptions, repository shapes, a size ladder — with pinned revisions. A gap is then a named
gap rather than bad luck, and adding a repository because the result would look better is not adding
evidence.

### 6. It does not modify what it measures

An instrument may build throwaway state and must clean it up. It never leaves a repository in the corpus
altered, and it never writes into this repository outside the ignored results directory.

## Why

A measurement whose method is not stated is an anecdote with a number attached, and a measurement that
can also fail a build stops being run honestly the first time it is inconvenient. Keeping the two roles
apart — instruments measure, guardian tests gate — is what lets both be trusted.
