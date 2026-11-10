import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BREAKWATER_W, FINGER_W, HARBOR, SLIPS, WALKWAY_W } from '../geo/marina';
import type { Vec } from '../core/math';
import { P3 } from './coords';
import { boat } from './moored';

/**
 * West Harbor in 3D (geo/marina.ts): floating wooden docks (main walkways and slip fingers, decked in weathered boards
 * laid across them) a little above the water, timber pilings at their corners and ends, the rock breakwaters, the red
 * entrance beacon, and boats in most slips.
 */
const DOCK_TOP = 0.45, DOCK_T = 0.35;

/** The dock's centre line, with an end that's within a few metres of another dock's centre line moved to meet that dock's edge (trimmed back if it crossed it, run out to it if it stopped short). */
function meetEdge(pts: Vec[], others: Vec[][], otherW: number): Vec[] {
  const out = pts.map(p => ({ ...p }));
  for (const [i, j] of [[0, 1], [out.length - 1, out.length - 2]]) {
    const p = out[i], q = out[j], L = Math.hypot(p.x - q.x, p.y - q.y); if (L < 0.5) continue;
    const t = { x: (p.x - q.x) / L, y: (p.y - q.y) / L }; // pointing out of the dock, toward the end
    let best: { s: number; sin: number } | null = null;
    for (const o of others) for (let k = 1; k < o.length; k++) {
      const a = o[k - 1], b = o[k], dx = b.x - a.x, dy = b.y - a.y, den = t.x * dy - t.y * dx; if (Math.abs(den) < 1e-6) continue;
      const s = ((a.x - p.x) * dy - (a.y - p.y) * dx) / den, r = ((a.x - p.x) * t.y - (a.y - p.y) * t.x) / den; // p + t·s meets a + (b−a)·r
      if (r < -0.02 || r > 1.02 || Math.abs(s) > 4) continue;
      const sin = Math.abs(den) / Math.hypot(dx, dy);
      if (!best || Math.abs(s) < Math.abs(best.s)) best = { s, sin };
    }
    if (best) { const s = best.s - otherW / 2 / Math.max(0.3, best.sin); out[i] = { x: p.x + t.x * s, y: p.y + t.y * s }; }
  }
  return out;
}
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

export class Harbor {
  readonly group = new THREE.Group();
  private inSlip = new Map<string, THREE.Object3D>();

  constructor(scene: THREE.Scene) {
    // the docks: each walkway one continuous strip with mitred corners; each finger a strip from the walkway's edge
    // (trimmed or extended to meet it) to its end; decked in boards laid across, with darker fascias down the sides
    const walks = HARBOR.walkways.map(w => meetEdge(w, HARBOR.walkways.filter(o => o !== w), WALKWAY_W));
    const fingers = HARBOR.fingers.map(f => meetEdge(f, HARBOR.walkways, WALKWAY_W));
    const tops: THREE.BufferGeometry[] = [], sides: THREE.BufferGeometry[] = [], piles: Vec[] = [];
    for (const w of walks) { const g = strip(w, WALKWAY_W); tops.push(g.top); sides.push(g.side); piles.push(...alongside(w, WALKWAY_W, 12)); }
    for (const f of fingers) {
      const g = strip(f, FINGER_W); tops.push(g.top); sides.push(g.side);
      const e = f[f.length - 1], d = f[f.length - 2], L = Math.hypot(e.x - d.x, e.y - d.y) || 1, u = { x: (e.x - d.x) / L, y: (e.y - d.y) / L };
      piles.push({ x: e.x - u.x * 0.3 + u.y * (FINGER_W / 2 + 0.2), y: e.y - u.y * 0.3 - u.x * (FINGER_W / 2 + 0.2) }); // a piling at the end, beside it
    }
    this.group.add(new THREE.Mesh(mergeGeometries(tops), new THREE.MeshLambertMaterial({ map: deckTexture(), side: THREE.DoubleSide })));
    this.group.add(new THREE.Mesh(mergeGeometries(sides), new THREE.MeshLambertMaterial({ color: 0x6b5442, side: THREE.DoubleSide })));
    [...tops, ...sides].forEach(g => g.dispose());
    // pilings: timber, standing well above the docks (the docks ride up and down them with the tide)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    const pile = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.19, 4.2, 10), new THREE.MeshLambertMaterial({ color: 0x5b4a3a }), piles.length);
    piles.forEach((p, i) => { m.compose(P3(p.x, p.y, 0.6), q.identity(), new THREE.Vector3(1, 1, 1)); pile.setMatrixAt(i, m); });
    this.group.add(pile);
    const cap = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10), new THREE.MeshLambertMaterial({ color: 0x8a8c8e }), piles.length); // galvanised pile caps
    piles.forEach((p, i) => { m.compose(P3(p.x, p.y, 2.73), q.identity(), new THREE.Vector3(1, 1, 1)); cap.setMatrixAt(i, m); });
    this.group.add(cap);
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
