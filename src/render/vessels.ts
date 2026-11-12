import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { D2R } from '../core/math';
import { VESSEL, type Vessel, type VesselKind } from '../sim/traffic';
import { Wakes } from './wake';

/** Simple but recognisable models of the bay's traffic, built to their real size. Bow toward −z. */
const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); return o; };

/** A hull: a box with a pointed bow. */
function hull(len: number, beam: number, free: number, draft: number, col: number): THREE.Mesh {
  const s = new THREE.Shape(), b = beam / 2;
  s.moveTo(0, -len / 2); s.lineTo(b, -len / 2 + beam * 0.9); s.lineTo(b, len / 2); s.lineTo(-b, len / 2); s.lineTo(-b, -len / 2 + beam * 0.9); s.lineTo(0, -len / 2);
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: free + draft, bevelEnabled: false }), lam(col));
  m.rotation.x = Math.PI / 2; m.position.y = free; return m;
}

function model(kind: VesselKind): THREE.Group {
  const t = VESSEL[kind], g = new THREE.Group(), L = t.len, B = t.beam;
  switch (kind) {
    case 'container': {
      g.add(hull(L, B, 12, 4, 0x2b3440));
      const cols = [0xb03a2e, 0x2e5b8a, 0x6c7a3f, 0xc78a2c, 0x7b4b8f, 0x3d8a86, 0xd8d4c8];
      // the stacks, one mesh a colour (a few draw calls for the whole deck cargo, not one a box)
      const byCol = new Map<number, THREE.BufferGeometry[]>();
      for (let z = -L * 0.38; z < L * 0.32; z += 13.5) for (let x = -B / 2 + 3; x < B / 2 - 2; x += 2.6) {
        const h = 2.6 * (2 + Math.floor((Math.sin(z * 0.37 + x) + 1) * 2)), c = cols[Math.abs(Math.floor(z * 0.13 + x * 0.7)) % cols.length];
        const bg = new THREE.BoxGeometry(2.4, h, 12.2).translate(x + 1.2, 12 + h / 2, z);
        (byCol.get(c) ?? byCol.set(c, []).get(c)!).push(bg);
      }
      for (const [c, gs] of byCol) { const merged = mergeGeometries(gs); gs.forEach(x => x.dispose()); if (merged) g.add(new THREE.Mesh(merged, lam(c))); }
      g.add(box(B * 0.9, 28, 14, lam(0xeeeae0), 0, 12, L * 0.38)); // the bridge, aft
      g.add(box(4, 10, 4, lam(0x222222), 0, 40, L * 0.42)); // funnel
      break;
    }
    case 'tanker':
      g.add(hull(L, B, 9, 6, 0x3a2a24));
      g.add(box(B * 0.15, 1.2, L * 0.75, lam(0x8a8a82), 0, 9, -L * 0.05)); // the pipe rack along the deck
      g.add(box(B * 0.85, 22, 18, lam(0xece8de), 0, 9, L * 0.4));
      g.add(box(5, 8, 5, lam(0x9a2a22), 0, 31, L * 0.43));
      break;
    case 'ferry': // a fast catamaran: two hulls, a two-deck cabin
      for (const sx of [-1, 1]) { const h = hull(L, B * 0.28, 1.6, 1.2, 0xf2f2ee); h.position.x = sx * B * 0.36; g.add(h); }
      g.add(box(B, 3, L * 0.7, lam(0xf2f2ee), 0, 1.6, 0)); g.add(box(B * 0.85, 2.6, L * 0.5, lam(0x2f6b4a), 0, 4.6, -L * 0.05));
      g.add(box(B * 0.7, 1.4, L * 0.25, lam(0x1d2a33), 0, 7.2, -L * 0.12));
      break;
    case 'alcatraz': case 'tour':
      g.add(hull(L, B, 2.2, 2, kind === 'tour' ? 0x1d3f8f : 0xf2f2ee));
      g.add(box(B * 0.92, 2.8, L * 0.75, lam(0xf2f2ee), 0, 2.2, 0)); g.add(box(B * 0.85, 2.6, L * 0.55, lam(0xf2f2ee), 0, 5, 0.04 * L));
      g.add(box(B * 0.7, 1.6, L * 0.2, lam(0x1d2a33), 0, 7.6, -L * 0.18));
      break;
    case 'coastguard':
      g.add(hull(L, B, 1.6, 1.2, 0xf4f4f0));
      g.add(box(0.5, 0.25, L * 0.55, lam(0xd8342a), B / 2 + 0.02, 0.9, -L * 0.1)); g.add(box(0.5, 0.25, L * 0.55, lam(0xd8342a), -B / 2 - 0.02, 0.9, -L * 0.1)); // the racing stripe
      g.add(box(B * 0.8, 2.2, L * 0.35, lam(0xf4f4f0), 0, 1.6, 0.05 * L)); g.add(box(0.12, 3, 0.12, lam(0x333333), 0, 3.8, 0.05 * L));
      break;
  }
  g.traverse(o => { o.castShadow = false; });
  return g;
}

export class VesselView {
  private meshes = new Map<number, THREE.Group>();
  private wakes = new Map<number, Wakes>();
  constructor(private scene: THREE.Scene) {}

  private acc = 0;
  sync(vs: Vessel[], t: number, dt: number, sea: (x: number, y: number) => number): void {
    this.acc += dt; const wakeNow = this.acc >= 0.1 || dt === 0, wdt = this.acc; if (wakeNow) this.acc = 0;
    const on = new Set(vs.map(v => v.id));
    // (a ship not on the water now, e.g. traffic turned off for this race: not left where the last race had her)
    for (const [id, m] of this.meshes) if (m.visible !== on.has(id)) { m.visible = on.has(id); this.wakes.get(id)?.show(m.visible); }
    for (const v of vs) {
      let m = this.meshes.get(v.id);
      if (!m) {
        m = model(v.kind); this.scene.add(m); this.meshes.set(v.id, m);
        const ty = VESSEL[v.kind], wk = new Wakes(this.scene, { sample: 1.5, n: 100, scale: Math.max(1.5, ty.beam / 3), len: ty.len });
        wk.reset([{ x: v.x, y: v.y, h: v.h, v: v.v, rel: 0 }]); this.wakes.set(v.id, wk);
      }
      m.position.set(v.x, sea(v.x, v.y) * 0.3, -v.y); m.rotation.y = -v.h * D2R;
      if (wakeNow) this.wakes.get(v.id)!.update([{ x: v.x, y: v.y, h: v.h, v: v.v, rel: 0 }], t, wdt, sea, [0]); // ten times a second is plenty for a ship's wake
    }
  }
}
