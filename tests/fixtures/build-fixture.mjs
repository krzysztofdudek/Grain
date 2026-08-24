#!/usr/bin/env node
// Builds the deterministic fixture repository grain's tests run against: a small TypeScript service with
// convention-dense directories (handlers, services, guards, dtos) and a scripted git history whose dates are
// pinned, so two builds are byte-identical and the engine's answers are reproducible.
//
//   node tests/fixtures/build-fixture.mjs <outDir>
//
// Conventions planted on purpose (what `where`/`check` must find):
//   src/handlers/*.handler.ts  — `@Handler()` classes named *Handler, `handle()` calls `validate()` first, import `../core/handler`
//   src/services/*.service.ts  — `@Injectable()` classes extending `BaseService`
//   src/guards/*.guard.ts      — classes implementing `CanActivate` with a `canActivate()` returning `true`
//   src/dto/*.dto.ts           — classes extending `BaseDto`
//   test/handlers/*.test.ts    — co-change partner of the handler it tests
// One deviant is planted in the last commit: src/handlers/refund.handler.ts lacks `@Handler()` and skips validate().
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const out = process.argv[2]; if (!out) { console.error('usage: build-fixture.mjs <outDir>'); process.exit(2); }
if (existsSync(out)) rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const env = { ...process.env, GIT_AUTHOR_NAME: 'Fixture Author', GIT_AUTHOR_EMAIL: 'fixture@example.com', GIT_COMMITTER_NAME: 'Fixture Author', GIT_COMMITTER_EMAIL: 'fixture@example.com', TZ: 'UTC', HOME: out };
const g = (args, extra = {}) => execFileSync('git', ['-C', out, ...args], { env: { ...env, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const w = (rel, content) => { const p = join(out, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
let day = 0; const T0 = Date.UTC(2024, 0, 15, 12, 0, 0);
function commit(msg, daysLater = 20) { day += daysLater; const d = new Date(T0 + day * 86400000).toISOString();
  g(['add', '-A']); g(['commit', '-q', '-m', msg], { GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d }); }

g(['init', '-q', '-b', 'main']);
g(['config', 'commit.gpgsign', 'false']);
w('package.json', JSON.stringify({ name: 'fixture-orders', version: '1.0.0', private: true, type: 'module' }, null, 2) + '\n');
w('src/core/handler.ts', `export function Handler(): ClassDecorator { return () => {}; }\nexport function validate(cmd: unknown): void { if (!cmd) throw new Error('invalid'); }\nexport interface Command { readonly kind: string; }\n`);
w('src/core/service.ts', `export function Injectable(): ClassDecorator { return () => {}; }\nexport class BaseService { protected logger = { info(_m: string) {}, warn(_m: string) {} }; }\n`);
w('src/core/guard.ts', `export interface CanActivate { canActivate(ctx: unknown): boolean; }\n`);
w('src/core/dto.ts', `export class BaseDto { validate(): boolean { return true; } }\n`);
commit('core: scaffolding', 0);

const nouns = ['order', 'cart', 'invoice', 'payment', 'shipment', 'customer', 'product', 'stock', 'coupon', 'refund', 'return', 'address', 'review', 'wishlist', 'subscription', 'notification', 'audit', 'report', 'export', 'import', 'pricing', 'tax', 'warehouse', 'supplier', 'catalog', 'session', 'token', 'profile', 'ticket', 'dispute'];
const cap = s => s[0].toUpperCase() + s.slice(1);
const verbs = ['Create', 'Update', 'Cancel', 'Archive'];

function handler(n, verb, deviant = false) {
  return `import { Handler, validate, type Command } from '../core/handler';\nimport { ${cap(n)}Service } from '../services/${n}.service';\n\nexport interface ${verb}${cap(n)}Command extends Command { readonly ${n}Id: string; }\n\n${deviant ? '' : '@Handler()\n'}export class ${verb}${cap(n)}Handler {\n  constructor(private readonly service: ${cap(n)}Service) {}\n\n  async handle(cmd: ${verb}${cap(n)}Command): Promise<void> {\n${deviant ? '' : '    validate(cmd);\n'}    const entity = await this.service.load(cmd.${n}Id);\n    await this.service.apply(entity, '${verb.toLowerCase()}');\n  }\n}\n`; }
function service(n) {
  return `import { Injectable, BaseService } from '../core/service';\n\n@Injectable()\nexport class ${cap(n)}Service extends BaseService {\n  async load(id: string): Promise<{ id: string }> {\n    this.logger.info('load ${n} ' + id);\n    return { id };\n  }\n\n  async apply(entity: { id: string }, action: string): Promise<void> {\n    this.logger.info('apply ' + action + ' to ' + entity.id);\n  }\n\n  async remove(id: string): Promise<void> {\n    this.logger.warn('remove ${n} ' + id);\n  }\n}\n`; }
function guard(n) {
  return `import type { CanActivate } from '../core/guard';\n\nexport class ${cap(n)}Guard implements CanActivate {\n  canActivate(ctx: unknown): boolean {\n    const allowed = ctx !== null;\n    return true;\n  }\n}\n`; }
function dto(n) {
  return `import { BaseDto } from '../core/dto';\n\nexport class ${cap(n)}Dto extends BaseDto {\n  id = '';\n  name = '';\n\n  validate(): boolean {\n    const ok = this.id.length > 0;\n    return ok && super.validate();\n  }\n}\n`; }
function test(n, verb) {
  return `import { ${verb}${cap(n)}Handler } from '../../src/handlers/${n}.handler';\n\ndescribe('${verb}${cap(n)}Handler', () => {\n  it('handles', async () => {\n    expect(${verb}${cap(n)}Handler).toBeDefined();\n  });\n});\n`; }

// history: nouns arrive in waves, each wave one commit; tests land with their handlers (co-change)
const waves = [nouns.slice(0, 6), nouns.slice(6, 12), nouns.slice(12, 18), nouns.slice(18, 24), nouns.slice(24, 29)];
waves.forEach((wave, wi) => {
  for (const n of wave) {
    w(`src/services/${n}.service.ts`, service(n)); w(`src/guards/${n}.guard.ts`, guard(n)); w(`src/dto/${n}.dto.ts`, dto(n));
    const verb = verbs[wi % verbs.length];
    w(`src/handlers/${n}.handler.ts`, handler(n, verb)); w(`test/handlers/${n}.handler.test.ts`, test(n, verb)); }
  commit(`feat: ${wave.join(', ')} (wave ${wi + 1})`, 35); });
// a few follow-up commits that touch handler+test pairs together (co-change support)
for (let k = 0; k < 9; k++) { const n = nouns[k]; const verb = verbs[Math.floor(k / 6) % verbs.length];
  w(`src/handlers/${n}.handler.ts`, handler(n, verb).replace('await this.service.apply', '// fix: re-apply\n    await this.service.apply'));
  w(`test/handlers/${n}.handler.test.ts`, test(n, verb).replace("it('handles'", "it('handles after fix'"));
  commit(`fix: ${n} handler re-applies`, 12); }
// the planted deviant, recent
w('src/handlers/dispute.handler.ts', handler('dispute', 'Create', true));
w('src/services/dispute.service.ts', service('dispute')); w('src/guards/dispute.guard.ts', guard('dispute')); w('src/dto/dispute.dto.ts', dto('dispute'));
commit('feat: dispute (no decorator — planted deviant)', 3);
console.log(JSON.stringify({ out, head: g(['rev-parse', 'HEAD']).trim(), commits: +g(['rev-list', '--count', 'HEAD']).trim() }));
