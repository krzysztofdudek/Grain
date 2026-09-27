// Run from plugins/grain: node --import ./tests/git-env.mjs --test tests/windows-launcher.test.mjs
// How a `yg` found on a Windows PATH is launched (issue 481): npm leaves an extensionless sh shim, a .cmd and a .ps1
// there, and none of them can be spawned without a shell. The .cmd names the script it runs; that script is run with
// this node directly. Runs on every OS: the shim is a file this test writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { windowsLauncher } from '../engine/propose-base.mjs';
import { removeTemp } from './remove-temp.mjs';

test('an npm .cmd shim runs its script with this node, not through a shell', () => {
  const dir = mkdtempSync(join(tmpdir(), 'grain-winlaunch-'));
  try {
    const script = join(dir, 'node_modules', '@chrisdudek', 'yg', 'dist', 'bin.js');
    mkdirSync(join(dir, 'node_modules', '@chrisdudek', 'yg', 'dist'), { recursive: true });
    writeFileSync(script, '');
    const shim = join(dir, 'yg.cmd');
    writeFileSync(shim, '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n\r\nendLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@chrisdudek\\yg\\dist\\bin.js" %*\r\n');
    const got = windowsLauncher([join(dir, 'yg'), shim, join(dir, 'yg.ps1')]);
    assert.equal(got.have, true);
    assert.equal(got.cmd, process.execPath);
    assert.deepEqual(got.pre, [script]);
  } finally {
    removeTemp(dir);
  }
});

test('an older shim form ("%~dp0\\…") is read too', () => {
  const dir = mkdtempSync(join(tmpdir(), 'grain-winlaunch-'));
  try {
    writeFileSync(join(dir, 'cli.js'), '');
    const shim = join(dir, 'yg.cmd');
    writeFileSync(shim, '@"%~dp0\\cli.js" %*\r\n');
    assert.deepEqual(windowsLauncher([shim]).pre, [join(dir, 'cli.js')]);
  } finally {
    removeTemp(dir);
  }
});

test('an .exe runs as it is; a .cmd with no readable script falls back to cmd.exe; no launcher at all is absent', () => {
  assert.deepEqual(windowsLauncher(['C:\\bin\\yg', 'C:\\bin\\yg.exe']).pre, []);
  assert.equal(windowsLauncher(['C:\\bin\\yg', 'C:\\bin\\yg.exe']).cmd, 'C:\\bin\\yg.exe');
  const viaCmd = windowsLauncher(['C:\\x\\yg.cmd'], { read: () => '@echo off\r\n' });
  assert.deepEqual(viaCmd.pre.slice(-2), ['/c', 'C:\\x\\yg.cmd']);
  assert.equal(windowsLauncher(['C:\\x\\yg', 'C:\\x\\yg.ps1']).have, false);
});
