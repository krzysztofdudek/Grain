import { execFileSync } from 'node:child_process';
export const head = repo => execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD']);
