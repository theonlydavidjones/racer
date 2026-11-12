import northAnchorage from '../geo/data/gg-north-anchorage.json';
import './three-setup';
import * as THREE from 'three';
import { LL } from '../geo/geo';
import { LAND, onLand, shoreDist } from '../geo/shore';
import { HARBOR } from '../geo/marina';
import { buildTerrain, onAngel, region, type Terrain } from './terrain';
import { P3 } from './coords';
import { segPt } from '../core/math';
import { buildBayBridge, BAY_APPROACH } from './bayBridge';
import { buildEastBay } from './eastBay';
import { clocks, crownDisplayMaterial, floodlit, glints, litWindows, nightOnly, type Glint } from './night';

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
  const terrain = await buildTerrain(scene, month);
  buildBridge(scene, (x, y) => terrain.heightAt(x, y));
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

  const glows: Glint[] = buildBayBridge(grp, (x, y) => terrain.heightAt(x, y)); // first: the city's buildings keep clear of its approach
  glows.push(...buildEastBay(grp)); // the Richmond–San Rafael Bridge, the Brothers, the Berkeley Pier, the Port of Oakland's cranes

  /* ---------- the city ---------- */
  // one instanced box per building, on a 36 m grid, by neighbourhood: the Marina's low pastel houses, Pacific
  // Heights and Russian Hill (with a few apartment towers), North Beach, the Financial District and SoMa's
  // towers, and the low avenues beyond; the towns across the water are smaller and sparser
  {
    const rand = rng(7), STEP = 36;
    type Hood = { p: number; h: [number, number]; tall?: [number, number, number]; w: [number, number] };
    const hood = (lat: number, lon: number): Hood | null => {
      // the East Bay: downtown Oakland's towers round City Center and Lake Merritt (the tallest, the Ordway and 1111
      // Broadway, about 125 m), Emeryville's towers by the Bay Bridge's toll plaza, downtown Berkeley's few, and low
      // houses, flats and warehouses everywhere else from Alameda to Richmond
      // (each downtown thinning out to the low town round it over its outer 250 m, so it has no hard edge)
      const core = (s: number, n: number, w: number, e: number) => Math.min(1, Math.min(lat - s, n - lat, (lon - w) * 0.79, (e - lon) * 0.79) / 0.0023);
      const town = (k: number, H: Hood): Hood | null => k <= 0 ? null : rand() < k ? H : { p: 0.22, h: [6, 11], w: [12, 22] };
      { const k = core(37.797, 37.812, -122.279, -122.259); if (k > 0) return town(k, { p: 0.5, h: [14, 45], tall: [0.16, 60, 125], w: [24, 40] }); } // downtown Oakland
      { const k = core(37.829, 37.846, -122.298, -122.284); if (k > 0) return town(k, { p: 0.4, h: [10, 28], tall: [0.08, 40, 90], w: [20, 36] }); } // Emeryville
      { const k = core(37.864, 37.876, -122.275, -122.262); if (k > 0) return town(k, { p: 0.45, h: [10, 26], tall: [0.06, 35, 55], w: [18, 30] }); } // downtown Berkeley
      if (lon > -122.345 || (lat > 37.89 && lon > -122.437)) return { p: 0.22, h: [6, 11], w: [12, 22] }; // Alameda, Oakland, Berkeley, Albany, Richmond
      if (lat > 37.788 && lat < 37.7975 && lon > -122.406 && lon < -122.392) return { p: 0.55, h: [25, 70], tall: [0.3, 80, 150], w: [26, 42] }; // Financial District (its tallest towers are drawn below)
      if (lat > 37.776 && lat < 37.7915 && lon > -122.410 && lon < -122.386) return { p: 0.45, h: [14, 40], tall: [0.14, 50, 140], w: [24, 40] }; // SoMa, Rincon Hill
      if (lat > 37.7985 && lat < 37.8055 && lon > -122.4475 && lon < -122.4305) return { p: 0.75, h: [9, 13], w: [14, 22] }; // the Marina
      if (lat > 37.796 && lat < 37.807 && lon > -122.425 && lon < -122.398) return { p: 0.6, h: [10, 18], tall: [0.06, 30, 55], w: [14, 24] }; // Russian Hill, North Beach, the Wharf
      if (lat > 37.785 && lat < 37.799 && lon > -122.449 && lon < -122.405) return { p: 0.62, h: [11, 19], tall: [0.05, 28, 45], w: [15, 25] }; // Pacific Heights, Nob Hill
      if (lat < 37.812 && lon > -122.515) return { p: 0.3, h: [8, 13], w: [14, 22] }; // the avenues and the rest of the city
      if (lat > 37.8155 && lat < 37.8335 && lon > -122.381 && lon < -122.358) return { p: 0.35, h: [6, 14], w: [14, 34] }; // Treasure Island
      if (lat > 37.845 && lon > -122.51) return { p: 0.12, h: [6, 10], w: [10, 16] }; // Sausalito, Tiburon, Belvedere
      return null;
    };
    const keepClear = [[37.80240, -122.40584, 140], [37.80292, -122.44840, 170], [37.79519, -122.40279, 60], [37.7899, -122.3969, 55], [37.79554, -122.39369, 110],
      [37.7897, -122.39535, 35], [37.7904, -122.3961, 35], [37.7903, -122.3943, 35], [37.785778, -122.392139, 35], [37.79285, -122.39793, 35], [37.7919, -122.4038, 45], [37.7925, -122.4005, 40]] as const; // landmarks' own ground
    const mats: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const pale = ['#e9e4d8', '#f1ede4', '#ddd6c6', '#e7dcc8', '#d5d2c9', '#ece0cf', '#cfd3d4'].map(h => new THREE.Color(h));
    const glass = ['#b7c1c6', '#c9cdc9', '#9fa9ae', '#d8d6cf', '#aab3b4'].map(h => new THREE.Color(h));
    const m0 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const dLat = STEP / 111320, dLon = STEP / (111320 * Math.cos(37.8 * Math.PI / 180));
    for (let lat = 37.746; lat < 37.975; lat += dLat) for (let lon = -122.515; lon < -122.189; lon += dLon) {
      const la = lat + (rand() - 0.5) * dLat * 0.5, lo = lon + (rand() - 0.5) * dLon * 0.5, H = hood(la, lo), r = rand();
      if (!H || r > H.p) continue;
      const p = LL(la, lo), g = terrain.heightAt(p.x, p.y);
      if (g < 3) continue;
      const reg = region(la, lo, g);
      if (reg !== 'city' && reg !== 'suburb') continue;
      if (la > 37.79 && la < 37.8135 && lo > -122.4795 && lo < -122.40 && (!onLand(p) || shoreDist(p) < 70)) continue; // the waterfront: green and seawall
      if (keepClear.some(([a, b, rr]) => Math.hypot((la - a) * 111320, (lo - b) * 88000) < rr)) continue;
      if (BAY_APPROACH.some(([s0, s1]) => segPt(p, s0, s1) < 40)) continue; // the Bay Bridge's approach viaduct
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
    const cityMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    litWindows(cityMat, { kind: 'auto', glow: 1.1 }); // homes and offices, by height (night.ts: the DOE lighting schedules)
    // in tiles 2 km on a side, each its own instanced mesh, so the city behind the camera isn't drawn
    const box = new THREE.BoxGeometry(1, 1, 1), tiles = new Map<number, typeof mats>(), at = new THREE.Vector3();
    for (const b of mats) { at.setFromMatrixPosition(b.m); const key = Math.floor(at.x / 2000) * 1000 + Math.floor(at.z / 2000); (tiles.get(key) ?? tiles.set(key, []).get(key)!).push(b); }
    for (const list of tiles.values()) {
      const city = new THREE.InstancedMesh(box, cityMat, list.length);
      list.forEach((b, i) => { city.setMatrixAt(i, b.m); city.setColorAt(i, b.c); });
      city.computeBoundingSphere(); grp.add(city);
    }
  }

  /* ---------- landmarks ---------- */
  const WHITE = lam(0xf2efe6), CREAM = lam(0xe9e1cf), DARK = lam(0x2a2c30), RED = lam(0xb8362c);
  // Coit Tower on Telegraph Hill (Wikipedia, "Coit Tower"): 64 m (210 ft) of unpainted reinforced concrete, an Art
  // Deco column of three nested cylinders. The outer one is a fluted shaft 55 m tall, tapering a little; the
  // observation level, 9.8 m below the top, is a ring of tall arched openings; above it the crown with its smaller
  // arches and a parapet round the open top. At its foot the low rotunda (the lobby with the murals), its terrace and
  // the forecourt to the west. (The shaft's diameter, about 11 m, and the number of flutes, sixteen, are read off
  // photographs.)
  {
    const CON = lam(0xd8cfbb), SHADE = lam(0x5b5650), g = new THREE.Group(), g0 = ground(37.80240, -122.40584);
    // floodlit at night from lamps round its foot: brightest low on the shaft, fading toward the crown (a warm white,
    // from photographs; it is lit in other colours for occasions, which this leaves out)
    floodlit(CON, 0xffdcaa, g0 + 6, g0 + 62, 0.55, 1.1, 'coit');
    glows.push({ ...LL(37.80240, -122.40584), h: g0 + 35, color: 0xffd6a0, i: 0.55, w: 6 });
    g.add(new THREE.Mesh(loft([0, 47, 49], (y, t) => { const R = 5.75 - 0.45 * y / 49, fl = 1 - 0.045 * Math.max(0, Math.cos(t * 16)) ** 3; return [R * fl * Math.cos(t), R * fl * Math.sin(t)]; }, 96), CON));
    // the observation level: the core behind, twelve piers between the arches
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 7.2, 24), SHADE).translateY(52.6));
    for (let k = 0; k < 12; k++) { const t = k * Math.PI / 6, p = new THREE.Mesh(new THREE.BoxGeometry(1.25, 7.2, 1.0), CON); p.position.set(5.0 * Math.cos(t), 52.6, 5.0 * Math.sin(t)); p.rotation.y = -t; g.add(p); }
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(5.35, 5.35, 1.4, 32), CON).translateY(56.9)); // over the arches
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.35, 5, 32), CON).translateY(60.1)); // the crown
    for (let k = 0; k < 24; k++) { const t = (k + 0.5) * Math.PI / 12, w = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.2, 0.3), SHADE); w.position.set(5.22 * Math.cos(t), 60.4, 5.22 * Math.sin(t)); w.rotation.y = -t; g.add(w); }
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.3, 1.4, 32, 1, true), CON).translateY(63.3)); // the parapet
    // the rotunda: a low drum with a flat roof terrace, and the forecourt in front
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(13, 13.5, 7, 32), CON).translateY(3.5));
    g.add(block(30, 22, 0.6, lam(0x9b968c)).translateX(-24)); // the forecourt (parking)
    place(g, 37.80240, -122.40584); // from the DataSF building footprints
  }
  // the Transamerica Pyramid: 260 m, a slim four-sided pyramid with its spire, and the two "wings" for the lifts
  {
    const PYR = lam(0xeae7df), SPIRE = lam(0xe0ddd4);
    litWindows(PYR, { floor: 3.9, bay: 2.8, kind: 'office', seed: 3 });
    floodlit(SPIRE, 0xfff1d8, 0, 1, 1, 1.2, 'spire'); // the aluminium spire, lit from within (Wikipedia, "Transamerica Pyramid")
    const pyr = new THREE.Mesh(new THREE.ConeGeometry(37, 212, 4, 1), PYR); pyr.rotation.y = Math.PI / 4; pyr.position.y = 106;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(4.5, 60, 4, 1), SPIRE); spire.rotation.y = Math.PI / 4; spire.position.y = 230;
    glows.push({ ...LL(37.79519, -122.40279), h: 235, color: 0xfff1d8, i: 0.35, w: 4 });
    const wings = [-1, 1].map(s => { const w = new THREE.Mesh(new THREE.ConeGeometry(9, 160, 4, 1), lam(0xe4e1d9)); w.rotation.y = Math.PI / 4; w.position.set(s * 26, 80, 0); w.scale.set(0.55, 1, 0.55); return w; });
    place(group(pyr, spire, ...wings), 37.79519, -122.40279);
  }
  // the skyline's tallest towers, at their real positions and heights (Wikipedia's pages for each). Their shapes and
  // sizes are simplified from photographs; the SoMa ones are square to Market Street, which runs at 45° (the Ferry
  // Building to Van Ness). Salesforce Tower: 326 m to the top of its crown, roof 296 m; a rounded square that tapers
  // gently and curves in at the top, pearl-white aluminium fins and sunshades over the glass, and the open lattice
  // crown (the "Day for Night" LED screen behind it).
  {
    const FIN = new THREE.MeshPhongMaterial({ color: 0xe1e3e1, specular: 0x777777, shininess: 40 });
    const prof = (y: number) => y < 250 ? 26 - 4 * y / 250 : 22 - 7 * ((y - 250) / 46) ** 2; // half-width (m)
    const t = new THREE.Mesh(loft([0, 60, 120, 180, 230, 250, 265, 280, 290, 296], (y, a) => rsq(a, prof(y), prof(y) * 0.32), 64), FIN);
    litWindows(FIN, { floor: 4.2, bay: 3, kind: 'office', seed: 5, from: 10 });
    const crown = new THREE.Mesh(loft([296, 326], (y, a) => rsq(a, 15 - 3 * (y - 296) / 30, 5), 48, true), new THREE.MeshLambertMaterial({ color: 0xeceeee, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    // the crown's LED display, just inside the lattice (night.ts)
    const show = new THREE.Mesh(loft([298, 324], (y, a) => rsq(a, 14.2 - 3 * (y - 296) / 30, 4.6), 48, true), crownDisplayMaterial(298, 324));
    show.renderOrder = 4; show.visible = false; nightOnly.push(show);
    glows.push({ ...LL(37.7899, -122.3969), h: 311, color: 0xf2f4ff, i: 0.6, w: 10 });
    const g = group(t, crown, show); g.rotation.y = Math.PI / 4; place(group(g), 37.7899, -122.3969);
  }
  const tower = (lat: number, lon: number, h: number, hw: number, hd: number, color: number, opts: { taper?: number; round?: number; spire?: number; rot?: number; home?: boolean } = {}) => {
    const { taper = 1, round = 0.15, spire = 0, rot = 45, home = false } = opts;
    const mat = new THREE.MeshPhongMaterial({ color, specular: 0x444444, shininess: 25 });
    litWindows(mat, { floor: 3.9, bay: 3, kind: home ? 'home' : 'office', seed: Math.round(lat * 1e4) % 97, from: 8 }); // offices, or flats (`home`)
    const m = new THREE.Mesh(loft([0, h], (y, a) => { const k = 1 - (1 - taper) * y / h; return rsq(a, hw * k, Math.min(hw, hd) * k * round, hd / hw); }, 32), mat);
    const g = group(m); if (spire) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, spire, 6), lam(0xd8d8d8)).translateY(h + spire / 2));
    g.rotation.y = rot * Math.PI / 180; place(group(g), lat, lon);
  };
  tower(37.7897, -122.39535, 213, 17, 17, 0xb9c3c8, { taper: 0.62, spire: 32 }); // 181 Fremont: 213 m roof, 245 m spire; tapering, diagonal bracing
  tower(37.7904, -122.3961, 197, 14, 22, 0x8c9ba5, { taper: 0.85, round: 0.5, home: true }); // Millennium Tower (condominiums): 197 m, blue-grey glass
  tower(37.7903, -122.3943, 184, 16, 22, 0xa7b2b6, { round: 0.3 }); // Park Tower at Transbay: 184 m
  tower(37.785778, -122.392139, 195, 15, 22, 0x93a2ab, { round: 0.6, home: true }); // One Rincon Hill (condominiums) (south tower): 195 m
  tower(37.79285, -122.39793, 183, 18, 18, 0x6f7f88, { round: 1 }); // 101 California: 183 m, a faceted glass cylinder
  tower(37.7919, -122.4038, 237, 22, 30, 0x5e4a44, { round: 0.05, rot: 0 }); // 555 California: dark red granite (237 m, Wikipedia's figure not fetched)
  tower(37.7925, -122.4005, 212, 18, 24, 0xc4b2a2, { round: 0.1, rot: 0 }); // 345 California Center: 212 m, pink granite
  // the Ferry Building: the long shed on the Embarcadero, and its 75 m clock tower
  // Its four clock dials, 6.7 m (22 ft) across (Wikipedia, "San Francisco Ferry Building"), high on the tower, showing
  // the time; at night the tower is floodlit and the dials glow from behind (both from photographs).
  {
    const TWR = lam(0xe9e1cf); floodlit(TWR, 0xffe0b0, 2, 62, 0.75, 0.8, 'ferry');
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const cx = cv.getContext('2d')!, tex = new THREE.CanvasTexture(cv);
    clocks.push((hh, mm) => {
      cx.fillStyle = '#f4efe2'; cx.fillRect(0, 0, 128, 128); cx.strokeStyle = '#2a2722'; cx.lineCap = 'round';
      cx.lineWidth = 5; cx.beginPath(); cx.arc(64, 64, 60, 0, 7); cx.stroke();
      for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; cx.lineWidth = 4; cx.beginPath(); cx.moveTo(64 + 50 * Math.sin(a), 64 - 50 * Math.cos(a)); cx.lineTo(64 + 57 * Math.sin(a), 64 - 57 * Math.cos(a)); cx.stroke(); }
      const hand = (a: number, l: number, w: number) => { cx.lineWidth = w; cx.beginPath(); cx.moveTo(64, 64); cx.lineTo(64 + l * Math.sin(a), 64 - l * Math.cos(a)); cx.stroke(); };
      hand(((hh % 12) + mm / 60) * Math.PI / 6, 30, 7); hand(mm * Math.PI / 30, 46, 5); tex.needsUpdate = true;
    });
    const DIAL = new THREE.MeshLambertMaterial({ map: tex }); floodlit(DIAL, 0xfff4dc, 0, 1, 1, 0.9, 'dial');
    const dials = [0, 1, 2, 3].map(k => { const d = new THREE.Mesh(new THREE.CircleGeometry(3.35, 24), DIAL); d.rotation.y = k * Math.PI / 2; d.position.set(8.06 * Math.sin(k * Math.PI / 2), 52, 8.06 * Math.cos(k * Math.PI / 2)); return d; });
    place(group(block(30, 200, 15, CREAM), block(16, 16, 60, TWR, 0), new THREE.Mesh(new THREE.ConeGeometry(9, 15, 4), lam(0x8f8a7c)).translateY(67.5), ...dials), 37.79554, -122.39369, 132, 2);
    glows.push({ ...LL(37.79554, -122.39369), h: 45, color: 0xffe0b0, i: 0.45, w: 6 });
  }
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
  // Golden Gate YC: OpenStreetMap's footprint (way 239024736, 1 Yacht Road: about 22 × 25 m, 8 m high, its long side
  // along the jetty at 259°), on the south edge of the West Harbor jetty; the flagpole on its race deck at the jetty's
  // north seawall, facing the Bay (the start line's inner end: see the Seaweed Soup course files)
  place(block(22, 25, 8, lam(0xf4f1ea)), 37.80773, -122.44259, 79, 2.3);
  place(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 14, 6), WHITE).translateY(7), 37.80799, -122.44260, 0, 2.3);
  // Fort Mason's piers, with the long pier sheds
  // (on the real piers, OpenStreetMap's coast: Piers 1, 2 and 3, ending at 37.8085, 37.8091 and 37.8092; each shed's
  // north end a few metres short of its pier's, turned to the pier: they run 7–14° west of north)
  for (const [end, lon, brg] of [[37.8085, -122.4324, 346], [37.8091, -122.4316, 350], [37.8092, -122.4304, 353]]) {
    const r = brg * Math.PI / 180, back = 80; // the shed's middle, 80 m back along the pier from the end
    place(group(block(20, 150, 3, lam(0x9d968a)), block(18, 140, 13, lam(0xd9cfb8), 3)), end - back * Math.cos(r) / 111320, lon - back * Math.sin(r) / 88000, brg, 0);
  }
  // Fort Point: the brick fort (1853–61) at the foot of the bridge, on the rock blasted down to 15 ft (4.6 m) above
  // the sea (Wikipedia, "Fort Point National Historic Site"): three tiers of casemates round a courtyard, with the
  // lighthouse on its roof. Position and footprint from the DataSF building footprints; the bridge's arch crosses its
  // west end.
  {
    const BRICK = lam(0x9a5a44), g = new THREE.Group(), H = 14;
    for (const [w, d, x, z] of [[56, 10, 0, -43.5], [56, 10, 0, 43.5], [10, 77, -23, 0], [10, 77, 23, 0]] as const) g.add(block(w, d, H, BRICK).translateX(x).translateZ(z));
    g.add(block(36, 77, 0.5, lam(0x8d8170))); // the courtyard
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 8, 8), WHITE).translateY(H + 4).translateZ(-38)); // Fort Point light, on the barbette
    place(g, 37.81055, -122.47710, 56, 4.6);
  }
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
  /* ---------- Angel Island ---------- */
  // The state park: no town, just its woods and the old army and immigration buildings where they stand. Positions
  // are approximate (to about 50 m, from the park's map and Wikipedia; OpenStreetMap wasn't reachable to check them).
  {
    const WALL = lam(0xece6d6), ROOF = lam(0x5e5a56), TILE = lam(0xa4553f), STUC = lam(0xe2dccd), BRK = lam(0x9a5a44);
    /** A building with a pitched roof: w wide, d deep, walls h tall, ridge along its depth. */
    const house = (w: number, d: number, h: number, wall: THREE.Material, roof: THREE.Material) => {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.62, w * 0.62, d, 3, 1), roof);
      r.rotation.x = Math.PI / 2; r.rotation.z = Math.PI / 2; r.scale.set(0.42, 1, 1); r.position.y = h + w * 0.16;
      return group(block(w, d, h, wall), r);
    };
    /** Put it on the island's ground, only where that is land. */
    const on = (o: THREE.Object3D, lat: number, lon: number, brg: number) => { if (ground(lat, lon) > 1 && onAngel(lat, lon)) place(o, lat, lon, brg, ground(lat, lon) - 0.5); };
    // Ayala Cove (once Hospital Cove, the quarantine station of 1891): the ferry landing, the lawn and picnic ground
    // behind the beach, the visitor centre in the old station's headquarters
    on(house(14, 26, 8, WALL, ROOF), 37.8663, -122.4357, 100);
    on(house(9, 14, 5, WALL, ROOF), 37.8660, -122.4367, 100);
    on(house(8, 12, 5, WALL, ROOF), 37.8683, -122.4344, 30);
    on(house(8, 12, 5, WALL, ROOF), 37.8690, -122.4338, 120);
    // the ferry pier and the boat floats in the cove
    place(group(block(5, 60, 1.2, lam(0x8a8378)), block(30, 3, 0.6, lam(0xb9b4aa)).translateZ(-22), block(30, 3, 0.6, lam(0xb9b4aa)).translateZ(-8)), 37.8669, -122.4358, 330, 0.3);
    // Camp Reynolds (the West Garrison, 1863), facing west over the strait's mouth: the officers' houses in a row up
    // the slope above the parade ground, the chapel, and the brick bakery and barracks below
    for (let i = 0; i < 7; i++) on(house(10, 14, 6, WALL, ROOF), 37.8622 - i * 0.0002, -122.4418 - i * 0.0002, 45);
    on(house(9, 16, 6, WALL, ROOF), 37.8608, -122.4445, 270); // the chapel
    on(block(28, 12, 7, BRK), 37.8612, -122.4450, 45); on(house(12, 30, 7, STUC, ROOF), 37.8603, -122.4438, 135);
    // Fort McDowell (the East Garrison, 1910): Mission Revival concrete buildings with tile roofs: the big barracks,
    // the hospital, the mess hall, the officers' row
    on(house(20, 105, 12, STUC, TILE), 37.8615, -122.4210, 150);
    on(house(18, 60, 10, STUC, TILE), 37.8628, -122.4222, 120);
    on(house(16, 45, 8, STUC, TILE), 37.8603, -122.4220, 150);
    for (let i = 0; i < 5; i++) on(house(10, 13, 6, STUC, TILE), 37.8622 - i * 0.0002, -122.4202 - i * 0.0001, 105);
    // the Immigration Station at China Cove (1910): the detention barracks (now the museum) and the hospital
    on(house(14, 48, 8, WALL, ROOF), 37.8697, -122.4260, 135);
    on(house(14, 36, 7, WALL, ROOF), 37.8690, -122.4250, 135);
    // Point Blunt: the Coast Guard light and fog signal on the island's south-east point
    on(group(block(8, 10, 4, WALL), new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 5, 8), WHITE).translateY(6.5)), 37.8533, -122.4196, 0);
  }
  /* ---------- trees ---------- */
  // where the land is wooded (terrain.ts): Angel Island's oak and bay woodland, Yerba Buena Island, Pioneer Park round
  // Coit Tower and the Presidio's planted forest of cypress, pine and eucalyptus, as round canopies 8–16 m across
  {
    const r = rng(11), mats: THREE.Matrix4[] = [], cols: THREE.Color[] = [], m = new THREE.Matrix4(), q = new THREE.Quaternion();
    const greens = ['#3d5634', '#46603a', '#344b2e', '#52683f', '#3f5a3c'].map(h => new THREE.Color(h));
    const STEP = 14, dLat = STEP / 111320, dLon = STEP / 88000;
    const areas: [number, number, number, number, number][] = [ // south, north, west, east, trees per cell
      [37.850, 37.876, -122.449, -122.411, 0.85], [37.804, 37.8155, -122.3745, -122.357, 0.5], [37.8013, 37.8034, -122.4074, -122.4043, 0.6], [37.787, 37.811, -122.486, -122.447, 0.22]];
    for (const [s0, n0, w0, e0, dens] of areas) for (let la = s0; la < n0; la += dLat) for (let lo = w0; lo < e0; lo += dLon) {
      if (r() > dens) continue;
      const lat = la + (r() - 0.5) * dLat, lon = lo + (r() - 0.5) * dLon, p = LL(lat, lon), g = terrain.heightAt(p.x, p.y);
      if (g < 4 || !terrain.wooded(p.x, p.y)) continue;
      const w = 8 + r() * 8, h = w * (0.6 + r() * 0.35);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
      m.compose(P3(p.x, p.y, g + h * 0.55), q, new THREE.Vector3(w / 2, h / 2, w / 2 * (0.8 + r() * 0.4)));
      mats.push(m.clone()); cols.push(greens[Math.floor(r() * greens.length)].clone().offsetHSL(0, 0, (r() - 0.5) * 0.05));
    }
    const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), mats.length);
    mats.forEach((mm, i) => { trees.setMatrixAt(i, mm); trees.setColorAt(i, cols[i]); });
    grp.add(trees);
  }
  // lighthouses: Point Bonita (out at the entrance), Lime Point (the Marin foot of the bridge), Mile Rock (off Lands End)
  place(group(block(7, 9, 5, WHITE), new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 10, 8), WHITE).translateY(5), new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2, 8), RED).translateY(11)), 37.815614, -122.529578);
  place(block(8, 10, 6, WHITE), 37.825447, -122.478321, 0, 3);
  place(group(new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 9, 16), lam(0x55585a)).translateY(4.5), new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 10, 12), WHITE).translateY(14)), 37.79300, -122.51010, 0, 0);
  // the waterfront's lights (the Embarcadero's lamps and the piers, the Marina, the Wharf) reflected in the water:
  // a light every 80 m or so along the city's shore, from the Marina Green to China Basin
  {
    const r = rng(23), x0 = LL(37.8, -122.452).x;
    let acc = 0;
    for (let i = 1; i < LAND.length - 3; i++) { // (the last three close the polygon inland)
      const p = LAND[i], q = LAND[i - 1]; acc += Math.hypot(p.x - q.x, p.y - q.y);
      if (acc < 80 || p.x < x0 || p.y > LL(37.812, 0).y) continue; acc = 0;
      glows.push({ x: p.x, y: p.y, h: 6 + r() * 6, color: r() < 0.6 ? 0xffc98a : 0xf0f2ff, i: 0.35 + r() * 0.3, w: 2 });
    }
    grp.add(glints(glows));
  }
  grp.traverse(o => { o.castShadow = false; o.receiveShadow = false; o.matrixAutoUpdate = true; });
  return terrain;
}

/**
 * A surface lofted through horizontal sections: `ring(y, angle)` gives the outline's point (x, z) at each height,
 * `n` points round. Capped on top unless `open`.
 */
function loft(ys: number[], ring: (y: number, a: number) => [number, number], n: number, open = false): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  ys.forEach(y => { for (let i = 0; i <= n; i++) { const [x, z] = ring(y, i / n * Math.PI * 2); pos.push(x, y, z); } });
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + n + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  if (!open) { const c = pos.length / 3, top = ys[ys.length - 1]; pos.push(0, top, 0); const r0 = (ys.length - 1) * (n + 1); for (let i = 0; i < n; i++) idx.push(c, r0 + i + 1, r0 + i); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** A point at angle `a` round a rounded rectangle of half-width `hw` (half-depth hw·aspect) with corner radius `r`. */
function rsq(a: number, hw: number, r: number, aspect = 1): [number, number] {
  const hx = hw, hz = hw * aspect, c = Math.cos(a), s = Math.sin(a);
  // the superellipse that matches the corner rounding: n large = square, n = 2 = round
  const n = 2 + 18 * Math.max(0, 1 - r / Math.min(hx, hz)) ** 2;
  return [hx * Math.sign(c) * Math.abs(c) ** (2 / n), hz * Math.sign(s) * Math.abs(s) ** (2 / n)];
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
 * At the San Francisco end the side span comes ashore at Fort Point: the cables go down into the anchorage, and the
 * roadway crosses the fort on a steel arch (Strauss's redesign to save the fort: Wikipedia, "Fort Point National
 * Historic Site") between two art-deco concrete pylons, then runs on a steel viaduct over the Presidio until it meets
 * the bluff. At the Marin end it goes on over the anchorage at Lime Point onto the headland.
 */
function buildBridge(scene: THREE.Scene, groundAt: (x: number, y: number) => number): void {
  const ORANGE = new THREE.MeshPhongMaterial({ color: 0xc0362c, specular: 0x331a10, shininess: 12 });
  const DARK = new THREE.MeshPhongMaterial({ color: 0x8e2a22, shininess: 6 }); // recesses and shade
  const CONCRETE = new THREE.MeshLambertMaterial({ color: 0xb8b2a6 });
  // the towers where they stand: OpenStreetMap's tower bases (ways 1329971884 and 1330832681, the same outlines that make
  // them solid in geo/shore.ts PIERS): the midpoint between them, the line through them (354.7°), 1,285 m apart
  const centre = LL(37.819765, -122.47855), bearing = 354.73;
  const g = new THREE.Group();
  const b = bearing * Math.PI / 180, ax = Math.sin(b), ay = Math.cos(b);
  g.position.set(centre.x, 0, -centre.y); g.rotation.y = Math.atan2(ax, -ay); // local z runs along the bridge (south → north), x across, y up
  scene.add(g);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = ORANGE) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  const HALF_SPAN = 642.3, SIDE = 343, LEG_X = 14.5, TOP = 227, SADDLE = 224, MID_CABLE = 81;
  const deckY = (z: number) => 67 - 6 * Math.min(1, (z / HALF_SPAN) ** 2) - (Math.abs(z) > HALF_SPAN ? 4 * Math.min(1.6, (Math.abs(z) - HALF_SPAN) / SIDE) : 0);
  for (const tz of [-HALF_SPAN, HALF_SPAN]) {
    // (the pier, and the south tower's fender, are drawn from their outlines with the other bridge piers: render/wharf.ts)
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
  // the ground under the bridge, by distance along it (local z): the terrain, with the sea at 0
  const ground = (z: number) => Math.max(0, groundAt(centre.x + ax * z, centre.y + ay * z));
  const END = HALF_SPAN + SIDE, ARCH = 98; // the Fort Point arch: about 320 ft between its pylons
  // how far the roadway runs on past each anchorage before the land comes up to it (at most 900 m, the toll plaza)
  const reach = (sgn: number, from: number) => { for (let d = from; d < 900; d += 10) if (ground(sgn * (END + d)) > deckY(sgn * (END + d)) - 4) return d; return 900; };
  const southRun = reach(-1, ARCH + 20), northRun = reach(1, 20);
  // anchorages at each end: the cables go down into them; a stepped art-deco pylon rises through the roadway
  const pylon = (z: number) => {
    const g0 = ground(z), top = deckY(z) + 14;
    box(34, top - g0, 26, 0, (top + g0) / 2, z, CONCRETE);
    box(28, 6, 21, 0, top + 3, z, CONCRETE); box(20, 4, 15, 0, top + 8, z, CONCRETE); // the stepped top
    for (const sx of [-1, 1]) box(1.2, top - g0 - 12, 0.8, sx * 9, (top + g0) / 2, z + 13.2 * Math.sign(z), DARK); // fluting on the faces
  };
  // the San Francisco anchorage at Fort Point
  { const z = -END, g0 = ground(z); box(50, deckY(z) - 6 - g0, 45, 0, (deckY(z) - 6 + g0) / 2, z, CONCRETE); pylon(z); }
  // the Marin anchorage on the hillside at Lime Point, in OpenStreetMap's outlines (scripts/make-marin-piers.mjs): the
  // housing the cables go down into, about 109 × 48 m along the bridge from where the side span ends, and its four pylons,
  // N1 and N2 either side of the roadway, about 9 × 5 m each. Their heights aren't in the data: the housing up to just
  // under the roadway and the pylons standing 14 m above it, as at the San Francisco end (estimates).
  {
    const A = northAnchorage as unknown as { housing: { pts: [number, number][] }; pylons: { pts: [number, number][] }[] };
    const deck = deckY(END), up = (pts: [number, number][], top: number, mat: THREE.Material) => {
      const v = pts.map(q => LL(q[0], q[1])), low = Math.min(...v.map(p => groundAt(p.x, p.y))) - 3; // (into the hillside, down to its lowest corner)
      const sh = new THREE.Shape(); v.forEach((p, i) => i ? sh.lineTo(p.x, p.y) : sh.moveTo(p.x, p.y));
      const geo = new THREE.ExtrudeGeometry(sh, { depth: top - low, bevelEnabled: false }); geo.rotateX(-Math.PI / 2); geo.translate(0, low, 0);
      const m = new THREE.Mesh(geo, mat); scene.add(m); return { v, low };
    };
    up(A.housing.pts, deck - 6, CONCRETE);
    for (const P of A.pylons) {
      const { v } = up(P.pts, deck + 14, CONCRETE);
      // the stepped art-deco top, as the San Francisco pylons'
      const c = v.reduce((a, p) => ({ x: a.x + p.x / v.length, y: a.y + p.y / v.length }), { x: 0, y: 0 });
      for (const [k, h, y] of [[0.8, 3, deck + 15.5], [0.6, 2.5, deck + 18.2]] as const) {
        const shrunk = v.map(p => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k })), sh = new THREE.Shape();
        shrunk.forEach((p, i) => i ? sh.lineTo(p.x, p.y) : sh.moveTo(p.x, p.y));
        const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false }); geo.rotateX(-Math.PI / 2); geo.translate(0, y - h / 2 - 1, 0);
        scene.add(new THREE.Mesh(geo, CONCRETE));
      }
    }
  }
  pylon(-(END + ARCH));
  // the Fort Point arch: two steel ribs under the roadway, springing from the rock either side of the fort, with
  // posts up to the deck
  {
    const z0 = -END, z1 = -(END + ARCH), spring = Math.max(ground(z0), ground(z1)) + 2, crown = deckY(z0) - 9;
    const rib = (u: number) => spring + (crown - spring) * (1 - (2 * u - 1) ** 2);
    for (const sx of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) { const u = i / 24; pts.push(new THREE.Vector3(sx * 9, rib(u), z0 + (z1 - z0) * u)); }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 1.6, 6, false), ORANGE));
      for (let i = 1; i < 12; i++) { const u = i / 12, z = z0 + (z1 - z0) * u, y0 = rib(u), y1 = deckY(z) - 7; if (y1 - y0 > 1) box(1, y1 - y0, 1, sx * 9, (y0 + y1) / 2, z); }
    }
    for (let i = 1; i < 12; i += 2) { const z = z0 + (z1 - z0) * i / 12; box(18, 1.2, 1.2, 0, rib(i / 12) + 0.5, z); } // ties between the ribs
  }
  // the approach viaducts: the trussed roadway on steel towers (bents) every 50 m, down to the ground
  const bents = (sgn: number, from: number, run: number) => {
    for (let d = from; d < run; d += 50) {
      const z = sgn * (END + d), g0 = ground(z), top = deckY(z) - 7.6; if (top - g0 < 3) continue;
      for (const sx of [-1, 1]) box(2.2, top - g0, 3, sx * 11, (top + g0) / 2, z);
      for (let y = g0 + 14; y < top - 4; y += 16) box(22, 1.4, 1.4, 0, y, z);
      box(26, 2, 3.4, 0, top - 1, z);
    }
  };
  bents(-1, ARCH + 50, southRun); bents(1, 50, northRun);
  // the roadway on its stiffening truss: a deck slab, and truss sides drawn on transparent panels
  const Z0 = -(END + southRun), Z1 = END + northRun, N = 140;
  const deckGeo = (yOff: number, h: number) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) { const z = Z0 + (Z1 - Z0) * i / N, y = deckY(z) + yOff; pos.push(0, y - h / 2, z, 0, y + h / 2, z); uv.push(z / 15.2, 0, z / 15.2, 1); }
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
    for (let i = 0; i <= N; i++) { const z = Z0 + (Z1 - Z0) * i / N, y = deckY(z) + 1; pos.push(-13.7, y, z, 13.7, y, z); }
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
  for (let z = Z0 + 20; z < Z1 - 20; z += 50) for (const sx of [-1, 1]) lamps.push(sx * 12.5, deckY(z) + 9, z);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lamps, 3));
  const lp = new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xffc56a, size: 2.2, sizeAttenuation: false, fog: false })); lp.visible = false; g.add(lp); bridgeLights.push(lp);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = false; o.receiveShadow = false; } });
}
