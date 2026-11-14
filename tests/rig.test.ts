import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RIG } from '../src/render/boatMesh';
import { sailArea, sailEdges } from '../src/render/sails';
import { CABIN, COCKPIT, L, deckY, halfBeam, sheer, uAtZ } from '../src/render/hull';
import { carLead, SHEET_POINT, TRAVELLER_HALF, TRAVELLER_SWING } from '../src/boat/controls';

/** The drawn boat against the class rules (NFIA CR 2025–2028) and FRIDA's ORC certificate (EST F51, 2026). */
describe('the drawn rig and hull', () => {
  it('puts the mast 2.80 m from the bow and the forestay 0.80 m (CR 7.21, 6.1.7)', () => {
    expect(RIG.MAST_FRONT_Z + L / 2).toBeCloseTo(2.80, 3);
    expect(RIG.FORESTAY_DECK.z + L / 2).toBeCloseTo(0.80, 3);
    // IG: the hounds 6.50 m up the mast's front from the deck (CR 6.1.11 measures up the mast; the mast is raked)
    expect(RIG.HOUNDS.distanceTo(RIG.raked(new THREE.Vector3(0, RIG.DECK_AT_MAST, RIG.MAST_FRONT_Z)))).toBeCloseTo(6.50, 3);
    expect(RIG.BOOM_TOP - RIG.DECK_AT_MAST).toBeCloseTo(1.00, 3); // BAS
  });
  it('puts the lower band\'s upper edge (the Lower Mast Point) 1000 ± 10 mm above the deck, along the mast\'s after side (CR 6.1.11)', () => {
    const aft = RIG.MAST_Z + 0.133 / 2, deck = deckY(uAtZ(aft), 0);
    expect(Math.abs(RIG.BOOM_TOP - deck - 1.0)).toBeLessThan(0.003); // (the rule allows ±10 mm: drawn at its nominal 1000)
  });
  it('gives the sails the certificate\'s areas: main 18.51 m², jib 7.30 m² (ORC feed, Area_Main and Area_Jib)', () => {
    expect(sailArea(RIG.MAIN_DEF)).toBeGreaterThan(18.51 * 0.98);
    expect(sailArea(RIG.MAIN_DEF)).toBeLessThan(18.51 * 1.02);
    expect(sailArea(RIG.JIB_DEF)).toBeGreaterThan(7.30 * 0.98);
    expect(sailArea(RIG.JIB_DEF)).toBeLessThan(7.30 * 1.02);
  });
  it('rakes the mast as North Sails\' forestay mark sets it: the forestay 5.50 + 1.31 m (boat/rake.ts)', () => {
    expect(Math.abs(RIG.HOUNDS.distanceTo(RIG.FORESTAY_DECK) - 6.81)).toBeLessThan(0.01); // (within a centimetre: the mark is read by eye)
    expect(RIG.MAST_RAKE * 180 / Math.PI).toBeGreaterThan(5); expect(RIG.MAST_RAKE * 180 / Math.PI).toBeLessThan(6.5);
  });
  it('draws the main to the class\'s maximum at both bands, its leech inside 9150 mm (CR 9.25, Mainsail drawing 8, ERS G.7.2)', () => {
    const m = RIG.MAIN_DEF;
    expect(m.head.distanceTo(m.tack)).toBeCloseTo(8.75, 3); // (head at the upper band: P up the raked mast)
    expect(m.clew.distanceTo(m.tack)).toBeCloseTo(3.38, 3); // (clew at the boom band: E)
    expect(m.head.distanceTo(m.clew)).toBeLessThanOrEqual(9.15); expect(m.head.distanceTo(m.clew)).toBeGreaterThan(9.0);
    expect(RIG.MAIN_LEECH).toBeCloseTo(m.head.distanceTo(m.clew), 6);
  });
  it('sets the main\'s roach to its measured widths', () => {
    // width square to the (raked) luff at height fraction t
    const m = RIG.MAIN_DEF, lu = m.head.clone().sub(m.tack).normalize();
    const w = (t: number) => { const [l, le] = sailEdges(m, t), d = le.clone().sub(l); return d.sub(lu.clone().multiplyScalar(d.dot(lu))).length(); };
    for (const [t, g] of [[0.25, 2.89], [0.5, 2.22], [0.75, 1.32], [0.875, 0.72]]) expect(Math.abs(w(t) - g)).toBeLessThan(0.08);
  });
  it('sets the jib\'s luff on the forestay: luff 5.95 m, LP 2.36 m', () => {
    const j = RIG.JIB_DEF, luff = j.head.clone().sub(j.tack);
    expect(luff.length()).toBeCloseTo(5.95, 2);
    expect(luff.clone().normalize().angleTo(RIG.JIB_AXIS)).toBeLessThan(1e-6);
    const c = j.clew.clone().sub(j.tack), lp = c.clone().sub(RIG.JIB_AXIS.clone().multiplyScalar(c.dot(RIG.JIB_AXIS))).length();
    expect(lp).toBeCloseTo(2.36, 2);
    // the head is below the hounds, on the stay
    expect(j.head.length()).toBeLessThan(RIG.HOUNDS.distanceTo(RIG.FORESTAY_DECK));
  });
  it('draws the jib cars where the physics\' lead angles put them, the middle hole a 2.65 m tape from the stay\'s pin (North)', () => {
    const mid = RIG.carPos(1, 3, 2);
    expect(mid.distanceTo(RIG.FORESTAY_DECK)).toBeCloseTo(2.65, 1); // (the tape runs up to the car on the cabin top)
    for (const ins of [0, 2, 4]) {
      const car = RIG.carPos(1, 3, ins), d = car.z - RIG.FORESTAY_DECK.z;
      expect(Math.atan2(car.x, d) * 180 / Math.PI).toBeCloseTo(carLead(ins), 3);
    }
  });
  it('builds the hull to the class\'s beam and freeboard', () => {
    let mx = 0; for (let u = 0; u <= 1; u += 0.002) mx = Math.max(mx, halfBeam(u));
    expect(2 * mx).toBeCloseTo(2.20, 2);
    expect(2 * halfBeam(uAtZ(L / 2 - 5.0))).toBeCloseTo(1.910, 2); // station 11 (CR 2.161)
    let lo = 9; for (let u = 0; u <= 1; u += 0.002) lo = Math.min(lo, sheer(u));
    expect(lo).toBeCloseTo(0.568, 3); // lowest freeboard (class Appendix)
  });
  it('lays out the cabin and cockpit by the class rules (CR 3.11, 3.12, 3.22)', () => {
    const z = (u: number) => -L / 2 + u * L, st = (n: number) => L / 2 - 0.5 * (n - 1);
    expect(z(CABIN.u1) - z(CABIN.u0)).toBeGreaterThanOrEqual(1.85 - 1e-9); // the cabin top's length
    expect(st(6) - z(CABIN.u1)).toBeGreaterThanOrEqual(0); expect(st(6) - z(CABIN.u1)).toBeLessThanOrEqual(0.30);
    expect(z(CABIN.u0)).toBeGreaterThan(RIG.MAST_FRONT_Z + 0.133); // aft of the mast
    expect(z(COCKPIT.u1)).toBeCloseTo(st(3), 3);
  });
});

describe('the traveller: the physics and the drawing agree', () => {
  it('the car\'s travel and the sheet\'s point on the boom are the drawn ones (controls.ts TRAVELLER_SWING)', () => {
    expect(TRAVELLER_HALF).toBeCloseTo(RIG.TRAV_HALF, 6);
    expect(SHEET_POINT).toBeCloseTo(RIG.MS_R, 2);
    // (the swing within the car's measured travel of its geometry, atan(travel / sheet point))
    expect(Math.abs(TRAVELLER_SWING - Math.atan(TRAVELLER_HALF / SHEET_POINT) * 180 / Math.PI)).toBeLessThan(0.6);
  });
});

/** The drawn sails against the class's sail rules (NFIA CR 2025–2028, section 9, and its drawings 8 and 9). */
describe('the sails as the class allows them', () => {
  const leech = (d: typeof RIG.MAIN_DEF) => { const N = 2000, p = [...Array(N + 1)].map((_, i) => sailEdges(d, i / N)[1]), cum = [0]; for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + p[i].distanceTo(p[i - 1])); return { p, cum, L: cum[N] }; };
  /** How far down the leech from the head (as a fraction of it) the leech point at height fraction t is. */
  const fromHead = (d: typeof RIG.MAIN_DEF, t: number) => { const { p, cum, L } = leech(d), q = sailEdges(d, t)[1]; let k = 0; for (let i = 0; i < p.length; i++) if (p[i].distanceTo(q) < p[k].distanceTo(q)) k = i; return { f: (L - cum[k]) / L, m: L - cum[k], L }; };
  /** A sail's windows' area (m²), from their outlines across the chord and up the luff. */
  const windowArea = (d: typeof RIG.MAIN_DEF) => { let a = 0; const luff = d.head.distanceTo(d.tack); for (const w of d.windows ?? []) for (let k = 0, K = 60; k < K; k++) { const t = w.t0 + (w.t1 - w.t0) * (k + 0.5) / K, [lu, le] = sailEdges(d, t); a += lu.distanceTo(le) * (w.s1 - w.s0) * luff * (w.t1 - w.t0) / K; } return a; };
  it('the main\'s four battens divide its leech into five equal parts, within 100 mm (CR 9.23); top 800 mm, the rest 1050 at most (CR 9.24)', () => {
    const b = RIG.MAIN_DEF.battens!;
    expect(b.length).toBe(4);
    [0.8, 0.6, 0.4, 0.2].forEach((want, i) => { const { f, L } = fromHead(RIG.MAIN_DEF, b[i].t); expect(Math.abs(f - want) * L).toBeLessThan(0.1); });
    expect(b[3].len).toBeLessThanOrEqual(0.8); for (const x of b.slice(0, 3)) expect(x.len).toBeLessThanOrEqual(1.05);
  });
  it('the jib\'s three battens divide its leech into four equal parts (within 100 mm), inside lengths 600, 400, 300 mm at most (CR 9.35)', () => {
    const b = RIG.JIB_DEF.battens!;
    [0.75, 0.5, 0.25].forEach((want, i) => { const { f, L } = fromHead(RIG.JIB_DEF, b[i].t); expect(Math.abs(f - want) * L).toBeLessThan(0.1); });
    [0.6, 0.4, 0.3].forEach((max, i) => expect(b[i].len).toBeLessThanOrEqual(max));
  });
  it('each sail\'s windows total 0.5 m² at most (CR 9.13)', () => {
    expect(windowArea(RIG.MAIN_DEF)).toBeLessThanOrEqual(0.5);
    expect(windowArea(RIG.JIB_DEF)).toBeLessThanOrEqual(0.5);
  });
});
