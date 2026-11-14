import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HEEL, TRANSOM_TOP, cockpitGeometry, hullGeometry, hullInnerHalf, uAtZ } from '../src/render/hull';

/** The hull shell's edges that only one triangle uses (open edges: anything behind them shows through a gap). */
function openEdges(g: THREE.BufferGeometry): [THREE.Vector3, THREE.Vector3][] {
  const P = g.attributes.position.array, I = g.index!.array, ids = new Map<string, number>();
  const n = (v: number) => (Math.abs(v) < 5e-6 ? 0 : v).toFixed(5);
  const id = (i: number) => { const k = `${n(P[3 * i])},${n(P[3 * i + 1])},${n(P[3 * i + 2])}`; if (!ids.has(k)) ids.set(k, ids.size); return ids.get(k)!; };
  const E = new Map<string, { a: number; b: number; c: number }>();
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = I[t + e], b = I[t + (e + 1) % 3], ia = id(a), ib = id(b), k = ia < ib ? `${ia}_${ib}` : `${ib}_${ia}`;
    const r = E.get(k) ?? { a, b, c: 0 }; r.c++; E.set(k, r);
  }
  const v = (i: number) => new THREE.Vector3(P[3 * i], P[3 * i + 1], P[3 * i + 2]);
  return [...E.values()].filter(r => r.c === 1).map(r => [v(r.a), v(r.b)]);
}

describe('hull shell', () => {
  const open = openEdges(hullGeometry());
  it('has no gap where the garboards meet the keel, nor anywhere in the keel', () => {
    // the only open edges are the sheer (under the deck) and the planks' lands, tucked behind the plank above; the
    // lowest land is the garboard's, at about the keel's side (canoe body −0.62 m amidships)
    const lowest = Math.min(...open.map(([a, b]) => Math.min(a.y, b.y)));
    expect(lowest).toBeGreaterThan(-0.6);
  });
  it('shares its vertices with the transom: no cracks along the raked stern', () => {
    // on the transom's plane (within 1 mm), the open edges are along its top at the sheer, and the ends of the planks'
    // lands (a few cm of girth each, tucked behind the plank above): nothing else
    const n = new THREE.Vector3(0, -(TRANSOM_TOP.z - HEEL.z), TRANSOM_TOP.y - HEEL.y).normalize(), o = new THREE.Vector3(0, HEEL.y, HEEL.z);
    const on = (p: THREE.Vector3) => Math.abs(p.clone().sub(o).dot(n)) < 1e-3;
    const cracks = open.filter(([a, b]) => on(a) && on(b) && a.distanceTo(b) > 1e-5 && Math.min(a.y, b.y) < TRANSOM_TOP.y - 0.05);
    expect(cracks.length).toBeLessThanOrEqual(30); // 15 lands a side at most (16 planks, CR 2.207.5; fewer where the lower ones have run out on the keel)
    for (const [a, b] of cracks) expect(a.distanceTo(b)).toBeLessThan(0.06);
  });
  it('keeps the cockpit inside her: no locker or shelf panel pokes out through the hull', () => {
    // (the lockers' after ends and the after shelf's front once ran straight down to the sole at their top's width,
    // where the hull is narrower, and stood out through it under the water)
    let worst = -1;
    for (const list of Object.values(cockpitGeometry())) for (const g of list) {
      const P = g.attributes.position.array;
      for (let i = 0; i < P.length; i += 3) if (P[i + 1] < 0.5) worst = Math.max(worst, Math.abs(P[i]) - hullInnerHalf(uAtZ(P[i + 2]), P[i + 1]));
    }
    expect(worst).toBeLessThan(0.005);
  });
});
