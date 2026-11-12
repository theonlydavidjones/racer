/**
 * Starting signals (RRS 26) and what the preparatory flag means (RRS 30), and the individual recall (RRS 29.1).
 *
 * The rulebook's sequence is five minutes: warning (class flag up, one sound) at 5, preparatory (P, I, Z, U or
 * the black flag up, one sound) at 4, one-minute (preparatory flag down, one long sound) at 1, start (class flag
 * down, one sound). Shorter sequences, like the 3-minute one many SF Bay clubs use, keep the same steps a minute
 * apart: warning at 3, preparatory at 2, one-minute at 1, start at 0. A 2-minute sequence has no separate
 * one-minute signal: the preparatory flag goes up at 1 and comes down with the class flag at the start.
 */

export type PrepFlag = 'P' | 'I' | 'Z' | 'U' | 'black';
export type Flag = 'class' | PrepFlag | 'X' | 'AP' | 'N' | 'A';

export interface Signal {
  /** Race time, s (0 = the start signal). */
  t: number;
  name: string;
  up: Flag[];
  down: Flag[];
  sound: 'one' | 'long';
  /** What it means, for the message log. */
  say: string;
}

export const FLAG_NAME: Record<Flag, string> = { class: 'class flag', P: 'P', I: 'I', Z: 'Z', U: 'U', black: 'black flag', X: 'X', AP: 'AP (answering pennant)', N: 'N', A: 'A' };

/**
 * Too much wind to race: the SF Bay Folkboat fleet cancels at about 23 kt (the owner, who races with them: "at 23 knots
 * everyone takes a vote on canceling … at that speed things start breaking on boats"; the association's proposed
 * protocol on sfbayfolkboats.org says above 25). The committee judges the wind over the course over a couple of
 * minutes, not a single gust.
 */
export const CANCEL_KT = 23;
/** The race signals for calling it off (RRS, Race Signals): before the start, AP over A, two sounds, "all races not
 * started are postponed; no more racing today"; after it, N over A, three sounds, "all races are abandoned; no more
 * racing today". */
export function cancelSignal(started: boolean, kt: number): { up: Flag[]; sounds: number; say: string } {
  const why = `${Math.round(kt)} kt over the course, over the fleet's ${CANCEL_KT} kt limit`;
  return started
    ? { up: ['N', 'A'], sounds: 3, say: `N over A, three sounds: all races abandoned, no more racing today (${why}). Sail home safely.` }
    : { up: ['AP', 'A'], sounds: 2, say: `AP over A, two sounds: racing postponed, no more racing today (${why}). Sail home safely.` };
}

/** What each preparatory flag does in the last minute (RRS 30). */
export const PREP_MEANING: Record<PrepFlag, string> = {
  P: 'P: the usual start. If you\'re over at the gun, come back across the line and start (individual recall, Rule 29.1).',
  I: 'I (Rule 30.1): if you\'re on the course side of the line or its extensions in the last minute, you must sail back around an end of the line to start.',
  Z: 'Z (Rule 30.2): if you\'re in the triangle between the line ends and the first mark in the last minute, you get a 20% scoring penalty.',
  U: 'U (Rule 30.3): if you\'re in the triangle between the line ends and the first mark in the last minute, you\'re disqualified.',
  black: 'Black flag (Rule 30.4): if you\'re in the triangle between the line ends and the first mark in the last minute, you\'re disqualified, even after a general recall.'
};

export function startSequence(seqMin: number, prep: PrepFlag): Signal[] {
  const p = FLAG_NAME[prep];
  const out: Signal[] = [{ t: -seqMin * 60, name: 'Warning signal', up: ['class'], down: [], sound: 'one', say: `Warning signal: class flag up, one sound. ${seqMin} minutes to the start.` }];
  if (seqMin >= 3) {
    out.push({ t: -(seqMin - 1) * 60, name: 'Preparatory signal', up: [prep], down: [], sound: 'one', say: `Preparatory signal: ${p} up, one sound. ${seqMin - 1} minutes. ${PREP_MEANING[prep]}` });
    out.push({ t: -60, name: 'One-minute signal', up: [], down: [prep], sound: 'long', say: `One-minute signal: ${p} down, one long sound.${prep === 'P' ? '' : ` The ${p} rule applies from now until the start.`}` });
    out.push({ t: 0, name: 'Starting signal', up: [], down: ['class'], sound: 'one', say: 'Starting signal: class flag down, one sound. Go!' });
  } else {
    out.push({ t: -60, name: 'Preparatory signal', up: [prep], down: [], sound: 'one', say: `Preparatory signal: ${p} up, one sound. One minute. ${PREP_MEANING[prep]}` });
    out.push({ t: 0, name: 'Starting signal', up: [], down: ['class', prep], sound: 'one', say: 'Starting signal: class and preparatory flags down, one sound. Go!' });
  }
  return out;
}

/** Flags flying at race time t from the sequence (the X flag is added by the race committee as needed). */
export function flagsAt(seq: Signal[], t: number): Flag[] {
  const up = new Set<Flag>();
  for (const s of seq) if (s.t <= t) { s.up.forEach(f => up.add(f)); s.down.forEach(f => up.delete(f)); }
  return [...up];
}

/** Rule 29.1: the X flag comes down when all boats over early have returned, or four minutes after the start. */
export const X_FLAG_MAX = 240;

/** Is point p inside the triangle formed by the ends of the starting line and the first mark (RRS 30.2–30.4)? */
export function inTriangle(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): boolean {
  const s = (p1: typeof p, p2: typeof p, p3: typeof p) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
