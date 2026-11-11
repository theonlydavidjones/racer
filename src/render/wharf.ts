import './three-setup';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PIERS, WHARF } from '../geo/shore';
import type { Vec } from '../core/math';
import { P3 } from './coords';

/*
 * The Wharf's piers, breakwaters and floating docks in 3D (geo/shore.ts WHARF, from OpenStreetMap): the fixed piers
 * (Municipal Pier round Aquatic Park, Hyde Street Pier, Pier 47, Pier 41) as decks on the water, the rubble
 * breakwaters, and the Pier 39 marina's floating docks a little above the water. The solid-fronted piers on the
 * coastline (45, 39, 35 to 27) are part of the land.
 */
// a fixed pier's deck stands about 3 m above the water at mid-tide (above the highest tides: San Francisco's tidal range is under 2 m)
const PIER_TOP = 3.0, DOCK_TOP = 0.45, DOCK_T = 0.35, ROCK_TOP = 2.4;

function slab(pts: Vec[], y0: number, y1: number): THREE.BufferGeometry {
  const sh = new THREE.Shape(); pts.forEach((p, i) => i ? sh.lineTo(p.x, p.y) : sh.moveTo(p.x, p.y)); // (rotated flat: shape y becomes −z, north)
  const g = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
  const out = g.toNonIndexed(); g.dispose(); out.deleteAttribute('uv'); return out;
}
/** A strip along a centre line, `w` wide, between heights y0 and y1: a box per segment. */
function bar(pts: Vec[], w: number, y0: number, y1: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], c = pts[i], len = Math.hypot(c.x - a.x, c.y - a.y); if (len < 0.2) continue;
    const g = new THREE.BoxGeometry(w, y1 - y0, len + w * 0.5); g.rotateY(-Math.atan2(c.x - a.x, c.y - a.y) + Math.PI);
    const m = P3((a.x + c.x) / 2, (a.y + c.y) / 2, (y0 + y1) / 2); g.translate(m.x, m.y, m.z);
    const ni = g.toNonIndexed(); g.dispose(); ni.deleteAttribute('uv'); out.push(ni);
  }
  return out;
}

export function addWharf(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group(), deck: THREE.BufferGeometry[] = [], rock: THREE.BufferGeometry[] = [], docks: THREE.BufferGeometry[] = [];
  for (const a of WHARF.areas) (a.kind === 'breakwater' ? rock : deck).push(a.kind === 'breakwater' ? slab(a.pts, -1, ROCK_TOP) : slab(a.pts, -1, PIER_TOP));
  for (const l of WHARF.lines) {
    if (l.kind === 'breakwater') rock.push(...bar(l.pts, l.width!, -1, ROCK_TOP));
    else docks.push(...bar(l.pts, l.width!, DOCK_TOP - DOCK_T, DOCK_TOP));
  }
  // the bridges' piers and tower bases, from the outlines that make them solid (geo/shore.ts PIERS): concrete standing out
  // of the water. Heights: the Golden Gate's tower bases 13 m (OpenStreetMap's height), the south tower's fender 6 m,
  // the Bay Bridge's piers 10 m and the others 6 m (estimates from photographs: the chart gives only their footprints).
  const piers: THREE.BufferGeometry[] = [];
  for (const P of PIERS) {
    const n = P.name ?? '', top = /tower$/.test(n) ? 13 : /fender/.test(n) ? 6 : /^Bay Bridge/.test(n) ? 10 : 6;
    piers.push(slab(P.pts, -2, top));
  }
  const add = (gs: THREE.BufferGeometry[], color: number) => { if (!gs.length) return; const g = mergeGeometries(gs); g.computeVertexNormals(); group.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }))); gs.forEach(x => x.dispose()); };
  add(deck, 0x9c958a); // weathered concrete and timber decking
  add(piers, 0xb8b2a6); // the bridges' concrete piers
  add(rock, 0x8a8176); // rubble
  add(docks, 0x9a8466); // weathered wood
  scene.add(group);
  return group;
}
