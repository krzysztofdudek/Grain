# A pet's name is unique within its owner, in every dialect

One owner must not end up with two pets of the same name. Names are compared
without regard to case: "Max" and "max" are the same pet name for the same
owner.

The application checks this before saving, but the application check is not the
guarantee. Two requests arriving at the same moment both pass it and both
save, and the duplicate exists. The database constraint is the guarantee; the
application check exists only so the user gets a field error instead of an
error page. There is a test that fires two simultaneous requests precisely to
prove the constraint, not the check, is doing the work.

## What must hold

Every dialect's schema must make the duplicate impossible, and must do so
case-insensitively.

Each database expresses this differently, and all three ways are legitimate:

- A uniqueness declaration over the owner reference and the name together,
  where the name column itself compares without case.
- A uniqueness declaration over the owner reference and the name together, on
  a database whose collation already ignores case for that column.
- A unique index over the owner reference and a case-folded expression of the
  name.

What matters is the effect, not the spelling. Read each schema and answer one
question: on this database, can the same owner hold two pets whose names differ
only in case? If the answer is yes for any of the three, the rule is violated
for that dialect.

## Why all three, every time

The dialect that runs is chosen at startup by a profile. A developer runs one
of them; CI runs all three, but only the paths that reach a real database.
A constraint added to one schema and forgotten in another therefore looks
completely correct to the person who wrote it. This has already happened once
in this repository, in the opposite direction: a constraint written for one
dialect had to be rewritten because the syntax that expressed it there did not
mean the same thing on another.

## What is out of scope

- Whether the seed data happens to contain duplicates.
- Uniqueness of anything other than a pet's name within its owner. Two
  different owners may each have a pet called Max, and must be able to.
- The application-level check itself; it is a convenience, and it is judged
  elsewhere.
