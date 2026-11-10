import './three-setup';
import * as THREE from 'three';
import { BREAKWATER_W, FINGER_W, HARBOR, SLIPS, WALKWAY_W } from '../geo/marina';
import type { Vec } from '../core/math';
import { P3 } from './coords';
import { boat } from './moored';

/**
 * West Harbor in 3D (geo/marina.ts): floating concrete docks (main walkways and slip fingers) a little above the water,
 * steel pilings at their corners and ends, the rock breakwaters, the red entrance beacon, and boats in most slips.
 */
const DOCK_TOP = 0.45, DOCK_T = 0.35;

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

export class Harbor {
  readonly group = new THREE.Group();
  private inSlip = new Map<string, THREE.Object3D>();

  constructor(scene: THREE.Scene) {
    const segs: { a: Vec; b: Vec; w: number }[] = [], piles: Vec[] = [];
    for (const w of HARBOR.walkways) { for (let i = 1; i < w.length; i++) segs.push({ a: w[i - 1], b: w[i], w: WALKWAY_W }); w.forEach(p => piles.push(p)); }
    for (const f of HARBOR.fingers) { for (let i = 1; i < f.length; i++) segs.push({ a: f[i - 1], b: f[i], w: FINGER_W }); piles.push(f[f.length - 1]); }
    // the docks: one instanced box per straight run
    const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(1, DOCK_T, 1), new THREE.MeshLambertMaterial({ color: 0xc4c0b6 }), segs.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    segs.forEach((s, i) => {
      const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) + s.w * 0.5, mid = P3((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2, DOCK_TOP - DOCK_T / 2);
      q.setFromAxisAngle(up, Math.atan2(s.b.x - s.a.x, s.b.y - s.a.y));
      m.compose(mid, q, new THREE.Vector3(s.w, 1, len)); deck.setMatrixAt(i, m);
    });
    this.group.add(deck);
    // pilings: steel, standing well above the docks (the docks ride up and down them with the tide)
    const pile = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.17, 4.2, 8), new THREE.MeshLambertMaterial({ color: 0x5d6064 }), piles.length);
    piles.forEach((p, i) => { m.compose(P3(p.x, p.y, 0.6), q.identity(), new THREE.Vector3(1, 1, 1)); pile.setMatrixAt(i, m); });
    this.group.add(pile);
    // the breakwaters: rubble mounds of rock
    const rock = new THREE.MeshLambertMaterial({ color: 0x8a8176 });
    for (const b of HARBOR.breakwaters) {
      if (b.area) {
        const s = new THREE.Shape(); b.pts.forEach((p, i) => i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y));
        const g = new THREE.ExtrudeGeometry(s, { depth: 2.6, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 1.2, bevelSegments: 2 }); g.rotateX(-Math.PI / 2); g.translate(0, -0.6, 0);
        this.group.add(new THREE.Mesh(g, rock));
      } else for (let i = 1; i < b.pts.length; i++) {
        const a = b.pts[i - 1], c = b.pts[i], len = Math.hypot(c.x - a.x, c.y - a.y);
        const bx = new THREE.Mesh(new THREE.BoxGeometry(BREAKWATER_W, 2.6, len), rock); bx.position.copy(P3((a.x + c.x) / 2, (a.y + c.y) / 2, 1.0)); bx.rotation.y = -Math.atan2(c.x - a.x, c.y - a.y) + Math.PI; this.group.add(bx);
      }
    }
    // the entrance beacon: a red triangle on a post (Q R)
    if (HARBOR.beacon) {
      const g = new THREE.Group(), red = new THREE.MeshLambertMaterial({ color: 0xc8302a, side: THREE.DoubleSide });
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 6.4, 8), new THREE.MeshLambertMaterial({ color: 0xd9d6cf })); post.position.y = 3.2; g.add(post);
      const tri = new THREE.Mesh(new THREE.CircleGeometry(0.75, 3), red); tri.position.y = 5.4; tri.rotation.z = Math.PI / 2; g.add(tri);
      const tri2 = tri.clone(); tri2.rotation.y = Math.PI / 2; g.add(tri2);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4a3a })); lamp.position.y = 6.5; g.add(lamp);
      g.position.copy(P3(HARBOR.beacon.x, HARBOR.beacon.y, 0)); this.group.add(g);
    }
    // boats in most of the slips: bow in, sails furled, a little under the length of the finger
    const r = rng(11);
    for (const s of SLIPS) {
      if (r() > 0.78) continue;
      const len = Math.min(Math.max(7, s.finger * (0.85 + 0.2 * r())), 13), b = boat(len, r);
      b.position.copy(P3(s.p.x, s.p.y, 0)); b.rotation.y = -s.heading * Math.PI / 180; // the generic boat's bow is toward −z
      this.group.add(b); this.inSlip.set(s.id, b);
    }
    scene.add(this.group);
  }

  /** Leave these slips empty (your boats' slips: she's out sailing, or drawn as herself). */
  clearSlips(ids: (string | undefined)[]): void {
    const set = new Set(ids.filter(Boolean));
    for (const [id, o] of this.inSlip) o.visible = !set.has(id);
  }
}
