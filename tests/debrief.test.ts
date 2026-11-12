import { describe, expect, it } from 'vitest';
import train from '../src/courses/data/training-windward-return.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { D2R, V } from '../src/core/math';
import { beatAngle } from '../src/boat/polar';

const TRAIN = train as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, current: 'slack', traffic: 0, tideDate: '2026-11-14', ...o });

/** A world mid-beat: you've started, on starboard, close-hauled, the wind steady from `from`. */
function midBeat(from = 260) {
  const w = new World(TRAIN, settings({ fleet: 1 }), 7), u = w.user, log = w.log!;
  w.t = 120; w.avgFrom = from; w.wind = { ...w.wind, from, kt: 12 };
  Object.assign(u, { started: true, finished: false, leg: 0, tack: 'S', twa: beatAngle(12), tacking: false, penalty: 0, lastTackT: 0,
    luff: false, manualTrim: false, heelMag: 16, shadowK: 1, leeK: 1, cur: { x: 0, y: 0 }, ww: { ...u.ww, from, kt: 12 } });
  const run = (s: number) => { for (let t = 0; t < s; t += DT) { log.step(w, DT); w.t += DT; } };
  return { w, u, log, run };
}

describe('the tactics debrief', () => {
  it('only racing has one', () => {
    expect(new World(TRAIN, settings(), 1).log).not.toBeNull();
    expect(new World(TRAIN, settings({ mode: 'sail' }), 1, { freeSail: true }).log).toBeNull();
  });

  it('a header held for more than 15 s costs cos(β+θ)/cos(β−θ) of your progress; a short one costs nothing', () => {
    const a = midBeat(), b = midBeat();
    // starboard tack: the wind backing (toward her bow) heads her
    a.u.ww = { ...a.u.ww, from: 252 }; a.run(10);
    expect(a.log.header.lost).toBe(0);
    b.u.ww = { ...b.u.ww, from: 252 }; b.run(45);
    const beat = beatAngle(12), f = 1 - Math.cos((beat + 8) * D2R) / Math.cos((beat - 8) * D2R);
    expect(f).toBeGreaterThan(0.15); // about a fifth of your progress upwind, at 8°
    expect(b.log.header.lost).toBeCloseTo(30 * f, 0);
    // on port, the same backing is a lift
    const c = midBeat(); c.u.tack = 'P'; c.u.ww = { ...c.u.ww, from: 252 }; c.run(45);
    expect(c.log.header.lost).toBe(0);
  });

  it('sailing past the layline is logged at that mark; short of it is not', () => {
    const from = 260, beat = beatAngle(12);
    const over = midBeat(from), m = over.w.C.marks[0].p;
    // on starboard, with the mark 25° to the right of the port-tack heading: past the port layline
    const at = (rel: number) => { const v = V(from + beat + rel); return { x: m.x - 250 * v.x, y: m.y - 250 * v.y }; };
    Object.assign(over.u, at(25)); over.run(5);
    expect(over.log.marks[0].overM).toBeGreaterThan(80); expect(over.log.marks[0].overM).toBeLessThan(110);
    const under = midBeat(from); Object.assign(under.u, at(-25)); under.run(5);
    expect(under.log.marks[0].overM).toBe(0);
    expect(over.log.findings(over.w).some(f => f.key === 'laylines')).toBe(true);
  });

  it('dirty air: speed lost goes as the wind^0.7, and it\'s blamed on the boat to windward', () => {
    const { w, u, log, run } = midBeat(), o = w.boats[1], up = V(w.wind.from);
    Object.assign(o, { x: u.x + 40 * up.x, y: u.y + 40 * up.y });
    u.shadowK = 0.8; run(10);
    expect(log.dirty.lost).toBeCloseTo(10 * (1 - 0.8 ** 0.7), 1);
    expect([...log.dirty.by.keys()]).toEqual([o.name]);
    // the lee of the land is counted on its own
    u.leeK = 0.6; u.shadowK = 0.6; run(10);
    expect(log.lee.lost).toBeCloseTo(10 * (1 - 0.6 ** 0.7), 1);
    expect(log.dirty.lost).toBeCloseTo(10 * (1 - 0.8 ** 0.7), 1);
  });

  it('places at each mark count every boat, and the findings come most costly first, the start always there', () => {
    const { w, u, log, run } = midBeat(), o = w.boats[1];
    log.onAdvance(w, o, 0); log.onAdvance(w, u, 0);
    expect(log.places()[0].place).toBe(2);
    u.ww = { ...u.ww, from: 252 }; u.shadowK = 0.7; run(60);
    const fs = log.findings(w);
    expect(fs.some(f => f.key === 'start')).toBe(true);
    for (let i = 1; i < fs.length; i++) expect(fs[i].lost).toBeLessThanOrEqual(fs[i - 1].lost);
    expect(fs.map(f => f.key)).toEqual(expect.arrayContaining(['shifts', 'dirty']));
  });

  it('a real start: the log takes the gun and your start time from the race', () => {
    const w = new World(TRAIN, settings({ fleet: 2, seq: 1 }), 3);
    while (w.t < 5) w.step(DT);
    const start = w.log!.findings(w).find(f => f.key === 'start')!;
    expect(start.detail).toMatch(/at the gun|No clean start/);
  });

  it('the race replay\'s moments: each loss is a moment with its time, place and cost, matching the findings', () => {
    const { w, u, log, run } = midBeat(), o = w.boats[1], up = V(w.wind.from);
    Object.assign(o, { x: u.x + 40 * up.x, y: u.y + 40 * up.y });
    run(5);
    u.shadowK = 0.7; run(20); u.shadowK = 1; run(10); // a spell in her dirty air
    u.ww = { ...u.ww, from: 252 }; run(45); u.ww = { ...u.ww, from: 260 }; run(10); // then a header held
    const ms = log.moments(w);
    const dirty = ms.find(m => m.key === 'dirty')!, hdr = ms.find(m => m.key === 'shifts')!;
    expect(dirty.t0).toBeCloseTo(125, 0); expect(dirty.t1).toBeCloseTo(145, 0);
    expect(dirty.text).toContain(o.name);
    expect(dirty.lost).toBeCloseTo(log.dirty.lost, 1);
    expect(hdr.t0).toBeGreaterThan(dirty.t1); expect(hdr.lost).toBeCloseTo(log.header.lost, 1);
    expect(hdr.text).toMatch(/8° header/);
    for (let i = 1; i < ms.length; i++) expect(ms[i].t0).toBeGreaterThanOrEqual(ms[i - 1].t0);
    // asking doesn't end a spell still going: it's there now, and goes on growing
    u.shadowK = 0.7; run(10);
    const a = log.moments(w).find(m => m.key === 'dirty' && m.t0 > 150)!; run(10);
    const b = log.moments(w).find(m => m.key === 'dirty' && m.t0 > 150)!;
    expect(b.t0).toBe(a.t0); expect(b.lost).toBeGreaterThan(a.lost);
    // every moment's key is a finding's, or a rule incident
    const keys = new Set(['start', 'shifts', 'laylines', 'tacks', 'dirty', 'lee', 'downwind', 'heel', 'trim', 'penalty', 'roundings', 'rule']);
    for (const m of log.moments(w)) expect(keys.has(m.key)).toBe(true);
  });

  it('a real race records the whole of it once a second for the replay, from just before the gun', () => {
    const w = new World(TRAIN, settings({ fleet: 2, seq: 1 }), 3);
    while (w.t < 20) w.step(DT);
    expect(w.track[0].t).toBeGreaterThanOrEqual(-30); expect(w.track[0].t).toBeLessThan(-28);
    expect(w.track[1].t - w.track[0].t).toBeCloseTo(1, 5);
    expect(w.track.at(-1)!.t).toBeGreaterThan(18);
    expect(w.track[0].b.length).toBe(w.boats.length);
    expect(new World(TRAIN, settings({ mode: 'sail' }), 1, { freeSail: true }).track).toEqual([]);
  });
});
