import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The boats lying in the marinas' slips, drawn as real boats: a lofted hull with its sheer, a raked stem and a transom, the
 * deck, the cabin trunk with its ports; a sailboat's mast, boom, furled main under its cover and the forestay and backstay;
 * a powerboat's deckhouse and flybridge. Every part is built for a boat 1 m long (bow toward −z, starboard +x, the
 * waterline at y = 0) and scaled to hers, so a whole marina is a few instanced meshes.
 *
 * Proportions (fractions of the length overall) are a typical 30–36 ft production boat's (see MOORED below: approximate,
 * and not yet checked against the builders' figures).
 */

export type MooredKind = 'sail' | 'power';
/** The widest a boat in one of the sim's slips is drawn, m: the slips are worked out a Folkboat's beam and fenders wide (3.0 m), so a big boat's beam is drawn to fit hers. */
export const MAX_BEAM = 3.0;
/** One part of a moored boat: its geometry (for a 1 m boat), and its colour, fixed or each boat's own. */
export interface MooredPart { geo: THREE.BufferGeometry; colour: number; own?: 'hull' | 'cover' }

/** The hull's lines, as fractions of the length overall. */
interface Lines { beam: number; fbBow: number; fbStern: number; transom: number; draft: number; rake: number }

/** The hull, lofted from its stations: topsides and bottom (one surface), and the deck (another, for its own colour). */
function hull(L: Lines, N = 24): { side: THREE.BufferGeometry; deck: THREE.BufferGeometry; sheer: (u: number) => number; half: (u: number) => number } {
  // half-breadth along her (u: 0 at the stem, 1 at the transom): full by 55%, easing to the transom's width aft
  const half = (u: number) => {
    const b = L.beam / 2;
    return u < 0.55 ? b * Math.pow(Math.sin((Math.PI / 2) * (u / 0.55)), 0.75) : b * (1 - (1 - L.transom) * ((u - 0.55) / 0.45) ** 2);
  };
  // the sheer: from the bow's freeboard to the stern's, with a little spring amidships
  const sheer = (u: number) => L.fbBow + (L.fbStern - L.fbBow) * u - 0.012 * Math.sin(Math.PI * u);
  // each station's section, starboard to port: the sheer, the waterline, the turn of the bilge, the keel (raked forward: the
  // stem overhangs the waterline)
  const pos: number[] = [], deck: number[] = [], idx: number[] = [];
  const ring = 7;
  for (let i = 0; i <= N; i++) {
    const u = i / N, z = u - 0.5, zLow = -0.5 + L.rake + u * (1 - L.rake), uLow = (zLow + 0.5);
    const b = half(u), bl = half(uLow), y = sheer(u);
    const pts: [number, number, number][] = [
      [b, y, z], [bl * 0.94, 0, zLow], [bl * 0.55, -L.draft * 0.6, zLow], [0, -L.draft, zLow],
      [-bl * 0.55, -L.draft * 0.6, zLow], [-bl * 0.94, 0, zLow], [-b, y, z]
    ];
    for (const p of pts) pos.push(...p);
    deck.push(b, y, z, -b, y, z);
    if (i > 0) for (let j = 0; j < ring - 1; j++) {
      const a = (i - 1) * ring + j, c = i * ring + j;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  // the transom: closing the last section
  const t0 = N * ring; for (let j = 1; j < ring - 1; j++) idx.push(t0, t0 + j + 1, t0 + j);
  const side = new THREE.BufferGeometry(); side.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); side.setIndex(idx); side.computeVertexNormals();
  const di: number[] = []; for (let i = 1; i <= N; i++) { const a = (i - 1) * 2, c = i * 2; di.push(a, a + 1, c, a + 1, c + 1, c); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(deck, 3)); dg.setIndex(di); dg.computeVertexNormals();
  return { side, deck: dg, sheer, half };
}

/** The rubrail: a dark strip just under the sheer, round her from stem to transom (it reads the sheer's line). */
function rubrail(sheer: (u: number) => number, half: (u: number) => number, h = 0.01): THREE.BufferGeometry {
  const N = 24, pos: number[] = [], idx: number[] = [];
  for (const side of [1, -1]) {
    const o = pos.length / 3;
    for (let i = 0; i <= N; i++) { const u = i / N, b = half(u) + 0.002, y = sheer(u); pos.push(side * b, y + 0.001, u - 0.5, side * b, y - h, u - 0.5); }
    for (let i = 0; i < N; i++) { const a = o + i * 2; if (side > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** A box narrowing toward its top: a cabin trunk or a deckhouse (half-widths at the bottom and top; fore and aft ends). */
function trunk(wBot: number, wTop: number, zf: number, za: number, zfTop: number, zaTop: number, y0: number, y1: number): THREE.BufferGeometry {
  const v = [
    [wBot, y0, zf], [-wBot, y0, zf], [-wBot, y0, za], [wBot, y0, za],
    [wTop, y1, zfTop], [-wTop, y1, zfTop], [-wTop, y1, zaTop], [wTop, y1, zaTop]
  ];
  const f = [[4, 5, 6], [4, 6, 7], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2]];
  const pos: number[] = []; for (const tri of f) for (const k of tri) pos.push(...v[k]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}

/** A round spar or wire between two points, r thick. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 5): THREE.BufferGeometry {
  const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  g.deleteAttribute('uv'); // (merged with the trunks, which have none: the parts are plain coloured)
  return g;
}

/**
 * The figures behind the shapes, as fractions of the length overall: approximate, typical of 30–36 ft production boats, from
 * general knowledge. NOT yet checked against the builders' or sailboatdata.com's figures: those hosts weren't reachable from
 * the session that drew them (to do: check and correct). Sail: beam about a third of her length; the mast about 1.4 times her
 * length above the water; freeboard about 4 ft at the bow and 3 ft at the stern on a 30-footer; the cabin top about 2 ft
 * above the deck. Power: an express or sedan cruiser, a little beamier and higher-sided, the deckhouse about 4 ft high.
 */
export const MOORED = {
  sail: { beam: 0.34, fbBow: 0.11, fbStern: 0.085, transom: 0.78, draft: 0.06, rake: 0.08, mastAbove: 1.38, mastAt: 0.4, cabin: 0.065, boom: 0.115, boomTo: 0.78 },
  power: { beam: 0.36, fbBow: 0.15, fbStern: 0.115, transom: 0.9, draft: 0.05, rake: 0.1, house: 0.13 }
};

/**
 * A sailboat's parts: hull, deck, cabin, its ports, the rig (mast, boom and stays), and the furled main under its cover.
 * `far`: as seen from over a kilometre off, a few pixels long: the hull from 6 stations, the mast alone, no rubrail or ports.
 */
export function sailParts(far = false): MooredPart[] {
  const M = MOORED.sail, h = hull(M, far ? 6 : 24);
  const u0 = 0.3, u1 = 0.66, yb = (u: number) => h.sheer(u) - 0.003, yc = Math.max(yb(u0), yb(u1));
  const cabin = trunk(h.half(0.48) * 0.62, h.half(0.48) * 0.5, u0 - 0.5, u1 - 0.5, u0 - 0.5 + 0.05, u1 - 0.5 - 0.01, yc - 0.02, yc + M.cabin);
  const ports = trunk(h.half(0.48) * 0.62 * 0.93 + 0.0015, h.half(0.48) * 0.62 * 0.86 + 0.0015, u0 - 0.5 + 0.06, u1 - 0.5 - 0.08, u0 - 0.5 + 0.075, u1 - 0.5 - 0.085, yc + M.cabin * 0.3, yc + M.cabin * 0.62);
  const mastZ = M.mastAt - 0.5, mastFoot = new THREE.Vector3(0, yc + M.cabin, mastZ), head = new THREE.Vector3(0, M.mastAbove, mastZ);
  const boomY = yc + M.cabin + M.boom * 0.5, boomEnd = new THREE.Vector3(0, boomY, M.boomTo - 0.5);
  const rig = mergeGeometries([
    rod(mastFoot, head, 0.008, 6),
    rod(new THREE.Vector3(0, boomY, mastZ), boomEnd, 0.005),
    rod(head, new THREE.Vector3(0, M.fbBow, -0.495), 0.0012, 3), // the forestay, to the stemhead
    rod(head, new THREE.Vector3(0, M.fbStern + 0.01, 0.49), 0.0012, 3) // the backstay, to the transom
  ].map(g => g.toNonIndexed()));
  const cover = rod(new THREE.Vector3(0, boomY + 0.016, mastZ + 0.01), new THREE.Vector3(0, boomY + 0.01, boomEnd.z - 0.03), 0.017, far ? 4 : 7);
  if (far) return [
    { geo: h.side, colour: 0xffffff, own: 'hull' }, { geo: h.deck, colour: 0xe9e5da }, { geo: cabin, colour: 0xf2efe7 },
    { geo: rod(mastFoot, head, 0.008, 3), colour: 0xc4c9ce }, { geo: cover, colour: 0xffffff, own: 'cover' }
  ];
  return [
    { geo: h.side, colour: 0xffffff, own: 'hull' }, { geo: rubrail(h.sheer, h.half), colour: 0x2a2d30 }, { geo: h.deck, colour: 0xe9e5da }, { geo: cabin, colour: 0xf2efe7 },
    { geo: ports, colour: 0x1d2328 }, { geo: rig, colour: 0xc4c9ce }, { geo: cover, colour: 0xffffff, own: 'cover' }
  ];
}

/** A powerboat's parts: hull, deck, deckhouse, its windows, and the flybridge's rail and console (`far`: the hull from 6 stations, the deckhouse and its windows). */
export function powerParts(far = false): MooredPart[] {
  const M = MOORED.power, h = hull(M, far ? 6 : 24);
  const y0 = h.sheer(0.45) - 0.004;
  const house = trunk(h.half(0.5) * 0.8, h.half(0.5) * 0.72, -0.12, 0.3, -0.06, 0.28, y0, y0 + M.house);
  const windows = trunk(h.half(0.5) * 0.8 * 0.97 + 0.0015, h.half(0.5) * 0.72 * 1.02 + 0.0015, -0.09, 0.26, -0.05, 0.25, y0 + M.house * 0.45, y0 + M.house * 0.85);
  const top = y0 + M.house, bridge = mergeGeometries([
    trunk(0.07, 0.06, -0.02, 0.1, 0.0, 0.1, top, top + 0.05),
    rod(new THREE.Vector3(0.11, top + 0.06, -0.06), new THREE.Vector3(0.11, top + 0.06, 0.26), 0.003),
    rod(new THREE.Vector3(-0.11, top + 0.06, -0.06), new THREE.Vector3(-0.11, top + 0.06, 0.26), 0.003),
    rod(new THREE.Vector3(0, top, 0.02), new THREE.Vector3(0, top + 0.16, 0.02), 0.004) // the radar and light mast
  ].map(g => g.toNonIndexed()));
  if (far) return [{ geo: h.side, colour: 0xffffff, own: 'hull' }, { geo: h.deck, colour: 0xe9e5da }, { geo: house, colour: 0xf4f2ec }, { geo: windows, colour: 0x1a2026 }];
  return [
    { geo: h.side, colour: 0xffffff, own: 'hull' }, { geo: rubrail(h.sheer, h.half), colour: 0x2a2d30 }, { geo: h.deck, colour: 0xe9e5da }, { geo: house, colour: 0xf4f2ec },
    { geo: windows, colour: 0x1a2026 }, { geo: bridge, colour: 0xd8dadc }
  ];
}
