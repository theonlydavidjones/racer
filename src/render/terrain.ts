import './three-setup';
import * as THREE from 'three';
import terrainPng from './data/terrain.png?inline';
import meta from './data/terrain.json';
import { LL } from '../geo/geo';
import { onGround } from '../geo/shore';
import { inBasin } from '../geo/marina';

/**
 * The land around the race area from real elevation data (scripts/fetch-terrain.mjs: USGS-derived open terrain
 * tiles, 50 m grid): the Presidio and the city's hills, the Marin Headlands and Mt Tamalpais, Angel Island and
 * Alcatraz. Along the San Francisco shore, where the boats sail, the land follows the sim's own coastline (the
 * one boats run aground on); elsewhere it follows the elevation data. Coloured by what's there (city, the
 * Presidio's woods, grassland, chaparral, beach and rock), and by season: the grass is gold from late spring
 * to the first rains, green through winter.
 */

export interface Terrain {
  /** Height of the land (m) at a point in course coordinates; ≤ 0 over water. */
  heightAt(x: number, y: number): number;
  mesh: THREE.Mesh;
  /** Warm points where the city is, lit at dusk. */
  lights: THREE.Points;
  /** Recolour for the season (month 1–12). */
  setSeason(month: number): void;
  /** Is the land at a point (course coordinates) wooded? (For planting trees.) */
  wooded(x: number, y: number): boolean;
}

const M = meta as { south: number; north: number; west: number; east: number; nx: number; ny: number; scale: number };

async function loadHeights(): Promise<Float32Array> {
  const img = new Image(); img.src = terrainPng; await img.decode();
  const cv = document.createElement('canvas'); cv.width = M.nx; cv.height = M.ny;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, M.nx, M.ny).data, h = new Float32Array(M.nx * M.ny);
  for (let i = 0; i < h.length; i++) { const g = d[i * 4]; h[i] = g === 0 ? -1 : (g - 1) * M.scale; }
  return h;
}

/** Simple deterministic noise for colour variation. */
const hash = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };

export type Region = 'city' | 'woods' | 'grass' | 'suburb' | 'rock' | 'island' | 'port';

/** The Port of Oakland's terminals and the old Naval Air Station at Alameda Point: flat paved fill, no houses. */
export const onPort = (lat: number, lon: number): boolean =>
  (lat > 37.793 && lat < 37.8195 && lon > -122.335 && lon < -122.296) || // the Outer and Middle Harbor terminals and the old Army base
  (lat > 37.7695 && lat < 37.7955 && lon > -122.3295 && lon < -122.3); // Alameda Point: the runways, hangars and piers

/** Angel Island's cells in the elevation grid (found by flooding the land out from Mount Livermore), once loaded. */
let ANGEL: Uint8Array | null = null;
/** Is this point on Angel Island? */
export function onAngel(lat: number, lon: number): boolean {
  if (!ANGEL) return false;
  const i = Math.round((lon - M.west) / (M.east - M.west) * (M.nx - 1)), j = Math.round((M.north - lat) / (M.north - M.south) * (M.ny - 1));
  return i >= 0 && j >= 0 && i < M.nx && j < M.ny && ANGEL[j * M.nx + i] === 1;
}

export function region(lat: number, lon: number, h: number): Region {
  if (onAngel(lat, lon)) return 'island'; // Angel Island: a state park, woods and grass, no town
  if (lat > 37.804 && lat < 37.8155 && lon > -122.3745 && lon < -122.357) return 'woods'; // Yerba Buena Island: wooded, a few Navy houses
  if (lat > 37.8155 && lat < 37.8335 && lon > -122.381 && lon < -122.358) return 'city'; // Treasure Island: flat, built over (the old Navy base and the new blocks)
  if (lat > 37.8235 && lat < 37.8295 && lon > -122.4265 && lon < -122.418) return 'rock'; // Alcatraz
  if (lon > -122.345) {
    // the East Bay, from Alameda and Oakland to Berkeley, Richmond and San Pablo: the flatlands built over to the foot of the hills;
    // the Berkeley and Oakland hills above about 120 m grassland (gold in summer), darker with oak, bay and eucalyptus on
    // the north-facing slopes and in the canyons (Tilden, Claremont Canyon, Redwood Regional Park: the grass's scrub shading)
    if (onPort(lat, lon) && h < 20) return 'port';
    if (h > 120) return 'grass';
    return h > 70 ? 'suburb' : 'city';
  }
  if (lat > 37.885 && lon > -122.445) return h > 45 ? 'grass' : 'city'; // Richmond: Point Richmond, the refinery, the harbor; the Potrero Hills and Point San Pablo's ridge grass
  if (lat > 37.787 && lat < 37.811 && lon > -122.486 && lon < -122.447) return 'woods'; // the Presidio
  if (lat > 37.8013 && lat < 37.8034 && lon > -122.4074 && lon < -122.4043) return 'woods'; // Pioneer Park, round Coit Tower
  if (lat > 37.764 && lat < 37.7745 && lon > -122.511 && lon < -122.454) return 'woods'; // Golden Gate Park
  if (lat < 37.812 && lon > -122.515) return lon > -122.4545 && lat < 37.7755 && h > 150 ? 'grass' : 'city'; // San Francisco (Twin Peaks grassy on top)
  if (lat > 37.845 && h < 90 && lon > (lat > 37.88 ? -122.58 : -122.51)) return 'suburb'; // Sausalito, Tiburon, Belvedere, Mill Valley; Corte Madera, Larkspur, San Rafael
  return 'grass';
}

export async function buildTerrain(scene: THREE.Scene, month: number): Promise<Terrain> {
  const H = await loadHeights(), { nx, ny } = M;
  // Angel Island: flood the land out from Mount Livermore's summit (37.8608 N 122.4324 W)
  {
    const A = new Uint8Array(nx * ny), i0 = Math.round((-122.4324 - M.west) / (M.east - M.west) * (nx - 1)), j0 = Math.round((M.north - 37.8608) / (M.north - M.south) * (ny - 1));
    const stack = [j0 * nx + i0];
    while (stack.length) {
      const k = stack.pop()!; if (A[k] || H[k] <= 0) continue; A[k] = 1;
      const i = k % nx, j = (k - i) / nx;
      if (i > 0) stack.push(k - 1); if (i < nx - 1) stack.push(k + 1); if (j > 0) stack.push(k - nx); if (j < ny - 1) stack.push(k + nx);
    }
    let n = 0; for (const v of A) n += v;
    ANGEL = n > 100 && n < 3000 ? A : null; // about 1,200 cells (3 km²); anything else means the flood leaked: leave it unlabelled
  }
  const corner = LL(M.north, M.west), far = LL(M.south, M.east);
  const dx = (far.x - corner.x) / (nx - 1), dy = (far.y - corner.y) / (ny - 1); // dy < 0: rows run south
  // fit the San Francisco shore to the sim's coastline
  // (only near that shore: the sim's land polygon is cut off straight to the south, west and east, inland)
  const cityShore = (lat: number, lon: number) => lat < 37.8135 && lat > 37.7925 && lon > -122.4775 && lon < -122.4015;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const lat = M.north - (M.north - M.south) * j / (ny - 1), lon = M.west + (M.east - M.west) * i / (nx - 1);
    if (!cityShore(lat, lon)) continue;
    const k = j * nx + i, p = { x: corner.x + i * dx, y: corner.y + j * dy };
    H[k] = onGround(p) ? Math.max(H[k], 2.5) : -30; // (the Wharf's open piers and docks are drawn as structures: render/wharf.ts)
  }
  // a marina's basin is water, whatever the 50 m grid says (South Beach and the Corinthian are outside the fitted shore)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (H[k] <= 0) continue;
    if (inBasin({ x: corner.x + i * dx, y: corner.y + j * dy })) H[k] = -2;
  }
  const pos = new Float32Array(nx * ny * 3), col = new Float32Array(nx * ny * 3);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, h = H[k];
    pos[k * 3] = corner.x + i * dx; pos[k * 3 + 1] = h > 0 ? h : Math.min(h, -12); pos[k * 3 + 2] = -(corner.y + j * dy);
  }
  const idx: number[] = [];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    if (H[a] <= 0 && H[b] <= 0 && H[c] <= 0 && H[d] <= 0) continue; // open water: no triangles
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(mesh);
  const nrm = geo.attributes.normal as THREE.BufferAttribute;

  const C = (h: string) => new THREE.Color(h);
  const PAL = {
    city: [C('#a9a796'), C('#bdb9a8'), C('#8f8f82'), C('#c6c0ae')], woods: [C('#45603f'), C('#3b5236'), C('#56704a')],
    gold: C('#b89a5c'), green: C('#7d9650'), scrub: C('#5d6b45'), chaparral: C('#5a6343'), sand: C('#cdbd94'), rock: C('#8b7f6d'), stone: C('#8f8d86'), suburb: [C('#a9a493'), C('#6f8458')], paved: [C('#8c8b86'), C('#9d9a92'), C('#7b7c7a')]
  };
  const wood = new Uint8Array(nx * ny);
  const setSeason = (mo: number) => {
    // how golden the grass is: gold from late spring to the first rains (May–Nov), green Dec–Apr
    const gold = [0.15, 0.1, 0.1, 0.3, 0.6, 0.85, 1, 1, 1, 0.95, 0.7, 0.35][(mo - 1 + 12) % 12];
    const grass = PAL.green.clone().lerp(PAL.gold, gold), tmp = new THREE.Color();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, h = H[k]; if (h <= 0) continue;
      const lat = M.north - (M.north - M.south) * j / (ny - 1), lon = M.west + (M.east - M.west) * i / (nx - 1);
      const n = hash(i, j), slope = 1 - nrm.getY(k), northFacing = nrm.getZ(k) < -0.15; // −z is north
      const r = region(lat, lon, h);
      if (r === 'island') {
        // Angel Island (Wikipedia, "Angel Island (California)"): evergreen woodland (coast live oak, bay, madrone,
        // toyon) on the slopes sheltered from the westerlies, facing north and east, and in the gullies; grassland
        // and coastal scrub on the south- and west-facing slopes and the ridge tops; Mount Livermore's summit bare
        const shelter = -nrm.getZ(k) + nrm.getX(k) * 0.8; // north- and east-facing
        wood[k] = h > 6 && h < 215 && (shelter > 0.05 - 0.25 * n || (slope > 0.3 && n > 0.4)) ? 1 : 0;
        if (wood[k]) tmp.copy(PAL.woods[Math.floor(n * 3) % 3]);
        else { tmp.copy(grass).lerp(PAL.scrub, 0.35 + 0.4 * n); tmp.offsetHSL(0, 0, (n - 0.5) * 0.05); }
      } else if (r === 'city') tmp.copy(PAL.city[Math.floor(n * 4) % 4]);
      else if (r === 'woods') { tmp.copy(PAL.woods[Math.floor(n * 3) % 3]); wood[k] = 1; }
      else if (r === 'rock') tmp.copy(PAL.stone).lerp(PAL.scrub, n < 0.5 ? 0.7 : 0.1); // Alcatraz: grey rock and concrete, patches of scrub and garden
      else if (r === 'suburb') tmp.copy(PAL.suburb[0]).lerp(PAL.suburb[1], n);
      else if (r === 'port') tmp.copy(PAL.paved[Math.floor(n * 3) % 3]); // asphalt and concrete yards, container stacks seen from afar
      else {
        // grassland, with scrub on north-facing slopes and in the gullies, chaparral up high on Tamalpais
        tmp.copy(grass);
        if (northFacing || slope > 0.35) tmp.lerp(PAL.scrub, 0.55 + 0.3 * n);
        if (h > 380) tmp.lerp(PAL.chaparral, 0.6);
        tmp.offsetHSL(0, 0, (n - 0.5) * 0.06);
      }
      const shore = H[k - 1] <= 0 || H[k + 1] <= 0 || H[k - nx] <= 0 || H[k + nx] <= 0 || H[k - 2] <= 0 || H[k + 2] <= 0 || H[k - 2 * nx] <= 0 || H[k + 2 * nx] <= 0; // within 100 m of the water
      if (h < 5 && shore && r !== 'city' && r !== 'port') tmp.copy(slope > 0.4 || r === 'rock' ? PAL.rock : PAL.sand); // beaches and rocky shore
      else if (slope > 0.55) tmp.lerp(PAL.rock, 0.6); // cliffs
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
    }
    (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  };
  setSeason(month);

  // city lights: a scatter of warm points over the city and the towns, for dusk
  const lp: number[] = [];
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    const k = j * nx + i, h = H[k]; if (h <= 0) continue;
    const lat = M.north - (M.north - M.south) * j / (ny - 1), lon = M.west + (M.east - M.west) * i / (nx - 1), r = region(lat, lon, h);
    if ((r === 'city' && hash(j, i) < 0.55) || (r === 'suburb' && hash(j, i) < 0.25)) lp.push(pos[k * 3] + (hash(i, j) - 0.5) * 40, h + 6, pos[k * 3 + 2] + (hash(j + 3, i) - 0.5) * 40);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lights = new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xffd28a, size: 1.6, sizeAttenuation: false, fog: true, transparent: true, opacity: 0.85 }));
  lights.visible = false; scene.add(lights);

  const heightAt = (x: number, y: number) => {
    const fi = (x - corner.x) / dx, fj = (y - corner.y) / dy, i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= ny - 1) return -1;
    const u = fi - i, v = fj - j, at = (a: number, b: number) => Math.max(0, H[b * nx + a]);
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  };
  const wooded = (x: number, y: number) => {
    const i = Math.round((x - corner.x) / dx), j = Math.round((y - corner.y) / dy);
    return i >= 0 && j >= 0 && i < nx && j < ny && wood[j * nx + i] === 1;
  };
  return { heightAt, mesh, lights, setSeason, wooded };
}
