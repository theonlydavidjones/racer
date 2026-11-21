import { describe, expect, it } from 'vitest';
import { driveCurveFor, driveTableEntry } from '../src/boat/driveCurve';

/**
 * The drive curve's rows filled in whole when it's made, and read straight inside it (so the compiler inlines it: the
 * AI's predictions call it thousands of times a step), gives the same numbers to the last bit as reading between the
 * table's rows as beat-chop first did: each row with a share read as it's needed, its share added in turn, the rows
 * with none skipped (the Coordinator, 19 Nov 2026). The reference below is that reading, written out.
 */
function reference(tws: number, twa: number, vt: number, v: number): number {
  if (vt <= 0.05) return 1;
  const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
  const w = clamp(tws, 2, 40), w0 = Math.min(39, Math.floor(w)), fw = w - w0, a = clamp(twa, 30, 180) / 5, a0 = Math.min(35, Math.floor(a)), fa = a - a0, s = 20 / vt;
  const k00 = (1 - fw) * (1 - fa), k01 = (1 - fw) * fa, k10 = fw * (1 - fa), k11 = fw * fa;
  const x = clamp(v * s, 0, 29.999), q = Math.floor(x), f = x - q;
  let lo = 0, hi = 0;
  const row = (k: number, ww: number, aa: number) => { if (k > 0) { lo += k * driveTableEntry(ww, aa, q); hi += k * driveTableEntry(ww, aa, q + 1); } };
  row(k00, w0, a0); row(k01, w0, a0 + 1); row(k10, w0 + 1, a0); row(k11, w0 + 1, a0 + 1);
  return lo * (1 - f) + hi * f;
}

describe('the drive curve, its rows filled in whole: the same numbers as read row by row', () => {
  it('to the last bit, over the winds, angles and speeds a race meets, on and between the table\'s rows and at its ends', () => {
    let n = 0, worst = '';
    const winds = [0, 1.5, 2, 2.37, 5, 7.999, 8, 12.25, 14.6, 18.03, 22, 25.5, 39.4, 40, 44];
    const angles = [0, 29, 30, 31.7, 35, 38.2, 42.5, 45, 52.9, 90, 117.3, 150, 165.5, 175, 179.9, 180, 185];
    for (const tws of winds) for (const twa of angles) for (const vt of [0.04, 0.6, 1.9, 2.71, 3.4]) {
      const c = driveCurveFor(tws, twa, vt);
      for (let v = -0.3; v < 2.2 * vt + 0.3; v += vt / 37) {
        const got = c(v), want = reference(tws, twa, vt, v); n++;
        if (!Object.is(got, want) && !worst) worst = `tws ${tws} twa ${twa} vt ${vt} v ${v}: ${got} against ${want}`;
      }
    }
    expect(worst, `${n} looks`).toBe('');
    expect(n).toBeGreaterThan(50_000);
  });
});
