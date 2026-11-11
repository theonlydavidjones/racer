import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BREAKWATER_W, FINGER_W, HARBORS, SLIPS, WALKWAY_W, slipById, type Harbor as HarborGeo, type Slip } from '../geo/marina';
import type { Vec } from '../core/math';
import { P3 } from './coords';

/**
 * The marinas in 3D (geo/marina.ts: West Harbor, Gashouse Cove, South Beach, the Corinthian): floating wooden docks (main
 * walkways and slip fingers, decked in weathered boards laid across them) a little above the water, timber pilings at
 * their corners and ends, the rock breakwaters, the entrance beacons (red triangles and green squares, as US daymarks
 * are), and boats in most slips.
 */
const DOCK_TOP = 0.45, DOCK_T = 0.35;

/** A strip of dock along a centre line: its deck (UVs in metres, boards across) and its sides, mitred at the bends. */
function strip(pts: Vec[], w: number): { top: THREE.BufferGeometry; side: THREE.BufferGeometry } {
  const n = pts.length, L: Vec[] = [], R: Vec[] = [], S: number[] = [];
  const dir = (i: number) => { const a = pts[i], b = pts[i + 1], l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (i) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const d0 = dir(Math.max(0, i - 1)), d1 = dir(Math.min(n - 2, i)), tx = d0.x + d1.x, ty = d0.y + d1.y, tl = Math.hypot(tx, ty) || 1;
    const nx = ty / tl, ny = -tx / tl, k = (w / 2) / Math.max(0.5, nx * d1.y - ny * d1.x); // the mitre: wider at a bend
    L.push({ x: pts[i].x - nx * k, y: pts[i].y - ny * k }); R.push({ x: pts[i].x + nx * k, y: pts[i].y + ny * k }); S.push(s);
  }
  const top: number[] = [], uv: number[] = [], side: number[] = [], y1 = DOCK_TOP, y0 = DOCK_TOP - DOCK_T;
  const v = (p: Vec, y: number, arr: number[]) => { const q = P3(p.x, p.y, y); arr.push(q.x, q.y, q.z); };
  const quad = (a: Vec, b: Vec, c: Vec, d: Vec, ya: number, yb: number, arr: number[]) => { v(a, ya, arr); v(b, ya, arr); v(c, yb, arr); v(a, ya, arr); v(c, yb, arr); v(d, yb, arr); };
  for (let i = 1; i < n; i++) {
    v(L[i - 1], y1, top); v(R[i - 1], y1, top); v(R[i], y1, top); v(L[i - 1], y1, top); v(R[i], y1, top); v(L[i], y1, top);
    const a = [0, S[i - 1]], b = [w, S[i - 1]], c = [w, S[i]], d = [0, S[i]];
    for (const [x, y] of [a, b, c, a, c, d]) uv.push(x / PLANK_TILE_W, y / PLANK_TILE_L);
    for (const E of [L, R]) { const p = E[i - 1], q = E[i]; v(p, y1, side); v(q, y1, side); v(q, y0, side); v(p, y1, side); v(q, y0, side); v(p, y0, side); }
  }
  for (const i of [0, n - 1]) quad(L[i], R[i], R[i], L[i], y1, y0, side); // the ends
  const gt = new THREE.BufferGeometry(); gt.setAttribute('position', new THREE.Float32BufferAttribute(top, 3)); gt.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); gt.computeVertexNormals();
  const gs = new THREE.BufferGeometry(); gs.setAttribute('position', new THREE.Float32BufferAttribute(side, 3)); gs.computeVertexNormals();
  return { top: gt, side: gs };
}
/** Pilings along a walkway, every `every` m, on alternate sides just off its edge. */
function alongside(pts: Vec[], w: number, every: number): Vec[] {
  const out: Vec[] = []; let next = 2, s = 0, k = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.y - a.y); if (l < 1e-6) continue;
    const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l }, side = (w / 2 + 0.2);
    while (next <= s + l) { const t = next - s, sg = k++ % 2 ? 1 : -1; out.push({ x: a.x + u.x * t + u.y * side * sg, y: a.y + u.y * t - u.x * side * sg }); next += every; }
    s += l;
  }
  return out;
}

/** One tile of decking: this wide across the dock and this long along it, m (eight boards of 15 cm). */
const PLANK_TILE_W = 2.4, PLANK_TILE_L = 1.2;
/** Weathered wooden decking: boards laid across the dock with gaps between, each its own shade, grain and a pair of fastenings at each joist. */
function deckTexture(): THREE.CanvasTexture {
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, r = rng(7), boards = 8, bh = H / boards;
  g.fillStyle = '#2a211a'; g.fillRect(0, 0, W, H); // the gaps
  for (let k = 0; k < boards; k++) {
    const y = k * bh, t = r(), base = [152 + 16 * t, 128 + 12 * t, 100 + 9 * t].map(v => Math.round(v * (0.95 + 0.06 * r()))); // weathered cedar, a little lighter or darker board by board
    g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; g.fillRect(0, y + 1.5, W, bh - 3);
    for (let s = 0; s < 22; s++) { // grain along the board
      const gy = y + 2 + r() * (bh - 4), a = 0.05 + 0.1 * r();
      g.strokeStyle = r() < 0.5 ? `rgba(60,40,25,${a})` : `rgba(235,215,185,${a * 0.8})`; g.lineWidth = 0.6 + r() * 1.2;
      g.beginPath(); g.moveTo(0, gy); for (let x = 0; x <= W; x += 32) g.lineTo(x, gy + Math.sin(x * 0.02 + s) * 0.8); g.stroke();
    }
    if (r() < 0.35) { const kx = r() * W, ky = y + bh / 2; g.fillStyle = 'rgba(70,45,28,.55)'; g.beginPath(); g.ellipse(kx, ky, 6 + r() * 6, 2.5, 0, 0, 7); g.fill(); } // a knot
    g.fillStyle = 'rgba(40,40,42,.8)'; for (const x of [W * 0.06, W * 0.5, W * 0.94]) for (const dy of [0.3, 0.7]) { g.beginPath(); g.arc(x, y + bh * dy, 1.6, 0, 7); g.fill(); } // fastenings at the joists
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

/**
 * Boats lying in their slips, all of a harbor's at once (one instanced mesh per part, so a thousand boats cost a handful
 * of draws): hull, cabin top, mast and the furled main under its cover, the same small cruising boat as render/moored.ts,
 * at each boat's own length.
 */
class SlipBoats {
  private parts: { mesh: THREE.InstancedMesh; at: (len: number) => { o: THREE.Vector3; s: THREE.Vector3 } }[] = [];
  private mats: { slip: Slip; len: number }[] = [];
  readonly index = new Map<string, number>();
  constructor(group: THREE.Group, boats: { slip: Slip; len: number; colour: number }[]) {
    const n = boats.length; if (!n) return;
    // each part built for a 1 m boat, then scaled to hers: the hull and cabin in proportion, the mast and cover only in length
    const shape = new THREE.Shape(), B = 0.17;
    shape.moveTo(0, -0.5); shape.quadraticCurveTo(B, -0.2, B * 0.85, 0.5); shape.lineTo(-B * 0.85, 0.5); shape.quadraticCurveTo(-B, -0.2, 0, -0.5);
    const hull = new THREE.ExtrudeGeometry(shape, { depth: 0.11, bevelEnabled: false }); hull.rotateX(Math.PI / 2);
    const cover = new THREE.CylinderGeometry(0.14, 0.14, 1, 6); cover.rotateX(Math.PI / 2);
    const one = new THREE.Vector3(1, 1, 1);
    const spec: [THREE.BufferGeometry, number, (len: number) => { o: THREE.Vector3; s: THREE.Vector3 }][] = [
      [hull, 0xffffff, len => ({ o: new THREE.Vector3(0, len * 0.11 - 0.05, 0), s: one.clone().multiplyScalar(len) })],
      [new THREE.BoxGeometry(B * 1.1, 0.06, 0.32), 0xece8de, len => ({ o: new THREE.Vector3(0, len * 0.14, len * 0.02), s: one.clone().multiplyScalar(len) })],
      [new THREE.CylinderGeometry(0.05, 0.06, 1, 5), 0xc9ced3, len => ({ o: new THREE.Vector3(0, len * 0.78, -len * 0.12), s: new THREE.Vector3(1, len * 1.35, 1) })],
      [cover, 0x1f4f7a, len => ({ o: new THREE.Vector3(0, len * 0.11 + 0.9, len * 0.08), s: new THREE.Vector3(1, 1, len * 0.36) })] // the main, furled under its cover
    ];
    for (const [g, colour, at] of spec) {
      const mesh = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: colour }), n);
      group.add(mesh); this.parts.push({ mesh, at });
    }
    boats.forEach((b, i) => { this.mats.push({ slip: b.slip, len: b.len }); this.index.set(b.slip.id, i); this.parts[0].mesh.setColorAt(i, new THREE.Color(b.colour)); this.place(i, true); });
    for (const p of this.parts) p.mesh.computeBoundingSphere();
  }
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private up = new THREE.Vector3(0, 1, 0);
  /** Show or hide the boat in this slip (hidden: scaled to nothing). */
  place(i: number, show: boolean): void {
    const { slip, len } = this.mats[i], c = P3(slip.p.x, slip.p.y, 0);
    this.q.setFromAxisAngle(this.up, -slip.heading * Math.PI / 180); // the boat's bow is toward −z, as the generic boat's
    for (const p of this.parts) {
      const { o, s } = p.at(len);
      this.m.compose(o.applyQuaternion(this.q).add(c), this.q, show ? s : new THREE.Vector3(0, 0, 0));
      p.mesh.setMatrixAt(i, this.m); p.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

export class Harbor {
  readonly group = new THREE.Group();
  private boats: SlipBoats[] = [];

  constructor(scene: THREE.Scene) {
    const deck = new THREE.MeshLambertMaterial({ map: deckTexture(), side: THREE.DoubleSide });
    const fascia = new THREE.MeshLambertMaterial({ color: 0x6b5442, side: THREE.DoubleSide });
    const rock = new THREE.MeshLambertMaterial({ color: 0x8a8176 });
    const pileMat = new THREE.MeshLambertMaterial({ color: 0x5b4a3a }), capMat = new THREE.MeshLambertMaterial({ color: 0x8a8c8e });
    const pileGeo = new THREE.CylinderGeometry(0.17, 0.19, 4.2, 10), capGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10);
    for (const H of HARBORS) this.build(H, deck, fascia, rock, pileMat, capMat, pileGeo, capGeo);
    scene.add(this.group);
  }

  private build(H: HarborGeo, deck: THREE.Material, fascia: THREE.Material, rock: THREE.Material, pileMat: THREE.Material, capMat: THREE.Material, pileGeo: THREE.BufferGeometry, capGeo: THREE.BufferGeometry): void {
    // the docks: each walkway one continuous strip with mitred corners; each finger a strip from the walkway's edge
    // (trimmed or extended to meet it) to its end; decked in boards laid across, with darker fascias down the sides
    const walks = H.walkways, fingers = H.fingers; // (their ends already meet the walkways' edges: geo/marina.ts)
    const tops: THREE.BufferGeometry[] = [], sides: THREE.BufferGeometry[] = [], piles: Vec[] = [];
    for (const w of walks) { const g = strip(w, WALKWAY_W); tops.push(g.top); sides.push(g.side); piles.push(...alongside(w, WALKWAY_W, 12)); }
    for (const f of fingers) {
      const g = strip(f, FINGER_W); tops.push(g.top); sides.push(g.side);
      const e = f[f.length - 1], d = f[f.length - 2], L = Math.hypot(e.x - d.x, e.y - d.y) || 1, u = { x: (e.x - d.x) / L, y: (e.y - d.y) / L };
      piles.push({ x: e.x - u.x * 0.3 + u.y * (FINGER_W / 2 + 0.2), y: e.y - u.y * 0.3 - u.x * (FINGER_W / 2 + 0.2) }); // a piling at the end, beside it
    }
    // the solid pier areas (a fuel dock, a platform): decked the same, on the same level
    for (const a of H.areas) {
      const sh = new THREE.Shape(); a.forEach((p, i) => i ? sh.lineTo(p.x, p.y) : sh.moveTo(p.x, p.y)); // (rotated flat below: shape y becomes −z, i.e. north)
      const g = new THREE.ExtrudeGeometry(sh, { depth: DOCK_T, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, DOCK_TOP - DOCK_T, 0);
      const pos = g.attributes.position, uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / PLANK_TILE_W, pos.getZ(i) / PLANK_TILE_L);
      tops.push(g.toNonIndexed()); g.dispose();
    }
    if (tops.length) this.group.add(new THREE.Mesh(mergeGeometries(tops), deck));
    if (sides.length) this.group.add(new THREE.Mesh(mergeGeometries(sides), fascia));
    [...tops, ...sides].forEach(g => g.dispose());
    // pilings: timber, standing well above the docks (the docks ride up and down them with the tide)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    const pile = new THREE.InstancedMesh(pileGeo, pileMat, piles.length), cap = new THREE.InstancedMesh(capGeo, capMat, piles.length); // galvanised pile caps
    piles.forEach((p, i) => { m.compose(P3(p.x, p.y, 0.6), q, one); pile.setMatrixAt(i, m); m.compose(P3(p.x, p.y, 2.73), q, one); cap.setMatrixAt(i, m); });
    pile.computeBoundingSphere(); cap.computeBoundingSphere();
    this.group.add(pile, cap);
    // the breakwaters: rubble mounds of rock
    for (const b of H.breakwaters) {
      if (b.area) {
        const s = new THREE.Shape(); b.pts.forEach((p, i) => i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y));
        const g = new THREE.ExtrudeGeometry(s, { depth: 2.6, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.3, bevelSegments: 2 }); g.rotateX(-Math.PI / 2); g.translate(0, -0.6, 0); // (a small bevel: the rock you see is the rock you hit)
        this.group.add(new THREE.Mesh(g, rock));
      } else for (let i = 1; i < b.pts.length; i++) {
        const a = b.pts[i - 1], c = b.pts[i], len = Math.hypot(c.x - a.x, c.y - a.y);
        const bx = new THREE.Mesh(new THREE.BoxGeometry(BREAKWATER_W, 2.6, len), rock); bx.position.copy(P3((a.x + c.x) / 2, (a.y + c.y) / 2, 1.0)); bx.rotation.y = -Math.atan2(c.x - a.x, c.y - a.y) + Math.PI; this.group.add(bx);
      }
    }
    // the entrance beacons: a red triangle (Q R) or a green square on a post, with its light
    for (const bc of H.beacons) {
      const g = new THREE.Group(), red = bc.colour === 'red', mat = new THREE.MeshLambertMaterial({ color: red ? 0xc8302a : 0x2e8a4a, side: THREE.DoubleSide });
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 6.4, 8), new THREE.MeshLambertMaterial({ color: 0xd9d6cf })); post.position.y = 3.2; g.add(post);
      const mark = new THREE.Mesh(red ? new THREE.CircleGeometry(0.75, 3) : new THREE.PlaneGeometry(1.1, 1.1), mat); mark.position.y = 5.4; if (red) mark.rotation.z = Math.PI / 2; g.add(mark);
      const mark2 = mark.clone(); mark2.rotation.y = Math.PI / 2; g.add(mark2);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: red ? 0xff4a3a : 0x4aff7a })); lamp.position.y = 6.5; g.add(lamp);
      g.position.copy(P3(bc.p.x, bc.p.y, 0)); this.group.add(g);
    }
    // boats in most of the slips: bow in, sails furled, a little under the length of the finger
    const r = rng(11 + HARBORS.indexOf(H)), boats: { slip: Slip; len: number; colour: number }[] = [];
    for (const s of SLIPS) {
      if (s.marina !== H.id) continue;
      const keep = r() <= 0.78, len = Math.min(Math.max(7, s.finger * (0.85 + 0.2 * r())), 13), colour = [0xf3f1ea, 0xeae7df, 0x1f3550, 0x8a2a24, 0xdedcd3][Math.floor(r() * 5)];
      if (keep) boats.push({ slip: s, len, colour });
    }
    this.boats.push(new SlipBoats(this.group, boats));
  }

  /** Leave these slips empty (your boats' slips: she's out sailing, or drawn as herself). */
  clearSlips(ids: (string | undefined)[]): void {
    const set = new Set(ids.map(id => slipById(id)?.id).filter(Boolean)); // (older saves name West Harbor's slips without the marina)
    for (const b of this.boats) for (const [id, i] of b.index) b.place(i, !set.has(id));
  }
}
