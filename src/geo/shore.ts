import { inPoly, segPt, type Vec } from '../core/math';
import { LL } from './geo';

// Stylized Cityfront shoreline from Fort Point to North Beach (approximate, not for navigation).
// TODO: replace with clipped NOAA ENC / OpenStreetMap coastline data.
const SHORE_LL: [number, number][] = [
  [37.8108, -122.4785], [37.8065, -122.4720], [37.8045, -122.4620], [37.8040, -122.4520], [37.8055, -122.4490],
  [37.8078, -122.4475], [37.8082, -122.4462], [37.8079, -122.4450], [37.8088, -122.4441], [37.8093, -122.4434],
  [37.8087, -122.4427], [37.8071, -122.4421], [37.8067, -122.4380], [37.8071, -122.4340], [37.8080, -122.4326],
  [37.8100, -122.4322], [37.8100, -122.4315], [37.8083, -122.4312], [37.8100, -122.4306], [37.8100, -122.4299],
  [37.8083, -122.4296], [37.8100, -122.4291], [37.8100, -122.4284], [37.8078, -122.4280], [37.8074, -122.4240],
  [37.8086, -122.4214], [37.8080, -122.4180], [37.8062, -122.4100], [37.8045, -122.4000]
];

export const SHORE: Vec[] = SHORE_LL.map(p => LL(p[0], p[1]));
/** Land polygon: the shoreline closed off to the south. */
export const LAND: Vec[] = SHORE.concat([LL(37.790, -122.4000), LL(37.790, -122.4790)]);

export const onLand = (p: Vec): boolean => inPoly(p, LAND);

export function shoreDist(p: Vec): number {
  let m = 1e9;
  for (let i = 1; i < SHORE.length; i++) m = Math.min(m, segPt(p, SHORE[i - 1], SHORE[i]));
  return m;
}
