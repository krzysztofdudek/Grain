import { readFileSync } from 'node:fs';
// The word fetch appears here in a comment, and 'https' in a string below — neither is a call.
export const label = 'https';
export const read = p => readFileSync(p, 'utf8');
