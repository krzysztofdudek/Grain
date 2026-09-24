// Every case of the relation reference catalogue (tests/relations/reference/<language>/<id>.md — Yggdrasil 6.1.0's
// name-resolution catalogue, copied verbatim) through grain's own relation pipeline: one test per case, the case's
// `## Expect` asserted exactly, silence included. See runner.mjs for how a case is run and read.
import { describe, test } from 'node:test';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOGUE, caseIds, runCase } from './runner.mjs';

const languages = readdirSync(CATALOGUE).filter(d => statSync(join(CATALOGUE, d)).isDirectory()).sort();
for (const language of languages)
  describe(`relation catalogue — ${language}`, () => {
    for (const id of caseIds(language)) test(id, () => runCase(language, id));
  });
