/**
 * Where the sun is: NOAA's solar position algorithm (Meeus), good to a fraction of a degree for these
 * purposes. Azimuth in degrees clockwise from north, elevation above the horizon (with refraction).
 */
const D = Math.PI / 180;
const sin = (d: number) => Math.sin(d * D), cos = (d: number) => Math.cos(d * D), tan = (d: number) => Math.tan(d * D);

/** The Cityfront: where the sun is computed for (the GGYC). */
export const SF = { lat: 37.8075, lon: -122.443 };

export interface SunPos { az: number; el: number }

export function sunPosition(ms: number, lat = SF.lat, lon = SF.lon): SunPos {
  const jd = ms / 86400000 + 2440587.5, T = (jd - 2451545) / 36525;
  const L0 = ((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360 + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = sin(M) * (1.914602 - T * (0.004817 + 0.000014 * T)) + sin(2 * M) * (0.019993 - 0.000101 * T) + sin(3 * M) * 0.000289;
  const omega = 125.04 - 1934.136 * T, lambda = L0 + C - 0.00569 - 0.00478 * sin(omega);
  const eps = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * cos(omega);
  const decl = Math.asin(sin(eps) * sin(lambda)) / D;
  const y = tan(eps / 2) ** 2;
  const eqt = 4 / D * (y * sin(2 * L0) - 2 * e * sin(M) + 4 * e * y * sin(M) * cos(2 * L0) - 0.5 * y * y * sin(4 * L0) - 1.25 * e * e * sin(2 * M)); // minutes
  const minutes = ((ms / 60000) % 1440 + 1440) % 1440;
  const ha = (minutes + eqt + 4 * lon) / 4 - 180; // hour angle, deg
  const cz = Math.min(1, Math.max(-1, sin(lat) * sin(decl) + cos(lat) * cos(decl) * cos(ha)));
  let el = 90 - Math.acos(cz) / D;
  // atmospheric refraction (lifts the sun near the horizon)
  if (el > -0.575) el += el > 5 ? (58.1 / tan(el) - 0.07 / tan(el) ** 3 + 0.000086 / tan(el) ** 5) / 3600 : (1735 + el * (-518.2 + el * (103.4 + el * (-12.79 + el * 0.711)))) / 3600;
  const az = ((Math.atan2(sin(ha), cos(ha) * sin(lat) - tan(decl) * cos(lat)) / D + 180) % 360 + 360) % 360;
  return { az, el };
}

/** Sunrise and sunset (ms since epoch, UTC) on the day containing `ms` (local day in San Francisco, roughly). */
export function sunTimes(ms: number): { rise: number; set: number } {
  const day0 = Math.floor((ms - 8 * 3600e3) / 86400e3) * 86400e3 + 8 * 3600e3; // midnight PST-ish
  let rise = NaN, set = NaN, prev = sunPosition(day0).el;
  for (let m = 2; m <= 1440; m += 2) {
    const t = day0 + m * 60e3, el = sunPosition(t).el;
    const refine = (a: number, b: number) => { for (let i = 0; i < 12; i++) { const mid = (a + b) / 2; if ((sunPosition(mid).el >= -0.833) === (sunPosition(a).el >= -0.833)) a = mid; else b = mid; } return (a + b) / 2; };
    if (prev < -0.833 && el >= -0.833) rise = refine(t - 120e3, t);
    if (prev >= -0.833 && el < -0.833) set = refine(t - 120e3, t);
    prev = el;
  }
  return { rise, set };
}

/** Compass word for an azimuth. */
export function compass(az: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8];
}
