import { readFileSync } from 'node:fs';
// This module talks about child_process in prose only; it never imports it.
export const mine = p => readFileSync(p, 'utf8').length;
