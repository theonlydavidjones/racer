import { describe, expect, it } from 'vitest';
import { OPEN_WATER, Puffs, breezeAt, slotFlow, windKindFor, windKindFreq, windTerrain } from '../src/environment/wind';
import { buildCourse } from '../src/courses/course';
import train from '../src/courses/data/training-windward-return.json';
import { brg, wrap } from '../src/core/math';
import { sfLocalToUtcMin } from '../src/environment/tide';
import { LL } from '../src/geo/geo';
import { makeRng } from '../src/core/rng';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS } from '../src/settings';
import { World } from '../src/sim/world';

const at = (date: string, time: string, day: 0 | 1 | 2 = 1) => breezeAt(sfLocalToUtcMin(date, time), day);

describe('the afternoon westerly (NOAA records at Crissy Field, 2021–2025)', () => {
  it('in summer it fills in through the day: stronger at 16:00 than at 11:00', () => {
    expect(at('2027-07-10', '16:00').kt).toBeGreaterThan(at('2027-07-10', '11:00').kt + 3);
  });
  it('summer afternoons are windier than winter ones', () => {
    expect(at('2027-07-10', '15:00').kt).toBeGreaterThan(at('2026-11-14', '15:00').kt + 3);
  });
  it('a westerly blows on nearly every July race day, under half of November ones and a fifth of December ones', () => {
    expect(windKindFreq(6).west).toBeGreaterThan(0.95);
    expect(windKindFreq(10).west).toBeLessThan(0.5);
    expect(windKindFreq(11).west).toBeLessThan(0.3);
  });
  it('it comes from the WSW, through the Golden Gate', () => {
    const d = at('2027-07-10', '15:00').from;
    expect(d).toBeGreaterThan(235); expect(d).toBeLessThan(275);
  });
  it('light, typical and windy days are the 25th, 50th and 75th percentile', () => {
    const [l, t, w] = ([0, 1, 2] as const).map(d => at('2027-07-10', '15:00', d).kt);
    expect(l).toBeLessThan(t); expect(t).toBeLessThan(w);
  });
});

describe('the other winds: winter on the Bay', () => {
  it('in December the commonest wind is a northerly; light and variable days and southerlies come too', () => {
    const f = windKindFreq(11);
    expect(f.north).toBeGreaterThan(0.35); expect(f.north).toBeGreaterThan(f.west);
    expect(f.light).toBeGreaterThan(0.1); expect(f.south).toBeGreaterThan(0.05);
  });
  it('a northerly comes from about north, a southerly from about south', () => {
    const n = breezeAt(sfLocalToUtcMin('2026-12-05', '13:00'), 1, 'north'), s = breezeAt(sfLocalToUtcMin('2026-12-05', '13:00'), 1, 'south');
    expect(Math.abs(wrap(n.from - 10))).toBeLessThan(35); expect(Math.abs(wrap(s.from - 165))).toBeLessThan(35);
    expect(n.kt).toBeGreaterThan(6);
  });
  it('a light and variable day is light and doesn\'t hold a direction', () => {
    const l = breezeAt(sfLocalToUtcMin('2026-12-05', '13:00'), 1, 'light');
    expect(l.kt).toBeLessThan(6); expect(l.steady).toBeLessThan(0.6);
  });
  it('each race date draws its weather from its month, the same every time', () => {
    const dec = Array.from({ length: 31 }, (_, i) => windKindFor(`2026-12-${String(i + 1).padStart(2, '0')}`));
    expect(dec.filter(k => k === 'north').length).toBeGreaterThan(6);
    expect(dec.filter(k => k === 'west').length).toBeLessThan(15);
    expect(windKindFor('2026-12-05')).toBe(windKindFor('2026-12-05'));
    const jul = Array.from({ length: 31 }, (_, i) => windKindFor(`2027-07-${String(i + 1).padStart(2, '0')}`));
    expect(jul.filter(k => k === 'west').length).toBeGreaterThan(27);
    expect(windKindFor('2026-12-05', 'south')).toBe('south');
  });
  it('a kind of wind that never blows that month gives the westerly', () => {
    expect(breezeAt(sfLocalToUtcMin('2027-07-10', '13:00'), 1, 'north').kind).toBe('west');
  });
  it('the slot is the westerly coming through the Gate: no slot in a northerly', () => {
    expect(slotFlow(255)).toBeCloseTo(1, 5); expect(slotFlow(10)).toBe(0);
    const slot = LL(37.8235, -122.448);
    expect(windTerrain(slot, 10)).toBeLessThan(windTerrain(slot, 255) - 0.1);
  });
  it('a course laid from its line is set to the day\'s wind; fixed marks stay put and their legs change', () => {
    const t = train as unknown as CourseFile, w = buildCourse(t, { bias: 0, fleet: 3 }), n = buildCourse(t, { bias: 0, fleet: 3, windFrom: 10 });
    const leg = (c: typeof w) => brg(c.marks[0].p.x - c.center.x, c.marks[0].p.y - c.center.y);
    expect(Math.abs(wrap(leg(w) - 260))).toBeLessThan(2); expect(Math.abs(wrap(leg(n) - 10))).toBeLessThan(2);
    expect(n.marks[0].beat).toBe(true);
    const s = ss2 as unknown as CourseFile, sw = buildCourse(s, { bias: 0, fleet: 3 }), sn = buildCourse(s, { bias: 0, fleet: 3, windFrom: 10 });
    expect(sn.marks[0].p).toEqual(sw.marks[0].p);
    expect(sw.marks[0].leg).toBe('beat'); expect(sn.marks[0].leg).toBe('reach'); // A is west of the line: upwind in a westerly, a reach in a northerly
  });
  it('the race world takes the day\'s wind: a northerly day blows from the north', () => {
    const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKt: 0, windKind: 'north', tideDate: '2026-12-05', tideTime: '13:00', fleet: 1, opponents: ['stock:1'] }, 1);
    expect(w.windKind).toBe('north'); expect(Math.abs(wrap(w.wind.from - 10))).toBeLessThan(40);
  });
});

describe('where it blows harder', () => {
  it('more wind in the slot between the Gate and Alcatraz than close to the Cityfront shore', () => {
    const slot = windTerrain(LL(37.8235, -122.448)), shore = windTerrain(LL(37.8065, -122.444));
    expect(slot).toBeGreaterThan(1.1); expect(shore).toBeLessThan(0.95);
  });
  it('the field agrees with the station at the station (Crissy Field shore)', () => {
    const k = windTerrain(LL(37.8063, -122.4659)) * OPEN_WATER;
    expect(k).toBeGreaterThan(0.85); expect(k).toBeLessThan(1.2);
  });
});

describe('puffs and lulls', () => {
  it('drift downwind', () => {
    const p = new Puffs(makeRng(3), { x: 0, y: 0 }), c = p.cells[0], x0 = c.x, y0 = c.y, age0 = c.age;
    p.step(1, { from: 270, kt: 15 }); // wind from the west: puffs move east
    if (c.age > age0) { expect(c.x).toBeGreaterThan(x0 + 5); expect(Math.abs(c.y - y0)).toBeLessThan(0.01); }
  });
  it('each puff travels and streams along the wind where it is, not the course-wide mean (the wind turns across the Bay)', () => {
    const p = new Puffs(makeRng(3), { x: 0, y: 0 }), local = (q: { x: number }) => ({ turn: q.x > 0 ? 12 : -8, k: 1 });
    p.step(1.5, { from: 250, kt: 12 }, local);
    for (const c of p.cells.slice(0, 30)) {
      const x0 = c.x, y0 = c.y, want = 250 + local(c).turn + 180; p.step(0.1, { from: 250, kt: 12 }, local);
      if (c.age < 0.1 || Math.sign(c.x) !== Math.sign(x0)) continue; // (just respawned, or crossed the line)
      expect(Math.abs(wrap(brg(c.x - x0, c.y - y0) - want))).toBeLessThan(0.5);
      const ahead = Puffs.weight(c, c.x + Math.sin(want * Math.PI / 180) * c.r, c.y + Math.cos(want * Math.PI / 180) * c.r, p.dir);
      const side = Puffs.weight(c, c.x + Math.cos(want * Math.PI / 180) * c.r, c.y - Math.sin(want * Math.PI / 180) * c.r, p.dir);
      if (ahead > 0) expect(ahead).toBeGreaterThan(side); // longer along its own wind than across it
    }
  });
  it('a puff is stronger and veered; a lull is lighter', () => {
    const p = new Puffs(makeRng(5), { x: 0, y: 0 });
    p.cells.length = 0;
    p.cells.push({ x: 0, y: 0, r: 100, amp: 0.25, age: 50, life: 100 }, { x: 1000, y: 0, r: 100, amp: -0.2, age: 50, life: 100 });
    const puff = p.at({ x: 0, y: 0 }), lull = p.at({ x: 1000, y: 0 }), none = p.at({ x: 500, y: 500 });
    expect(puff.k).toBeGreaterThan(1.15); expect(puff.veer).toBeGreaterThan(3);
    expect(lull.k).toBeLessThan(0.85);
    expect(none).toEqual({ k: 1, veer: 0 });
  });
  it('same seed, same puffs', () => {
    const a = new Puffs(makeRng(9), { x: 0, y: 0 }), b = new Puffs(makeRng(9), { x: 0, y: 0 });
    for (let i = 0; i < 100; i++) { a.step(0.5, { from: 250, kt: 14 }); b.step(0.5, { from: 250, kt: 14 }); }
    expect(a.cells).toEqual(b.cells);
  });
});

describe('in the race', () => {
  it('boats in different places feel different wind', () => {
    const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', tideDate: '2027-07-10', tideTime: '15:00', fleet: 5 }, 2);
    for (let i = 0; i < 600; i++) w.step();
    const kts = w.boats.map(b => b.ww.kt.toFixed(2));
    expect(new Set(kts).size).toBeGreaterThan(2);
  });
  it('the westerly builds during a summer race', () => {
    const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', tideDate: '2027-07-10', tideTime: '13:00', fleet: 0 }, 2);
    const k0 = w.windModel.kt;
    for (let i = 0; i < 60 * 60 * 75; i++) w.step(); // 75 minutes
    expect(w.windModel.kt).toBeGreaterThan(k0 + 1);
  }, 60000);
});

describe('the sea is made by the wind over the water, not the wind at the boat', () => {
  it("a neighbour's dirty air or a passing puff doesn't change the chop she's in", () => {
    const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', tideDate: '2027-07-10', tideTime: '15:00', fleet: 1 }, 3);
    const [a, o] = w.boats, p = { x: a.x, y: a.y };
    const seaWithout = w.seaHere(p);
    // another boat parked 30 m dead upwind of the point, and the strongest puff there is right over it
    const up = { x: Math.sin(w.wind.from * Math.PI / 180), y: Math.cos(w.wind.from * Math.PI / 180) };
    o.x = p.x + up.x * 30; o.y = p.y + up.y * 30; o.h = w.wind.from; o.v = 2;
    const c = w.puffs.cells[0]; c.x = p.x; c.y = p.y; c.amp = 0.3; c.age = c.life / 2;
    expect(w.windHere(p).kt).not.toBeCloseTo(w.wind.kt * w.fieldAt(p).k, 2); // (the wind at the point has changed)
    expect(w.seaHere(p).hsW).toBeCloseTo(seaWithout.hsW, 6);
  });
});
