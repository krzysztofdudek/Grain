import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the service + provider TYPE FQNs of module-info uses / provides directives', async () => {
  // `module-info.java`: `uses TypeName` and `provides TypeName with TypeName…` carry
  // genuine shadow-free service-type FQNs → TYPE hints. `requires`/`exports`/`opens`
  // carry module/package names and MUST be excluded.
  const { uses } = await run(
    [
      'module com.example.foo {',
      '  requires com.acme.req.ReqType;',
      '  exports com.acme.exp.ExpType;',
      '  opens com.acme.opn.OpnType;',
      '  uses com.acme.spi.Intf;',
      '  provides com.acme.spi.Intf with com.acme.impl.Impl, com.acme.impl.Impl2;',
      '}',
      '',
    ].join('\n'),
  );
  const s = specs(uses);
  // uses + provides operands (service + both providers) are emitted as TYPE hints.
  expect(s).toContain('com.acme.spi.Intf');
  expect(s).toContain('com.acme.impl.Impl');
  expect(s).toContain('com.acme.impl.Impl2');
  // requires / exports / opens operands are NEVER emitted (module/package names).
  expect(s).not.toContain('com.acme.req.ReqType');
  expect(s).not.toContain('com.acme.exp.ExpType');
  expect(s).not.toContain('com.acme.opn.OpnType');
  // All emitted hints are TYPE hints (not package wildcards).
  expect(uses.every((u) => u.candidates[0].kind === 'path' && u.candidates[0].isPackage !== true)).toBe(true);
});
