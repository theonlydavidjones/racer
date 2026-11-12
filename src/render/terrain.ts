import './three-setup';
import * as THREE from 'three';
import terrainPng from './data/terrain.png?inline';
import meta from './data/terrain.json';
import { LL } from '../geo/geo';
import { limePointBox, limePointLand, onGround } from '../geo/shore';
import { chartCoast } from './shoreFit';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { inBasin } from '../geo/marina';

/**
 * The land around the race area from real elevation data (scripts/fetch-terrain.mjs: USGS-derived open terrain
 * tiles, 50 m grid): the Presidio and the city's hills, the Marin Headlands and Mt Tamalpais, Angel Island and
 * Alcatraz. Along the San Francisco shore, where the boats sail, the land follows the sim's own coastline (the
 * one boats run aground on); elsewhere it follows the elevation data. Coloured by what's there (city, the
 * Presidio's woods, grassland, chaparral, beach and rock), and by season: the grass is gold from late spring
 * to the first rains, green through winter.
 */

export interface Terrain {
  /** Height of the land (m) at a point in course coordinates; ≤ 0 over water. */
  heightAt(x: number, y: number): number;
  /** The land, in tiles. */
  mesh: THREE.Group;
  /** Warm points where the city is, lit at dusk. */
  lights: THREE.Points;
  /** Recolour for the season (month 1–12). */
  setSeason(month: number): void;
  /** Is the land at a point (course coordinates) wooded? (For planting trees.) */
  wooded(x: number, y: number): boolean;
}

const M = meta as { south: number; north: number; west: number; east: number; nx: number; ny: number; scale: number };

async function loadHeights(): Promise<Float32Array> {
  const img = new Image(); img.src = terrainPng; await img.decode();
  const cv = document.createElement('canvas'); cv.width = M.nx; cv.height = M.ny;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, M.nx, M.ny).data, h = new Float32Array(M.nx * M.ny);
  for (let i = 0; i < h.length; i++) { const g = d[i * 4]; h[i] = g === 0 ? -1 : (g - 1) * M.scale; }
  return h;
}

/** Simple deterministic noise for colour variation. */
const hash = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };

export type Region = 'city' | 'woods' | 'grass' | 'suburb' | 'rock' | 'island' | 'port';

/** The Port of Oakland's terminals and the old Naval Air Station at Alameda Point: flat paved fill, no houses. */
export const onPort = (lat: number, lon: number): boolean => {
  // how far inside the terminals' outline (deg, about 0.001 = 100 m), less a ragged margin so its edge isn't a ruler line
  const inside = (s: number, n: number, w: number, e: number) => Math.min(lat - s, n - lat, (lon - w) * 0.79, (e - lon) * 0.79);
  const d = Math.max(inside(37.793, 37.8195, -122.335, -122.296), inside(37.7695, 37.7955, -122.3295, -122.3)); // the Outer and Middle Harbor terminals and the old Army base; Alameda Point's runways, hangars and piers
  return d > 0.0018 * hash(Math.round(lat * 2000), Math.round(lon * 2000));
};

/** Angel Island's cells in the elevation grid (found by flooding the land out from Mount Livermore), once loaded. */
let ANGEL: Uint8Array | null = null;
/** Is this point on Angel Island? */
export function onAngel(lat: number, lon: number): boolean {
  if (!ANGEL) return false;
  const i = Math.round((lon - M.west) / (M.east - M.west) * (M.nx - 1)), j = Math.round((M.north - lat) / (M.north - M.south) * (M.ny - 1));
  return i >= 0 && j >= 0 && i < M.nx && j < M.ny && ANGEL[j * M.nx + i] === 1;
}

export function region(lat: number, lon: number, h: number): Region {
  if (onAngel(lat, lon)) return 'island'; // Angel Island: a state park, woods and grass, no town
  if (lat > 37.804 && lat < 37.8155 && lon > -122.3745 && lon < -122.357) return 'woods'; // Yerba Buena Island: wooded, a few Navy houses
  if (lat > 37.8155 && lat < 37.8335 && lon > -122.381 && lon < -122.358) return 'city'; // Treasure Island: flat, built over (the old Navy base and the new blocks)
  if (lat > 37.8235 && lat < 37.8295 && lon > -122.4265 && lon < -122.418) return 'rock'; // Alcatraz
  if (lat > 37.926 && lat < 37.9315 && lon > -122.4335 && lon < -122.4285) return 'rock'; // Red Rock: a steep rock island, scrub on top
  if (lat > 37.961 && lat < 37.965 && lon > -122.437 && lon < -122.432) return 'rock'; // the Brothers
  if (lat > 37.892 && lat < 37.903 && lon > -122.375 && lon < -122.349) return 'grass'; // Brooks Island: a regional preserve, no houses
  if (lon > -122.345) {
    // the East Bay, from Alameda and Oakland to Berkeley, Richmond and San Pablo: the flatlands built over to the foot of the hills;
    // the Berkeley and Oakland hills above about 120 m grassland (gold in summer), darker with oak, bay and eucalyptus on
    // the north-facing slopes and in the canyons (Tilden, Claremont Canyon, Redwood Regional Park: the grass's scrub shading)
    if (onPort(lat, lon) && h < 20) return 'port';
    if (h > 120) return 'grass';
    return h > 70 ? 'suburb' : 'city';
  }
  if (lat > 37.885 && lon > -122.445) return h > 45 ? 'grass' : 'city'; // Richmond: Point Richmond, the refinery, the harbor; the Potrero Hills and Point San Pablo's ridge grass
  if (lat > 37.787 && lat < 37.811 && lon > -122.486 && lon < -122.447) return 'woods'; // the Presidio
  if (lat > 37.8013 && lat < 37.8034 && lon > -122.4074 && lon < -122.4043) return 'woods'; // Pioneer Park, round Coit Tower
  if (lat > 37.764 && lat < 37.7745 && lon > -122.511 && lon < -122.454) return 'woods'; // Golden Gate Park
  if (lat < 37.812 && lon > -122.515) return lon > -122.4545 && lat < 37.7755 && h > 150 ? 'grass' : 'city'; // San Francisco (Twin Peaks grassy on top)
  if (lat > 37.845 && h < 90 && lon > (lat > 37.88 ? -122.58 : -122.51)) return 'suburb'; // Sausalito, Tiburon, Belvedere, Mill Valley; Corte Madera, Larkspur, San Rafael
  return 'grass';
}

/** A polygon clipped to a box (Sutherland–Hodgman: the box is convex). */
function clipToBox(pts: { x: number; y: number }[], x0: number, x1: number, y0: number, y1: number): { x: number; y: number }[] {
  let out = pts;
  const edges: [(p: { x: number; y: number }) => boolean, (a: { x: number; y: number }, b: { x: number; y: number }) => { x: number; y: number }][] = [
    [p => p.x >= x0, (a, b) => ({ x: x0, y: a.y + (b.y - a.y) * (x0 - a.x) / (b.x - a.x) })],
    [p => p.x <= x1, (a, b) => ({ x: x1, y: a.y + (b.y - a.y) * (x1 - a.x) / (b.x - a.x) })],
    [p => p.y >= y0, (a, b) => ({ x: a.x + (b.x - a.x) * (y0 - a.y) / (b.y - a.y), y: y0 })],
    [p => p.y <= y1, (a, b) => ({ x: a.x + (b.x - a.x) * (y1 - a.y) / (b.y - a.y), y: y1 })]
  ];
  for (const [inside, cut] of edges) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
    }
  }
  return out;
}

export async function buildTerrain(scene: THREE.Scene, month: number): Promise<Terrain> {
  const H = await loadHeights(), { nx, ny } = M;
  // Angel Island: flood the land out from Mount Livermore's summit (37.8608 N 122.4324 W)
  {
    const A = new Uint8Array(nx * ny), i0 = Math.round((-122.4324 - M.west) / (M.east - M.west) * (nx - 1)), j0 = Math.round((M.north - 37.8608) / (M.north - M.south) * (ny - 1));
    const stack = [j0 * nx + i0];
    while (stack.length) {
      const k = stack.pop()!; if (A[k] || H[k] <= 0) continue; A[k] = 1;
      const i = k % nx, j = (k - i) / nx;
      if (i > 0) stack.push(k - 1); if (i < nx - 1) stack.push(k + 1); if (j > 0) stack.push(k - nx); if (j < ny - 1) stack.push(k + nx);
    }
    let n = 0; for (const v of A) n += v;
    ANGEL = n > 100 && n < 3000 ? A : null; // about 1,200 cells (3 km²); anything else means the flood leaked: leave it unlabelled
  }
  const corner = LL(M.north, M.west), far = LL(M.south, M.east);
  const dx = (far.x - corner.x) / (nx - 1), dy = (far.y - corner.y) / (ny - 1); // dy < 0: rows run south
  // fit the San Francisco shore to the sim's coastline
  // (only near that shore: the sim's land polygon is cut off straight to the south, west and east, inland)
  const cityShore = (lat: number, lon: number) => lat < 37.8135 && lat > 37.7925 && lon > -122.4775 && lon < -122.4015;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const lat = M.north - (M.north - M.south) * j / (ny - 1), lon = M.west + (M.east - M.west) * i / (nx - 1);
    if (!cityShore(lat, lon)) continue;
    const k = j * nx + i, p = { x: corner.x + i * dx, y: corner.y + j * dy };
    H[k] = onGround(p) ? Math.max(H[k], 2.5) : -30; // (the Wharf's open piers and docks are drawn as structures: render/wharf.ts)
  }
  // and Lime Point's to OpenStreetMap's coastline (geo/shore.ts), so the north tower's base and the light stand at its edge
  {
    const b = limePointBox();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, p = { x: corner.x + i * dx, y: corner.y + j * dy };
      if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) continue;
      H[k] = onGround(p) ? Math.max(H[k], 2.5) : -30;
    }
    // and, for what's finer than the 50 m mesh, the point's own outline as a low rock bench under the hills: the neck
    // behind the north tower's base and the spit the Lime Point light stands on (only there, clipped to a box round them)
    const T = LL(37.8275, -122.4800), U = LL(37.8252, -122.4776);
    const bench = clipToBox(limePointLand(), Math.min(T.x, U.x), Math.max(T.x, U.x), Math.min(T.y, U.y), Math.max(T.y, U.y));
    if (bench.length > 2) {
      const sh = new THREE.Shape(); bench.forEach((q, i) => i ? sh.lineTo(q.x, q.y) : sh.moveTo(q.x, q.y));
      const g = new THREE.ExtrudeGeometry(sh, { depth: 3.5, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, -2, 0); // (top 1.5 m up)
      scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x8b7f6d }))); // (the palette's rock)
    }
  }
  // the rest of the shore fitted to NOAA's charted coast (render/shoreFit.ts; within Lime Point's box, OpenStreetMap's):
  // near the coast, a sample is land where the chart has land; the 50 m cells the coast runs through are redrawn below
  // at 12.5 m (the shore patches), with the samples either side of the shore moved onto it, so the waterline follows the
  // charted coast and the hills rise from it (the Cityfront, fitted above, is left as it is)
  const coast = chartCoast(), lpb = limePointBox(), cell = Math.hypot(dx, dy) / Math.SQRT2;
  const inLP = (x: number, y: number) => x >= lpb.x0 && x <= lpb.x1 && y >= lpb.y0 && y <= lpb.y1;
  // Lime Point's coast: its outline's edges, less the box's own sides
  const lpl = limePointLand(), lpEdges: [number, number, number, number][] = [];
  for (let k = 0; k < lpl.length; k++) {
    const a = lpl[k], c = lpl[(k + 1) % lpl.length], on = (v: number, w: number) => Math.abs(v - w) < 0.5;
    if ((on(a.x, lpb.x0) && on(c.x, lpb.x0)) || (on(a.x, lpb.x1) && on(c.x, lpb.x1)) || (on(a.y, lpb.y0) && on(c.y, lpb.y0)) || (on(a.y, lpb.y1) && on(c.y, lpb.y1))) continue;
    lpEdges.push([a.x, a.y, c.x, c.y]);
  }
  const nearestLP = (x: number, y: number, max: number) => {
    let best: { x: number; y: number; d: number } | null = null;
    for (const [ax, ay, bx, by] of lpEdges) {
      const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
      const qx = ax + vx * t, qy = ay + vy * t, d = Math.hypot(x - qx, y - qy);
      if (d <= max && (!best || d < best.d)) best = { x: qx, y: qy, d };
    }
    return best;
  };
  const isLand = (x: number, y: number) => inBasin({ x, y }) ? false : inLP(x, y) ? onGround({ x, y }) : coast.inside(x, y);
  const nearCoast = (x: number, y: number, max: number) => inLP(x, y) ? nearestLP(x, y, max) : coast.nearest(x, y, max);
  const latOf = (j: number) => M.north - (M.north - M.south) * j / (ny - 1), lonOf = (i: number) => M.west + (M.east - M.west) * i / (nx - 1);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = corner.x + i * dx, y = corner.y + j * dy;
    if (cityShore(latOf(j), lonOf(i)) || inLP(x, y)) continue; // (fitted above)
    if (!coast.nearest(x, y, 4 * cell)) continue; // (only near the coast: the height data's own shore can be 100 m out)
    H[k] = coast.inside(x, y) ? Math.max(H[k], 2.5) : Math.min(H[k], -30);
  }
  // the cells the coast runs through (its nearest point within the cell's circle), outside the Cityfront
  const shoreCell = new Uint8Array((nx - 1) * (ny - 1));
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (cityShore(latOf(j), lonOf(i)) || cityShore(latOf(j + 1), lonOf(i + 1)) || cityShore(latOf(j), lonOf(i + 1)) || cityShore(latOf(j + 1), lonOf(i))) continue;
    const x = corner.x + (i + 0.5) * dx, y = corner.y + (j + 0.5) * dy;
    if (nearCoast(x, y, 0.75 * cell)) shoreCell[j * (nx - 1) + i] = 1;
  }
  // the chart's rocks and islets too small for the mesh, each in its charted outline, a couple of metres out of the water
  {
    const rk: THREE.BufferGeometry[] = [];
    for (const r of coast.rocks) {
      const sh = new THREE.Shape(); r.forEach((q, i) => i ? sh.lineTo(q.x, q.y) : sh.moveTo(q.x, q.y));
      const g = new THREE.ExtrudeGeometry(sh, { depth: 4, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, -2, 0); rk.push(g);
    }
    if (rk.length) scene.add(new THREE.Mesh(mergeGeometries(rk), new THREE.MeshLambertMaterial({ color: 0x6f675c }))); // (dark wet rock)
  }
  // a marina's basin is water, whatever the 50 m grid says (South Beach and the Corinthian are outside the fitted shore)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (H[k] <= 0) continue;
    if (inBasin({ x: corner.x + i * dx, y: corner.y + j * dy })) H[k] = -2;
  }
  const pos = new Float32Array(nx * ny * 3), col = new Float32Array(nx * ny * 3);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, h = H[k];
    pos[k * 3] = corner.x + i * dx; pos[k * 3 + 1] = h > 0 ? h : Math.min(h, -12); pos[k * 3 + 2] = -(corner.y + j * dy);
  }
  const idx: number[] = [];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if ((H[a] <= 0 && H[b] <= 0 && H[c] <= 0 && H[d] <= 0) || shoreCell[j * (nx - 1) + i]) continue; // open water, or a shore patch's
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  // drawn in tiles of 64 × 64 cells (3.2 km), sharing the one set of vertices, so the land behind the camera and off the
  // sides of the view isn't drawn (the land reaches from the Gate to Oakland and Richmond: about 600,000 triangles)
  const mesh = new THREE.Group(), mat = new THREE.MeshLambertMaterial({ vertexColors: true }), T = 64;
  for (let tj = 0; tj < ny - 1; tj += T) for (let ti = 0; ti < nx - 1; ti += T) {
    const ix: number[] = [], box = new THREE.Box3(), v = new THREE.Vector3();
    for (let j = tj; j < Math.min(ny - 1, tj + T); j++) for (let i = ti; i < Math.min(nx - 1, ti + T); i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      if ((H[a] <= 0 && H[b] <= 0 && H[c] <= 0 && H[d] <= 0) || shoreCell[j * (nx - 1) + i]) continue;
      ix.push(a, c, b, b, c, d);
      for (const k of [a, d]) box.expandByPoint(v.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]));
    }
    if (!ix.length) continue;
    const g = new THREE.BufferGeometry();
    for (const n of ['position', 'color', 'normal']) g.setAttribute(n, geo.attributes[n]);
    g.setIndex(ix); g.boundingBox = box; g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; mesh.add(m);
  }
  geo.setIndex(null);
  scene.add(mesh);
  const nrm = geo.attributes.normal as THREE.BufferAttribute;

  // the shore patches: each 50 m cell the coast runs through, redrawn at 12.5 m. A patch's samples are land where the
  // chart has land, their heights from the 50 m surface (no lower than 1.5 m on land, no higher than 3 m under water),
  // and those either side of the shore are moved onto the coast: the land ones 1.5 m up, the water ones 2 m down, so the
  // waterline runs along the charted coast. Samples on an edge shared with a cell drawn at 50 m keep that cell's surface,
  // so the two meet without a crack.
  const F = 4, fdx = dx / F, fdy = dy / F, FW = (nx - 1) * F + 1, fStep = cell / F;
  const isShore = (i: number, j: number) => i >= 0 && j >= 0 && i < nx - 1 && j < ny - 1 && shoreCell[j * (nx - 1) + i] === 1;
  const fIndex = new Map<number, number>(), fPos: number[] = [], fG: number[] = [], fPinned: number[] = [];
  const disp = (k: number) => pos[k * 3 + 1];
  const vert = (gi: number, gj: number) => {
    const key = gj * FW + gi; let v = fIndex.get(key); if (v !== undefined) return v;
    const i = Math.min(nx - 2, Math.floor(gi / F)), j = Math.min(ny - 2, Math.floor(gj / F)), u = gi / F - i, w = gj / F - j, k = j * nx + i;
    const h0 = (disp(k) * (1 - u) + disp(k + 1) * u) * (1 - w) + (disp(k + nx) * (1 - u) + disp(k + nx + 1) * u) * w;
    const cis = gi % F === 0 ? [gi / F - 1, gi / F] : [Math.floor(gi / F)], cjs = gj % F === 0 ? [gj / F - 1, gj / F] : [Math.floor(gj / F)];
    let pinned = false; for (const a of cis) for (const b of cjs) if (!isShore(a, b)) pinned = true;
    const x = corner.x + gi * fdx, y = corner.y + gj * fdy;
    let h = h0;
    if (!pinned) h = isLand(x, y) ? Math.max(h0, 1.5) : Math.min(h0, -3);
    v = fPos.length / 3; fPos.push(x, h, -y); fG.push(gi, gj); fPinned.push(pinned ? 1 : 0); fIndex.set(key, v);
    return v;
  };
  const fQuads: number[] = [];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (!shoreCell[j * (nx - 1) + i]) continue;
    for (let w = 0; w < F; w++) for (let u = 0; u < F; u++) {
      const gi = i * F + u, gj = j * F + w;
      fQuads.push(vert(gi, gj), vert(gi + 1, gj), vert(gi, gj + 1), vert(gi + 1, gj + 1), i, j);
    }
  }
  {
    // the samples either side of the shore, onto the coast
    const moves: [number, number, number, number][] = [];
    for (let v = 0; v < fPinned.length; v++) {
      if (fPinned[v]) continue;
      const gi = fG[v * 2], gj = fG[v * 2 + 1], land = fPos[v * 3 + 1] > 0;
      let edge = false;
      for (let b = -1; b <= 1 && !edge; b++) for (let a = -1; a <= 1; a++) {
        const o = fIndex.get((gj + b) * FW + gi + a); if (o !== undefined && (fPos[o * 3 + 1] > 0) !== land) { edge = true; break; }
      }
      if (!edge) continue;
      const x = fPos[v * 3], y = -fPos[v * 3 + 2], q = nearCoast(x, y, 1.45 * fStep); // (the coast is within a diagonal of a sample with the other side next to it)
      moves.push([v, q ? q.x : x, q ? q.y : y, land ? 1.5 : -2]);
    }
    for (const [v, x, y, h] of moves) { fPos[v * 3] = x; fPos[v * 3 + 1] = h; fPos[v * 3 + 2] = -y; }
  }
  const fGeo = new THREE.BufferGeometry(), fCol = new Float32Array(fPos.length), fP = new Float32Array(fPos), fGi = new Int32Array(fG), fPin = new Uint8Array(fPinned);
  fGeo.setAttribute('position', new THREE.BufferAttribute(fP, 3));
  fGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3));
  {
    const all: number[] = [], tiles = new Map<number, number[]>();
    for (let q = 0; q < fQuads.length; q += 6) {
      const [a, b, c, d, i, j] = fQuads.slice(q, q + 6);
      if (fPos[a * 3 + 1] <= 0 && fPos[b * 3 + 1] <= 0 && fPos[c * 3 + 1] <= 0 && fPos[d * 3 + 1] <= 0) continue; // (all water)
      const key = Math.floor(j / T) * 1000 + Math.floor(i / T), l = tiles.get(key) ?? [];
      l.push(a, c, b, b, c, d); all.push(a, c, b, b, c, d); tiles.set(key, l);
    }
    fGeo.setIndex(all); fGeo.computeVertexNormals();
    // on the edges a patch shares with the 50 m cells, the 50 m surface's own normals, so the light doesn't step there
    const fn = fGeo.attributes.normal as THREE.BufferAttribute, n3 = new THREE.Vector3();
    for (let v = 0; v < fPinned.length; v++) {
      if (!fPinned[v]) continue;
      const gi = fG[v * 2], gj = fG[v * 2 + 1], i = Math.min(nx - 2, Math.floor(gi / F)), j = Math.min(ny - 2, Math.floor(gj / F)), u = gi / F - i, w = gj / F - j;
      n3.set(0, 0, 0);
      for (const [k, kw] of [[j * nx + i, (1 - u) * (1 - w)], [j * nx + i + 1, u * (1 - w)], [(j + 1) * nx + i, (1 - u) * w], [(j + 1) * nx + i + 1, u * w]] as const)
        n3.x += nrm.getX(k) * kw, n3.y += nrm.getY(k) * kw, n3.z += nrm.getZ(k) * kw;
      n3.normalize(); fn.setXYZ(v, n3.x, n3.y, n3.z);
    }
    for (const ix of tiles.values()) {
      const g = new THREE.BufferGeometry(), box = new THREE.Box3(), v3 = new THREE.Vector3();
      for (const n of ['position', 'color', 'normal']) g.setAttribute(n, fGeo.attributes[n]);
      for (const k of ix) box.expandByPoint(v3.set(fPos[k * 3], fPos[k * 3 + 1], fPos[k * 3 + 2]));
      g.setIndex(ix); g.boundingBox = box; g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; mesh.add(m);
    }
    fGeo.setIndex(null);
  }
  const fNrm = fGeo.attributes.normal as THREE.BufferAttribute;

  const C = (h: string) => new THREE.Color(h);
  const PAL = {
    city: [C('#a9a796'), C('#bdb9a8'), C('#8f8f82'), C('#c6c0ae')], woods: [C('#45603f'), C('#3b5236'), C('#56704a')],
    gold: C('#b89a5c'), green: C('#7d9650'), scrub: C('#5d6b45'), chaparral: C('#5a6343'), sand: C('#cdbd94'), rock: C('#8b7f6d'), stone: C('#8f8d86'), suburb: [C('#a9a493'), C('#6f8458')], paved: [C('#a9a69c'), C('#b4b0a5'), C('#9e9c95')]
  };
  const wood = new Uint8Array(nx * ny);
  const setSeason = (mo: number) => {
    // how golden the grass is: gold from late spring to the first rains (May–Nov), green Dec–Apr
    const gold = [0.15, 0.1, 0.1, 0.3, 0.6, 0.85, 1, 1, 1, 0.95, 0.7, 0.35][(mo - 1 + 12) % 12];
    const grass = PAL.green.clone().lerp(PAL.gold, gold), tmp = new THREE.Color();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, h = H[k]; if (h <= 0) continue;
      const lat = M.north - (M.north - M.south) * j / (ny - 1), lon = M.west + (M.east - M.west) * i / (nx - 1);
      const n = hash(i, j), slope = 1 - nrm.getY(k), northFacing = nrm.getZ(k) < -0.15; // −z is north
      const r = region(lat, lon, h);
      if (r === 'island') {
        // Angel Island (Wikipedia, "Angel Island (California)"): evergreen woodland (coast live oak, bay, madrone,
        // toyon) on the slopes sheltered from the westerlies, facing north and east, and in the gullies; grassland
        // and coastal scrub on the south- and west-facing slopes and the ridge tops; Mount Livermore's summit bare
        const shelter = -nrm.getZ(k) + nrm.getX(k) * 0.8; // north- and east-facing
        wood[k] = h > 6 && h < 215 && (shelter > 0.05 - 0.25 * n || (slope > 0.3 && n > 0.4)) ? 1 : 0;
        if (wood[k]) tmp.copy(PAL.woods[Math.floor(n * 3) % 3]);
        else { tmp.copy(grass).lerp(PAL.scrub, 0.35 + 0.4 * n); tmp.offsetHSL(0, 0, (n - 0.5) * 0.05); }
      } else if (r === 'city') tmp.copy(PAL.city[Math.floor(n * 4) % 4]);
      else if (r === 'woods') { tmp.copy(PAL.woods[Math.floor(n * 3) % 3]); wood[k] = 1; }
      else if (r === 'rock') tmp.copy(PAL.stone).lerp(PAL.scrub, n < 0.5 ? 0.7 : 0.1); // Alcatraz: grey rock and concrete, patches of scrub and garden
      else if (r === 'suburb') tmp.copy(PAL.suburb[0]).lerp(PAL.suburb[1], n);
      else if (r === 'port') tmp.copy(PAL.paved[Math.floor(n * 3) % 3]); // asphalt and concrete yards, container stacks seen from afar
      else {
        // grassland, with scrub on north-facing slopes and in the gullies, chaparral up high on Tamalpais
        tmp.copy(grass);
        if (northFacing || slope > 0.35) tmp.lerp(PAL.scrub, 0.55 + 0.3 * n);
        if (h > 380) tmp.lerp(PAL.chaparral, 0.6);
        tmp.offsetHSL(0, 0, (n - 0.5) * 0.06);
      }
      const shore = H[k - 1] <= 0 || H[k + 1] <= 0 || H[k - nx] <= 0 || H[k + nx] <= 0 || H[k - 2] <= 0 || H[k + 2] <= 0 || H[k - 2 * nx] <= 0 || H[k + 2 * nx] <= 0; // within 100 m of the water
      const patchCorner = isShore(i - 1, j - 1) || isShore(i, j - 1) || isShore(i - 1, j) || isShore(i, j); // (the patches put the sand where the shore is)
      if (h < 5 && shore && !patchCorner && r !== 'city' && r !== 'port') tmp.copy(slope > 0.4 || r === 'rock' ? PAL.rock : PAL.sand); // beaches and rocky shore
      else if (slope > 0.55) tmp.lerp(PAL.rock, 0.6); // cliffs
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
    }
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    // the shore patches: blended from the 50 m cell's land samples, sand or rock along the water's edge
    for (let v = 0; v < fGi.length / 2; v++) {
      const gi = fGi[v * 2], gj = fGi[v * 2 + 1], i = Math.min(nx - 2, Math.floor(gi / F)), j = Math.min(ny - 2, Math.floor(gj / F)), u = gi / F - i, w = gj / F - j;
      let r = 0, g = 0, bl = 0, wt = 0;
      for (const [k, kw] of [[j * nx + i, (1 - u) * (1 - w)], [j * nx + i + 1, u * (1 - w)], [(j + 1) * nx + i, (1 - u) * w], [(j + 1) * nx + i + 1, u * w]] as const) {
        if (H[k] <= 0 || kw <= 0) continue; r += col[k * 3] * kw; g += col[k * 3 + 1] * kw; bl += col[k * 3 + 2] * kw; wt += kw;
      }
      if (wt > 0) tmp.setRGB(r / wt, g / wt, bl / wt); else tmp.copy(PAL.sand);
      const h = fP[v * 3 + 1], lat = M.north - (M.north - M.south) * gj / F / (ny - 1), lon = M.west + (M.east - M.west) * gi / F / (nx - 1), rg = region(lat, lon, Math.max(h, 1));
      if (!fPin[v] && h < 5 && rg !== 'city' && rg !== 'port') tmp.copy(1 - fNrm.getY(v) > 0.4 || rg === 'rock' ? PAL.rock : PAL.sand); // beaches and rocky shore
      fCol[v * 3] = tmp.r; fCol[v * 3 + 1] = tmp.g; fCol[v * 3 + 2] = tmp.b;
    }
    (fGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  };
  setSeason(month);

  // city lights: a scatter of warm points over the city and the towns, for dusk
  const lp: number[] = [];
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    const k = j * nx + i, h = H[k]; if (h <= 0) continue;
    const lat = M.north - (M.north - M.south) * j / (ny - 1), lon = M.west + (M.east - M.west) * i / (nx - 1), r = region(lat, lon, h);
    if ((r === 'city' && hash(j, i) < 0.55) || (r === 'suburb' && hash(j, i) < 0.25)) lp.push(pos[k * 3] + (hash(i, j) - 0.5) * 40, h + 6, pos[k * 3 + 2] + (hash(j + 3, i) - 0.5) * 40);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lights = new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xffd28a, size: 1.6, sizeAttenuation: false, fog: true, transparent: true, opacity: 0.85 }));
  lights.visible = false; scene.add(lights);

  const heightAt = (x: number, y: number) => {
    const fi = (x - corner.x) / dx, fj = (y - corner.y) / dy, i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= ny - 1) return -1;
    const u = fi - i, v = fj - j, at = (a: number, b: number) => Math.max(0, H[b * nx + a]);
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  };
  const wooded = (x: number, y: number) => {
    const i = Math.round((x - corner.x) / dx), j = Math.round((y - corner.y) / dy);
    return i >= 0 && j >= 0 && i < nx && j < ny && wood[j * nx + i] === 1;
  };
  return { heightAt, mesh, lights, setSeason, wooded };
}
