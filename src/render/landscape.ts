import './three-setup';
import * as THREE from 'three';
import { LL } from '../geo/geo';
import { LAND, onLand, shoreDist } from '../geo/shore';
import { HARBOR } from '../geo/marina';
import { buildTerrain, region, type Terrain } from './terrain';
import { P3 } from './coords';

/** A small seeded random generator, so the city is the same every time. */
function rng(seed: number) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * The land and what's on it: real terrain (terrain.ts), the city's buildings, and the landmarks racers sight
 * and steer by, at their real positions and heights: the Golden Gate Bridge and Fort Point, the Palace of
 * Fine Arts, the yacht clubs and the GGYC flagpole, Fort Mason's piers, Coit Tower on Telegraph Hill, the
 * Transamerica Pyramid and Salesforce Tower, the Ferry Building, the Bay Bridge, Sutro Tower, Alcatraz with
 * its cellhouse, lighthouse and water tower, and the lighthouses at Point Bonita, Lime Point and Mile Rock.
 * Visual only: the boats run aground on the sim's own coastline (geo/shore.ts).
 */
export async function addLandscape(scene: THREE.Scene, month: number): Promise<Terrain> {
  buildBridge(scene);
  const terrain = await buildTerrain(scene, month);
  const grp = new THREE.Group(); scene.add(grp);
  const ground = (lat: number, lon: number) => { const p = LL(lat, lon); return Math.max(0, terrain.heightAt(p.x, p.y)); };
  const lam = (color: number | string) => new THREE.MeshLambertMaterial({ color });
  /** Put an object on the ground at a lat/lon (its origin at its base), turned to a compass bearing. */
  const place = (o: THREE.Object3D, lat: number, lon: number, bearing = 0, base?: number) => {
    const p = LL(lat, lon); o.position.copy(P3(p.x, p.y, base ?? ground(lat, lon))); o.rotation.y = -bearing * Math.PI / 180; grp.add(o); return o;
  };
  /** A box sitting on its base: w across, d along the bearing, h tall. */
  const block = (w: number, d: number, h: number, mat: THREE.Material, y0 = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.y = y0 + h / 2; return m; };
  const group = (...os: THREE.Object3D[]) => { const g = new THREE.Group(); os.forEach(o => g.add(o)); return g; };

  // the Cityfront's edge: the sim's coastline as a low apron (seawalls, the Marina Green, Crissy Field), so the
  // shore you see is the one you run aground on
  {
    const s = new THREE.Shape();
    LAND.forEach((p, i) => i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y));
    // West Harbor's basin is water (geo/marina.ts): cut out of the apron
    const hole = new THREE.Path(); HARBOR.basin.forEach((p, i) => i ? hole.lineTo(p.x, p.y) : hole.moveTo(p.x, p.y)); s.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(s, { depth: 2.3, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
    scene.add(new THREE.Mesh(g, lam(0x93a079)));
  }

  /* ---------- the city ---------- */
  // one instanced box per building, on a 36 m grid, by neighbourhood: the Marina's low pastel houses, Pacific
  // Heights and Russian Hill (with a few apartment towers), North Beach, the Financial District and SoMa's
  // towers, and the low avenues beyond; the towns across the water are smaller and sparser
  {
    const rand = rng(7), STEP = 36;
    type Hood = { p: number; h: [number, number]; tall?: [number, number, number]; w: [number, number] };
    const hood = (lat: number, lon: number): Hood | null => {
      if (lat > 37.788 && lat < 37.7975 && lon > -122.406 && lon < -122.392) return { p: 0.55, h: [25, 70], tall: [0.35, 90, 200], w: [26, 42] }; // Financial District
      if (lat > 37.776 && lat < 37.7915 && lon > -122.410 && lon < -122.386) return { p: 0.45, h: [14, 40], tall: [0.18, 60, 180], w: [24, 40] }; // SoMa, Rincon Hill
      if (lat > 37.7985 && lat < 37.8055 && lon > -122.4475 && lon < -122.4305) return { p: 0.75, h: [9, 13], w: [14, 22] }; // the Marina
      if (lat > 37.796 && lat < 37.807 && lon > -122.425 && lon < -122.398) return { p: 0.6, h: [10, 18], tall: [0.06, 30, 55], w: [14, 24] }; // Russian Hill, North Beach, the Wharf
      if (lat > 37.785 && lat < 37.799 && lon > -122.449 && lon < -122.405) return { p: 0.62, h: [11, 19], tall: [0.05, 28, 45], w: [15, 25] }; // Pacific Heights, Nob Hill
      if (lat < 37.812 && lon > -122.515) return { p: 0.3, h: [8, 13], w: [14, 22] }; // the avenues and the rest of the city
      if (lat > 37.845 && lon > -122.51) return { p: 0.12, h: [6, 10], w: [10, 16] }; // Sausalito, Tiburon, Belvedere
      return null;
    };
    const keepClear = [[37.80240, -122.40584, 140], [37.80292, -122.44840, 170], [37.79519, -122.40279, 60], [37.7899, -122.3969, 50], [37.79554, -122.39369, 110]] as const; // landmarks' own ground
    const mats: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const pale = ['#e9e4d8', '#f1ede4', '#ddd6c6', '#e7dcc8', '#d5d2c9', '#ece0cf', '#cfd3d4'].map(h => new THREE.Color(h));
    const glass = ['#b7c1c6', '#c9cdc9', '#9fa9ae', '#d8d6cf', '#aab3b4'].map(h => new THREE.Color(h));
    const m0 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const dLat = STEP / 111320, dLon = STEP / (111320 * Math.cos(37.8 * Math.PI / 180));
    for (let lat = 37.746; lat < 37.93; lat += dLat) for (let lon = -122.515; lon < -122.36; lon += dLon) {
      const la = lat + (rand() - 0.5) * dLat * 0.5, lo = lon + (rand() - 0.5) * dLon * 0.5, H = hood(la, lo), r = rand();
      if (!H || r > H.p) continue;
      const p = LL(la, lo), g = terrain.heightAt(p.x, p.y);
      if (g < 3) continue;
      const reg = region(la, lo, g);
      if (reg !== 'city' && reg !== 'suburb') continue;
      if (la > 37.79 && la < 37.8135 && lo > -122.4795 && lo < -122.40 && (!onLand(p) || shoreDist(p) < 70)) continue; // the waterfront: green and seawall
      if (keepClear.some(([a, b, rr]) => Math.hypot((la - a) * 111320, (lo - b) * 88000) < rr)) continue;
      // slope: skip the steep bits (cliffs, and hillsides too steep to build on in this coarse grid)
      const gx = terrain.heightAt(p.x + 25, p.y) - terrain.heightAt(p.x - 25, p.y), gy = terrain.heightAt(p.x, p.y + 25) - terrain.heightAt(p.x, p.y - 25);
      if (Math.hypot(gx, gy) > 30) continue;
      const tall = H.tall && rand() < H.tall[0];
      const h = tall ? H.tall![1] + rand() * (H.tall![2] - H.tall![1]) : H.h[0] + rand() * (H.h[1] - H.h[0]);
      const w = H.w[0] + rand() * (H.w[1] - H.w[0]), d = H.w[0] + rand() * (H.w[1] - H.w[0]);
      q.setFromAxisAngle(up, (rand() < 0.8 ? 0 : rand() * 1.5)); // the street grid, mostly
      m0.compose(P3(p.x, p.y, g - 3 + (h + 3) / 2), q, new THREE.Vector3(w, h + 3, d));
      const c = (h > 40 ? glass : pale)[Math.floor(rand() * (h > 40 ? glass.length : pale.length))].clone().offsetHSL(0, 0, (rand() - 0.5) * 0.06);
      mats.push({ m: m0.clone(), c });
    }
    const city = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), mats.length);
    mats.forEach((b, i) => { city.setMatrixAt(i, b.m); city.setColorAt(i, b.c); });
    grp.add(city);
  }

  /* ---------- landmarks ---------- */
  const WHITE = lam(0xf2efe6), CREAM = lam(0xe9e1cf), DARK = lam(0x2a2c30), RED = lam(0xb8362c);
  // Coit Tower: a fluted concrete column 64 m tall on top of Telegraph Hill
  place(group(
    new THREE.Mesh(new THREE.CylinderGeometry(5.3, 5.8, 58, 16), CREAM).translateY(29),
    new THREE.Mesh(new THREE.CylinderGeometry(5.9, 5.6, 6, 16), lam(0xd6ccb6)).translateY(61),
    block(24, 24, 4, CREAM)
  ), 37.80240, -122.40584);
  // the Transamerica Pyramid: 260 m, a slim four-sided pyramid with its spire, and the two "wings" for the lifts
  {
    const pyr = new THREE.Mesh(new THREE.ConeGeometry(37, 212, 4, 1), lam(0xeae7df)); pyr.rotation.y = Math.PI / 4; pyr.position.y = 106;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(4.5, 60, 4, 1), lam(0xe0ddd4)); spire.rotation.y = Math.PI / 4; spire.position.y = 230;
    const wings = [-1, 1].map(s => { const w = new THREE.Mesh(new THREE.ConeGeometry(9, 160, 4, 1), lam(0xe4e1d9)); w.rotation.y = Math.PI / 4; w.position.set(s * 26, 80, 0); w.scale.set(0.55, 1, 0.55); return w; });
    place(group(pyr, spire, ...wings), 37.79519, -122.40279);
  }
  // Salesforce Tower: 326 m, a rounded square tapering to its lattice crown
  {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(25, 30, 300, 4, 1), new THREE.MeshPhongMaterial({ color: 0xd5dadd, specular: 0x666666, shininess: 30 })); t.rotation.y = Math.PI / 4; t.position.y = 150;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(23, 25, 26, 4, 1, true), new THREE.MeshLambertMaterial({ color: 0xe8ecee, transparent: true, opacity: 0.55, side: THREE.DoubleSide })); crown.rotation.y = Math.PI / 4; crown.position.y = 313;
    place(group(t, crown), 37.7899, -122.3969);
  }
  // the Ferry Building: the long shed on the Embarcadero, and its 75 m clock tower
  place(group(block(30, 200, 15, CREAM), block(16, 16, 60, CREAM, 0).translateZ(0), new THREE.Mesh(new THREE.ConeGeometry(9, 15, 4), lam(0x8f8a7c)).translateY(67.5)), 37.79554, -122.39369, 132, 2);
  // Sutro Tower: three red-and-white legs on Mt Sutro, 298 m, crossarms at two levels, three masts on top
  {
    const g = new THREE.Group(), RW = [lam(0xc8372d), lam(0xf2f0ea)];
    const leg = (a: THREE.Vector3, b: THREE.Vector3, r: number, bands: number) => {
      for (let i = 0; i < bands; i++) {
        const p0 = a.clone().lerp(b, i / bands), p1 = a.clone().lerp(b, (i + 1) / bands), len = p0.distanceTo(p1);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), RW[i % 2]); m.position.copy(p0).lerp(p1, 0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize()); g.add(m);
      }
    };
    const tri = (r: number, y: number) => [0, 1, 2].map(k => new THREE.Vector3(r * Math.sin(k * 2.094), y, r * Math.cos(k * 2.094)));
    const base = tri(26.5, 0), mid = tri(14, 157), top = tri(12, 230), tips = tri(12, 298);
    for (let k = 0; k < 3; k++) { leg(base[k], top[k], 2.2, 8); leg(top[k], tips[k], 1.2, 3); }
    for (const lvl of [mid, top]) for (let k = 0; k < 3; k++) leg(lvl[k], lvl[(k + 1) % 3], 1.3, 3);
    void mid;
    place(g, 37.75523, -122.45284);
  }
  // the Palace of Fine Arts: the rotunda (an octagon of columns under a salmon dome, 49 m) and the colonnades
  {
    const STONE = lam(0xcaa682), DOME = lam(0xb9775a), g = new THREE.Group();
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, c = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 24, 8), STONE); c.position.set(19 * Math.sin(a), 12, 19 * Math.cos(a)); g.add(c); }
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 7, 8), STONE); drum.position.y = 27.5; g.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), DOME); dome.position.y = 31; dome.scale.y = 1.05; g.add(dome);
    // the colonnades: an arc wrapped around the west side of the lagoon, the rotunda at its middle
    for (let th = -0.95; th <= 0.951; th += 0.075) {
      if (Math.abs(th) < 0.2) continue;
      const c = new THREE.Mesh(new THREE.BoxGeometry(6, 13, 8.5), STONE);
      c.position.set(110 - 110 * Math.cos(th), 6.5, -110 * Math.sin(th)); c.rotation.y = th; g.add(c);
    }
    place(g, 37.80292, -122.44840);
  }
  // the yacht clubs, and the GGYC flagpole (the inner end of the start line)
  place(group(block(47, 91, 10, lam(0xf1ede2)), block(40, 80, 3, lam(0xb5654a), 10)), 37.80728, -122.44664, 81, 2.3); // St. Francis YC: white walls, red tile roof
  place(block(12, 16, 6, lam(0xf4f1ea)), 37.8090, -122.4433, 0, 2.3); // Golden Gate YC
  place(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 14, 6), WHITE).translateY(7), 37.80925, -122.44325, 0, 2.3);
  // Fort Mason's piers, with the long pier sheds
  for (const lon of [-122.43185, -122.43025, -122.42875]) place(group(block(26, 150, 3, lam(0x9d968a)), block(22, 140, 13, lam(0xd9cfb8), 3)), 37.8091, lon, 0, 0);
  // Fort Point: the brick fort under the south end of the bridge
  place(block(56, 97, 15, lam(0x96604a)), 37.81055, -122.47710, 56, 3);
  // Alcatraz: the cellhouse along the island's crest, the lighthouse at its south end, the water tower to the north
  {
    const crest = ground(37.82665, -122.42305);
    place(block(36, 100, 14, lam(0xd3ccbc)), 37.82680, -122.42290, 320, crest);
    place(group(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.6, 24, 8), WHITE).translateY(12), new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3, 8), DARK).translateY(25.5)), 37.82623, -122.42214, 0, crest);
    const wt = new THREE.Group(); for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) wt.add(block(0.8, 0.8, 20, lam(0x8b8a84)).translateX(x).translateZ(z)); wt.add(new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 9, 12), lam(0xa9a395)).translateY(24.5)); // 29 m
    place(wt, 37.82750, -122.42389, 0);
    place(block(14, 70, 14, lam(0xcfc6b2)), 37.82705, -122.42135, 330, 3); // the barracks (Building 64) above the dock
    place(block(16, 90, 10, lam(0xc9c1ad)), 37.82820, -122.42500, 315, 3); // the industries building on the northwest shore
    place(block(14, 20, 8, lam(0xbdb3a0)), 37.82590, -122.42260, 0); // the warden's house (a ruin), by the lighthouse
  }
  // lighthouses: Point Bonita (out at the entrance), Lime Point (the Marin foot of the bridge), Mile Rock (off Lands End)
  place(group(block(7, 9, 5, WHITE), new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 10, 8), WHITE).translateY(5), new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2, 8), RED).translateY(11)), 37.815614, -122.529578);
  place(block(8, 10, 6, WHITE), 37.825447, -122.478321, 0, 3);
  place(group(new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 9, 16), lam(0x55585a)).translateY(4.5), new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 10, 12), WHITE).translateY(14)), 37.79300, -122.51010, 0, 0);
  buildBayBridge(grp);
  grp.traverse(o => { o.castShadow = false; o.receiveShadow = false; o.matrixAutoUpdate = true; });
  return terrain;
}

/**
 * The Bay Bridge's west span, from Rincon Hill to Yerba Buena Island: two suspension bridges end to end,
 * joined at a central anchorage. Each has a 704 m main span between 160 m towers and 354 m side spans;
 * the roadway is about 67 m up. Silver-grey steel.
 */
function buildBayBridge(parent: THREE.Object3D): void {
  const STEEL = new THREE.MeshLambertMaterial({ color: 0x9ea4a8 }), CONC = new THREE.MeshLambertMaterial({ color: 0xb8b2a6 });
  const a = LL(37.7866, -122.3896), b = LL(37.8091, -122.3664); // the Rincon Hill anchorage → the tunnel on Yerba Buena Island
  const len = Math.hypot(b.x - a.x, b.y - a.y), g = new THREE.Group();
  g.position.copy(P3(a.x, a.y, 0)); g.rotation.y = Math.atan2(b.x - a.x, b.y - a.y) + Math.PI; parent.add(g); // local −z runs from SF to the island
  const deckY = 62, towerH = 160, SIDE = 354, MAIN = 704;
  const anch = [0, 2 * SIDE + MAIN, 4 * SIDE + 2 * MAIN], towers = [SIDE, SIDE + MAIN, 3 * SIDE + MAIN, 3 * SIDE + 2 * MAIN];
  const deck = new THREE.Mesh(new THREE.BoxGeometry(20, 9, len), STEEL); deck.position.set(0, deckY, -len / 2); g.add(deck);
  for (const z of anch) { const m = new THREE.Mesh(new THREE.BoxGeometry(40, deckY + 25, 50), CONC); m.position.set(0, (deckY + 25) / 2, -z); g.add(m); }
  for (const z of towers) {
    for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(5, towerH, 7), STEEL); t.position.set(sx * 10, towerH / 2, -z); g.add(t); }
    for (const y of [deckY + 30, towerH - 8]) { const st = new THREE.Mesh(new THREE.BoxGeometry(20, 5, 5), STEEL); st.position.set(0, y, -z); g.add(st); }
  }
  // the main cables: down to the anchorages, and sagging to the roadway in mid-span
  for (const sx of [-1, 1]) for (const k of [0, 1]) {
    const z0 = anch[k], t1 = towers[2 * k], t2 = towers[2 * k + 1], z1 = anch[k + 1], mid = (t1 + t2) / 2, pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) {
      const z = z0 + (z1 - z0) * i / 60;
      const y = z < t1 ? deckY + 20 + (towerH - deckY - 20) * (z - z0) / SIDE : z > t2 ? deckY + 20 + (towerH - deckY - 20) * (z1 - z) / SIDE : deckY + 6 + (towerH - deckY - 6) * ((z - mid) / (MAIN / 2)) ** 2;
      pts.push(new THREE.Vector3(sx * 10, y, -z));
    }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8d9398 })));
  }
}

/* ---------- the Golden Gate Bridge ---------- */

/** Lights that come on at dusk: the towers' red aviation lights and the roadway lamps. */
export const bridgeLights: THREE.Object3D[] = [];

/**
 * The Golden Gate Bridge from its published dimensions: a 1,280 m main span between towers 227 m above the
 * water, 343 m side spans to the anchorages, the roadway about 67 m up at mid-span on a deep stiffening
 * truss, two main cables (0.92 m thick) sagging about 143 m, vertical suspenders every 15 m, and the towers'
 * stepped legs tied by art-deco portal struts above the roadway and X-bracing below it. International Orange.
 * The centre point is the published one (37.8197° N, 122.4786° W); the axis runs a little west of north.
 */
function buildBridge(scene: THREE.Scene): void {
  const ORANGE = new THREE.MeshPhongMaterial({ color: 0xc0362c, specular: 0x331a10, shininess: 12 });
  const DARK = new THREE.MeshPhongMaterial({ color: 0x8e2a22, shininess: 6 }); // recesses and shade
  const CONCRETE = new THREE.MeshLambertMaterial({ color: 0xb8b2a6 });
  const centre = LL(37.81972, -122.47861), bearing = 356.5; // axis from the YRA tower positions and Fort Point → Lime Point (356–357°)
  const g = new THREE.Group();
  const b = bearing * Math.PI / 180, ax = Math.sin(b), ay = Math.cos(b);
  g.position.set(centre.x, 0, -centre.y); g.rotation.y = Math.atan2(ax, -ay); // local z runs along the bridge (south → north), x across, y up
  scene.add(g);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = ORANGE) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  const HALF_SPAN = 640, SIDE = 343, LEG_X = 14.5, TOP = 227, SADDLE = 224, MID_CABLE = 81;
  const deckY = (z: number) => 67 - 6 * Math.min(1, (z / HALF_SPAN) ** 2) - (Math.abs(z) > HALF_SPAN ? 4 * (Math.abs(z) - HALF_SPAN) / SIDE : 0);
  for (const tz of [-HALF_SPAN, HALF_SPAN]) {
    // the pier and its fender at the waterline
    box(64, 12, 34, 0, 4, tz, CONCRETE);
    // two legs, stepping in as they rise
    const steps: [number, number, number, number][] = [[0, 82, 11, 17], [82, 128, 10, 15], [128, 172, 9, 13], [172, TOP, 8, 11]];
    for (const sx of [-1, 1]) for (const [y0, y1, wx, dz] of steps) box(wx, y1 - y0, dz, sx * LEG_X, (y0 + y1) / 2, tz);
    // portal struts above the roadway, each with darker recessed panels (the art-deco look)
    for (const [y, h] of [[96, 9], [134, 8], [170, 8], [205, 7], [TOP - 3, 6]] as const) {
      box(LEG_X * 2 - 6, h, 9, 0, y, tz);
      for (const px of [-7, 0, 7]) box(3.2, h * 0.6, 0.6, px, y, tz + 4.6, DARK), box(3.2, h * 0.6, 0.6, px, y, tz - 4.6, DARK);
    }
    // X-bracing between the legs below the roadway
    for (const sgn of [-1, 1]) { const br = box(2.6, 70, 3, 0, 32, tz); br.rotation.z = sgn * Math.atan2(LEG_X * 2, 60); }
    // red aviation lights on the tower tops
    for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); l.position.set(sx * LEG_X, TOP + 2, tz); l.visible = false; g.add(l); bridgeLights.push(l); }
  }
  // anchorages at each end
  for (const z of [-(HALF_SPAN + SIDE), HALF_SPAN + SIDE]) box(50, 40, 45, 0, 20, z, CONCRETE);
  // the roadway on its stiffening truss: a deck slab, and truss sides drawn on transparent panels
  const LEN = 2 * (HALF_SPAN + SIDE) + 120, N = 120;
  const deckGeo = (yOff: number, h: number) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) { const z = -LEN / 2 + LEN * i / N, y = deckY(z) + yOff; pos.push(0, y - h / 2, z, 0, y + h / 2, z); uv.push(z / 15.2, 0, z / 15.2, 1); }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); return geo;
  };
  const tc = document.createElement('canvas'); tc.width = 128; tc.height = 64; const t2 = tc.getContext('2d')!;
  t2.strokeStyle = '#c0362c'; t2.lineWidth = 7; t2.beginPath(); t2.moveTo(0, 4); t2.lineTo(128, 4); t2.moveTo(0, 60); t2.lineTo(128, 60); t2.moveTo(0, 60); t2.lineTo(64, 4); t2.lineTo(128, 60); t2.moveTo(64, 4); t2.lineTo(64, 60); t2.stroke();
  const trussTex = new THREE.CanvasTexture(tc); trussTex.wrapS = THREE.RepeatWrapping; trussTex.anisotropy = 4;
  const trussMat = new THREE.MeshLambertMaterial({ map: trussTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) { const side = new THREE.Mesh(deckGeo(-3.8, 7.6), trussMat); side.position.x = sx * 13.7; g.add(side); }
  { // the roadway: a flat strip 27 m wide on top of the truss
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) { const z = -LEN / 2 + LEN * i / N, y = deckY(z) + 1; pos.push(-13.7, y, z, 13.7, y, z); }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setIndex(idx); rg.computeVertexNormals();
    g.add(new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ color: 0x55504c, side: THREE.DoubleSide })));
  }
  // main cables: a parabola across the main span, nearly straight down to the anchorages; suspenders every 15.2 m
  const cableY = (z: number) => {
    const a = Math.abs(z);
    if (a <= HALF_SPAN) return MID_CABLE + (SADDLE - MID_CABLE) * (z / HALF_SPAN) ** 2;
    const f = (a - HALF_SPAN) / SIDE; return SADDLE + (deckY(HALF_SPAN + SIDE) + 8 - SADDLE) * f - 14 * f * (1 - f);
  };
  const susp: number[] = [];
  for (const sx of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 160; i++) { const z = -(HALF_SPAN + SIDE) + 2 * (HALF_SPAN + SIDE) * i / 160; pts.push(new THREE.Vector3(sx * LEG_X, cableY(z), z)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 320, 0.95, 6, false), ORANGE));
    for (let z = -(HALF_SPAN + SIDE) + 8; z < HALF_SPAN + SIDE - 8; z += 15.2) {
      if (Math.abs(Math.abs(z) - HALF_SPAN) < 6) continue;
      const top = cableY(z), bot = deckY(z) + 1; if (top - bot > 2) susp.push(sx * LEG_X, top, z, sx * LEG_X, bot, z);
    }
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(susp, 3));
  g.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xa8382c })));
  // roadway lamps, lit at dusk
  const lamps: number[] = [];
  for (let z = -LEN / 2 + 20; z < LEN / 2 - 20; z += 50) for (const sx of [-1, 1]) lamps.push(sx * 12.5, deckY(z) + 9, z);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lamps, 3));
  const lp = new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xffc56a, size: 2.2, sizeAttenuation: false, fog: false })); lp.visible = false; g.add(lp); bridgeLights.push(lp);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.receiveShadow = false; } });
}
