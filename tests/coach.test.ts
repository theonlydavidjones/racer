import { describe, expect, it } from 'vitest';
import { testBoat, sail, kt, courseHeading } from './helpers/testBoat';
import { takeLine } from '../src/boat/physics';
import { CoachMemory, FIX_MIN, SETTLE_S, addLessonSource, lessons, lineNotes, situation, teach } from '../src/boat/coach';
import type { Boat } from '../src/boat/boat';
import type { SeaHere } from '../src/environment/sea';

/** Sail holding the heading exactly, so comparisons are like for like. */
const hold = (b: Boat, t: number, each?: () => void) => { const h = b.h; sail(b, t, () => { b.h = h; each?.(); }); };
const CHOP: SeaHere = { hsW: 0.6, tpW: 3, fromW: 0, hsS: 0, tpS: 10, fromS: 270, steep: 0.05, white: 0.03, fetch: 8000 };
function boat(o: { heading: number; windKt: number; sea?: SeaHere }) { const b = testBoat({ heading: o.heading, kt: 5, windKt: o.windKt }); if (o.sea) b.sea = o.sea; sail(b, 30, () => { b.h = courseHeading(b, o.heading); }); return b; } // (`heading`: her course, her leeway allowed for; then held)
/** You take a line and set it wrong. */
function wrong(b: Boat, k: 'jibsheet' | 'mainsheet' | 'backstay' | 'vang' | 'outhaul' | 'traveller', v: number) { takeLine(b, k); (b.ctlTarget ??= {})[k] = v; hold(b, 30); }

describe('the trim coach: one thing at a time, and the right thing', () => {
  const cases: [string, () => Boat, string][] = [
    ['8 kt upwind, jib eased', () => { const b = boat({ heading: 318, windKt: 8 }); wrong(b, 'jibsheet', 0.3); return b; }, 'jibsheet'],
    ['12 kt upwind, main eased', () => { const b = boat({ heading: 318, windKt: 12 }); wrong(b, 'mainsheet', 0.6); return b; }, 'mainsheet'],
    ['20 kt upwind in chop, backstay off', () => { const b = boat({ heading: 318, windKt: 20, sea: CHOP }); wrong(b, 'backstay', 0); return b; }, 'backstay'],
    ['16 kt broad reach in chop, vang off', () => { const b = boat({ heading: 215, windKt: 16, sea: CHOP }); wrong(b, 'vang', 0); return b; }, 'vang'],
    // (16 kt: North Sails' guide has the outhaul to its mark above 12 kt. At 18–20 kt the outhaul's flattening is worth
    // little against the crew's other depowering, with the keel's induced drag for the force square to her centre plane
    // (balance.ts netDrive): part of the depowering question, ROADMAP)
    ['16 kt upwind, outhaul off', () => { const b = boat({ heading: 318, windKt: 16 }); wrong(b, 'outhaul', 0); return b; }, 'outhaul']
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
  // the depowering question (ROADMAP): North Sails has the outhaul to its mark above 12 kt, but in 18–20 kt the speed
  // search finds it worth next to nothing against the crew's other depowering
  it.todo('18–20 kt upwind, outhaul off: says to fix it, as North Sails does (the depowering question)');
  // (the guide: "Never use the kickingstrap upwind in less than 18 knots"; the crew's own solver keeps to it, and so does
  // the coach: with the main eased in light air, the cure is the sheet, not vang on hard)
  it('7 kt upwind, main eased and vang off: never "vang on" (North Sails: no vang upwind under 18 kt)', () => {
    const b = boat({ heading: 318, windKt: 7 }); takeLine(b, 'vang'); wrong(b, 'mainsheet', 0.45); (b.ctlTarget ??= {}).vang = 0; hold(b, 30);
    const { list } = lessons(b), vang = list.find(l => l.line === 'vang');
    expect(vang === undefined || (vang.to ?? 0) <= 0.1 + 1e-9).toBe(true);
    expect(list[0]?.line).toBe('mainsheet');
  });
  // Trim Notes (the review): the crew's lines say what they're doing, never a fix (a one-line search at their steady
  // state finds "fixes" that slow her); a ✓ only where the words are checked
  it('Trim Notes: no fixes on the crew\'s lines; the vang on upwind in light air gets no ✓', () => {
    const b = boat({ heading: 318, windKt: 26 }), n = lineNotes(b).notes;
    for (const x of n) if (x.who === 'crew') expect(x.fix).toBeNull();
    const b2 = boat({ heading: 318, windKt: 8 }); takeLine(b2, 'vang'); (b2.ctlTarget ??= {}).vang = 0.6; hold(b2, 20);
    const v = lineNotes(b2).notes.find(x => x.line === 'vang')!;
    if (!v.fix) expect(v.tick).toBe(false);
  });
  it('a fix that turns up while she settles is said once the quiet is over', () => {
    const b = boat({ heading: 318, windKt: 10 }), m = new CoachMemory();
    m.step(b, 0); m.quietUntil = 5; wrong(b, 'jibsheet', 0.6);
    let said: string | null = null;
    for (let t = 1; t < 5; t += 0.5) expect(m.step(b, t).fresh).toBeNull();
    for (let t = 5; t < 8 && !said; t += 0.5) said = m.step(b, t).fresh;
    expect(said).toMatch(/jib/i); expect(SETTLE_S).toBe(5);
  });
  it('with two things wrong, the bigger loss comes first', () => {
    const b = boat({ heading: 318, windKt: 10 });
    takeLine(b, 'jibsheet'); takeLine(b, 'vang'); b.ctlTarget = { jibsheet: 0.3, vang: 0.4 }; hold(b, 30);
    const v = teach(b);
    expect(v.top.line).toBe('jibsheet');
    for (const l of v.more) expect(l.gain).toBeLessThanOrEqual(v.top.gain);
  });
  it('the boom on the shroud on a broad reach: it never says to ease a main that can\'t go out further', () => {
    for (const [h, w] of [[130, 12], [120, 20], [130, 20]]) {
      const b = boat({ heading: h, windKt: w });
      for (const l of [teach(b).top, ...teach(b).more]) expect(l.head).not.toMatch(/^Ease the main/);
    }
  });
  it('with the crew trimming, it says trim is right instead of padding', () => {
    for (const [h, w] of [[318, 8], [318, 14], [270, 12], [215, 16]]) {
      const v = teach(boat({ heading: h, windKt: w }));
      expect(v.top.kind).toBe('ok'); expect(v.top.head).toMatch(/^Trim's right/); expect(v.more).toEqual([]);
    }
  });
  it('the traveller held up in 20 kt costs little with the vang on: the coach says why most boats drop it, and names nothing bigger', () => {
    // (the crew eases the sheet to hold the boom where it should be, and the forward hand has the vang hard on, so the leech
    // is held and the traveller up costs almost nothing in the model: the coach's confirmation explains it rather than
    // calling it a fix. With the vang still part way on, the traveller costs about 1% and the coach names it: either way
    // it's the traveller or nothing, never something bigger. (Which, depends on when the forward hand has got to the vang:
    // crewWork.ts LINE_TRIP)
    const b = boat({ heading: 318, windKt: 20, sea: CHOP }); wrong(b, 'traveller', -1);
    const v = teach(b);
    if (v.top.kind === 'fix') { expect(v.top.line).toBe('traveller'); expect(v.top.gain).toBeLessThan(2.75 * FIX_MIN); }
    else expect(v.top.why).toMatch(/vang holds the leech/);
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
    takeLine(b, 'mainsheet'); b.ctlTarget.mainsheet = 0.62; sail(b, 20); // (eased till she luffs: 0.55 did it while the boom's best place was 6° further out; there she now draws 85% still, and the coach rightly asks for more)
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
    expect(done).toMatch(/^That's it: the jib's luff telltales streaming, windward and leeward, 3\.\d → [34]\.\d kt\./);
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
  it('the mainsheet held eased: the boom is yours, the crew leave the car where it was, and the coach says to trim', () => {
    // (North Sails' Folkboat guide sets the car by the wind, the middle at 6-14 kt; the crew no longer haul it up to undo
    // your eased sheet: physics.ts, traveler-ease.test.ts)
    for (const W of [8, 12]) {
      const set = boat({ heading: 318, windKt: W }).ctl.traveller, b = boat({ heading: 318, windKt: W }); wrong(b, 'mainsheet', 0.3);
      expect(Math.abs(b.ctl.traveller - set)).toBeLessThan(0.05);
      expect(teach(b).top.head).toMatch(/main/i);
    }
  });
  it('the traveller held up in a breeze: right in the model, but it says why most boats drop it', () => {
    const b = boat({ heading: 318, windKt: 20, sea: CHOP }); wrong(b, 'traveller', -1);
    const v = teach(b);
    // (or, a hair overpowered with the helm and the crew aft on the narrower deck: drop it, which is what most boats do)
    if (v.top.kind === 'fix') { expect(v.top.line).toBe('traveller'); expect(v.top.gain).toBeLessThan(2.75 * FIX_MIN); }
    else { expect(v.top.kind).toBe('ok'); expect(v.top.why).toMatch(/Most boats drop it/); }
  });
});


describe('the trim coach: the wind\'s band', () => {
  it('follows the wind as shown (a 7 is light, a 15 medium), and holds a half-knot past each edge once said', () => {
    const at = (kt: number, band?: 'light' | 'medium' | 'heavy') => { const b = boat({ heading: 318, windKt: 10 }); b.ww.kt = kt; return situation(b, { band }).band; };
    expect(at(7.4)).toBe('light'); expect(at(7.6)).toBe('medium'); expect(at(15.4)).toBe('medium'); expect(at(15.6)).toBe('heavy');
    expect(at(7.8, 'light')).toBe('light'); expect(at(7.2, 'medium')).toBe('medium'); // (held about the edge)
    expect(at(8.1, 'light')).toBe('medium'); expect(at(6.9, 'medium')).toBe('light'); // (past the half-knot: it moves)
    expect(at(15.9, 'medium')).toBe('medium'); expect(at(15.1, 'heavy')).toBe('heavy');
    expect(at(11, 'light')).toBe('medium');
  });
});
