// Issue 223 — C# global usings are scoped per PROJECT (the nearest ancestor `.csproj`) on the single-file `check`
// path too, not only in the full pass the reference catalogue exercises. `check` resolves one edited file against
// the model: the model keeps each C# file's own global usings (`model.csFacts`), and the edited file's project scope
// is recomputed from them, the `.csproj` files on disk and the file's own live directives — so a global using of
// one project never reaches a file of another, and an edit that adds a global using is seen at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { parseFile } from '../../engine/parse.mjs';
import { relFactsFor, tableFrom, makeEdgeResolver, compactDecls, hydrateTable } from '../../engine/relations.mjs';

const FILES = {
  'src/api/Api.csproj': '<Project Sdk="Microsoft.NET.Sdk"></Project>\n',
  'src/api/GlobalUsings.cs': 'global using Api.Models;\n',
  'src/api/models/Customer.cs': 'namespace Api.Models;\npublic class Customer {}\n',
  'src/api/Controller.cs': 'namespace Api;\npublic class Controller { Customer _c; }\n',
  'src/worker/Worker.csproj': '<Project Sdk="Microsoft.NET.Sdk"></Project>\n',
  'src/worker/SyncJob.cs': 'namespace Worker;\npublic class SyncJob { Customer _c; }\n',
};

async function modelFor(root) {
  const cs = Object.keys(FILES).filter(f => f.endsWith('.cs'));
  const relFacts = {};
  for (const rel of cs) {
    const { p, tree } = await parseFile('.cs', FILES[rel]);
    relFacts[rel] = JSON.parse(JSON.stringify(relFactsFor(rel, FILES[rel], tree, p._g)));
    tree.delete();
  }
  const { csFacts } = tableFrom(cs, relFacts);
  return { files: cs, relFacts, relDecls: compactDecls(cs, relFacts), csFacts: JSON.parse(JSON.stringify(csFacts)) };
}
const checkResolve = (root, model, rel, fact) =>
  makeEdgeResolver({ root, fileSet: new Set(model.files), table: hydrateTable(model.relDecls), csFacts: model.csFacts, singleFile: true })(rel, fact);

test('check: a global using of one project binds a bare name in that project, never in another', async () => {
  const root = mkdtempSync(join(tmpdir(), 'grain-cs-scope-'));
  try {
    for (const [rel, c] of Object.entries(FILES)) {
      mkdirSync(join(root, dirname(rel)), { recursive: true });
      writeFileSync(join(root, rel), c);
    }
    const model = await modelFor(root);
    const api = checkResolve(root, model, 'src/api/Controller.cs', model.relFacts['src/api/Controller.cs']);
    assert.ok(api.some(e => e.to === 'src/api/models/Customer.cs'), `Api's own global using binds Customer: ${JSON.stringify(api)}`);
    const worker = checkResolve(root, model, 'src/worker/SyncJob.cs', model.relFacts['src/worker/SyncJob.cs']);
    assert.deepEqual(worker, [], `Api's global using must not reach the Worker project: ${JSON.stringify(worker)}`);
    // an edit in Worker that adds its own `global using Api.Models;` is read live from the edited file
    const edited = 'global using Api.Models;\nnamespace Worker;\npublic class SyncJob { Customer _c; }\n';
    const { p, tree } = await parseFile('.cs', edited);
    const fact = JSON.parse(JSON.stringify(relFactsFor('src/worker/SyncJob.cs', edited, tree, p._g)));
    tree.delete();
    const after = checkResolve(root, model, 'src/worker/SyncJob.cs', fact);
    assert.ok(after.some(e => e.to === 'src/api/models/Customer.cs'), `the edit's own global using is honoured: ${JSON.stringify(after)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
