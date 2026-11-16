import { describe, expect, it } from 'vitest';
import { n360, wrap } from '../src/core/math';

// core/math.ts wrap and n360 skip the double `%` for |t| < 360: they must match the plain formulas to the last bit
const wrapRef = (a: number): number => ((a + 180) % 360 + 360) % 360 - 180;
const n360Ref = (a: number): number => ((a % 360) + 360) % 360;
const step = (x: number, up: boolean): number => {
  if (x !== x || !Number.isFinite(x)) return x;
  if (x === 0) return up ? 5e-324 : -5e-324;
  const b = new Float64Array([x]), i = new BigInt64Array(b.buffer);
  i[0] += (x > 0) === up ? 1n : -1n; return b[0];
};

describe('wrap and n360 match the % formulas exactly', () => {
  const ins: number[] = [0, -0, 5e-324, -5e-324, 1e-300, -1e-300, 1e20, -1e20, Infinity, -Infinity, NaN];
  for (const c of [-720, -540, -360, -180, 0, 180, 360, 540, 720]) { let u = c, d = c; for (let k = 0; k < 64; k++) { ins.push(u, d); u = step(u, true); d = step(d, false); } }
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let k = 0; k < 200000; k++) { const r = rnd(); ins.push(k % 3 === 0 ? (r - 0.5) * 3000 : k % 3 === 1 ? (r - 0.5) * 720 : (r - 0.5) * 1e-9 + 180 * ((k % 9) - 4)); }
  it('on edges and random angles', () => {
    let bad = 0;
    for (const x of ins) { if (!Object.is(wrap(x), wrapRef(x))) bad++; if (!Object.is(n360(x), n360Ref(x))) bad++; }
    expect(bad).toBe(0);
  });
});
