# Degrade, never crash; never lie about it

This runs inside somebody else's editor, on repositories nobody here has seen. The contract every entry
path is held to is three words long: degrade, never crash, never lie.

## Rules

### 1. A hostile repository produces an answer, not a stack trace

Empty, no history, shallow, detached, mid-rebase, unreadable in places, full of symbolic links, mass
renames, files that are not valid text, a repository being written to while it is read: each of these
produces an ordinary answer that says what could not be done. None of them produces an unhandled
failure, a hang, or a partial write.

### 2. Exit codes stay in their lane

An invocation that answered — including one whose honest answer is "nothing here" — exits zero. The only
non-zero exit belongs to the case where the caller explicitly asked for something that does not exist
and refused to have it built. A hook exits zero unconditionally, on every path, whatever it found: a
non-zero exit there interrupts an edit that has nothing to do with this tool.

### 3. Every answer says which commit it was computed from

The freshness stamp is part of the answer, not decoration. A stale index says so rather than quietly
answering from old data. An answer that incorporated uncommitted bytes is marked as such — and ONLY the
commands that actually read the working tree may carry that mark. A command that answered from the
indexed commit alone and merely noticed a dirty tree discloses that separately; claiming otherwise would
be a false statement about where the answer came from, which is worse than the omission it was meant to
fix.

### 4. Missing capability is disclosed, never silently absent

When the analysis could not reach something — no grammar for a language present in the tree, an
extractor that resolves only one kind of reference, no history to weigh anything with, a truncated
population — the answer says so, in the answer, and says what it means for what is above it. A
disclosure must be true and specific: naming one uncovered file while a hundred and thirty-two are
uncovered is worse than saying nothing, because it certifies an absence that is not there.

### 5. A failure inside a hook never surfaces as the tool's failure

The hooks run unbidden and are the only surface with nobody in front of it. They swallow their own
faults. The one place a hook may speak about its own failure is the once-per-session moment, where
silence would cost an entire session's context and the noise cost of speaking is paid once — and that
exception is stated where it is taken, not left for a reader to infer.

### 6. Nothing is written outside the store, ever

Answering a question writes into the index directory under the repository being examined and nowhere
else. No file in the user's tree is created, moved or modified by a query, a hook, or a read. The store
is disposable by construction: deleting it must cost only rebuild time, never data.

## Why

A tool that occasionally halts an unrelated edit is uninstalled long before anyone debugs why. And a
tool that answers confidently from a repository it could only half read is worse than one that crashed,
because the crash is visible and the wrong answer is not. Degrading loudly is the only version of this
that stays useful on the tenth repository as well as the first.
