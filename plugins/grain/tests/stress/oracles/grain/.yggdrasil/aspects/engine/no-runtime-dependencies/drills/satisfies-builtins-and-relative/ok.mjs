import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { helper } from './helper.mjs';
import { shared } from '../shared/shared.mjs';
const { lazy } = await import('./lazy.mjs');
export { thing } from './thing.mjs';
export const ok = readFileSync && join && helper && shared && lazy;
