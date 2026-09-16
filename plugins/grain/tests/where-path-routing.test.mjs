// `where <path>` was never recognised as a path: `cmdWhere` (grain-where.mjs) never called `relPath`, never
// checked for `/`, never asked whether the path existed — the query fell straight into `tokenize` (parse.mjs),
// which replaces every non-alphanumeric run with a space (`src/Domain/Constants/Roles.cs` →
// `src domain constant role cs`). `pathQuery` is the fix's wire: the caller (`cmdWhere`, after `relPath` and an
// existence/extension check — see `pathQueryFor` in grain-where.mjs) hands `whereCmd` an already repo-relative
// path string; an eval instrument may pass one straight through with no CLI involved at all.
//
// This ships DISCLOSURE only, not a ranking change. An earlier version of this fix also forced the exact-
// matching file/directory CARD's score to 1 outright (bypassing the ordinary tokenize/dirName ranking for that
// one card), since the exact-name pin structurally cannot fire on a path. Measured against `whereEval`'s own
// protocol (evals.mjs), restricted to commits that ADDED a file, on a path-shaped query (the directory a real
// historical commit's file was born into — an author about to place a file asks about a PLACE, not a filename)
// across 6 corpus repos (CleanArchitecture, spring-petclinic, gin, telescope.nvim, express, flask), repo-macro
// hit@3/MRR came out forced=0.981/0.909 vs the PRE-EXISTING naive path-token baseline `whereEval` already
// carries =1.000/0.958 — tied with or worse than the baseline it had to beat (a directory's own name is a
// literal substring of every file under it, so naive per-file token overlap is already a strong answer to
// "which directory is this"; the forced score=1 tie is then resolved by the unrelated card-type rank() order,
// which does not always prefer the directory card). A ranking change that does not beat its baseline does not
// ship, so that override was reverted. What DOES ship is unconditional: it changes no card's score, only what is
// printed alongside whatever already wins — the same locator `check <file>` already prints for a path
// (`inLineForFile`), now reachable from `where` too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whereCmd } from '../engine/core.mjs';

// mirrors tests/in-line-new-directory.test.mjs's fixture, plus a `partitions` shape so `buildCards` produces
// real file/directory cards for the ordinary ranking to work over.
function domainModel() {
  const files = [
    'src/Domain/Entities/TodoItem.cs',
    'src/Domain/ValueObjects/Colour.cs',
    'src/Domain/Constants/Roles.cs',
    'src/Application/Common/Mappings/MappingProfile.cs',
  ];
  const part = {
    name: '_root',
    medoids: [],
    assignments: {},
    facts: [],
    markers: {},
    files,
    fileScopes: {
      'src/Domain/Entities/TodoItem.cs': [['type', 'TodoItem', 1]],
      'src/Domain/ValueObjects/Colour.cs': [['type', 'Colour', 1]],
      'src/Domain/Constants/Roles.cs': [['type', 'Roles', 1]],
      'src/Application/Common/Mappings/MappingProfile.cs': [['type', 'MappingProfile', 1]],
    },
  };
  return {
    partitions: [part],
    steers: [],
    filesAll: files,
    pathsAll: files,
    pkgs: [],
    moduleGraph: {
      nodes: [
        { id: 'src/Domain', layer: 0 },
        { id: 'src/Application', layer: 1 },
      ],
      edges: [{ from: 'src/Application', to: 'src/Domain' }],
    },
  };
}

test('a path naming an EXISTING file gets the module locator as its FIRST line, ahead of the ordinary ranking', () => {
  const model = domainModel();
  const res = whereCmd({ model, query: 'src/Domain/Constants/Roles.cs', top: 3, pathQuery: 'src/Domain/Constants/Roles.cs' });
  assert.match(res.lines[0], /^in: src\/Domain\/ \(layer 0\) · used by 1 modules$/);
  // the ranking itself is untouched by `pathQuery` — the file still surfaces on its own ordinary lexical
  // merit (its path tokens are unique in this tiny model), never via a forced score
  assert.equal(res.hits[0].label, 'src/Domain/Constants/Roles.cs');
});

test('a path for a file that does not exist yet, under a module that DOES hold files, states the module — same numbers `check` would show', () => {
  const model = domainModel();
  const res = whereCmd({ model, query: 'src/Domain/Constants/Money.cs', top: 3, pathQuery: 'src/Domain/Constants/Money.cs' });
  assert.match(res.lines[0], /^in: src\/Domain\/ \(layer 0\) · used by 1 modules$/);
});

test('a path under a directory that does not exist at all states the absence and names the nearest existing ancestor — never a fabricated module', () => {
  const model = domainModel();
  const res = whereCmd({ model, query: 'tools/Codegen/Gen.cs', top: 3, pathQuery: 'tools/Codegen/Gen.cs' });
  assert.match(res.lines[0], /does not exist yet — nearest existing: the repo root/, res.lines[0]);
  assert.match(res.lines[0], /tools\/Codegen\//);
  // the same discipline `in-line-new-directory.test.mjs` locks in: no measurement may precede the disclosure
  assert.ok(
    !/\(layer \d+\) · used by \d+ modules$/.test(res.lines[0].split('does not exist')[0] || ''),
    `no measurement may precede the non-existence disclosure: ${res.lines[0]}`
  );
});

test('without pathQuery, behaviour is byte-identical to an explicit null (no regression on ordinary queries)', () => {
  const model = domainModel();
  const withoutPath = whereCmd({ model, query: 'TodoItem', top: 3 });
  const explicitNull = whereCmd({ model, query: 'TodoItem', top: 3, pathQuery: null });
  assert.deepEqual(withoutPath, explicitNull);
});

test("pathQuery never forces a card's score — the ranking is exactly what the SAME query produces without it", () => {
  const model = domainModel();
  const withPath = whereCmd({ model, query: 'src/Domain/Constants/Roles.cs', top: 3, pathQuery: 'src/Domain/Constants/Roles.cs' });
  const withoutPath = whereCmd({ model, query: 'src/Domain/Constants/Roles.cs', top: 3 });
  // the two calls' hits are identical in score/order/content — pathQuery only ever ADDS lines, never reorders or
  // rescales a hit (the measured, unshipped alternative did exactly that and was reverted — see this file's header)
  assert.deepEqual(withPath.hits, withoutPath.hits);
});

test('a placement signal (naming-pattern) is disclosed for a plausible new file, same wording `check` uses', () => {
  // 20+ same-suffix files concentrated in one directory by name-kin — `placementHit`'s own documented shape
  // (placement.mjs), reached from `where` via `pathQuery`.
  const files = [];
  const fileScopes = {};
  for (let i = 0; i < 20; i++) {
    const rel = `src/handlers/userWidget${i}.ts`;
    files.push(rel);
    fileScopes[rel] = [['function', `userWidget${i}`, 1]];
  }
  const part = { name: '_root', medoids: [], assignments: {}, facts: [], markers: {}, files, fileScopes };
  const model = { partitions: [part], steers: [], filesAll: files, pathsAll: files };
  const res = whereCmd({ model, query: 'src/other/userThing.ts', top: 3, pathQuery: 'src/other/userThing.ts' });
  assert.ok(
    res.lines.some(l => /placement: 20 of 20 `\*\.ts` files live under `src\/handlers\/`/.test(l)),
    res.lines.join('\n')
  );
});
