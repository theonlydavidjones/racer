import * as THREE from 'three';
import type { BoatMesh } from './boatMesh';
import { RIG, SHROUD } from './boatMesh';
import { CABIN, COCKPIT, HEEL, L, TRANSOM_TOP, WINDOW, cabinHalf, cabinTopY, cockpitHalf, deckY, halfBeam, keel, sheer, uAtZ } from './hull';
import type { Tack } from '../boat/boat';

/**
 * Where each named part of the boat is, for lesson 1 (The boat: find the named part on her; design/LEARN-TO-SAIL-PLAN.md).
 * Read only: nothing here moves the boat or her meshes. A part is a set of world points taken from the live meshes as
 * they're drawn this frame (the sails' cloth, the lines, the mast as it bends) or, where the part has no mesh of its own
 * (the keel inside the hull's, the cockpit, the sides), from the hull's and rig's own layout (hull.ts, boatMesh.ts RIG),
 * carried by her group as she heels and pitches. Points, a line through them, or an area they enclose (its outline on the
 * screen is their convex hull).
 */
export type PartKind = 'pt' | 'line' | 'area';
export interface PartShape { kind: PartKind; pts: THREE.Vector3[][] }

/** The boat group's frame: x to starboard, y up, z aft; u along her length, 0 at the stem, 1 at the transom. */
const zOf = (u: number) => -L / 2 + u * L;
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const US = (u0: number, u1: number, n = 12) => [...Array(n + 1)].map((_, i) => u0 + (u1 - u0) * i / n);

/** The points of an object's geometry in the world, as drawn now (none while it's hidden). At most `max` of them. */
function worldVerts(o: THREE.Object3D | null | undefined, max = 160): THREE.Vector3[] {
  if (!o) return [];
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return [];
  const out: THREE.Vector3[] = [];
  o.updateWorldMatrix(true, true);
  o.traverseVisible(c => {
    const pos = (c as THREE.Mesh).geometry?.getAttribute?.('position') as THREE.BufferAttribute | undefined; if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / max));
    for (let i = 0; i < pos.count; i += step) out.push(v3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(c.matrixWorld));
  });
  return out;
}
/** A line's points in the world, in order. */
const linePts = (l: THREE.Line | null | undefined) => (l ? worldVerts(l, 400) : []);
/** The lines drawn for one control (boatMesh.ts tags them with their control's key). */
function keyed(m: BoatMesh, ...keys: string[]): THREE.Vector3[][] {
  const out: THREE.Vector3[][] = [];
  m.grp.traverse(o => { if ((o as THREE.Line).isLine && keys.includes(o.userData.key)) { const p = linePts(o as THREE.Line); if (p.length) out.push(p); } });
  return out;
}
/** A sail's cloth as drawn: rows from the foot (0) to the head, each from the luff to the leech (sails.ts Sail). */
function cloth(m: BoatMesh, which: 'main' | 'jib'): THREE.Vector3[][] {
  const s = m[which]; if (!s.mesh.visible) return [];
  const pos = s.geom.getAttribute('position') as THREE.BufferAttribute, uv = s.geom.getAttribute('uv') as THREE.BufferAttribute;
  s.mesh.updateWorldMatrix(true, false);
  const rows: THREE.Vector3[][] = []; let row: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    if (i > 0 && uv.getX(i) < uv.getX(i - 1)) { rows.push(row); row = []; } // (a new row: back at the luff)
    row.push(v3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(s.mesh.matrixWorld));
  }
  rows.push(row);
  return rows;
}
/** Points of the boat's own frame, in the world. */
const inBoat = (m: BoatMesh, pts: THREE.Vector3[]) => { m.grp.updateWorldMatrix(true, false); return pts.map(p => p.clone().applyMatrix4(m.grp.matrixWorld)); };
/** One side's topsides (side +1 starboard, −1 port): the sheer down to the waterline. */
const topsides = (s: number) => US(0, 1, 16).flatMap(u => [v3(s * halfBeam(u), sheer(u), zOf(u)), v3(s * halfBeam(u) * 0.8, 0.02, zOf(u))]);
/** One half of the deck, the centerline out to the sheer. */
const deckHalf = (s: number) => US(0, 1, 16).flatMap(u => [v3(s * halfBeam(u), sheer(u), zOf(u)), v3(0, deckY(u, 0), zOf(u))]);

/** The named parts, each with what it is in a few words (ASA 101's knowledge items 1–3 that she has: see PARTS). */
export type PartKey = typeof PARTS[number]['key'];
/**
 * ASA 101 Keelboat Sailing 1's knowledge items 1 ("Describe and identify the following sailboat parts and their
 * functions") and 2 ("… sails, sail parts and sail controls"), and the side terms of item 3, as far as a Nordic Folkboat
 * has them (https://americansailing.com/wp-content/uploads/2025/01/Certification-ASA-101-Standards.pdf, read 14 Nov 2026).
 * Not here, because she doesn't have them: pulpit, stanchions, lifelines, spreaders (the class rig has none: CR 7.10),
 * a wheel, a genoa, a roller furler (not while racing, CR 8.20); and the small fittings drawn too small to point at from
 * the cockpit (blocks, shackles, hanks, bolt rope, the batten pockets as against the battens).
 * `set` groups them as a sailor learns them: the boat, her rig, the sails and their controls, and the wind's sides.
 */
export const PARTS = [
  { key: 'hull', name: 'hull', set: 0, what: 'her body: it floats her' },
  { key: 'bow', name: 'bow', set: 0, what: 'the front' },
  { key: 'stern', name: 'stern', set: 0, what: 'the back' },
  { key: 'transom', name: 'transom', set: 0, what: 'the flat face across the stern' },
  { key: 'deck', name: 'deck', set: 0, what: 'the hull\'s top, to work on' },
  { key: 'port', name: 'port side', set: 0, what: 'left, looking forward' },
  { key: 'starboard', name: 'starboard side', set: 0, what: 'right, looking forward' },
  { key: 'keel', name: 'keel', set: 0, what: 'its weight holds her up; it stops her sliding sideways' },
  { key: 'rudder', name: 'rudder', set: 0, what: 'steers her' },
  { key: 'tiller', name: 'tiller', set: 0, what: 'the helm: it turns the rudder' },
  { key: 'cockpit', name: 'cockpit', set: 0, what: 'where you sail her from' },
  { key: 'cabin', name: 'cabin', set: 0, what: 'shelter below' },
  { key: 'cleat', name: 'cleat', set: 0, what: 'a line made fast here holds' },
  { key: 'winch', name: 'winch', set: 0, what: 'a drum to haul in a loaded sheet' },
  { key: 'mast', name: 'mast', set: 1, what: 'holds the sails up' },
  { key: 'boom', name: 'boom', set: 1, what: 'holds the mainsail\'s foot' },
  { key: 'gooseneck', name: 'gooseneck', set: 1, what: 'the hinge between boom and mast' },
  { key: 'forestay', name: 'forestay', set: 1, what: 'holds the mast forward; the jib is hanked on it' },
  { key: 'shroud', name: 'shroud', set: 1, what: 'holds the mast up from the side' },
  { key: 'chainplate', name: 'chainplate', set: 1, what: 'where a shroud is made fast to the hull' },
  { key: 'backstay', name: 'backstay', set: 1, what: 'holds the mast from aft; tighten it to flatten the main' },
  { key: 'standing', name: 'standing rigging', set: 1, what: 'the wires that hold the mast up' },
  { key: 'mainsail', name: 'mainsail', set: 2, what: 'the sail behind the mast' },
  { key: 'jib', name: 'jib', set: 2, what: 'the sail before the mast' },
  { key: 'head', name: 'head', set: 2, what: 'a sail\'s top corner' },
  { key: 'tack', name: 'tack', set: 2, what: 'a sail\'s front lower corner' },
  { key: 'clew', name: 'clew', set: 2, what: 'a sail\'s back lower corner' },
  { key: 'luff', name: 'luff', set: 2, what: 'a sail\'s front edge' },
  { key: 'leech', name: 'leech', set: 2, what: 'a sail\'s back edge' },
  { key: 'foot', name: 'foot', set: 2, what: 'a sail\'s bottom edge' },
  { key: 'batten', name: 'batten', set: 2, what: 'a stiffener: it holds the leech\'s curve' },
  { key: 'telltale', name: 'telltale', set: 2, what: 'shows the wind\'s flow on the sail' },
  { key: 'halyard', name: 'halyard', set: 3, what: 'hoists a sail' },
  { key: 'mainsheet', name: 'mainsheet', set: 3, what: 'trims the main in and out' },
  { key: 'jibsheet', name: 'jib sheet', set: 3, what: 'trims the jib' },
  { key: 'fairlead', name: 'fairlead', set: 3, what: 'leads the jib sheet: where it is shapes the jib' },
  { key: 'traveler', name: 'traveler', set: 3, what: 'moves the mainsheet across the boat' },
  { key: 'vang', name: 'boom vang', set: 3, what: 'holds the boom down' },
  { key: 'cunningham', name: 'Cunningham', set: 3, what: 'pulls the luff down: the draft forward' },
  { key: 'outhaul', name: 'outhaul', set: 3, what: 'pulls the clew out: a flatter foot' },
  { key: 'running', name: 'running rigging', set: 3, what: 'the lines that work the sails' },
  { key: 'windward', name: 'windward side', set: 4, what: 'the side the wind comes from' },
  { key: 'leeward', name: 'leeward side', set: 4, what: 'the side away from the wind' }
] as const;

/** Parts a click on another also finds (the transom is the stern; a shroud is standing rigging; …). */
export const ALSO: Partial<Record<PartKey, PartKey[]>> = {
  stern: ['transom'], standing: ['forestay', 'backstay', 'shroud'],
  running: ['halyard', 'mainsheet', 'jibsheet', 'vang', 'cunningham', 'outhaul']
};

/**
 * A part as it is on the boat now, in the world: her tack (for windward and leeward), and `near`, the side of her the
 * camera's on (+1 starboard; a side's topsides count only from that side, as you'd point at the side you can see).
 */
export function partShape(m: BoatMesh, key: PartKey, tack: Tack, near: number): PartShape | null {
  const B = (pts: THREE.Vector3[]) => inBoat(m, pts), side = (s: number): PartShape => ({ kind: 'area', pts: [B(deckHalf(s)), ...(Math.sign(near) === s ? [B(topsides(s))] : [])] });
  const main = () => cloth(m, 'main'), jib = () => cloth(m, 'jib'), both = () => [main(), jib()].filter(r => r.length);
  // the boom in its own swinging frame: from the gooseneck to its end (boatMesh.ts: E long, on top of it the main's foot)
  const boomAt = (z: number) => v3(0, RIG.BOOM_TOP - 0.045, z).applyMatrix4(m.boomPivot.matrixWorld);
  m.boomPivot.updateWorldMatrix(true, false);
  const E = RIG.MAIN_DEF.clew.z;
  switch (key) {
    case 'hull': return { kind: 'area', pts: [B([...topsides(1), ...topsides(-1)])] };
    case 'bow': return { kind: 'pt', pts: [B([v3(0, sheer(0), zOf(0)), v3(0, sheer(0.04) * 0.6, zOf(0.04))])] };
    case 'stern': return { kind: 'pt', pts: [B([v3(0, TRANSOM_TOP.y, TRANSOM_TOP.z - 0.15)])] };
    case 'transom': return { kind: 'area', pts: [B([-1, 1].flatMap(s => [v3(s * halfBeam(1), sheer(1), L / 2), v3(s * halfBeam(1) * 0.5, 0.1, L / 2 - 0.3)]))] };
    case 'deck': return { kind: 'area', pts: [B([...deckHalf(1), ...deckHalf(-1)])] };
    case 'port': return side(-1);
    case 'starboard': return side(1);
    // the ballast keel and deadwood, under the water: from where the keel's profile leaves the canoe body to its heel
    case 'keel': return { kind: 'area', pts: [B(US(0.25, uAtZ(HEEL.z), 10).flatMap(u => [v3(0, keel(u), zOf(u)), v3(0, -0.3, zOf(u))]))] };
    case 'rudder': return { kind: 'area', pts: [worldVerts(m.rudder.children[0])] };
    case 'tiller': return { kind: 'area', pts: [worldVerts(m.rudder.children[1])] };
    case 'cockpit': return { kind: 'area', pts: [B(US(COCKPIT.u0, COCKPIT.u1).flatMap(u => [-1, 1].map(s => v3(s * cockpitHalf(u), deckY(u, cockpitHalf(u)), zOf(u)))))] };
    case 'cabin': return { kind: 'area', pts: [B(US(CABIN.u0, CABIN.u1).flatMap(u => [-1, 1].flatMap(s => [v3(s * cabinHalf(u), deckY(u, cabinHalf(u)), zOf(u)), v3(s * cabinHalf(u) * 0.9, cabinTopY(u), zOf(u))])))] };
    case 'cleat': { const z = (WINDOW.z0 + WINDOW.z1) / 2, u = uAtZ(z); return { kind: 'pt', pts: [B([-1, 1].map(s => v3(s * (halfBeam(u) - 0.075), deckY(u, halfBeam(u) - 0.075), z)))] }; }
    case 'winch': return { kind: 'pt', pts: [B([m.lines.winches.S, m.lines.winches.P])] };
    case 'mast': return { kind: 'line', pts: [worldVerts(m.rigDrawn.mast, 400)] };
    case 'boom': return { kind: 'line', pts: [[boomAt(0), boomAt(E / 2), boomAt(E + 0.1)]] };
    case 'gooseneck': return { kind: 'pt', pts: [[boomAt(-0.04)]] };
    case 'forestay': return { kind: 'line', pts: [linePts(m.rigDrawn.forestay)] };
    case 'shroud': return { kind: 'line', pts: [-1, 1].map(s => B([SHROUD.foot.clone().setX(s * SHROUD.foot.x), SHROUD.tip.clone().setX(s * SHROUD.tip.x)])) };
    case 'chainplate': return { kind: 'pt', pts: [B([-1, 1].map(s => SHROUD.foot.clone().setX(s * SHROUD.foot.x)))] };
    case 'backstay': return { kind: 'line', pts: [linePts(m.lines.backstay)] };
    case 'mainsail': { const r = main(); return r.length ? { kind: 'area', pts: [r.flat()] } : null; }
    case 'jib': { const r = jib(); return r.length ? { kind: 'area', pts: [r.flat()] } : null; }
    case 'head': return { kind: 'pt', pts: [both().map(r => r[r.length - 1][0])] };
    case 'tack': return { kind: 'pt', pts: [both().map(r => r[0][0])] };
    case 'clew': return { kind: 'pt', pts: [both().map(r => r[0][r[0].length - 1])] };
    case 'luff': return { kind: 'line', pts: both().map(r => r.map(row => row[0])) };
    case 'leech': return { kind: 'line', pts: both().map(r => r.map(row => row[row.length - 1])) };
    case 'foot': return { kind: 'line', pts: both().map(r => r[0]) };
    case 'batten': {
      // the main's four, in from its leech (boatMesh.ts MAIN_DEF): along the row nearest each, its length of the chord
      const r = main(); if (!r.length) return null;
      return { kind: 'line', pts: (RIG.MAIN_DEF.battens ?? []).map(bt => {
        const row = r[Math.round(bt.t * (r.length - 1))], n = row.length - 1, a = row[n], chord = row[0].distanceTo(a);
        return [a, a.clone().lerp(row[0], Math.min(1, bt.len / Math.max(0.1, chord)))];
      }) };
    }
    case 'telltale': return { kind: 'pt', pts: [[...m.jibTells.windward, ...m.jibTells.leeward, ...m.leechTells].flatMap(t => worldVerts(t.mesh, 4))] };
    case 'halyard': return { kind: 'line', pts: keyed(m, 'jibHalyard', 'downhaul') };
    case 'mainsheet': return { kind: 'line', pts: [linePts(m.mainsheet), ...keyed(m, 'mainsheet')].filter(p => p.length) };
    case 'jibsheet': return { kind: 'line', pts: [linePts(m.lines.jibSheet), ...keyed(m, 'jibsheet')].filter(p => p.length) };
    case 'fairlead': return { kind: 'pt', pts: [[...worldVerts(m.lines.cars.S, 8), ...worldVerts(m.lines.cars.P, 8)]] };
    case 'traveler': return { kind: 'line', pts: [worldVerts(m.lines.travCar, 8), ...m.lines.travLines.map(linePts)].filter(p => p.length) };
    case 'vang': return { kind: 'line', pts: [linePts(m.lines.vang), ...keyed(m, 'vang')].filter(p => p.length) };
    case 'cunningham': return { kind: 'line', pts: keyed(m, 'cunningham', 'jibCunningham') };
    case 'outhaul': return { kind: 'line', pts: keyed(m, 'outhaul') };
    // the wind's sides: on port tack the wind comes over her port side, which is windward
    case 'windward': return side(tack === 'P' ? -1 : 1);
    case 'leeward': return side(tack === 'P' ? 1 : -1);
    case 'standing': case 'running': return null; // (found through the parts they're made of: ALSO)
  }
}

/** A part's outline on the screen (px from the top left): its points, its lines, or its area's convex hull. */
export interface ScreenPart { kind: PartKind; pts: [number, number][][] }
/** How far a click is from a part on the screen (px; 0 inside an area), or Infinity where it isn't drawn. */
export function screenDist(p: ScreenPart, x: number, y: number): number {
  let d = Infinity;
  for (const poly of p.pts) {
    if (!poly.length) continue;
    if (p.kind === 'pt') { for (const [a, b] of poly) d = Math.min(d, Math.hypot(x - a, y - b)); continue; }
    const ring = p.kind === 'area' ? hull2(poly) : poly;
    if (p.kind === 'area' && ring.length > 2 && inside(ring, x, y)) return 0;
    const n = p.kind === 'area' ? ring.length : ring.length - 1;
    if (ring.length === 1) d = Math.min(d, Math.hypot(x - ring[0][0], y - ring[0][1]));
    for (let i = 0; i < n; i++) d = Math.min(d, segDist(ring[i], ring[(i + 1) % ring.length], x, y));
  }
  return d;
}
/** How near a click must be (px): points and thin lines a little way round them; an area at its edge. */
export const HIT_PX: Record<PartKind, number> = { pt: 22, line: 12, area: 4 };
/** An area's size on the screen (px²), to tell a small one inside a big one. */
export function screenArea(p: ScreenPart): number {
  if (p.kind !== 'area') return 0;
  return p.pts.reduce((s, poly) => { const h = hull2(poly); let a = 0; for (let i = 0; i < h.length; i++) { const [x1, y1] = h[i], [x2, y2] = h[(i + 1) % h.length]; a += x1 * y2 - x2 * y1; } return s + Math.abs(a) / 2; }, 0);
}

function segDist(a: [number, number], b: [number, number], x: number, y: number): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0;
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
function inside(r: [number, number][], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  return c;
}
/** The convex hull (Andrew's monotone chain). */
function hull2(p: [number, number][]): [number, number][] {
  const s = [...p].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (s.length < 3) return s;
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], hi: [number, number][] = [];
  for (const q of s) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = s.length - 1; i >= 0; i--) { const q = s[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
