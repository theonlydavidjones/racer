// Whole races the slow tests sail, as plain functions of their seed and options, returning plain numbers: so they can
// run one after another in the test's own process, or side by side on the race pool's threads (tests/helpers/racePool.ts)
// with the same answers to the last digit (tests/racepool.test.ts checks it). Moved here unchanged from the tests.
import ss10 from '../../src/courses/data/seaweed-soup-2026-course10.json';
import ss2 from '../../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../../src/settings';
import { DT, World } from '../../src/sim/world';
import { setShoreGrid } from '../../src/geo/shore';
import { outlookFor } from '../../src/sim/outlook';
import { planLegs } from '../../src/sim/strategist';

/** tests/approx.test.ts: its two courses. */
export const APPROX_RACES = [
  [ss10, { tideDate: '2026-11-14', windKind: 'west', windKt: 22, current: 'real', opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'], fleet: 7 }, 3],
  [ss2, { tideDate: '2026-11-14', windKind: 'west', windKt: 12, current: 'real', fleet: 5 }, 7]
] as const;
export interface ApproxOpts { grid: boolean; skip: boolean; curK?: number; seed?: number; exactAI?: boolean; /** (s; the tests' own: 6 minutes) */ until?: number }
/** tests/approx.test.ts: six minutes of a race: each AI boat's mean speed after the gun, and where she is (the user's boat, unsailed, left out). */
export function approxRace(i: number, o: ApproxOpts) {
  const [c, s, seed0] = APPROX_RACES[i], seed = o.seed ?? seed0;
  setShoreGrid(o.grid);
  try {
    const w = new World(c as unknown as CourseFile, { ...DEFAULT_SETTINGS, ...s } as never, seed);
    w.exactPairs = !o.skip; w.exactAI = !!o.exactAI;
    if (o.curK) { const f = w.currentAt.bind(w); w.currentAt = (p, l) => { const v = f(p, l); return { x: v.x * o.curK!, y: v.y * o.curK! }; }; }
    const sum = w.boats.map(() => 0), incidents: string[] = []; let n = 0, fouls = 0;
    // (each penalty the AI boats are given: penaltyTotal holds only the last one's degrees, and incidents only the user's)
    const ap = w.assignPenalty.bind(w); w.assignPenalty = b => { if (!b.isUser) fouls++; ap(b); };
    while (w.t < (o.until ?? 6 * 60)) {
      w.step(DT); if (w.t > 0) { w.boats.forEach((b, k) => { sum[k] += b.v; }); n++; }
      for (const e of w.drainEvents()) if (e.type === 'incident') incidents.push(`${w.t.toFixed(3)} ${e.incident.rule} ${e.incident.fouler.id}`);
    }
    const boats = w.boats.filter(b => !b.isUser).map(b => ({ v: sum[w.boats.indexOf(b)] / n, x: b.x, y: b.y, h: b.h, leg: b.leg, penalties: b.penaltyTotal }));
    return { boats, incidents, fouls };
  } finally { setShoreGrid(true); }
}
export type ApproxResult = ReturnType<typeof approxRace>;

const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', ...o });
const median = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
/**
 * tests/sim-fleet.test.ts: one race of Seaweed Soup course 2 in an ebb (fleet of four) against the strategist's plan:
 * for each leg, how many AI boats sailed it, and their median time against the plan's; and the whole race's.
 */
export function fleetLegs(seed: number) {
  const w = new World(ss2 as unknown as CourseFile, settings({ fleet: 4, current: 'ebb' }), seed), legs = planLegs(w, outlookFor(w));
  const times: Record<number, number[]> = {}, log = w.log!, orig = log.onAdvance.bind(log);
  log.onAdvance = (ww, b, idx) => { (times[b.id] ??= []).push(w.t); orig(ww, b, idx); };
  while (w.t < 110 * 60 && !w.boats.slice(1).every(b => b.finished)) w.step(DT);
  let plan = 0, sailed = 0;
  const perLeg = legs.map((L, i) => {
    const ai = w.boats.slice(1).map(b => { const T = [w.startTimes[b.id] ?? NaN, ...(times[b.id] ?? []), b.finishT ?? NaN]; return (T[i + 1] - T[i]) / 60; }).filter(x => isFinite(x));
    const m = ai.length ? median(ai) : NaN;
    plan += L.minutes; sailed += m;
    return { name: `${L.name} (${L.kind})`, sailedBy: ai.length, ratio: m / L.minutes };
  });
  return { perLeg, total: sailed / plan };
}
