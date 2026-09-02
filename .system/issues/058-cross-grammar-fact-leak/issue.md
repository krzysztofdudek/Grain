# 058 · `explain composer.json` reports PHP-shaped facts on a JSON manifest (`auto.imp:PHPUnit\Framework\TestCase = false`)

**Status:** FIXED — applyVocab no longer scores data-grammar files against auto.imp: import tokens (code-vs-data bar); code-vs-code cross-grammar leaks left as separate narrower scope
A JSON file is being scored against cells whose predicates belong to another grammar's population. The `= false`
rows are "this file does not import a PHP class" — vacuously true and pure noise. **Establish:** whether `_all:`/
directory cells mix grammars, and whether a file should only be scored against cells drawn from its own grammar's
population (or at least data vs code). This may also be the cause of 054's 1-scope files diluting neff.
