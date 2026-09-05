# A user-visible change reaches History.md

express is depended on by a very large number of applications whose authors
will never read this repository. `History.md` is the only channel between a
change made here and a person upgrading — and the entries have to be written
for that person, not for the people who made the change.

## What must hold

Compare the module under review against the "Unreleased Changes" section of
`History.md` (supplied as a reference).

1. **Every behaviour a caller could observe has an entry.** Observable means:
   a method's accepted arguments or return value; a header emitted or no longer
   emitted; a status code chosen; a default setting; an error thrown where none
   was thrown before; the shape of anything on `req` or `res`. If an
   application could behave differently after upgrading, it is observable.

2. **The entry says what changed, not what was edited.** Name the method and
   the behaviour. Do not name a file, a function that is not part of the
   surface, or the internal mechanism. "res.send() now adds Content-Length only
   when there is no Transfer-Encoding" is the form; "refactored header handling
   in the send path" is not.

3. **A breaking change says what the caller must now write instead.** The 5.0.0
   entries are the standard here: `res.redirect('back')` was removed and the
   entry names the replacement expression. An entry that says only what was
   taken away leaves every affected reader to work out the migration
   themselves.

4. **A behaviour change that arrives through a dependency upgrade is still the
   user's business.** When bumping a dependency changes a header this package
   emits, that consequence belongs in the entry — the reader is upgrading
   express, not the dependency, and cannot be expected to read its changelog.

5. **A pure internal change gets no entry.** A refactor with identical
   observable behaviour, a test, a comment, a workflow change: nothing.
   Padding the file makes the entries that matter harder to find.

## What is NOT a violation

- An entry with no pull-request link, when the change is not yet merged.
- Wording you would have chosen differently.
- An observable change already recorded under a released version heading rather
  than "Unreleased" — that means it has shipped, which is the point.

## How to report

Name the observable behaviour that changed and the clause that fails (missing
entry / internal vocabulary / no migration line). Where an entry exists but is
written in internal terms, quote it and say what a user would need it to say.
