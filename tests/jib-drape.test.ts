import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { testBoat, sail } from './helpers/testBoat';
import { takeLine } from '../src/boat/physics';
import type { Boat } from '../src/boat/boat';
import { RIG, jibObstacles, jibRods } from '../src/render/boatMesh';
import { Sail, type SailShape } from '../src/render/sails';

/** Hove to on a tack (the classic way, as tests/heaveto.test.ts): the jib held aback, the tiller lashed to leeward. */
function hoveTo(tack: 'S' | 'P'): Boat {
  const port = tack === 'P', b = testBoat({ heading: port ? 42 : 318, kt: 4.5, windKt: 15 });
  sail(b, 30, () => { b.h = port ? 42 - (b.leeway ?? 0) : 318 + (b.leeway ?? 0); });
  takeLine(b, 'jibsheetW'); (b.ctlTarget ??= {}).jibsheetW = 0;
  takeLine(b, 'mainsheet'); b.ctlTarget.mainsheet = 0.55; sail(b, 20);
  b.lashed = 0.7 * (port ? 1 : -1); sail(b, 60);
  return b;
}

/**
 * The jib as drawn for her (boatMesh syncBoatMesh): turned about the forestay by b.jib, its belly mirrored to the side
 * the wind presses it (leeward of the clew: toward the mast when backed), the cloth against the rods. Every triangle
 * sampled at its corners and inside, in the boat's frame.
 */
function clothPoints(b: Boat, sh: SailShape): THREE.Vector3[] {
  const jib = new Sail(RIG.JIB_DEF, new THREE.MeshBasicMaterial(), null);
  const q = new THREE.Quaternion().setFromAxisAngle(RIG.JIB_AXIS, b.jib * Math.PI / 180);
  const sx = (b.jibBacked ?? 0) > 0 ? Math.sign(b.boom || 1) : Math.sign(b.jib || 1), local = new THREE.Matrix4().makeScale(sx, 1, 1);
  jib.update({ ...sh, obstacles: jibObstacles(q, local) });
  const pose = new THREE.Matrix4().compose(RIG.FORESTAY_DECK, q, new THREE.Vector3(1, 1, 1)).multiply(local);
  const pos = jib.geom.attributes.position, idx = jib.geom.index!, out: THREE.Vector3[] = [];
  const v = [0, 1, 2].map(() => new THREE.Vector3());
  for (let i = 0; i < idx.count; i += 3) {
    for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx.getX(i + k)).applyMatrix4(pose);
    for (let a = 0; a <= 6; a++) for (let c = 0; a + c <= 6; c++) out.push(v[0].clone().multiplyScalar(1 - (a + c) / 6).addScaledVector(v[1], a / 6).addScaledVector(v[2], c / 6));
  }
  return out;
}
/** How far (m) a point is inside the mast's section or a shroud's wire, the deepest of them (0: clear). */
function inside(p: THREE.Vector3): number {
  let worst = 0;
  const ath = 0.110 / 2, fa = 0.133 / 2; // (the mast's section, boatMesh MAST_ATH and MAST_FA)
  // (the mast is raked: the point taken back into the upright mast's frame, about the pivot at the deck, before its section is checked)
  const pv = new THREE.Vector3(0, RIG.DECK_AT_MAST, RIG.MAST_Z), u = p.clone().sub(pv).applyAxisAngle(new THREE.Vector3(1, 0, 0), -RIG.MAST_RAKE).add(pv);
  if (u.y > RIG.DECK_AT_MAST && u.y < RIG.HOUNDS.y + 0.1) { const e = Math.hypot(u.x / ath, (u.z - RIG.MAST_Z) / fa); if (e < 1) worst = Math.max(worst, (1 - e) * ath); }
  for (const s of jibRods().slice(3)) {
    const d = s.b.clone().sub(s.a), u = THREE.MathUtils.clamp(p.clone().sub(s.a).dot(d) / d.lengthSq(), 0, 1);
    worst = Math.max(worst, 0.004 - p.distanceTo(s.a.clone().addScaledVector(d, u))); // (a 4 mm wire's half-width, and the cloth)
  }
  return worst;
}
const shapeOf = (b: Boat, flog = 0, time = 0): SailShape => ({ twist: b.shape.jib?.twist ?? 8, depth: b.shape.jib?.depth, draft: b.shape.jib?.draft, bubble: 0, flog, time });

describe('a backed jib lies against the mast and the shroud, never through them (owner: "mast penetrates jib when hove to")', () => {
  for (const tack of ['S', 'P'] as const) it(`hove to on ${tack === 'S' ? 'starboard' : 'port'} tack`, () => {
    const b = hoveTo(tack);
    expect(b.hove).toBe(true); expect(b.jibBacked).toBeGreaterThan(0.5);
    const pts = clothPoints(b, shapeOf(b));
    expect(Math.max(...pts.map(inside))).toBeLessThan(0.003);
    // and it does reach the mast: the belly is pressed onto it (within a few cm of its surface), not held off it
    const pv = new THREE.Vector3(0, RIG.DECK_AT_MAST, RIG.MAST_Z), up = (p: THREE.Vector3) => p.clone().sub(pv).applyAxisAngle(new THREE.Vector3(1, 0, 0), -RIG.MAST_RAKE).add(pv);
    const near = Math.min(...pts.map(up).filter(p => p.y > RIG.DECK_AT_MAST && p.y < RIG.HOUNDS.y).map(p => Math.hypot(p.x / 0.055, (p.z - RIG.MAST_Z) / 0.0665) - 1));
    expect(near * 0.055).toBeLessThan(0.03);
  });
  for (const tack of ['S', 'P'] as const) it(`aback and flogging in a tack (${tack}): the shaking cloth still stops at the mast`, () => {
    const b = hoveTo(tack);
    for (const time of [0, 0.13, 0.31, 0.57, 0.9]) expect(Math.max(...clothPoints(b, shapeOf(b, 0.85, time)).map(inside))).toBeLessThan(0.003);
  });
  it('a drawing jib, close-hauled, is untouched by the rods (they only stop cloth pressed onto them)', () => {
    const b = testBoat({ heading: 318, kt: 5, windKt: 12 }); sail(b, 30, () => { b.h = 318; });
    const jib = new Sail(RIG.JIB_DEF, new THREE.MeshBasicMaterial(), null), free = new Sail(RIG.JIB_DEF, new THREE.MeshBasicMaterial(), null);
    const q = new THREE.Quaternion().setFromAxisAngle(RIG.JIB_AXIS, b.jib * Math.PI / 180), local = new THREE.Matrix4().makeScale(Math.sign(b.jib), 1, 1);
    jib.update({ ...shapeOf(b), obstacles: jibObstacles(q, local) }); free.update(shapeOf(b));
    const a = jib.geom.attributes.position.array, f = free.geom.attributes.position.array;
    let moved = 0; for (let i = 0; i < a.length; i++) moved = Math.max(moved, Math.abs(a[i] - f[i]));
    expect(moved).toBeLessThan(0.01);
  });
});
