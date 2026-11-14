import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BREAKWATER_W, FINGER_W, HARBORS, WALKWAY_W, mooredIn, slipById, type Harbor as HarborGeo, type Slip } from '../geo/marina';
import type { Vec } from '../core/math';
import { P3 } from './coords';
import enc from '../geo/data/enc-chart.json';
import { LL } from '../geo/geo';
import { MAX_BEAM, MOORED, powerParts, sailParts } from './mooredBoats';
import type { MooredKind } from '../geo/marina';

// (which slips have a boat, and the boats: geo/marina.ts mooredIn, shared with the sim)

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
/**
 * The boats in a marina's slips of one kind (sail or power; render/mooredBoats.ts): each part one instanced mesh, every boat
 * that part scaled to her length; a hull and a sail cover in each boat's own colours.
 */
class SlipBoats {
  private parts: { mesh: THREE.InstancedMesh; own?: 'hull' | 'cover' }[] = [];
  private mats: { slip: Slip; len: number }[] = [];
  readonly index = new Map<string, number>();
  private beam: number;
  /** Where the boats are (their middle), the level-of-detail's own position: the parts' instances are placed relative to it. */
  private at = new THREE.Vector3();
  constructor(group: THREE.Group, kind: MooredKind, boats: { slip: Slip; len: number; colour: number; cover: number }[]) {
    this.beam = MOORED[kind].beam;
    const n = boats.length; if (!n) return;
    for (const b of boats) this.at.add(P3(b.slip.p.x, b.slip.p.y, 0)); this.at.divideScalar(n);
    // near by, every part; beyond 1.2 km, where a boat is a few pixels long, a simpler set (mooredBoats.ts `far`)
    const lod = new THREE.LOD(); lod.position.copy(this.at); group.add(lod);
    for (const [far, dist] of [[false, 0], [true, 1200]] as const) {
      const level = new THREE.Group();
      for (const p of kind === 'sail' ? sailParts(far) : powerParts(far)) {
        const mesh = new THREE.InstancedMesh(p.geo, new THREE.MeshLambertMaterial({ color: p.colour }), n);
        level.add(mesh); this.parts.push({ mesh, own: p.own });
      }
      lod.addLevel(level, dist);
    }
    boats.forEach((b, i) => {
      this.mats.push({ slip: b.slip, len: b.len }); this.index.set(b.slip.id, i);
      for (const p of this.parts) if (p.own) p.mesh.setColorAt(i, new THREE.Color(p.own === 'hull' ? b.colour : b.cover));
      this.place(i, true);
    });
    for (const p of this.parts) p.mesh.computeBoundingSphere();
  }
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private up = new THREE.Vector3(0, 1, 0);
  private s = new THREE.Vector3(); private zero = new THREE.Vector3(0, 0, 0);
  /** Show or hide the boat in this slip (hidden: scaled to nothing). */
  place(i: number, show: boolean): void {
    const { slip, len } = this.mats[i], c = P3(slip.p.x, slip.p.y, 0).sub(this.at);
    this.q.setFromAxisAngle(this.up, -slip.heading * Math.PI / 180); // her bow toward −z, as the parts are built
    this.m.compose(c, this.q, show ? this.s.set(Math.min(len, MAX_BEAM / this.beam), len, len) : this.zero); // (her beam to fit the slip)
    for (const p of this.parts) { p.mesh.setMatrixAt(i, this.m); p.mesh.instanceMatrix.needsUpdate = true; }
  }
}

export class Harbor {
  readonly group = new THREE.Group();
  private boats: SlipBoats[] = [];

  constructor(scene: THREE.Scene) {
    harborLights.length = 0; // (this scene's lights only)
    const deck = new THREE.MeshLambertMaterial({ map: deckTexture(), side: THREE.DoubleSide });
    const fascia = new THREE.MeshLambertMaterial({ color: 0x6b5442, side: THREE.DoubleSide });
    const rock = new THREE.MeshLambertMaterial({ color: 0x8a8176 });
    const concrete = new THREE.MeshLambertMaterial({ color: 0xcfcbc2 }), white = new THREE.MeshLambertMaterial({ color: 0xf2f2ee }); // weathered white-grey concrete; white pipe rails
    const whitePile = new THREE.MeshLambertMaterial({ color: 0xeeeeea }), paved = new THREE.MeshLambertMaterial({ color: 0x9c968c }); // white-sleeved piles; a weathered paved path
    const pileMat = new THREE.MeshLambertMaterial({ color: 0x5b4a3a }), capMat = new THREE.MeshLambertMaterial({ color: 0x8a8c8e });
    const pileGeo = new THREE.CylinderGeometry(0.17, 0.19, 4.2, 10), capGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10);
    for (const H of HARBORS) this.build(H, deck, fascia, rock, concrete, white, whitePile, paved, pileMat, capMat, pileGeo, capGeo);
    scene.add(this.group);
  }

  private build(H: HarborGeo, deck: THREE.Material, fascia: THREE.Material, rock: THREE.Material, concrete: THREE.Material, white: THREE.Material, whitePile: THREE.Material, paved: THREE.Material, pileMat: THREE.Material, capMat: THREE.Material, pileGeo: THREE.BufferGeometry, capGeo: THREE.BufferGeometry): void {
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
    const pile = new THREE.InstancedMesh(pileGeo, H.piles === 'white' ? whitePile : pileMat, piles.length), cap = new THREE.InstancedMesh(capGeo, capMat, piles.length); // galvanised pile caps
    piles.forEach((p, i) => { m.compose(P3(p.x, p.y, 0.6), q, one); pile.setMatrixAt(i, m); m.compose(P3(p.x, p.y, 2.73), q, one); cap.setMatrixAt(i, m); });
    pile.computeBoundingSphere(); cap.computeBoundingSphere();
    this.group.add(pile, cap);
    // the breakwaters: rubble mounds of rock; or a vertical concrete seawall, walked along its top, with a pipe railing
    for (const b of H.breakwaters) {
      if (b.seawall) {
        const s = new THREE.Shape(); b.pts.forEach((p, i) => i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y));
        const g = new THREE.ExtrudeGeometry(s, { depth: b.seawall.top + 1.5, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, -1.5, 0); // (square-sided: what you see is what you hit)
        this.group.add(new THREE.Mesh(g, concrete));
        // the railing: posts every 2 m and two rails, 0.5 m and 1.0 m above the walkway, just in from the outer edge
        const r = b.seawall.rail, y0 = b.seawall.top, posts: Vec[] = [];
        for (let i = 1; i < r.length; i++) {
          const a = r[i - 1], c = r[i], len = Math.hypot(c.x - a.x, c.y - a.y); if (len < 0.3) continue;
          for (let d = 0; d <= len; d += 2) posts.push({ x: a.x + (c.x - a.x) * d / len, y: a.y + (c.y - a.y) * d / len });
          for (const h of [0.5, 1.0]) {
            const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 5), white); rail.rotation.x = Math.PI / 2;
            const holder = new THREE.Group(); holder.add(rail); holder.position.copy(P3((a.x + c.x) / 2, (a.y + c.y) / 2, y0 + h)); holder.rotation.y = -Math.atan2(c.x - a.x, c.y - a.y);
            this.group.add(holder);
          }
        }
        const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5), white, posts.length), m1 = new THREE.Matrix4();
        posts.forEach((p, i) => { m1.makeTranslation(P3(p.x, p.y, y0 + 0.5)); post.setMatrixAt(i, m1); }); post.computeBoundingSphere(); this.group.add(post);
      } else if (b.area) {
        const s = new THREE.Shape(); b.pts.forEach((p, i) => i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y));
        const g = new THREE.ExtrudeGeometry(s, { depth: 2.6, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.3, bevelSegments: 2 }); g.rotateX(-Math.PI / 2); g.translate(0, -0.6, 0); // (a small bevel: the rock you see is the rock you hit)
        this.group.add(new THREE.Mesh(g, rock));
      } else for (let i = 1; i < b.pts.length; i++) {
        const a = b.pts[i - 1], c = b.pts[i], len = Math.hypot(c.x - a.x, c.y - a.y);
        const bx = new THREE.Mesh(new THREE.BoxGeometry(BREAKWATER_W, 2.6, len), rock); bx.position.copy(P3((a.x + c.x) / 2, (a.y + c.y) / 2, 1.0)); bx.rotation.y = -Math.atan2(c.x - a.x, c.y - a.y) + Math.PI; this.group.add(bx);
      }
    }
    // paved paths along the breakwaters' tops, 3 m wide, just above the rock (its top: 2.6 m)
    for (const path of H.paths) {
      const pos: number[] = [];
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], c = path[i], l = Math.hypot(c.x - a.x, c.y - a.y); if (l < 0.1) continue;
        const n = { x: (c.y - a.y) / l * 1.5, y: -(c.x - a.x) / l * 1.5 };
        for (const p of [[a, -1], [a, 1], [c, 1], [a, -1], [c, 1], [c, -1]] as [Vec, number][]) { const q = P3(p[0].x + n.x * p[1], p[0].y + n.y * p[1], 2.65); pos.push(q.x, q.y, q.z); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      this.group.add(new THREE.Mesh(g, paved));
    }
    // the entrance beacons, as NOAA's chart has them (enc-chart.json aids: the nearest charted beacon with a light): a post with
    // its daymark where the chart gives one (TOPSHP: a red triangle, a green square), and its light, flashing at night in its
    // charted character (lightOn). Gashouse Cove's, San Francisco East Yacht Harbor Light 2 (Iso R 6s, 4 m, no topmark), stands
    // on a small platform on piles at its seawall's end with the harbor's IDLE SPEED / NO WAKE ZONE sign (the owner's photo,
    // reference/photos/gashouse-cove-exit-breakwater-and-fort-mason.jpg)
    for (const bc of H.beacons) {
      const g = new THREE.Group(), red = bc.colour === 'red', mat = new THREE.MeshLambertMaterial({ color: red ? 0xc8302a : 0x2e8a4a, side: THREE.DoubleSide });
      const aid = chartedLight(bc.p), lit = aid?.lit?.[0], h = lit?.h ?? 6.5;
      if (H.id === 'gashouse-cove' && red && aid && aid.top == null) {
        const conc = new THREE.MeshLambertMaterial({ color: 0xb9b3a6 }), steel = new THREE.MeshLambertMaterial({ color: 0x6f5a48 });
        const deck = new THREE.Mesh(new THREE.BoxGeometry(3, 0.35, 3), conc); deck.position.y = 2.6; g.add(deck); // (the platform, about the seawall's top)
        for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 4.4, 8), steel); pl.position.set(x, 0.4, z); g.add(pl); }
        for (const [x, z, w, d] of [[0, -1.45, 3, 0.05], [0, 1.45, 3, 0.05], [-1.45, 0, 0.05, 3], [1.45, 0, 0.05, 3]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), new THREE.MeshLambertMaterial({ color: 0xd8d6d0 })); r.position.set(x, 3.75, z); g.add(r); }
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h - 2.8, 6), steel); mast.position.set(0.9, 2.8 + (h - 2.8) / 2, 0.9); g.add(mast);
        for (const ry of [0, Math.PI]) { const sgn = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.3), noWakeBoard()); sgn.position.y = 3.4; sgn.rotation.y = ry; sgn.translateZ(1.55); g.add(sgn); }
        const lamp = lampOf(red, lit); lamp.position.set(0.9, h, 0.9); g.add(lamp);
      } else {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, h - 0.1, 8), new THREE.MeshLambertMaterial({ color: 0xd9d6cf })); post.position.y = (h - 0.1) / 2; g.add(post);
        if (!aid || aid.top != null) { // (a daymark only where the chart has one, or where there's no charted light to say)
          const mark = new THREE.Mesh(red ? new THREE.CircleGeometry(0.75, 3) : new THREE.PlaneGeometry(1.1, 1.1), mat); mark.position.y = h - 1.1; if (red) mark.rotation.z = Math.PI / 2; g.add(mark);
          const mark2 = mark.clone(); mark2.rotation.y = Math.PI / 2; g.add(mark2);
        }
        const lamp = lampOf(red, lit); lamp.position.y = h; g.add(lamp);
      }
      g.position.copy(P3(bc.p.x, bc.p.y, 0)); this.group.add(g);
    }
    // boats in most of the slips: bow in, sails furled, a little under the length of the finger
    // (hulls mostly white or off-white gelcoat, some dark; the main's cover in the usual canvas colours; the share of powerboats
    // is an estimate (POWER_SHARE): the harbors' own figures weren't found)
    const fleet: Record<MooredKind, { slip: Slip; len: number; colour: number; cover: number }[]> = { sail: [], power: [] };
    for (const m of mooredIn(H.id)) fleet[m.kind].push(m);
    for (const k of ['sail', 'power'] as const) this.boats.push(new SlipBoats(this.group, k, fleet[k]));
  }

  /** Leave these slips empty (your boats' slips: she's out sailing, or drawn as herself). */
  clearSlips(ids: (string | undefined)[]): void {
    const set = new Set(ids.map(id => slipById(id)?.id).filter(Boolean)); // (older saves name West Harbor's slips without the marina)
    for (const b of this.boats) for (const [id, i] of b.index) b.place(i, !set.has(id));
  }
}

/** The harbor's sign, as in the owner's photo: IDLE SPEED in white on red, over NO WAKE ZONE in black on white. */
let noWake: THREE.Material | null = null;
function noWakeBoard(): THREE.Material {
  if (noWake) return noWake;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 280; const c = cv.getContext('2d')!;
  c.fillStyle = '#f4f2ea'; c.fillRect(0, 0, 256, 280);
  c.fillStyle = '#c8261e'; c.fillRect(8, 8, 240, 124);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 50px Arial, sans-serif';
  c.fillStyle = '#ffffff'; c.fillText('IDLE', 128, 46); c.fillText('SPEED', 128, 98);
  c.fillStyle = '#111111'; c.font = 'bold 44px Arial, sans-serif'; c.fillText('NO WAKE', 128, 180); c.fillText('ZONE', 128, 232);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return noWake = new THREE.MeshLambertMaterial({ map: tex });
}

/** A charted light's character (S-57 LIGHTS: LITCHR, SIGGRP, SIGPER, HEIGHT above MHW). */
type ChartLight = { chr: number; col?: number[]; grp?: string; per?: number; h?: number };
type ChartAid = { k: string; p: [number, number]; name?: string; top?: number; lit?: ChartLight[] };
const BEACONS = ((enc as unknown as { aids: ChartAid[] }).aids).filter(a => a.k === 'beacon' && a.lit?.length).map(a => ({ a, v: LL(a.p[1] / 1e5, a.p[0] / 1e5) }));
/** The charted beacon with a light nearest a harbor's beacon, within 40 m (OpenStreetMap's and NOAA's positions differ by metres). */
function chartedLight(p: Vec): ChartAid | null {
  let best: ChartAid | null = null, bd = 40;
  for (const { a, v } of BEACONS) { const d = Math.hypot(v.x - p.x, v.y - p.y); if (d < bd) { bd = d; best = a; } }
  return best;
}
/** The harbors' lights, shown at night in their charted character (scene.ts: harborLights, lightOn). */
export const harborLights: { obj: THREE.Object3D; lit: ChartLight | null }[] = [];
function lampOf(red: boolean, lit: ChartLight | undefined): THREE.Object3D {
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: red ? 0xff4a3a : 0x4aff7a }));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: red ? 0xff2a1a : 0x2aff5a, transparent: true, opacity: 0.85, depthWrite: false }));
  const g = new THREE.Group(); g.add(lamp, glow); harborLights.push({ obj: glow, lit: lit ?? null });
  return g;
}
/**
 * Whether a light with this charted character is lit at time t (s): the US Light List's characters (S-57 LITCHR: 1 fixed,
 * 2 flashing, 3 long-flashing, 4 quick, 5 very quick, 7 isophase, 8 occulting), its period (SIGPER) and group (SIGGRP,
 * e.g. "(2)", "(2+1)"). Flash lengths are ESTIMATES within the Light List's definitions: a flash 0.5 s (long flash 2 s),
 * a quick flash 0.3 s of each second, very quick 0.2 of each half second; isophase half its period lit; an occulting
 * light's eclipse a quarter of its period.
 */
export function lightOn(lit: ChartLight | null, t: number): boolean {
  if (!lit) return true;
  const per = lit.per ?? 4, ph = ((t % per) + per) % per;
  const groups = (lit.grp?.match(/\(([^)]*)\)/)?.[1] ?? '1').split('+').map(Number).filter(n => n > 0);
  switch (lit.chr) {
    case 1: return true;
    case 4: return (t % 1) < 0.3;
    case 5: return (t % 0.5) < 0.2;
    case 7: return ph < per / 2;
    case 8: return ph > per / 4;
    case 2: case 3: {
      const len = lit.chr === 3 ? 2 : 0.5, gap = 1; let at = 0;
      for (const n of groups) { for (let i = 0; i < n; i++) { if (ph >= at && ph < at + len) return true; at += len + gap; } at += gap; }
      return false;
    }
    default: return true;
  }
}
