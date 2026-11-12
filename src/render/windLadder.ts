import './three-setup';
import * as THREE from 'three';
import type { Boat } from '../boat/boat';
import { CE_ABOVE_WL } from '../boat/balance';
import { KT, D2R } from '../core/math';

/**
 * The midair wind indicator (a training tool, the owner's first: ROADMAP "Training tools"). A MOCK-UP for the owner to
 * see before deciding: a "wind ladder" of arrows floating to windward of her at three heights, the true wind (white)
 * and the apparent wind (amber) at each, pointing the way the air goes, each as long as it is strong, with its speed.
 * - The true wind grows with height over the water: the log profile the sails already use, VT(z) = VT(10 m)·ln(z/z0) /
 *   ln(10/z0), z0 = 0.005 m (ORC VPP Documentation 2025, eq. 7.1; physics.ts sailWind).
 * - The apparent wind is the true wind less her own motion through the water; with the true wind stronger aloft, it
 *   comes from further aft and is stronger at the masthead than at the deck: the twist the sails are cut for.
 * (Built for real, both would come from one physics.ts helper that sailWind calls too.)
 */
const Z0 = 0.005;
/** The heights: her deck, the sails' centre of effort (where the sim works out the sail force), the masthead (m). */
export const LADDER_Z = [1, CE_ABOVE_WL, 9];
/** Arrow length per knot of wind (m), and how far to windward of her the ladder stands (m). */
const PER_KT = 0.42, OFF = 5;
const gradient = (z: number) => Math.log(z / Z0) / Math.log(10 / Z0);

/** True and apparent wind at height z (m above the water): speed (kt) and the way the air goes, as a world bearing. */
export function ladderWind(b: Boat, z: number): { tw: { kt: number; to: number }; aw: { kt: number; to: number; awa: number } } {
  const twKt = b.ww.kt * gradient(z), to = (b.ww.from + 180) % 360;
  // the air's velocity over the ground (east, north), less hers through the water (along her heading)
  const ax = Math.sin(to * D2R) * twKt * KT, ay = Math.cos(to * D2R) * twKt * KT;
  const bx = Math.sin(b.h * D2R) * b.v, by = Math.cos(b.h * D2R) * b.v;
  const rx = ax - bx, ry = ay - by, aKt = Math.hypot(rx, ry) / KT, aTo = (Math.atan2(rx, ry) / D2R + 360) % 360;
  const awa = Math.abs(((aTo + 180 - b.h + 540) % 360) - 180);
  return { tw: { kt: twKt, to }, aw: { kt: aKt, to: aTo, awa } };
}

function label(): { sprite: THREE.Sprite; set: (t: string, col: string) => void } {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const tex = new THREE.CanvasTexture(c), sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(1.9, 0.475, 1); sprite.renderOrder = 10;
  let shown = '';
  return { sprite, set: (t, col) => {
    if (t + col === shown) return; shown = t + col;
    const g = c.getContext('2d')!; g.clearRect(0, 0, 256, 64);
    g.font = '600 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(t).width + 18; g.fillStyle = 'rgba(8,18,28,.72)'; g.beginPath(); g.roundRect(128 - w / 2, 10, w, 44, 10); g.fill();
    g.fillStyle = col; g.fillText(t, 128, 33); tex.needsUpdate = true;
  } };
}

function arrow(color: number): THREE.Group {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false });
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 10), m); shaft.name = 'shaft';
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.45, 14), m); head.name = 'head';
  g.add(shaft, head); return g;
}
/** Lay an arrow from its middle `at`, toward bearing `to` (deg), `len` m long (flat: the wind over the water is level). */
function lay(g: THREE.Group, at: THREE.Vector3, to: number, len: number): void {
  const d = new THREE.Vector3(Math.sin(to * D2R), 0, -Math.cos(to * D2R));
  g.position.copy(at); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  const shaft = g.getObjectByName('shaft')!, head = g.getObjectByName('head')!, sl = Math.max(0.05, len - 0.45);
  shaft.scale.set(1, sl, 1); shaft.position.set(0, -len / 2 + sl / 2, 0); head.position.set(0, len / 2 - 0.225, 0);
}

export class WindLadder {
  readonly grp = new THREE.Group();
  private rungs = LADDER_Z.map(() => ({ tw: arrow(0xf4f7fa), aw: arrow(0xffb627), twL: label(), awL: label() }));
  constructor() {
    for (const r of this.rungs) this.grp.add(r.tw, r.aw, r.twL.sprite, r.awL.sprite);
  }
  /** Each frame: stand the ladder to windward of her and set its arrows (the scene's x east, −z north). */
  update(b: Boat): void {
    const at = new THREE.Vector3(b.x, 0, -b.y);
    // abeam on the side the wind comes over (arel + from starboard), level with the mast: clear of the sails from astern
    const s = b.arel >= 0 ? 1 : -1, abeam = (b.h + 90 * s) * D2R, fwd = b.h * D2R;
    const side = new THREE.Vector3(Math.sin(abeam), 0, -Math.cos(abeam)).multiplyScalar(OFF).add(new THREE.Vector3(Math.sin(fwd), 0, -Math.cos(fwd)).multiplyScalar(1.5));
    this.rungs.forEach((r, i) => {
      const z = LADDER_Z[i], w = ladderWind(b, z), base = at.clone().add(side).setY(z);
      lay(r.tw, base.clone().add(new THREE.Vector3(0, 0.18, 0)), w.tw.to, w.tw.kt * PER_KT);
      lay(r.aw, base.clone().add(new THREE.Vector3(0, -0.18, 0)), w.aw.to, w.aw.kt * PER_KT);
      // the labels beside the arrows' tails, upwind of them
      const back = (to: number, len: number) => new THREE.Vector3(-Math.sin(to * D2R), 0, Math.cos(to * D2R)).multiplyScalar(len / 2 + 1.1);
      r.twL.sprite.position.copy(base).add(back(w.tw.to, w.tw.kt * PER_KT)).add(new THREE.Vector3(0, 0.5, 0));
      r.awL.sprite.position.copy(base).add(back(w.aw.to, w.aw.kt * PER_KT)).add(new THREE.Vector3(0, -0.5, 0));
      r.twL.set(`True ${w.tw.kt.toFixed(1)} kt`, '#f4f7fa');
      r.awL.set(`App. ${w.aw.kt.toFixed(1)} kt · ${Math.round(w.aw.awa)}°`, '#ffb627');
    });
  }
}
