import { describe, expect, it } from 'vitest';
import { testBoat, sail, kt } from './helpers/testBoat';
import { takeLine } from '../src/boat/physics';
import { CoachMemory, addLessonSource, teach } from '../src/boat/coach';
import type { Boat } from '../src/boat/boat';
import type { SeaHere } from '../src/environment/sea';

/** Sail holding the heading exactly, so comparisons are like for like. */
const hold = (b: Boat, t: number, each?: () => void) => { const h = b.h; sail(b, t, () => { b.h = h; each?.(); }); };
const CHOP: SeaHere = { hsW: 0.6, tpW: 3, fromW: 0, hsS: 0, tpS: 10, fromS: 270, steep: 0.05, white: 0.03, fetch: 8000 };
function boat(o: { heading: number; windKt: number; sea?: SeaHere }) { const b = testBoat({ heading: o.heading, kt: 5, windKt: o.windKt }); if (o.sea) b.sea = o.sea; hold(b, 30); return b; }
/** You take a line and set it wrong. */
function wrong(b: Boat, k: 'jibsheet' | 'mainsheet' | 'backstay' | 'vang' | 'outhaul' | 'traveller', v: number) { takeLine(b, k); (b.ctlTarget ??= {})[k] = v; hold(b, 30); }

describe('the trim coach: one thing at a time, and the right thing', () => {
  const cases: [string, () => Boat, string][] = [
    ['8 kt upwind, jib eased', () => { const b = boat({ heading: 318, windKt: 8 }); wrong(b, 'jibsheet', 0.3); return b; }, 'jibsheet'],
    ['12 kt upwind, main eased', () => { const b = boat({ heading: 318, windKt: 12 }); wrong(b, 'mainsheet', 0.6); return b; }, 'mainsheet'],
    ['20 kt upwind in chop, backstay off', () => { const b = boat({ heading: 318, windKt: 20, sea: CHOP }); wrong(b, 'backstay', 0); return b; }, 'backstay'],
    ['16 kt broad reach in chop, vang off', () => { const b = boat({ heading: 215, windKt: 16, sea: CHOP }); wrong(b, 'vang', 0); return b; }, 'vang'],
    ['18 kt upwind, outhaul off', () => { const b = boat({ heading: 318, windKt: 18 }); wrong(b, 'outhaul', 0); return b; }, 'outhaul']
  ];
  for (const [name, make, line] of cases) it(`${name}: says to fix that line first, and doing it makes her faster`, () => {
    const b = make(), v = teach(b);
    expect(v.top.kind).toBe('fix');
    expect(v.top.line).toBe(line);
    expect(v.top.why.length).toBeGreaterThan(10); expect(v.top.look.length).toBeGreaterThan(10);
    const before = kt(b);
    (b.ctlTarget ??= {})[line as 'vang'] = v.top.to!; hold(b, 30);
    expect(kt(b)).toBeGreaterThan(before + 0.02);
  });
  it('with two things wrong, the bigger loss comes first', () => {
    const b = boat({ heading: 318, windKt: 10 });
    takeLine(b, 'jibsheet'); takeLine(b, 'vang'); b.ctlTarget = { jibsheet: 0.3, vang: 0.4 }; hold(b, 30);
    const v = teach(b);
    expect(v.top.line).toBe('jibsheet');
    for (const l of v.more) expect(l.gain).toBeLessThanOrEqual(v.top.gain);
  });
  it('with the crew trimming, it says trim is right instead of padding', () => {
    for (const [h, w] of [[318, 8], [318, 14], [270, 12], [215, 16]]) {
      const v = teach(boat({ heading: h, windKt: w }));
      expect(v.top.kind).toBe('ok'); expect(v.top.head).toMatch(/^Trim's right/); expect(v.more).toEqual([]);
    }
  });
  it('a line you hold that costs nothing is left alone (the traveller up in 20 kt: the crew eases the sheet to hold the boom)', () => {
    const b = boat({ heading: 318, windKt: 20, sea: CHOP }); wrong(b, 'traveller', -1);
    expect(teach(b).top.kind).toBe('ok');
  });
  it('in a breeze the crew easing the main is explained as deliberate, never "trim in"', () => {
    const v = teach(boat({ heading: 318, windKt: 20, sea: CHOP }));
    expect(v.situation.over).toBe(true);
    expect(v.crew).toMatch(/deliberate/);
    expect([v.top, ...v.more].some(l => /trim .*in/i.test(l.head))).toBe(false);
  });
  it('fitted to the situation: wind band, sea and point of sail in the label', () => {
    expect(teach(boat({ heading: 318, windKt: 20, sea: CHOP })).situation.label).toBe('UPWIND · HEAVY 20 kt · CHOP · OVERPOWERED');
    expect(teach(boat({ heading: 215, windKt: 5 })).situation.label).toMatch(/^BROAD REACH · LIGHT 5 kt · FLAT/);
  });
  it('pinching: tells the helm to bear away', () => {
    const v = teach(boat({ heading: 340, windKt: 12 }));
    expect(v.top.id).toBe('steer:pinching'); expect(v.top.who).toBe('helm');
  });
  it('heaving to: recognised, step by step, then confirmed when balanced', () => {
    const b = testBoat({ heading: 318, kt: 4.5, windKt: 15 }); sail(b, 30);
    takeLine(b, 'jibsheetW'); (b.ctlTarget ??= {}).jibsheetW = 0; sail(b, 20);
    expect(teach(b).top.id).toBe('hove:takemain');
    takeLine(b, 'mainsheet'); b.ctlTarget.mainsheet = 0.55; sail(b, 20);
    expect(teach(b).top.id).toBe('hove:lash');
    b.lashed = -0.7; sail(b, 120);
    const v = teach(b);
    expect(v.top.id).toBe('hove:balanced'); expect(v.top.kind).toBe('ok');
  });
  it('closes the loop: when you fix it, it says so with the speed it made, then moves on', () => {
    const b = boat({ heading: 318, windKt: 8 }); wrong(b, 'jibsheet', 0.3);
    const m = new CoachMemory(); let t = 0;
    const first = m.step(b, t);
    expect(first.view.top.line).toBe('jibsheet'); expect(first.fresh).toBe(first.view.top.head); // new: goes on screen
    expect(m.step(b, t += 0.5).fresh).toBeNull(); // same thing: not shouted again
    b.ctlTarget = { jibsheet: first.view.top.to! };
    let done: string | null = null;
    hold(b, 20, () => { t += 1 / 60; if (Math.round(t * 60) % 30 === 0) { const r = m.step(b, t); done ??= r.done; } });
    expect(done).toMatch(/^That's it: jib telltales streaming both sides, 3\.\d → [34]\.\d kt\./);
    expect(m.step(b, t).view.top.kind).toBe('ok');
  });
  it('more teachers can join (crew weight, say): ranked with the rest', () => {
    const b = boat({ heading: 318, windKt: 6 });
    addLessonSource((bt, s) => s.band === 'light' && bt.isUser ? [{ id: 'test:weight', who: 'crew', head: 'Everyone to leeward.', why: 'test', look: 'test', gain: 0.05, kind: 'fix' }] : []);
    expect(teach(b).top.id).toBe('test:weight');
  });
});
