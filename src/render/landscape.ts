import northAnchorage from '../geo/data/gg-north-anchorage.json';
import ferryBuilding from '../geo/data/ferry-building.json';
import './three-setup';
import * as THREE from 'three';
import { LL } from '../geo/geo';
import { LAND, onLand, shoreDist } from '../geo/shore';
import { HARBOR } from '../geo/marina';
import { FORT_MASON_PILES } from '../geo/fortMason';
import { buildTerrain, onAngel, region, type Terrain } from './terrain';
import { P3 } from './coords';
import { inPoly, segPt } from '../core/math';
import { buildBayBridge, BAY_APPROACH } from './bayBridge';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
    // (less Fort Mason's piers: they stand on piles over the water, drawn below; the apron runs straight along the bulkhead
    // across each pier's foot)
    const foot = (p: { x: number; y: number }) => FORT_MASON_PILES.some(f => p.x >= f.box.x0 && p.x <= f.box.x1 && p.y >= f.box.y0 && p.y <= f.box.y1
      && Math.min(...[f.pts[0], f.pts[f.pts.length - 1]].map(q => Math.hypot(p.x - q.x, p.y - q.y))) > 20); // (the apron runs under the deck's shore end: no seam)
    LAND.filter(p => !foot(p)).forEach((p, i) => i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y));
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
  // Sather Tower, the Campanile, on the UC Berkeley campus (1914, John Galen Howard): the East Bay's mark for a bearing
  // across the Central Bay. 93.6 m (307 ft) to its finial (OpenStreetMap way 24024507, height 93.6; Wikipedia "Sather
  // Tower"), at 37.87208 N, 122.25784 W (the outline's centre: OSM; Wikipedia's 37.8719, 122.2578 agrees within 15 m).
  // A steel frame clad in light grey granite. A square shaft about 10 m (33 ft) on a side at its foot, 9.3 m (30 ft
  // 6 in) at 57.8 m (a secondary figure, unconfirmed); the observation deck, the belfry's arcade, at 61 m (200 ft;
  // Wikipedia); the clocks on all four faces. The clocks' size and height, the cap's form (a steep pyramid with a small
  // lantern and finial) and its proportions are read off photographs. Not lit here: no source for its night lighting.
  {
    // (flat-shaded: a square shaft's faces are flat, not a cylinder's rounded light)
    const GRANITE = new THREE.MeshLambertMaterial({ color: 0xd6d3cb, flatShading: true }), SHADE = lam(0x4f4c47), DIAL = lam(0xece8dc), g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(9.3 / Math.SQRT2, 10.06 / Math.SQRT2, 57.8, 4, 1), GRANITE);
    shaft.rotation.y = Math.PI / 4; shaft.position.y = 57.8 / 2; g.add(shaft);
    // the clock faces, one on each side below the belfry (5.2 m across: the 17 ft UC Berkeley gives, read as the dial)
    for (let k = 0; k < 4; k++) { const d = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), DIAL), a = k * Math.PI / 2; d.position.set(4.72 * Math.sin(a), 50, 4.72 * Math.cos(a)); d.rotation.y = a; g.add(d); }
    // the belfry: a dark core behind an arcade, three piers to a side, under a cornice
    g.add(block(7.4, 7.4, 9, SHADE, 57.8));
    for (let side = 0; side < 4; side++) for (let k = -1; k <= 1; k += 2) {
      const pier = block(1.6, 1.6, 9, GRANITE, 57.8), a = side * Math.PI / 2, u = 3.85, v = k * 3.85;
      pier.position.x = u * Math.sin(a) + v * Math.cos(a); pier.position.z = u * Math.cos(a) - v * Math.sin(a); g.add(pier);
    }
    g.add(block(10.4, 10.4, 1.6, GRANITE, 66.8)); // the cornice over the arcade
    // the cap: a steep pyramid to a small flat top, the lantern on it
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.6 / Math.SQRT2, 10.4 / Math.SQRT2, 19, 4, 1), GRANITE); cap.rotation.y = Math.PI / 4; cap.position.y = 68.4 + 9.5; g.add(cap);
    g.add(block(1.6, 1.6, 3.2, GRANITE, 87.4)); // the lantern
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3, 8), SHADE); fin.position.y = 92.1; g.add(fin); // the finial, to 93.6 m
    place(g, 37.87208, -122.25784);
  }
  // The Claremont Hotel (1915; now the Claremont Club & Spa), on the hillside at the mouth of Claremont Canyon: a long
  // white Tudor Revival building, "one of the world's tallest wooden buildings", its central tower 49 m (160 ft) and ten
  // storeys at the tower (Wikipedia "Claremont Hotel"; OSM building:levels 10). Painted white since 1937. Its outline is
  // OpenStreetMap's (way 41745855, 47 corners, 177 m north–south by 93 m). The wings' height (about five storeys, 18 m),
  // the dark roofs and where the tower stands in the outline (by its middle) are read off photographs: OSM doesn't tag the
  // tower separately. Its rooms lit in the evening like homes (night.ts).
  {
    const WHITE_WALL = new THREE.MeshLambertMaterial({ color: 0xf1efe8, flatShading: true }), ROOF = new THREE.MeshLambertMaterial({ color: 0x55585b, flatShading: true }), at = { lat: 37.85945, lon: -122.24185 };
    litWindows(WHITE_WALL, { floor: 3.4, bay: 3.0, kind: 'home', seed: 11 });
    const OUTLINE: [number, number][] = [[37.8591757, -122.2425210], [37.8586557, -122.2419335], [37.8587252, -122.2418338], [37.8587433, -122.2418502], [37.8588493, -122.2416907], [37.8589103, -122.2417530], [37.8590960, -122.2415244], [37.8591920, -122.2416383], [37.8592801, -122.2415301], [37.8594052, -122.2416787], [37.8593658, -122.2417377], [37.8594837, -122.2417530], [37.8595002, -122.2416812], [37.8595701, -122.2417300], [37.8595450, -122.2419315], [37.8595749, -122.2419365], [37.8595811, -122.2418782], [37.8596118, -122.2418842], [37.8596243, -122.2417797], [37.8597590, -122.2418078], [37.8598490, -122.2419552], [37.8598832, -122.2419228], [37.8599244, -122.2419661], [37.8599411, -122.2419982], [37.8599094, -122.2420292], [37.8600500, -122.2422490], [37.8602455, -122.2423113], [37.8602270, -122.2425790], [37.8600019, -122.2425505], [37.8599797, -122.2425684], [37.8599568, -122.2425774], [37.8599321, -122.2425783], [37.8599153, -122.2425590], [37.8599021, -122.2425366], [37.8598961, -122.2424998], [37.8598968, -122.2424779], [37.8598067, -122.2423370], [37.8597908, -122.2423521], [37.8597753, -122.2423669], [37.8597356, -122.2423555], [37.8597401, -122.2423038], [37.8593760, -122.2422370], [37.8593442, -122.2422854], [37.8593606, -122.2423060], [37.8593283, -122.2423520], [37.8592961, -122.2423978], [37.8592774, -122.2423820]];
    const o = LL(at.lat, at.lon), local = OUTLINE.map(([la, lo]) => { const q = LL(la, lo); return { x: q.x - o.x, y: q.y - o.y }; });
    // on its hillside: the walls run down to the lowest corner's ground, the roofs level at the tower's ground + 18 m
    const g0 = ground(at.lat, at.lon), low = Math.min(...OUTLINE.map(([la, lo]) => ground(la, lo)));
    const shape = new THREE.Shape(); local.forEach((q, i) => i ? shape.lineTo(q.x, q.y) : shape.moveTo(q.x, q.y));
    const wings = new THREE.ExtrudeGeometry(shape, { depth: g0 + 18 - (low - 2), bevelEnabled: false }); wings.rotateX(-Math.PI / 2); wings.translate(0, low - 2 - g0, 0);
    const roofs = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false }); roofs.rotateX(-Math.PI / 2); roofs.translate(0, 18, 0);
    const g = group(new THREE.Mesh(wings, WHITE_WALL), new THREE.Mesh(roofs, ROOF));
    // the central tower: a square tower rising well clear of the wings to its belvedere, and a steep spire to 49 m
    g.add(block(13, 13, 36 - 18, WHITE_WALL, 18));
    const top = new THREE.Mesh(new THREE.ConeGeometry(13 / Math.SQRT2 + 0.5, 13, 4, 1), ROOF); top.rotation.y = Math.PI / 4; top.position.y = 36 + 6.5; g.add(top);
    place(g, at.lat, at.lon, 0, g0);
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
  // the Ferry Building (1898), from OpenStreetMap (src/geo/data/ferry-building.json, scripts/make-ferry-building.mjs):
  // the building's own outline, its 16.1 m hall, the clock tower stage by stage at OSM's heights (a 16 m square shaft to
  // 43.5 m, setting back to a round cupola at 70 m), and the floating ferry gates B–G on the Bay side with their shelters.
  // The four clock dials are 6.7 m (22 ft) across; "the entire base is an arched arcade" (Wikipedia, "San Francisco
  // Ferry Building"). The tower's height is given as 235 ft (71 m) to 245 ft (75 m) (Wikipedia and others): OSM's
  // cupola tops out at 70 m, and the flagstaff on it takes the tower to 75 m. At night the tower is floodlit and the
  // dials glow from behind (photographs).
  // Reasonable calls, not from a source: the dials sit at the top of the shaft; the arcade's bays are drawn 6 m wide;
  // the colours; and the PORT OF SAN FRANCISCO sign (put up on the Bay side in 1951–52: photo captions, OpenSFHistory)
  // is drawn in dark letters standing on the Bay face's roofline across from the tower, unlit: its lettering, colour and lighting weren't found
  // (the Port's own Ferry Building Sign Guidelines are only at its Pier 1 offices: sfport.com, Sign Guidelines, 2021).
  {
    type Way = { pts: [number, number][]; height?: string };
    const fb = ferryBuilding as unknown as { building: Way; hall: { height: string }; tower: Way[]; gates: Way[]; roofs: Way[] };
    const B0 = 2, HALL = parseFloat(fb.hall.height); // the ground at the building (the Embarcadero's deck), and the hall's height
    /** a way's outline in the sim's metres, anticlockwise (so outward is to the right of each edge) */
    const ring = (w: Way) => { const r = w.pts.map(q => LL(q[0], q[1])); return r.reduce((s, p, i) => s + p.x * r[(i + 1) % r.length].y - r[(i + 1) % r.length].x * p.y, 0) < 0 ? r.reverse() : r; };
    const slab = (pts: { x: number; y: number }[], y0: number, y1: number) => {
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, p.y))), { depth: y1 - y0, bevelEnabled: false });
      g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); return g;
    };
    const fbg = new THREE.Group(); grp.add(fbg);
    const ROOF = lam(0x9a968c), TWR = lam(0xe9e1cf), DECK = lam(0x77736b), SHELTER = lam(0x8d9296), POLE = lam(0x3a3a38);
    floodlit(TWR, 0xffe0b0, 2, 72, 0.75, 0.8, 'ferry');
    // the hall: its outline from the water's edge up to 16.1 m, roof grey, walls stone
    const hall = ring(fb.building);
    fbg.add(new THREE.Mesh(slab(hall, B0 - 3, B0 + HALL), [ROOF, CREAM]));
    // the arcade along both long faces: arches at the street, a row of windows above, on the walls facing the
    // Embarcadero (south-west) and the Bay (north-east)
    {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const c = cv.getContext('2d')!;
      c.fillStyle = '#e9e1cf'; c.fillRect(0, 0, 64, 128);
      c.fillStyle = '#3b3631'; // (v from the foot: the canvas's bottom is the street)
      c.beginPath(); c.moveTo(10, 128); c.lineTo(10, 92); c.arc(32, 92, 22, Math.PI, 0); c.lineTo(54, 128); c.fill(); // the arch, 0–6 m
      c.fillRect(20, 30, 24, 32); // an upper window
      c.fillStyle = '#d6cdb8'; c.fillRect(0, 64, 64, 4); c.fillRect(0, 0, 64, 6); // the string course and the cornice
      const tex = new THREE.CanvasTexture(cv); tex.wrapS = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
      const geos: THREE.BufferGeometry[] = [], BAY = 6;
      for (let i = 0; i < hall.length; i++) {
        const a = hall[i], b = hall[(i + 1) % hall.length], L = Math.hypot(b.x - a.x, b.y - a.y);
        const brg = (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360;
        if (L < 3 || !(Math.abs(brg - 144) < 10 || Math.abs(brg - 324) < 10)) continue; // the long faces only
        const n = Math.max(1, Math.round(L / BAY)), g = new THREE.PlaneGeometry(L, HALL);
        const uv = g.getAttribute('uv') as THREE.BufferAttribute; for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * n);
        const ox = (b.y - a.y) / L * 0.15, oy = -(b.x - a.x) / L * 0.15; // (out from the wall)
        g.rotateY(Math.atan2(b.y - a.y, b.x - a.x)); // (the plane's x along the wall, its face outward)
        g.translate(...P3((a.x + b.x) / 2 + ox, (a.y + b.y) / 2 + oy, B0 + HALL / 2).toArray());
        geos.push(g);
      }
      const m = mergeGeometries(geos); geos.forEach(g => g.dispose());
      if (m) fbg.add(new THREE.Mesh(m, new THREE.MeshLambertMaterial({ map: tex })));
    }
    // the clock tower, each stage on OSM's footprint up to OSM's height, and the flagstaff to 75 m
    let y = B0;
    for (const t of fb.tower) { const h = B0 + parseFloat(t.height!); fbg.add(new THREE.Mesh(slab(ring(t), y - 0.5, h), TWR)); y = h; }
    const top = ring(fb.tower[fb.tower.length - 1]), tc = top.reduce((s, p) => ({ x: s.x + p.x / top.length, y: s.y + p.y / top.length }), { x: 0, y: 0 });
    fbg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, B0 + 75 - y, 6).translate(...P3(tc.x, tc.y, (y + B0 + 75) / 2).toArray()), POLE));
    // the four dials, one on each face of the shaft, near its top
    {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128; const cx = cv.getContext('2d')!, tex = new THREE.CanvasTexture(cv);
      clocks.push((hh, mm) => {
        cx.fillStyle = '#f4efe2'; cx.fillRect(0, 0, 128, 128); cx.strokeStyle = '#2a2722'; cx.lineCap = 'round';
        cx.lineWidth = 5; cx.beginPath(); cx.arc(64, 64, 60, 0, 7); cx.stroke();
        for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; cx.lineWidth = 4; cx.beginPath(); cx.moveTo(64 + 50 * Math.sin(a), 64 - 50 * Math.cos(a)); cx.lineTo(64 + 57 * Math.sin(a), 64 - 57 * Math.cos(a)); cx.stroke(); }
        const hand = (a: number, l: number, w: number) => { cx.lineWidth = w; cx.beginPath(); cx.moveTo(64, 64); cx.lineTo(64 + l * Math.sin(a), 64 - l * Math.cos(a)); cx.stroke(); };
        hand(((hh % 12) + mm / 60) * Math.PI / 6, 30, 7); hand(mm * Math.PI / 30, 46, 5); tex.needsUpdate = true;
      });
      const DIAL = new THREE.MeshLambertMaterial({ map: tex }); floodlit(DIAL, 0xfff4dc, 0, 1, 1, 0.9, 'dial');
      const sh = ring(fb.tower[0]), shTop = B0 + parseFloat(fb.tower[0].height!), R = 6.7 / 2;
      for (let i = 0; i < sh.length; i++) {
        const a = sh[i], b = sh[(i + 1) % sh.length], L = Math.hypot(b.x - a.x, b.y - a.y);
        const d = new THREE.Mesh(new THREE.CircleGeometry(R, 24), DIAL);
        d.rotation.y = Math.atan2(b.y - a.y, b.x - a.x);
        d.position.copy(P3((a.x + b.x) / 2 + (b.y - a.y) / L * 0.08, (a.y + b.y) / 2 - (b.x - a.x) / L * 0.08, shTop - R - 0.9));
        fbg.add(d);
      }
    }
    // the sign on the Bay face, standing on its roof edge square across from the tower (the hall's Bay face is
    // stepped there, so the letters stand along the roofline rather than on any one wall)
    {
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 64; const c = cv.getContext('2d')!;
      c.fillStyle = '#2b2622'; c.font = 'bold 54px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('PORT OF SAN FRANCISCO', 512, 34);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      // out from the tower toward the Bay (bearing 54°, square to the building's long axis at 144°: the outline's
      // long sides), to where that line leaves the hall's outline
      const n = { x: Math.sin(54 * Math.PI / 180), y: Math.cos(54 * Math.PI / 180) };
      let far = 0;
      for (let i = 0; i < hall.length; i++) {
        const a = hall[i], b = hall[(i + 1) % hall.length], ex = b.x - a.x, ey = b.y - a.y, den = n.x * ey - n.y * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((a.x - tc.x) * ey - (a.y - tc.y) * ex) / den, u = ((a.x - tc.x) * n.y - (a.y - tc.y) * n.x) / den;
        if (u >= 0 && u <= 1 && t > far) far = t;
      }
      const W = 40, s = new THREE.Mesh(new THREE.PlaneGeometry(W, W / 16), new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.4 }));
      s.rotation.y = Math.atan2(n.x, -n.y); // (the plane's face out along n)
      s.position.copy(P3(tc.x + n.x * (far - 1), tc.y + n.y * (far - 1), B0 + HALL + W / 32));
      fbg.add(s);
    }
    // the ferry gates: floating concrete pontoons riding 0.8 m out of the water, and the shelters over them at OSM's
    // heights, on posts
    for (const g of fb.gates) fbg.add(new THREE.Mesh(slab(ring(g), -0.6, 0.8), DECK));
    for (const r of fb.roofs) {
      const pts = ring(r), h = parseFloat(r.height!);
      fbg.add(new THREE.Mesh(slab(pts, h - 0.5, h), SHELTER));
      pts.forEach((p, i) => { if (i % 3 === 0) fbg.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, h - 0.8, 0.4).translate(...P3(p.x, p.y, (h + 0.8) / 2).toArray()), POLE)); });
    }
    mergeByMaterial(fbg, [TWR, DECK, SHELTER, POLE]);
    glows.push({ ...tc, h: 45, color: 0xffe0b0, i: 0.45, w: 6 });
  }
  // Sutro Tower (1973) on Mount Sutro, the city's mark you see from all over the Bay. Wikipedia ("Sutro Tower"): a three-
  // legged steel truss 297.8 m (977 ft) to its top from a base 254.2 m (834 ft) above the sea; the legs' triangle 45.7 m
  // (150 ft) a side at the base, drawn in to 18.3 m (60 ft) at the waist and out again to 30.5 m (100 ft) at the
  // antenna level; Level 6, the outriggers' deck, at 228.8 m (751 ft). The steel ends at 237.7 m (779.9 ft, "structure
  // height excluding appurtenances": ASR 1001289 as the FCC's licence records repeat it), and three antenna stacks stand
  // above it, one over each leg, to the top. Painted in alternate bands of aviation orange and white, orange at top and
  // bottom (FAA AC 70/7460-1: bands about a seventh of the height, none over 100 ft: eleven of 27 m here; the tower's own
  // count isn't published that we could reach). Lit (Sutro Tower Inc., after the 2020 repack): a medium-intensity beacon
  // on each stack's top, flashing white by day and red at night, and six steady red lights on Level 6's outriggers. The
  // waist's height (about 152 m), the outriggers' reach and the stacks' girth (3 m) are read off photographs.
  // (It was drawn before with thin rods above 230 m that vanished at any distance: the "decapitated" look.)
  {
    const H = 297.7, STEEL = 237.7, L6 = 228.8, WAIST = 152, BAND = H / 11, g = new THREE.Group();
    const ORANGE = lam(0xd9532c), WHITE = lam(0xf2f0ea), DECK = lam(0x8a8a86);
    const tri = (side: number, y: number) => [0, 1, 2].map(k => new THREE.Vector3(side / Math.sqrt(3) * Math.sin(k * 2.0944), y, side / Math.sqrt(3) * Math.cos(k * 2.0944)));
    // a member from a to b, r thick, coloured by the band each piece of it is in (cut at the bands' edges)
    const member = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
      const cuts = [0, 1]; for (let y = BAND; y < H; y += BAND) { const t = (y - a.y) / (b.y - a.y); if (t > 0 && t < 1) cuts.push(t); }
      cuts.sort((u, v) => u - v);
      for (let i = 0; i < cuts.length - 1; i++) {
        const p0 = a.clone().lerp(b, cuts[i]), p1 = a.clone().lerp(b, cuts[i + 1]), len = p0.distanceTo(p1); if (len < 0.05) continue;
        const band = Math.floor(((p0.y + p1.y) / 2) / BAND), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), band % 2 === 0 ? ORANGE : WHITE);
        m.position.copy(p0).lerp(p1, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize()); g.add(m);
      }
    };
    const base = tri(45.7, 0), waist = tri(18.3, WAIST), l6 = tri(30.5, L6), top = tri(30.5, STEEL), tips = tri(30.5, H);
    for (let k = 0; k < 3; k++) {
      member(base[k], waist[k], 2.4); member(waist[k], l6[k], 2.2); member(l6[k], top[k], 2.2); // the legs
      member(top[k], tips[k], 1.5); // the antenna stack over the leg
    }
    // the horizontal frames between the legs: low down, at the waist, Level 6 and the top of the steel
    for (const lvl of [tri(36, 60), waist, l6, top]) for (let k = 0; k < 3; k++) member(lvl[k], lvl[(k + 1) % 3], 1.1);
    // Level 6's deck, and its outriggers reaching out past each leg
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(30.5 / Math.sqrt(3) + 2, 30.5 / Math.sqrt(3) + 2, 1.6, 3), DECK); deck.position.y = L6; g.add(deck);
    const reach = tri(30.5 + 2 * 9 * Math.sqrt(3), L6); // (9 m beyond each leg)
    for (let k = 0; k < 3; k++) member(l6[k], reach[k], 1.0);
    // the lights: points of a fixed size on screen (a light at night is seen from far beyond where its lamp would be a
    // pixel), the beacons flashing (sutroBeacons, scene.ts), the outriggers' six steady
    const pts = (ps: THREE.Vector3[], color: number, size: number) => { const geo = new THREE.BufferGeometry().setFromPoints(ps); const o = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, fog: false })); o.visible = false; g.add(o); return o; };
    const beaconAt = tips.map(t => t.clone().setY(H + 0.8));
    sutroBeacons.red = pts(beaconAt, 0xff2a1a, 4); sutroBeacons.white = pts(beaconAt, 0xffffff, 3);
    const steady: THREE.Vector3[] = []; for (let k = 0; k < 3; k++) { steady.push(reach[k].clone().setY(L6 + 1)); steady.push(l6[k].clone().lerp(l6[(k + 1) % 3], 0.5).setY(L6 + 1)); }
    bridgeLights.push(pts(steady, 0xff2a1a, 3));
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
  // Fort Mason's three piers, as in the owner's photos (reference/photos/fort-mason-pier-piles-gashouse-exit.jpg,
  // gashouse-cove-exit-breakwater-and-fort-mason.jpg): each a deck on its own outline (geo/fortMason.ts, the same the
  // physics stops a boat on), on rows of massive round concrete columns with flared caps and the water running through, and
  // on top the long white pier shed, nearly flush with the deck's edge, rows of red-framed windows, and FORT MASON lettered
  // along Pier 3's west face toward the Gashouse Cove entrance. The sheds' heights are OpenStreetMap's (Bay East's
  // pile-piers data: Pier 1 17 m, Pier 2 16 m, Pier 3 13 m). ESTIMATES (from the photos; no survey found): the deck's top
  // about 4 m above the water and its edge beam 1 m deep; the columns about 1.4 m across, some 7.5 m apart each way, weathered
  // dark toward the waterline.
  {
    const deckMat = lam(0x9d968a), colMat = new THREE.MeshLambertMaterial({ vertexColors: true }), D = 1.0, R = 0.7, PITCH = 7.5, HEIGHT: Record<string, number> = { "Fort Mason's Pier 1": 17, "Fort Mason's Pier 2": 16, "Fort Mason's Pier 3": 13 };
    const decks: THREE.BufferGeometry[] = [], at: THREE.Vector3[] = [];
    for (const f of FORT_MASON_PILES) {
      const sh = new THREE.Shape(); f.pts.forEach((p, i) => i ? sh.lineTo(p.x, p.y) : sh.moveTo(p.x, p.y));
      const g = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, PIER_DECK - D, 0); decks.push(g);
      // the pier's own axis: along its longest side, toward its end; across it, its own width
      const n0 = f.pts.length, side = f.pts.map((p, i) => [p, f.pts[(i + 1) % n0]]).sort(([a1, b1], [a2, b2]) => Math.hypot(b2.x - a2.x, b2.y - a2.y) - Math.hypot(b1.x - a1.x, b1.y - a1.y))[0];
      const sl = Math.hypot(side[1].x - side[0].x, side[1].y - side[0].y); let u = { x: (side[1].x - side[0].x) / sl, y: (side[1].y - side[0].y) / sl };
      const cen = f.pts.reduce((m, p) => ({ x: m.x + p.x / n0, y: m.y + p.y / n0 }), { x: 0, y: 0 });
      if (u.y < 0) u = { x: -u.x, y: -u.y }; // (toward the Bay, north)
      const nrm = { x: u.y, y: -u.x }, along = f.pts.map(p => (p.x - cen.x) * u.x + (p.y - cen.y) * u.y), across = f.pts.map(p => (p.x - cen.x) * nrm.x + (p.y - cen.y) * nrm.y);
      const a0 = Math.min(...along), a1 = Math.max(...along), c0 = Math.min(...across), c1 = Math.max(...across), mid = (c0 + c1) / 2;
      // the columns: rows along the pier, the outer rows a little in from the deck's edge
      for (let s2 = a0 + 2; s2 <= a1 - 1; s2 += PITCH) for (let t = c0 + 1.2; t <= c1 - 1.1; t += Math.max(4, (c1 - c0 - 2.3) / Math.max(1, Math.round((c1 - c0 - 2.3) / PITCH)))) {
        const q = { x: cen.x + u.x * s2 + nrm.x * t, y: cen.y + u.y * s2 + nrm.y * t };
        if (inPoly(q, f.pts) && f.pts.every((p, i) => segPt(q, p, f.pts[(i + 1) % n0]) > 0.8)) at.push(P3(q.x, q.y, 0));
      }
      // the shed: its own width less a metre a side, from a few metres in from the shore end to 6 m short of the pier's end
      const w = c1 - c0 - 2, len = a1 - a0 - 12, cS = a0 + 6 + len / 2, c = { x: cen.x + u.x * cS + nrm.x * mid, y: cen.y + u.y * cS + nrm.y * mid };
      const ht = HEIGHT[f.name] ?? 13, wall = shedWall(len, ht, false), sign = f.name === "Fort Mason's Pier 3" ? shedWall(len, ht, true) : wall, end = shedWall(w, ht, false), roof = lam(0x8e8c86);
      // (BoxGeometry's faces: +x, −x, +y, −y, +z, −z; turned to the pier, −x faces west)
      const shed = new THREE.Mesh(new THREE.BoxGeometry(w, ht, len), [wall, sign, roof, roof, end, end]);
      shed.position.copy(P3(c.x, c.y, PIER_DECK + ht / 2)); shed.rotation.y = -Math.atan2(u.x, u.y); grp.add(shed);
    }
    grp.add(new THREE.Mesh(mergeGeometries(decks), deckMat));
    // a column and its flared cap, from 4 m below the surface to the deck's underside
    const colH = PIER_DECK - D + 4, capH = 0.9;
    const col = mergeGeometries([new THREE.CylinderGeometry(R, R, colH - capH, 14, 6).translate(0, (colH - capH) / 2 - 4, 0), new THREE.CylinderGeometry(R * 2, R, capH, 14).translate(0, colH - capH / 2 - 4, 0)]);
    // (pale concrete, darker and greener toward the water: the photos' tide line and weed)
    { const pos = col.getAttribute('position'), cols: number[] = []; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), k = Math.max(0, Math.min(1, (y + 0.2) / 1.6)); cols.push(0.36 + 0.42 * k, 0.37 + 0.40 * k, 0.33 + 0.38 * k); } col.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); }
    const piles = new THREE.InstancedMesh(col, colMat, at.length), m = new THREE.Matrix4();
    at.forEach((v, i) => piles.setMatrixAt(i, m.makeTranslation(v.x, 0, v.z)));
    grp.add(piles);
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
    // in tiles 1 km on a side, so the woods behind the camera and off the sides aren't drawn, each as round canopies
    // near by and as simpler ones beyond 2.5 km, where a canopy is a few pixels across (20 faces near, 8 far)
    const treeMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const nearG = new THREE.IcosahedronGeometry(1, 0), farG = new THREE.OctahedronGeometry(1, 0), at = new THREE.Vector3();
    const tiles = new Map<number, number[]>();
    mats.forEach((mm, i) => { at.setFromMatrixPosition(mm); const key = Math.floor(at.x / 1000) * 1000 + Math.floor(at.z / 1000); (tiles.get(key) ?? tiles.set(key, []).get(key)!).push(i); });
    for (const list of tiles.values()) {
      const lod = new THREE.LOD();
      for (const [geo, far] of [[nearG, 0], [farG, 2500]] as const) {
        const t = new THREE.InstancedMesh(geo, treeMat, list.length);
        list.forEach((k, i) => { t.setMatrixAt(i, mats[k]); t.setColorAt(i, cols[k]); });
        t.computeBoundingSphere(); lod.addLevel(t, far);
      }
      // (the LOD's distance is to its own position: put it in the tile's middle, the canopies' matrices relative to it)
      const c = (lod.levels[0].object as THREE.InstancedMesh).boundingSphere!.center.clone();
      lod.position.copy(c);
      for (const lv of lod.levels) { const t = lv.object as THREE.InstancedMesh, mm = new THREE.Matrix4(), sh = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z);
        for (let i = 0; i < t.count; i++) { t.getMatrixAt(i, mm); t.setMatrixAt(i, mm.premultiply(sh)); } t.instanceMatrix.needsUpdate = true; t.computeBoundingSphere(); }
      grp.add(lod);
    }
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
 * Sutro Tower's three beacons (medium intensity, FAA L-864/L-865): red flashes at night, white by day, 30 a minute (the
 * FAA's 20–40), each lit for a third of a second (scene.ts).
 */
export const sutroBeacons: { red?: THREE.Object3D; white?: THREE.Object3D } = {};
/** Fort Mason's pier decks' top above the water, m (ESTIMATE: no survey found). */
const PIER_DECK = 4;

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
  // the hundreds of beams, struts and panels in one mesh a colour: drawn as a few draw calls, not one each
  mergeByMaterial(g, [ORANGE, DARK]);
}

/** Bake a group's meshes of each of `mats` into one mesh per material (their own transforms baked in). */
function mergeByMaterial(g: THREE.Group, mats: THREE.Material[]): void {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  for (const mat of mats) {
    const parts: THREE.Mesh[] = [];
    g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.material === mat && m.visible) parts.push(m); });
    if (parts.length < 2) continue;
    const geos = parts.map(m => { const gg = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); gg.deleteAttribute('uv'); return gg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); });
    const merged = mergeGeometries(geos); geos.forEach(x => x.dispose());
    if (!merged) continue;
    for (const m of parts) { m.parent!.remove(m); m.geometry.dispose(); }
    const one = new THREE.Mesh(merged, mat); one.castShadow = false; one.receiveShadow = false; g.add(one);
  }
}

/** A Fort Mason shed's wall, `len` m long and `ht` m high: white, three rows of red-framed windows (the photos), and on
 * Pier 3's west face FORT MASON along its top. */
function shedWall(len: number, ht: number, lettered: boolean): THREE.Material {
  const px = 8, W = Math.min(4096, Math.round(len * px)), H = Math.round(ht * px * 2) / 2 * 2;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d')!;
  const s = W / len; // (pixels a metre)
  c.fillStyle = '#ebe8e0'; c.fillRect(0, 0, W, H);
  for (const [y0, wh] of [[0.5, 0.16], [0.3, 0.12], [0.12, 0.1]] as const) for (let x = 2; x < len - 3; x += 6) { // (three rows, the top one below the lettering's band, as in the photo)
    const x0 = x * s, y1 = H - (y0 + wh) * H, ww = 4 * s, hh = wh * H;
    c.fillStyle = '#5a6266'; c.fillRect(x0, y1, ww, hh); // (the glass)
    c.strokeStyle = '#8a3a2a'; c.lineWidth = Math.max(2, s * 0.12); c.strokeRect(x0, y1, ww, hh); // (the red frame)
    c.lineWidth = Math.max(1, s * 0.05); c.beginPath(); for (let k = 1; k < 6; k++) { c.moveTo(x0 + ww * k / 6, y1); c.lineTo(x0 + ww * k / 6, y1 + hh); } for (let k = 1; k < 3; k++) { c.moveTo(x0, y1 + hh * k / 3); c.lineTo(x0 + ww, y1 + hh * k / 3); } c.stroke(); // (the panes' mullions)
  }
  if (lettered) { // (big, a floor tall, along the top between the roof and the windows, tightly set)
    c.fillStyle = '#1c1c1c'; c.font = `bold ${Math.round(H * 0.26)}px Arial, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    (c as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.round(H * 0.1)}px`; c.fillText('FORT MASON', W / 2, H * 0.18);
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  // (a little of its own light: white paint in the shade still reads white under the sky, not grey)
  return new THREE.MeshLambertMaterial({ map: tex, emissive: 0x404040, emissiveMap: tex });
}
