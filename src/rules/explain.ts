import type { Tack } from '../boat/boat';
import type { IncidentKind, RuleId } from './types';

export const RULES: Record<RuleId, [title: string, text: string]> = {
  '10': ['Rule 10 · Opposite tacks', 'When boats are on opposite tacks, a port-tack boat keeps clear of a starboard-tack boat.'],
  '11': ['Rule 11 · Same tack, overlapped', 'When boats on the same tack are overlapped, the windward boat keeps clear of the leeward boat.'],
  '12': ['Rule 12 · Same tack, not overlapped', 'When boats on the same tack are not overlapped, the boat clear astern keeps clear of the boat clear ahead.'],
  '13': ['Rule 13 · While tacking', 'After a boat passes head to wind, she keeps clear of other boats until she is on a close-hauled course; rules 10, 11 and 12 don\'t apply meanwhile. If two boats are tacking at the same time, the one on the other\'s port side, or the one astern, keeps clear.'],
  '15': ['Rule 15 · Acquiring right of way', 'When a boat acquires right of way, she must at first give the other boat room to keep clear.'],
  '16.1': ['Rule 16.1 · Changing course', 'When a right-of-way boat changes course, she shall give the other boat room to keep clear.'],
  '16.2': ['Rule 16.2 · Changing course on a beat', 'On a beat to windward, when a port-tack boat is keeping clear by sailing to pass to leeward of (behind) a starboard-tack boat, the starboard boat shall not bear away if as a result the port boat must change course immediately to keep clear.'],
  '17': ['Rule 17 · On the same tack; proper course', 'If a boat clear astern becomes overlapped within two of her hull lengths to leeward of a boat on the same tack, she shall not sail above her proper course while they remain on the same tack and overlapped within that distance, unless in doing so she promptly sails astern of the other boat.'],
  '18.2(a)': ['Rule 18.2(a) · Mark-room', 'When the first of two boats reaches the zone (three hull lengths from the mark): if they are overlapped, the outside boat gives the inside boat mark-room; if not, the boat that hasn\'t reached the zone gives the other boat mark-room. That holds even if the overlap later changes, until the boat entitled to mark-room passes head to wind or leaves the zone (18.2(b)). Rule 18 doesn\'t apply between boats on opposite tacks on a beat.'],
  '18.2(c)': ['Rule 18.2(c) · Mark-room, once 18.2(a) has ended', 'When rule 18.2(a) no longer applies (the boat that was entitled to mark-room passed head to wind or left the zone) and the boats are overlapped, the outside boat gives the inside boat mark-room. Not if the inside boat got her overlap from clear astern, or by tacking to windward, when the outside boat couldn\'t give room from that moment (18.2(d)).'],
  '18.3': ['Rule 18.3 · Tacking in the zone', 'If a boat passes head to wind from port to starboard tack in the zone of a mark to be left to port, rule 18.2 doesn\'t apply between her and a starboard-tack boat that is fetching the mark. If that boat has been on starboard since entering the zone, the boat that tacked shall not cause her to sail above close-hauled to avoid contact, and shall give her mark-room if she becomes overlapped inside.'],
  '18.4': ['Rule 18.4 · Gybing in the zone', 'When an inside overlapped right-of-way boat must gybe at a mark to sail her proper course, until she gybes she shall sail no farther from the mark than needed to sail that course. (Not at a gate mark.)'],
  '19': ['Rule 19 · Room to pass an obstruction', 'At an obstruction (the shore, a pier, the committee boat after the start, or a boat both must keep clear of, such as a starboard-tack boat two port-tack boats are meeting), when boats are overlapped the outside boat gives the inside boat room between her and the obstruction, unless she has been unable to from the moment the overlap began (19.2(b)). At a continuing obstruction like the shore, a boat that was clear astern and pushes into a gap that isn\'t there when the overlap begins isn\'t entitled to room, and keeps clear (19.2(c)).'],
  '20': ['Rule 20 · Room to tack at an obstruction', 'A boat sailing close-hauled or above, approaching an obstruction she will soon have to change course substantially to avoid, may hail "Room to tack" at a boat on the same tack. The hailed boat shall respond either by tacking as soon as possible, or by immediately replying "You tack" and then giving the hailing boat room to tack and avoid her. Once the hailed boat responds, the hailing boat shall tack as soon as possible. From the hail until the hailing boat has tacked and avoided the hailed boat, mark-room (rule 18.2) doesn\'t apply between them (20.2(e)). A hailed boat that means to tack but has another boat on the same tack to windward may pass the hail on to that boat (20.3).'],
  '21.1': ['Rule 21.1 · Returning to start', 'After her starting signal, a boat sailing back toward the pre-start side of the starting line (or its extensions) to start keeps clear of boats that are not, until her hull is completely on the pre-start side.'],
  '21.2': ['Rule 21.2 · Taking a penalty', 'A boat taking a penalty keeps clear of boats that are not.'],
  '21.3': ['Rule 21.3 · Backing a sail', 'A boat moving astern, or sideways to windward, through the water by backing a sail keeps clear of one that is not.'],
  '23': ['Rule 23 · Interfering with another boat', 'If reasonably possible, a boat not racing (for example, one that has finished) shall not interfere with a boat that is racing (23.1). And, if reasonably possible, a boat shall not interfere with a boat taking a penalty, sailing on another leg, or returning to start under rule 21.1, except that after the starting signal she may sail her proper course (23.2). Interfering includes getting in her way and, as this sim judges it, sitting on her wind.']
};

/** Rule 43.1(a): text added when a boat broke a rule only because another boat's breach compelled her to. */
export const EXONERATION = 'Rule 43.1(a) · Exoneration: when a boat breaking a rule compels another boat to break a rule, the other boat is exonerated and takes no penalty.';

const tackName = (t: Tack) => t === 'S' ? 'starboard' : 'port';

export interface ExplainInput {
  youFouled: boolean;
  other: string; // the other boat's name
  userTack: Tack;
  rule: RuleId;
  kind: IncidentKind;
  byWhy: 'tack' | 'overlap' | null;
  markName?: string; // for 18.2(a)
  markOverlapped?: boolean;
  turned?: number; // for 16.1 and 16.2
  hailRole?: 'hailed' | 'hailer'; // for a Rule 20 hail incident
  part?: string; // which part of the rule (19.2(b) or (c), 23.1 or 23.2)
  /** Rule 43.1(a): the boat that compelled the fouler to break the rule (she's exonerated). */
  exoneratedBy?: string;
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
    case '16.2':
      what = you ? `You were on starboard on a beat, ${o} was on port ducking behind you, and you bore away ${e.turned ? Math.round(e.turned) + '° ' : ''}onto them so they had to change course at once.` : `${o} was on starboard and bore away onto you while you were ducking behind them.`;
      tip = you ? 'Once a port boat has committed to duck your stern, hold your course. Bearing away to "hunt" her is a foul under Rule 16.2.' : 'You did the right thing by ducking. A starboard boat may not bear away onto a port boat that is passing behind her.';
      break;
    case '17':
      what = you ? `You came up from behind and got an overlap to leeward of ${o} within two boat lengths, then sailed above your proper course. Rule 17 takes away your right to luff them.` : `${o} came from behind to get a leeward overlap within two lengths, then sailed above their proper course into you.`;
      tip = you ? 'When you sneak in to leeward from astern, you keep right of way but lose the right to luff: sail no higher than your normal course to the next mark (close-hauled on a beat). If you want to luff, get the overlap from more than two lengths away.' : 'A boat that overlaps you from astern and to leeward may not luff you above her proper course. You were in the right.';
      break;
    case '18.2(a)': {
      const mk = e.markName ?? 'the mark';
      what = you ? `At ${mk} you owed ${o} mark-room${e.markOverlapped ? ' as the outside boat' : ' because they reached the zone clear ahead'}.` : `${o} owed you mark-room at ${mk} and squeezed you.`;
      tip = you ? 'Inside the zone, mark-room overrides windward/leeward and port/starboard on a run. Settle who is inside or ahead before you reach three lengths.' : 'You were entitled to room to round. Sail your proper course around the mark.';
      break;
    }
    case '18.3': {
      const mk = e.markName ?? 'the mark';
      what = you ? `You tacked onto starboard inside the zone at ${mk}, right in front of ${o}, who was already fetching the mark on starboard. That takes away your rights against them: they don't have to sail above close-hauled to avoid you.` : `${o} tacked onto starboard inside the zone at ${mk}, under your bow, while you were fetching it. They broke Rule 18.3.`;
      tip = you ? 'Coming into a port-hand windward mark on port, don\'t tack in the zone close to a starboard boat that is laying the mark. Tack before the zone, or duck them and tack after they pass.' : 'On the starboard layline you were entitled to sail close-hauled to the mark. You didn\'t have to go above that to avoid a boat that tacked in front of you.';
      break;
    }
    case '18.2(c)': {
      const mk = e.markName ?? 'the mark';
      what = you ? `At ${mk} the earlier mark-room had ended, but ${o} was overlapped inside you, so as the outside boat you still owed them mark-room (Rule 18.2(c)).` : `At ${mk} ${o} was outside you and overlapped, so they owed you mark-room, and squeezed you.`;
      tip = you ? 'Even after a tack or a boat leaving the zone resets mark-room, an inside overlap still earns room. Get clear ahead before the mark, or let them in.' : 'Inside and overlapped, you were entitled to room to sail around the mark.';
      break;
    }
    case '18.4': {
      const mk = e.markName ?? 'the mark';
      what = you ? `You were inside at ${mk} with right of way and had to gybe to sail the next leg, but you sailed on past the mark instead, taking ${o} wide.` : `${o} was inside you at ${mk} and had to gybe there, but sailed on past it, carrying you wide.`;
      tip = you ? 'Your mark-room is room to round, not to carry the outside boat away from the mark. When you need to gybe at the mark, gybe there.' : 'An inside boat that must gybe may not take you farther from the mark than her course needs.';
      break;
    }
    case '19':
      if (e.part === '19.2(c)') {
        what = you ? `You came from clear astern and pushed in between ${o} and the shore where there wasn't room. Along a continuing obstruction like the shore, that earns no room: you had to keep clear (Rule 19.2(c)).` : `${o} came from behind and forced in between you and the shore where there wasn't room. They weren't entitled to it.`;
        tip = you ? 'Along the shore, only go for the inside if the gap is there when your bow reaches their stern. Otherwise go round the outside or wait.' : 'You didn\'t have to make room for a boat that tried to squeeze in from behind along the shore.';
      } else {
        what = you ? `${o} was overlapped inside you at the shore (or the committee boat), and you closed on them toward it. The outside boat must leave the inside boat room between her and the obstruction (Rule 19.2(b)).` : `${o} was outside you at the obstruction and squeezed you toward it. They owed you room (Rule 19.2(b)).`;
        tip = you ? 'Near the shore, piers or the committee boat, check who is inside. If it\'s them, give them space to pass it: don\'t luff or bear down into them toward it.' : 'Inside at an obstruction you\'re entitled to room to pass it. You still keep clear in other ways, but they can\'t squeeze you into it.';
      }
      break;
    case '20':
      if (e.kind !== 'hail') {
        // contact or swerve after a "You tack" reply
        what = you ? `${o} hailed for room to tack and you replied "You tack". That meant giving them room to tack and get clear of you, and you didn't.` : `You hailed ${o} for room to tack. They replied "You tack", which obliged them to give you room to tack and keep clear, and they didn't.`;
        tip = you ? 'Reply "You tack" only when you can easily let them tack and pass behind you, typically when you are well ahead. Otherwise just tack.' : 'After a "You tack" reply, tack straight away and pass behind them; they must give you room to do it.';
        break;
      }
      if (e.hailRole === 'hailer') {
        what = you ? `You hailed ${o} for room to tack and they responded, but you didn't tack. Once the hailed boat responds, the hailing boat must tack as soon as possible (Rule 20.2(d)).` : `${o} hailed you for room to tack, you responded, and then they didn't tack.`;
        tip = you ? 'Only hail when you need to tack, and tack as soon as they respond.' : 'You answered the hail properly.';
        break;
      }
      what = you ? `${o} was being squeezed against an obstruction (the shore, a pier or an island) and hailed you for room to tack. You didn't respond.` : `You hailed ${o} for room to tack and they didn't respond.`;
      tip = you ? 'When a boat to leeward near an obstruction (the shore, a pier, an island) hails "Room to tack!", tack right away (or reply "You tack" and give them room). They may not be able to hold their course much longer.' : 'You did the right thing: hail early, clearly, and only when you really need to tack to clear the obstruction.';
      break;
    case '21.1':
      what = you ? `You were returning to start after being over early, so you had to keep clear of ${o}.` : `${o} was returning after being over early and had to keep clear.`;
      tip = you ? 'With an ebb, hang back farther before the gun. The current carries you toward the line while you luff.' : 'Boats coming back from over early have no rights until they restart.';
      break;
    case '21.2':
      what = you ? 'You were doing penalty turns, so you had to keep clear of everyone.' : `${o} was doing penalty turns and had to keep clear.`;
      tip = you ? 'Do your turns in clear water, away from traffic.' : 'A boat doing turns has no rights.';
      break;
    case '21.3':
      what = you ? `You were moving backwards (or sideways to windward) by backing a sail, so you had to keep clear of ${o}.` : `${o} was backing a sail and moving astern, and had to keep clear.`;
      tip = you ? 'Backing a sail to get out of irons or off the line is fine, but while you go backwards you have no rights.' : 'A boat backing down has no rights over you.';
      break;
    case '23':
      if (e.kind === 'blanket') {
        const not = e.part === '23.1' ? 'had finished, so you weren\'t racing any more,' : 'were above your proper course';
        const them = e.part === '23.1' ? 'still racing' : 'on another leg, taking a penalty or returning to start';
        what = you ? `You ${not} and your sails sat on the wind of ${o}, who was ${them}, for several seconds. Taking a boat's wind interferes with her as much as getting in her way.`
          : `${o} ${e.part === '23.1' ? 'had finished and' : 'left their proper course and'} took your wind for several seconds while you were ${e.part === '23.1' ? 'still racing' : 'on another leg, taking a penalty or returning to start'}.`;
        tip = you ? 'Your wind shadow streams off to leeward and astern of you, along the wind you feel. Keep it off boats you must not interfere with: bear away or head up out of line, or keep clear astern.' : 'Rule 23 protects you from boats that go out of their way to hinder you, by taking your wind as much as by blocking you.';
        break;
      }
      if (e.part === '23.1') {
        what = you ? `You had finished, so you were no longer racing, and you got in the way of ${o}, who was.` : `${o} had finished and got in your way while you were still racing.`;
        tip = you ? 'After you finish, sail well clear of the line and the course: boats still racing come first.' : 'A boat that has finished must not interfere with boats still racing.';
      } else {
        what = you ? `${o} was on another leg, taking a penalty or returning to start, and you left your proper course${e.turned ? ` (turning ${Math.round(e.turned)}° toward them)` : ''} and got in their way.` : `${o} left their proper course and interfered with you while you were on another leg, taking a penalty or returning to start.`;
        tip = you ? 'You may sail your proper course past a boat on another leg or doing turns, but don\'t go out of your way to block or luff her.' : 'Rule 23 protects a boat in a vulnerable moment from boats that go out of their way to hinder her.';
      }
      break;
  }
  if (e.exoneratedBy) { what += ` But ${e.exoneratedBy} broke a rule first and forced ${you ? 'you' : o} into it, so ${you ? 'you are' : `${o} is`} exonerated: no penalty (Rule 43.1(a)).`; }
  if (e.kind === 'hail' || e.kind === 'blanket') return { what, tip };
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
    '16.2': kc ? `${nm} bore away onto you. Keep clear.` : `Don't bear away onto ${nm} while they duck you.`,
    '17': kc ? `${nm} overlapped from astern. Keep clear.` : `You overlapped from astern: no higher than your proper course.`,
    '18.2(a)': kc ? `Give ${nm} mark-room.` : `${nm} owes you mark-room.`,
    '18.2(c)': kc ? `${nm} is inside: give them mark-room.` : `You're inside: ${nm} owes you mark-room.`,
    '18.4': kc ? `Gybe at the mark: don't take ${nm} wide.` : `${nm} must gybe at the mark, not take you wide.`,
    '19': kc ? `Give ${nm} room at the obstruction.` : `${nm} owes you room at the obstruction.`,
    '18.3': kc ? `You tacked in the zone: don't make ${nm} sail above close-hauled.` : `${nm} tacked in the zone in front of you: they must keep clear.`,
    '20': kc ? `Give ${nm} room to tack and get clear of you.` : `${nm} must give you room to tack.`,
    '21.1': kc ? `You're returning. Keep clear of everyone.` : `${nm} is returning and must keep clear.`,
    '21.2': kc ? `You're doing turns. Keep clear of everyone.` : `${nm} is doing turns and must keep clear.`,
    '21.3': kc ? `You're backing down. Keep clear of everyone.` : `${nm} is backing down and must keep clear.`,
    '23': kc ? `Don't interfere with ${nm}.` : `${nm} must not interfere with you.`
  };
  return msgs[rule];
}
