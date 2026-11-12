import { describe, expect, it } from 'vitest';
import { testBoat, sail, courseHeading } from './helpers/testBoat';
import { takeLine } from '../src/boat/physics';
import { CE_ABOVE_WL } from '../src/boat/balance';
import { SAILS } from '../src/boat/trim';
import type { Boat } from '../src/boat/boat';
import { flowCuts, flowField, gridField, camberLine, streamline, windAt, sectionAt } from '../src/ui/sailFlow';

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
    it(`${name}: at the centre of effort, the wind and the trim are the sim's exactly`, () => {
      const b = sailing(heading, kt);
      expect(windAt(b, CE_ABOVE_WL).awa).toBeCloseTo(simAwa(b), 2);
      const mid = flowCuts(b)[1];
      expect(mid.z).toBe(CE_ABOVE_WL);
      const main = mid.sections.find(s => s.sail === 'main')!;
      expect(main.sims).toBe(true); expect(main.trim).toBe(b.trim.main); expect(main.angle).toBeCloseTo(b.sheets.main, 6);
      const jib = mid.sections.find(s => s.sail === 'jib');
      if (b.trim.jib) { expect(jib!.trim).toBe(b.trim.jib); expect(jib!.angle).toBeCloseTo(b.sheets.jib, 6); }
    });
  }
  it('up the mast there is more wind, from further aft (the gradient: why sails are twisted)', () => {
    const b = sailing(318, 12), lo = windAt(b, 2.4), hi = windAt(b, 8.2);
    expect(hi.kt).toBeGreaterThan(lo.kt + 1); expect(hi.awa).toBeGreaterThan(lo.awa + 1);
  });
  it('high up, only the main: the jib\'s head is below 6.5 m', () => {
    const b = sailing(318, 12), [lo, , hi] = flowCuts(b);
    expect(lo.sections.map(s => s.sail)).toEqual(['jib', 'main']);
    expect(hi.sections.map(s => s.sail)).toEqual(['main']);
    expect(sectionAt('jib', 7)).toBeNull(); expect(sectionAt('main', 1)).toBeNull();
  });
  it('the main\'s chord narrows up the sail, as its ORC girths', () => {
    expect(sectionAt('main', 1.7)!.chord).toBeCloseTo(3.38, 1);
    expect(sectionAt('main', 1.65 + 8.75 / 2)!.chord).toBeCloseTo(2.22, 2);
  });
  it('a jib eased right out luffs, and its windward telltales lift; a main sheeted hard on a reach stalls', () => {
    const eased = sailing(318, 12, b => { takeLine(b, 'jibsheet'); (b.ctlTarget ??= {}).jibsheet = 0.75; });
    const jib = flowCuts(eased)[1].sections.find(s => s.sail === 'jib')!;
    expect(jib.trim.flow).toBe('luffing'); expect(jib.tells.windward).toBe('lift');
    const hard = sailing(250, 12, b => { takeLine(b, 'mainsheet'); (b.ctlTarget ??= {}).mainsheet = 0; });
    const main = flowCuts(hard)[1].sections.find(s => s.sail === 'main')!;
    expect(main.trim.flow).toBe('stalled'); expect(main.tells.leeward).toBe('droop');
  });
});

describe('the flow view: the illustrative flow', () => {
  const b = sailing(318, 12), cut = flowCuts(b)[0];
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
    const run = () => { for (const c of flowCuts(b)) { const box: [number, number, number, number] = [-3, -5, 4, 5], vel = gridField(flowField(c.sections, c.awa), box); for (let i = 0; i < 30; i++) streamline(vel, -2 + i * 0.15, -4.9, 0.05, 220, box); } };
    run(); // (warm)
    const t0 = performance.now(); for (let k = 0; k < 5; k++) run();
    expect((performance.now() - t0) / 5).toBeLessThan(25);
  });
  it('the grid reads the field back closely away from the sails', () => {
    const box: [number, number, number, number] = [-3, -5, 4, 5], f = flowField(cut.sections, cut.awa), g = gridField(f, box);
    for (const [x, y] of [[-2.5, -4], [3, 4], [-2, 3], [3.5, -4.5]]) { const a = f(x, y), c = g(x, y); expect(Math.hypot(a[0] - c[0], a[1] - c[1])).toBeLessThan(0.02); }
  });
});
