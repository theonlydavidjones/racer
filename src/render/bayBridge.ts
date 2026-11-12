import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LL } from '../geo/geo';
import { P3 } from './coords';
import { bayLightsMaterial, dayOnly, duskLights, nightDim, nightOnly, type Glint } from './night';

/** The Bay Bridge's SF approach, as segments (sim coords): the city's buildings keep clear of it. */
export const BAY_APPROACH: [{ x: number; y: number }, { x: number; y: number }][] = [];

type V2 = { x: number; y: number };
/** A centreline (sim coords), with distance along it. */
export class Path {
  private cum: number[] = [0];
  constructor(readonly pts: V2[]) { for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)); }
  get len() { return this.cum[this.cum.length - 1]; }
  /** The point and direction at distance s; the direction turns smoothly over `r` metres round a corner. */
  at(s: number, r = 160): { x: number; y: number; ux: number; uy: number } {
    const seg = (s: number) => { let i = 0; while (i < this.cum.length - 2 && s > this.cum[i + 1]) i++; const a = this.pts[i], b = this.pts[i + 1], L = this.cum[i + 1] - this.cum[i], t = (s - this.cum[i]) / L; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ux: (b.x - a.x) / L, uy: (b.y - a.y) / L }; };
    const p = seg(s);
    // round the corners: average the direction over ±r/2 and follow that
    if (this.pts.length > 2) { const p0 = seg(s - r / 2), p1 = seg(s + r / 2), ux = p0.ux + p1.ux, uy = p0.uy + p1.uy, n = Math.hypot(ux, uy); return { x: p.x, y: p.y, ux: ux / n, uy: uy / n }; }
    return p;
  }
}

/**
 * Collects pieces per material in the bridge's own frame (x across, to the right going along the path; y up; s
 * along), and merges them into one mesh per material at the end, so both spans cost a handful of draw calls.
 */
export class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private m = new THREE.Matrix4(); private r = new THREE.Matrix4();
  constructor(public path: Path) {}
  /** The world point at s along, dx across, y up. */
  W(s: number, dx: number, y: number): THREE.Vector3 { const p = this.path.at(s); return P3(p.x + dx * p.uy, p.y - dx * p.ux, y); }
  add(mat: THREE.Material, g: THREE.BufferGeometry): void { if (!g.index) g = g.toNonIndexed(); (this.parts.get(mat) ?? this.parts.set(mat, []).get(mat)!).push(g); }
  /** A geometry placed at (s, dx, y), turned to the path, after its own local rotation (about z = tilt across, x = pitch). */
  put(mat: THREE.Material, g: THREE.BufferGeometry, s: number, dx: number, y: number, rz = 0, rx = 0): void {
    const p = this.path.at(s);
    this.r.makeRotationFromEuler(new THREE.Euler(rx, 0, rz));
    this.m.makeRotationY(Math.atan2(-p.ux, p.uy)).multiply(this.r).setPosition(this.W(s, dx, y));
    g.applyMatrix4(this.m); this.add(mat, g);
  }
  /** A box w across, h tall, d along, centred at (s, dx, y). */
  box(mat: THREE.Material, w: number, h: number, d: number, s: number, dx: number, y: number, rz = 0, rx = 0): void { this.put(mat, new THREE.BoxGeometry(w, h, d), s, dx, y, rz, rx); }
  /** A strut between two points in the bridge's frame, square, `t` thick. */
  strut(mat: THREE.Material, a: [number, number, number], b: [number, number, number], t: number): void {
    const A = this.W(a[0], a[1], a[2]), B = this.W(b[0], b[1], b[2]), g = new THREE.BoxGeometry(t, A.distanceTo(B), t);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
    g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); this.add(mat, g);
  }
  /** A box section swept along the path from s0 to s1: centred dx across, w wide, between yBot(s) and yTop(s). */
  sweep(mat: THREE.Material, s0: number, s1: number, dx: number, w: number, yBot: (s: number) => number, yTop: (s: number) => number, step = 20, faces = 'tblr'): void {
    const n = Math.max(1, Math.ceil((s1 - s0) / step));
    const ribbon = (e0: (s: number) => [number, number], e1: (s: number) => [number, number]) => {
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      for (let i = 0; i <= n; i++) { const s = s0 + (s1 - s0) * i / n, [x0, y0] = e0(s), [x1, y1] = e1(s), A = this.W(s, x0, y0), B = this.W(s, x1, y1); pos.push(A.x, A.y, A.z, B.x, B.y, B.z); uv.push(s / 15, 0, s / 15, 1); }
      for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); this.add(mat, g);
    };
    const L = dx - w / 2, R = dx + w / 2;
    if (faces.includes('t')) ribbon(s => [L, yTop(s)], s => [R, yTop(s)]);
    if (faces.includes('b')) ribbon(s => [R, yBot(s)], s => [L, yBot(s)]);
    if (faces.includes('l')) ribbon(s => [L, yBot(s)], s => [L, yTop(s)]);
    if (faces.includes('r')) ribbon(s => [R, yTop(s)], s => [R, yBot(s)]);
  }
  /** A cable through points (s, dx, y), `r` thick. */
  tube(mat: THREE.Material, pts: [number, number, number][], r: number, seg = 100): void {
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([s, dx, y]) => this.W(s, dx, y))), seg, r, 5, false); this.add(mat, g);
  }
  /** Merge everything into the parent, one mesh per material. */
  build(parent: THREE.Object3D): void {
    for (const [mat, gs] of this.parts) {
      const g = mergeGeometries(gs.map(g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g.index ? g.toNonIndexed() : g; }), false);
      gs.forEach(x => x.dispose());
      if (g) { const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; parent.add(m); }
    }
    this.parts.clear();
  }
}

/** A square-ish frustum (a tower leg): bottom bw × bd at height 0 centred at bx, top tw × td at height h centred at tx. */
export function frustum(bw: number, bd: number, bx: number, tw: number, td: number, tx: number, h: number): THREE.BufferGeometry {
  const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const bot = c.map(([i, k]) => [bx + i * bw / 2, 0, k * bd / 2]), top = c.map(([i, k]) => [tx + i * tw / 2, h, k * td / 2]);
  const pos: number[] = [];
  const quad = (a: number[], b: number[], cc: number[], d: number[]) => pos.push(...a, ...b, ...cc, ...a, ...cc, ...d);
  // outward-facing: the sides wound counter-clockwise seen from outside, then the top
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(bot[j], bot[i], top[i], top[j]); }
  quad(top[3], top[2], top[1], top[0]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals(); return g;
}

/**
 * The San Francisco–Oakland Bay Bridge (Wikipedia, "San Francisco–Oakland Bay Bridge"; Caltrans and OpenStreetMap
 * weren't reachable to survey the piers, so the West Span runs on the alignment the scenery already had, Rincon Hill
 * to the Yerba Buena tunnel, with its published dimensions laid out along it).
 *
 * The West Span (1936): two suspension bridges end to end, each with a 704 m (2,310 ft) main span and 354 m side
 * spans, joined at the concrete central anchorage (28 × 60 m in plan, 92 × 197 ft). Four steel towers 160 m (526 ft)
 * above the water, each two tapering legs tied by tiers of X-bracing, carry two main cables 20 m apart (0.71 m, 28 in,
 * thick) that come down into anchorages on Rincon Hill, in mid-bay and on the island. The roads ride on a double-deck
 * stiffening truss about 9 m deep, 67 m (220 ft) clear of the water. Silver-grey. Vertical suspenders every 15 m
 * (50 ft, from photographs; it agrees with the Bay Lights' count: 25,000 LEDs a foot apart on one face's cables).
 *
 * The East Span (2013): from the island's east side, the self-anchored suspension span: one tower 160 m (525 ft) of
 * four steel legs tied by shear links, a 385 m main span and a 180 m back span, its single cable looped round the
 * west end and anchored in the deck at the east end, hung to the outer edges of the twin decks; then the Skyway,
 * twin concrete box girders on paired piers, falling toward the Oakland touchdown. Clearance 58 m (190 ft). White.
 * Its line runs from the tunnel's east portal along OpenStreetMap's deck to the Oakland touchdown on the mole, bending
 * as the real one does.
 *
 * The Bay Lights hang on the West Span's suspenders (night.ts). Returns the lights to reflect on the water.
 */
export function buildBayBridge(parent: THREE.Object3D, groundAt: (x: number, y: number) => number): Glint[] {
  const glints: Glint[] = [];
  const STEEL = new THREE.MeshLambertMaterial({ color: 0x9ea6ab }), CONC = new THREE.MeshLambertMaterial({ color: 0xb8b2a6 });
  const WHITE = new THREE.MeshLambertMaterial({ color: 0xdfe2e1 }), ROAD = new THREE.MeshLambertMaterial({ color: 0x5a5753 });
  // the double-deck truss's sides: a Warren truss with verticals, on a transparent panel
  const tc = document.createElement('canvas'); tc.width = 128; tc.height = 64; const t2 = tc.getContext('2d')!;
  t2.strokeStyle = '#9ea6ab'; t2.lineWidth = 6; t2.beginPath();
  for (const y of [3, 32, 61]) { t2.moveTo(0, y); t2.lineTo(128, y); }
  t2.moveTo(0, 61); t2.lineTo(64, 3); t2.lineTo(128, 61); t2.moveTo(64, 3); t2.lineTo(64, 61); t2.moveTo(0, 3); t2.lineTo(0, 61); t2.moveTo(128, 3); t2.lineTo(128, 61); t2.stroke();
  const trussTex = new THREE.CanvasTexture(tc); trussTex.wrapS = THREE.RepeatWrapping; trussTex.anisotropy = 4;
  const TRUSS = new THREE.MeshLambertMaterial({ map: trussTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });

  /* ---------- the West Span ---------- */
  const a = LL(37.7866, -122.3896), b = LL(37.8091, -122.3664); // the Rincon Hill anchorage → the tunnel on Yerba Buena Island
  const west = new Path([a, b]), K = new Kit(west), len = west.len;
  const ground = (s: number, dx = 0) => { const p = west.at(s); return Math.max(0, groundAt(p.x + dx * p.uy, p.y - dx * p.ux)); };
  const SIDE = 354, MAIN = 704, TOP = 160, BOT = 66, DEPTH = 9, DECK = BOT + DEPTH, CW = 10; // truss bottom and top; cables ±10 m
  const anch = [0, 2 * SIDE + MAIN, 4 * SIDE + 2 * MAIN], towers = [SIDE, SIDE + MAIN, 3 * SIDE + MAIN, 3 * SIDE + 2 * MAIN];
  const CAB_END = DECK + 20; // the cables enter the anchorages about 20 m above the roadway
  // the deck: the upper and lower roadways and the truss sides, from the SF anchorage onto the island
  const sEnd = len - 30, yb = () => BOT, yt = () => DECK;
  K.sweep(ROAD, 0, sEnd, 0, 2 * CW - 1, () => DECK - 0.4, yt, 40, 't');
  K.sweep(STEEL, 0, sEnd, 0, 2 * CW, yb, () => BOT + 0.8, 40, 'tb');
  K.sweep(ROAD, 0, sEnd, 0, 2 * CW - 1, () => BOT + 4.3, () => BOT + 4.6, 40, 't'); // the lower deck
  for (const sx of [-1, 1]) K.sweep(TRUSS, 0, sEnd, sx * CW, 0.01, yb, yt, 40, sx < 0 ? 'l' : 'r');
  // the towers: two legs, battered in toward the top where they carry the cables, on concrete piers
  for (const z of towers) {
    K.box(CONC, 44, 10, 26, z, 0, 3);
    for (const sx of [-1, 1]) K.put(STEEL, frustum(8, 11, sx * 15, 4.5, 7, sx * CW, TOP - 8), z, 0, 8);
    const legX = (y: number) => 15 - 5 * (y - 8) / (TOP - 8), legW = (y: number) => 8 - 3.5 * (y - 8) / (TOP - 8);
    const inner = (y: number) => legX(y) - legW(y) / 2;
    // horizontal struts and X-bracing: four tiers above the roadway, two below
    const levels = [12, 38, BOT - 2, DECK + 8, DECK + 30, DECK + 52, DECK + 74, TOP - 3];
    for (const y of levels) K.box(STEEL, 2 * inner(y) + 1, y === TOP - 3 ? 6 : 3, 5, z, 0, y);
    for (let i = 0; i < levels.length - 1; i++) {
      const y0 = levels[i] + 1.5, y1 = levels[i + 1] - 1.5; if (i === 2) continue; // the truss passes through
      K.strut(STEEL, [z, -inner(y0), y0], [z, inner(y1), y1], 1.8); K.strut(STEEL, [z, inner(y0), y0], [z, -inner(y1), y1], 1.8);
    }
  }
  // the anchorages: Rincon Hill, the central one in mid-bay (stepped at the top, the cables going into it), the island
  for (const z of anch) {
    const g0 = ground(z), top = CAB_END + 6, big = z === anch[1];
    K.box(CONC, big ? 28 : 34, top - g0 + 2, big ? 60 : 40, z, 0, (top + g0) / 2 - 1);
    K.box(CONC, big ? 22 : 28, 5, big ? 50 : 32, z, 0, top + 2.5);
    if (big) for (const sx of [-1, 1]) K.box(CONC, 1, top - 20, 1.2, z, sx * 14.2, top / 2, 0); // the buttresses' shadow lines
  }
  // the piers under the roadway on the island, from the anchorage to the tunnel
  for (let s = anch[2] + 45; s < sEnd; s += 45) { const g0 = ground(s); if (BOT - g0 > 3) K.box(CONC, 18, BOT - g0, 4, s, 0, (BOT + g0) / 2); }
  // the main cables: a parabola in each span, the side spans sagging a little below the straight line
  const cableY = (s: number) => {
    const k = s < anch[1] ? 0 : 1, z0 = anch[k], t1 = towers[2 * k], t2 = towers[2 * k + 1], z1 = anch[k + 1];
    if (s < t1) { const f = (s - z0) / SIDE; return CAB_END + (TOP - CAB_END) * f - 7 * 4 * f * (1 - f); }
    if (s > t2) { const f = (z1 - s) / SIDE; return CAB_END + (TOP - CAB_END) * f - 7 * 4 * f * (1 - f); }
    const mid = (t1 + t2) / 2, LOW = DECK + 2.5; return LOW + (TOP - LOW) * ((s - mid) / (MAIN / 2)) ** 2;
  };
  for (const sx of [-1, 1]) for (const k of [0, 1]) {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 80; i++) { const s = anch[k] + (anch[k + 1] - anch[k]) * i / 80; pts.push([s, sx * CW, cableY(s) + 0.4]); }
    K.tube(STEEL, pts, 0.45, 160);
  }
  // the suspenders, and the Bay Lights on them (both faces since 2026, so one line per cable for either side)
  const sus: number[] = [], led: number[] = [], aS: number[] = [], aH: number[] = [], aHm: number[] = [], aC: number[] = [];
  let cable = 0;
  for (const sx of [-1, 1]) for (let s = 8; s < anch[2] - 4; s += 15.24) {
    if (anch.some(z => Math.abs(s - z) < 14) || towers.some(z => Math.abs(s - z) < 5)) continue;
    const top = cableY(s), bot = DECK; if (top - bot < 1.5) continue;
    const A = K.W(s, sx * CW, bot), B = K.W(s, sx * CW, top - 0.3), C = K.W(s, sx * (CW + 0.25), bot + 0.4), D = K.W(s, sx * (CW + 0.25), top - 0.4);
    sus.push(A.x, A.y, A.z, B.x, B.y, B.z);
    led.push(C.x, C.y, C.z, D.x, D.y, D.z); aS.push(s, s); aH.push(0, 1); aHm.push(0, top - bot); aC.push(cable, cable); cable++;
    // its reflection: every third cable, on the north face (the city side) and the south
    if (cable % 3 === 0) { const p = west.at(s); glints.push({ x: p.x + sx * CW * p.uy, y: p.y - sx * CW * p.ux, h: (top + bot) / 2, color: 0xeef2ff, i: 0.5, w: 2.5, s }); }
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sus, 3));
  const susMat = new THREE.LineBasicMaterial({ color: 0x8d9499 }); nightDim.push(susMat); const susLines = new THREE.LineSegments(sg, susMat); parent.add(susLines);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(led, 3));
  lg.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1)); lg.setAttribute('aH', new THREE.Float32BufferAttribute(aH, 1));
  lg.setAttribute('aHm', new THREE.Float32BufferAttribute(aHm, 1)); lg.setAttribute('aC', new THREE.Float32BufferAttribute(aC, 1));
  const bayLights = new THREE.LineSegments(lg, bayLightsMaterial()); bayLights.renderOrder = 4; bayLights.frustumCulled = false; bayLights.visible = false;
  parent.add(bayLights); nightOnly.push(bayLights);
  // the steel suspenders vanish into the dark once the lights are on (and the lights take their place)
  dayOnly.push(susLines);
  // roadway lamps along the upper deck, and red aviation lights on the towers and the central anchorage
  const lamps: number[] = [], red: number[] = [];
  for (let s = 20; s < sEnd; s += 50) for (const sx of [-1, 1]) { const p = K.W(s, sx * (CW - 1), DECK + 9); lamps.push(p.x, p.y, p.z); if (s % 150 < 50 && sx > 0) { const q = west.at(s); glints.push({ x: q.x, y: q.y, h: DECK + 9, color: 0xffd9a8, i: 0.35, w: 3 }); } }
  for (const z of towers) for (const sx of [-1, 1]) { const p = K.W(z, sx * CW, TOP + 1.5); red.push(p.x, p.y, p.z); }
  K.build(parent);

  /* ---------- the SF approach ---------- */
  // on west from the Rincon Hill anchorage over SoMa (bearing about 240°), coming down at about 4% to the ground
  // near Fifth Street, on concrete bents every 40 m
  {
    const brg = 240 * Math.PI / 180, end = { x: a.x + Math.sin(brg) * 1600, y: a.y + Math.cos(brg) * 1600 }, AK = new Kit(new Path([a, end]));
    const g = (s: number) => { const p = AK.path.at(s); return Math.max(0, groundAt(p.x, p.y)); }, yAt = (s: number) => DECK - 0.04 * s;
    let L = 0;
    for (; L < 1600; L += 40) { const top = yAt(L) - DEPTH, g0 = g(L); if (top - g0 < 3) break; if (L > 0) AK.box(CONC, 18, top - g0, 3, L, 0, (top + g0) / 2); }
    AK.sweep(STEEL, 0, L, 0, 2 * CW, s => yAt(s) - DEPTH, s => yAt(s) - 0.4, 40, 'blr');
    AK.sweep(ROAD, 0, L, 0, 2 * CW, s => yAt(s) - 0.4, yAt, 40, 't');
    AK.build(parent);
    BAY_APPROACH.push([a, AK.path.at(L)]);
  }

  /* ---------- the East Span ---------- */
  {
    // the tunnel (Wikipedia, "Yerba Buena Tunnel": 160 m long, centred at 37.8094 N, 122.3656 W) → its east portal
    const tc0 = LL(37.8094, -122.3656), ux = (tc0.x - b.x), uy = (tc0.y - b.y), n = Math.hypot(ux, uy);
    const portal = { x: tc0.x + ux / n * 80, y: tc0.y + uy / n * 80 };
    // the deck's line from OpenStreetMap (I-80 westbound, way 236348361, the north deck: bending from the SAS onto the
    // Skyway's straight run to the Oakland touchdown on the mole), moved 24 m south onto the middle between the two decks
    const mid = (lat: number, lon: number) => LL(lat - 0.000217, lon + 0.0000483);
    const east = new Path([portal, mid(37.81737, -122.35522), mid(37.81864, -122.35234), mid(37.81919, -122.34980), mid(37.82219, -122.32776)]), E = new Kit(east), eLen = east.len;
    const eg = (s: number, dx = 0) => { const p = east.at(s); return Math.max(0, groundAt(p.x + dx * p.uy, p.y - dx * p.ux)); };
    // the tower (T1) where OSM has it (way 237735191, 160 m: 37.81527 N, 122.35848 W), 180 m from the SAS's west pier W2
    // on the island's shore and 385 m (the main span) from E2 (Wikipedia, "Eastern span replacement of the San
    // Francisco–Oakland Bay Bridge")
    const tw = LL(37.81527, -122.35848);
    let T1 = 0; for (let s = 0, best = Infinity; s < 1500; s += 2) { const q = east.at(s), d = Math.hypot(q.x - tw.x, q.y - tw.y); if (d < best) { best = d; T1 = s; } }
    const W2 = T1 - 180, E2 = T1 + 385, SAS = 62, OAK = 9, HALF = 24.5, DW = 27, GIRDER = 5.5;
    // the deck's height: from the tunnel (about 75 m) down to the SAS, level over it, then the Skyway's long fall
    const yD = (s: number) => s < W2 ? 75 + (SAS - 75) * Math.min(1, s / W2) : s < E2 ? SAS : SAS + (OAK - SAS) * Math.pow(Math.min(1, (s - E2) / (eLen - E2)), 1.25);
    for (const sx of [-1, 1]) {
      E.sweep(CONC, 0, W2, sx * HALF, DW, s => yD(s) - GIRDER, s => yD(s) - 0.4, 20, 'blr');
      E.sweep(WHITE, W2, E2, sx * HALF, DW, s => yD(s) - GIRDER, s => yD(s) - 0.4, 20, 'blr');
      E.sweep(CONC, E2, eLen, sx * HALF, DW, s => yD(s) - GIRDER, s => yD(s) - 0.4, 30, 'blr');
      E.sweep(ROAD, 0, eLen, sx * HALF, DW, s => yD(s) - 0.4, yD, 30, 't');
    }
    // piers: on the island every 45 m where the deck is clear of the ground; the SAS's W2 and E2; the Skyway's paired
    // piers every 160 m
    const pier = (s: number, w: number) => { for (const sx of [-1, 1]) { const g0 = eg(s, sx * HALF), top = yD(s) - GIRDER; if (top - g0 > 2) E.box(CONC, w, top - g0, 5, s, sx * HALF, (top + g0) / 2); } };
    for (let s = 40; s < W2; s += 45) pier(s, 10);
    pier(W2, 22); pier(E2, 22);
    for (let s = E2 + 160; s < eLen - 20; s += 160) pier(s, 9);
    // the tower: four legs, tapering, tied by shear-link beams, between the two decks
    E.box(CONC, 30, 10, 30, T1, 0, 3);
    for (const [ix, iz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const g = frustum(5.5, 5.5, ix * 4.2, 3.6, 3.6, ix * 2.6, TOP - 8); g.translate(0, 0, iz * 4.2); E.put(WHITE, g, T1, 0, 8);
    }
    // the shear links: short beams between the legs, across and along, every 14 m up
    for (let y = 30; y < TOP - 4; y += 14) { const x = 4.2 - 1.6 * (y - 8) / (TOP - 8); for (const k of [-1, 1]) { E.box(WHITE, 2 * x, 1.6, 0.8, T1 + k * 4.2, 0, y); E.box(WHITE, 0.8, 1.6, 8.4, T1, k * x, y); } }
    E.box(WHITE, 12, 3, 12, T1, 0, TOP - 1);
    // the cable: from the outer edges of the decks at the ends up over the tower top (an A in section), looped round
    // the west end; suspenders every 10 m from it to the decks' outer edges
    const OUT = HALF + DW / 2, cabX = (s: number) => { const f = s < T1 ? (T1 - s) / (T1 - W2) : (s - T1) / (E2 - T1); return 2.6 + (OUT - 2.6) * Math.min(1, f) ** 0.8; };
    const cabY = (s: number) => { const f = s < T1 ? (T1 - s) / (T1 - W2) : (s - T1) / (E2 - T1); return SAS + 1.5 + (TOP - 2 - SAS - 1.5) * (1 - Math.min(1, f)) ** 1.9; };
    const esus: number[] = [];
    for (const sx of [-1, 1]) {
      const pts: [number, number, number][] = [];
      for (let i = 0; i <= 60; i++) { const s = W2 + (E2 - W2) * i / 60; pts.push([s, sx * cabX(s), cabY(s)]); }
      E.tube(WHITE, pts, 0.39, 140);
      for (let s = W2 + 10; s < E2 - 5; s += 10) { if (Math.abs(s - T1) < 6) continue; const A = E.W(s, sx * cabX(s), cabY(s)), B = E.W(s, sx * OUT, SAS); esus.push(A.x, A.y, A.z, B.x, B.y, B.z); }
    }
    { const pts: [number, number, number][] = []; for (let i = 0; i <= 12; i++) { const t = i / 12 * Math.PI; pts.push([W2 - 6 * Math.sin(t), -OUT * Math.cos(t), SAS + 1.5]); } E.tube(WHITE, pts, 0.39, 24); } // round the west end
    const eg2 = new THREE.BufferGeometry(); eg2.setAttribute('position', new THREE.Float32BufferAttribute(esus, 3));
    const eMat = new THREE.LineBasicMaterial({ color: 0xc9cccb }); nightDim.push(eMat); parent.add(new THREE.LineSegments(eg2, eMat));
    // the Skyway's lamps (white LEDs) along both decks' outer edges, and the tower's aviation lights
    for (let s = 30; s < eLen; s += 55) for (const sx of [-1, 1]) { const p = E.W(s, sx * (OUT - 1), yD(s) + 8); lamps.push(p.x, p.y, p.z); if (sx > 0 && Math.round(s / 55) % 3 === 0) { const q = east.at(s); glints.push({ x: q.x, y: q.y, h: yD(s) + 8, color: 0xf2f4ff, i: 0.3, w: 3 }); } }
    for (const sx of [-1, 1]) { const p = E.W(T1, sx * 3, TOP + 1.5); red.push(p.x, p.y, p.z); }
    E.build(parent);
  }

  const pts = (arr: number[], color: number, size: number) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, fog: false })); p.visible = false; parent.add(p); duskLights.push(p);
  };
  pts(lamps, 0xffe2b8, 1.6); pts(red, 0xff2a1a, 3.2);
  parent.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return glints;
}
