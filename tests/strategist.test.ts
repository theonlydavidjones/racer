import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { KT, type Vec } from '../src/core/math';
import { FLAT_SEA } from '../src/environment/sea';
import { onLand } from '../src/geo/shore';
import type { Outlook } from '../src/sim/outlook';
import { outlookFor, stationEvents } from '../src/sim/outlook';
import { bestPlan, comparePlans, routeAround, sailLeg } from '../src/sim/routing';
import { raceBrief } from '../src/sim/strategist';
import { passagePlan } from '../src/sim/navigator';
import { place } from '../src/sim/places';

/** A made-up day: wind and current as functions of place and time (minutes from 0), flat water. */
function fakeDay(wind: (p: Vec, t: number) => { kt: number; from: number }, current: (p: Vec, t: number) => Vec = () => ({ x: 0, y: 0 })): Outlook {
  return {
    t0: 0, stations: null, chop: () => ({ hs: 0, tp: 1 }), sea: () => FLAT_SEA, current,
    wind: (p, t) => ({ ...wind(p, t), gust: 1.3 }), breeze: t => ({ ...wind({ x: 0, y: 0 }, t), gust: 1.3 }),
    windOnWater: (p, t) => wind(p, t)
  };
}
const NM = 1852, A = { x: 0, y: 0 }, UP = { x: 0, y: NM };

describe('sailing a leg on paper', () => {
  it('in a steady wind and no tide, going left or right first takes the same time', () => {
    const r = comparePlans(fakeDay(() => ({ kt: 12, from: 0 })), A, UP, 0);
    expect(r.left.ok && r.right.ok && r.middle.ok).toBe(true);
    expect(r.left.kind).toBe('beat');
    expect(Math.abs(r.left.minutes - r.right.minutes) / r.left.minutes).toBeLessThan(0.02);
    expect(r.middle.tacks).toBeGreaterThan(r.left.tacks); // more tacks up the middle, each costing a few seconds
  });
  it('against the tide, the side where the foul current is weaker wins', () => {
    // a 1.2 kt foul tide on the east side, 0.3 kt on the west: looking upwind (north), west is the left
    const day = fakeDay(() => ({ kt: 10, from: 0 }), p => ({ x: 0, y: -(p.x > 0 ? 1.2 : 0.3) * KT }));
    const r = comparePlans(day, A, UP, 0);
    expect(bestPlan(r)).toBe('left');
    expect(r.right.minutes - r.left.minutes).toBeGreaterThan(1);
    expect(r.left.meanCurAlong).toBeGreaterThan(r.right.meanCurAlong);
  });
  it('in a wind that veers through the leg, the right pays (sail toward the new wind)', () => {
    const day = fakeDay((_p, t) => ({ kt: 10, from: Math.min(20, t) })); // veering 1° a minute to 20°
    const r = comparePlans(day, A, UP, 0);
    expect(bestPlan(r)).toBe('right');
    expect(r.left.minutes - r.right.minutes).toBeGreaterThan(0.5);
  });
  it('reaching across a current, she crabs up-current and still gets there in a straight line', () => {
    const day = fakeDay(() => ({ kt: 12, from: 270 }), () => ({ x: 0, y: -1 * KT })); // a beam reach north, 1 kt setting south… along
    const across = fakeDay(() => ({ kt: 12, from: 270 }), () => ({ x: 1 * KT, y: 0 })); // 1 kt setting east, across the leg
    const r = sailLeg(across, A, UP, 0, 'middle');
    expect(r.ok).toBe(true); expect(r.kind).toBe('reach');
    expect(r.maxLeft + r.maxRight).toBeLessThan(60); // held the line
    expect(sailLeg(day, A, UP, 0, 'middle').minutes).toBeGreaterThan(r.minutes); // a foul current along the leg is slower
  });
  it('gives up on a leg she can\'t sail (becalmed against the tide)', () => {
    const r = sailLeg(fakeDay(() => ({ kt: 1, from: 0 }), () => ({ x: 0, y: -2 * KT })), A, UP, 0, 'middle', undefined, 30, 30);
    expect(r.ok).toBe(false);
  });
  it('a cruise route goes round the land', () => {
    const from = place('sausalito')!.p, to = place('clipper')!.p, r = routeAround(from, to);
    for (let i = 1; i < r.length; i++) for (let k = 0; k <= 20; k++) {
      const q = { x: r[i - 1].x + (r[i].x - r[i - 1].x) * k / 20, y: r[i - 1].y + (r[i].y - r[i - 1].y) * k / 20 };
      expect(onLand(q)).toBe(false);
    }
  });
});

const race = (o: Partial<Settings> = {}): World => {
  const s: Settings = { ...DEFAULT_SETTINGS, course: 'ss20', tideDate: '2025-07-12', tideTime: '13:00', traffic: 0, ...o };
  return new World(COURSES.find(c => c.id === s.course)!, s, 1);
};

describe('the strategist', () => {
  it('briefs a race on an observed day: the day, the start, every leg, the fleet, the trim', () => {
    const w = race(), b = raceBrief(w);
    expect(b.sections.map(s => s.id)).toEqual(['day', 'start', 'legs', 'fleet', 'trim']);
    expect(b.legs.length).toBe(w.C.marks.length + 1);
    expect(b.legs.every(L => L.plans[L.best].ok)).toBe(true);
    // the legs follow on, and the finish is when the last one ends
    for (let i = 1; i < b.legs.length; i++) expect(b.legs[i].t0).toBeGreaterThanOrEqual(b.legs[i - 1].t0 + b.legs[i - 1].minutes - 0.01);
    expect(b.finishT).toBeCloseTo(b.legs[b.legs.length - 1].t0 + b.legs[b.legs.length - 1].minutes, 5);
    for (const s of b.sections) for (const it of s.items) { expect(it.text.length).toBeGreaterThan(10); expect(['data', 'model', 'practice', 'rule']).toContain(it.src); }
    // the race takes about as long as the committee's table says for this course (within reason)
    expect(b.finishT - w.gunUtc).toBeGreaterThan(30); expect(b.finishT - w.gunUtc).toBeLessThan(240);
  });
  it('names the favoured end: the end further upwind', () => {
    for (const windDir of [240, 300]) {
      const w = race({ windDir, windKt: 12, current: 'slack' }), b = raceBrief(w), it = b.sections[1].items.find(i => i.head === 'Favoured end');
      if (!it || /square/.test(it.text)) continue;
      // with the line running north from the club, a southwesterly favours the south (shore) end, a northwesterly the north
      const upEnd = (windDir < 270) === (w.C.committee.y < w.C.pin.y) ? w.C.committeeLabel : w.C.pinLabel;
      expect(it.text).toContain(`The ${upEnd} end`);
    }
  });
  it('the ebb pushing over the line is called out', () => {
    const w = race({ current: 'bigebb', windKt: 12 }), b = raceBrief(w), it = b.sections[1].items.find(i => i.head === 'The current at the line');
    expect(it?.text).toMatch(/carrying you over the line/);
  });
});

describe('the navigator', () => {
  const cruise = (from: string, to: string, date = '2025-07-12', time = '13:00') => new World(COURSES[0], { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: from, sailTo: to, tideDate: date, tideTime: time }, 1, { freeSail: true });
  it('plans a passage: the way, when to go, the gates, the wind, ships and hazards', () => {
    const p = passagePlan(cruise('cityfront', 'sausalito'))!;
    expect(p.sections.map(s => s.id)).toEqual(['passage', 'gates', 'wind', 'traffic', 'safety']);
    expect(p.track.length).toBeGreaterThan(5);
    expect(p.track.every(q => !onLand(q.p))).toBe(true);
    // the Cityfront to Sausalito crosses the deep-water route: the navigator says so, with the rules
    expect(p.marks.some(m => m.kind === 'lane' && /ship/.test(m.label))).toBe(true);
    expect(p.sections[3].items.some(i => i.src === 'rule' && /Rule 9/.test(i.text))).toBe(true);
  });
  it('no destination, no plan', () => {
    expect(passagePlan(cruise('cityfront', ''))).toBeNull();
  });
  it('the tide stations\' slacks and peaks alternate, as NOAA lists them', () => {
    const w = cruise('cityfront', 'sausalito'), o = outlookFor(w), st = o.stations!.find(s => s.id === 'SFB1203')!;
    const ev = stationEvents(st, w.gunUtc - 30, w.gunUtc + 366);
    expect(ev.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < ev.length; i++) expect(['max flood', 'slack before ebb', 'max ebb', 'slack before flood'].indexOf(ev[i].kind)).toBe((['max flood', 'slack before ebb', 'max ebb', 'slack before flood'].indexOf(ev[i - 1].kind) + 1) % 4);
  });
});
