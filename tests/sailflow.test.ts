import { describe, expect, it } from 'vitest';
import { testBoat, sail, courseHeading } from './helpers/testBoat';
import { takeLine } from '../src/boat/physics';
import { CE_ABOVE_WL } from '../src/boat/balance';
import { SAILS } from '../src/boat/trim';
import type { Boat } from '../src/boat/boat';
import { flowState, flowWords, flowField, gridField, camberLine, streamline, windAt, sectionAt, turnFor } from '../src/ui/sailFlow';
import { crewEaseBoom } from '../src/boat/physics';

/** Sailing on a course (deg, wind from 0) in `windKt`, the crew trimming, held there for a while. */
function sailing(heading: number, windKt: number, then?: (b: Boat) => void): Boat {
  const b = testBoat({ heading, kt: 5, windKt });
  sail(b, 30, () => { b.h = courseHeading(b, heading); });
  if (then) { then(b); const h = b.h; sail(b, 20, () => { b.h = h; }); }
  return b;
}
/** The angle the sim's own trim was worked out at (trim.ts sailTrim: err = (awa − sheet) − best). */
const simAwa = (b: Boat) => b.trim.main.err + b.sheets.main + SAILS.main.aoa;

describe('the flow view: the sim\'s own numbers', () => {
  for (const [name, heading, kt] of [['upwind 12 kt', 318, 12], ['close reach 8 kt', 290, 8], ['broad reach 16 kt', 225, 16]] as const) {
    it(`${name}: the wind at the centre of effort is the sim's exactly, and every cut shows the sim's one trim`, () => {
      const b = sailing(heading, kt), st = flowState(b);
      expect(windAt(b, CE_ABOVE_WL).awa).toBeCloseTo(simAwa(b), 2);
      expect(st.sails.find(s => s.sail === 'main')!.awa).toBeCloseTo(simAwa(b), 6);
      for (const c of st.cuts) for (const s of c.sections) expect(s.trim).toBe(b.trim[s.sail]);
    });
  }
  it('the sheet sets the foot, and the twist opens the sail up the luff', () => {
    const b = sailing(318, 12), st = flowState(b);
    const main = st.cuts.map(c => c.sections.find(s => s.sail === 'main')!.angle);
    expect(main[0]).toBeGreaterThanOrEqual(b.sheets.main); expect(main[1]).toBeGreaterThan(main[0]); expect(main[2]).toBeGreaterThan(main[1]);
    // (at the boom itself the section is the boom: 2.4 m is 0.75 m up an 8.75 m luff)
    expect(main[0] - b.sheets.main).toBeCloseTo(b.shape.main.twist * (2.4 - 1.65) / 8.75, 6);
  });
  it('up the mast there is more wind, from further aft (the gradient)', () => {
    const b = sailing(318, 12), lo = windAt(b, 2.4), hi = windAt(b, 8.2);
    expect(hi.kt).toBeGreaterThan(lo.kt + 1); expect(hi.awa).toBeGreaterThan(lo.awa);
  });
  it('high up, only the main: the jib\'s head is below 6.5 m', () => {
    const [lo, , hi] = flowState(sailing(318, 12)).cuts;
    expect(lo.sections.map(s => s.sail)).toEqual(['jib', 'main']);
    expect(hi.sections.map(s => s.sail)).toEqual(['main']);
    expect(sectionAt('jib', 7)).toBeNull(); expect(sectionAt('main', 1)).toBeNull();
  });
  it('the main\'s chord narrows up the sail, as its ORC girths', () => {
    expect(sectionAt('main', 1.7)!.chord).toBeCloseTo(3.38, 1);
    expect(sectionAt('main', 1.65 + 8.75 / 2)!.chord).toBeCloseTo(2.22, 2);
  });
  it('running, the sails work stalled: the panel knows', () => {
    expect(flowState(sailing(318, 12)).running).toBe(false);
    expect(flowState(sailing(170, 12)).running).toBe(true);
  });
  it('"bear away N°" is the heading change that widens the sails\' wind by the N° the trim is out', () => {
    const b = sailing(318, 12), want = 6, turn = turnFor(b, want), away = b.tack === 'S' ? -1 : 1;
    expect(turn).toBeGreaterThan(want); // (her own speed holds the apparent wind forward: the heading has to turn further)
    expect(windAt(b, CE_ABOVE_WL, away * turn).awa - windAt(b, CE_ABOVE_WL).awa).toBeCloseTo(want, 0);
  });
  it('a jib eased right out luffs, its windward telltales lifting; a main sheeted hard on a reach stalls', () => {
    const eased = flowState(sailing(318, 12, b => { takeLine(b, 'jibsheet'); (b.ctlTarget ??= {}).jibsheet = 0.75; }));
    const jib = eased.cuts[1].sections.find(s => s.sail === 'jib')!;
    expect(jib.trim.flow).toBe('luffing'); expect(jib.tells.windward).toBe('lift');
    const hard = flowState(sailing(250, 12, b => { takeLine(b, 'mainsheet'); (b.ctlTarget ??= {}).mainsheet = 0; }));
    const main = hard.cuts[1].sections.find(s => s.sail === 'main')!;
    expect(main.trim.flow).toBe('stalled'); expect(main.tells.leech).toBe(main.trim.amount > 0.12 ? 'curl' : 'stream');
  });
});

/** The panel's words for her now, as one string. */
const words = (b: Boat) => flowWords(flowState(b), b).map(w => w[1]).join(' ');

describe('the flow view: what it says', () => {
  it('a broad reach the telltales still stream on (about 108° apparent) is not called "working stalled"', () => {
    const b = sailing(225, 12), st = flowState(b);
    expect(b.awa).toBeLessThan(115); expect(st.running).toBe(false);
    expect(words(b)).not.toMatch(/works stalled/);
  });
  it('the crew easing the boom down the traveller in a blow: luffing on purpose; you over-easing the sheet: trim in', () => {
    const blow = sailing(318, 25), m = flowState(blow).sails.find(s => s.sail === 'main')!;
    if (m.trim.flow === 'luffing') { expect(crewEaseBoom(blow)).toBeGreaterThan(1); expect(words(blow)).toMatch(/on purpose/); }
    const over = sailing(318, 24, b => { takeLine(b, 'mainsheet'); (b.ctlTarget ??= {}).mainsheet = 0.5; });
    expect(flowState(over).sails.find(s => s.sail === 'main')!.trim.flow).toBe('luffing');
    expect(words(over)).not.toMatch(/on purpose/); expect(words(over)).toMatch(/Main<\/b>[^]*Trim in/);
  });
  it('you trimming the main yourself in a blow: no "on purpose"', () => {
    const b = sailing(318, 24, b => { b.manualTrim = true; b.trimAll = true; takeLine(b, 'mainsheet'); (b.ctlTarget ??= {}).mainsheet = Math.min(1, b.ctl.mainsheet + 0.05); });
    expect(words(b)).not.toMatch(/on purpose/);
  });
  it('before the start, eased to hold her back: says so, with how far to trim to go', () => {
    const b = sailing(318, 12, b => { takeLine(b, 'jibsheet'); (b.ctlTarget ??= {}).jibsheet = 0.75; });
    const w = flowWords(flowState(b), b, { preStart: true }).map(x => x[1]).join(' ');
    expect(w).toMatch(/hold her back/); expect(w).toMatch(/to go/);
  });
  it('luffing on purpose: says so', () => {
    const b = sailing(318, 12); b.luff = true;
    expect(words(b)).toMatch(/both sails let go/);
  });
  it('a jib eased right out: trim in, with no bear away into a reach', () => {
    const b = sailing(318, 12, b => { takeLine(b, 'jibsheet'); (b.ctlTarget ??= {}).jibsheet = 0.75; });
    const w = words(b), jib = w.slice(w.indexOf('<b>Jib</b>'), w.indexOf('<b>Main</b>') > w.indexOf('<b>Jib</b>') ? w.indexOf('<b>Main</b>') : undefined);
    expect(jib).toMatch(/Trim in/); expect(jib).not.toMatch(/bear away/);
  });
  it('a jib stalled with its sheet all the way out: head up, not ease', () => {
    const b = sailing(230, 12), j = flowState(b).sails.find(s => s.sail === 'jib');
    if (j && j.atMax && j.trim.flow === 'stalled') { const w = words(b); expect(w).toMatch(/all the way out/); expect(w).not.toMatch(/Jib<\/b>[^<]*Ease about/); }
  });
  it('the main has no luff telltales (the boat has leech ones), the jib has its luff pair', () => {
    const st = flowState(sailing(318, 12)), main = st.cuts[1].sections.find(s => s.sail === 'main')!, jib = st.cuts[1].sections.find(s => s.sail === 'jib')!;
    expect(main.tells.windward).toBeUndefined(); expect(main.tells.leech).toBeDefined();
    expect(jib.tells.windward).toBeDefined(); expect(jib.tells.leech).toBeUndefined();
  });
});

describe('the flow view: the illustrative flow', () => {
  const b = sailing(318, 12), cut = flowState(b).cuts[0];
  it('the air follows the sails (flow tangent to each panel at its three-quarter point)', () => {
    const vel = flowField(cut.sections, cut.awa);
    for (const s of cut.sections) {
      const p = camberLine(s);
      for (let i = 2; i + 1 < p.length - 2; i++) {
        const cx = p[i][0] + 0.75 * (p[i + 1][0] - p[i][0]), cy = p[i][1] + 0.75 * (p[i + 1][1] - p[i][1]);
        const dx = p[i + 1][0] - p[i][0], dy = p[i + 1][1] - p[i][1], L = Math.hypot(dx, dy), [u, v] = vel(cx, cy);
        expect(Math.abs((u * -dy + v * dx) / L)).toBeLessThan(1e-6);
      }
    }
  });
  it('faster air to leeward of the main than to windward of it (the lift)', () => {
    const vel = flowField(cut.sections, cut.awa), main = cut.sections.find(s => s.sail === 'main')!, p = camberLine(main), m = p[4];
    const lee = Math.hypot(...vel(m[0] + 0.12, m[1])), wind = Math.hypot(...vel(m[0] - 0.12, m[1]));
    expect(lee).toBeGreaterThan(1.05); expect(wind).toBeLessThan(1);
  });
  it('cheap: three cuts, their gridded fields and 30 streamlines each in under 25 ms (redrawn twice a second, only while the panel is open)', () => {
    const run = () => { for (const c of flowState(b).cuts) { const box: [number, number, number, number] = [-3, -5, 4, 5], vel = gridField(flowField(c.sections, c.awa), box); for (let i = 0; i < 30; i++) streamline(vel, -2 + i * 0.15, -4.9, 0.05, 220, box); } };
    run(); // (warm)
    const t0 = performance.now(); for (let k = 0; k < 5; k++) run();
    expect((performance.now() - t0) / 5).toBeLessThan(25);
  });
  it('the grid reads the field back closely away from the sails', () => {
    const box: [number, number, number, number] = [-3, -5, 4, 5], f = flowField(cut.sections, cut.awa), g = gridField(f, box);
    for (const [x, y] of [[-2.5, -4], [3, 4], [-2, 3], [3.5, -4.5]]) { const a = f(x, y), c = g(x, y); expect(Math.hypot(a[0] - c[0], a[1] - c[1])).toBeLessThan(0.02); }
  });
});
