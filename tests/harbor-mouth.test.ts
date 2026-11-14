import { describe, expect, it } from 'vitest';
import { MOUTH, MOUTHS, withHarborMouths } from '../src/environment/harborMouth';
import { PILE_FLOW } from '../src/environment/current';
import { HARBORS, hitsWall } from '../src/geo/marina';
import { onLand } from '../src/geo/shore';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import type { Vec } from '../src/core/math';

/**
 * The water in Gashouse Cove's entrance (environment/harborMouth.ts; ROADMAP 8n: the owner, "there are also frequent
 * eddies in the entry"). The stream is put across the mouth by hand here, so each part is seen alone.
 */
const M = MOUTHS[0];
const at = (s: number, n: number): Vec => ({ x: M.a.x + M.along.x * s + M.into.x * n, y: M.a.y + M.along.y * s + M.into.y * n });
/** A stream of U m/s across the mouth, from corner a toward b (negative: the other way), the same everywhere. */
const stream = (U: number): Vec => ({ x: M.along.x * U, y: M.along.y * U });
const flow = (p: Vec, U: number, t = 0, k = 1) => withHarborMouths(p, stream(U), k, [stream(U)], t);
const alongOf = (v: Vec) => v.x * M.along.x + v.y * M.along.y, intoOf = (v: Vec) => v.x * M.into.x + v.y * M.into.y;
/** The mean over one passing of the layer's eddies. */
const mean = (p: Vec, U: number, k = 1) => { let x = 0, y = 0; const N = 240, T = period(U); for (let i = 0; i < N; i++) { const v = flow(p, U, i * T / N, k); x += v.x / N; y += v.y / N; } return { x, y }; };
/** Which corner the stream reaches first, and what it is once it's through any piles there. */
const piles = (U: number) => (U > 0 ? M.pileA : M.pileB) > 0, width = (U: number) => U > 0 ? M.widthA : M.widthB;
const Ur = (U: number) => Math.abs(U) * (piles(U) ? PILE_FLOW : 1);
const period = (U: number) => MOUTH.spacing * (MOUTH.B0 + MOUTH.spread * (M.W / 2 + width(U))) / (0.5 * (1 + MOUTH.gyre) * Ur(U));
/** The flood here runs from the breakwater's tip toward Pier 1; the ebb comes through the pier's piles. */
const FLOOD = M.pileA > 0 ? -0.5 : 0.5, EBB = -FLOOD;

describe('Gashouse Cove\'s entrance', () => {
  it('is the gap between the breakwater\'s tip and Fort Mason\'s Pier 1, about 37 m wide, facing north', () => {
    const h = HARBORS.find(h => h.id === 'gashouse-cove')!;
    expect(M.harbor).toBe(h);
    expect(M.W).toBeGreaterThan(33); expect(M.W).toBeLessThan(41); // (36 m to the pier's face, 43 m to the shed's corner: OSM)
    expect(M.into.y).toBeLessThan(-0.95); // (into the basin is south)
    expect((M.pileA > 0) !== (M.pileB > 0)).toBe(true); // (one corner is the pile pier, the other the breakwater)
    expect(Math.max(M.pileA, M.pileB)).toBeGreaterThan(45); expect(Math.max(M.pileA, M.pileB)).toBeLessThan(65); // (Pier 1's head, about 60 m out)
  });
  it('holds its gyre in clear water inside the mouth, touching it', () => {
    expect(intoOf({ x: M.c.x - M.a.x, y: M.c.y - M.a.y })).toBeGreaterThan(0);
    expect(M.R).toBeGreaterThan(M.W / 2); expect(M.R).toBeLessThan(45);
    for (let a = 0; a < 360; a += 15) { const p = { x: M.c.x + 0.95 * M.R * Math.cos(a * Math.PI / 180), y: M.c.y + 0.95 * M.R * Math.sin(a * Math.PI / 180) }; expect(onLand(p) || hitsWall(p)).toBe(false); }
  });
});

describe('the water in the entrance', () => {
  it('is left alone away from the mouth, and at slack', () => {
    const c = { x: 0.3, y: 0.1 };
    for (const p of [{ x: M.box.x0 - 1, y: M.c.y }, { x: M.c.x, y: M.box.y1 + 1 }, { x: 0, y: 0 }]) for (const k of [1, 0.4]) expect(withHarborMouths(p, c, k, [stream(0.5)], 7)).toEqual({ x: c.x * k, y: c.y * k });
    // (well out in the stream off the mouth, on the flood: past the layer, nothing changes)
    const out = at(M.W / 2, -40), v = flow(out, FLOOD); expect(v.x).toBeCloseTo(stream(FLOOD).x, 6); expect(v.y).toBeCloseTo(stream(FLOOD).y, 6);
    // (no stream, no gyre)
    expect(withHarborMouths(M.c, { x: 0, y: 0 }, 0.1, [{ x: 0, y: 0 }], 0)).toEqual({ x: 0, y: 0 });
    const still = withHarborMouths({ x: M.c.x, y: M.c.y + M.R / 2 }, stream(0.01), 0.1, [stream(0.01)], 0); expect(Math.hypot(still.x, still.y)).toBeLessThan(0.002);
  });
  it('turns in a gyre: its near side with the stream, its far side against it, at a quarter of the stream', () => {
    for (const U of [FLOOD, EBB]) {
      const dn = Math.sign(U), r = MOUTH.peak * M.R;
      const near = flow({ x: M.c.x - M.into.x * r, y: M.c.y - M.into.y * r }, U, 0, 0), far = flow({ x: M.c.x + M.into.x * r, y: M.c.y + M.into.y * r }, U, 0, 0);
      const up = flow({ x: M.c.x - M.along.x * dn * r, y: M.c.y - M.along.y * dn * r }, U, 0, 0), down = flow({ x: M.c.x + M.along.x * dn * r, y: M.c.y + M.along.y * dn * r }, U, 0, 0);
      // (Booij 1986: the edge at about 0.25 of the stream; here of the stream as it crosses the mouth, piles and all)
      expect(alongOf(far) * dn).toBeCloseTo(-MOUTH.gyre * Ur(U), 3);
      expect(alongOf(near) * dn).toBeGreaterThan(0.2 * Ur(U)); // (the layer's edge reaches it: a little more than the gyre's own)
      // (on its downstream side the water goes in, on its upstream side it comes back out)
      expect(intoOf(down)).toBeCloseTo(MOUTH.gyre * Ur(U), 3); expect(intoOf(up)).toBeCloseTo(-MOUTH.gyre * Ur(U), 3);
      // (still at its center, and gone past its rim)
      const mid = flow(M.c, U, 0, 0); expect(Math.hypot(mid.x, mid.y)).toBeLessThan(1e-6);
      const past = flow({ x: M.c.x + M.into.x * 1.3 * M.R, y: M.c.y + M.into.y * 1.3 * M.R }, U, 0, 0.1); expect(alongOf(past) * dn).toBeCloseTo(0.1 * Ur(U), 6); // (the harbor's own slow water, of the stream that crosses the mouth)
    }
    // (the flood's gyre turns clockwise seen from above, the ebb's the other way: the stream's side leads)
    const east = { x: M.c.x + 0.5 * M.R, y: M.c.y };
    expect(flow(east, FLOOD, 0, 0).y).toBeLessThan(0); expect(flow(east, EBB, 0, 0).y).toBeGreaterThan(0);
  });
  it('shears from the stream to the basin\'s water across the mouth, in a layer as wide as those measured in harbors\' mouths', () => {
    for (const U of [FLOOD, EBB]) {
      const dn = Math.sign(U), s = (x: number) => dn > 0 ? x : M.W - x; // (x m down the gap from the upstream corner)
      for (const x of [0.25 * M.W, 0.5 * M.W, 0.9 * M.W]) {
        const B = MOUTH.B0 + MOUTH.spread * (x + width(U));
        // (outside it the stream as it comes, less the piles' lee; inside it the basin's water, far slower)
        const out = mean(at(s(x), -1.5 * B), U), inn = mean(at(s(x), 1.5 * B), U, 0.3); // (0.3: the harbor's calm just inside)
        expect(alongOf(out) * dn).toBeGreaterThan(0.93 * Ur(U));
        expect(alongOf(inn) * dn).toBeLessThan(0.5 * Ur(U));
      }
      // (its shape and width, where the gyre comes up to the mouth: how much of the stream is still in the water n m in
      // falls as ½·(1 − tanh(2n/B)), so B = ΔU/(dU/dn)max. Read from what a little more stream outside adds inside)
      const xa = (M.c.x - M.a.x) * M.along.x + (M.c.y - M.a.y) * M.along.y, x = dn > 0 ? xa : M.W - xa, B = MOUTH.B0 + MOUTH.spread * (x + width(U));
      expect(xa).toBeGreaterThan(0); expect(xa).toBeLessThan(M.W);
      for (const n of [0.35 * B, 0.6 * B, B].filter(n => n > 2.5)) {
        const share = (alongOf(flow(at(xa, n), U, 0, 1)) - alongOf(flow(at(xa, n), U, 0, 0))) * dn / Ur(U);
        expect(2 * n / Math.atanh(1 - 2 * share)).toBeCloseTo(B, 1);
      }
    }
    // (Bijvelds 1997: 0.17–0.23 m per m in a harbor's mouth: about 7–9 m at the far corner on the flood)
    expect(MOUTH.B0 + MOUTH.spread * M.W).toBeGreaterThan(0.17 * M.W); expect(MOUTH.B0 + MOUTH.spread * M.W).toBeLessThan(0.23 * M.W + 1.5);
  });
  it('carries a row of eddies down the layer: ±0.2 of the speed\'s change along the stream, ±0.1 across, one a minute or so', () => {
    for (const U of [FLOOD, EBB]) {
      const dn = Math.sign(U), p = at(M.W / 2, 0), dU = (1 - MOUTH.gyre) * Ur(U), T = period(U), N = 480;
      const m = mean(p, U); let su = 0, sv = 0, ups = 0, last = 0;
      for (let i = 0; i < 4 * N; i++) { const v = flow(p, U, i * T / N), a = (alongOf(v) - alongOf(m)) * dn, c = intoOf(v) - intoOf(m); su += a * a; sv += c * c; if (last <= 0 && a > 0 && i) ups++; last = a; }
      // (Uijttewaal & Tukker, in Bijvelds §2: u'² ≈ (0.2·ΔU)², v'² ≈ (0.1·ΔU)² at the layer's center)
      expect(Math.sqrt(su / (4 * N))).toBeCloseTo(MOUTH.u * dU, 3); expect(Math.sqrt(sv / (4 * N))).toBeCloseTo(MOUTH.v * dU, 3);
      expect(ups).toBe(4); // (one eddy each period: 4 in 4)
      // (three layer-widths apart at the mean of the two speeds: 40 s to 2 min in a half-knot to quarter-knot stream)
      expect(T).toBeGreaterThan(30); expect(T).toBeLessThan(150);
      // (gone a few layer-widths either side, and upstream of the corner)
      const B = MOUTH.B0 + MOUTH.spread * (M.W / 2 + width(U));
      for (const q of [at(M.W / 2, 3 * B), at(M.W / 2, -3 * B)]) { const a = flow(q, U, 0), b = flow(q, U, T / 4); expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.02 * dU); }
      const before = at(dn > 0 ? -5 : M.W + 5, -0.2); expect(flow(before, U, 0)).toEqual(flow(before, U, T / 3));
    }
  });
  it('on the ebb the stream has come through Pier 1\'s piles: a slowed lee out to the pier\'s head, no faster water in the mouth', () => {
    const head = Math.max(M.pileA, M.pileB), U = EBB, dn = Math.sign(U), s = (x: number) => dn > 0 ? x : M.W - x;
    // (off the mouth, inside the pier's head: what the piles pass)
    const lee = flow(at(s(M.W / 2), -0.4 * head), U); expect(alongOf(lee) * dn).toBeCloseTo(PILE_FLOW * Math.abs(U), 2);
    // (out past the head: the open stream)
    const open = flow(at(s(M.W / 2), -head - 15), U); expect(alongOf(open) * dn).toBeCloseTo(Math.abs(U), 2);
    // (the lee doesn't run on for ever: gone by two pier-heads downstream)
    const far = flow(at(s(2 * head + 5), -0.4 * head), U, 0, 1); expect(alongOf(far) * dn).toBeCloseTo(Math.abs(U), 6);
    // (the flood meets no piles before the mouth: the whole stream outside it)
    const flood = flow(at(M.W / 2, -0.4 * head), FLOOD); expect(Math.abs(alongOf(flood))).toBeCloseTo(Math.abs(FLOOD), 6);
    // (so the ebb's gyre is the weaker of the two for the same stream)
    const r = MOUTH.peak * M.R, deep = { x: M.c.x + M.into.x * r, y: M.c.y + M.into.y * r };
    expect(Math.abs(alongOf(flow(deep, EBB, 0, 0))) / Math.abs(alongOf(flow(deep, FLOOD, 0, 0)))).toBeCloseTo(PILE_FLOW, 3);
  });
});

describe('in the world', () => {
  const world = (current: string) => new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', current } as Settings, 1, { freeSail: true });
  it('a boat in the entrance on a flood is set back against the stream on the gyre\'s far side, and the chart draws the same water', () => {
    const w = world('flood'), f = w.currentAt(M.ref), dn = Math.sign(alongOf(f));
    expect(Math.abs(alongOf(f))).toBeGreaterThan(0.05);
    const r = MOUTH.peak * M.R, deep = { x: M.c.x + M.into.x * r, y: M.c.y + M.into.y * r };
    expect(alongOf(w.currentAt(deep)) * dn).toBeLessThan(0);
    expect(w.currentDrawn(deep)).toEqual(w.currentAt(deep));
    // (and nothing has changed out on the Bay)
    const bay = { x: M.c.x, y: M.c.y + 600 }; expect(Math.hypot(w.currentAt(bay).x, w.currentAt(bay).y)).toBeGreaterThan(Math.abs(alongOf(f)));
  });
});
