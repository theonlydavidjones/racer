// World Sailing Cases (The Case Book for 2025–2028, v2025-07) as data: the boats' keyframes, what the engine finds, and
// the Case's answer in one line. One source for the tests (tests/rules-cases-data.test.ts sails each one through the engine
// and checks the answer) and for the Rules trainer (Debrief: it sails a Case up to `momentT`, asks, then answers).
// Only Cases the engine covers (docs/RULES-CASES.md); `teach: false` marks one not yet for a learner, and why.
// Source: https://media.sailing.org/sailing/wp-content/uploads/2025/07/31104846/WS-Case-Book-2025-2028-v2025-07.pdf
//
// The diagrams: wind from the top of the page (000°), x east, y north, meters. 315 = starboard close-hauled, 045 = port
// close-hauled, 180 = a dead run. A Folkboat is 7.64 m; the zone is three lengths (22.9 m).

import { V } from '../core/math';
import type { RulesMark } from './types';

/** A boat at one moment. Between frames she sails on (the trainer interpolates); the engine looks at each frame. */
export interface CaseFrame {
  t: number; x: number; y: number; h: number;
  /** Her heading 3 s before (rule 16.1's "changes course"): by default, her heading at the frame before. */
  ago?: number;
  /** Speed, m/s, when it changes (else as before; 2.5 to begin with). */
  v?: number;
  /** Mid-tack, past head to wind (rule 13), from `tackT`. */
  tacking?: boolean; tackT?: number;
  /** Her tack, set while she's tacking (else from her heading). */
  tack?: 'S' | 'P';
  /** Sailing above her proper course (rule 17). */
  aboveProper?: boolean;
  /** Only where she starts: the engine doesn't look at this frame. */
  look?: false;
}

export interface CaseBoat { letter: string; started?: boolean; leg?: number; frames: CaseFrame[] }

export interface RulesCase {
  case: number;
  title: string;
  /** The rules it's about, for the trainer's chips. */
  rules: string[];
  marks?: RulesMark[];
  /** A bank along her course (an obstruction that continues): the engine's `obstacle` answer. */
  bank?: { d: number; n: { x: number; y: number } };
  /** The other boats count for obstructions (rule 19): give the engine the fleet. */
  fleet?: boolean;
  boats: CaseBoat[];
  /** The two boats the Case is about (the engine assesses this pair). */
  pair: [string, string];
  /** Frames where the boat that keeps clear is forced to swerve (an incident without contact). */
  swerveAt?: number[];
  /** Along the way: who keeps clear, and under which rule. */
  checks?: { t: number; keepsClear: string; rule: string }[];
  /** The trainer pauses here and asks. */
  momentT: number;
  /** 'foul': who broke a rule (the first incident after momentT, or none: 'neither'); 'keepsClear': who must keep clear
   * once the last frame has happened (the trainer pauses at momentT, plays on to the end, and asks). */
  ask: 'foul' | 'keepsClear';
  answer: { who: string; rule: string | null; line: string };
  /** Fit to show a learner: its frames are a sailed track (speed and track true to her heading), not test snapshots. */
  teach: boolean; why?: string;
}

/** The point `along` meters ahead of p on heading h and `across` meters to her starboard. */
const off = (p: [number, number], h: number, along: number, across = 0): [number, number] => {
  const u = V(h), s = V(h + 90);
  return [p[0] + u.x * along + s.x * across, p[1] + u.y * along + s.y * across];
};
const at = (t: number, p: [number, number], h: number, o: Partial<CaseFrame> = {}): CaseFrame => ({ t, x: p[0], y: p[1], h, ...o });
/** Sailed through in 0.1 s steps from `from`, her heading `hOf(t)` (as the World looks at a pair). */
function sail(from: [number, number], hOf: (t: number) => number, v: number, t0: number, t1: number): CaseFrame[] {
  const out: CaseFrame[] = []; let x = from[0], y = from[1];
  for (let i = 0, n = Math.round((t1 - t0) / 0.1); i <= n; i++) {
    const t = Math.round((t0 + i * 0.1) * 10) / 10, h = hOf(t), u = V(h); // (times to the tenth: the trainer compares them)
    x += u.x * v * 0.1; y += u.y * v * 0.1; out.push({ t, x, y, h, ago: hOf(t - 3), v });
  }
  return out;
}
/** Where a boat on heading h at 2.5 m/s was `dt` seconds before she reaches the origin. */
const back = (h: number, dt: number, v = 2.5): [number, number] => off([0, 0], h, -v * dt);
/** Sailed on from where the frames before left her. */
function then(frames: CaseFrame[], hOf: (t: number) => number, v: number, t0: number, t1: number): CaseFrame[] {
  const f = frames[frames.length - 1]; return [...frames, ...sail([f.x, f.y], hOf, v, t0, t1)];
}
/** Her frames as she tacks: from head to wind at `htw` until she's close-hauled at `done` (rule 13), onto `tack`. */
function tacking(frames: CaseFrame[], htw: number, done: number, tack: 'S' | 'P'): CaseFrame[] {
  return frames.map(f => f.t >= htw && f.t < done ? { ...f, tacking: true, tackT: htw, tack } : f.t >= done && f.t - 0.05 < done ? { ...f, tacking: false } : f);
}
const mark = (side: 's' | 'p', beat: boolean, p: [number, number] = [0, 0]): RulesMark => ({ name: 'M', p: { x: p[0], y: p[1] }, type: 'round', side, beat });

// (A where the zone's edge is about 10 m behind her at 99 s: 14 m short of the mark, 3 m to its side, as the diagram had her)
const A15 = off(off([0, 0], 45, -14, 3), 45, -2.5 * 4), hA15 = (t: number) => 45 - Math.min(90, Math.max(0, (t - 99) * 30));
const hL53 = (t: number) => 300 - Math.min(30, Math.max(0, (t + 31.8) * 30));
const AS27 = off([0, 0], 45, -10), hAS27 = (t: number) => 45 - Math.min(90, Math.max(0, (t - 50) * 20));
const hL13 = (t: number) => 280 + Math.min(35, Math.max(0, (t + 35) * 5));
const S11 = off([0, 0], 315, -2.5 * 6), PW11 = off(off([0, 0], 315, -6), 45, -2.5 * 6), hPW11 = (t: number) => 45 + Math.min(30, Math.max(0, (t - 49) * 8));
const hL7 = (t: number) => 315 + Math.min(5, Math.max(0, (t - 50) * 5));
const hL14 = (t: number) => 200 + Math.min(40, Math.max(0, (t - 50) * 4));
const hOL25 = (t: number) => 60 - Math.min(30, Math.max(0, (t - 50) * 5));
const hS105 = (t: number) => 181 + Math.min(30, Math.max(0, (t - 50) * 6));

export const CASES: RulesCase[] = [
  {
    case: 7, title: 'Overlapped to leeward from clear astern', rules: ['11', '17'],
    // (sailed: W close-hauled at 315°, 2.5 m/s, holding her course; L comes up from 12 m astern, 6 m to leeward, at 3.5 m/s,
    // overlapping her within two lengths, slows to her speed and luffs slightly, 5° over 1 s at 50 s (no course change
    // for 16.1, and no higher than her proper course for 17), closing on W until W's boom touches her)
    boats: [
      { letter: 'W', frames: [at(39.9, [0, 0], 315, { look: false }), ...sail([0, 0], () => 315, 2.5, 40, 70)] },
      { letter: 'L', frames: [at(39.9, off([0, 0], 315, -12, -6), 315, { look: false }), ...then(sail(off([0, 0], 315, -12, -6), () => 315, 3.5, 40, 47.9), hL7, 2.5, 48, 70)] },
    ],
    pair: ['W', 'L'], checks: [{ t: 40, keepsClear: 'L', rule: '12' }, { t: 48, keepsClear: 'W', rule: '11' }],
    momentT: 50, ask: 'foul', answer: { who: 'W', rule: '11', line: 'W, to windward, keeps clear (rule 11). L came from astern, but sailed no higher than her proper course (17).' }, teach: true,
  },

  {
    case: 11, title: 'Two port boats meet a starboard boat', rules: ['19', '10'], fleet: true,
    // (sailed, beating at 2.5 m/s: S on starboard crossing ahead through the origin at 52 s; PW and PL on port, overlapped
    // 4 m apart, PW aimed a little astern of S's track; from 49 s PW bears away 8°/s to pass astern of her and PL holds on:
    // PL's 19.2(b), the same over the spacings and timings tried at 4 m apart; at 5-6 m apart PW's room is enough and the
    // answer turns, so the Case keeps them close, as on the water)
    boats: [
      { letter: 'S', frames: [at(45.9, S11, 315, { look: false }), ...sail(S11, () => 315, 2.5, 46, 58)] },
      { letter: 'PW', frames: [at(45.9, PW11, 45, { look: false }), ...sail(PW11, hPW11, 2.5, 46, 58)] },
      { letter: 'PL', frames: [at(45.9, off(PW11, 45, 0, 4), 45, { look: false }), ...sail(off(PW11, 45, 0, 4), () => 45, 2.5, 46, 58)] },
    ],
    pair: ['PL', 'PW'], checks: [{ t: 46, keepsClear: 'PW', rule: '11' }],
    momentT: 49, ask: 'foul', answer: { who: 'PL', rule: '19.2(b)', line: 'S is an obstruction to both. PL, outside, must give PW room to pass astern of her (19.2(b)).' }, teach: true,
  },

  {
    case: 13, title: 'Before the start, a luff to close-hauled', rules: ['11', '17'],
    // (sailed, before the start: W reaching at 280°, 2 m/s; L comes up from 12 m astern, 5 m to leeward, at 3.5 m/s,
    // overlaps her, slows to her speed and luffs to close-hauled, 5°/s from -35 s: before the start no boat has a proper
    // course, so rule 17 doesn't limit her; W, slower to respond, is touched: W's 11. The same from 3 to 8°/s, 4 to 6 m)
    boats: [
      { letter: 'W', started: false, frames: [at(-44.1, [0, 0], 280, { v: 2, look: false }), ...sail([0, 0], () => 280, 2, -44, -20)] },
      { letter: 'L', started: false, frames: [at(-44.1, off([0, 0], 280, -12, -5), 280, { look: false }), ...then(sail(off([0, 0], 280, -12, -5), () => 280, 3.5, -44, -35.1), hL13, 2, -35, -20).map(f => f.t >= -35 ? { ...f, aboveProper: true } : f)] },
    ],
    pair: ['W', 'L'], checks: [{ t: -44, keepsClear: 'L', rule: '12' }],
    momentT: -35, ask: 'foul', answer: { who: 'W', rule: '11', line: 'Before the start there\'s no proper course, so no rule 17: L may luff to close-hauled. W keeps clear (11).' }, teach: true,
  },

  {
    case: 14, title: 'A slow luff toward the shore', rules: ['11', '16.1', '17'],
    // (sailed: W broad reaching at 200°, 2.5 m/s; L comes up from 12 m astern, 6 m to leeward, at 3.5 m/s, overlapping
    // her from clear astern within two lengths (so rule 17 binds her), slows to W's speed, then luffs 4°/s from 50 s)
    boats: [
      { letter: 'W', frames: [at(35.9, [0, 0], 200, { look: false }), ...sail([0, 0], () => 200, 2.5, 36, 80)] },
      { letter: 'L', frames: [at(35.9, off([0, 0], 200, -12, -6), 200, { look: false }), ...then(sail(off([0, 0], 200, -12, -6), () => 200, 3.5, 36, 44.9), hL14, 2.5, 45, 80)] },
    ],
    pair: ['W', 'L'], checks: [{ t: 36, keepsClear: 'L', rule: '12' }, { t: 45, keepsClear: 'W', rule: '11' }],
    momentT: 50, ask: 'foul', answer: { who: 'W', rule: '11', line: 'L luffs slowly, to her proper course: W had room to keep clear and didn\'t (11). L broke neither 16.1 nor 17.' }, teach: true,
  },

  {
    case: 15, title: 'Clear ahead at the zone, then tacking', rules: ['18.2(a)', '13'], marks: [mark('p', true)],
    // (sailed: both on port close-hauled at 045°, 2.5 m/s, B 12 m astern; A, in the zone, tacks from 99 s, 30°/s on
    // the 2.5 m/s she carries into it, through head to wind at 100.5 s; the question once she's past it)
    boats: [
      { letter: 'A', frames: [at(94.9, A15, 45, { look: false }), ...tacking(sail(A15, hA15, 2.5, 95, 101.2), 100.5, 999, 'S')] },
      { letter: 'B', frames: [at(94.9, off(A15, 45, -12), 45, { look: false }), ...sail(off(A15, 45, -12), () => 45, 2.5, 95, 101.2)] },
    ],
    pair: ['A', 'B'], checks: [{ t: 99, keepsClear: 'B', rule: '18.2(a)' }],
    momentT: 99, ask: 'keepsClear', answer: { who: 'A', rule: '13', line: 'Past head to wind, A\'s mark-room is over (18.2(b)): while she tacks she keeps clear (13).' }, teach: true,
  },

  {
    case: 23, title: 'Running between two port boats', rules: ['10', '19'], fleet: true,
    boats: [
      { letter: 'S', frames: [at(50, [0, 0], 190)] },
      { letter: 'PW', frames: [at(50, [4, -1], 170), at(52, [1.6, -1], 170)] },
      { letter: 'PL', frames: [at(50, [-4, -1], 170)] },
    ],
    pair: ['S', 'PW'], checks: [{ t: 50, keepsClear: 'PW', rule: '10' }],
    momentT: 50, ask: 'foul', answer: { who: 'PW', rule: '10', line: 'Port keeps clear of starboard (10). S is an obstruction to both, but they pass her on opposite sides, so rule 19 doesn\'t apply.' }, teach: false, why: 'keyframes are the test\'s snapshots, not a sailed track: to be re-authored with sail()',
  },
  {
    case: 25, title: 'Leaving the leeward mark', rules: ['11', '16.1', '18'], marks: [mark('p', false), mark('p', true, [0, 400])],
    boats: [
      { letter: 'IW', leg: 1, frames: [at(49.9, off([6, 4], 60, 0, -4.5), 60), ...sail(off([6, 4], 60, 0, -4.5), () => 60, 2.5, 50, 70)] },
      { letter: 'OL', leg: 1, frames: [at(49.9, [6, 4], 60), ...sail([6, 4], hOL25, 2.5, 50, 70)] },
    ],
    pair: ['IW', 'OL'], checks: [{ t: 49.9, keepsClear: 'IW', rule: '11' }],
    momentT: 49.9, ask: 'foul', answer: { who: 'IW', rule: '11', line: 'Past the mark, rule 18 is over. OL\'s luff over two lengths leaves room (16.1): IW keeps clear (11).' }, teach: true,
  },
  {
    case: 27, title: 'Tacking close ahead', rules: ['13'],
    // (sailed: both on port close-hauled at 045°, 2.5 m/s, BP 8 m astern and 5 m to windward of AS; AS tacks from 50 s at
    // 20°/s, through head to wind at 52.25 s; BP, holding her course, runs into her while she's still turning)
    boats: [
      { letter: 'AS', frames: [at(45.9, AS27, 45, { look: false }), ...tacking(sail(AS27, hAS27, 2.5, 46, 58), 52.25, 54.5, 'S')] },
      { letter: 'BP', frames: [at(45.9, off(AS27, 45, -8, -5), 45, { look: false }), ...sail(off(AS27, 45, -8, -5), () => 45, 2.5, 46, 58)] },
    ],
    pair: ['AS', 'BP'], checks: [{ t: 46, keepsClear: 'BP', rule: '12' }],
    momentT: 50, ask: 'foul', answer: { who: 'AS', rule: '13', line: 'AS tacked too close: past head to wind and not yet close-hauled, she keeps clear (13).' }, teach: true,
  },

  {
    case: 43, title: 'Along a bank, meeting a starboard boat', rules: ['10', '19'], bank: { d: 2, n: { x: Math.SQRT1_2, y: -Math.SQRT1_2 } },
    // (sailed: both at 2.5 m/s on their headings, meeting at the origin at 52 s; P along the bank, 2 m off her port side)
    boats: [
      { letter: 'S', frames: [at(45.9, back(315, 52 - 45.9), 315, { look: false }), ...sail(back(315, 52 - 45.9), () => 315, 2.5, 46, 54)] },
      { letter: 'P', frames: [at(45.9, back(45, 52 - 45.9), 45, { look: false }), ...sail(back(45, 52 - 45.9), () => 45, 2.5, 46, 54)] },
    ],
    pair: ['S', 'P'], checks: [{ t: 46, keepsClear: 'P', rule: '10' }],
    momentT: 48, ask: 'foul', answer: { who: 'P', rule: '10', line: 'Port keeps clear (10). Beating on opposite tacks they aren\'t overlapped, so the bank gives her no room under 19.2(b).' }, teach: true,
  },

  {
    case: 53, title: 'Overlapped from astern, a boat nearly stopped', rules: ['15', '11'],
    // (sailed, before the start: W nearly stopped at 300°, 0.2 m/s; L comes up from 12 m astern, 4 m to leeward, at 2.5 m/s,
    // overlaps her, and at once bears away 30° (30°/s) to give her time to respond: a swerve, but hers to make)
    boats: [
      { letter: 'W', started: false, frames: [at(-34.1, [0, 0], 300, { v: 0.2, look: false }), ...sail([0, 0], () => 300, 0.2, -34, -26)] },
      { letter: 'L', started: false, frames: [at(-34.1, off([0, 0], 300, -12, -4), 300, { look: false }), ...sail(off([0, 0], 300, -12, -4), hL53, 2.5, -34, -26)] },
    ],
    pair: ['W', 'L'], swerveAt: [-31], checks: [{ t: -34, keepsClear: 'L', rule: '12' }, { t: -31.9, keepsClear: 'W', rule: '11' }],
    momentT: -32, ask: 'foul', answer: { who: 'neither', rule: null, line: 'L got right of way by overlapping from astern, so she gives W time to respond (15). Bearing away to do so breaks no rule.' }, teach: true,
  },

  {
    case: 92, title: 'Starboard bears away onto a ducking port boat', rules: ['16.2', '10'],
    boats: [
      { letter: 'S', frames: [at(50, [0, 0], 315), at(52, [-1, -1], 265, { ago: 315 })] },
      { letter: 'P', frames: [at(50, [-2, -10], 60), at(52, [-2.5, -2.3], 80)] },
    ],
    pair: ['S', 'P'], checks: [{ t: 50, keepsClear: 'P', rule: '10' }],
    momentT: 50, ask: 'foul', answer: { who: 'S', rule: '16.2', line: 'On a beat, once port is ducking her, starboard mustn\'t bear away so that port has to change course at once (16.2).' }, teach: false, why: 'sailed, the 16.2 answer holds only within a meter or so of this geometry (else port\'s 10): not a clear lesson yet',
  },

  {
    case: 105, title: 'Running side by side, starboard luffs', rules: ['10', '16.1'],
    boats: [
      { letter: 'S', frames: [at(47.9, [0, 0], 181, { look: false }), ...sail([0, 0], hS105, 2.5, 48, 70)] },
      { letter: 'P', frames: [at(47.9, [-9, 0], 179, { look: false }), ...sail([-9, 0], () => 179, 2.5, 48, 70)] },
    ],
    pair: ['S', 'P'],
    momentT: 50, ask: 'foul', answer: { who: 'P', rule: '10', line: 'S\'s luff left P room to keep clear: she could have gybed. Port keeps clear (10); S\'s luff didn\'t break 16.1.' }, teach: true,
  },
];
