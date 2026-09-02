// §080 — the locator line must not assert a place that does not exist.
//
// `check <file> --as <a path in a directory that does not exist yet>` is the ONE call an author makes
// before writing the first file of a new directory — the case ticket 080 was opened for (trial-0.4.0 §4b:
// an author creating `src/Domain/Constants/`, where grain had nothing certified to say). `inLineForFile`
// answered it with `in: tools/Codegen/ · used by 0 modules`: a module id no file in the repository lives
// under, and a fan-in count of 0 that reads as a measured fact about a real place rather than the absence
// of a place. Same disease class as §057's "this concept isn't in the repository" and §070's
// no-content-foothold banner — an answer whose confident shape outruns what was actually observed.
//
// The fix says the directory does not exist and hands back the nearest ancestor that DOES, with that
// ancestor's own real layer and fan-in. Nothing is predicted and no threshold is introduced: "has a file
// under it" is a fact about `pathsAll`/`filesAll`, and the ticket's measurement (research/
// where-new-directory.md) is why nothing more than this is claimed — every mineable directory-birth
// signal tested there failed 073's own acceptance bar.
import { test } from 'node:test';
import assert from 'node:assert';
import { inLineForFile } from '../engine/core.mjs';

// a minimal model of the shape `learn` produces: two real modules, one of which the graph knows a layer for
const model = () => ({
  filesAll: [
    'src/Domain/Entities/TodoItem.cs',
    'src/Domain/ValueObjects/Colour.cs',
    'src/Application/Common/Mappings/MappingProfile.cs',
  ],
  pathsAll: [
    'src/Domain/Entities/TodoItem.cs',
    'src/Domain/ValueObjects/Colour.cs',
    'src/Application/Common/Mappings/MappingProfile.cs',
  ],
  pkgs: [],
  moduleGraph: {
    nodes: [
      { id: 'src/Domain', layer: 0 },
      { id: 'src/Application', layer: 1 },
    ],
    edges: [{ from: 'src/Application', to: 'src/Domain' }],
  },
});

test('§080 a path inside an EXISTING module still reads exactly as before', () => {
  // `src/Domain/Constants/` does not exist, but the REFINED MODULE (`src/Domain`, ≤2 segments) does — the
  // module holds files, so the locator's layer and fan-in are real measurements and must not be hedged.
  const line = inLineForFile(model(), 'src/Domain/Constants/Roles.cs');
  assert.match(line, /^in: src\/Domain\/ \(layer 0\) · used by 1 modules$/);
});

test('§080 a path whose module has NO files never claims a layer or a fan-in for it', () => {
  const line = inLineForFile(model(), 'tools/Codegen/Gen.cs');
  // the pre-fix output was `in: tools/Codegen/ · used by 0 modules` — a real-looking reading of a place
  // that is not there. Whatever the wording, it must never assert a bare fan-in for the absent module.
  assert.ok(
    !/^in: tools\/Codegen\/ · used by \d+ modules$/.test(line),
    `locator asserts a fan-in for a module with no files: ${line}`
  );
  assert.match(line, /does not exist/, `locator must say the directory is not there: ${line}`);
  assert.match(line, /tools\/Codegen\//, `locator must still name the path asked about: ${line}`);
});

test('§080 the hedged locator names the nearest ancestor that does exist, with ITS real numbers', () => {
  // `src/Reporting/` has no files; `src/` does. The ancestor's layer/fan-in are the only measured numbers
  // in the line, and they must be attributed to the ancestor, never to the absent directory.
  const m = model();
  const line = inLineForFile(m, 'src/Reporting/Exporters/CsvExporter.cs');
  assert.match(line, /does not exist/);
  assert.match(line, /src\//);
  assert.ok(!/\(layer \d+\) · used by \d+ modules$/.test(line.split('does not exist')[0] || ''),
    `no measurement may precede the non-existence disclosure: ${line}`);
});

test('§080 a repo with no module graph still returns null, unchanged', () => {
  assert.equal(inLineForFile({ filesAll: ['a.cs'], pathsAll: ['a.cs'] }, 'x/y.cs'), null);
});
