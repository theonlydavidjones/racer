import { D2R, KT, LOA, V, clamp, dot, sub } from '../core/math';
import type { World } from './world';

export interface StartDebrief {
  grade: 'great' | 'good' | 'late' | 'slow' | 'ocs' | 'none';
  title: string;
  facts: string[];
  tips: string[];
}

const kt = (v: number) => (v / KT).toFixed(1);
const lengths = (m: number) => { const n = m / LOA; return n < 0.95 ? `${Math.round(m)} m` : `${Math.round(m)} m (${n.toFixed(1)} boat lengths)`; };

/**
 * What happened at your start and what to try next time: distance and speed at the gun, where on
 * the line, crossing order, the favored end, and specific tips. Pure: reads the world, changes nothing.
 */
export function startDebrief(w: World): StartDebrief {
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
    tips.push('Being over costs far more than being a little late: you have to dip back below the line and keep clear of everyone while you do (Rule 22.1).');
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
  return { grade, title, facts, tips };
}

const ordinal = (n: number) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th');
