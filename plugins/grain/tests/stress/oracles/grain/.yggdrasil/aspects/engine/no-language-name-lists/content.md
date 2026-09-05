# Nothing about a language, a framework or a role is written down here

This is the deepest rule in the product, and the one an agent under time pressure will break first,
because breaking it always looks like a small local fix that makes one repository's output better.

## The rule

The engine derives what a declaration, an import, a decorator, a supertype, a parameter or a return type
IS from each grammar's own node-type metadata. It enumerates features generically from syntax trees and
paths. It induces groups of similar code from what it finds. None of that may be replaced, shortcut, or
"corrected" by naming a language, a framework, a library, a directory convention or a file role in
engine code.

Forbidden, in any form:

- A branch keyed on a language name.
- A per-language list of node types, keywords, or constructs, where the grammar's own metadata could
  answer the question instead.
- A framework, library or decorator name treated as meaningful — recognising a specific web framework's
  route decorator, a specific test framework's assertion, a specific dependency-injection annotation.
- A name-based notion of what a file IS: test, spec, example, fixture, mock, benchmark, generated,
  vendored. Not in a regular expression, not in a list, not as a weight, not as an exclusion.
- A directory name treated as carrying meaning about the code in it.

## The declared exceptions, and their shape

Exactly two things are allowed to be per-language, and both live in the constant table rather than in
the engine:

1. **The extension-to-grammar map.** Which grammar parses which file extension cannot be derived from
   anything — it is a naming convention, which is exactly the kind of fact this map already is. It is
   declared in one place and the constant table's own comment says so.
2. **A declared ambiguity for one extension.** Where a single extension genuinely names two languages,
   the SIBLING grammar is declared and the decision is made per file by asking both and keeping the one
   that actually parsed the bytes — a measurement, not a name test. This is deliberately a declared pair
   and not a search over every shipped grammar, because several grammars accept nearly arbitrary text
   and would win such a search on anything.

A third category is allowed and is not an exception at all: reading a manifest for RESOLUTION. Package
manifests, module files, workspace definitions and the like may be read to resolve where a reference
points — which is a fact about the file system, not a statistical prior. They may never be read as
evidence about what the code practises.

## What to do instead

When a language's construct is invisible, the fix is in the derivation, not beside it. Ask the grammar's
own metadata a more general question: which node types declare both a name and a body; which field a
callable's result sits in; which node types the grammar itself distinguishes as extension versus
implementation. The engine's history is a series of such generalisations, each one closing a gap in
several languages at once precisely because it named none of them.

If the general question genuinely has no answer, the honest outcome is that the construct is not seen,
and the answer discloses that — not a name list that makes one repository look better and every unseen
one look identical.

## Why this one is worth defending

The claim the product makes is that it reads a repository rather than recognising it. A name list is the
difference between the two, and it is invisible from the outside: output improves on the repositories
somebody thought of and stays exactly as bad on the ones they did not, with no signal anywhere that a
boundary was crossed. Removing the name-based heuristics that once lived here was measured, and the
partitions they used to produce re-emerged from the general criterion on their own. That is the standard:
if a distinction is real, it falls out of the mathematics; if it only falls out of a word list, it was a
guess.
