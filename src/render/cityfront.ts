import './three-setup';
import * as THREE from 'three';
import data from './data/cityfront.json';
import { litWindows } from './night';

/**
 * The city front's buildings, phase 1: Fort Point to the Marina's east end (Laguna Street), each on its real footprint from
 * OpenStreetMap (© OpenStreetMap contributors, ODbL) at its mapped height, standing on the USGS 3DEP 1 m DEM's ground
 * (scripts/make-cityfront.mjs: the numbers, and which heights are OSM's, which come from the levels, which are a default by
 * type). They replace the grid of random boxes there. A flat roof and plain walls: massing only; the landmarks are drawn
 * by hand in landscape.ts. Built into tiles 1 km on a side (one mesh each, so the tiles behind the camera aren't drawn).
 */
export const CITYFRONT_STRIP = data.strip;

/** Is a point (degrees) inside the strip the real footprints cover, where the random boxes are left out? */
export const inCityFront = (lat: number, lon: number): boolean => lat >= CITYFRONT_STRIP.s && lat <= CITYFRONT_STRIP.n && lon >= CITYFRONT_STRIP.w && lon <= CITYFRONT_STRIP.e;

async function inflate(b64: string): Promise<Uint8Array> {
  const bin = atob(b64), src = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) src[i] = bin.charCodeAt(i);
  return new Uint8Array(await new Response(new Blob([src]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
}

interface Building { id: number; g: number; h: number; flag: number; xy: number[] }

export async function buildCityFront(scene: THREE.Object3D): Promise<THREE.Group> {
  const raw = await inflate(data.mesh), dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength), list: Building[] = [];
  for (let o = 0; o < raw.length;) {
    const n = dv.getUint16(o, true), g = dv.getInt16(o + 2, true) / 100, h = dv.getUint16(o + 4, true) / 10, flag = raw[o + 6];
    let x = dv.getInt32(o + 7, true), y = dv.getInt32(o + 11, true); o += 15;
    const xy = [x / 10, y / 10];
    for (let i = 1; i < n; i++) { x += dv.getInt16(o, true); y += dv.getInt16(o + 2, true); o += 4; xy.push(x / 10, y / 10); }
    list.push({ id: list.length, g, h, flag, xy });
  }
  const walls = [new THREE.Color('#e6e0d2'), new THREE.Color('#d9d2c2'), new THREE.Color('#ece5d6'), new THREE.Color('#cfcbc0'), new THREE.Color('#e2d6bf'), new THREE.Color('#d6d8d5'), new THREE.Color('#e9ddd0')];
  const roofs = [new THREE.Color('#7d7770'), new THREE.Color('#6f6a64'), new THREE.Color('#8a8279'), new THREE.Color('#5f5b57'), new THREE.Color('#8f6a58')];
  const hash = (i: number) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  // one geometry per tile and per kind of lighting (homes, and offices over 24 m: night.ts)
  type Acc = { pos: number[]; nrm: number[]; col: number[] };
  const tiles = new Map<string, Acc>(), acc = (tx: number, tz: number, office: boolean) => { const k = `${tx},${tz},${office ? 1 : 0}`; let a = tiles.get(k); if (!a) tiles.set(k, a = { pos: [], nrm: [], col: [] }); return a; };
  const wc = new THREE.Color(), rc = new THREE.Color();
  for (const b of list) {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < b.xy.length; i += 2) pts.push(new THREE.Vector2(b.xy[i], b.xy[i + 1]));
    let area = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) area += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
    if (area < 0) pts.reverse(); // (counter-clockwise from above: walls face out)
    const a = acc(Math.floor(pts[0].x / 1000), Math.floor(pts[0].y / 1000), b.h > 24);
    wc.copy(walls[Math.floor(hash(b.id) * walls.length)]).offsetHSL(0, 0, (hash(b.id + 91) - 0.5) * 0.05); rc.copy(roofs[Math.floor(hash(b.id + 7) * roofs.length)]);
    const y0 = b.g - 2.5, y1 = b.g + b.h;
    const push = (arr: number[], ...v: number[]) => arr.push(...v);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length], ex = q.x - p.x, ey = q.y - p.y, len = Math.hypot(ex, ey) || 1, nx = ey / len, nz = ex / len; // (outward: sim (ey, −ex); three z = −y)
      // sim (x, y) → three (x, up, −y); the quad a-bottom, b-bottom, b-top, a-top
      for (const [px, py, pz] of [[p.x, y0, -p.y], [q.x, y0, -q.y], [q.x, y1, -q.y], [p.x, y0, -p.y], [q.x, y1, -q.y], [p.x, y1, -p.y]]) { push(a.pos, px, py, pz); push(a.nrm, nx, 0, nz); push(a.col, wc.r, wc.g, wc.b); }
    }
    for (const [i0, i1, i2] of THREE.ShapeUtils.triangulateShape(pts, [])) {
      const t = [pts[i0], pts[i1], pts[i2]];
      if ((t[1].x - t[0].x) * (t[2].y - t[0].y) - (t[1].y - t[0].y) * (t[2].x - t[0].x) < 0) t.reverse(); // (counter-clockwise from above, so the roof faces up)
      for (const p of t) { push(a.pos, p.x, y1, -p.y); push(a.nrm, 0, 1, 0); push(a.col, rc.r, rc.g, rc.b); }
    }
  }
  const homes = new THREE.MeshLambertMaterial({ vertexColors: true }), offices = new THREE.MeshLambertMaterial({ vertexColors: true });
  litWindows(homes, { kind: 'home', glow: 1.1 }); litWindows(offices, { kind: 'office', glow: 1.1 });
  const grp = new THREE.Group();
  for (const [k, a] of tiles) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(a.nrm, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(a.col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, k.endsWith(',1') ? offices : homes); m.matrixAutoUpdate = false; grp.add(m);
  }
  scene.add(grp);
  return grp;
}
