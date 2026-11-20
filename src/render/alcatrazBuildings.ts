import './three-setup';
import * as THREE from 'three';
import { LL } from '../geo/geo';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import data from './data/alcatraz-buildings.json';
import type { Alcatraz } from './alcatraz';

/**
 * Alcatraz's buildings as simple massing, on the lidar ground (render/alcatraz.ts): the minor buildings from
 * OpenStreetMap's footprints (scripts/make-alcatraz-structures.mjs; © OpenStreetMap contributors), and the cellhouse,
 * lighthouse and water tower at OSM's positions but the National Historic Landmark nomination's sizes (NPS, 1986:
 * cellhouse 465 × 165 ft, lighthouse 84 ft, water tower 94 ft). Heights: OSM's where it has them (the New Industries
 * Building's 9 m, the lighthouse's 26 m); the rest are a two-story building's 7 m (ruins 3 m): nothing measured yet (the
 * lidar's roofs are the next step), and the cellhouse is 12 m, two stories on the Citadel's base, also not measured.
 */
export function addAlcatrazBuildings(grp: THREE.Group, alc: Alcatraz): void {
  const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });
  const WALL = lam(0xd3ccbc), RUIN = lam(0x9d9486), WHITE = lam(0xefece4), DARK = lam(0x33363b), STEEL = lam(0x8b8a84), TANK = lam(0xa9a395);
  const sim = (lat: number, lon: number) => LL(lat, lon);
  const ground = (lat: number, lon: number) => { const p = sim(lat, lon); return Math.max(0, alc.heightAt(p.x, p.y) ?? 0); };

  // the minor buildings: each footprint extruded from just under its lowest ground to its roof
  const walls: THREE.BufferGeometry[] = [], ruins: THREE.BufferGeometry[] = [];
  for (const b of data.buildings) {
    const pts = b.ring.map(([la, lo]) => sim(la, lo)), gs = b.ring.map(([la, lo]) => ground(la, lo));
    const lo = Math.min(...gs), mean = gs.reduce((a, v) => a + v, 0) / gs.length, h = b.height ?? (b.ruin ? 3 : 7);
    const shape = new THREE.Shape(); pts.forEach((p, i) => i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y));
    const roof = mean + h, base = lo - 1; // (a building on a slope is let into it)
    const g = new THREE.ExtrudeGeometry(shape, { depth: roof - base, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, base, 0);
    (b.ruin ? ruins : walls).push(g);
  }
  grp.add(new THREE.Mesh(mergeGeometries(walls), WALL));
  if (ruins.length) grp.add(new THREE.Mesh(mergeGeometries(ruins), RUIN));

  const put = (o: THREE.Object3D, at: number[], bearing: number, y: number) => {
    const p = sim(at[0], at[1]); o.position.set(p.x, y, -p.y); o.rotation.y = -bearing * Math.PI / 180; grp.add(o);
  };
  const box = (w: number, d: number, h: number, mat: THREE.Material, y0 = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.y = y0 + h / 2; return m; };

  // the cellhouse: 465 × 165 ft along the island's crest, two stories on the Citadel's base, a low roof
  const c = data.cellhouse, cg = ground(c.at[0], c.at[1]);
  const cell = new THREE.Group(); cell.add(box(c.width, c.length, 12, WALL, -1.5), box(c.width * 0.9, c.length * 0.9, 0.6, RUIN, 12));
  put(cell, c.at, c.bearing, cg);

  // the lighthouse: a six-sided concrete tower on the knoll, 84 ft with its lantern (NHL; the light's focal plane is 214 ft above the water)
  const l = data.lighthouse, lg = ground(l.at[0], l.at[1]), tower = new THREE.Group(), lh = l.height - 4;
  tower.add(new THREE.Mesh(new THREE.CylinderGeometry(2.3, 3.0, lh, 6), WHITE).translateY(lh / 2 - 1));
  tower.add(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.5, 6), DARK).translateY(lh - 1 + 0.25));
  tower.add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3, 8), DARK).translateY(lh - 1 + 2));
  put(tower, l.at, 0, lg);

  // the water tower (1940–41, 250,000 gal): a tank on four legs, 94 ft over all
  const w = data.waterTower, wg = ground(w.at[0], w.at[1]), wt = new THREE.Group(), legH = w.height - 9;
  for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) wt.add(box(0.8, 0.8, legH + 1, STEEL, -1).translateX(x).translateZ(z));
  wt.add(new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 9, 14), TANK).translateY(legH + 4.5));
  put(wt, w.at, 0, wg);
}
