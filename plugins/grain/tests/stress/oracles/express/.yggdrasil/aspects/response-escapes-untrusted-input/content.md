# The response prototype encodes what it emits

This module is where values chosen by a client become bytes a browser
interprets. Every escaping decision in it was arrived at through a reported
vulnerability, and each one is easy to lose in a refactor because the
unescaped version looks correct and passes every functional test.

The rule is judged rather than scripted because it is about *provenance* —
whether a particular value could have come from the request — which requires
following the value, not matching a pattern.

## What must hold

For each response method, a value that could originate in a request must be
encoded for its destination before it is written:

1. **Into an HTML body** — escaped as HTML. The redirect body renders the
   target URL for browsers that display it; that URL is caller-supplied and is
   escaped before interpolation. Any new branch that puts a value into markup
   here does the same.

2. **Into a `Location` or `Link` header** — URL-encoded, so a value containing
   a newline cannot introduce a second header, and so control characters cannot
   truncate the field.

3. **Into `Content-Disposition`** — built by the content-disposition library
   rather than by string concatenation. Filenames arrive from callers, carry
   quotes and non-ASCII characters, and the header's quoting rules are not
   something to reimplement inline.

4. **Into a JSONP response** — the callback name comes from the query string
   and is the highest-risk value in the file. It must stay restricted to a
   conservative character set, the response must be typed as JavaScript, the
   nosniff header must be set, and the body must remain wrapped in a leading
   comment so the response cannot be interpreted as another content type by a
   plugin that guesses. Escaping the two Unicode line separators U+2028 and
   U+2029 in the body is part of this: both are valid inside a JSON string and
   both terminate a line in JavaScript, so a response that is correct JSON can
   be invalid script without them.

5. **Into a cookie** — serialised by the cookie library, and signed values
   signed with the configured secret rather than concatenated.

Where a value is deliberately NOT escaped, the reason is stated in a comment
at that line. An unexplained raw interpolation is a violation even when it is
currently unreachable, because the next edit is what makes it reachable.

## What is NOT a violation

- A value that provably originates in application code rather than the request
  (a status message from the statuses table, a constant in this file).
- Escaping performed by a called library rather than inline here — that is the
  preferred form, not a gap.
- Double-encoding concerns. This rule asks whether encoding happens, not
  whether it is minimal.

## How to report

Name the method, the value, and the path by which a request could control it —
"the `filename` argument to res.download reaches the Content-Disposition header
unencoded" — plus the destination it lands in. A finding that does not trace
the value back to the request is not yet a finding.
