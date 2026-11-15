import { V, clamp, type Vec } from '../core/math';
import { PIERS, type Pier } from '../geo/shore';
import { WindSum, bluffDeficit } from './shadows';

/**
 * What the bridges' towers and piers (geo/shore.ts PIERS) do to the wind and the water downstream of them.
 *
 * **The wind.** Each is a bluff body standing out of the water, its top 6–13 m up: about a Folkboat's rig. Its lee is
 * the same bluff-body wake the ships and the committee boat cast (shadows.ts bluffDeficit: the recirculating cavity
 * from Hosker 1984, then the deficit fading as fitted to solid-windbreak data), with the pier's own height, and its
 * width and depth as the wind meets it. The towers above the Golden Gate's bases are open frames (two legs and the
 * struts) and are left out.
 *
 * **The water.** The current runs past them top to bottom (they stand on the bed), so each leaves a plane wake behind
 * it, which lies wherever the stream runs: down the Gate's axis to the west on the ebb, to the east on the flood.
 *  - The far wake: momentum conservation with a self-similar Gaussian profile, U = Uc − Us·exp(−ln2·(y/y½)²), and a
 *    constant spreading rate S = (Uc/Us)·dy½/dx (Pope, Turbulent Flows ch. 5, as in F. Stern's lecture notes, Free
 *    Shear Flows part 2, "Plane wake": measured S = 0.093 behind a circular cylinder, 0.103 a foil, 0.075 a flat plate;
 *    we take 0.09). The wake carries the pier's drag, ½ρU²·C_D·D per metre of depth, so its momentum thickness is
 *    θ = C_D·D/2, and Us·y½ = θ·Uc/∫f = 0.235·C_D·D·Uc (∫exp(−ln2·ξ²)dξ = √(π/ln2) = 2.129). Integrating S:
 *    y½ = √(2·S·0.235·C_D·D·x) ≈ 0.21·√(C_D·D·x), Us/Uc ≈ 1.1·√(C_D·D/x).
 *  - C_D = 2.1, a square cylinder's (Lyn et al. 1995, JFM 304, Re ≈ 22,000; as ERCOFTAC's UFR 2-02 quotes it).
 *    Rectangles differ with their side ratio: most drag (about 2.8–3) with the long side across the stream at about
 *    0.6 : 1 along it, less as they lengthen along the flow (Bearman & Trueman 1972; Norberg 1993), and rounded ends,
 *    as the Golden Gate's south fender has, take much less at these Reynolds numbers (~10⁷). Not modelled until those
 *    curves are read from the sources: the Golden Gate's towers stand about 1.8 : 1 along the tide, so their wakes are
 *    probably 10–15% too wide and deep, the fender's more (width and depth go as √C_D).
 *  - Close behind it, where that law would take more than all the stream, the water is slack (the deficit is capped at
 *    the whole stream): a slack patch about three widths long (W/(8·S·0.235·C_D)). The real recirculating bubble is shorter, about 1–1½ widths,
 *    with a little back-flow in it; the law only holds well once the deficit is under a tenth (some 200 widths on).
 *  - The bed's friction wears the wake down as it goes. Depth-averaged momentum with quadratic friction, the free
 *    stream in balance with the slope of the water (c_f·U²/h): for a small deficit w, U·dw/dx = −2·c_f·U·w/h, so the
 *    deficit also decays as exp(−2·c_f·x/h), with h the depth there (NOAA's soundings round each pier,
 *    scripts/make-bridge-piers.mjs) and c_f = 0.0025, the drag coefficient tidal models commonly use (not measured
 *    here). About 2½ km for the Golden Gate's towers in 13–16 m of water.
 *  - Eddies: a Kármán vortex street, since the Bay is deep for its piers. Shallow-water wakes stay unsteady while
 *    S = c_f·D/h is under about 0.2 (Chen & Jirka 1995, Fluid Dyn. Res. 16), and here it is 0.002–0.02. They shed at
 *    a Strouhal number of 0.133 (Lyn et al. 1995, via ERCOFTAC), each side in turn, so the water pulses faster and
 *    slower across the wake, opposite on the two sides and passing through nothing on the centreline (the profile
 *    η·exp(−ln2·η²), η = y/y½), every D/(0.133·U): about 2½ minutes behind a Golden Gate tower in a 1 m/s stream. Its
 *    size is the turbulence measured in plane wakes, peak ⟨u²⟩^½ ≈ 0.32–0.41·Us (Pope, as above), all of it put into
 *    the one sine (×√2): an upper bound, since that is broadband. The street forms over the first three widths (the
 *    slack patch) and its eddies travel down at about 0.85 of the stream (Kármán vortices move at about 0.8–0.9 U∞,
 *    Cantwell & Coles 1983; quoted from memory, not checked).
 *  - Taken straight down the stream from the pier: beyond about 2 km the real stream through the Bay curves (NOAA's
 *    current stations a kilometre or two apart disagree in direction), so the wake stops there.
 *  - Not modelled: the faster water beside a pier, where the stream squeezes round it, and the slack just upstream.
 */

/** The Golden Gate's south tower stands inside its fender: in the water the fender is what the stream meets. */
const IN_WATER = PIERS.filter(P => !PIERS.some(Q => Q !== P && Q.pts.length && P.pts.every(p => inside(p, Q))));
function inside(p: Vec, Q: Pier): boolean {
  let c = false;
  for (let i = 0, j = Q.pts.length - 1; i < Q.pts.length; j = i++) {
    const a = Q.pts[i], b = Q.pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
const centreOf = (P: Pier): Vec => ({ x: P.pts.reduce((a, q) => a + q.x, 0) / P.pts.length, y: P.pts.reduce((a, q) => a + q.y, 0) / P.pts.length });
export const WAKE_PIERS = IN_WATER.map(P => ({ P, c: centreOf(P) }));

/** The pier's outline seen along unit vector e: its width across, its depth along, and how far its back face is past its centre. */
function extent(P: Pier, c: Vec, e: Vec): { W: number; L: number; back: number; front: number } {
  let a0 = Infinity, a1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  for (const q of P.pts) {
    const dx = q.x - c.x, dy = q.y - c.y, a = dx * e.x + dy * e.y, n = dx * e.y - dy * e.x;
    a0 = Math.min(a0, a); a1 = Math.max(a1, a); n0 = Math.min(n0, n); n1 = Math.max(n1, n);
  }
  return { W: n1 - n0, L: a1 - a0, back: a1, front: a0 };
}

/* ---------- the wind ---------- */

/** The piers' wind shadows at p (the true wind from `from`), added to `sum`. Where one stands inside another, the deeper of the two. */
/** The box round every pier's wind wake (each pier's box and its reach): outside it, none of them reaches. */
let PIER_AIR: { x0: number; x1: number; y0: number; y1: number } | null = null;
export function addPierWakes(sum: WindSum, from: number, p: Vec): void {
  // (one test for all of them, as every boat asks every step; then each pier's own, as before)
  const A = PIER_AIR ??= PIERS.reduce((a, P) => { const b = P.box, r = 30 * P.top + 100; return { x0: Math.min(a.x0, b.x0 - r), x1: Math.max(a.x1, b.x1 + r), y0: Math.min(a.y0, b.y0 - r), y1: Math.max(a.y1, b.y1 + r) }; }, { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
  if (p.x < A.x0 || p.x > A.x1 || p.y < A.y0 || p.y > A.y1) return;
  const e = V(from + 180);
  let fender = 0, tower = 0;
  for (const P of PIERS) {
    const b = P.box, r = 30 * P.top + 100;
    if (p.x < b.x0 - r || p.x > b.x1 + r || p.y < b.y0 - r || p.y > b.y1 + r) continue;
    const c = centreOf(P), dx = p.x - c.x, dy = p.y - c.y, x = dx * e.x + dy * e.y, y = dx * e.y - dy * e.x;
    const { W, L } = extent(P, c, e);
    // (faded out over the last 30% of the box searched: a wide, low pier's far wake is still a few percent at its edge)
    const out = Math.max(0, b.x0 - p.x, p.x - b.x1, b.y0 - p.y, p.y - b.y1);
    const d = bluffDeficit(x, y, P.top, W, L) * Math.min(1, (r - out) / (0.3 * r));
    if (d <= 0.001) continue;
    if (/^Golden Gate Bridge, south tower/.test(P.name)) { if (/fender/.test(P.name)) fender = d; else tower = d; continue; }
    sum.addDeficit(e.x, e.y, d);
  }
  const gg = Math.max(fender, tower);
  if (gg > 0.001) sum.addDeficit(e.x, e.y, gg);
}

/* ---------- the water ---------- */

export const WAKE = {
  S: 0.09, CD: 2.1, cf: 0.0025, St: 0.133, turb: 0.36, reach: 2000, conv: 0.85,
  /** Us·y½ / (C_D·D·Uc), from the Gaussian's integral */
  K: 1 / (2 * Math.sqrt(Math.PI / Math.LN2))
};

/** the peak of η·exp(−ln2·η²), at η = 1/√(2·ln2) */
const ODD_PEAK = Math.exp(-0.5) / Math.sqrt(2 * Math.LN2);

/** Each pier's stream (speed and direction) and its outline seen along it, worked out once for a set of flows (they
 * change every half minute, World.pierFlows; asked every step for every boat): the same sums as at each look, so the
 * same wakes. Piers in slack water (under 2 cm/s) left out. Kept by the flows array itself, so another World's (or a
 * test's) flows get their own. */
let wakeFlows: Vec[] | null = null, wakeList: { P: Pier; c: Vec; U: number; e: Vec; W: number; back: number }[] = [];
function wakesFor(flows: Vec[]): typeof wakeList {
  if (flows === wakeFlows) return wakeList;
  wakeFlows = flows; wakeList = [];
  for (let i = 0; i < WAKE_PIERS.length; i++) {
    const { P, c } = WAKE_PIERS[i], f = flows[i], U = Math.hypot(f.x, f.y);
    if (U < 0.02) continue;
    const e = { x: f.x / U, y: f.y / U }, { W, back } = extent(P, c, e);
    wakeList.push({ P, c, U, e, W, back });
  }
  return wakeList;
}

/**
 * The current at p with the piers' wakes in it: `here` the current at p without them, `flows[i]` the stream meeting
 * WAKE_PIERS[i] (m/s), `t` the time (s) for the eddies.
 */
/** The box round every pier's water wake (its middle, and the reach each tests): outside it, none of them reaches. */
let PIER_WATER: { x0: number; x1: number; y0: number; y1: number } | null = null;
export function withPierWakes(p: Vec, here: Vec, flows: Vec[], t: number): Vec {
  let ox = here.x, oy = here.y;
  const R2 = (WAKE.reach + 100) ** 2;
  // (one test for all of them, as every boat's current asks every step: past it, each pier's own distance test fails)
  const B = PIER_WATER ??= WAKE_PIERS.reduce((a, { c }) => { const R = WAKE.reach + 100 + 1e-6; return { x0: Math.min(a.x0, c.x - R), x1: Math.max(a.x1, c.x + R), y0: Math.min(a.y0, c.y - R), y1: Math.max(a.y1, c.y + R) }; }, { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
  if (p.x < B.x0 || p.x > B.x1 || p.y < B.y0 || p.y > B.y1) return { x: ox, y: oy };
  for (const { P, c, U, e, W, back } of wakesFor(flows)) {
    const dx = p.x - c.x, dy = p.y - c.y;
    if (dx * dx + dy * dy > R2) continue;
    const along = dx * e.x + dy * e.y;
    if (along < 0) continue;
    const x = along - back;
    if (x < 0 || x > WAKE.reach) continue;
    const y = dx * e.y - dy * e.x, cdD = WAKE.CD * W;
    const half = Math.max(W / 2, Math.sqrt(2 * WAKE.S * WAKE.K * cdD * Math.max(x, 1e-3)));
    const prof = Math.exp(-Math.LN2 * (y / half) ** 2);
    if (prof < 0.01) continue;
    const fade = Math.exp(-2 * WAKE.cf * x / P.depth) * clamp((WAKE.reach - x) / 200, 0, 1);
    const Us = Math.min(1, WAKE.K * cdD / half) * fade; // the centreline deficit, as a fraction of the stream
    let def = Us * prof;
    // the eddies: shed every D/(St·U), alternately each side, carried down at the wake's own speed
    const Sc = WAKE.cf * W / P.depth, street = clamp((0.5 - Sc) / 0.3, 0, 1); // (Chen & Jirka: steady bubbles by S ≈ 0.5)
    if (street > 0) {
      const fq = WAKE.St * U / W, eta = y / half, odd = eta * prof / ODD_PEAK, form = clamp(x / (3 * W), 0, 1);
      def += Math.SQRT2 * WAKE.turb * Us * odd * Math.sin(2 * Math.PI * fq * (t - x / (WAKE.conv * U))) * street * form;
    }
    def = clamp(def, 0, 1);
    // take that share of the stream meeting the pier out of the water here (not more than is here to take)
    const take = Math.min(def * U, Math.max(0, ox * e.x + oy * e.y));
    ox -= e.x * take; oy -= e.y * take;
  }
  return { x: ox, y: oy };
}
