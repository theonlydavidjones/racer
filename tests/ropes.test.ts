import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT, DEFAULT_ROPES, ROPES, fixSpec, type Rope } from '../src/boat/spec';
import { ROPE_LAYERS, ROPE_TILE, ropeLook, ropeTile, tileMean } from '../src/render/ropeLook';

// The lines in real rope colorways, drawn as rope on the 3D boat (ROADMAP 8i). What's drawn on the boat itself is checked
// in the page, from both sides on both tacks: scripts/check/rope-views.cjs.
const { around: W, along: H } = ROPE_TILE;
const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
/** The share of a tile's texels in a color's hue (any shade of it). */
function share(t: Uint8Array, hex: string): number {
  const [r, g, b] = rgb(hex), m = Math.max(r, g, b); let n = 0;
  for (let o = 0; o < t.length; o += 4) {
    const k = Math.max(t[o], t[o + 1], t[o + 2]) / m; // (the strand's shading only darkens: the same color, scaled)
    if (k > 0.6 && k < 1.02 && Math.abs(t[o] - r * k) < 6 && Math.abs(t[o + 1] - g * k) < 6 && Math.abs(t[o + 2] - b * k) < 6) n++;
  }
  return n / (W * H);
}
const rope = (id: string) => ROPES.find(r => r.id === id)!;

describe('Rope colorways on the 3D boat (render/ropeLook.ts)', () => {
  it('each colorway is its own layer, and a line wears the one chosen for it', () => {
    expect(ROPE_LAYERS).toBe(ROPES.length + 1);
    const b = fixSpec({ ...structuredClone(DEFAULT_BOAT), lineRopes: { jibsheet: 'red-tracers', mainsheet: 'green-fleck' } });
    const j = ropeLook(b, 'jibsheet'), m = ropeLook(b, 'mainsheet');
    expect(j.layer).toBe(1 + ROPES.findIndex(r => r.id === 'red-tracers'));
    expect(m.layer).toBe(1 + ROPES.findIndex(r => r.id === 'green-fleck'));
    expect([j.tint, m.tint]).toEqual(['#ffffff', '#ffffff']); // (the layer carries the colors: not tinted again)
    expect(j.rope?.id).toBe('red-tracers');
  });
  it('a line with none chosen wears its usual colorway; plain braid is left for the lines no one colors', () => {
    const v = ropeLook(DEFAULT_BOAT, 'vang');
    expect(v.rope.id).toBe(DEFAULT_ROPES.vang); expect(v.layer).toBe(1 + ROPES.findIndex(r => r.id === DEFAULT_ROPES.vang)); expect(v.tint).toBe('#ffffff');
    expect(share(ropeTile(), '#ffffff')).toBe(1); // (plain braid: white, shaded, for its own color's tint)
  });
  it('a solid colorway is its own color all over', () => {
    for (const r of ROPES.filter(x => x.kind === 'solid')) expect(share(ropeTile(r), r.base), r.id).toBe(1);
  });
  it('a fleck shows as small marks of its color, scattered: a few percent of the rope', () => {
    for (const r of ROPES.filter(x => x.kind === 'fleck')) {
      const t = ropeTile(r), s = share(t, r.mark!);
      expect(s, r.id).toBeGreaterThan(0.01); expect(s, r.id).toBeLessThan(0.08);
      expect(share(t, r.base) + s, r.id).toBeCloseTo(1, 5);
    }
  });
  it('a tracer is a whole carrier of its color: a dashed spiral, hidden where it passes under', () => {
    for (const r of ROPES.filter(x => x.kind === 'tracer')) {
      const t = ropeTile(r), s = share(t, r.mark!), n = r.id === 'red-tracers' ? 2 : 1;
      // one of the eight carriers that run its way around the rope, on top half the time: about 1/16 of the surface each
      expect(s, r.id).toBeGreaterThan(n * 0.8 / 16); expect(s, r.id).toBeLessThan(n * 1.2 / 16);
      // it spirals: every row of the tile (a ring around the rope) meets it at least once in a lay's length, and a line
      // down the rope meets it in dashes, not one stripe
      let rows = 0; for (let j = 0; j < H; j += H / 8) { let hit = false; for (let jj = j; jj < j + H / 4 && !hit; jj++) for (let i = 0; i < W; i++) { const o = (jj * W + i) * 4; if (share(t.subarray(o, o + 4), r.mark!) > 0) { hit = true; break; } } if (hit) rows++; }
      expect(rows, r.id).toBe(8);
      let runs = 0, was = false; for (let j = 0; j < H; j++) { const o = (j * W) * 4, on = share(t.subarray(o, o + 4), r.mark!) > 0; if (on && !was) runs++; was = on; }
      expect(runs, r.id).toBeGreaterThanOrEqual(2);
    }
  });
  it('the braid runs on unbroken from one tile to the next, around the rope and along it', () => {
    // (the edges must meet as the texels inside do: the change across the seam no bigger than the biggest inside)
    for (const r of [undefined, rope('red-tracers'), rope('gold-fleck')] as (Rope | undefined)[]) {
      const t = ropeTile(r), at = (i: number, j: number) => { const o = (((j + H) % H) * W + ((i + W) % W)) * 4; return t[o] + t[o + 1] + t[o + 2]; };
      let inside = 0, seam = 0;
      for (let j = 0; j < H; j++) for (let i = 0; i < W - 1; i++) inside = Math.max(inside, Math.abs(at(i, j) - at(i + 1, j)));
      for (let j = 0; j < H; j++) seam = Math.max(seam, Math.abs(at(W - 1, j) - at(0, j)));
      for (let i = 0; i < W; i++) seam = Math.max(seam, Math.abs(at(i, H - 1) - at(i, 0)));
      let insideAlong = 0; for (let j = 0; j < H - 1; j++) for (let i = 0; i < W; i++) insideAlong = Math.max(insideAlong, Math.abs(at(i, j) - at(i, j + 1)));
      expect(seam, r?.id ?? 'plain').toBeLessThanOrEqual(Math.max(inside, insideAlong));
    }
  });
  it('from afar a rope reads as its blend: a fleck or tracer white rope stays nearly white', () => {
    for (const r of ROPES) {
      const far = rgb(ropeLook({ lineRopes: { jibsheet: r.id } }, 'jibsheet').far), base = rgb(r.base);
      expect(far.every((c, i) => Math.abs(c - base[i] * 0.93) < (r.kind === 'solid' ? 8 : 30)), r.id).toBe(true);
    }
    expect(tileMean(ropeTile(rope('white')))).not.toBe('#eef0ee'); // (shaded: a little darker than the yarn)
  });
  it('a saved colorway is kept, and an unknown one dropped', () => {
    const b = fixSpec({ ...structuredClone(DEFAULT_BOAT), lineRopes: { jibsheet: 'navy-beige', vang: 'tartan', spinnaker: 'red' } as never });
    expect(b.lineRopes).toEqual({ jibsheet: 'navy-beige' });
    expect(JSON.parse(JSON.stringify(b)).lineRopes).toEqual({ jibsheet: 'navy-beige' });
  });
});
