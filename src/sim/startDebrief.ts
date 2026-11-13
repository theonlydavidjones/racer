import { D2R, KT, LOA, V, brg, clamp, dot, sub, wrap } from '../core/math';
import { windOnWater } from '../environment/current';
import { polar } from '../boat/polar';
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
 * The line checked head to wind: the first time before the gun you sat head to wind (within 8° of the wind you felt)
 * for 2 s or more, turning slowly (under 3°/s: a tack swings through head to wind at about 10°/s, and isn't a check),
 * within 200 m of the line. The read is the wind you felt then, against square to the line (the wind's direction, not
 * your bow's, which may be a few degrees off it): wind from clockwise of square, looking upwind, puts that end upwind.
 * `sq`: square to the line, looking upwind (the caller's: the line's normal toward the wind).
 */
export function lineCheck(w: SimView, sq = brg(w.N.x, w.N.y)): { t: number; offDeg: number; toward: 'pin' | 'committee' | null; atM: number; bowOff: number } | null {
  const F = w.track, u = w.user.id;
  const cwEnd: 'pin' | 'committee' = dot(V(sq + 90), sub(w.committee, w.pin)) > 0 ? 'committee' : 'pin';
  const ok = (i: number) => { const b = F[i]?.b[u]; if (!b || b[6] == null || F[i].t >= 0) return false; const d = -w.lineD({ x: b[0], y: b[1] }); return d >= -5 && d <= 200 && Math.abs(wrap(b[2] - b[6])) < 8; };
  const slow = (i: number) => { const a = F[i - 1]?.b[u], b = F[i]?.b[u]; return !!a && !!b && Math.abs(wrap(b[2] - a[2])) < 3; };
  for (let i = 2; i < F.length && F[i].t < 0; i++) {
    if (!(ok(i - 2) && ok(i - 1) && ok(i) && slow(i - 1) && slow(i))) continue;
    let sx = 0, sy = 0, bo = 0;
    for (const k of [i - 2, i - 1, i]) { const b = F[k].b[u]!; sx += Math.sin(b[6]! * D2R); sy += Math.cos(b[6]! * D2R); bo += wrap(b[2] - b[6]!); }
    const off = wrap(brg(sx, sy) - sq), b = F[i].b[u]!;
    return { t: F[i - 2].t, offDeg: Math.abs(off), toward: Math.abs(off) < 2 ? null : off > 0 ? cwEnd : (cwEnd === 'pin' ? 'committee' : 'pin'), atM: -w.lineD({ x: b[0], y: b[1] }), bowOff: bo / 3 };
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
    facts.push(w.boats.length === 1 ? `You started ${myT.toFixed(1)} s after the gun.` : `You started ${myT.toFixed(1)} s after the gun, ${ordinal(place)} of ${w.boats.length} across the line.`);
  } else facts.push(`You hadn't started yet${me.ocs || u.ocs ? ' (still returning from being over early)' : ''}.`);

  // favored end, from the wind at the gun: the wind over the water at the line (what the boats sail in, and what a
  // head-to-wind check reads; in a 2 kt cross-current it differs from the wind over the ground by ~10°). On an upwind
  // start the upwind end is favoured; on a downwind start (the first leg a run) the downwind end; a reaching start
  // (the line within ~45° of the wind) has no favoured end in that sense.
  const gw = windOnWater({ from: g.windFrom, kt: w.wind.kt }, w.currentAt(w.center)).from;
  const offSq = Math.abs(wrap(gw - brg(w.N.x, w.N.y))), kind: 'up' | 'down' | 'reach' = offSq < 45 ? 'up' : offSq > 135 ? 'down' : 'reach';
  const kk = dot(sub(w.pin, w.committee), V(gw)) / w.lineLen, k = kind === 'down' ? -kk : kk, bias = Math.asin(clamp(Math.abs(k), 0, 1)) / D2R;
  const favEnd = k > 0 ? C.pinLabel : C.committeeLabel, gain = w.lineLen * Math.abs(k);
  if (kind === 'reach') facts.push(`In this wind the line is ${Math.round(offSq)}° off square: the first leg is a reach, so neither end is favoured as on a beat. Start where you can sail fast for the first mark in clear air. (A line fixed ashore, like the club's, is only as square as the day's wind makes it; to practise judging the favoured end, choose the practice area's course, whose line is laid to the wind.)`);
  else if (bias >= 2) facts.push(`The ${favEnd} end was favoured by ${bias.toFixed(0)}°${kind === 'down' ? ' (a downwind start: the end further downwind)' : ''}: starting there is worth about ${Math.round(gain)} m ${kind === 'down' ? 'downwind' : 'upwind'} over the other end.`);
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
  if (kind !== 'reach' && bias >= 5 && !favoredThird && grade !== 'ocs') tips.push(`Starting nearer the ${favEnd} end would have put you about ${Math.round(gain * (k > 0 ? me.frac : 1 - me.frac))} m farther up the course.`);
  if (me.penalty) tips.push('You were doing penalty turns at the gun. Keep clear before the start too: the rules apply from the preparatory signal.');

  // time on distance: your run in, against what full speed on the same line would have taken. Full speed for the
  // angle you came in at (the polar at your mean wind angle on the run: on a close reach that's faster than
  // close-hauled), and from your bow (the track is the boat's middle)
  const ap = finalApproach(w);
  let lateS = behind / Math.max(0.5, me.target);
  if (ap && ap.dur >= 20 && ap.fromM > 3 * LOA) {
    const runTwa = runAngle(w), vFull = Math.max(0.5, runTwa != null ? polar(u.ww.kt, runTwa) : me.target), full = Math.max(0.3, vFull * clamp(ap.toward, 0.2, 1));
    const fromBow = ap.fromM - LOA / 2, fullDur = fromBow / full;
    lateS = behind / full;
    facts.push(`Your run in: you turned for the line at ${clockOf(ap.t0)}, ${Math.round(fromBow)} m out. It took ${Math.round(ap.dur)} s at ${kt(ap.meanV)} kt on average; at full speed on that line it takes about ${Math.round(fullDur)} s.`);
    // the same pair either way, both at full speed: from where you turned, turn this long before the gun; or, turning
    // when you did, start from this far out
    const turnAt = -fullDur, fromAt = ap.dur * full;
    const early = me.ocs || behind < 0, off = Math.abs(early ? -fullDur - ap.t0 : ap.t0 - -fullDur);
    if ((me.ocs || behind > LOA) && off >= 2) {
      const pair = turnAt < -w.startAt ? `start nearer the line: turning when you did, from about ${Math.round(fromAt)} m out` : `from that spot, turn for the line at ${clockOf(turnAt)}; or, turning when you did, start from about ${Math.round(fromAt)} m out`;
      tips.push(`Time on distance: you were about ${Math.round(Math.abs(early ? me.d / full : lateS))} s ${early ? 'early' : 'late'}. To be on the line at the gun at full speed, ${pair}.`);
      const old = tips.findIndex(t => t.startsWith('At full speed you were about')); if (old >= 0) tips.splice(old, 1);
    }
    if (ap.meanV < 0.8 * vFull && grade !== 'ocs') tips.push(`Your run averaged ${Math.round(100 * ap.meanV / vFull)}% of full speed for that angle. Build speed before you turn in (bear off a little and sheet in), so the run is at full speed and the time on distance holds.`);
  } else if (!ap && grade !== 'ocs') tips.push('Practise a timed run: from a spot below the line, note the time, sail at it at full speed, and see how long it takes. That run, started that many seconds before the gun, is your start.');

  // the favoured end, as you'd check it on the water: head to wind near the line (on an upwind start)
  const favKey: 'pin' | 'committee' | null = kind !== 'reach' && bias >= 2 ? (k > 0 ? 'pin' : 'committee') : null;
  const endName = (e: 'pin' | 'committee') => e === 'pin' ? C.pinLabel : C.committeeLabel;
  if (kind === 'up') {
    const chk = lineCheck(w);
    if (chk) {
      // signed, + toward the pin: the read against the bias at the gun, within 3° (about the wind's own wobble) agreeing
      const readS = chk.toward === 'pin' ? chk.offDeg : chk.toward === 'committee' ? -chk.offDeg : 0, gunS = k > 0 ? bias : -bias;
      const right = Math.abs(readS - gunS) <= 3;
      const gunWords = favKey ? `the ${endName(favKey)} end was favoured by ${bias.toFixed(0)}°` : 'the line was about square';
      facts.push(`At ${clockOf(chk.t)} you went head to wind ${Math.round(chk.atM)} m below the line: the wind came from ${chk.toward ? `${Math.round(chk.offDeg)}° toward the ${endName(chk.toward)} end` : 'square to the line'}${Math.abs(chk.bowOff) > 4 ? ` (your bow was ${Math.round(Math.abs(chk.bowOff))}° off it: sit closer to head to wind for a true read)` : ''}${right ? `, and at the gun ${gunWords}: the right read.` : `. At the gun ${gunWords}: the wind where you were then differed from the wind at the line at the gun (a shift, or a puff's own direction), so check again nearer the gun.`}`);
    } else tips.push(`Check the line before the start: go head to wind near it for a few seconds and look where your bow points. Square to the line (90° to it), neither end is favoured; pointing toward an end, that end is upwind, and starting there gains about ${Math.round(w.lineLen / 57)} m for each degree.`);
  }

  const stats: StartStats = { behindM: me.ocs ? -me.d : behind, lateS: me.ocs ? -(me.d / Math.max(0.5, me.target)) : Math.max(0, lateS), pct,
    end: me.frac < 1 / 3 ? 'pin' : me.frac > 2 / 3 ? 'committee' : 'middle', fav: favKey, onFav: !!favKey && favoredThird, grade };
  return { grade, title, facts, tips, stats };
}

const ordinal = (n: number) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th');

/** Your mean true wind angle (deg) on the final run to the line, from the track's felt wind; null without it. */
function runAngle(w: SimView): number | null {
  const ap = finalApproach(w); if (!ap) return null;
  let s = 0, n = 0;
  for (const f of w.track) { if (f.t < ap.t0 || f.t > 0) continue; const b = f.b[w.user.id]; if (b?.[6] != null) { s += Math.abs(wrap(b[2] - b[6])); n++; } }
  return n ? Math.max(35, s / n) : null;
}
