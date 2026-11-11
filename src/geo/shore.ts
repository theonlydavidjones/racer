import { inPoly, segPt, type Vec } from '../core/math';
import { LAT0, LL, LON0 } from './geo';
import mask from './data/shore-mask.json';
import marinaCoast from './data/marina-coast.json';
import { hitsHarbor, inBasin } from './marina';

// Stylized Cityfront shoreline from Fort Point to North Beach (approximate, not for navigation); the stretch past the
// Marina is replaced below by the real one.
const SHORE_LL: [number, number][] = [
  [37.8108, -122.4785], [37.8065, -122.4720], [37.8045, -122.4620], [37.8040, -122.4520], [37.8055, -122.4490],
  [37.8078, -122.4475], [37.8082, -122.4462], [37.8079, -122.4450], [37.8088, -122.4441], [37.8093, -122.4434],
  [37.8087, -122.4427], [37.8071, -122.4421], [37.8067, -122.4380], [37.8071, -122.4340], [37.8080, -122.4326],
  [37.8100, -122.4322], [37.8100, -122.4315], [37.8083, -122.4312], [37.8100, -122.4306], [37.8100, -122.4299],
  [37.8083, -122.4296], [37.8100, -122.4291], [37.8100, -122.4284], [37.8078, -122.4280], [37.8074, -122.4240],
  [37.8086, -122.4214], [37.8080, -122.4180], [37.8062, -122.4100], [37.8045, -122.4000]
];

// From Crissy Field past the Marina to Fort Mason, the real shoreline (OpenStreetMap, scripts/make-marina-coast.mjs):
// the Marina Green seawall, the West Harbor's basin and its jetty out to the entrance beacon, in place of the hand-drawn one
// and round Gashouse Cove (the Marina's East Harbor) to the end of Fort Mason's Pier 1 (only that far east: the hand-drawn
// shore has the other Fort Mason piers)
const COAST = (() => { const c = (marinaCoast as unknown as { coast: [number, number][] }).coast; return c.slice(0, c.findIndex(p => p[1] > -122.4335 && p[0] > 37.8083) + 1); })(); // (west to east: the last point is Pier 1's north-west corner)
const SHORE_ALL: [number, number][] = [...SHORE_LL.filter(p => p[1] < COAST[0][1]), ...COAST, ...SHORE_LL.filter(p => p[1] > COAST[COAST.length - 1][1] + 0.0001)];
export const SHORE: Vec[] = SHORE_ALL.map(p => LL(p[0], p[1]));
/** Land polygon: the shoreline closed off to the south. */
// (closed round the far side of the city, out to the edges of the area the Cityfront shore governs (onLand's CF box), so
// the Presidio's edge and the city behind the waterfront are land, not a channel or a lake a boat could sail into)
export const LAND: Vec[] = SHORE.concat([LL(37.7795, -122.3995), LL(37.7795, -122.4805), LL(37.8015, -122.4805), LL(37.8015, -122.4790)]); // (north of 37.8015, off the Presidio at the Gate, is water)

const inCityfront = (p: Vec): boolean => inPoly(p, LAND);

/*
 * Beyond the Cityfront (Alcatraz, Angel Island, the Marin shore, Treasure Island, the city east of North Beach):
 * the real coastline from the terrain, in 50 m cells. The Cityfront itself is the hand-drawn shore above, which
 * has the marinas and breakwaters in it.
 */
const M = mask as { south: number; north: number; west: number; east: number; nx: number; ny: number; rows: number[][] };
const GRID = (() => {
  const g = new Uint8Array(M.nx * M.ny);
  M.rows.forEach((runs, j) => { let i = 0, v = 0; for (const n of runs) { if (v) g.fill(1, j * M.nx + i, j * M.nx + i + n); i += n; v ^= 1; } });
  return g;
})();
const MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const CF = { x0: LL(0, -122.4800).x, x1: LL(0, -122.4000).x, y0: LL(37.780, 0).y, y1: LL(37.8150, 0).y };
function inTerrain(p: Vec): boolean {
  const lat = LAT0 + p.y / MLAT, lon = LON0 + p.x / MLON;
  const i = Math.floor((lon - M.west) / (M.east - M.west) * M.nx), j = Math.floor((M.north - lat) / (M.north - M.south) * M.ny);
  return i >= 0 && j >= 0 && i < M.nx && j < M.ny && GRID[j * M.nx + i] === 1;
}

/** The terrain land grid, for drawing maps: cells, bounds, and whether a cell is inside the hand-drawn Cityfront area. */
export const landGrid = () => ({ ...M, grid: GRID, cityfront: { south: 37.79, north: 37.815, west: -122.48, east: -122.40 } });

/** Is this point land a boat would run aground on? (In a marina's basin: only its docks and breakwaters; and those are solid just outside it too.) */
export const onLand = (p: Vec): boolean =>
  inBasin(p) ? hitsHarbor(p) : hitsHarbor(p) || (p.x > CF.x0 && p.x < CF.x1 && p.y > CF.y0 && p.y < CF.y1 ? inCityfront(p) : inTerrain(p) || inCityfront(p));

export function shoreDist(p: Vec): number {
  let m = 1e9;
  for (let i = 1; i < SHORE.length; i++) m = Math.min(m, segPt(p, SHORE[i - 1], SHORE[i]));
  return m;
}
