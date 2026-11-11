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
    ['16 kt broad reach in chop, vang off', () => { const b = boat({ heading: 215, windKt: 16, sea: CHOP }); wrong(b, 'vang', 0); return b; }, 'vang']
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
  it('18 kt upwind, outhaul off: the crew makes up for it with the backstay and vang, so it costs next to nothing and is left alone', () => {
    // (the outhaul only flattens the foot, 3 cm off the band to on it: about 1.5% of camber, North Sails' range)
    const ok = boat({ heading: 318, windKt: 18 }), b = boat({ heading: 318, windKt: 18 }); wrong(b, 'outhaul', 0); hold(ok, 30);
    expect(teach(b).top.kind).toBe('ok');
    expect(Math.abs(kt(b) - kt(ok))).toBeLessThan(0.05);
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
  it('in a gale the crew easing the main is explained as deliberate, never "trim in"', () => {
    // (the boom eases out down the traveller only on the last depowering steps: physics.ts crewEaseBoom)
    const v = teach(boat({ heading: 318, windKt: 28, sea: CHOP }));
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
    const off = addLessonSource((bt, s) => s.band === 'light' && bt.isUser ? [{ id: 'test:weight', who: 'crew', head: 'Everyone to leeward.', why: 'test', look: 'test', gain: 0.05, kind: 'fix' }] : []);
    expect(teach(b).top.id).toBe('test:weight');
    off(); expect(teach(b).top.id).not.toBe('test:weight');
  });
});

describe('the trim coach: from the physics review', () => {
  it('main two-blocked in 14 kt with the crew on the traveller: the crew answers on the traveller, and any advice makes her no slower', () => {
    const crew = boat({ heading: 318, windKt: 14 }); hold(crew, 30);
    const b = boat({ heading: 318, windKt: 14 }); wrong(b, 'mainsheet', 0);
    expect(kt(b)).toBeGreaterThan(kt(crew) * 0.98); // the crew drops the traveller to put the boom where it should be
    const v = teach(b), before = kt(b);
    if (v.top.line === 'mainsheet') { b.ctlTarget = { mainsheet: v.top.to! }; hold(b, 40); expect(kt(b)).toBeGreaterThanOrEqual(before - 0.005); }
  });
  it('no false "That\'s it": handing the line back, or easing to slow down, isn\'t a fix', () => {
    for (const how of ['giveBack', 'luff'] as const) {
      const b = boat({ heading: 318, windKt: 8 }); wrong(b, 'jibsheet', 0.3);
      const m = new CoachMemory(); let t = 0, done: string | null = null;
      m.step(b, t);
      if (how === 'giveBack') takeLine(b, 'jibsheet', false); else b.luff = true;
      hold(b, 15, () => { t += 1 / 60; if (Math.round(t * 60) % 30 === 0) done ??= m.step(b, t).done; });
      expect(done).toBeNull();
    }
  });
  it('hove to with the main right off: lying beam-on, it says to trim the main a little (not "lash the tiller" again)', () => {
    const b = testBoat({ heading: 318, kt: 4.5, windKt: 15 }); sail(b, 30);
    takeLine(b, 'jibsheetW'); takeLine(b, 'mainsheet'); b.ctlTarget = { jibsheetW: 0, mainsheet: 1 }; sail(b, 20);
    b.lashed = -0.7; sail(b, 120);
    expect(teach(b).top.id).toBe('hove:beamon');
  });
  it('hove to with the tiller lashed amidships: says to move the lashing to leeward', () => {
    const b = testBoat({ heading: 318, kt: 4.5, windKt: 15 }); sail(b, 30);
    takeLine(b, 'jibsheetW'); takeLine(b, 'mainsheet'); b.ctlTarget = { jibsheetW: 0, mainsheet: 0.55 }; sail(b, 20);
    b.lashed = 0; sail(b, 30);
    expect(teach(b).top.id).toBe('hove:lashmid');
  });
  it('never tells you to feather on a reach', () => {
    for (const W of [26, 30]) {
      const v = teach(boat({ heading: 295, windKt: W }));
      expect([v.top, ...v.more].some(l => l.id === 'steer:feather')).toBe(false);
    }
  });
  it('both sheets eased by hand upwind, sails flogging: the coach says to trim, not "building speed"', () => {
    const b = boat({ heading: 318, windKt: 10 });
    takeLine(b, 'mainsheet'); takeLine(b, 'jibsheet'); b.ctlTarget = { mainsheet: 0.8, jibsheet: 0.8 }; hold(b, 30);
    const v = teach(b);
    expect(v.top.kind).toBe('fix'); expect(['mainsheet', 'jibsheet']).toContain(v.top.line); expect(v.top.gain).toBeGreaterThan(0.3);
  });
  it('the main two-blocked in 6 kt: the lesson is about the leech, never "about 0°"', () => {
    const b = boat({ heading: 318, windKt: 6 }); wrong(b, 'mainsheet', 0);
    for (const l of [teach(b).top, ...teach(b).more]) expect(l.head).not.toMatch(/about 0°/);
  });
  it('the mainsheet held eased in light air: the crew brings the traveller up to put the boom where it should be', () => {
    for (const W of [8, 12]) {
      const own = boat({ heading: 318, windKt: W }), b = boat({ heading: 318, windKt: W }); wrong(b, 'mainsheet', 0.3); hold(own, 30);
      expect(b.ctl.traveller).toBeLessThan(-0.5);
      // the boom where it should be; what's left is the leech, open with the sheet slanting from a car to windward
      // (controls.ts mainShape): a few percent
      expect(kt(b)).toBeGreaterThan(kt(own) * 0.96);
    }
  });
  it('the traveller held up in a breeze: right in the model, but it says why most boats drop it', () => {
    const b = boat({ heading: 318, windKt: 20, sea: CHOP }); wrong(b, 'traveller', -1);
    const v = teach(b);
    expect(v.top.kind).toBe('ok'); expect(v.top.why).toMatch(/Most boats drop it/);
  });
});

