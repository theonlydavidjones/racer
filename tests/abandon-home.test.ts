// After racing is called off for the day (N over A, AP over A: "no more racing today"), the AI boats sail home to the
// racing harbour nearest the course, round the land and allowing for the current, and stand off it, each at her own spot
// with open water to leeward, lying to (ai.ts homeCourse). Off the land the whole time (her bow, stern and sides), clear
// of each other, and settled once there.
import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { V, dist } from '../src/core/math';
import { onLand } from '../src/geo/shore';
import { LL } from '../src/geo/geo';
import { bow, stern, type Boat } from '../src/boat/boat';

/** Her hull on the land: bow, stern, or either side amidships (1.1 m out: half her beam). */
const aground = (b: Boat) => { const s = V(b.h + 90); return [bow(b), stern(b), { x: b.x + s.x * 1.1, y: b.y + s.y * 1.1 }, { x: b.x - s.x * 1.1, y: b.y - s.y * 1.1 }].some(p => onLand(p)); };

function sailHome(s: Partial<Settings>, seed: number, far = false) {
  const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, current: 'slack', tideDate: '2026-11-14', traffic: 0, fleet: 5, opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5'], ...s } as Settings, seed);
  const ai = w.boats.filter(b => !b.isUser);
  if (far) { // (put north of Alcatraz, called off: the island between them and home)
    while (w.t < 60) w.step(DT);
    w.cancelled = { t: w.t, kt: 24, up: ['N', 'A'], say: '' };
    ai.forEach((b, k) => { const p = LL(37.8345, -122.4235); b.x = p.x + k * 40; b.y = p.y + k * 25; b.h = 200; b.v = 2; b.penalty = 0; });
  } else while (!w.cancelled && w.t < 600) w.step(DT); // (the committee calls it off over the fleet's limit)
  expect(w.cancelled, 'called off').not.toBeNull();
  const t0 = w.t, land = new Map<string, number>(); let close = 0, settledAt = NaN;
  const tacks = new Map<string, number>(), tk = new Map<string, string>();
  while (w.t < t0 + 75 * 60 && !(w.t > settledAt + 20 * 60)) {
    w.step(DT);
    if (w.steps % 10) continue;
    for (const b of ai) {
      if (aground(b)) { land.set(b.name, (land.get(b.name) ?? 0) + 1); }
      if (!isNaN(settledAt)) { if (tk.get(b.name) && tk.get(b.name) !== b.tack) tacks.set(b.name, (tacks.get(b.name) ?? 0) + 1); tk.set(b.name, b.tack); }
      for (const o of ai) if (o.id > b.id && dist(o, b) < 3) close++;
    }
    if (isNaN(settledAt) && ai.every(b => b.ai!.home?.lying)) settledAt = w.t;
  }
  return { land, close, settledAt: (settledAt - t0) / 60, tacks: Math.max(0, ...tacks.values()) };
}

describe('the AI boats after racing is called off', () => {
  for (const [name, s, seed, far] of [
    ['a westerly over the limit', { windKind: 'west', windKt: 26 }, 7, false],
    ['a northerly over the limit (the harbour on a lee shore)', { windKind: 'north', windKt: 26 }, 7, false],
    ['from north of Alcatraz in a flood (the island between them and home, the current setting onto it)', { windKind: 'west', windKt: 20, current: 'flood' }, 4, true]
  ] as const) it(name, () => {
    const r = sailHome(s as Partial<Settings>, seed, far);
    expect([...r.land.entries()], 'on the land').toEqual([]);
    expect(r.settledAt, 'all lying to off the harbour within an hour').toBeLessThan(60);
    expect(r.close, 'boats within 3 m of each other (samples)').toBeLessThan(20);
    expect(r.tacks, 'tacks in the 20 minutes after, the most of any boat').toBeLessThanOrEqual(8);
  }, 1_200_000);
});
