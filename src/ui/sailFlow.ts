import { CE_ABOVE_WL, RIG } from '../boat/balance';
import type { Boat } from '../boat/boat';
import { crewEaseBoom, sailFrame } from '../boat/physics';
import { SAILS, type SailName, type SailTrim } from '../boat/trim';
import { D2R, KT, clamp, wrap } from '../core/math';
import { boatTells, type TellState } from '../render/sails';

/*
 * The flow view's model (the owner's training tool #2): the sails cut across at three heights, each section where the
 * sim has it, in the wind the sim's sails see. What's the sim's and what's only illustrated is kept apart here so the panel
 * can label it.
 *
 * From the sim:
 *  - the apparent wind at each height: the same wind the physics trims to (physics.ts sailWind: ORC VPP Documentation
 *    2025 §7.1, the log profile VT(z) = VT(10 m)·ln(z/z0)/ln(10/z0), z0 = 0.005 m, eq. 7.1, its cross-wind part reduced
 *    by cos heel, eqs. 7.2–7.3), in the frame the sails are trimmed in (sailFrame: her course through the water; her
 *    heading when she's hove to, as heaveTo has it). At the centre of effort's height it is the sim's own wind exactly;
 *    above it there's more wind and it comes from further aft, below it less and further forward;
 *  - each sail's flow (attached, luffing, stalled, and how much) and its telltales: the sim has one trim for each sail
 *    (b.trim: its wind at the centre of effort against its sheet), and that's what every cut shows, as the 3D telltales
 *    at every height do. The sim's forces see nothing else;
 *  - each sail's depth, draft and twist (b.shape);
 *  - leeway (b.leeway).
 * Our reading of the sim's numbers, drawn (the panel says so):
 *  - each section's angle to the centreline: the sheet sets the foot (the boom's angle, b.sheets.main; the jib's clew
 *    seen from its tack, b.sheets.jib), and the sail's twist (head against foot) opens it evenly up the luff;
 *  - the streamlines and the speed around the sections (a 2D potential flow, flowField, which never feeds back into the
 *    sim), and where the flow has left the sail, drawn from the sim's stall amount (or off the wind, where a sail works
 *    stalled, behind all of it). The sim has no slot or backwinding of its own: what the panel says of the slot is how
 *    real boats behave.
 */

/** The rig's geometry for the sections (balance.ts RIG, from the ORC certificates; m). Heights above the waterline. */
const SHEER = RIG.hbi, BOOM = SHEER + RIG.BAS;
/** The jib's tack just above the deck at the stem (0.10 m up its stay: render/boatMesh.ts) and its head on the stay
 * 5.95 m up the luff (ORC: luff 5.95). The stay from the stem, J = 2.00 m forward of the mast, to the hounds IG = 6.50 m
 * up the mast: its slope. */
const STAY_LEN = Math.hypot(RIG.J, RIG.IG), JIB_TACK = SHEER + 0.10 * RIG.IG / STAY_LEN, JIB_HEAD = JIB_TACK + 5.95 * RIG.IG / STAY_LEN;
/** The main's chord up its height (fraction of the luff from the boom: E, then the ORC girths MQW, MHW, MTW, MUW, MHB). */
const MAIN_GIRTH: [number, number][] = [[0, RIG.E], [0.25, 2.89], [0.5, 2.22], [0.75, 1.32], [0.875, 0.72], [1, 0.11]];
/** The jib's: LP 2.36 m at its foot, narrowing about straight to its head (its roach is small: 9 cm). */
const JIB_FOOT_CHORD = 2.36, JIB_HEAD_CHORD = 0.06;
/** The mast's fore-and-aft depth (m): the main's luff is on its after side. */
const MAST_FA = 0.133;

/** The three heights the panel cuts the sails at (m above the waterline): low, where the sim trims (its centre of
 * effort), and high, above the jib's head, where only the main is. */
export const FLOW_HEIGHTS = [{ name: 'Low', z: 2.4 }, { name: 'Centre of effort', z: CE_ABOVE_WL }, { name: 'High', z: 8.2 }] as const;

/** The true wind at height z over the water, as a share of the 10 m wind (ORC eq. 7.1). */
export const windShare = (z: number) => Math.log(Math.max(0.05, z) / 0.005) / Math.log(10 / 0.005);

/** The apparent wind the sails see at height z (m above the waterline), in the sails' frame: speed (kt) and angle (deg,
 * unsigned: off the bow). As physics.ts step() works it for the sails' centre of effort, at z. */
export function windAt(b: Boat, z: number, turn = 0): { kt: number; awa: number } {
  // (hove to, the sim trims to the wind across her heading: physics.ts heaveTo)
  const fr = b.hove ? { rot: 0, along: b.v, across: b.sway ?? 0 } : sailFrame(b), heel = b.heel ?? 0, c = Math.cos(heel * D2R);
  // (the rig sweeping through the air as she rolls: at height z the sails move z/CE as fast as at the centre of effort)
  const sway = -(b.heelRate ?? 0) * D2R * z * c;
  const vt = b.ww.kt * KT * windShare(z), rel = wrap(b.ww.from - (b.h + turn + fr.rot)) * D2R;
  const along = vt * Math.cos(rel) + fr.along - (b.astern ?? 0), across = vt * Math.sin(rel) * c + fr.across + sway;
  return { kt: Math.hypot(along, across) / KT, awa: Math.abs(Math.atan2(across, along) / D2R) };
}

/** Where a sail is at height z: its luff (m forward of the mast's after side; + forward) and its chord (m), or null
 * where the sail isn't (below its foot, above its head). */
export function sectionAt(sail: SailName, z: number): { luff: number; chord: number; f: number } | null {
  if (sail === 'main') {
    const f = (z - BOOM) / RIG.P;
    if (f < 0 || f > 0.97) return null;
    let chord = RIG.E;
    for (let i = 1; i < MAIN_GIRTH.length; i++) if (f <= MAIN_GIRTH[i][0]) { const [f0, c0] = MAIN_GIRTH[i - 1], [f1, c1] = MAIN_GIRTH[i]; chord = c0 + (c1 - c0) * (f - f0) / (f1 - f0); break; }
    return { luff: 0, chord, f };
  }
  const f = (z - JIB_TACK) / (JIB_HEAD - JIB_TACK);
  if (f < 0 || f > 0.95) return null;
  const s = z - SHEER; // (the stay: J forward of the mast's front at the sheer, at the mast at the hounds)
  return { luff: MAST_FA + RIG.J * (1 - s / RIG.IG), chord: JIB_FOOT_CHORD + (JIB_HEAD_CHORD - JIB_FOOT_CHORD) * f, f };
}

/** One sail cut across at one height: where it is, how it's set, and the sim's flow over it. */
export interface FlowSection {
  sail: SailName;
  /** Its luff (m forward of the mast's after side) and chord (m). */
  luff: number; chord: number;
  /** Its angle to the centreline (deg, to leeward: the foot's, opened by the twist up the luff), depth (camber/chord)
   * and draft (fraction of the chord from the luff). */
  angle: number; depth: number; draft: number;
  /** The sim's trim for the sail (its one trim: the same at every height), and its telltales as the 3D boat has them
   * (render/sails.ts boatTells): the jib's on its luff, the main's on its leech. */
  trim: SailTrim; tells: { windward?: TellState; leeward?: TellState; leech?: TellState };
}

/** A height's sections (the jib's first when it's there) and the wind there. */
export interface FlowCut { name: string; z: number; aws: number; awa: number; sections: FlowSection[] }

/** Each sail as the sim has it: the wind its trim was worked out at (the centre of effort's), the wind across its foot
 * against the best (trim.ts: the boom, or the jib's clew from its tack, the sim's calibration), and its twist. */
export interface FlowSail { sail: SailName; trim: SailTrim; awa: number; across: number; best: number; twist: number; sheet: number; atMin: boolean; atMax: boolean }
export interface FlowState { cuts: FlowCut[]; sails: FlowSail[]; running: boolean; hove: boolean; leeway: number; awa: number }

/** The sail's height fraction (0 at its foot, 1 at its head) at z, unclamped. */
const fAt = (sail: SailName, z: number) => sail === 'main' ? (z - BOOM) / RIG.P : (z - JIB_TACK) / (JIB_HEAD - JIB_TACK);

/** The flow view's state from the sim: its three cuts across her sails and each sail's own numbers. The jib only where
 * it's drawing on its sheet. */
export function flowState(b: Boat): FlowState {
  const sails: FlowSail[] = [];
  for (const sail of ['jib', 'main'] as const) {
    const trim = b.trim[sail], shape = b.shape[sail];
    if (!trim || !shape) continue;
    // (the wind the sim worked this trim out at: trim.ts err = (awa − sheet) − best, so its awa is err + sheet + best)
    const awa = trim.err + b.sheets[sail] + SAILS[sail].aoa;
    sails.push({ sail, trim, awa, across: awa - b.sheets[sail], best: SAILS[sail].aoa, twist: shape.twist, sheet: b.sheets[sail], atMin: b.sheets[sail] <= SAILS[sail].min + 0.5, atMax: b.sheets[sail] >= SAILS[sail].max - 0.5 });
  }
  // (the telltales and whether she's off the wind: as the 3D boat has them, from the masthead's apparent wind b.awa)
  const tells = boatTells(b.trim.jib, b.trim.main, b.awa, !!b.luff);
  const cuts = FLOW_HEIGHTS.map(({ name, z }) => {
    const w = windAt(b, z), sections: FlowSection[] = [];
    for (const fs of sails) {
      const at = sectionAt(fs.sail, z), shape = b.shape[fs.sail]!;
      if (!at) continue;
      sections.push({
        sail: fs.sail, luff: at.luff, chord: at.chord, angle: b.sheets[fs.sail] + shape.twist * fAt(fs.sail, z), depth: shape.depth, draft: shape.draft,
        trim: fs.trim, tells: fs.sail === 'jib' ? tells.jib : { leech: tells.leech }
      });
    }
    return { name, z, aws: w.kt, awa: w.awa, sections };
  });
  // off the wind (the telltales hanging: the same line, 115°, as luffTellStates and leechTellState)
  return { cuts, sails, running: b.awa > 115, hove: !!b.hove, leeway: b.leeway ?? 0, awa: b.awa };
}

/** The heading change (deg, + away from the wind) that widens the sails' apparent wind by `dAwa` deg, from the sim's own
 * wind at the centre of effort (the apparent wind swings less than the heading: her own speed holds it forward). */
export function turnFor(b: Boat, dAwa: number): number {
  const a0 = windAt(b, CE_ABOVE_WL).awa, away = b.tack === 'S' ? -1 : 1; // (bearing away on starboard tack turns her to port)
  const per = (windAt(b, CE_ABOVE_WL, away * 2).awa - a0) / 2;
  return per > 0.1 ? dAwa / per : dAwa;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const deg = (x: number) => `${Math.round(x)}°`;

/** What the flow and the telltales are saying, in words, from the sim's own trim for each sail (the same at every
 * height, as the 3D telltales show it): how it's drawing and what to do; its twist against the crew's target for the
 * wind; the slot; and the keel's leeway. */
export function flowWords(st: FlowState, b: Boat): [string, string][] {
  const out: [string, string][] = [], p = (cls: string, html: string) => { out.push([cls, html]); };
  const name = { main: 'Main', jib: 'Jib' } as const, foot = { main: 'the boom', jib: "the jib's foot" } as const;
  const keel = () => p('fp-keel', `<b>Under water</b> leeway ${st.leeway.toFixed(1)}°: the keel's angle to the water, which makes its lift against the sails' side force. Pinch and it grows.`);
  if (st.hove) { p('fp-sail', `<b>Hove to</b>: the jib backed on purpose, both sails meant to be stalled or luffing. With the main eased and the helm down she lies quiet, forereaching slowly.`); keel(); return out; }
  if (!st.sails.length) { p('fp-sail', 'No sails drawing.'); return out; }
  for (const s of st.sails) {
    const t = s.trim, by = Math.abs(t.err), main = s.sail === 'main';
    if (st.running) {
      // (the pole for the jib when she's nearly dead downwind; on a broad reach it stays to leeward)
      const how = main ? "Ease it till it's nearly square across the wind (the boom at the shrouds)" : st.awa > 155 ? 'Pole it out to windward (wing on wing)' : 'Keep it eased to leeward, just short of collapsing';
      p('fp-sail', `<b>${name[s.sail]}</b> off the wind: it works stalled, the air pushing on it, the telltales hanging. ${how}.`); continue;
    }
    // (luffing because the crew's eased the boom down the traveller to depower, as far as that and no further, with
    // nobody else holding the sheet or the traveller: the price of keeping her on her feet, not a mistake)
    const ease = crewEaseBoom(b), eased = main && ease > 1 && !b.hand?.mainsheet && !b.hand?.traveller && -t.err <= ease + 3;
    // (the turn: only for a small error, and worked from the sim's wind; a sail far out is just trimmed in)
    const turn = by <= 10 ? `, or bear away about ${deg(turnFor(b, by))}` : '';
    const stallTell = main ? (t.amount > 0.12 ? 'the leech telltale hiding' : 'the flow breaking away before the leech') : 'leeward telltales drooping';
    const what = t.flow === 'good' ? (main ? 'attached: the leech telltale streaming' : 'attached: both telltales streaming')
      : t.flow === 'luffing' ? (eased ? `<em class="luff">luffing</em> ${pct(t.amount)}: eased down the traveller on purpose to keep her on her feet; the lifting luff is the price`
        : s.atMin ? `<em class="luff">luffing</em> ${pct(t.amount)} with the sheet in as far as it goes: she's pinching. Bear away about ${deg(turnFor(b, Math.min(by, 10)))}`
        : `<em class="luff">luffing</em> ${pct(t.amount)}${main ? ': its luff lifting' : ': windward telltales lifting'}. Trim in about ${deg(by)}${turn}`)
      : s.atMax ? `<em class="stall">stalled</em> ${pct(t.amount)}, ${stallTell}, with the sheet all the way out: the wind's too far aft for it. Head up`
      : `<em class="stall">stalled</em> ${pct(t.amount)}: ${stallTell}. Ease about ${deg(by)}, or head up`;
    p('fp-sail', `<b>${name[s.sail]}</b> the wind ${deg(s.across)} across ${foot[s.sail]} (best ${deg(s.best)}): ${what}.`);
  }
  // twist, as facts (no verdict: the sim's best twist is the crew's whole-boat choice, which the coach judges): how open
  // each head is set against its foot, and the wind's own twist up the sail
  if (!st.running) {
    const [lo, , hi] = st.cuts, set = st.sails.map(s => `${s.sail} ${deg(s.twist)}`).join(', ');
    p('fp-twist', `<b>Twist</b> ${set}, the head open from the foot. Up there the wind is ${hi.aws.toFixed(1)} kt at ${deg(hi.awa)}, low down ${lo.aws.toFixed(1)} kt at ${deg(lo.awa)}: the head's wind is stronger and freer. The coach says which line to change.`);
  }
  if (st.sails.length === 2 && !st.running) p('fp-slot', `<b>The slot</b>: on real boats the jib bends the air along the main's lee side, and an over-trimmed jib backs the main before it luffs. The sim doesn't model this; the streamlines show the idea.`);
  keel();
  return out;
}

/* ---------- the illustrative flow: a 2D potential flow around the sections ---------- */

/** A section's camber line as points (m, in the boat's plan: x to leeward, y aft from the mast's after side). */
export function camberLine(s: FlowSection, n = 12): [number, number][] {
  const a = s.angle * D2R, ux = Math.sin(a), uy = Math.cos(a), nx = uy, ny = -ux; // (along the chord; its normal to leeward)
  const k = Math.log(0.5) / Math.log(clamp(s.draft, 0.2, 0.8)), pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, h = s.depth * s.chord * Math.sin(Math.PI * Math.pow(t, k)); // (deepest at the draft)
    pts.push([ux * s.chord * t + nx * h, -s.luff + uy * s.chord * t + ny * h]);
  }
  return pts;
}

/**
 * The flow around the sections at one height: lumped vortices, one on each panel's quarter point with the flow made
 * tangent at its three-quarter point (the discrete-vortex method; its leech is a sharp trailing edge, so the Kutta
 * condition holds by construction). Inviscid and two-dimensional: it shows the upwash ahead of the jib, the flow turned
 * through the slot and the faster air to leeward, not the sim's forces, and it can't separate. Returns the velocity
 * (as a share of the apparent wind) at a point. `awa` from the bow; the flow comes from ahead and to windward (−x).
 */
export function flowField(sections: FlowSection[], awa: number): (x: number, y: number) => [number, number] {
  const a = awa * D2R, U: [number, number] = [Math.sin(a), Math.cos(a)]; // (towards leeward and aft)
  const P: { vx: number; vy: number; cx: number; cy: number; nx: number; ny: number }[] = [];
  for (const s of sections) {
    const pts = camberLine(s);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
      P.push({ vx: x0 + 0.25 * dx, vy: y0 + 0.25 * dy, cx: x0 + 0.75 * dx, cy: y0 + 0.75 * dy, nx: -dy / L, ny: dx / L });
    }
  }
  const N = P.length, ind = (px: number, py: number, vx: number, vy: number): [number, number] => {
    const rx = px - vx, ry = py - vy, r2 = rx * rx + ry * ry + 1e-4; return [-ry / (2 * Math.PI * r2), rx / (2 * Math.PI * r2)];
  };
  const A: number[][] = [], rhs: number[] = [];
  for (let i = 0; i < N; i++) {
    const row: number[] = [];
    for (let j = 0; j < N; j++) { const [u, v] = ind(P[i].cx, P[i].cy, P[j].vx, P[j].vy); row.push(u * P[i].nx + v * P[i].ny); }
    A.push(row); rhs.push(-(U[0] * P[i].nx + U[1] * P[i].ny));
  }
  // (Gaussian elimination with partial pivoting: a few dozen panels)
  for (let c = 0; c < N; c++) {
    let p = c; for (let r = c + 1; r < N; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [rhs[c], rhs[p]] = [rhs[p], rhs[c]];
    for (let r = c + 1; r < N; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < N; k++) A[r][k] -= f * A[c][k]; rhs[r] -= f * rhs[c]; }
  }
  const g = new Array<number>(N).fill(0);
  for (let r = N - 1; r >= 0; r--) { let s = rhs[r]; for (let k = r + 1; k < N; k++) s -= A[r][k] * g[k]; g[r] = s / A[r][r]; }
  return (x, y) => {
    let u = U[0], v = U[1];
    for (let j = 0; j < N; j++) { const [a1, a2] = ind(x, y, P[j].vx, P[j].vy); u += g[j] * a1; v += g[j] * a2; }
    return [u, v];
  };
}

/** The field sampled on a grid over `box` [x0, y0, x1, y1] (`n` cells across the longer side) and read back by bilinear
 * interpolation: the streamlines then cost a lookup a step, not a sum over every vortex. */
export function gridField(vel: (x: number, y: number) => [number, number], box: [number, number, number, number], n = 48): (x: number, y: number) => [number, number] {
  const [x0, y0, x1, y1] = box, h = Math.max(x1 - x0, y1 - y0) / n, nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1;
  const U = new Float32Array(nx * ny), V = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const [u, v] = vel(x0 + i * h, y0 + j * h); U[j * nx + i] = u; V[j * nx + i] = v; }
  return (x, y) => {
    const fx = clamp((x - x0) / h, 0, nx - 1.001), fy = clamp((y - y0) / h, 0, ny - 1.001), i = Math.floor(fx), j = Math.floor(fy), a = fx - i, c = fy - j, k = j * nx + i;
    const w00 = (1 - a) * (1 - c), w10 = a * (1 - c), w01 = (1 - a) * c, w11 = a * c;
    return [U[k] * w00 + U[k + 1] * w10 + U[k + nx] * w01 + U[k + nx + 1] * w11, V[k] * w00 + V[k + 1] * w10 + V[k + nx] * w01 + V[k + nx + 1] * w11];
  };
}

/** A streamline through the field from (x, y), stepped `h` m at a time (midpoint rule) while it stays in `box`
 * [x0, y0, x1, y1]; each point with the flow's speed there (share of the apparent wind). */
export function streamline(vel: (x: number, y: number) => [number, number], x: number, y: number, h: number, steps: number, box: [number, number, number, number]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const [u, v] = vel(x, y), s = Math.hypot(u, v) || 1;
    const [u2, v2] = vel(x + u / s * h / 2, y + v / s * h / 2), s2 = Math.hypot(u2, v2) || 1;
    if (x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]) out.push([x, y, s2]);
    else if (out.length) break;
    x += u2 / s2 * h; y += v2 / s2 * h;
  }
  return out;
}
