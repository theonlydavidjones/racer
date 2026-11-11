/**
 * Harmonic prediction of tidal currents: the speed along a station's flood/ebb axis is a sum of tidal
 * constituents, each a cosine with its own period, plus the mean flow:
 *
 *   v(t) = Z0 + Σ f·A·cos(V(t) + u − G)
 *
 * A and G are the station's amplitude and Greenwich phase lag for each constituent (from NOAA). V is the
 * constituent's astronomical (equilibrium) argument at time t; f and u are the nodal corrections for the
 * 18.6-year cycle of the Moon's orbit. Arguments follow Schureman (1958, Manual of Harmonic Analysis and
 * Prediction of Tides); nodal corrections use the standard series in N, the longitude of the Moon's node.
 * Checked against NOAA's own predictions in tests/tide.test.ts.
 */

const D2R = Math.PI / 180;
const cos = (d: number) => Math.cos(d * D2R), sin = (d: number) => Math.sin(d * D2R);

/** Mean astronomical longitudes (deg) at a time (ms since epoch, UTC). Meeus, J2000 epoch. */
export function astro(ms: number): { T: number; s: number; h: number; p: number; N: number } {
  const jd = ms / 86400000 + 2440587.5, c = (jd - 2451545.0) / 36525;
  const hours = ((ms / 3600000) % 24 + 24) % 24;
  return {
    T: 180 + 15 * hours, // hour angle of the mean sun at Greenwich
    s: 218.3164477 + 481267.88123421 * c, // Moon
    h: 280.46646 + 36000.76983 * c, // Sun
    p: 83.3532465 + 4069.0137287 * c, // lunar perigee
    N: 125.04452 - 1934.136261 * c // Moon's ascending node
  };
}

interface Nodal { f: number; u: number }
const one: Nodal = { f: 1, u: 0 };

/** Nodal corrections for the basic lunar constituents, as series in N (deg). */
function nodal(N: number) {
  const M2: Nodal = { f: 1.0004 - 0.0373 * cos(N) + 0.0002 * cos(2 * N), u: -2.14 * sin(N) };
  const K1: Nodal = { f: 1.006 + 0.115 * cos(N) - 0.0088 * cos(2 * N) + 0.0006 * cos(3 * N), u: -8.86 * sin(N) + 0.68 * sin(2 * N) - 0.07 * sin(3 * N) };
  const O1: Nodal = { f: 1.0089 + 0.1871 * cos(N) - 0.0147 * cos(2 * N) + 0.0014 * cos(3 * N), u: 10.8 * sin(N) - 1.34 * sin(2 * N) + 0.19 * sin(3 * N) };
  const K2: Nodal = { f: 1.0241 + 0.2863 * cos(N) + 0.0083 * cos(2 * N) - 0.0015 * cos(3 * N), u: -17.74 * sin(N) + 0.68 * sin(2 * N) - 0.04 * sin(3 * N) };
  const J1: Nodal = { f: 1.1029 + 0.1676 * cos(N) - 0.017 * cos(2 * N) + 0.0016 * cos(3 * N), u: -12.94 * sin(N) + 1.34 * sin(2 * N) - 0.19 * sin(3 * N) };
  const OO1: Nodal = { f: 1.1027 + 0.6504 * cos(N) + 0.0317 * cos(2 * N) - 0.0014 * cos(3 * N), u: -36.68 * sin(N) + 4.02 * sin(2 * N) - 0.57 * sin(3 * N) };
  // the long-period lunar ones (Schureman 1958, Table 2, formulas 73–75)
  const Mm: Nodal = { f: 1.0 - 0.1300 * cos(N) + 0.0013 * cos(2 * N), u: 0 };
  const Mf: Nodal = { f: 1.0429 + 0.4135 * cos(N) - 0.004 * cos(2 * N), u: -23.74 * sin(N) + 2.68 * sin(2 * N) - 0.38 * sin(3 * N) };
  return { M2, K1, O1, K2, J1, OO1, Mm, Mf };
}

const mul = (...xs: [Nodal, number][]): Nodal => xs.reduce<Nodal>((a, [n, k]) => ({ f: a.f * Math.pow(n.f, Math.abs(k)), u: a.u + n.u * k }), one);

/** Equilibrium argument V (deg) and nodal correction for a constituent at a time. */
/** The longitude of the solar perigee (deg; it moves about 1.7° a century: 282.9° in 2000, 283.3° by 2026). */
const P1 = 283.2;
function constituent(name: string, a: ReturnType<typeof astro>, nd: ReturnType<typeof nodal>): { V: number; n: Nodal } | null {
  const { T, s, h, p } = a, M2 = 2 * T - 2 * s + 2 * h, S2 = 2 * T, N2 = 2 * T - 3 * s + 2 * h + p, K1 = T + h - 90, O1 = T - 2 * s + h + 90;
  switch (name) {
    case 'M2': return { V: M2, n: nd.M2 };
    case 'S2': return { V: S2, n: one };
    case 'N2': return { V: N2, n: nd.M2 };
    case '2N2': return { V: 2 * T - 4 * s + 2 * h + 2 * p, n: nd.M2 };
    case 'K2': return { V: 2 * T + 2 * h, n: nd.K2 };
    case 'L2': return { V: 2 * T - s + 2 * h - p + 180, n: nd.M2 }; // f, u of L2 are close to M2's
    case 'K1': return { V: K1, n: nd.K1 };
    case 'O1': return { V: O1, n: nd.O1 };
    case 'P1': return { V: T - h + 90, n: one };
    case 'Q1': return { V: T - 3 * s + h + p + 90, n: nd.O1 };
    case '2Q1': return { V: T - 4 * s + h + 2 * p + 90, n: nd.O1 };
    case 'J1': return { V: T + s + h - p - 90, n: nd.J1 };
    case 'OO1': return { V: T + 2 * s + h - 90, n: nd.OO1 };
    case 'M1': return { V: T - s + h + p - 90, n: one }; // NOAA's M1 (Schureman's A16 form, with the perigee: it cut the stations' error by half); small, its nodal factor varies a lot and is ignored
    case 'M3': return { V: 1.5 * M2, n: mul([nd.M2, 1.5]) }; // 3T − 3s + 3h (Schureman, Table 2)
    case 'M4': return { V: 2 * M2, n: mul([nd.M2, 2]) };
    case 'M6': return { V: 3 * M2, n: mul([nd.M2, 3]) };
    case 'M8': return { V: 4 * M2, n: mul([nd.M2, 4]) };
    case 'S4': return { V: 2 * S2, n: one };
    case 'S6': return { V: 3 * S2, n: one };
    case 'MN4': return { V: M2 + N2, n: mul([nd.M2, 2]) };
    case 'MS4': return { V: M2 + S2, n: nd.M2 };
    case '2SM2': return { V: 2 * S2 - M2, n: mul([nd.M2, -1]) };
    case 'MK3': return { V: M2 + K1, n: mul([nd.M2, 1], [nd.K1, 1]) };
    case '2MK3': return { V: 2 * M2 - K1, n: mul([nd.M2, 2], [nd.K1, -1]) };
    // (added with the East Bay's stations, which carry them: in the Estuary and the shallows the smaller semidiurnal
    // constituents, the solar annual and semiannual tides and the fortnightly ones add up to a tenth of a knot)
    case 'NU2': return { V: 2 * T - 3 * s + 4 * h - p, n: nd.M2 };
    case 'MU2': return { V: 2 * T - 4 * s + 4 * h, n: nd.M2 };
    case 'LAM2': return { V: 2 * T - s + p + 180, n: nd.M2 };
    case 'T2': return { V: 2 * T - h + P1, n: one };
    case 'R2': return { V: 2 * T + h - P1 + 180, n: one };
    case 'RHO': return { V: T - 3 * s + 3 * h - p + 90, n: nd.O1 };
    case 'S1': return { V: T, n: one };
    case 'SA': return { V: h, n: one };
    case 'SSA': return { V: 2 * h, n: one };
    case 'MM': return { V: s - p, n: nd.Mm };
    case 'MF': return { V: 2 * s, n: nd.Mf };
    case 'MSF': return { V: 2 * s - 2 * h, n: mul([nd.M2, -1]) };
    default: return null;
  }
}

/** A station's constituents: [name, amplitude (kt), Greenwich phase lag (deg)]. */
export type Constituents = [string, number, number][];

/**
 * Speed along the major axis (kt, + flood) at each of `times` (ms since epoch, UTC). Nodal factors are
 * evaluated once, at the middle of the span (they change over years, not hours).
 */
export function predict(z0: number, hc: Constituents, times: number[]): number[] {
  if (!times.length) return [];
  const nd = nodal(astro((times[0] + times[times.length - 1]) / 2).N);
  return times.map(ms => {
    const a = astro(ms);
    let v = z0;
    for (const [name, A, G] of hc) {
      const c = constituent(name, a, nd);
      if (c) v += c.n.f * A * cos(c.V + c.n.u - G);
    }
    return v;
  });
}
