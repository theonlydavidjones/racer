import './three-setup';
import * as THREE from 'three';
import { LL } from '../geo/geo';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import data from './data/alcatraz-buildings.json';
import type { Alcatraz } from './alcatraz';

/** The lidar's height for a footprint or a tower (m over the DEM ground), its top (m NAVD88) and where it stands, where the lidar has it. */
interface Roof { eave: number; ridge: number; bearing: number; length: number; width: number; at: [number, number] }
interface Lidar { height: number; top?: number; at?: [number, number]; roof?: Roof; outline?: { at: [number, number]; bearing: number; length: number; width: number } }
const lidarOf = (o: object): Lidar | undefined => (o as { lidar?: Lidar }).lidar;

/**
 * Alcatraz's buildings as simple massing, on the lidar ground (render/alcatraz.ts): the minor buildings from
 * OpenStreetMap's footprints (scripts/make-alcatraz-structures.mjs; © OpenStreetMap contributors), and the cellhouse,
 * lighthouse and water tower with the National Historic Landmark nomination's sizes (NPS, 1986: cellhouse 465 × 165 ft,
 * lighthouse tower 84 ft). Heights are the USGS 3DEP lidar's (scripts/make-alcatraz-heights.mjs): the 90th percentile of
 * a footprint's non-ground points over the DEM ground, and the top of each thin tower (chimney, lighthouse, water tower)
 * where the lidar finds it, which can be 15 m from OSM's centre. A building the lidar has too few points on keeps OSM's
 * height or a two-story building's 7 m (ruins 3 m). The lighthouse's tower stays the NHL's 84 ft with its lantern on top, to the lidar's top.
 */
/** NAVD88's height below mean sea level at San Francisco (NOAA 9414290: MSL 2.773 m, NAVD88 1.804 m above station datum): the drawn water's level (scripts/make-alcatraz.mjs). */
const MSL_NAVD88 = 0.969;

export function addAlcatrazBuildings(grp: THREE.Group, alc: Alcatraz): void {
  const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c });
  const WALL = lam(0xd3ccbc), RUIN = lam(0x9d9486), WHITE = lam(0xefece4), DARK = lam(0x33363b), STEEL = lam(0x8b8a84), TANK = lam(0xa9a395);
  const sim = (lat: number, lon: number) => LL(lat, lon);
  const ground = (lat: number, lon: number) => { const p = sim(lat, lon); return Math.max(0, alc.heightAt(p.x, p.y) ?? 0); };

  // the minor buildings: each footprint extruded from just under its lowest ground to its roof
  const walls: THREE.BufferGeometry[] = [], ruins: THREE.BufferGeometry[] = [], roofs: THREE.BufferGeometry[] = [];
  const CHIMNEY = 1056707165;
  for (const b of data.buildings) {
    if (b.osm === CHIMNEY) { // the powerhouse's chimney: a round stack, from the lidar's top down to the ground at its foot
      const li = lidarOf(b), at = li?.at ?? b.ring.reduce((a, [la, lo]) => [a[0] + la / b.ring.length, a[1] + lo / b.ring.length], [0, 0]), g = ground(at[0], at[1]), top = li?.top !== undefined ? li.top - MSL_NAVD88 : g + 30, p = sim(at[0], at[1]);
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, top - g + 1, 10), RUIN); stack.position.set(p.x, (top + g - 1) / 2, -p.y); grp.add(stack);
      continue;
    }
    const pts = b.ring.map(([la, lo]) => sim(la, lo)), gs = b.ring.map(([la, lo]) => ground(la, lo));
    const lo = Math.min(...gs), mean = gs.reduce((a, v) => a + v, 0) / gs.length, h = lidarOf(b)?.height ?? b.height ?? (b.ruin ? 3 : 7);
    const shape = new THREE.Shape(); pts.forEach((p, i) => i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y));
    const roof = mean + h, base = lo - 1; // (a building on a slope is let into it)
    const pitched = lidarOf(b)?.roof; // (a gable's walls go to its eave, its roof a triangular prism along the ridge)
    const top = pitched ? mean + pitched.eave : roof;
    const g = new THREE.ExtrudeGeometry(shape, { depth: top - base, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, base, 0);
    (b.ruin ? ruins : walls).push(g);
    if (pitched) {
      const hw = pitched.width / 2 + 0.3, hl = pitched.length / 2 + 0.3, rh = pitched.ridge - pitched.eave, p = sim(pitched.at[0], pitched.at[1]), a = pitched.bearing * Math.PI / 180;
      const V = [[-hw, 0, -hl], [hw, 0, -hl], [0, rh, -hl], [-hw, 0, hl], [hw, 0, hl], [0, rh, hl]], f = [[0, 2, 1], [3, 4, 5], [0, 3, 5], [0, 5, 2], [1, 2, 5], [1, 5, 4]]; // (ends, then the two slopes; the eave's underside is hidden by the walls)
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(f.flatMap(t => t.flatMap(i => V[i])), 3)); rg.computeVertexNormals();
      rg.rotateY(-a); rg.translate(p.x, top, -p.y); roofs.push(rg);
    }
  }
  grp.add(new THREE.Mesh(mergeGeometries(walls), WALL));
  if (ruins.length) grp.add(new THREE.Mesh(mergeGeometries(ruins), RUIN));
  if (roofs.length) grp.add(new THREE.Mesh(mergeGeometries(roofs), lam(0x7e756a))); // (slate and tar paper, grey-brown)

  const put = (o: THREE.Object3D, at: number[], bearing: number, y: number) => {
    const p = sim(at[0], at[1]); o.position.set(p.x, y, -p.y); o.rotation.y = -bearing * Math.PI / 180; grp.add(o);
  };
  const box = (w: number, d: number, h: number, mat: THREE.Material, y0 = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.y = y0 + h / 2; return m; };

  // the cellhouse: 465 × 165 ft along the island's crest, two stories on the Citadel's base, a low roof
  // (the roof is 12 m over the mean)
  const c0 = data.cellhouse, out = lidarOf(c0)?.outline, c = out ? { ...c0, ...out } : c0, cp = sim(c.at[0], c.at[1]), br = c.bearing * Math.PI / 180, gs: number[] = [];
  for (let u = -1; u <= 1; u += 0.5) for (let v = -1; v <= 1; v += 0.5) {
    const a = u * c.width / 2, d = v * c.length / 2; // across and along the heading (east = sin, north = cos)
    gs.push(Math.max(0, alc.heightAt(cp.x + a * Math.cos(br) + d * Math.sin(br), cp.y - a * Math.sin(br) + d * Math.cos(br)) ?? 0));
  }
  const cMean = gs.reduce((a, v) => a + v, 0) / gs.length, cLow = Math.min(...gs) - 0.5; // (its walls go down to the ground under its lowest side, as the Citadel's masonry base does on the terrace's edge: no gap to see under it)
  const cH = lidarOf(c0)?.height ?? 12; // (the roof over the mean ground: the lidar's 90th percentile; two stories, 12 m, if it has none)
  const cell = new THREE.Group(); cell.add(box(c.width, c.length, cMean + cH - cLow + 0.5, WALL, -0.5), box(c.width * 0.9, c.length * 0.9, 0.6, RUIN, cMean + cH - cLow));
  put(cell, c.at, c.bearing, cLow);

  // the lighthouse: a six-sided concrete tower on the knoll, 84 ft with its lantern (NHL; the light's focal plane is 214 ft above the water)
  const l = data.lighthouse, ll = lidarOf(l), lat = ll?.at ?? l.at, lg = ground(lat[0], lat[1]), tower = new THREE.Group();
  const lh = l.height, lantern = Math.max(2, (ll?.height ?? l.height + 2.5) - l.height); // (the NHL's 84 ft to the gallery, the lantern over it to the lidar's top, about 2 m more)
  // (girth: about 5 m across the flats at the base, 4 at the top, my estimate: no drawing found gives it)
  tower.add(new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.9, lh + 1, 6), WHITE).translateY((lh - 1) / 2));
  tower.add(new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.5, 6), DARK).translateY(lh - 0.25));
  tower.add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, lantern + 0.25, 8), DARK).translateY(lh + (lantern - 0.25) / 2));
  put(tower, lat, 0, lg);

  // the water tower (1940–41, 250,000 gal): a tank on four legs, 94 ft by the NHL and the lidar's 30.8 m
  const w = data.waterTower, wl = lidarOf(w), wat = wl?.at ?? w.at, wg = ground(wat[0], wat[1]), wt = new THREE.Group(), wh = wl?.height ?? w.height, legH = wh - 9;
  for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) wt.add(box(0.8, 0.8, legH + 1, STEEL, -1).translateX(x).translateZ(z));
  wt.add(new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 9, 14), TANK).translateY(legH + 4.5));
  put(wt, wat, 0, wg);
}
