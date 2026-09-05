# Project state moves through the tools

The committed project state — tickets and their logs, the queue, the handoff, the escalation ledger, the
decision register — is the only thing that lets a session be resumed from the repository alone. It is
written by the tools that own it and never by hand.

## Rules

### 1. One writer per file

Each state file has exactly one tool that writes it. A second writer means two ideas of the format, and
they diverge on the first entry neither anticipated.

### 2. No hand edits

An entry is added by running the tool, not by opening the file. Several agents work in parallel here and
a hand edit made against a stale read silently drops whatever landed in between — and a dropped entry is
indistinguishable from a decision nobody made.

### 3. The decision register is append-only in spirit

A ruling that has been paid for is not re-derived and not rewritten. When one is overturned, a new entry
is added that refers to the old one and says what measurement overturned it. Editing the old entry
destroys the only record that the question was ever open.

### 4. A log entry stands on its own

An entry is read later, by someone with none of the context that produced it. It carries its reasoning
in its own prose: no pointers to a plan, a step number, a scratch file, a branch, or a conversation. What
changed is in the diff; the entry is why.

### 5. Nothing under here is reachable from the shipped plugin

This is process, not product. No file the plugin ships may read, import, or depend on any of it.

## Why

This project's own recorded lessons include two agents losing work to a hand restore and a duplicated
dispatch caused by a state read that was already stale. The tools exist because those happened.
