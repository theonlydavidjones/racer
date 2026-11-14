import { clamp, segPt, type Vec } from '../core/math';
import { HARBORS, type Harbor } from '../geo/marina';
import { PILE_PIERS, landDist } from '../geo/shore';
import { PILE_FLOW } from './current';

/**
 * The water in a harbor's entrance, where the tidal stream runs across its mouth (the owner, 13 Nov 2026, of Gashouse
 * Cove: "there are also frequent eddies in the entry"). No measurement or model of the current in this entrance was
 * found (reference/research/gashouse-entrance-eddies.md): the stream is NOAA's and the geometry OpenStreetMap's, and
 * the eddies' sizes and speeds are the general results for a harbor beside a stream, so they are estimates.
 *
 * **The place.** East Harbor is entered between the breakwater's light and Fort Mason's Pier 1 (Coast Pilot 7, ch. 7):
 * a gap about 37 m wide facing north, with the stream along the Cityfront running straight across it (NOAA SFB1204:
 * flood 088°, ebb 260°). On the flood the stream comes along the breakwater's outer side and leaves it at the tip; on
 * the ebb it comes through Pier 1's piles (the pier stands on open piles: geo/shore.ts PILE_PIERS).
 *
 * **What the stream does there** (Bijvelds 1997, TU Delft Communications on Hydraulic and Geotechnical Engineering
 * 1-97, and Langendoen 1989, report 8-89: both on harbors beside a river or tidal stream):
 *  - **The gyre.** The stream doesn't turn in through the mouth: it leaves the upstream corner and runs on across, and
 *    its drag on the still water inside turns that water in one gyre, whose edge runs at about a quarter of the stream
 *    (Booij 1986, in Bijvelds §3). Its near side goes with the stream, its far side against it: clockwise on the
 *    flood here, anticlockwise on the ebb. Its size here is the pool of clear water inside the mouth (the docks and
 *    the boats in them stop a larger one): the largest circle of water clear of walls, docks and piles that touches
 *    the mouth, worked out from the harbor's own plan. It turns as a solid body, fastest three-quarters of the way out,
 *    and dies in the boundary layer at its rim (the shape is assumed; the quarter is the measured figure).
 *    It follows the tide a little late: Booij's response time Te ≈ 50·β²·Le·B/(Ur·Bm) is about 20 minutes here, short
 *    beside the tide's hours, so it is taken to follow the stream as it is now (wrong for some minutes each side of
 *    slack, when the real gyre is still turning the old way in nearly still water).
 *  - **The mixing layer.** Between the stream and the gyre is a layer of sheared water that starts thin at the upstream
 *    corner and widens across the mouth: width B = ΔU/(dU/dy)max growing as dB/dx ≈ 0.17–0.23 measured in a harbor's
 *    mouth (Bijvelds; the free layer's 0.18·(Ur − Uh)/(Ur + Uh) of Brown & Roshko 1974 would give 0.11): 0.2 here,
 *    so about 7 m wide at the far corner. Across it the water goes from the stream's speed to the gyre's as a tanh.
 *  - **The eddies** a boat feels are the layer's own: it rolls up into a row of eddies about three layer-widths apart
 *    (Bijvelds), carried along at the mean of the two speeds, so one passes about every minute in a half-knot stream.
 *    The water's speed swings by ±0.2·ΔU along the stream and ±0.1·ΔU across it, root mean square, at the layer's
 *    centre (Uijttewaal & Tukker, in Bijvelds §2). All of that is put into one train of eddies (an upper bound: the
 *    real thing is broadband), a quarter-turn apart in the two directions, as a row of vortices is.
 *  - **Through the piles** (the ebb here). Pier 1 stands across the stream for 58 m north of the mouth, so on the ebb
 *    the water crossing the mouth has all come through its piles: slowed to PILE_FLOW of the stream (Bay East's
 *    estimate from the owner's photograph of the columns), a weak lee and not a headland's separation. The lee is
 *    bounded on its Bay side by its own mixing layer from the pier's head (the free layer's rate, 0.18·(1 − 0.6)/(1 +
 *    0.6) ≈ 0.045), and the layer across the mouth starts already as wide as the pier's own width of piles would have
 *    made it. How far the lee lasts is NOT derived: bed friction alone would carry it some 600 m (h/(2·c_f), 3 m of
 *    water, c_f = 0.0025 as in pierWakes.ts), but the shore relief already slows that water for the shore's sake, so it
 *    is held for one pier-head's distance downstream and faded over the next.
 *    The harbor's own slow water behind the mouth is slowed with it: it is moved by the stream that crosses the mouth.
 *  - Not modeled: the gyre's lag at slack (above); a second, weaker gyre deeper in (stacked gyres in a long harbor
 *    turn at about a tenth of the one before); the start-up vortex shed as the stream builds (Signell & Geyer 1991);
 *    the water the tide's rise and fall draws in and out through the mouth (the basin's area × the tide's rate over
 *    the mouth's section: a few cm/s at most here); the eddies of the single piles (smaller than the boat).
 *
 * Only Gashouse Cove's mouth is built: each other harbor's needs its own look at where its stream runs.
 */
export const MOUTH = {
  /** the gyre's edge speed over the stream's (Booij 1986) */
  gyre: 0.25,
  /** where in the gyre the water is fastest, and where it has died away, as fractions of its radius (assumed) */
  peak: 0.75, rim: 1.25,
  /** the mixing layer's widening, m per m (measured in a harbor mouth: Bijvelds 1997), and its width at the corner */
  spread: 0.2, B0: 1,
  /** the eddies' spacing in layer widths, and their swing along and across the stream over ΔU, rms */
  spacing: 3, u: 0.2, v: 0.1,
  /** a free mixing layer's rate (Brown & Roshko 1974), for the pile lee's Bay side: × (U1 − U2)/(U1 + U2) */
  free: 0.18,
  /** below this stream (m/s) there's nothing to drive any of it */
  slack: 0.02
};

interface Mouth {
  harbor: Harbor;
  /** the two corners of the gap, the unit vector from a to b, the unit normal into the basin, and the gap's width */
  a: Vec; b: Vec; along: Vec; into: Vec; W: number;
  /** which corners are pile piers, how far each pier's head stands out past the mouth, and its width of piles there */
  pileA: number; pileB: number; widthA: number; widthB: number;
  /** the gyre's center and radius */
  c: Vec; R: number;
  /** where the stream across the mouth is read: half a mouth's width outside its middle */
  ref: Vec;
  box: { x0: number; x1: number; y0: number; y1: number };
}

/** The nearest point of a closed outline to p. */
function nearestOn(p: Vec, pts: Vec[]): { q: Vec; d: number } {
  let best = { q: pts[0], d: Infinity };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const u = L2 > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1) : 0, q = { x: a.x + dx * u, y: a.y + dy * u }, d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best.d) best = { q, d };
  }
  return best;
}

function build(id: string): Mouth | null {
  const h = HARBORS.find(h => h.id === id); if (!h || !h.exits.length) return null;
  const mid = h.exits[0];
  // the gap's two corners: the nearest solid thing to its middle, and the nearest on the other side of it
  const bodies: { pts: Vec[]; pile: boolean }[] = [...h.breakwaters.map(b => ({ pts: b.pts, pile: false })), ...PILE_PIERS.map(P => ({ pts: P.pts, pile: true }))];
  const near = bodies.map(B => ({ B, ...nearestOn(mid, B.pts) })).sort((p, q) => p.d - q.d);
  const first = near[0], second = near.find(n => n !== first && (n.q.x - mid.x) * (first.q.x - mid.x) + (n.q.y - mid.y) * (first.q.y - mid.y) < 0);
  if (!second) return null;
  const a = first.q, b = second.q, W = Math.hypot(b.x - a.x, b.y - a.y), along = { x: (b.x - a.x) / W, y: (b.y - a.y) / W };
  // into the basin: toward the middle of the harbor's own outline
  const cx = h.basin.reduce((s, p) => s + p.x, 0) / h.basin.length, cy = h.basin.reduce((s, p) => s + p.y, 0) / h.basin.length;
  let into = { x: -along.y, y: along.x }; if ((cx - mid.x) * into.x + (cy - mid.y) * into.y < 0) into = { x: -into.x, y: -into.y };
  // a pile pier at a corner: how far its head stands out into the stream past the mouth's line, and how wide its piles are along it
  const reach = (B: { pts: Vec[]; pile: boolean }) => B.pile ? Math.max(0, ...B.pts.map(p => -((p.x - a.x) * into.x + (p.y - a.y) * into.y))) : 0;
  const width = (B: { pts: Vec[]; pile: boolean }) => { if (!B.pile) return 0; const s = B.pts.filter(p => Math.abs((p.x - a.x) * into.x + (p.y - a.y) * into.y) < 60).map(p => (p.x - a.x) * along.x + (p.y - a.y) * along.y); return Math.max(...s) - Math.min(...s); };
  // the gyre: the largest circle of clear water touching the mouth (walls, the shore, docks and piles all bound it)
  const lines: Vec[][] = [...h.walkways, ...h.fingers, ...h.shore];
  const rings: Vec[][] = [...h.breakwaters.map(b => b.pts), ...h.areas, ...PILE_PIERS.map(P => P.pts)];
  const clear = (p: Vec) => {
    let d = landDist(p);
    for (const L of lines) for (let i = 1; i < L.length; i++) d = Math.min(d, segPt(p, L[i - 1], L[i]));
    for (const R of rings) for (let i = 0; i < R.length; i++) d = Math.min(d, segPt(p, R[i], R[(i + 1) % R.length]));
    return d;
  };
  let c = { x: mid.x + into.x * W / 2, y: mid.y + into.y * W / 2 }, R = 0;
  for (let n = 4; n <= 3 * W; n += 2) for (let s = -2 * W; s <= 3 * W; s += 2) {
    const p = { x: a.x + along.x * s + into.x * n, y: a.y + along.y * s + into.y * n }, d = clear(p);
    // (touching the mouth: the gap itself is within the circle's reach, give or take the lattice's 2 m)
    if (d > R && segPt(p, a, b) <= d + 2) { R = d; c = p; }
  }
  if (R < 5) return null;
  const pileA = reach(first.B), pileB = reach(second.B), far = Math.max(2 * pileA, 2 * pileB, W) + 10, r = Math.max(far, MOUTH.rim * R + W);
  return { harbor: h, a, b, along, into, W, pileA, pileB, widthA: width(first.B), widthB: width(second.B), c, R,
    ref: { x: mid.x - into.x * W / 2, y: mid.y - into.y * W / 2 },
    box: { x0: Math.min(a.x, b.x, c.x) - r, x1: Math.max(a.x, b.x, c.x) + r, y0: Math.min(a.y, b.y, c.y) - r, y1: Math.max(a.y, b.y, c.y) + r } };
}

export const MOUTHS: Mouth[] = ['gashouse-cove'].map(build).filter((m): m is Mouth => !!m);
/** Where World reads the stream that crosses each mouth (m/s there, eased by the shore, without the harbor's calm). */
export const MOUTH_REFS: Vec[] = MOUTHS.map(m => m.ref);

/** The gyre's speed at r from its center, over its edge speed: a solid body out to `peak`, dying away by `rim`. */
const gyreShape = (s: number) => s <= MOUTH.peak ? s / MOUTH.peak : Math.max(0, (MOUTH.rim - s) / (MOUTH.rim - MOUTH.peak));

/**
 * The current at p with the harbor mouths' water in it: `c` the stream there without any harbor's calm, `k` the
 * harbor's calm there (current.ts basinCalm: 1 in open water), `flows[i]` the stream crossing MOUTHS[i] (m/s, at its
 * MOUTH_REFS point), `t` the time (s) for the eddies. Away from every mouth it is c·k, as before.
 */
export function withHarborMouths(p: Vec, c: Vec, k: number, flows: Vec[], t: number): Vec {
  let ox = c.x * k, oy = c.y * k;
  for (let i = 0; i < MOUTHS.length; i++) {
    const M = MOUTHS[i], B = M.box;
    if (p.x < B.x0 || p.x > B.x1 || p.y < B.y0 || p.y > B.y1) continue;
    const f = flows[i], along = f.x * M.along.x + f.y * M.along.y, U = Math.abs(along);
    if (U < MOUTH.slack) continue;
    // the mouth's own frame, downstream from the upstream corner: x along the gap, n into the basin
    const dn = along > 0 ? 1 : -1, up = dn > 0 ? M.a : M.b, ex = M.along.x * dn, ey = M.along.y * dn;
    const x = (p.x - up.x) * ex + (p.y - up.y) * ey, n = (p.x - up.x) * M.into.x + (p.y - up.y) * M.into.y;
    // the stream came through a pile pier: its lee, out to the pier's head and its own mixing layer there
    const head = dn > 0 ? M.pileA : M.pileB, piles = dn > 0 ? M.widthA : M.widthB;
    let Ur = U;
    if (head > 0) {
      Ur = U * PILE_FLOW;
      if (x > 0 && x < 2 * head) {
        const Bh = MOUTH.B0 + MOUTH.free * (1 - PILE_FLOW) / (1 + PILE_FLOW) * x;
        const lee = 1 - (1 - PILE_FLOW) * 0.5 * (1 + Math.tanh(2 * (n + head) / Bh)) * clamp(2 - x / head, 0, 1);
        ox *= lee; oy *= lee;
      }
    }
    // the gyre: within its radius the water is its own, and the harbor's (slow) water comes back in over its rim
    const gx = p.x - M.c.x, gy = p.y - M.c.y, s = Math.hypot(gx, gy) / M.R;
    let ix = ox, iy = oy;
    if (s < MOUTH.rim) {
      // (its near side, toward the mouth, goes with the stream: which way round that is)
      const turn = (M.into.y * ex - M.into.x * ey) > 0 ? 1 : -1, w = MOUTH.gyre * Ur * gyreShape(s) / Math.max(s * M.R, 1e-6) * turn;
      const keep = clamp((s - 1) / (MOUTH.rim - 1), 0, 1), kk = keep * keep * (3 - 2 * keep);
      ix = ox * kk - gy * w; iy = oy * kk + gx * w;
    }
    // the mixing layer across the gap: the stream outside it, the basin's water inside
    const xc = clamp(x, 0, M.W), Bw = MOUTH.B0 + MOUTH.spread * (xc + piles), m = 0.5 * (1 - Math.tanh(2 * n / Bw));
    ox = m * ox + (1 - m) * ix; oy = m * oy + (1 - m) * iy;
    // its eddies, a row carried down the layer; they form over the gap's first quarter and break up on its far corner
    const q = 2 * n / Bw;
    if (q > -4 && q < 4 && x > 0 && x < 1.5 * M.W) {
      const dU = (1 - MOUTH.gyre) * Ur, Uc = 0.5 * (1 + MOUTH.gyre) * Ur, lam = MOUTH.spacing * (MOUTH.B0 + MOUTH.spread * (M.W / 2 + piles));
      const ch = Math.cosh(q), env = Math.SQRT2 * dU / (ch * ch) * clamp(4 * (x + piles) / M.W, 0, 1) * clamp(3 - 2 * x / M.W, 0, 1);
      const ph = 2 * Math.PI * (Uc * t - x) / lam;
      const eu = MOUTH.u * env * Math.sin(ph), ev = MOUTH.v * env * Math.cos(ph);
      ox += ex * eu + M.into.x * ev; oy += ey * eu + M.into.y * ev;
    }
  }
  return { x: ox, y: oy };
}
