import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { buildCourse, type CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { brg, dist, markDist, wrap } from '../src/core/math';
import { onLand } from '../src/geo/shore';

const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, current: 'slack', tideDate: '2026-11-14', ...o });
const ss = COURSES.filter(c => c.id.startsWith('ss'));
const byId = (id: string) => COURSES.find(c => c.id === id) as CourseFile;

describe('the Seaweed Soup course sheet (Addendum B)', () => {
  it('has every course on the sheet', () => {
    const nums = ss.map(c => Number(c.id.slice(2))).sort((a, b) => a - b);
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 34, 41, 42, 43, 45, 46, 47, 48, 49, 50, 51]);
  });

  it('every course builds; every buoy is on the water; X is only ever passed, never rounded', () => {
    for (const f of ss) {
      const C = buildCourse(f, { bias: 0, fleet: 3 });
      for (const m of C.marks) {
        if (m.shape !== 'island') expect(onLand(m.p), `${f.id} ${m.name}`).toBe(false);
        if (m.key === 'X') expect(m.type).toBe('pass');
      }
    }
  });

  it('west courses start toward the west, east courses toward the east', () => {
    for (const f of ss) {
      const C = buildCourse(f, { bias: 0, fleet: 3 }), toward = brg(C.N.x, C.N.y), n = Number(f.id.slice(2));
      if (n < 40) expect(Math.abs(wrap(toward - 270)), f.id).toBeLessThan(60);
      else expect(Math.abs(wrap(toward - 90)), f.id).toBeLessThan(60);
    }
  });

  it('Alcatraz is an island mark: its shore runs out a few hundred metres from the light, furthest to the northwest', () => {
    const C = buildCourse(byId('ss41'), { bias: 0, fleet: 3 }), m = C.marks[0];
    expect(m.shape).toBe('island');
    const r = m.reach!;
    expect(Math.min(...r)).toBeGreaterThan(40);
    expect(Math.max(...r)).toBeLessThan(450);
    expect(r.indexOf(Math.max(...r)) * 10).toBeGreaterThan(280); // the island's long axis runs NW
    // a boat 100 m off the south shore is 100 m from the mark, not 200+ from the light
    const south = { x: m.p.x, y: m.p.y - (r[18] + 100) };
    expect(markDist(south, m)).toBeCloseTo(100, -1);
  });
});

describe('sailing the new courses', () => {
  it('an AI boat rounds Alcatraz (course 41) without running aground', () => {
    const w = new World(byId('ss41'), settings({ fleet: 1 }), 3);
    const b = w.boats.find(x => !x.isUser)!, mk = w.C.marks[0];
    // already racing, a few hundred metres up-current of the island and to its west
    w.t = 30; b.started = true; b.leg = 0; b.x = mk.p.x - 900; b.y = mk.p.y - 250; b.h = 70; b.v = 2; b.prevD = null;
    let aground = 0, t = 0, closest = Infinity;
    for (; t < 60 * 60 * 25 && b.leg === 0; t++) {
      w.step(DT);
      if (onLand({ x: b.x, y: b.y })) aground++;
      closest = Math.min(closest, markDist(b, mk));
    }
    expect(b.leg, `still on leg 0 after ${(t / 3600).toFixed(1)} min; closest ${closest.toFixed(0)} m off`).toBe(1);
    expect(aground).toBe(0);
    expect(dist(b, mk.p)).toBeGreaterThan(mk.reach![0] * 0.5);
  }, 120_000);

  it('the next mark behind an island: from the far side of Alcatraz she sails round it to Fort Mason (course 3)', () => {
    const w = new World(byId('ss3'), settings({ fleet: 1, windKt: 14 }), 5);
    const b = w.boats.find(x => !x.isUser)!, alc = w.C.marks[1];
    w.t = 30; b.started = true; b.leg = 2; b.x = alc.p.x + alc.r.x * 350; b.y = alc.p.y + alc.r.y * 350; b.v = 2; b.prevD = null;
    let aground = 0;
    for (let t = 0; t < 60 * 60 * 20 && b.leg === 2; t++) { w.step(DT); if (onLand({ x: b.x, y: b.y })) aground++; }
    expect(b.leg).toBe(3);
    expect(aground).toBe(0);
  }, 120_000);
});
