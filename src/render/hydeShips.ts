import './three-setup';
import * as THREE from 'three';
import { LL } from '../geo/geo';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import data from './data/hyde-ships.json';

/**
 * The historic ships at Hyde Street Pier (San Francisco Maritime National Historical Park): Balclutha, C.A. Thayer,
 * Eureka, Hercules, Eppleton Hall and Alma. Each hull is its real outline from OpenStreetMap (scripts/make-hyde-ships.mjs;
 * © OpenStreetMap contributors): the outlines measure within 3% of NPS's lengths and beams (nps.gov/safr: Balclutha
 * 256.5 × 38.65 ft, Hercules 151 × 26, Eureka 299.5 × 78, Thayer 219 ft overall and 156 on deck, Alma 59 registered), and
 * give each ship its berth. OSM notes that all but Alma are "moved to Mare Island/Vallejo while Hyde Street Pier is being
 * rebuilt": the berths are where they lay before. The bow is the narrower end of the outline, which is a guess for a berth.
 * Freeboard, masts, yards, stacks and houses are massing from the ships' general arrangement and ESTIMATES (no measured
 * dimensions found yet: the HAER drawings at LoC, CA-54 and CA-60 to 63, give them). Merged into one draw a material.
 */
interface Spec { freeboard: number; hull: number; masts?: { f: number; h: number; yards?: number }[]; stack?: { f: number; h: number; r: number }; house?: { f0: number; f1: number; h: number; w: number; color: number }; bowsprit?: number; paddle?: boolean; upper?: number }
const SPECS: Record<string, Spec> = {
  // f is the fraction of the length aft of the bow; heights in metres above the deck (estimates)
  'Balclutha': { freeboard: 3, hull: 0x24282a, masts: [{ f: 0.27, h: 40, yards: 4 }, { f: 0.5, h: 44, yards: 4 }, { f: 0.72, h: 36, yards: 3 }], bowsprit: 14, house: { f0: 0.8, f1: 0.9, h: 2.6, w: 5, color: 0xe8e2d4 } },
  'C. A. Thayer': { freeboard: 2.4, hull: 0x394943, masts: [{ f: 0.3, h: 27 }, { f: 0.52, h: 28 }, { f: 0.74, h: 27 }], bowsprit: 9, house: { f0: 0.8, f1: 0.88, h: 2.2, w: 3.6, color: 0xe3ddcc } },
  'Eureka': { freeboard: 3.2, hull: 0x2b2d30, upper: 7, stack: { f: 0.5, h: 14, r: 1.6 }, paddle: true, house: { f0: 0.22, f1: 0.78, h: 7, w: 0.55, color: 0xf0ede4 } },
  'Hercules': { freeboard: 2.2, hull: 0x23262a, stack: { f: 0.52, h: 9, r: 1.1 }, masts: [{ f: 0.22, h: 11 }], house: { f0: 0.3, f1: 0.62, h: 3.4, w: 0.7, color: 0xece7da } },
  'Eppleton Hall': { freeboard: 1.8, hull: 0x2a2d30, stack: { f: 0.5, h: 8, r: 0.9 }, paddle: true, house: { f0: 0.3, f1: 0.6, h: 2.8, w: 0.5, color: 0xe6e0d2 } },
  'Alma': { freeboard: 1.1, hull: 0x5a4a38, masts: [{ f: 0.3, h: 13 }, { f: 0.7, h: 12 }], house: { f0: 0.78, f1: 0.9, h: 1.6, w: 3, color: 0xcfc7b4 } },
};

export function addHydeShips(grp: THREE.Group): void {
  const mats = new Map<number, THREE.MeshLambertMaterial>(), geos = new Map<number, THREE.BufferGeometry[]>();
  const add = (g: THREE.BufferGeometry, color: number, m: THREE.Matrix4) => {
    if (!mats.has(color)) { mats.set(color, new THREE.MeshLambertMaterial({ color })); geos.set(color, []); }
    g.applyMatrix4(m); geos.get(color)!.push(g.index ? g.toNonIndexed() : g);
  };
  const MASTC = 0x6b5a45, DARK = 0x2a2c2f, YARD = 0x7a6a52;
  for (const sh of data.ships) {
    const sp = SPECS[sh.name]; if (!sp) continue;
    const pts = sh.ring.map(([la, lo]) => { const p = LL(la, lo); return new THREE.Vector2(p.x, p.y); });
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector2()).multiplyScalar(1 / pts.length);
    // the long axis: the heading of the smallest rectangle round the outline (to 2°)
    let best = { area: Infinity, a: 0 };
    for (let d = 0; d < 180; d += 2) {
      const a = d * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a); let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const p of pts) { const u = (p.x - c.x) * ca + (p.y - c.y) * sa, v = -(p.x - c.x) * sa + (p.y - c.y) * ca; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      if ((u1 - u0) * (v1 - v0) < best.area) best = { area: (u1 - u0) * (v1 - v0), a };
    }
    let ang = best.a; // (angle of the rectangle's first axis from east); the ship lies along the longer side
    {
      const ca = Math.cos(ang), sa = Math.sin(ang); let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const p of pts) { const u = (p.x - c.x) * ca + (p.y - c.y) * sa, v = -(p.x - c.x) * sa + (p.y - c.y) * ca; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      if (u1 - u0 < v1 - v0) ang += Math.PI / 2;
    }
    // bow: the end where the outline is narrower (its width, in the end tenth, along the axis)
    const along = (p: THREE.Vector2, a: number) => (p.x - c.x) * Math.cos(a) + (p.y - c.y) * Math.sin(a), across = (p: THREE.Vector2, a: number) => -(p.x - c.x) * Math.sin(a) + (p.y - c.y) * Math.cos(a);
    const us = pts.map(p => along(p, ang)), L = Math.max(...us) - Math.min(...us), uMin = Math.min(...us), uMax = Math.max(...us);
    const width = (lo: number, hi: number) => { const vs = pts.filter((_, i) => us[i] >= lo && us[i] <= hi).map(p => across(p, ang)); return vs.length > 1 ? Math.max(...vs) - Math.min(...vs) : 0; };
    if (width(uMax - 0.2 * L, uMax) > width(uMin, uMin + 0.2 * L)) ang += Math.PI; // (the +u end is wider: that is the stern, so the bow is the other way)
    // the bow's compass bearing: the axis (east = 0, counter-clockwise) → bearing from north, clockwise
    const bearing = (90 - ang * 180 / Math.PI + 360) % 360, B = bearing * Math.PI / 180;
    // local frame: x to starboard, z aft (bow at −z), the origin at the outline's middle
    const loc = pts.map(p => new THREE.Vector2(across(p, ang) * -1, along(p, ang))); // (starboard is to the right of the bow: v is to the left)
    const lens = loc.map(p => p.y), z0 = Math.min(...lens), zl = Math.max(...lens) - z0; // (the bow is the +y end here)
    const shape = new THREE.Shape(); loc.forEach((p, i) => i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y));
    const hullG = new THREE.ExtrudeGeometry(shape, { depth: sp.freeboard + 1.5, bevelEnabled: false }); hullG.rotateX(-Math.PI / 2); hullG.translate(0, -1.5, 0);
    // in the group: x starboard, y up, z = −(along the bow): the shape's y is the bow direction, which rotateX(−π/2) turns to −z ✓
    const root = new THREE.Matrix4().compose(new THREE.Vector3(c.x, 0, -c.y), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -B), new THREE.Vector3(1, 1, 1));
    const put = (g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, m2?: THREE.Matrix4) => { const mm = new THREE.Matrix4().multiplyMatrices(root, new THREE.Matrix4().makeTranslation(x, y, z)); if (m2) mm.multiply(m2); add(g, color, mm); };
    add(hullG, sp.hull, root);
    const zAt = (f: number) => -(z0 + zl * (1 - f)) + 0; // (f = 0 at the bow: the bow end is the largest along, which is −z)
    const deck = sp.freeboard, beam = Math.max(...loc.map(p => p.x)) - Math.min(...loc.map(p => p.x)), midX = (Math.max(...loc.map(p => p.x)) + Math.min(...loc.map(p => p.x))) / 2;
    for (const m of sp.masts ?? []) {
      put(new THREE.CylinderGeometry(0.28, 0.4, m.h, 8), MASTC, midX, deck + m.h / 2, zAt(m.f));
      for (let i = 0; i < (m.yards ?? 0); i++) { const fy = 0.3 + 0.6 * (i / Math.max(1, (m.yards ?? 1) - 1)), w = beam * (1.9 - 0.3 * i); put(new THREE.BoxGeometry(w, 0.3, 0.3), YARD, midX, deck + m.h * fy, zAt(m.f)); }
    }
    if (sp.bowsprit) put(new THREE.CylinderGeometry(0.2, 0.3, sp.bowsprit, 6), MASTC, midX, deck + 1.2, zAt(0) - sp.bowsprit * 0.45, new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.18));
    if (sp.house) { const h = sp.house, len = (h.f1 - h.f0) * zl, wd = h.w > 1 ? h.w : beam * h.w; put(new THREE.BoxGeometry(wd, h.h, len), h.color, midX, deck + h.h / 2, zAt((h.f0 + h.f1) / 2)); }
    if (sp.stack) put(new THREE.CylinderGeometry(sp.stack.r * 0.85, sp.stack.r, sp.stack.h, 10), DARK, midX, deck + (sp.upper ?? 0) + sp.stack.h / 2, zAt(sp.stack.f));
    if (sp.paddle) for (const s of [-1, 1]) put(new THREE.BoxGeometry(1.4, (sp.upper ? 5 : 3), (sp.upper ? 12 : 5)), 0x8a2e26, midX + s * (beam / 2 - 0.4), deck + 1.5, zAt(0.5));
  }
  for (const [color, list] of geos) grp.add(new THREE.Mesh(mergeGeometries(list), mats.get(color)!));
}
