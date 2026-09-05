import { readGraph } from './yggdrasil-graph.mjs';
import { CFG } from './config.mjs';
export const g = d => readGraph(d, CFG);
