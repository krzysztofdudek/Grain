# 056 · YAML/JSON files yield exactly 1 scope regardless of content — a service id declared in YAML is unfindable

**Status:** FIXED — b.dataContainer (node-types.json-derived) fixes YAML mapping keys sharing a container; JSON/YAML/TOML key-to-declaration promotion rejected and documented as permanent boundary in validation.md
`explain services9.yml` (a fixture defining 10+ named services with tags/args/calls) → 1 scope.
`what "foo.baz"` (the literal id of one of those services) → never surfaces the YAML declaration; visible only as
an undifferentiated string-literal value. The data grammars (J7.2, this release) parse but expose nothing findable.
**Establish:** what `b.keyField`/`keyPathOf` currently record for YAML mappings, and whether top-level keys should
be declarations. First field test of the data grammars; the answer may be "values only, by design" — then say so
in docs. Do not add a YAML-specific rule.
