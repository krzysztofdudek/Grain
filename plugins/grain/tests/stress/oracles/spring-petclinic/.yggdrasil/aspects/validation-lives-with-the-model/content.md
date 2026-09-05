# Validation lives with the model

There are two places a validation rule can live in this application, and the
choice between them is not a matter of taste.

**On the field.** A constraint that is true of one field in isolation —
required, maximum length, a pattern the value must match — is declared as an
annotation on that field of the entity. Declared there it is enforced on every
path into the object: the web form, the persistence layer, and any test that
validates the object directly. It also travels with the field: whoever moves
or renames it cannot leave the constraint behind.

**In a validator.** A rule that needs more than one field, or that depends on
something outside the object — whether it is new, what else the owner already
has, what today's date is — goes in a validator. These cannot be expressed as a
field annotation without inventing a fiction, and trying to do so produces a
constraint that is wrong in some of the situations it applies to.

## What must hold

- A single-field constraint is not re-implemented in code when the annotation
  already expresses it. Two statements of the same limit drift, and the one in
  code is the one nobody reads.
- A validator does not enforce something a field annotation already enforces on
  the same object.
- A field annotation is not stretched to express a rule that actually depends
  on other state.
- A limit that the database also enforces — a column width — is declared on the
  field too, so the failure is a field error rather than a persistence
  exception surfacing as an error page.

## What is out of scope

- Whether a particular limit is the right number.
- Where the message text for a failure comes from.
- Anything about how a controller reports the failures once they exist.

## How to judge

For each validation rule the file states, ask whether it could be expressed as
a constraint on one field of one object, with no other information. If it
could and it is not, say so. If it could not and it is being forced into a
field annotation, say so. If the same rule appears in both places, say which
one should survive and why.
