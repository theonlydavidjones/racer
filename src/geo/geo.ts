import { D2R, type Vec } from '../core/math';

/** Local metres around the GGYC start line: origin at LAT0/LON0, x east, y north.
 * Equirectangular is fine at this scale (a few km). */
export const LAT0 = 37.81053, LON0 = -122.44332;
const MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * D2R);

export const LL = (lat: number, lon: number): Vec => ({ x: (lon - LON0) * MLON, y: (lat - LAT0) * MLAT });
export interface LatLon { lat: number; lon: number }
export const fromLatLon = (p: LatLon): Vec => LL(p.lat, p.lon);
/** Course metres back to latitude and longitude. */
export const toLL = (p: Vec): LatLon => ({ lat: LAT0 + p.y / MLAT, lon: LON0 + p.x / MLON });
