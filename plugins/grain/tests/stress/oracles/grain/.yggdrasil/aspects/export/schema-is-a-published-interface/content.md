# The export schema is an interface, not an output format

Every other surface here answers a question with a cut, and a cut may change whenever a better cut is
found. This one answers no question and cuts nothing it holds, and something outside this repository
reads it: a separate pipeline cuts training samples from the anchor lines it emits. That makes the shape
of this output a contract rather than a rendering.

## Rules

### 1. A field rename or a semantic change is breaking, and is treated as one

Renaming a field, changing what a field means, changing its type, changing the unit of a number, or
changing the granularity of a collection breaks the consumer. Each is a deliberate act with a version
attached — never a side effect of a rename inside the engine, never "the internal name changed so the
exported name followed".

The internal name and the exported name are allowed to drift apart. That is what an interface is.

### 2. Additive change is the default path, and needs no break

A new convention family, a new per-fact attribute, a new derived figure: these flow through the same
generic per-fact serialization and appear as new keys. A consumer that does not know them ignores them.
Adding is free; the version stays where it is, and the fact that it has stayed there through many
additions is evidence the interface is right, not evidence that nobody maintains it.

### 3. The schema version is carried in the output

The output names its own schema version. A consumer must be able to tell, from the document alone,
which contract it is holding — not from a changelog it does not have and not from the shape it happens
to see.

### 4. Anchors are part of the contract

The lines inside each site where a convention manifests — the decorator line, the import lines, the call
lines, the header — are what the downstream pipeline masks around. Their meaning ("the lines where this
convention is visible in this site") and their coordinate system are as much of the interface as the
field names, and changing either is a breaking change even if no key is renamed.

### 5. Truncation is disclosed, in the data

Where the export caps a collection, the document says that the collection was capped and what it was
capped at. A consumer computing a rate over a silently truncated list produces a number that is wrong in
a direction nobody can detect from the output.

## Why

The reason to write this down rather than to trust care: an engine refactor that renames an internal
concept touches this file for reasons that have nothing to do with the interface, and the rename looks
correct in every review that does not know a stranger is reading the result. The consumer is not in this
repository, will not fail the build, and will discover the break as silently degraded training data.
