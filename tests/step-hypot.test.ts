// The step's code uses core/math.ts hypot, not Math.hypot: V8's builtin allocates a scratch array and a boxed result
// every call, and the step called it about 2,200 times a step (docs/CAPACITY.md §8b). hypot gives the same result to the
// last bit; this checks that too, on random pairs and the edge cases.
import { describe, expect, it } from 'vitest';
import { hypot } from '../src/core/math';

// (the step's directories, read through vite: the project's types have no node, tsconfig)
const STEP_SRC = import.meta.glob('../src/{boat,environment,sim,ai,rules,geo,core,courses}/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('the step\'s hypot', () => {
  it('no Math.hypot in the step\'s code', () => {
    const found = Object.entries(STEP_SRC).filter(([, src]) => /Math\.hypot\(/.test(src)).map(([f]) => f);
    expect(Object.keys(STEP_SRC).length).toBeGreaterThan(50); // (the glob found the step's code)
    expect(found).toEqual([]);
  });
  it('the same as Math.hypot, to the last bit', () => {
    const edge = [0, -0, 1, -1, 5e-324, -5e-324, 1e-310, 1e308, 1.7976931348623157e308, -1.7976931348623157e308, Infinity, -Infinity, NaN, 3, 4, 0.1, 1e-10, 1e10];
    for (const x of edge) for (const y of edge) expect(Object.is(hypot(x, y), Math.hypot(x, y))).toBe(true);
    let s = 12345; const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    let bad = 0;
    for (let i = 0; i < 200000; i++) { const x = (r() - 0.5) * 10 ** Math.floor(r() * 30 - 15), y = i & 1 ? (r() - 0.5) * 10 ** Math.floor(r() * 30 - 15) : x * (1 + (r() - 0.5) * 1e-9); if (!Object.is(hypot(x, y), Math.hypot(x, y))) bad++; }
    expect(bad).toBe(0);
  });
});
