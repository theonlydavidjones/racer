import { describe, expect, it } from 'vitest';
import { RIG } from '../src/render/boatMesh';
import { sailArea, sailEdges } from '../src/render/sails';
import { CABIN, COCKPIT, L, deckY, halfBeam, sheer, uAtZ } from '../src/render/hull';
import { carLead } from '../src/boat/controls';

/** The drawn boat against the class rules (NFIA CR 2025–2028) and FRIDA's ORC certificate (EST F51, 2026). */
describe('the drawn rig and hull', () => {
  it('puts the mast 2.80 m from the bow and the forestay 0.80 m (CR 7.21, 6.1.7)', () => {
    expect(RIG.MAST_FRONT_Z + L / 2).toBeCloseTo(2.80, 3);
    expect(RIG.FORESTAY_DECK.z + L / 2).toBeCloseTo(0.80, 3);
    expect(RIG.HOUNDS.y - RIG.DECK_AT_MAST).toBeCloseTo(6.50, 3); // IG
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
  it('sets the main\'s roach to its measured widths', () => {
    // width square to the (upright) luff at height fraction t
    const w = (t: number) => { const [lu, le] = sailEdges(RIG.MAIN_DEF, t); return le.z - lu.z; };
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
  it('draws the jib cars where the physics\' lead angles put them, about 2.65 m aft of the stay', () => {
    for (const ins of [0, 2, 4]) {
      const car = RIG.carPos(1, 3, ins), d = car.z - RIG.FORESTAY_DECK.z;
      expect(d).toBeCloseTo(2.65, 2);
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
