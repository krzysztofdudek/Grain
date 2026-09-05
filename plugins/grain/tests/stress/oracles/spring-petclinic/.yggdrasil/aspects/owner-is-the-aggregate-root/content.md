# The owner is the aggregate root

An owner, the pets belonging to that owner, and the visits booked for those
pets form one unit. The owner is the root of that unit: it is the only part of
it with a repository, and everything else is reached, created and saved
through it.

This is why there is no pet repository and no visit repository in this
codebase. Their absence is a decision, not a gap someone has not got round to
filling. Pets cascade from the owner and visits cascade from the pet, so one
save of the owner writes the whole unit inside one transaction. Persisting a
child directly would step outside that transaction and outside the ordering
the cascade guarantees.

## What must hold

- A pet or a visit is created and attached through the owner that owns it. The
  owner offers the operations for this; use them rather than assembling the
  relationship by hand.
- A pet or a visit is persisted by saving the owner, never by saving the child
  on its own.
- No new repository is introduced for a pet, a pet's visits, or any other part
  of the unit that hangs off the owner. A lookup table that owners merely refer
  to — a pet's type, for example — is not part of the unit and legitimately has
  its own repository.
- Code outside this feature area does not reach past the owner to hold a pet or
  a visit and change it. Reading through the owner for display is fine.

## What this is not about

- The vet side of the application is a separate unit with its own root and is
  not judged by this rule.
- Reading a pet or a visit from an owner that has already been loaded, in order
  to render it, does not persist anything and is not a violation.
- A form object bound from a request is not persistent state; it becomes part
  of the unit at the moment it is attached to an owner, and that attachment is
  the thing this rule cares about.

## How to judge a file

Ask what the code does with a pet or a visit, not which types it mentions.

- Does it hand a pet or a visit to something that writes to the database
  without going through the owner? That is a violation.
- Does it build the parent-child link by assigning fields directly instead of
  using the owner's own operation for it? That is a violation, because the
  operation is where the duplicate-name and identity checks live.
- Does it declare a new way to load or store a child of the owner
  independently? That is a violation.
- Does it only read, render, or validate? Not a violation.

A file that never touches a pet or a visit satisfies this rule with nothing to
say about it.
