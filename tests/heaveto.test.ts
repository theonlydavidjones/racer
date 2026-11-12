import { describe, expect, it } from 'vitest';
import { testBoat, sail, kt } from './helpers/testBoat';
import { KT, wrap } from '../src/core/math';
import { allToCrew, byHand, crewMainAngle, leeDrift, linesByHand, takeLine } from '../src/boat/physics';
import { jibClew, shapeEfficiency, targetShape } from '../src/boat/controls';
import { polar } from '../src/boat/polar';
import type { Boat } from '../src/boat/boat';

/* ---------- 2a: one line at a time ---------- */

describe('taking one line off the crew', () => {
  it('working the mainsheet takes only the mainsheet: the crew keeps the rest', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 20 });
    b.ctl.backstay = 0;
    b.ctlCmd.mainsheet = 1; sail(b, 1); b.ctlCmd = {};
    expect(byHand(b, 'mainsheet')).toBe(true);
    expect(linesByHand(b)).toEqual(['mainsheet']);
    const eased = b.ctl.mainsheet;
    sail(b, 20);
    expect(b.ctl.mainsheet).toBeCloseTo(eased, 5); // yours: it stays where you left it
    // the crew's: still working it toward their setting for 20 kt (as an untouched boat has it)
    const own = testBoat({ heading: 318, kt: 5, windKt: 20 }); sail(own, 21);
    expect(b.ctl.backstay).toBeGreaterThan(Math.min(0.2, own.ctl.backstay - 0.1));
    expect(byHand(b, 'jibsheet')).toBe(false);
  });
  it('dragging a line to a setting takes it too', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 12 });
    (b.ctlTarget ??= {}).vang = 0.9; sail(b, 6);
    expect(byHand(b, 'vang')).toBe(true);
    expect(b.ctl.vang).toBeCloseTo(0.9, 2);
  });
  it('one tap gives it back: the crew trims it again', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 12 });
    sail(b, 20); const best = b.sheets.main, eff = b.shape.eff;
    b.ctlCmd.mainsheet = 1; sail(b, 3); b.ctlCmd = {};
    expect(b.sheets.main).toBeGreaterThan(best + 10);
    // (back up to speed: until then the apparent wind is wider and the trimmer eases for it, which opens the leech)
    takeLine(b, 'mainsheet', false); sail(b, 30);
    // back where the crew wants the boom (with the traveller and sheet it likes: more than one way to the same angle), to
    // within the trimmer's deadband (crewWork.ts: a sheet is not touched for less than 0.006, about 0.3° of boom here)
    expect(Math.abs(b.sheets.main - crewMainAngle(b))).toBeLessThan(1); expect(Math.abs(b.sheets.main - best)).toBeLessThan(1);
    // (the leech within what the trimmer's deadband leaves: a few tenths of a degree of boom move it, controls.ts mainShape)
    expect(b.shape.eff).toBeGreaterThan(eff - 0.006);
    expect(linesByHand(b)).toEqual([]);
  });
  it('all back to the crew at once, including lines from the old "trim all" setting', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 12 });
    b.manualTrim = b.trimAll = true; takeLine(b, 'jibsheetW');
    expect(linesByHand(b).length).toBe(11);
    allToCrew(b);
    expect(linesByHand(b)).toEqual([]);
  });
  it('the AI boats are always crewed', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 12 }); b.isUser = false; b.hand = { mainsheet: true };
    expect(byHand(b, 'mainsheet')).toBe(false);
  });
});

/* ---------- 2b: the jib sheets one at a time ---------- */

describe('the two jib sheets', () => {
  it('sailing normally the crew keeps the windward sheet slack and the jib to leeward', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 12 }); sail(b, 20);
    expect(b.ctl.jibsheetW).toBe(1);
    expect(b.sheets.jib).toBeGreaterThan(8);
    expect(b.jibBacked).toBe(0);
  });
  it('haul the windward sheet and the crew lets the leeward one fly: the jib backs', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 12 }); sail(b, 10);
    takeLine(b, 'jibsheetW'); (b.ctlTarget ??= {}).jibsheetW = 0; sail(b, 15);
    expect(b.ctl.jibsheet).toBeCloseTo(1, 3); // (let fly: all the way out, or within a hair of it as it runs)
    expect(b.sheets.jib).toBeLessThan(-8); // clew held at the windward car
    expect(b.jibBacked).toBe(1);
  });
  it('the windward sheet only bites once hauled well in (it runs across in front of the mast)', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 12 }), c = { ...b.ctl, jibsheet: 1 };
    expect(jibClew({ ...c, jibsheetW: 0.9 }, 'S')).toBeGreaterThan(60);
    expect(jibClew({ ...c, jibsheetW: 0 }, 'S')).toBeLessThan(-8);
  });
  it('tack holding both sheets and the jib is aback on the new tack (the classic way to heave to)', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 12 }); sail(b, 15, () => { b.h = 318 + (b.leeway ?? 0); }); // (close-hauled: her course 42°)
    takeLine(b, 'jibsheet'); takeLine(b, 'jibsheetW');
    const trimmed = b.ctl.jibsheet;
    b.turnDir = 1; b.turnTarget = 42; sail(b, 12, () => { if (b.turnTarget == null) return true; });
    expect(b.tack).toBe('P');
    expect(b.ctl.jibsheetW).toBeCloseTo(trimmed, 5); // the sheet you'd trimmed is now the windward one
    expect(b.jibBacked).toBeGreaterThan(0.5);
  });
  it('tack holding both sheets with a tack called: she carries through the turn, not stuck head to wind, and lies with the jib aback', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 15 }); sail(b, 15);
    takeLine(b, 'jibsheet'); takeLine(b, 'jibsheetW');
    b.turnDir = 1; b.turnTarget = 42; sail(b, 60);
    expect(b.tack).toBe('P');
    expect(Math.abs(wrap(b.ww.from - b.h))).toBeGreaterThan(15);
    expect(b.hove).toBe(true); expect(b.sheets.jib).toBeLessThan(-1);
  });
  it('a windward sheet hauled and eased off again goes back to the crew: the next tack is an ordinary one', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 15 }); sail(b, 15);
    takeLine(b, 'jibsheetW'); (b.ctlTarget ??= {}).jibsheetW = 0.3; sail(b, 8);
    b.ctlTarget.jibsheetW = 1; sail(b, 10);
    expect(byHand(b, 'jibsheetW')).toBe(false);
    b.turnDir = 1; b.turnTarget = 42; sail(b, 25);
    expect(b.tack).toBe('P'); expect(b.jibBacked).toBe(0); expect(byHand(b, 'jibsheet')).toBe(false);
    expect(kt(b)).toBeGreaterThan(3);
  });
  it('backing the jib from head to wind pays her off (the way out of irons)', () => {
    const b = testBoat({ heading: 358, kt: 0, windKt: 12 }) as Boat & { handsOff?: boolean }; b.handsOff = true;
    takeLine(b, 'jibsheetW'); (b.ctlTarget ??= {}).jibsheetW = 0; sail(b, 40);
    expect(Math.abs(wrap(b.ww.from - b.h))).toBeGreaterThan(15); // off the wind's eye, though the crew's hard main holds her up
    // the textbook way: back the jib and ease the main
    const c = testBoat({ heading: 358, kt: 0, windKt: 12 }) as Boat & { handsOff?: boolean }; c.handsOff = true;
    takeLine(c, 'jibsheetW'); takeLine(c, 'mainsheet'); (c.ctlTarget ??= {}).jibsheetW = 0; c.ctlTarget.mainsheet = 0.6; sail(c, 40);
    expect(Math.abs(wrap(c.ww.from - c.h))).toBeGreaterThan(30);
  });
  it('penalty turns count while the jib is aback', () => {
    const { b } = heaveTo(15);
    b.penalty = b.penaltyTotal = 360; b.penaltyTurned = 0; b.penaltyDir = 0;
    b.lashed = null; b.tiller = 1; (b as Boat & { handsOff?: boolean }).handsOff = true; sail(b, 5);
    expect(Math.abs(b.penaltyTurned)).toBeGreaterThan(0);
  });
  it('tack with the crew on the jib and it comes across as usual', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 12 }); sail(b, 15);
    b.turnDir = 1; b.turnTarget = 42; sail(b, 25);
    expect(b.tack).toBe('P');
    expect(b.jibBacked).toBe(0);
    expect(b.ctl.jibsheetW).toBe(1);
  });
});

/* ---------- 2b: hove to ---------- */

/**
 * Heave to as a sailor would: close-hauled, haul the windward jib sheet (the crew lets the leeward one go), ease the
 * main, then lash the tiller to leeward. Averages over five minutes once she's settled.
 *
 * What she should do, from the figures we could find (all anecdotal or seamanship guides; nothing measured):
 * Folkboat and Marieholm IF owners report fore-reaching about 1–1.5 kn hove to (ifboat.com forum; ybw.com "Stopping a
 * Folkboat"); guides put the bow 40–60° off the wind (Skip Novak, Yachting World: about 45°; bwsailing.com) and the drift
 * at 1–2 kn in a blow, less for long keels (seabreeze.com.au; the Pardeys' 0.5 kn is for storm canvas). So the bands
 * here are deliberately wide: 35–65° off the wind, 0.3–1.8 kn ahead, 0.3–2 kn to leeward, her track near square to the
 * wind, and steady.
 */
function heaveTo(windKt: number, o: { tack?: 'S' | 'P'; main?: number; lash?: number } = {}) {
  const port = o.tack === 'P', b = testBoat({ heading: port ? 42 : 318, kt: 4.5, windKt });
  // (close-hauled on a course 42° off the wind: her heading her leeway higher, physics.ts b.leeway)
  sail(b, 30, () => { b.h = port ? 42 - (b.leeway ?? 0) : 318 + (b.leeway ?? 0); });
  takeLine(b, 'jibsheetW'); (b.ctlTarget ??= {}).jibsheetW = 0;
  takeLine(b, 'mainsheet'); b.ctlTarget.mainsheet = o.main ?? 0.55;
  sail(b, 20);
  b.lashed = (o.lash ?? 0.7) * (port ? 1 : -1); // to leeward: port side on starboard tack
  sail(b, 120);
  const x0 = b.x, y0 = b.y; let n = 0, twa = 0, lo = 999, hi = -999, u = 0, d = 0;
  sail(b, 300, () => { const a = Math.abs(wrap(b.ww.from - b.h)); twa += a; lo = Math.min(lo, a); hi = Math.max(hi, a); u += b.v; d += leeDrift(b); n++; });
  const dx = b.x - x0, dy = b.y - y0;
  return { b, twa: twa / n, swing: hi - lo, ahead: u / n / KT, lee: d / n / KT, made: Math.hypot(dx, dy) / 300 / KT,
    track: Math.abs(wrap(Math.atan2(dx, dy) * 180 / Math.PI - b.ww.from)) /* deg off the wind's direction */ };
}

describe('a backed jib never makes her faster', () => {
  const cl = (x: number) => Math.max(-1, Math.min(1, x));
  for (const W of [8, 12, 18, 25, 35]) it(`${W} kt, close-hauled to a run: never past the polar, always slower than she was`, () => {
    for (const twa of [50, 70, 90, 110, 130, 150]) {
      const b = testBoat({ heading: 360 - twa, kt: 5, windKt: W }) as Boat & { handsOff?: boolean }; b.handsOff = true;
      const hold = () => { b.tiller = -cl(wrap(360 - twa - b.h) * 0.08); };
      sail(b, 40, hold); const before = kt(b);
      takeLine(b, 'jibsheetW'); (b.ctlTarget ??= {}).jibsheetW = 0;
      let top = 0; sail(b, 90, () => { hold(); top = Math.max(top, kt(b)); });
      expect(top).toBeLessThan(Math.max(before, polar(W, twa, 'jib') / KT) + 0.15);
      expect(kt(b)).toBeLessThan(before + 0.2); // (in a gale the polar-model boat is held back by heel, which the backed jib eases)
    }
  });
});

describe('the crew works around the lines you hold', () => {
  it('taking the jib sheet (or the jib car) upwind in 12 kt leaves the crew\'s main settings where they were', () => {
    for (const k of ['jibsheet', 'car'] as const) {
      const b = testBoat({ heading: 318, kt: 5, windKt: 12 });
      sail(b, 30); const was = { traveller: b.ctl.traveller, vang: b.ctl.vang, mainsheet: b.ctl.mainsheet };
      takeLine(b, k); sail(b, 20);
      expect(b.ctl.traveller).toBeCloseTo(was.traveller, 1);
      expect(b.ctl.vang).toBeCloseTo(was.vang, 1);
      expect(b.ctl.mainsheet).toBeCloseTo(was.mainsheet, 1);
    }
  });
  it('traveller held hard down in a breeze: the crew sets the vang for it, keeping the main near its best shape', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 18 });
    sail(b, 30); const vang = b.ctl.vang; takeLine(b, 'traveller'); (b.ctlTarget ??= {}).traveller = 1; sail(b, 30);
    expect(b.ctl.traveller).toBeCloseTo(1, 2);
    // the boom's already down to leeward on the traveller, so the crew needs no more vang than it had (it doesn't
    // undo its depowering: she's still overpowered in 18 kt)
    expect(b.ctl.vang).toBeLessThanOrEqual(vang + 0.02);
    expect(shapeEfficiency(b.shape.main, targetShape('main', 18, b.awa, b.depower))).toBeGreaterThan(0.965);
  });
});

describe('heaving to', () => {
  for (const W of [8, 12, 16, 20, 25]) it(`lies hove to in ${W} kt: bow 35–65° off, creeping ahead, slipping to leeward`, () => {
    // (in 8 kt, a lighter lashing, as a sailor eases the helm in light air until she lies quietly: with the breeze's 0.7
    // she's on a knife edge, rounding up to within 2° of the wind before she falls off again, and a few percent more
    // speed going in (4.12 kt against 4.00, as leeway's freer course gave her) takes her through the wind; it did so
    // before leeway too)
    const r = heaveTo(W, W === 8 ? { lash: 0.6 } : {});
    expect(r.b.jibBacked).toBe(1);
    expect(r.twa).toBeGreaterThan(35); expect(r.twa).toBeLessThan(65);
    expect(r.swing).toBeLessThan(15); // steady: she doesn't tack or bear away and sail off
    // (in light air she barely creeps: the Pardeys report half a knot or less; 0.2 kn is our floor below 10 kt, a judgement)
    expect(r.ahead).toBeGreaterThan(W < 10 ? 0.2 : 0.3); expect(r.ahead).toBeLessThan(1.8);
    expect(r.lee).toBeGreaterThan(0.3); expect(r.lee).toBeLessThan(2);
    expect(r.track).toBeGreaterThan(70); expect(r.track).toBeLessThan(120); // she goes roughly square to the wind
  });
  it('slips to leeward faster as the wind builds', () => {
    expect(heaveTo(25).lee).toBeGreaterThan(heaveTo(12).lee + 0.3);
  });
  it('works the same on port tack', () => {
    const s = heaveTo(15), p = heaveTo(15, { tack: 'P' });
    expect(p.b.tack).toBe('P');
    expect(p.twa).toBeCloseTo(s.twa, 0); expect(p.ahead).toBeCloseTo(s.ahead, 1); expect(p.lee).toBeCloseTo(s.lee, 1);
  });
  it('the main sets how high she lies: ease it further and she lies further off the wind', () => {
    expect(heaveTo(15, { main: 0.7 }).twa).toBeGreaterThan(heaveTo(15, { main: 0.5 }).twa + 5);
  });
  it('without enough helm she fore-reaches: a light lashing lets her sail along faster', () => {
    expect(heaveTo(15, { lash: 0.2 }).ahead).toBeGreaterThan(heaveTo(15, { lash: 0.9 }).ahead + 1);
  });
  it('with the tiller amidships the backed jib holds her bow further off the wind', () => {
    const b = testBoat({ heading: 318, kt: 4.5, windKt: 15 }) as Boat & { handsOff?: boolean };
    sail(b, 20); takeLine(b, 'jibsheetW'); (b.ctlTarget ??= {}).jibsheetW = 0; takeLine(b, 'mainsheet'); b.ctlTarget.mainsheet = 0.55;
    b.handsOff = true; b.tiller = 0; sail(b, 150);
    expect(Math.abs(wrap(b.ww.from - b.h))).toBeGreaterThan(heaveTo(15).twa + 12);
  });
  it('let the windward sheet go and unlash, and she sails off again', () => {
    const { b } = heaveTo(15);
    takeLine(b, 'jibsheetW', false); takeLine(b, 'mainsheet', false); b.lashed = null;
    b.turnDir = -1; b.turnTarget = 300; sail(b, 90);
    expect(b.jibBacked).toBe(0); expect(Math.atan2(Math.abs(b.sway ?? 0), b.v) * 180 / Math.PI).toBeLessThan(5); // (her leeway at speed on a close reach, 60° off: a few degrees)
    expect(kt(b)).toBeGreaterThan(4);
  });
  it('a lashed tiller stays put, hands off', () => {
    const b = testBoat({ heading: 318, kt: 4.5, windKt: 12 }); b.lashed = -0.4; b.steer = 1;
    sail(b, 2); expect(b.tiller).toBe(-0.4);
  });
});
