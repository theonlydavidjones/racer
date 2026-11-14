/**
 * A Nordic Folkboat's plan view at the sheer: her length and the deck's half-breadths along it. Pure numbers (no
 * three.js), so the hull drawn (render/hull.ts) and the hull the rules and physics touch with (rules/geometry.ts) are
 * one shape.
 *
 * Frame: x to starboard, z aft; the bow is at z = −L/2.
 */
export const L = 7.64;
export const zAt = (u: number) => -L / 2 + u * L;

/**
 * Half-breadth of the deck (m) at the class's measuring stations, 0.5 m apart (CR 2.14), station 1 at the transom:
 * from the class's construction plan (Nordic Folkboat Construction Plan, 1:10, 1947, rev. 2024, folkboat.com; the same
 * figures as the physics, boat/crewPhys.ts). Station 11's 1910 mm beam is also the class rule's (CR 2.161), and the
 * numbering agrees with the rules: the frames abreast the mast at stations 10 and 10.5 (CR 2.208), where the forestay
 * rules put it; the cockpit's after end at station 3 (CR 3.22).
 */
const HB_MM = [655, 760, 860, 948, 1017, 1067, 1094, 1100, 1080, 1028, 955, 849, 705, 530, 315]; // stations 1..15
/**
 * A fair curve through points (x increasing): a monotone cubic (Fritsch–Carlson), so between two points it never
 * bulges past them, the way a batten bent through a table of offsets lies.
 */
export function fairCurve(pts: [number, number][]): (x: number) => number {
  const n = pts.length, d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  const m = [d[0], ...d.slice(1).map((di, i) => (d[i] * di <= 0 ? 0 : (d[i] + di) / 2)), d[n - 2]];
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = Math.hypot(a, b);
    if (h > 3) { m[i] = 3 * a / h * d[i]; m[i + 1] = 3 * b / h * d[i]; }
  }
  return (x: number) => {
    let i = 0; while (i < n - 2 && x > pts[i + 1][0]) i++;
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = x1 - x0, t = Math.min(1, Math.max(0, (x - x0) / h));
    return (2 * t ** 3 - 3 * t * t + 1) * y0 + (t ** 3 - 2 * t * t + t) * h * m[i] + (-2 * t ** 3 + 3 * t * t) * y1 + (t ** 3 - t * t) * h * m[i + 1];
  };
}
/** (z, half-breadth) from the stem aft. */
const STATIONS: [number, number][] = [[-L / 2, 0]];
for (let k = 15; k >= 1; k--) STATIONS.push([L / 2 - 0.5 * (k - 1), HB_MM[k - 1] / 1000]);
const deckLine = fairCurve(STATIONS);
/** Half-beam at the sheer (m) at station u: fine bow, full a little aft of amidships, a 1.31 m transom. */
export const halfBeam = (u: number) => Math.max(0, deckLine(zAt(Math.min(1, Math.max(0, u)))));

/** Station u for a z position (m, aft positive). */
export const uAtZ = (z: number) => (z + L / 2) / L;
