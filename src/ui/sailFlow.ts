import { CE_ABOVE_WL, RIG } from '../boat/balance';
import type { Boat } from '../boat/boat';
import { sailFrame } from '../boat/physics';
import { downwindness, SAILS, type SailName, type SailTrim } from '../boat/trim';
import { D2R, KT, clamp, wrap } from '../core/math';
import { leechTellState, luffTellStates, type TellState } from '../render/sails';

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
  /** The sim's trim for the sail (its one trim: the same at every height), and its telltales as the 3D view has them. */
  trim: SailTrim; tells: { windward: TellState; leeward: TellState; leech?: TellState };
}

/** A height's sections (the jib's first when it's there) and the wind there. */
export interface FlowCut { name: string; z: number; aws: number; awa: number; sections: FlowSection[] }

/** Each sail as the sim has it: the wind its trim was worked out at (the centre of effort's), the wind across its foot
 * against the best (trim.ts: the boom, or the jib's clew from its tack, the sim's calibration), and its twist. */
export interface FlowSail { sail: SailName; trim: SailTrim; awa: number; across: number; best: number; twist: number }
export interface FlowState { cuts: FlowCut[]; sails: FlowSail[]; running: boolean; hove: boolean; leeway: number }

/** The sail's height fraction (0 at its foot, 1 at its head) at z, unclamped. */
const fAt = (sail: SailName, z: number) => sail === 'main' ? (z - BOOM) / RIG.P : (z - JIB_TACK) / (JIB_HEAD - JIB_TACK);

/** The flow view's state from the sim: its three cuts across her sails and each sail's own numbers. The jib only where
 * it's drawing on its sheet. */
export function flowState(b: Boat): FlowState {
  const ce = windAt(b, CE_ABOVE_WL), sails: FlowSail[] = [];
  for (const sail of ['jib', 'main'] as const) {
    const trim = b.trim[sail], shape = b.shape[sail];
    if (!trim || !shape) continue;
    // (the wind the sim worked this trim out at: trim.ts err = (awa − sheet) − best, so its awa is err + sheet + best)
    const awa = trim.err + b.sheets[sail] + SAILS[sail].aoa;
    sails.push({ sail, trim, awa, across: awa - b.sheets[sail], best: SAILS[sail].aoa, twist: shape.twist });
  }
  const tellAwa = sails[0]?.awa ?? ce.awa;
  const cuts = FLOW_HEIGHTS.map(({ name, z }) => {
    const w = windAt(b, z), sections: FlowSection[] = [];
    for (const fs of sails) {
      const at = sectionAt(fs.sail, z), shape = b.shape[fs.sail]!;
      if (!at) continue;
      sections.push({
        sail: fs.sail, luff: at.luff, chord: at.chord, angle: b.sheets[fs.sail] + shape.twist * fAt(fs.sail, z), depth: shape.depth, draft: shape.draft,
        trim: fs.trim, tells: { ...luffTellStates(fs.trim, tellAwa), ...(fs.sail === 'main' ? { leech: leechTellState(fs.trim, tellAwa, !!b.luff) } : {}) }
      });
    }
    return { name, z, aws: w.kt, awa: w.awa, sections };
  });
  return { cuts, sails, running: downwindness(tellAwa) > 0.5, hove: !!b.hove, leeway: b.leeway ?? 0 };
}

/** The heading change (deg, + away from the wind) that widens the sails' apparent wind by `dAwa` deg, from the sim's own
 * wind at the centre of effort (the apparent wind swings less than the heading: her own speed holds it forward). */
export function turnFor(b: Boat, dAwa: number): number {
  const a0 = windAt(b, CE_ABOVE_WL).awa, away = b.tack === 'S' ? -1 : 1; // (bearing away on starboard tack turns her to port)
  const per = (windAt(b, CE_ABOVE_WL, away * 2).awa - a0) / 2;
  return per > 0.1 ? dAwa / per : dAwa;
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
