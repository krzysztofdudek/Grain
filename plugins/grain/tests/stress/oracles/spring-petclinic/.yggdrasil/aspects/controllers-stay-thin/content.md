# Controllers stay thin

There is no service layer in this application, and that is deliberate: a
controller talks to persistence directly. The price of that decision is that
the controller is the easiest place to drop business logic, and nothing
structural stops it. This rule is what stops it.

A controller's job is exactly five things:

1. Map a request to a handler.
2. Bind the request to a form object and configure what may be bound.
3. Run validation and translate failures into field errors the view can show.
4. Ask persistence for what it needs, or hand it what to save.
5. Choose a view name or a redirect, and put what the view needs on the model.

Everything else belongs on the domain object, or in a validator.

## What must hold

- A rule about what makes data valid or consistent lives on the entity or in a
  validator, not inside a handler method. Rejecting a form field is the
  controller's job; deciding what the rule *is* is not.
- Changing the state of a domain object is done by asking that object to
  change itself. A controller that reaches into an already-persistent object
  and assigns its fields one by one has taken over the object's job, and the
  next caller who needs the same change will either duplicate it or get it
  wrong.
- Anything a controller computes and hands to the view is presentation — a page
  number, a total, a message. A computation that would still be meaningful with
  no browser involved is domain logic.

## Judgment, not pattern-matching

The question to ask about a handler is: *if this application grew a second way
in — a scheduled job, an import, a different interface — would this code have
to be copied?* If yes, it is in the wrong place. If it would be meaningless
outside a request, it belongs here.

Some things that look like logic are not:

- Deciding which view to return after a success or a failure is flow control,
  and flow control is the controller's whole purpose.
- Reading a path variable, defaulting a page number, or stripping whitespace
  off a search term before querying is request handling.
- Attaching a flash message is presentation.

Some things that look small are logic anyway:

- Comparing an identifier from the URL against one in the form and deciding
  what that mismatch means.
- Copying a set of fields from a submitted object onto a stored one.
- Deciding whether two things count as duplicates.

Report what the code is doing and why it belongs elsewhere, not merely that a
method is long.
