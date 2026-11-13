// The perf test's race (tests/perf.test.ts: Seaweed Soup course 10, a fleet of eight, west 22 kt, the real current for
// 14 Nov 2026, seed 3), five minutes of it, in a fresh process: the first race after load, as a player's is. Run by
// scripts/check/deopt.cjs under node --trace-opt, which reads what the engine's optimizing compiler did meanwhile.
import { runnerImport } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const load = async (p) => (await runnerImport(root + p, { root, configFile: false, logLevel: 'error' })).module;
const [{ DT, World }, { DEFAULT_SETTINGS }, course] = await Promise.all([
  load('src/sim/world.ts'), load('src/settings.ts'), load('src/courses/data/seaweed-soup-2026-course10.json')
]);
const opponents = ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'];
const w = new World(course.default ?? course, { ...DEFAULT_SETTINGS, tideDate: '2026-11-14', windKind: 'west', windKt: 22, current: 'real', opponents, fleet: 7 }, 3);
let steps = 0;
while (w.t < 5 * 60) { w.step(DT); steps++; }
console.log(`DEOPT-RACE done: ${steps} steps, ${w.boats.length} boats`);
