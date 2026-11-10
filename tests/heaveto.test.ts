import { describe, expect, it } from 'vitest';
import { testBoat, sail, kt } from './helpers/testBoat';
import { KT, wrap } from '../src/core/math';
import { allToCrew, byHand, linesByHand, takeLine } from '../src/boat/physics';
import { jibClew } from '../src/boat/controls';
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
    expect(b.ctl.backstay).toBeGreaterThan(0.4); // the crew's: still working it for 20 kt
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
    sail(b, 20); const best = b.ctl.mainsheet;
    b.ctlCmd.mainsheet = 1; sail(b, 3); b.ctlCmd = {};
    expect(b.ctl.mainsheet).toBeGreaterThan(best + 0.2);
    takeLine(b, 'mainsheet', false); sail(b, 15);
    expect(b.ctl.mainsheet).toBeCloseTo(best, 1);
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
    expect(b.ctl.jibsheet).toBe(1);
    expect(b.sheets.jib).toBeLessThan(-8); // clew held at the windward car
    expect(b.jibBacked).toBe(1);
  });
  it('the windward sheet only bites once hauled well in (it runs across in front of the mast)', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 12 }), c = { ...b.ctl, jibsheet: 1 };
    expect(jibClew({ ...c, jibsheetW: 0.9 }, 'S')).toBeGreaterThan(60);
    expect(jibClew({ ...c, jibsheetW: 0 }, 'S')).toBeLessThan(-8);
  });
  it('tack holding both sheets and the jib is aback on the new tack (the classic way to heave to)', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 12 }); sail(b, 15);
    takeLine(b, 'jibsheet'); takeLine(b, 'jibsheetW');
    const trimmed = b.ctl.jibsheet;
    b.turnDir = 1; b.turnTarget = 42; sail(b, 12, () => { if (b.turnTarget == null) return true; });
    expect(b.tack).toBe('P');
    expect(b.ctl.jibsheetW).toBeCloseTo(trimmed, 5); // the sheet you'd trimmed is now the windward one
    expect(b.jibBacked).toBeGreaterThan(0.5);
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
  sail(b, 30);
  takeLine(b, 'jibsheetW'); (b.ctlTarget ??= {}).jibsheetW = 0;
  takeLine(b, 'mainsheet'); b.ctlTarget.mainsheet = o.main ?? 0.55;
  sail(b, 20);
  b.lashed = (o.lash ?? 0.7) * (port ? 1 : -1); // to leeward: port side on starboard tack
  sail(b, 120);
  const x0 = b.x, y0 = b.y; let n = 0, twa = 0, lo = 999, hi = -999, u = 0, d = 0;
  sail(b, 300, () => { const a = Math.abs(wrap(b.ww.from - b.h)); twa += a; lo = Math.min(lo, a); hi = Math.max(hi, a); u += b.v; d += b.drift ?? 0; n++; });
  const dx = b.x - x0, dy = b.y - y0;
  return { b, twa: twa / n, swing: hi - lo, ahead: u / n / KT, lee: d / n / KT, made: Math.hypot(dx, dy) / 300 / KT,
    track: Math.abs(wrap(Math.atan2(dx, dy) * 180 / Math.PI - b.ww.from)) /* deg off the wind's direction */ };
}

describe('heaving to', () => {
  for (const W of [8, 12, 16, 20, 25]) it(`lies hove to in ${W} kt: bow 35–65° off, creeping ahead, slipping to leeward`, () => {
    const r = heaveTo(W);
    expect(r.b.jibBacked).toBe(1);
    expect(r.twa).toBeGreaterThan(35); expect(r.twa).toBeLessThan(65);
    expect(r.swing).toBeLessThan(15); // steady: she doesn't tack or bear away and sail off
    expect(r.ahead).toBeGreaterThan(0.3); expect(r.ahead).toBeLessThan(1.8);
    expect(r.lee).toBeGreaterThan(0.3); expect(r.lee).toBeLessThan(2);
    expect(r.track).toBeGreaterThan(70); expect(r.track).toBeLessThan(120); // she goes roughly square to the wind
  });
  it('slips to leeward faster as the wind builds', () => {
    expect(heaveTo(25).lee).toBeGreaterThan(heaveTo(12).lee + 0.4);
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
    expect(b.jibBacked).toBe(0); expect(b.drift ?? 0).toBeLessThan(0.05);
    expect(kt(b)).toBeGreaterThan(4);
  });
  it('a lashed tiller stays put, hands off', () => {
    const b = testBoat({ heading: 318, kt: 4.5, windKt: 12 }); b.lashed = -0.4; b.steer = 1;
    sail(b, 2); expect(b.tiller).toBe(-0.4);
  });
});
