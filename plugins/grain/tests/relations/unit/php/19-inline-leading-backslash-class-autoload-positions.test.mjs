import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits inline LEADING-BACKSLASH class references in class-autoload positions (extends/implements/trait-use/new/static)', async () => {
  // A leading-`\` FQN is absolute (resolved from the global namespace, shadow-free), so an
  // inline reference in a class-autoload position is a real, zero-false-positive edge. The
  // resolver maps the FQN to a file by PSR-4 exactly as for an import.
  const { uses } = await run(
    [
      '<?php',
      'namespace App\\App;',
      'class C extends \\App\\Base\\Base implements \\App\\Flow\\Flowable {',
      '  use \\App\\Mixin\\Timestamps;',
      '  function m() {',
      '    $o = new \\App\\Metrics\\Timer();',
      '    \\App\\Audit\\AuditLog::record("x");',
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  const s = specs(uses);
  expect(s).toContain('App\\Base\\Base'); // extends
  expect(s).toContain('App\\Flow\\Flowable'); // implements
  expect(s).toContain('App\\Mixin\\Timestamps'); // in-body trait use
  expect(s).toContain('App\\Metrics\\Timer'); // new
  expect(s).toContain('App\\Audit\\AuditLog'); // static call scope
  expect(s).toHaveLength(5);
});
