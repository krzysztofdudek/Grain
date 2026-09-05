# The published surface documents itself

This repository has no generated API reference. The doc comment above each
member of the request, response and application prototypes IS the reference —
what is on the website was written from these comments, and a reader who
follows a stale example here gets a bug with express's name on it.

Judgment is asked for here rather than a script because the question is whether
a comment is *true of the code beneath it*, which no pattern can answer.

## What must hold

For every member assigned onto an exported prototype (`req.*`, `res.*`,
`app.*`) or exported from the module:

1. **A doc comment exists**, immediately above the assignment.

2. **Visibility is stated** — `@public` for supported surface, `@private` for
   internals. A member with neither is a member nobody can tell the status of;
   that is the defect, regardless of which one it should have been.

3. **Every parameter the function accepts appears** in the comment, and every
   parameter the comment names still exists. This includes overloads: where a
   function decides its behaviour by inspecting `arguments.length` or the type
   of an argument, each accepted call shape is described.

4. **The return is described** where the function returns something other than
   `undefined`, and where it returns `this` for chaining, the comment says so.

5. **Every code example in the comment would still run and still produce the
   result it claims.** This is the clause that decays: an example is written
   once and the behaviour moves under it. Check the example against the body
   directly beneath it — the argument order, the option names, the header or
   status the example says it produces.

6. **A thrown error is documented.** Where the body throws (a `TypeError` for a
   wrong argument type, a `RangeError` for an out-of-range status code), the
   comment names the condition. A caller cannot handle what it does not know is
   possible.

## What is NOT a violation

- A private helper that is not assigned onto a prototype and not exported,
  documented with one line or with nothing. This rule is about the surface.
- A comment being terse. Short is fine; wrong is not.
- Prose you would have phrased differently. The question is whether it is true
  and complete, not whether it is elegant.
- A member deliberately marked `@private` that is nevertheless reachable —
  express has several, and marking them is exactly the right answer.

## How to report

Name the member (`res.sendFile`), the clause that fails, and — for a stale
example — quote the line of the example and the line of code that contradicts
it. A finding a maintainer cannot check in ten seconds is not yet a finding.
