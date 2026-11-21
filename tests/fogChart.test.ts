import { describe, it, expect } from 'vitest';
// @ts-ignore node:fs for the source text
import { readFileSync } from 'node:fs';
import { drawSetFog, setFogAlpha } from '../src/ui/mapLayers';
import type { Ink } from '../src/ui/encChart';

/** A canvas that only counts what's filled over the whole of it. */
function stub() {
  const fills: { style: unknown; args: number[] }[] = [];
  const ctx = { fillStyle: '' as unknown, save() {}, restore() {}, fillRect(...args: number[]) { fills.push({ style: this.fillStyle, args }); } };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills };
}
const ink = { fog: (a: number) => `fog(${a})` } as unknown as Ink;

describe('the chart\'s Fog layer shows the fog and rain set in the conditions (owner chart, 20 Nov)', () => {
  it('the scene thickens with set fog; so does the chart: a veil over the whole of it', () => {
    const { ctx, fills } = stub();
    drawSetFog(ctx, 800, 600, ink, { fog: 2, rain: 0 });
    expect(fills.length).toBe(1);
    expect(fills[0].args).toEqual([0, 0, 800, 600]);
    expect(setFogAlpha({ fog: 2, rain: 0 })).toBeGreaterThan(setFogAlpha({ fog: 1, rain: 0 }));
    expect(setFogAlpha({ fog: 1, rain: 0 })).toBeGreaterThan(0.1);
  });
  it('rain closes the view in too (the scene reads it the same way)', () => {
    expect(setFogAlpha({ fog: 'real', rain: 2 })).toBeGreaterThan(setFogAlpha({ fog: 'real', rain: 1 }));
    expect(setFogAlpha({ fog: 'real', rain: 1 })).toBeGreaterThan(0);
  });
  it('nothing is set: no veil, and nothing invented (the record\'s own fog is drawn by drawFog)', () => {
    const { ctx, fills } = stub();
    drawSetFog(ctx, 800, 600, ink, { fog: 'real', rain: 0 });
    expect(fills.length).toBe(0);
    expect(setFogAlpha({ fog: 0, rain: 0 })).toBe(0);
  });
  it('hud draws it with the Fog layer on, and the caption is one short line with the source behind a hover', () => {
    const h = readFileSync('src/ui/hud.ts', 'utf8') as string;
    expect(h).toContain('drawSetFog(');
    expect(h).toContain('fogCaption');
    expect(h).not.toMatch(/const fogLine = this\.fogNote\(wd, false\)/);
    expect(readFileSync('src/ui/chart.ts', 'utf8')).toContain('fogCaption');
  });
});
