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
 *    ("as a first guess": Bijvelds §3, after Booij 1986; in the case he checks it against, nearer a tenth). Its near
 *    side goes with the stream, its far side against it: clockwise on the flood here, anticlockwise on the ebb. Its
 *    size here is the pool of clear water inside the mouth (the docks and the boats in them stop a larger one): the
 *    largest circle of water clear of walls, docks and piles that touches the mouth, worked out from the harbor's own
 *    plan (36 m in radius, behind a 37 m mouth). It turns as a solid body, fastest three-quarters of the way out, and
 *    dies in the boundary layer at its rim (the shape is assumed).
 *  - **It follows the tide late.** A gyre takes Te ≈ 50·β²·Le·B/(Ur·Bm) to answer a change in the stream (Booij 1986,
 *    in Langendoen ch. 2; β 0.4–1, 0.59 taken). With the gyre's own pool for Le and B and the mouth for Bm, that is
 *    about 3 hours with half a knot across the mouth (0.25 m/s) and 1½ hours at 0.43 m/s, the
 *    most this mouth sees: not short beside the tide (Langendoen asks for a tide of 4·Te or more before the gyre may
 *    be taken as steady). So its speed is carried, and follows the stream's with that time: it is still turning the
 *    old way for an hour or more after slack, and never reaches the quarter on a short tide. (Langendoen describes
 *    what the old gyre really does then: it draws the new stream in behind it while a new gyre starts at the upstream
 *    corner and squeezes it out. Here the one gyre just slows and reverses.) When a sail begins, the gyre is given
 *    what the stream of the moment would hold steady: the tide's past isn't known.
 *  - **The mixing layer.** Between the stream and the gyre is a layer of sheared water that starts thin at the upstream
 *    corner and widens across the mouth. Its width B = ΔU/(dU/dy)max grows as 0.23 m per m in a harbor's mouth (Booij's
 *    measurement, b = 0.17·x between his own marks, B = 1.39·b: Bijvelds §4; his computed layers gave 0.13–0.20, and
 *    the free layer's 0.18·(Ur − Uh)/(Ur + Uh) of Brown & Roshko 1974 would give 0.11): about 9.5 m wide at the far
 *    corner. Across it the water goes from the stream's speed to the gyre's as a tanh.
 *  - **The eddies** a boat feels are the layer's own. Its largest are up to three layer-widths in size (Tukker 1997, in
 *    Bijvelds): taken here as a row of them that far apart, carried along at half the stream's speed (Bijvelds), so
 *    one passes every minute and a half or so on a flood of half a knot across the mouth, every few minutes on the
 *    ebb. The water's speed swings by about 0.2·ΔU along the stream and 0.1·ΔU across it, root mean square, at the
 *    layer's center (Uijttewaal & Tukker, in Bijvelds §2). All of the cross-stream figure is put into the one row, on
 *    the center line, as a row of eddies has it; the along-stream swing of a row is nothing on the center line and
 *    opposite to either side, so the 0.2 is given to its two flanks (the measured figure at the center is the
 *    broadband turbulence, which isn't modeled). An upper bound either way.
 *  - **Through the piles** (the ebb here). Pier 1 stands across the stream for 54 m north of the mouth, so on the ebb
 *    the water crossing the mouth has all come through its piles: slowed to PILE_FLOW of the stream (Bay East's
 *    estimate from the owner's photograph of the columns), a weak lee and not a headland's separation. The lee is
 *    bounded on its Bay side by its own mixing layer from the pier's head (the free layer's rate, 0.18·(1 − 0.6)/(1 +
 *    0.6) ≈ 0.045), and the layer across the mouth is taken to start already as wide as the pier's own 21 m of piles
 *    would have made it (an assumption: nothing was found on shear layers through pile fields). How far the lee lasts
 *    is NOT derived: bed friction alone would carry it some 600 m (h/(2·c_f), 3 m of water, c_f = 0.0025 as in
 *    pierWakes.ts), but the shore relief already slows that water for the shore's sake, so it is held for one
 *    pier-head's distance downstream and faded over the next.
 *  - The stream's own set is a few degrees off the mouth's line, which would carry water steadily in (or out) through
 *    the gap of a closed basin: across the layer that part is taken out.
 *  - Not modeled, and not known: on the flood the breakwater's last leg runs 27° off the stream after a knuckle 64 m
 *    west of the tip, so the stream may leave the wall there, not at the tip, and the mouth lie in that corner's lee;
 *    on the ebb the same leg stands 35 m into the stream just past the mouth, and water piling on it would push in
 *    through the gap. Either would change the picture more than any figure above (the owner asked: 14 Nov 2026).
 *    Also not modeled: a second, weaker gyre deeper in; the start-up vortex shed as the stream builds (Signell & Geyer
 *    1991); the water the tide's rise and fall draws through the mouth (a few cm/s here); the single piles' eddies.
 *
 * Only Gashouse Cove's mouth is built: each other harbor's needs its own look at where its stream runs.
 */
export const MOUTH = {
  /** the gyre's edge speed over the stream's ("a first guess": Bijvelds 1997 §3, after Booij 1986) */
  gyre: 0.25,
  /** where in the gyre the water is fastest, and where it has died away, as fractions of its radius (assumed) */
  peak: 0.75, rim: 1.25,
  /** Booij's β in the gyre's response time, 0.4–1 (in Langendoen 1989 ch. 2); 0.59 is our researcher's reading, not measured here */
  beta: 0.59,
  /** the mixing layer's widening, m per m (Booij's measurement in a harbor's mouth, as the width B = ΔU/(dU/dy)max:
   * Bijvelds 1997 §4), and its width at the corner (assumed) */
  spread: 0.23, B0: 1,
  /** the eddies' spacing in layer widths (the size the largest reach: Tukker 1997, in Bijvelds; taken as their spacing),
   * the speed they're carried at over the stream's (Bijvelds), and their swing along and across the stream over ΔU, rms */
  spacing: 3, carry: 0.5, u: 0.2, v: 0.1,
  /** a free mixing layer's rate (Brown & Roshko 1974, Bijvelds eq. 3.6), for the pile lee's Bay side: × (U1 − U2)/(U1 + U2) */
  free: 0.18
};

interface Mouth {
  harbor: Harbor;
  /** the two corners of the gap, the unit vector from a to b, the unit normal into the basin, and the gap's width */
  a: Vec; b: Vec; along: Vec; into: Vec; W: number;
  /** which corners are pile piers, how far each pier's head stands out past the mouth, and its width of piles there */
  pileA: number; pileB: number; widthA: number; widthB: number;
  /** the gyre's center and radius, and which way round it turns for a stream from a to b (+1 anticlockwise seen from above) */
  c: Vec; R: number; turn: number;
  /** how steeply each corner's own wall runs out toward the Bay from the mouth's line (m out per m along it, beyond the gap) */
  wallA: number; wallB: number;
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
  // each corner's wall beyond the gap: toward the point of its outline furthest out to the Bay within 70 m
  const wall = (B: { pts: Vec[] }, q: Vec) => { let out = 0, far = 1; for (const p of B.pts) { const o = -((p.x - q.x) * into.x + (p.y - q.y) * into.y), l = Math.abs((p.x - q.x) * along.x + (p.y - q.y) * along.y); if (o > out && Math.hypot(o, l) < 70) { out = o; far = l; } } return Math.min(5, out / Math.max(far, 1)); };
  const pileA = reach(first.B), pileB = reach(second.B), far = Math.max(2 * pileA, 2 * pileB, W) + 10, r = Math.max(far, MOUTH.rim * R + W);
  return { harbor: h, a, b, along, into, W, pileA, pileB, widthA: width(first.B), widthB: width(second.B), c, R, turn: (into.y * along.x - into.x * along.y) > 0 ? 1 : -1, wallA: wall(first.B, a), wallB: wall(second.B, b),
    ref: { x: mid.x - into.x * W / 2, y: mid.y - into.y * W / 2 },
    box: { x0: Math.min(a.x, b.x, c.x) - r, x1: Math.max(a.x, b.x, c.x) + r, y0: Math.min(a.y, b.y, c.y) - r, y1: Math.max(a.y, b.y, c.y) + r } };
}

export const MOUTHS: Mouth[] = ['gashouse-cove'].map(build).filter((m): m is Mouth => !!m);
/** Where World reads the stream that crosses each mouth (m/s there, eased by the shore, without the harbor's calm). */
export const MOUTH_REFS: Vec[] = MOUTHS.map(m => m.ref);

/** The gyre's speed at r from its center, over its edge speed: a solid body out to `peak`, dying away by `rim`. */
const gyreShape = (s: number) => s <= MOUTH.peak ? s / MOUTH.peak : Math.max(0, (MOUTH.rim - s) / (MOUTH.rim - MOUTH.peak));
/** The stream across mouth i (signed along a→b, m/s) once it's through any piles on its way, and the piles' width it crossed. */
const crossing = (M: Mouth, f: Vec) => { const along = f.x * M.along.x + f.y * M.along.y, piled = (along > 0 ? M.pileA : M.pileB) > 0; return { along, Ur: Math.abs(along) * (piled ? PILE_FLOW : 1), piles: along > 0 ? M.widthA : M.widthB }; };
/** The eddies' spacing down the layer (m): `spacing` layer-widths, at the layer's width in the middle of the gap. */
const eddySpacing = (M: Mouth, piles: number) => MOUTH.spacing * (MOUTH.B0 + MOUTH.spread * (M.W / 2 + piles));
/** How long an eddy takes to pass (s) in a stream f across mouth i (Infinity at slack). */
export const eddyPeriod = (i: number, f: Vec): number => { const M = MOUTHS[i], c = crossing(M, f); return eddySpacing(M, c.piles) / Math.max(MOUTH.carry * c.Ur, 1e-9); };
/** The gyre's response time (s) in a stream f across mouth i: Booij's Te ≈ 50·β²·Le·B/(Ur·Bm), the gyre's own pool 2R by 2R behind a mouth Bm = W. */
export const gyreTime = (i: number, f: Vec): number => { const M = MOUTHS[i]; return 50 * MOUTH.beta ** 2 * (2 * M.R) ** 2 / (Math.max(crossing(M, f).Ur, 1e-9) * M.W); };

/**
 * What the mouths' water remembers: the stream crossing each (read every half minute: the tide turns over hours), the
 * gyre's edge speed (signed along a→b on its mouth side, m/s), which follows the stream late, and the eddy train's
 * phase (turns), carried forward at the stream's own rate so it never jumps when the stream is read afresh.
 */
export interface MouthState { t: number; flows: Vec[]; gyre: number[]; phase: number[] }
export const mouthState = (): MouthState => ({ t: NaN, flows: [], gyre: [], phase: [] });
/**
 * Bring the state to time t (s), reading the stream at each MOUTH_REFS point with `read`. The first time (or after
 * time has gone backwards) the gyre starts as the stream of the moment would have it: where the tide has been is not
 * known.
 */
export function refreshMouths(S: MouthState, t: number, read: (p: Vec) => Vec): void {
  const dt = t - S.t, fresh = !(dt >= 0) || S.flows.length !== MOUTHS.length;
  for (let i = 0; i < MOUTHS.length; i++) {
    const f = read(MOUTH_REFS[i]), c = crossing(MOUTHS[i], f), want = MOUTH.gyre * c.Ur * Math.sign(c.along);
    if (fresh) { S.gyre[i] = want; S.phase[i] = 0; }
    else {
      S.phase[i] = (S.phase[i] + dt / eddyPeriod(i, S.flows[i])) % 1; // (at the rate of the stream that ran since the last look)
      S.gyre[i] += (want - S.gyre[i]) * (1 - Math.exp(-dt / gyreTime(i, f)));
    }
    S.flows[i] = f;
  }
  S.t = t;
}

/**
 * The current at p with the harbor mouths' water in it: `c` the stream there without any harbor's calm, `k` the
 * harbor's calm there (current.ts basinCalm: 1 in open water), `S` the mouths' state (refreshMouths), `t` the time (s).
 * Away from every mouth it is c·k, as before.
 */
export function withHarborMouths(p: Vec, c: Vec, k: number, S: MouthState, t: number): Vec {
  let ox = c.x * k, oy = c.y * k;
  for (let i = 0; i < MOUTHS.length; i++) {
    const M = MOUTHS[i], B = M.box;
    if (p.x < B.x0 || p.x > B.x1 || p.y < B.y0 || p.y > B.y1) continue;
    const f = S.flows[i]; if (!f) continue;
    const { along, Ur, piles } = crossing(M, f);
    // the mouth's own frame, downstream from the upstream corner: x along the gap, n into the basin
    const dn = along >= 0 ? 1 : -1, up = dn > 0 ? M.a : M.b, ex = M.along.x * dn, ey = M.along.y * dn;
    const x = (p.x - up.x) * ex + (p.y - up.y) * ey, n0 = (p.x - up.x) * M.into.x + (p.y - up.y) * M.into.y;
    // (past either corner the line between the Bay's water and the basin's runs on along that corner's own wall)
    const n = n0 + (x < 0 ? -x * (dn > 0 ? M.wallA : M.wallB) : x > M.W ? (x - M.W) * (dn > 0 ? M.wallB : M.wallA) : 0);
    // the stream came through a pile pier: its lee on the Bay's side, out to the pier's head and its own mixing layer there
    const head = dn > 0 ? M.pileA : M.pileB;
    let sx = ox, sy = oy;
    if (head > 0 && x > 0 && x < 2 * head) {
      const Bh = MOUTH.B0 + MOUTH.free * (1 - PILE_FLOW) / (1 + PILE_FLOW) * x;
      const lee = 1 - (1 - PILE_FLOW) * 0.5 * (1 + Math.tanh(2 * (n0 + head) / Bh)) * clamp(2 - x / head, 0, 1);
      sx *= lee; sy *= lee;
    }
    // the gyre: within its radius the water is its own, and the harbor's (slow) water comes back in over its rim
    const gx = p.x - M.c.x, gy = p.y - M.c.y, s = Math.hypot(gx, gy) / M.R;
    let keep = 1, wx = 0, wy = 0;
    if (s < MOUTH.rim) {
      const w = S.gyre[i] * gyreShape(s) / Math.max(s * M.R, 1e-6) * M.turn, q = clamp((s - 1) / (MOUTH.rim - 1), 0, 1);
      keep = q * q * (3 - 2 * q); wx = -gy * w; wy = gx * w;
    }
    // the mixing layer across the gap: the stream outside it, the basin's water inside. (Its width from the upstream
    // corner; as the stream dies at slack, from the middle, so nothing steps when the tide turns)
    const live = clamp(Ur / 0.05, 0, 1), xc = clamp(x, 0, M.W), Bw = MOUTH.B0 + MOUTH.spread * (live * (xc + piles) + (1 - live) * M.W / 2);
    const q = 2 * n / Bw, m = 0.5 * (1 - Math.tanh(q)), ch = Math.cosh(clamp(q, -20, 20)), core = 1 / (ch * ch);
    ox = m * sx + (1 - m) * (keep * ox + wx); oy = m * sy + (1 - m) * (keep * oy + wy);
    // (no steady stream runs in or out through the gap of a closed basin: what the tide's own set, or the gyre's rim,
    // would carry across the line is taken out there)
    if (x > 0 && x < M.W) { const vi = (ox * M.into.x + oy * M.into.y) * core * clamp(Math.min(x, M.W - x) / 3, 0, 1); ox -= M.into.x * vi; oy -= M.into.y * vi; }
    // its eddies, a row carried down the layer; they form over the gap's first quarter and break up on its far corner
    if (q > -5 && q < 5 && x > 0 && x < 1.5 * M.W && Ur > 0) {
      const dU = (1 - MOUTH.gyre) * Ur, amp = Math.SQRT2 * dU * clamp(4 * (x + piles) / M.W, 0, 1) * clamp(3 - 2 * x / M.W, 0, 1);
      const ph = 2 * Math.PI * (S.phase[i] + (t - S.t) / eddyPeriod(i, f) - x / eddySpacing(M, piles));
      // (a row of eddies: across the stream the water swings most on the layer's center line; along it, most to either
      // side of the line and opposite ways there, a quarter-turn apart)
      const eu = MOUTH.u * amp * Math.tanh(q) * core / ODD_PEAK * Math.sin(ph), ev = MOUTH.v * amp * core * Math.cos(ph);
      ox += ex * eu + M.into.x * ev; oy += ey * eu + M.into.y * ev;
    }
  }
  return { x: ox, y: oy };
}
/** the peak of tanh(q)·sech²(q), at tanh²(q) = 1/3 */
const ODD_PEAK = 2 / (3 * Math.sqrt(3));
