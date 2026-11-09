import type { Tack } from '../boat/boat';
import type { IncidentKind, RuleId } from './types';

export const RULES: Record<RuleId, [title: string, text: string]> = {
  '10': ['Rule 10 · Opposite tacks', 'When boats are on opposite tacks, a port-tack boat keeps clear of a starboard-tack boat.'],
  '11': ['Rule 11 · Same tack, overlapped', 'When boats on the same tack are overlapped, the windward boat keeps clear of the leeward boat.'],
  '12': ['Rule 12 · Same tack, not overlapped', 'When boats on the same tack are not overlapped, the boat clear astern keeps clear of the boat clear ahead.'],
  '13': ['Rule 13 · While tacking', 'After a boat passes head to wind, she keeps clear of other boats until she is on a close-hauled course.'],
  '15': ['Rule 15 · Acquiring right of way', 'When a boat acquires right of way, she must at first give the other boat room to keep clear.'],
  '16.1': ['Rule 16.1 · Changing course', 'When a right-of-way boat changes course, she shall give the other boat room to keep clear.'],
  '17': ['Rule 17 · On the same tack; proper course', 'If a boat clear astern becomes overlapped within two of her hull lengths to leeward of a boat on the same tack, she shall not sail above her proper course while they remain on the same tack and overlapped within that distance.'],
  '18.2(b)': ['Rule 18.2(b) · Mark-room', 'If boats are overlapped when the first reaches the zone (three lengths from the mark), the outside boat gives the inside boat mark-room. If a boat is clear ahead when she reaches the zone, the boat clear astern gives her mark-room.'],
  '22.1': ['Rule 22.1 · Returning to start', 'A boat sailing back to start after being over early keeps clear of boats that are not.'],
  '22.2': ['Rule 22.2 · Taking a penalty', 'A boat taking a penalty keeps clear of boats that are not.']
};

const tackName = (t: Tack) => t === 'S' ? 'starboard' : 'port';

export interface ExplainInput {
  youFouled: boolean;
  other: string; // the other boat's name
  userTack: Tack;
  rule: RuleId;
  kind: IncidentKind;
  byWhy: 'tack' | 'overlap' | null;
  markName?: string; // for 18.2(b)
  markOverlapped?: boolean;
  turned?: number; // for 16.1
}

/** Plain-language "what happened" and a tip, from the user's point of view. */
export function explain(e: ExplainInput): { what: string; tip: string } {
  const you = e.youFouled, o = e.other;
  let what = '', tip = '';
  switch (e.rule) {
    case '10':
      what = you ? `You were on port tack. ${o} was on starboard, so you had to keep clear.` : `${o} was on port tack and you were on starboard. ${o} had to keep clear.`;
      tip = you ? 'On port, check under your jib early. Bear away to pass behind their stern, or tack well before they have to react.' : 'You held your course, which is what a right-of-way boat should do. Hailing "Starboard!" early helps the other boat react.';
      break;
    case '11':
      what = you ? `You and ${o} were overlapped on ${tackName(e.userTack)} tack, and you were to windward.` : `${o} was overlapped to windward of you and failed to keep clear.`;
      tip = you ? 'As windward boat, head up or slow down as soon as someone is overlapped to leeward, and keep a gap you can close safely.' : 'As leeward boat you may luff, but give them room to respond (Rule 16) when you change course.';
      break;
    case '12':
      what = you ? `You were clear astern of ${o} on the same tack.` : `${o} was clear astern and sailed into you.`;
      tip = you ? 'From astern, commit early: steer to leeward to roll them later, or slow down. You cannot sail into their transom.' : 'Clear ahead, you have the right of way. Keep sailing your course.';
      break;
    case '13':
      what = you ? `You tacked near ${o} and were still turning when they had to avoid you.` : `${o} tacked too close and was still turning when you met.`;
      tip = you ? 'Before tacking near a boat, make sure you will be close-hauled with clear water. About three boat lengths is a safe rule of thumb.' : 'A boat that is mid-tack has no rights. Hold your course.';
      break;
    case '15':
      what = you ? `You just gained right of way by ${e.byWhy === 'tack' ? 'tacking' : 'establishing a leeward overlap from astern'}, and ${o} had no time to respond.` : `${o} gained right of way by ${e.byWhy === 'tack' ? 'tacking' : 'overlapping from astern'} and didn't leave you room to keep clear.`;
      tip = you ? 'Right of way you have just acquired is not enforceable straight away. Leave the other boat time and space to get clear.' : 'You were the boat that had to keep clear, but the other boat changed the situation too suddenly for you to respond.';
      break;
    case '16.1':
      what = you ? `You had right of way, but you turned ${e.turned ? Math.round(e.turned) + '° ' : ''}toward ${o} just before, and they had no time to get out of the way.` : `${o} had right of way but turned into you just before, without giving you time to keep clear.`;
      tip = you ? 'Having right of way lets you hold your course, not aim at the other boat. If you change course near another boat, do it slowly enough that they can respond: a Folkboat needs a few seconds to turn.' : 'You were the keep-clear boat, but a right-of-way boat that changes course must leave you room to respond. They broke Rule 16.';
      break;
    case '17':
      what = you ? `You came up from behind and got an overlap to leeward of ${o} within two boat lengths, then sailed above your proper course. Rule 17 takes away your right to luff them.` : `${o} came from behind to get a leeward overlap within two lengths, then sailed above their proper course into you.`;
      tip = you ? 'When you sneak in to leeward from astern, you keep right of way but lose the right to luff: sail no higher than your normal course to the next mark (close-hauled on a beat). If you want to luff, get the overlap from more than two lengths away.' : 'A boat that overlaps you from astern and to leeward may not luff you above her proper course. You were in the right.';
      break;
    case '18.2(b)': {
      const mk = e.markName ?? 'the mark';
      what = you ? `At ${mk} you owed ${o} mark-room${e.markOverlapped ? ' as the outside boat' : ' because they reached the zone clear ahead'}.` : `${o} owed you mark-room at ${mk} and squeezed you.`;
      tip = you ? 'Inside the zone, mark-room overrides windward/leeward and port/starboard on a run. Settle who is inside or ahead before you reach three lengths.' : 'You were entitled to room to round. Sail your proper course around the mark.';
      break;
    }
    case '22.1':
      what = you ? `You were returning to start after being over early, so you had to keep clear of ${o}.` : `${o} was returning after being over early and had to keep clear.`;
      tip = you ? 'With an ebb, hang back farther before the gun. The current carries you toward the line while you luff.' : 'Boats coming back from over early have no rights until they restart.';
      break;
    case '22.2':
      what = you ? 'You were doing penalty turns, so you had to keep clear of everyone.' : `${o} was doing penalty turns and had to keep clear.`;
      tip = you ? 'Do your turns in clear water, away from traffic.' : 'A boat doing turns has no rights.';
      break;
  }
  if (e.kind === 'swerve' && you) what += ` ${o} had to swerve to avoid contact. Forcing a right-of-way boat to change course is still a foul, even without a collision.`;
  return { what, tip };
}

/** Short live banner text for the situation pod. */
export function situationText(rule: RuleId, youKeepClear: boolean, other: string): string {
  const kc = youKeepClear, nm = other;
  const msgs: Record<RuleId, string> = {
    '10': kc ? `Keep clear of ${nm}. You're on port, they're on starboard.` : `${nm} is on port and must keep clear. Hold your course.`,
    '11': kc ? `You're windward of ${nm}. Keep clear.` : `${nm} is windward and must keep clear.`,
    '12': kc ? `You're clear astern of ${nm}. Keep clear.` : `${nm} is clear astern and must keep clear.`,
    '13': kc ? `You're tacking. Keep clear until close-hauled.` : `${nm} is tacking and must keep clear.`,
    '15': kc ? `${nm} just gained right of way. Keep clear.` : `You just gained right of way. Give ${nm} room to keep clear.`,
    '16.1': kc ? `${nm} changed course. Keep clear.` : `If you change course, give ${nm} room to keep clear.`,
    '17': kc ? `${nm} overlapped from astern. Keep clear.` : `You overlapped from astern: no higher than your proper course.`,
    '18.2(b)': kc ? `Give ${nm} mark-room.` : `${nm} owes you mark-room.`,
    '22.1': kc ? `You're returning. Keep clear of everyone.` : `${nm} is returning and must keep clear.`,
    '22.2': kc ? `You're doing turns. Keep clear of everyone.` : `${nm} is doing turns and must keep clear.`
  };
  return msgs[rule];
}
