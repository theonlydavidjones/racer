import { describe, expect, it } from 'vitest';
import { MOUTHS, eddyPeriod, gyreTime, mouthState, refreshMouths, withHarborMouths, type MouthState } from '../src/environment/harborMouth';
import { HARBORS, hitsWall } from '../src/geo/marina';
import { LL } from '../src/geo/geo';
import { onLand, pilePierDist } from '../src/geo/shore';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { KT, type Vec } from '../src/core/math';

/**
 * The water in Gashouse Cove's entrance (environment/harborMouth.ts; ROADMAP 8n: the owner, "there are also frequent
 * eddies in the entry"). The stream is put across the mouth by hand here, so each part is seen alone, and the figures
 * are written out as the sources give them (not read back from the module's own constants).
 */
const M = MOUTHS[0];
const at = (s: number, n: number): Vec => ({ x: M.a.x + M.along.x * s + M.into.x * n, y: M.a.y + M.along.y * s + M.into.y * n });
/** A stream of U m/s across the mouth, from corner a toward b (negative: the other way), the same everywhere. */
const stream = (U: number): Vec => ({ x: M.along.x * U, y: M.along.y * U });
/** The mouth's water settled to a steady stream U. */
const settled = (U: number): MouthState => { const S = mouthState(); refreshMouths(S, 0, () => stream(U)); return S; };
const flow = (p: Vec, U: number, t = 0, k = 1) => withHarborMouths(p, stream(U), k, settled(U), t);
const alongOf = (v: Vec) => v.x * M.along.x + v.y * M.along.y, intoOf = (v: Vec) => v.x * M.into.x + v.y * M.into.y;
/** Corner a is Pier 1 (on piles), corner b the breakwater's tip: the flood runs b → a, the ebb a → b through the piles. */
const FLOOD = -0.5, EBB = 0.5, PILES = 0.6; // (m/s across the mouth; what the piles pass: current.ts PILE_FLOW)
/** The stream crossing the mouth once it's through any piles, and the width of piles it crossed (m). */
const Ur = (U: number) => Math.abs(U) * (U === EBB ? PILES : 1), piles = (U: number) => U === EBB ? M.widthA : 0;
/** The mean over one passing of the layer's eddies. */
const mean = (p: Vec, U: number, k = 1) => { let x = 0, y = 0; const N = 240, T = eddyPeriod(0, stream(U)); for (let i = 0; i < N; i++) { const v = flow(p, U, i * T / N, k); x += v.x / N; y += v.y / N; } return { x, y }; };
/** x m down the gap from the upstream corner, as a distance from corner a. */
const down = (U: number, x: number) => U > 0 ? x : M.W - x;

describe('Gashouse Cove\'s entrance', () => {
  it('is the gap between the breakwater\'s tip and Fort Mason\'s Pier 1, about 37 m wide, facing north', () => {
    expect(M.harbor).toBe(HARBORS.find(h => h.id === 'gashouse-cove'));
    expect(M.W).toBeGreaterThan(33); expect(M.W).toBeLessThan(41); // (36 m to the pier's face, 43 m to the shed's corner: OSM)
    expect(M.into.y).toBeLessThan(-0.95); // (into the basin is south)
    expect(M.a.x).toBeGreaterThan(M.b.x); // (a, the pier, is the east corner)
    expect(M.pileA).toBeGreaterThan(45); expect(M.pileA).toBeLessThan(65); expect(M.pileB).toBe(0); // (Pier 1's head, about 55–60 m out; the tip is solid)
    expect(M.widthA).toBeGreaterThan(15); expect(M.widthA).toBeLessThan(26); // (the shed is about 20 m wide)
    // (beyond the tip the breakwater's last leg runs out north-west, about 25° off the mouth's line; the pier's face runs straight out)
    expect(M.wallB).toBeGreaterThan(0.35); expect(M.wallB).toBeLessThan(0.6); expect(M.wallA).toBeGreaterThan(3);
  });
  it('holds its gyre in the clear water inside the mouth, touching it', () => {
    expect(intoOf({ x: M.c.x - M.a.x, y: M.c.y - M.a.y })).toBeGreaterThan(0);
    expect(M.R).toBeGreaterThan(30); expect(M.R).toBeLessThan(42);
    for (let a = 0; a < 360; a += 15) { const p = { x: M.c.x + 0.95 * M.R * Math.cos(a * Math.PI / 180), y: M.c.y + 0.95 * M.R * Math.sin(a * Math.PI / 180) }; expect(onLand(p) || hitsWall(p)).toBe(false); }
  });
});

describe('the water in the entrance', () => {
  it('is left alone away from the mouth, and in still water', () => {
    const c = { x: 0.3, y: 0.1 };
    for (const p of [{ x: M.box.x0 - 1, y: M.c.y }, { x: M.c.x, y: M.box.y1 + 1 }, { x: 0, y: 0 }]) for (const k of [1, 0.4]) expect(withHarborMouths(p, c, k, settled(0.5), 7)).toEqual({ x: c.x * k, y: c.y * k });
    // (well out in the stream off the mouth, on the flood: past the layer, nothing changes)
    const v = flow(at(M.W / 2, -40), FLOOD); expect(v.x).toBeCloseTo(stream(FLOOD).x, 6); expect(v.y).toBeCloseTo(stream(FLOOD).y, 6);
    // (no stream, no gyre, no eddies)
    for (const p of [M.c, at(M.W / 2, 0), { x: M.c.x, y: M.c.y + M.R / 2 }]) { const s = withHarborMouths(p, { x: 0, y: 0 }, 0.1, settled(0), 40); expect(Math.hypot(s.x, s.y)).toBe(0); }
    // (before the state is first read: the harbor's water as it was)
    expect(withHarborMouths(M.c, c, 0.2, mouthState(), 0)).toEqual({ x: c.x * 0.2, y: c.y * 0.2 });
  });
  it('turns in a gyre: its near side with the stream, its far side against it, at a quarter of the stream when it has settled', () => {
    for (const U of [FLOOD, EBB]) {
      const dn = Math.sign(U), r = 0.75 * M.R, edge = U === FLOOD ? 0.125 : 0.075; // (a quarter of 0.5 m/s; of 0.3 m/s through the piles)
      const far = flow({ x: M.c.x + M.into.x * r, y: M.c.y + M.into.y * r }, U, 0, 0), near = mean({ x: M.c.x - M.into.x * r, y: M.c.y - M.into.y * r }, U, 0); // (within the layer's reach: its eddies averaged out)
      const upS = flow({ x: M.c.x - M.along.x * dn * r, y: M.c.y - M.along.y * dn * r }, U, 0, 0), downS = flow({ x: M.c.x + M.along.x * dn * r, y: M.c.y + M.along.y * dn * r }, U, 0, 0);
      expect(alongOf(far) * dn).toBeCloseTo(-edge, 3);
      expect(alongOf(near) * dn).toBeGreaterThan(0.8 * edge); // (toward the mouth, with the stream)
      // (on its downstream side the water goes in, on its upstream side it comes back out)
      expect(intoOf(downS)).toBeCloseTo(edge, 3); expect(intoOf(upS)).toBeCloseTo(-edge, 3);
      // (still at its center; past its rim, the harbor's own slow water as it was)
      const mid = flow(M.c, U, 0, 0); expect(Math.hypot(mid.x, mid.y)).toBeLessThan(1e-6);
      const past = flow({ x: M.c.x + M.into.x * 1.3 * M.R, y: M.c.y + M.into.y * 1.3 * M.R }, U, 0, 0.1); expect(alongOf(past)).toBeCloseTo(0.1 * U, 6);
    }
    // (the flood's gyre turns clockwise seen from above, the ebb's the other way: the stream's side leads)
    const east = { x: M.c.x + 0.5 * M.R, y: M.c.y };
    expect(flow(east, FLOOD, 0, 0).y).toBeLessThan(0); expect(flow(east, EBB, 0, 0).y).toBeGreaterThan(0);
  });
  it('the gyre follows the tide late: hours, not minutes (Booij\'s response time), still turning the old way an hour after the stream has turned', () => {
    // (Te ≈ 50·β²·Le·B/(Ur·Bm) with β = 0.59, the gyre's 73 m pool behind a 37 m mouth: about 2¾ h at 0.25 m/s)
    expect(gyreTime(0, stream(-0.25))).toBeGreaterThan(2.4 * 3600); expect(gyreTime(0, stream(-0.25))).toBeLessThan(3.1 * 3600);
    expect(gyreTime(0, stream(-0.5)) / gyreTime(0, stream(-0.25))).toBeCloseTo(0.5, 6); // (quicker in a faster stream)
    const S = settled(-0.25), g0 = S.gyre[0];
    expect(g0).toBeCloseTo(-0.0625, 6); // (the flood's, a quarter of the stream, corner b toward a)
    for (let t = 30; t <= 3600; t += 30) refreshMouths(S, t, () => stream(0.25)); // (the stream turned to an ebb an hour ago)
    expect(Math.sign(S.gyre[0])).toBe(Math.sign(g0)); expect(Math.abs(S.gyre[0])).toBeLessThan(Math.abs(g0)); expect(Math.abs(S.gyre[0])).toBeGreaterThan(0.4 * Math.abs(g0));
    // (so on the mouth's side its water now runs against the new stream)
    const near = withHarborMouths({ x: M.c.x - M.into.x * 0.5 * M.R, y: M.c.y - M.into.y * 0.5 * M.R }, stream(0.25), 0, S, 3600); expect(alongOf(near)).toBeLessThan(0);
    // (given a day of the same ebb it comes round: a quarter of what the piles pass)
    for (let t = 3630; t <= 30 * 3600; t += 30) refreshMouths(S, t, () => stream(0.25));
    expect(S.gyre[0]).toBeCloseTo(0.25 * 0.25 * PILES, 3);
    // (in slack water it neither grows nor dies: nothing is there to turn it or, in a tide's time, to stop it)
    const held = S.gyre[0]; for (let t = 30 * 3600 + 30; t <= 31 * 3600; t += 30) refreshMouths(S, t, () => stream(0)); expect(S.gyre[0]).toBeCloseTo(held, 6);
  });
  it('shears from the stream to the basin\'s water across the mouth, in a layer as wide as Booij measured in a harbor\'s mouth (0.23 m per m)', () => {
    for (const U of [FLOOD, EBB]) {
      const dn = Math.sign(U);
      for (const x of [0.25 * M.W, 0.5 * M.W, 0.9 * M.W]) {
        const B = 1 + 0.23 * (x + piles(U));
        // (outside it the stream as it comes, less the piles' lee; inside it the basin's water, far slower)
        const out = mean(at(down(U, x), -1.5 * B), U), inn = mean(at(down(U, x), 1.5 * B), U, 0.3); // (0.3: the harbor's calm just inside)
        expect(alongOf(out) * dn).toBeGreaterThan(0.93 * Ur(U));
        expect(alongOf(inn) * dn).toBeLessThan(0.5 * Ur(U));
      }
      // (its shape and width, where the gyre comes up to the mouth: how much of the stream is still in the water n m in
      // falls as ½·(1 − tanh(2n/B)), B = ΔU/(dU/dn)max. Read from what a little more stream outside adds inside)
      const xa = (M.c.x - M.a.x) * M.along.x + (M.c.y - M.a.y) * M.along.y, x = dn > 0 ? xa : M.W - xa, B = 1 + 0.23 * (x + piles(U));
      expect(xa).toBeGreaterThan(0); expect(xa).toBeLessThan(M.W);
      for (const n of [0.35 * B, 0.6 * B, B].filter(n => n > 2.5)) {
        const share = (alongOf(flow(at(xa, n), U, 0, 1)) - alongOf(flow(at(xa, n), U, 0, 0))) * dn / Ur(U);
        expect(2 * n / Math.atanh(1 - 2 * share)).toBeCloseTo(B, 1);
      }
    }
  });
  it('lets no steady stream in or out through the gap of a closed basin, whatever the tide\'s set', () => {
    for (const U of [FLOOD, EBB]) for (const set of [-0.1, 0.1]) { // (the stream set 6° in toward the basin, or out)
      const c = { x: M.along.x * U + M.into.x * set * Math.abs(U), y: M.along.y * U + M.into.y * set * Math.abs(U) }, S = mouthState(); refreshMouths(S, 0, () => c);
      let q = 0; const T = eddyPeriod(0, c);
      for (let x = 0.25; x < M.W; x += 0.5) for (let i = 0; i < 24; i++) q += intoOf(withHarborMouths(at(x, 0), c, 1, S, i * T / 24)) * 0.5 / 24;
      expect(Math.abs(q)).toBeLessThan(0.01 * Math.abs(U) * M.W); // (unchecked, half the set over the whole gap: 5%)
    }
  });
  it('carries a row of eddies down the layer: across the stream ±0.1 of the speed\'s change on its center line, along it ±0.2 on its flanks and opposite there', () => {
    for (const U of [FLOOD, EBB]) {
      const dn = Math.sign(U), dU = 0.75 * Ur(U), T = eddyPeriod(0, stream(U)), N = 480, B = 1 + 0.23 * (M.W / 2 + piles(U)), x = down(U, M.W / 2);
      // (three layer-widths apart at half the stream: about a minute on this flood, over three on the ebb through the piles)
      expect(T).toBeCloseTo(3 * B / (0.5 * Ur(U)), 6);
      if (U === FLOOD) { expect(T).toBeGreaterThan(55); expect(T).toBeLessThan(70); } else { expect(T).toBeGreaterThan(180); expect(T).toBeLessThan(220); }
      const flank = Math.atanh(1 / Math.sqrt(3)) * B / 2; // (where a row's along-stream swing is greatest)
      const series = (n: number, part: (v: Vec) => number) => { const m = part(mean(at(x, n), U)); return Array.from({ length: 4 * N }, (_, i) => part(flow(at(x, n), U, i * T / N)) - m); };
      const rms = (a: number[]) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length), dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0) / (a.length * rms(a) * rms(b));
      const vMid = series(0, intoOf), uMid = series(0, alongOf), uOut = series(-flank, alongOf), uIn = series(flank, alongOf);
      // (Uijttewaal & Tukker, in Bijvelds §2: v'² ≈ (0.1·ΔU)², u'² ≈ (0.2·ΔU)²)
      expect(rms(vMid)).toBeCloseTo(0.1 * dU, 3); expect(rms(uOut)).toBeCloseTo(0.2 * dU, 3); expect(rms(uIn)).toBeCloseTo(0.2 * dU, 3);
      expect(rms(uMid)).toBeLessThan(0.01 * dU); // (nothing along the stream on the center line)
      expect(dot(uOut, uIn)).toBeCloseTo(-1, 3); // (the two flanks opposite)
      expect(Math.abs(dot(uOut, vMid))).toBeLessThan(0.01); // (a quarter-turn from the cross-stream swing)
      expect(Math.abs(dot(uOut.slice(N / 4), vMid.slice(0, -N / 4)))).toBeCloseTo(1, 3);
      let ups = 0; for (let i = 1; i < vMid.length; i++) if (vMid[i - 1] <= 0 && vMid[i] > 0) ups++;
      expect(ups).toBe(4); // (one eddy each period: 4 in 4)
      void dn;
      // (gone a few layer-widths either side, and upstream of the corner)
      for (const q of [at(x, 3 * B), at(x, -3 * B)]) { const a = flow(q, U, 0), b = flow(q, U, T / 4); expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.01 * dU); }
      const before = at(down(U, -5), -0.2); expect(flow(before, U, 0)).toEqual(flow(before, U, T / 3));
    }
  });
  it('the eddies keep their beat as the tide\'s stream changes: no jump when the stream is read afresh, hours into a sail', () => {
    const S = mouthState(), U = (t: number) => -(0.2 + 0.2 * (t - 18000) / 7200), p = at(M.W / 2, 2); // (a flood building from 0.2 to 0.4 m/s over two hours, five hours in)
    refreshMouths(S, 18000, () => stream(U(18000)));
    let worst = 0, swing = 0;
    for (let t = 18030; t <= 25200; t += 30) {
      const a = withHarborMouths(p, stream(U(t)), 1, S, t); refreshMouths(S, t, () => stream(U(t))); const b = withHarborMouths(p, stream(U(t)), 1, S, t);
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y));
      const c = withHarborMouths(p, stream(U(t)), 1, S, t + 15); swing = Math.max(swing, Math.hypot(c.x - b.x, c.y - b.y));
    }
    expect(swing).toBeGreaterThan(0.02); // (the eddies are there: centimeters a second over a quarter-minute)
    expect(worst).toBeLessThan(0.002); // (and the fresh reading moves the water by no more than the stream's own half-minute of change)
  });
  it('on the ebb the stream has come through Pier 1\'s piles: a slowed lee out to the pier\'s head, the whole stream past it', () => {
    const head = M.pileA, U = EBB;
    // (off the mouth, inside the pier's head: what the piles pass)
    expect(alongOf(flow(at(M.W / 2, -0.4 * head), U))).toBeCloseTo(PILES * 0.5, 2);
    // (out past the head: the open stream)
    expect(alongOf(flow(at(M.W / 2, -head - 15), U))).toBeCloseTo(0.5, 2);
    // (the lee doesn't run on for ever: gone by two pier-heads downstream)
    expect(alongOf(flow(at(2 * head + 5, -0.4 * head), U))).toBeCloseTo(0.5, 6);
    // (the flood meets no piles before the mouth: the whole stream outside it)
    expect(alongOf(flow(at(M.W / 2, -0.4 * head), FLOOD))).toBeCloseTo(-0.5, 6);
    // (so the ebb's gyre, settled, is the weaker of the two for the same stream)
    expect(Math.abs(settled(EBB).gyre[0]) / Math.abs(settled(FLOOD).gyre[0])).toBeCloseTo(PILES, 6);
  });
});

describe('in the world', () => {
  const world = (current: string) => new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', tideDate: '2026-11-14', tideTime: '16:00', current } as Settings, 1, { freeSail: true });
  it('a boat in the entrance on a flood is set back against the stream on the gyre\'s far side, and the chart draws the same water', () => {
    const w = world('flood'), f = w.currentAt(M.ref), dn = Math.sign(alongOf(f));
    expect(dn).toBe(-1); expect(Math.abs(alongOf(f))).toBeGreaterThan(0.05);
    const deep = { x: M.c.x + M.into.x * 0.75 * M.R, y: M.c.y + M.into.y * 0.75 * M.R };
    expect(alongOf(w.currentAt(deep)) * dn).toBeLessThan(0);
    expect(w.currentDrawn(deep)).toEqual(w.currentAt(deep));
    // (and nothing has changed out on the Bay)
    const bay = { x: M.c.x, y: M.c.y + 600 }; expect(Math.hypot(w.currentAt(bay).x, w.currentAt(bay).y)).toBeGreaterThan(Math.abs(alongOf(f)));
  });
  it('on a 2.5 kt ebb the water just off the mouth is what Pier 1\'s piles pass, and the gyre turns the other way', () => {
    const w = world('bigebb'), e = LL(37.80795, -122.43272), kt = (p: Vec) => Math.hypot(w.currentAt(p).x, w.currentAt(p).y) / KT;
    const off = kt({ x: e.x, y: e.y + 20 }), out = kt({ x: e.x, y: e.y + 100 });
    expect(out).toBeGreaterThan(1); // (past the pier's head: the Bay's stream, eased by the shore)
    expect(off).toBeGreaterThan(0.6); expect(off).toBeLessThan(0.9); // (1.24 kt there without the piles: 0.6 of it)
    const deep = { x: M.c.x + M.into.x * 0.75 * M.R, y: M.c.y + M.into.y * 0.75 * M.R };
    expect(w.currentAt(deep).x).toBeGreaterThan(0.03); // (the ebb runs west; the gyre's far side comes back east)
  });
  it('is smooth to sail through: no step in the water between one half-meter and the next, either tide', () => {
    for (const cur of ['flood', 'bigebb']) {
      const w = world(cur), U = Math.abs(alongOf(w.currentAt({ x: M.ref.x, y: M.ref.y + 80 })));
      let worst = 0, where = '';
      for (let y = M.c.y - 60; y <= M.a.y + 90; y += 1.5) for (let x = M.b.x - 60; x <= M.a.x + 6; x += 0.5) {
        const p = { x, y }, q = { x: x + 0.5, y }; if (onLand(p) || onLand(q) || hitsWall(p) || hitsWall(q) || pilePierDist(p) < 3.5) continue; // (not the pier's own deck edge: current.ts)
        // (left out: the layer's first meters off the upstream corner, where it is a meter wide by design, and the lee's own edge off the pier's head)
        if (Math.hypot(x - M.b.x, y - M.b.y) < 8 || Math.hypot(x - M.a.x, y - M.a.y) < 8 || Math.abs((y - M.a.y) - M.pileA) < 6) continue;
        const a = w.currentAt(p), b = w.currentAt(q), d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > worst) { worst = d; where = `${cur} (${x.toFixed(1)},${y.toFixed(1)})`; }
      }
      expect(worst / U, where).toBeLessThan(0.06);
    }
  });
});
