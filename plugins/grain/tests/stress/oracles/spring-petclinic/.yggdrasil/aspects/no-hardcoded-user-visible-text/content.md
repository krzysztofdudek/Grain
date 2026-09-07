# No hard-coded user-visible text in a template

This application ships in eleven languages. Any string a user actually reads
must come from a message bundle, so that it is translated everywhere and so
that a missing translation is a reported gap rather than an English word
sitting in the middle of a Japanese page.

## Where the text can hide

A template can put text on the page in more ways than one, and only the most
obvious of them is caught by anything else in this repository:

- Between tags. This is the obvious case.
- As an argument passed into a shared fragment — a field label, for instance.
  The fragment then renders the argument as text, so the string reaches the
  page even though it never appeared between tags in this file.
- Inside an expression that computes text — a conditional choosing between two
  words for a button, a string joined together for a heading.
- In an attribute the browser shows to the user: a title, a placeholder, an
  alternative text for an image.

All four are user-visible text, and all four are in scope.

## The one legitimate exception

A page may hold a literal string as *fallback content* — the text a static
preview of the template shows when the template engine has not run. It is
recognisable because the same element also names a message key, and the key is
what wins at render time. Fallback content is not a violation, and asking for
it to be removed would make the templates unopenable in a browser.

The test is therefore not "is there an English word in this file" but "does
this English word reach a rendered page". If a message key governs that
position, the answer is no.

## What is out of scope

- Element names, attribute names, css classes, identifiers, urls and icon
  names. None of these are read as language.
- Numbers, dates and punctuation produced by formatting.
- Text inside a script block that is never shown to a user.

## Reporting

Name the exact string and say how it reaches the page — between tags, as a
fragment argument, from an expression, or in a visible attribute. That
distinction is the useful part of the finding: a maintainer who knows the
string is a fragment argument also knows why the existing scan never flagged
it.
