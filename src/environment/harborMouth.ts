import { clamp, segPt, type Vec } from '../core/math';
import { HARBORS, type Harbor } from '../geo/marina';
import { PILE_PIERS, landDist, pilePierDist } from '../geo/shore';
import { PILE_FLOW, basinFloor } from './current';

/**
 * The water in a harbor's entrance, where the tidal stream runs across its mouth (the owner, 13 Nov 2026, of Gashouse
 * Cove: "there are also frequent eddies in the entry"). No measurement or model of the current in this entrance was
 * found (reference/research/gashouse-entrance-eddies.md): the stream is NOAA's and the geometry OpenStreetMap's, and
 * the eddies' sizes and speeds are the general results for a harbor beside a stream, so they are estimates.
 *
 * **The place.** East Harbor is entered between the breakwater's light and Fort Mason's Pier 1 (Coast Pilot 7, ch. 7):
 * a gap about 37 m wide facing north, with the stream along the Cityfront running straight across it (NOAA SFB1204:
 * flood 088°, ebb 260°). On the flood the stream comes along the breakwater's outer side and leaves it at the knuckle
 * of its last leg (below); on the ebb it comes through Pier 1's piles (the pier stands on open piles: geo/shore.ts
 * PILE_PIERS).
 *
 * **What the stream does there** (Bijvelds 1997, TU Delft Communications on Hydraulic and Geotechnical Engineering
 * 1-97, and Langendoen 1989, report 8-89: both on harbors beside a river or tidal stream):
 *  - **The gyre.** The stream doesn't turn in through the mouth: it leaves the upstream corner and runs on across, and
 *    its drag on the still water inside turns that water in one gyre, whose edge runs at about a quarter of the stream
 *    ("as a first guess": Bijvelds §3, after Booij 1986; in the case he checks it against, nearer a tenth). Its near
 *    side goes with the stream, its far side against it: anticlockwise on the ebb here (the flood, below, barely reaches it). Its
 *    size here is the pool of clear water inside the mouth (the docks and the boats in them stop a larger one): the
 *    largest circle of water clear of walls, docks and piles that touches the mouth, worked out from the harbor's own
 *    plan (36 m in radius, behind a 37 m mouth). It turns as a solid body, fastest three-quarters of the way out, and
 *    dies in the boundary layer at its rim (the shape is assumed).
 *  - **It follows the tide late.** A gyre takes Te ≈ 50·β²·Le·B/(Ur·Bm) to answer a change in the stream (Booij 1986,
 *    in Langendoen p. 4; β 0.4–1 with the harbor's shape, 0.59 for his square harbor open across its whole width,
 *    taken here for want of a figure for a narrow mouth: the range would give 1.3 to 8 hours at 0.25 m/s). With the
 *    gyre's own pool for Le and B and the mouth for Bm, that is about 2¾ hours with half a knot across the mouth
 *    (0.25 m/s), 1.6 hours at 0.43 m/s, and 1/0.6 longer on the ebb, whose stream has come through the piles: not short
 *    beside the tide (Langendoen asks for a tide of 4·Te or more before the gyre may be taken as steady). So its speed
 *    is carried, and follows the stream's with that time: it never reaches the quarter on the real tide, and since
 *    the flood doesn't cross the gap (below) it keeps the ebb's sense right round the clock, weaker by the end of each
 *    flood. (Langendoen describes a gyre meeting a reversed stream: it draws the new stream in behind it while a new
 *    gyre starts at the upstream corner and squeezes it out. That would be this gyre's fate in a flood that did
 *    reach the gap.) With no stream to drive it the bed's drag runs it down, c_f·u/h (c_f = 0.0025
 *    as in pierWakes.ts, 3 m of water: Coast Pilot 7's 8–12 ft): slowly, a fifth in two hours. When the water is first
 *    looked at under the real tide, the gyre is spun up through the 13 hours of predictions before, so it is the same
 *    gyre whenever the sail began; under a steady preset it is what that stream holds.
 *  - **The pool round the gyre** (out to twice its radius, but not under the pier's piles) is the harbor's stillest
 *    water: the harbor's own calm (current.ts basinCalm, measured through the water from the open Bay) would leave
 *    half the stream and more running on just inside the gap, where the sources have the stream leave the corner and
 *    pass the mouth by.
 *  - **The mixing layer.** Between the stream and the gyre is a layer of sheared water that starts thin at the upstream
 *    corner and widens across the mouth. Its width B = ΔU/(dU/dy)max grows as 0.23 m per m in a harbor's mouth (Booij's
 *    measurement, b = 0.17·x between his own marks, B = 1.39·b: Bijvelds §4; his computed layers gave 0.13–0.20, and
 *    the free layer's 0.18·(Ur − Uh)/(Ur + Uh) of Brown & Roshko 1974 would give 0.11): about 9.5 m wide at the far
 *    corner. Across it the water goes from the stream's speed to the gyre's as a tanh.
 *  - **The eddies** a boat feels are the layer's own. Its largest are up to three layer-widths in size (Tukker 1997, in
 *    Bijvelds): taken here as a row of them that far apart, carried along at half the stream's speed (Bijvelds), so
 *    one passes every six or seven minutes in an ebb of half a knot across the mouth (slow through the piles, the
 *    layer wide). The water's speed swings by about 0.1·ΔU across the stream, root
 *    mean square, at the layer's center (Uijttewaal & Tukker, in Bijvelds §2), ΔU the stream's speed less the gyre's
 *    edge as it is at the time (so more when the gyre is still turning the old way). All of that is put into the one
 *    row, on the center line. Along the stream a row of eddies swings the water to either side of the line, opposite
 *    ways, by as much as keeps the water from piling up: 0.74 of the cross-stream swing for eddies three widths apart.
 *    The measured 0.2·ΔU along the stream at the center is mostly the broadband turbulence, which isn't modeled.
 *  - **Through the piles** (the ebb here). Pier 1 stands across the stream for 54 m north of the mouth, so on the ebb
 *    the water crossing the mouth has all come through its piles: slowed to PILE_FLOW of the stream (Bay East's
 *    estimate from the owner's photograph of the columns), a weak lee and not a headland's separation. The lee is
 *    bounded on its Bay side by its own mixing layer from the pier's head (the free layer's rate, 0.18·(1 − 0.6)/(1 +
 *    0.6) ≈ 0.045), and the layer across the mouth is taken to start already as wide as the pier's own 21 m of piles
 *    would have made it (an assumption: nothing was found on shear layers through pile fields). How far the lee lasts
 *    is NOT derived: bed friction alone would carry it some 600 m (h/(2·c_f), 3 m of water, c_f = 0.0025 as in
 *    pierWakes.ts), but the shore relief already slows that water for the shore's sake, so it is held for one
 *    pier-head's distance downstream and faded over the next.
 *  - The stream's own set is up to 16° off the mouth's line (the presets; 1–9° on the real tide of 14 Nov 2026), which
 *    would carry water steadily in (or out) through the gap of a closed basin: that part is taken out across the
 *    layer and, fading, for a gap's width off it on the Bay's side, where the stream turns to run along the line.
 *  - **The flood comes off the breakwater's knuckle, not its tip** (decided from the physics, 14 Nov 2026: the owner
 *    didn't know, and nothing published resolves this entrance: NOAA's Bay model, SFBOFS, has nodes 80–180 m apart
 *    here, measured from its own mesh; reference/research/gashouse-entrance-eddies.md). The breakwater's last leg
 *    starts at the tip of a spur: the wall juts some 30 m out toward the Bay to a sharp corner 60 m before the tip
 *    (along the mouth's line) and 36 m out of that line, and the leg runs back from it about 30° off the line (20–30°
 *    off the flood, with its set). A stream can't follow a corner like that: it leaves the wall there and comes
 *    back to it some lengths on, 6–7 times the step behind a square one (Kim, Kline & Johnston 1980), probably little
 *    less behind a slope this steep, and a spur holds a longer lee than a step: 4 is taken, an estimate on the short
 *    side, which still puts the whole gap (1.7 to 2.7 steps on) inside the corner's lee. Bed friction doesn't
 *    shorten it much (c_f·L/h is 0.05 over the 60 m to the tip and 0.12 over the whole 144 m: at or under the 0.12
 *    where it takes over, Babarutsi, Ganoulis & Chu 1989). So on the flood the stream passes the gap some 20–30 m
 *    off (less if the flood is set toward the shore: 5° of set is worth 8 m by the far corner; not modeled), behind its
 *    own widening layer and its row of large, slow eddies (one every four minutes or so in half a knot), and the
 *    water at the gap itself is the lee's: slack, with nothing to drive the cove's gyre, which stays the ebb's and
 *    runs down. The lee's own slow turning (in such bubbles the water by the wall creeps back at up to about a fifth
 *    of the stream, which here would be the ebb's way) is not drawn: its size is unknown. The lee is cut at Pier 1's
 *    face: under the piles and in the slot beyond, the water is the piles' own (current.ts), though by this picture
 *    the lee would reach some 25 m into that slot.
 *  - Not modeled, and not known: on the ebb the same leg stands 35 m into the stream just past the mouth, and water
 *    piling on it would push in through the gap (harbor studies have new water entering at the downstream corner:
 *    Langendoen §3.6; no figure for a wall across the stream was found).
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
  spacing: 3, carry: 0.5, v: 0.1,
  /** the bed's drag on the gyre once nothing drives it: c_f (the usual tidal-model figure, as pierWakes.ts; not measured
   * here) over the depth, m (Coast Pilot 7: 8–12 ft to the berths) */
  cf: 0.0025, depth: 3,
  /** a free mixing layer's rate (Brown & Roshko 1974, Bijvelds eq. 3.6), for the pile lee's Bay side: × (U1 − U2)/(U1 + U2) */
  free: 0.18,
  /** where a stream that has left a wall's knuckle comes back to the wall's line, in steps (the knuckle's height off the
   * line): 6–7 behind a square step (Kim, Kline & Johnston 1980, as COMSOL's backstep benchmark quotes it), less
   * behind a slope like this one's 27°: 4 is an estimate */
  reattach: 4
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
  /** each solid corner's knuckle: how far out of the mouth's line its wall stands (the step a stream along it comes off), and how far back along the line from the corner, m (0: none) */
  stepA: number; backA: number; stepB: number; backB: number;
  /** the harbor's stillest water over the stream (current.ts basinFloor) */
  floor: number;
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
  // (the steepest line from the corner to a point of its outline on the far side of it from the gap)
  const wall = (B: { pts: Vec[] }, q: Vec, away: number) => { let k = 0; for (const p of B.pts) { const o = -((p.x - q.x) * into.x + (p.y - q.y) * into.y), l = ((p.x - q.x) * along.x + (p.y - q.y) * along.y) * away; if (o > 5 && l > -3 && Math.hypot(o, l) < 90) k = Math.max(k, o / Math.max(l, 1)); } return Math.min(5, k); };
  // a solid corner's knuckle: the point of its wall furthest out toward the Bay within 90 m, where a stream coming along
  // that wall leaves it (how far out of the mouth's line, and how far back along it from the corner)
  const knuckle = (B: { pts: Vec[]; pile: boolean }, q: Vec, away: number) => { let out = 0, back = 0; if (!B.pile) for (const p of B.pts) { const o = -((p.x - q.x) * into.x + (p.y - q.y) * into.y), l = ((p.x - q.x) * along.x + (p.y - q.y) * along.y) * away; if (o > out && l > 5 && Math.hypot(o, l) < 90) { out = o; back = l; } } return out > 5 ? { out, back } : { out: 0, back: 0 }; };
  const kA = knuckle(first.B, a, -1), kB = knuckle(second.B, b, 1);
  const pileA = reach(first.B), pileB = reach(second.B), far = Math.max(2 * pileA, 2 * pileB, W, kA.back + kA.out, kB.back + kB.out) + 10, r = Math.max(far, MOUTH.rim * R + W);
  return { harbor: h, a, b, along, into, W, pileA, pileB, widthA: width(first.B), widthB: width(second.B), c, R, turn: (into.y * along.x - into.x * along.y) > 0 ? 1 : -1, wallA: wall(first.B, a, -1), wallB: wall(second.B, b, 1), stepA: kA.out, backA: kA.back, stepB: kB.out, backB: kB.back, floor: basinFloor(h),
    ref: { x: mid.x - into.x * W / 2, y: mid.y - into.y * W / 2 },
    box: { x0: Math.min(a.x, b.x, c.x) - r, x1: Math.max(a.x, b.x, c.x) + r, y0: Math.min(a.y, b.y, c.y) - r, y1: Math.max(a.y, b.y, c.y) + r } };
}

export const MOUTHS: Mouth[] = ['gashouse-cove'].map(build).filter((m): m is Mouth => !!m);
/** Where World reads the stream that crosses each mouth (m/s there, eased by the shore, without the harbor's calm). */
export const MOUTH_REFS: Vec[] = MOUTHS.map(m => m.ref);

/** The gyre's speed at r from its center, over its edge speed: a solid body out to `peak`, dying away by `rim`. */
const gyreShape = (s: number) => s <= MOUTH.peak ? s / MOUTH.peak : Math.max(0, (MOUTH.rim - s) / (MOUTH.rim - MOUTH.peak));
/** How much of the stream is back at the wall's line, X m past a knuckle `step` m high: none within the separated water, coming back over one more of its lengths. */
const regained = (X: number, step: number) => { const xi = X / (MOUTH.reattach * step); return xi < 1 ? 0 : 1 - Math.exp(1 - xi); };
/**
 * The stream f at mouth i: `along` signed a→b (m/s); `Uo` the stream outside the layer (through any piles on its way);
 * `Ur` what crosses the gap itself and drives the gyre (nothing, in a knuckle's lee); `run` how far the layer has
 * already run when it reaches the gap's upstream corner (the piles' width, or back to the knuckle); `step` and `back`
 * the upstream corner's knuckle.
 */
function crossing(M: Mouth, f: Vec) {
  const along = f.x * M.along.x + f.y * M.along.y, U = Math.abs(along), fromA = along > 0;
  const piled = (fromA ? M.pileA : M.pileB) > 0, step = fromA ? M.stepA : M.stepB, back = fromA ? M.backA : M.backB;
  if (piled) return { along, Uo: U * PILE_FLOW, Ur: U * PILE_FLOW, run: fromA ? M.widthA : M.widthB, step: 0, back: 0 };
  if (step > 0) return { along, Uo: U, Ur: U * regained(back + M.W / 2, step), run: back, step, back };
  return { along, Uo: U, Ur: U, run: 0, step: 0, back: 0 };
}
/** The eddies' spacing down the layer (m): `spacing` layer-widths, at the layer's width off the middle of the gap. */
const eddySpacing = (M: Mouth, run: number) => MOUTH.spacing * (MOUTH.B0 + MOUTH.spread * (M.W / 2 + run));
/** How long an eddy takes to pass (s) in a stream f across mouth i (Infinity at slack). */
export const eddyPeriod = (i: number, f: Vec): number => { const M = MOUTHS[i], c = crossing(M, f); return eddySpacing(M, c.run) / Math.max(MOUTH.carry * c.Uo, 1e-9); };
/** The gyre's response time (s) in a stream f across mouth i: Booij's Te ≈ 50·β²·Le·B/(Ur·Bm), the gyre's own pool 2R by 2R behind a mouth Bm = W. */
export const gyreTime = (i: number, f: Vec): number => { const M = MOUTHS[i]; return 50 * MOUTH.beta ** 2 * (2 * M.R) ** 2 / (Math.max(crossing(M, f).Ur, 1e-9) * M.W); };

/**
 * What the mouths' water remembers: the stream crossing each (read every half minute: the tide turns over hours), the
 * gyre's edge speed (signed along a→b on its mouth side, m/s), which follows the stream late, and the eddy train's
 * phase (turns), carried forward at the stream's own rate so it never jumps when the stream is read afresh.
 */
export interface MouthState { t: number; flows: Vec[]; gyre: number[]; phase: number[] }
export const mouthState = (): MouthState => ({ t: NaN, flows: [], gyre: [], phase: [] });
/** The gyre's edge speed dt seconds on, in a stream f across mouth i: toward a quarter of the stream in Booij's time,
 * and the bed's drag on whatever it carries beyond what that stream holds up (so in slack water it runs down). */
function spin(i: number, g: number, f: Vec, dt: number): number {
  const c = crossing(MOUTHS[i], f), want = MOUTH.gyre * c.Ur * Math.sign(c.along), Te = gyreTime(i, f);
  for (let left = dt; left > 0; left -= 60) {
    const h = Math.min(60, left);
    g += (want - g) * (1 - Math.exp(-h / Te));
    // (the bed's drag: only on what the stream isn't holding up. Booij's quarter already has the drag in it, so a gyre
    // on its way up to it is left to his time alone; one turning faster than the stream holds, or the other way, or in
    // slack water, is run down)
    if (g * want <= 0) g -= MOUTH.cf / MOUTH.depth * Math.abs(g) * g * h;
    else if (Math.abs(g) > Math.abs(want)) g -= MOUTH.cf / MOUTH.depth * (Math.abs(g) * g - Math.abs(want) * want) * h;
  }
  return g;
}
/** Is p where a harbor mouth's water is (a box check: asked for every boat's current, every step)? */
export function nearMouth(p: Vec): boolean {
  for (const M of MOUTHS) { const B = M.box; if (p.x > B.x0 && p.x < B.x1 && p.y > B.y0 && p.y < B.y1) return true; }
  return false;
}
/** How far back the gyre is spun up from when the water is first looked at (h), and in what steps. */
const PAST = 13, PAST_STEP = 0.25;
/**
 * Bring the state to time t (s), reading the stream at each MOUTH_REFS point with `read`. The first time (or after
 * time has gone backwards) the gyre is spun up through the last 13 hours of the stream, where they can be read
 * (`past`: the stream at a point so many hours ago; the real tide's predictions), so it is the gyre this tide has left
 * whenever the sail began; with no past (a steady preset) it is what that stream holds steady.
 */
export function refreshMouths(S: MouthState, t: number, read: (p: Vec) => Vec, past?: (p: Vec, hoursAgo: number) => Vec): void {
  const dt = t - S.t, fresh = !(dt >= 0) || S.flows.length !== MOUTHS.length;
  for (let i = 0; i < MOUTHS.length; i++) {
    const f = read(MOUTH_REFS[i]);
    if (fresh) {
      const c = crossing(MOUTHS[i], past ? past(MOUTH_REFS[i], PAST) : f); let g = MOUTH.gyre * c.Ur * Math.sign(c.along);
      if (past) for (let h = PAST - PAST_STEP; h >= 0; h -= PAST_STEP) g = spin(i, g, past(MOUTH_REFS[i], h), PAST_STEP * 3600);
      S.gyre[i] = g; S.phase[i] ??= 0; // (the eddies keep their beat through a change of conditions)
    } else {
      S.phase[i] = (S.phase[i] + dt / eddyPeriod(i, S.flows[i])) % 1; // (at the rate of the stream that ran since the last look)
      S.gyre[i] = spin(i, S.gyre[i], f, dt);
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
    const { along, Uo, Ur, run, step, back } = crossing(M, f);
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
    // (round it, out to twice its radius, the pool's other water is the harbor's stillest: the stream doesn't turn in
    // through the mouth, whatever the harbor's own calm, measured through the water from the open Bay, leaves there)
    let keep = 1, wx = 0, wy = 0;
    if (s < 2) {
      if (s < MOUTH.rim) {
        const w = S.gyre[i] * gyreShape(s) / Math.max(s * M.R, 1e-6) * M.turn, q = clamp((s - 1) / (MOUTH.rim - 1), 0, 1);
        keep = q * q * (3 - 2 * q); wx = -gy * w; wy = gx * w;
      }
      // (not under a pier's piles, where the stream runs through: coming in over 4 m off its deck)
      if (k > M.floor) { const q = clamp((s - MOUTH.rim) / (2 - MOUTH.rim), 0, 1), off = clamp(pilePierDist(p) / 4, 0, 1); keep *= 1 - off * (1 - (M.floor + (k - M.floor) * q * q * (3 - 2 * q)) / k); }
    }
    // a knuckle upstream (the flood here): the stream left the wall there, and the layer between it and the slow water
    // in the corner's lee lies off the wall's line, coming back to it where the stream reattaches. X: how far past the
    // knuckle; off: how far off the line the layer's middle is; regain: how much of the stream is back at the line.
    // (Past the gap's far corner, within its first 3 m, all of that gives way to what's there: here the pier's piles.)
    let X = x, off = 0, regain = 1;
    if (step > 0) {
      X = x + back;
      if (X > 0) {
        const fade = x > M.W ? clamp(1 - (x - M.W) / 3, 0, 1) : 1, xi = X / (MOUTH.reattach * step);
        // (and as the stream dies at slack: nothing steps when the layer's line goes back to the gap's)
        const on = fade * clamp(Uo / 0.05, 0, 1);
        off = step * Math.min(1, X / back) * Math.max(0, 1 - xi * xi) * on; regain = 1 - (1 - regained(X, step)) * on;
      }
    }
    // the mixing layer: the stream outside it, the lee's or the basin's water inside. (Its width from where it began;
    // as the stream dies at slack, from the middle, so nothing steps when the tide turns)
    const live = clamp(Uo / 0.05, 0, 1), reach = M.W + (step > 0 ? back : 0), xr = step > 0 ? clamp(X, 0, reach) : clamp(x, 0, M.W) + run;
    const Bw = MOUTH.B0 + MOUTH.spread * (live * xr + (1 - live) * (M.W / 2 + run));
    const q = 2 * (n + off) / Bw, m = 0.5 * (1 - Math.tanh(q)), ch = Math.cosh(clamp(q, -20, 20)), core = 1 / (ch * ch);
    // (inside the layer on the Bay's side of the line, the lee's water: what little of the stream is back there)
    if (regain < 1) { const e = clamp(n / 5, 0, 1); keep *= n < 0 ? regain : regain + (1 - regain) * e * e * (3 - 2 * e); }
    ox = m * sx + (1 - m) * (keep * ox + wx); oy = m * sy + (1 - m) * (keep * oy + wy);
    // (no steady stream runs in or out through the gap of a closed basin: what the tide's own set, or the gyre's rim,
    // would carry across the line is taken out there, and for a gap's width off it on the Bay's side, where the
    // stream turns to run along the line and not at it)
    if (x > 0 && x < M.W && n > -3 * M.W) {
      const cg = n > 0 ? 1 / Math.cosh(Math.min(20, 2 * n / Bw)) ** 2 : Math.exp(n / M.W), vi = (ox * M.into.x + oy * M.into.y) * cg * clamp(Math.min(x, M.W - x) / 3, 0, 1);
      ox -= M.into.x * vi; oy -= M.into.y * vi;
    }
    // its eddies, a row carried down the layer; they form over its first quarter and break up on the gap's far corner
    if (q > -5 && q < 5 && X > 0 && x < 1.5 * M.W && Uo > 0) {
      // (the speed's change across the layer: the stream's, less the gyre's edge as it is now, with it or against it;
      // off a knuckle, the stream's less what the lee's water has of it)
      const dU = step > 0 ? Uo * (1 - regain) : Math.abs(Ur - dn * S.gyre[i]);
      const amp = Math.SQRT2 * dU * clamp(4 * (X + (step > 0 ? 0 : run)) / reach, 0, 1) * clamp(3 - 2 * x / M.W, 0, 1);
      const lam = eddySpacing(M, run), ph = 2 * Math.PI * (S.phase[i] + (t - S.t) / eddyPeriod(i, f) - X / lam);
      // (a row of eddies: across the stream the water swings most on the layer's center line; along it, to either side
      // of the line and opposite ways there, a quarter-turn apart, and by just as much as lets the water neither pile
      // up nor thin out: u = dψ/dn, v = −dψ/dx of the one stream function)
      const ev = MOUTH.v * amp * core * Math.cos(ph), eu = -MOUTH.v * amp * (4 * lam / (2 * Math.PI * Math.max(Bw, lam / MOUTH.spacing))) * Math.tanh(q) * core * Math.sin(ph); // (no more than where the eddies are their three widths apart: nearer the corner the layer is thinner than its eddies' spacing here allows for)
      ox += ex * eu + M.into.x * ev; oy += ey * eu + M.into.y * ev;
    }
  }
  return { x: ox, y: oy };
}
