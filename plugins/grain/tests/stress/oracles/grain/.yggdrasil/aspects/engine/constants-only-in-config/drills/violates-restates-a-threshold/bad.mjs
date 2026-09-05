import { SUP } from '../engine/config.mjs';
const CFG = { lambda: 8, minRaw: 5 };
export const speaks = odds => odds >= CFG.lambda && SUP.call > 0;
