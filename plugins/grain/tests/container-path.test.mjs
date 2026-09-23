// A Grain MCP server started by VS Code for a window attached to a dev container runs on the host, while the
// agent that names the repository runs inside the container, so the path it passes does not exist where Grain
// runs. Every running container's mounts name the host directory behind a container path; Grain translates
// through them, and refuses in words a path no container mounts. The `docker` here is a real program that
// answers the two commands Grain asks, for one container mounting a temporary directory at /workspaces/app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hostPathFor, findRoot } from '../engine/grain-context.mjs';

function fakeDocker(tmp, mounts) {
  const bin = join(tmp, 'docker');
  writeFileSync(bin, `#!/usr/bin/env node
const a = process.argv.slice(2);
if (a[0] === 'ps') { console.log('abc123'); process.exit(0); }
if (a[0] === 'inspect') { console.log(${JSON.stringify(JSON.stringify(mounts))}); process.exit(0); }
process.exit(1);
`);
  chmodSync(bin, 0o755);
  return bin;
}

test('a container path is translated through the mount that contains it, the longest one first', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'grain-mounts-'));
  try {
    const host = join(tmp, 'checkout');
    mkdirSync(join(host, 'src'), { recursive: true });
    const docker = fakeDocker(tmp, [
      { Type: 'bind', Source: tmp, Destination: '/workspaces' },
      { Type: 'bind', Source: host, Destination: '/workspaces/app' },
    ]);
    assert.equal(hostPathFor('/workspaces/app', { docker }), host);
    assert.equal(hostPathFor('/workspaces/app/src/', { docker }), join(host, 'src'));
    assert.equal(hostPathFor('/elsewhere/app', { docker }), null, 'a path no container mounts has no host name');
    assert.equal(hostPathFor('/workspaces/app/missing', { docker }), null, 'a host side that does not exist is not an answer');
    assert.equal(hostPathFor('/workspaces/app', { docker: join(tmp, 'no-docker') }), null, 'no docker, no translation');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('findRoot uses the translation, and refuses in words a path nothing mounts', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'grain-mounts-'));
  const savedPath = process.env.PATH;
  try {
    const host = join(tmp, 'checkout');
    mkdirSync(host, { recursive: true });
    fakeDocker(tmp, [{ Type: 'bind', Source: host, Destination: '/workspaces/app' }]);
    process.env.PATH = `${tmp}:${savedPath}`;
    assert.equal(findRoot({ repo: '/workspaces/app' }).root, host);
    assert.throws(() => findRoot({ repo: '/workspaces/other' }), /no running container mounts a host directory there/);
  } finally {
    process.env.PATH = savedPath;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('two containers mounting different checkouts at the same path: no guess, and findRoot names both', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'grain-mounts-'));
  const savedPath = process.env.PATH;
  try {
    const a = join(tmp, 'checkout-a'), b = join(tmp, 'checkout-b');
    mkdirSync(a, { recursive: true }); mkdirSync(b, { recursive: true });
    fakeDocker(tmp, [
      { Type: 'bind', Source: a, Destination: '/workspaces/app' },
      { Type: 'bind', Source: b, Destination: '/workspaces/app' },
    ]);
    process.env.PATH = `${tmp}:${savedPath}`;
    assert.equal(hostPathFor('/workspaces/app'), null);
    assert.throws(() => findRoot({ repo: '/workspaces/app' }), (e) => /2 different host directories/.test(e.message) && e.message.includes(a) && e.message.includes(b));
  } finally {
    process.env.PATH = savedPath;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('a .. in the container path cannot walk out of the mount it matched', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'grain-mounts-'));
  try {
    const host = join(tmp, 'checkout');
    mkdirSync(join(host, 'src'), { recursive: true });
    mkdirSync(join(tmp, 'secret'), { recursive: true });
    const docker = fakeDocker(tmp, [{ Type: 'bind', Source: host, Destination: '/workspaces/app' }]);
    assert.equal(hostPathFor('/workspaces/app/../secret', { docker }), null, 'normalised to /workspaces/secret, which nothing mounts — never the host directory beside the checkout');
    assert.equal(hostPathFor('/workspaces/app/x/../src', { docker }), join(host, 'src'));
    assert.equal(hostPathFor('workspaces/app', { docker }), null, 'a relative path is no container path');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
