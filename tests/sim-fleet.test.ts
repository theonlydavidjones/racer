// (split from sim.test.ts so the slow whole-race runs share the cores)
import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import train from '../src/courses/data/training-windward-return.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { sail } from './helpers/racePool';

const SS2 = ss2 as unknown as CourseFile, TRAIN = train as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', ...o });

describe('AI fleet sails the course', () => {
  const race = (file: CourseFile, s: Partial<Settings>, seed: number, minutes: number) => {
    const w = new World(file, settings(s), seed);
    const end = minutes * 60;
    while (w.t < end && !w.boats.slice(1).every(b => b.finished)) w.step(DT);
    return w;
  };

  it('training course: every AI boat starts, rounds and finishes', () => {
    const w = race(TRAIN, { fleet: 5, current: 'ebb' }, 7, 20);
    for (const b of w.boats.slice(1)) expect(b.finished, `${b.name} leg ${b.leg}`).toBe(true);
  }, 60_000);

  it('Seaweed Soup course 2 in an ebb: every AI boat finishes', () => {
    const w = race(SS2, { fleet: 3, current: 'ebb' }, 11, 90); // (the real jetty pushes the last beat out from the Marina shore)
    for (const b of w.boats.slice(1)) expect(b.finished, `${b.name} leg ${b.leg}`).toBe(true);
  }, 180_000);
});

describe('the strategist\'s leg times against the fleet sailing them', () => {
  /**
   * The brief plans each leg as a perfect sail (the best plan, 8 s a tack: sim/routing.ts). The AI fleet, sailing the
   * same course in the same wind and tide, should take about as long: measured on November 12, 2026 (Seaweed Soup
   * course 2, west 12 kt), the runs and reaches matched or beat the plan, the beats took 5–20% longer, and the first beat
   * longest (the start's traffic), as did the leg after the first rounding (the fleet bunched there, with penalties:
   * ROADMAP 4b; the same reach the second time round took the plan's time); 47 min planned against about 50 sailed. (The ROADMAP's earlier "planned at 38 min,
   * the AI took 47–71" was the AI's unheld tacks.) The bands hold the brief to that.
   */
  /*
   * Over nine races (seeds 11–19), each leg's median across them: one race's start, its penalties at the first mark, can
   * put a leg anywhere (the fleet's first beat ran 1.2–1.9 times the plan from seed to seed, November 13, 2026), and one
   * seed passed or failed by that luck. The median of nine is the fleet against the plan, not one race's traffic.
   */
  it('each leg within the fleet\'s range, and the whole race within 15%, over nine races', async () => {
    const median = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
    const legR: number[][] = [], totals: number[] = [];
    let names: string[] = [];
    // (the nine races sailed side by side on the race pool's threads: tests/helpers/races.ts fleetLegs; then seed by seed as before)
    const seeds = [11, 12, 13, 14, 15, 16, 17, 18, 19], R = await sail('fleetLegs', seeds.map(seed => [seed] as [number]));
    seeds.forEach((seed, k) => {
      const { perLeg, total } = R[k];
      names = perLeg.map(L => L.name);
      perLeg.forEach((L, i) => {
        expect(L.sailedBy, `seed ${seed}: ${L.name}`).toBeGreaterThan(2);
        (legR[i] ??= []).push(L.ratio);
      });
      totals.push(total);
    });
    legR.forEach((rs, i) => {
      const r = median(rs), why = `${names[i]}: the fleet against the plan, seed by seed ${rs.map(x => x.toFixed(2)).join(' ')}`;
      expect(r, why).toBeGreaterThan(0.8);
      expect(r, why).toBeLessThan(i <= 1 ? 1.6 : 1.35); // (wider for the first beat and the leg after the first mark: the fleet's crowding there)
    });
    const t = median(totals), why = `the whole race, seed by seed ${totals.map(x => x.toFixed(2)).join(' ')}`;
    expect(t, why).toBeGreaterThan(0.9); expect(t, why).toBeLessThan(1.15);
  }, 1_800_000);
});
