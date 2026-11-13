import { D2R, KT, LOA, V, brg, clamp, dot, sub, wrap } from '../core/math';
import type { SimView } from './host';

export interface StartDebrief {
  grade: 'great' | 'good' | 'late' | 'slow' | 'ocs' | 'none';
  title: string;
  facts: string[];
  tips: string[];
  /** The numbers, for the drill's run of attempts. */
  stats?: StartStats;
}
export interface StartStats {
  /** Behind the line at the gun, m (− over), and that in seconds at full speed on your approach. */
  behindM: number; lateS: number;
  /** Speed at the gun, % of full close-hauled. */
  pct: number;
  /** Where on the line, and which end was favoured (null: square), and whether you started in its third. */
  end: 'pin' | 'middle' | 'committee'; fav: 'pin' | 'committee' | null; onFav: boolean;
  grade: StartDebrief['grade'];
}

/**
 * Your final run to the line, from the race's 1 Hz track: walking back from the gun while you were closing on the line
 * (at more than a third of a metre a second, so a luff or a reach along it ends the run), when you turned for it, how
 * far out, how long the run took, your mean speed, and how much of it went toward the line (your angle to it).
 */
export interface Approach { t0: number; fromM: number; dur: number; meanV: number; toward: number }
export function finalApproach(w: SimView): Approach | null {
  const F = w.track, u = w.user.id;
  let k = F.findIndex(f => f.t >= 0); if (k < 1) return null;
  const d = (i: number) => { const p = F[i].b[u]; return p ? w.lineD({ x: p[0], y: p[1] }) : NaN; };
  let i = k;
  while (i > 0 && d(i) - d(i - 1) > 0.33) i--;
  if (k - i < 5) return null; // (no run to speak of: sitting on the line, or reaching along it)
  let path = 0;
  for (let j = i + 1; j <= k; j++) { const a = F[j - 1].b[u], b = F[j].b[u]; if (a && b) path += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const dur = F[k].t - F[i].t;
  return { t0: F[i].t, fromM: -d(i), dur, meanV: path / Math.max(1, dur), toward: path > 0 ? (d(k) - d(i)) / path : 1 };
}

/**
 * The line checked head to wind: the first time before the gun you sat within 8° of head to wind for 2 s or more,
 * within 200 m of the line. Your bow then points where the wind's from: its angle off square to the line says which end
 * is upwind (the favoured end), the way sailors check it on the water.
 */
export function lineCheck(w: SimView): { t: number; offDeg: number; toward: 'pin' | 'committee' | null; atM: number } | null {
  const F = w.track, u = w.user.id, sq = brg(w.N.x, w.N.y);
  // which end lies clockwise of square (looking upwind)
  const cwEnd: 'pin' | 'committee' = dot(V(sq + 90), sub(w.committee, w.pin)) > 0 ? 'committee' : 'pin';
  for (let i = 1; i < F.length && F[i].t < 0; i++) {
    const a = F[i - 1].b[u], b = F[i].b[u]; if (!a || !b || b[6] == null || a[6] == null) continue;
    const dist = -w.lineD({ x: b[0], y: b[1] });
    if (dist < -5 || dist > 200) continue;
    if (Math.abs(wrap(a[2] - a[6])) < 8 && Math.abs(wrap(b[2] - b[6])) < 8) {
      const off = wrap(b[2] - sq);
      return { t: F[i].t, offDeg: Math.abs(off), toward: Math.abs(off) < 2 ? null : off > 0 ? cwEnd : (cwEnd === 'pin' ? 'committee' : 'pin'), atM: dist };
    }
  }
  return null;
}
const clockOf = (t: number) => { const s = Math.round(Math.abs(t)); return `${t < 0 ? '−' : '+'}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const kt = (v: number) => (v / KT).toFixed(1);
const lengths = (m: number) => { const n = m / LOA; return n < 0.95 ? `${Math.round(m)} m` : `${Math.round(m)} m (${n.toFixed(1)} boat lengths)`; };

/**
 * What happened at your start and what to try next time: distance and speed at the gun, where on
 * the line, crossing order, the favored end, and specific tips. Pure: reads the world, changes nothing.
 */
export function startDebrief(w: SimView): StartDebrief {
  const g = w.gun, u = w.user, C = w.C;
  if (!g) return { grade: 'none', title: 'No start yet', facts: [], tips: [] };
  const me = g.boats[u.id];
  const facts: string[] = [], tips: string[] = [];
  const behind = -me.d, pct = Math.round(100 * me.v / me.target);

  // where you were at the gun
  facts.push(me.ocs ? `At the gun you were over the line by ${lengths(me.d)}.` : `At the gun you were ${lengths(behind)} behind the line.`);
  facts.push(`Speed at the gun: ${kt(me.v)} kt, ${pct}% of full close-hauled speed (${kt(me.target)} kt).`);
  const third = me.frac < 1 / 3 ? `the ${C.pinLabel} end` : me.frac > 2 / 3 ? `the ${C.committeeLabel} end` : 'the middle';
  facts.push(`Position: ${Math.round(clamp(me.frac, 0, 1) * 100)}% of the way from ${C.pinLabel} to ${C.committeeLabel} (${third}).`);

  // crossing order
  const myT = w.startTimes[u.id];
  const crossed = w.startTimes.map((t, i) => ({ t, i })).filter(x => x.t != null).sort((a, b) => a.t! - b.t!);
  if (myT != null) {
    const place = crossed.findIndex(x => x.i === u.id) + 1;
    facts.push(`You started ${myT.toFixed(1)} s after the gun, ${ordinal(place)} of ${w.boats.length} across the line.`);
  } else facts.push(`You hadn't started yet${me.ocs || u.ocs ? ' (still returning from being over early)' : ''}.`);

  // favored end, from the wind at the gun
  const k = dot(sub(w.pin, w.committee), V(g.windFrom)) / w.lineLen, bias = Math.asin(clamp(Math.abs(k), 0, 1)) / D2R;
  const favEnd = k > 0 ? C.pinLabel : C.committeeLabel, gain = w.lineLen * Math.abs(k);
  if (bias >= 2) facts.push(`The ${favEnd} end was favored by ${bias.toFixed(0)}°: starting there is worth about ${Math.round(gain)} m upwind over the other end.`);
  else facts.push('The line was nearly square to the wind: neither end gained much.');

  // grade and tips
  let grade: StartDebrief['grade'], title: string;
  const cN = dot(w.currentAt(u), w.N);
  if (me.ocs) {
    grade = 'ocs'; title = 'Over early';
    tips.push('Aim to be about one boat length behind the line with 10 seconds to go, then sheet in and accelerate. The last 10 seconds are for speed, not distance.');
    if (cN > 0.15) tips.push(`The current was carrying you toward the line at ${kt(cN)} kt. With the current pushing you over, hang back farther and luff earlier.`);
    tips.push('Being over costs far more than being a little late: you have to dip back below the line and keep clear of everyone while you do (Rule 21.1).');
  } else if (behind > 1.5 * LOA) {
    grade = 'late'; title = 'Late start';
    const secs = behind / Math.max(0.5, me.target);
    tips.push(`At full speed you were about ${secs.toFixed(0)} s late. Next time turn for the line about ${secs.toFixed(0)} s earlier, or burn less time.`);
    tips.push('Use the line readout: when "s to line" matches the time left, go.');
    if (cN < -0.15) tips.push(`The current was setting you away from the line at ${kt(-cN)} kt. Start your approach from closer, or earlier.`);
  } else if (pct < 75) {
    grade = 'slow'; title = 'On the line, but slow';
    tips.push('Sheet in about 12 seconds before the gun. From luffing, a Folkboat needs that long to get to full speed.');
    tips.push('Keep a little way on while you wait: a stopped boat can barely steer.');
  } else {
    grade = behind < LOA && pct >= 85 ? 'great' : 'good';
    title = grade === 'great' ? 'Great start' : 'Good start';
    tips.push(grade === 'great' ? 'On the line at the gun at full speed. That is the whole game.' : 'Close. Next time try to be within a boat length of the line at the gun, at full speed.');
  }
  const favoredThird = k > 0 ? me.frac < 1 / 3 : me.frac > 2 / 3;
  if (bias >= 5 && !favoredThird && grade !== 'ocs') tips.push(`The ${favEnd} end was favored by ${bias.toFixed(0)}°. Starting nearer that end would have put you about ${Math.round(gain * (k > 0 ? me.frac : 1 - me.frac))} m farther up the course.`);
  if (me.penalty) tips.push('You were doing penalty turns at the gun. Keep clear before the start too: the rules apply from the preparatory signal.');

  // time on distance: your run in, against what full speed on the same line would have taken
  const ap = finalApproach(w);
  let lateS = behind / Math.max(0.5, me.target);
  if (ap) {
    const full = Math.max(0.5, me.target * clamp(ap.toward, 0.3, 1)), fullDur = ap.fromM / full;
    lateS = behind / full;
    facts.push(`Your run in: you turned for the line at ${clockOf(ap.t0)}, ${Math.round(ap.fromM)} m out. It took ${Math.round(ap.dur)} s at ${kt(ap.meanV)} kt on average; at full speed on that line it takes about ${Math.round(fullDur)} s.`);
    // (the run in replaces the plain "about N s late" tip: it says when to turn instead)
    const old = tips.findIndex(t => t.startsWith('At full speed you were about')); if (old >= 0 && !me.ocs && behind > LOA) tips.splice(old, 1);
    if (!me.ocs && behind > LOA) tips.push(`Time on distance: you were about ${Math.round(lateS)} s late. Turn for the line at ${clockOf(ap.t0 - lateS)}, or from ${Math.round(Math.max(0, ap.fromM - behind))} m out at the same time, and come in at full speed.`);
    else if (me.ocs) tips.push(`Time on distance: you were ${Math.round(me.d / full)} s early. Turn for the line at ${clockOf(ap.t0 + me.d / full)}, or start the run from ${Math.round(ap.fromM + me.d)} m out.`);
    if (ap.meanV < 0.8 * me.target && grade !== 'ocs') tips.push(`Your run averaged ${Math.round(100 * ap.meanV / me.target)}% of full speed. Build speed before you turn in (bear off a little and sheet in), so the run is at full speed and the time on distance holds.`);
  } else if (grade !== 'ocs') tips.push('Practise a timed run: from a spot below the line, note the time, sail at it at full speed, and see how long it takes. That run, started that many seconds before the gun, is your start.');

  // the favoured end, as you'd check it on the water: head to wind near the line
  const chk = lineCheck(w), favKey: 'pin' | 'committee' | null = bias >= 2 ? (k > 0 ? 'pin' : 'committee') : null;
  const endName = (e: 'pin' | 'committee') => e === 'pin' ? C.pinLabel : C.committeeLabel;
  if (chk) facts.push(`At ${clockOf(chk.t)} you went head to wind ${Math.round(chk.atM)} m below the line: your bow pointed ${chk.toward ? `${Math.round(chk.offDeg)}° toward the ${endName(chk.toward)} end` : 'square to the line'}${chk.toward === favKey || (!chk.toward && !favKey) ? ': the right read.' : favKey ? `. At the gun the ${endName(favKey)} end was favoured by ${bias.toFixed(0)}°.` : '. At the gun the line was about square.'}`);
  else tips.push(`Check the line before the start: go head to wind near it and look where your bow points. Square to the line (90° to it), neither end is favoured; pointing toward an end, that end is upwind, and starting there gains about ${Math.round(w.lineLen / 60)} m for each degree.`);

  const stats: StartStats = { behindM: me.ocs ? -me.d : behind, lateS: me.ocs ? -(me.d / Math.max(0.5, me.target)) : lateS, pct,
    end: me.frac < 1 / 3 ? 'pin' : me.frac > 2 / 3 ? 'committee' : 'middle', fav: favKey, onFav: !!favKey && favoredThird, grade };
  return { grade, title, facts, tips, stats };
}

const ordinal = (n: number) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th');
