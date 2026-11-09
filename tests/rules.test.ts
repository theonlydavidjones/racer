import { describe, expect, it } from 'vitest';
import { ZONE } from '../src/core/math';
import type { RulesMark } from '../src/rules';
import { boat, moveTo, pair, verdict } from './diagram';

/* Every diagram: wind from the top of the page (north). x = metres east, y = metres north. */

describe('Rule 10 · port/starboard cross', () => {
  //            wind ↓
  //
  //      ↖ Blue (S, 315)
  //         ╲
  //          ╳   ← converging
  //         ╱
  //  Red ↗ (P, 045)
  it('port-tack boat keeps clear of starboard-tack boat', () => {
    const red = boat('Red', { at: [0, 0], heading: 45 });
    const blue = boat('Blue', { at: [30, 0], heading: 315 });
    expect(verdict(red, blue)).toEqual({ keepsClear: 'Red', rule: '10' });
    expect(verdict(blue, red)).toEqual({ keepsClear: 'Red', rule: '10' }); // order doesn't matter
  });

  it('contact on the cross: port boat is penalized', () => {
    const red = boat('Red', { at: [0, 0], heading: 45 });
    const blue = boat('Blue', { at: [3, 3], heading: 315 });
    expect(pair(red, blue).at(30).foul).toEqual({ by: 'Red', rule: '10', kind: 'contact', why: null });
  });

  it('port boat ducks astern with room to spare: no foul', () => {
    const red = boat('Red', { at: [0, -12], heading: 45 });
    const blue = boat('Blue', { at: [5, 0], heading: 315 });
    expect(pair(red, blue).at(30).foul).toBeNull();
  });

  it('starboard boat forced to swerve counts as a foul even without contact', () => {
    const red = boat('Red', { at: [0, 0], heading: 45 });
    const blue = boat('Blue', { at: [8, 6], heading: 315 });
    expect(pair(red, blue).at(30, { swerve: true }).foul).toEqual({ by: 'Red', rule: '10', kind: 'swerve', why: null });
  });
});

describe('Rule 11 · windward/leeward', () => {
  //            wind ↓
  //   ← Blue  (windward, 6 m to weather)
  //   ← Red   (leeward)
  // Both starboard, beam reaching west, overlapped side by side.
  it('windward boat keeps clear of leeward boat', () => {
    const red = boat('Red', { at: [0, 0], heading: 270 });
    const blue = boat('Blue', { at: [0, 6], heading: 270 });
    expect(verdict(red, blue)).toEqual({ keepsClear: 'Blue', rule: '11' });
  });

  it('leeward boat luffs slowly into windward boat, who fails to respond: windward boat is penalized', () => {
    const red = boat('Red', { at: [0, 0], heading: 270 });
    const blue = boat('Blue', { at: [0, 6], heading: 270 });
    const p = pair(red, blue);
    expect(p.at(10).foul).toBeNull();
    moveTo(red, [-2, 2.5], 300, 295); // Red has been heading up gradually toward Blue (a sudden turn would be Rule 16.1)
    expect(p.at(11).foul).toEqual({ by: 'Blue', rule: '11', kind: 'contact', why: null });
  });

  it('same on port tack, close-hauled', () => {
    const red = boat('Red', { at: [0, 0], heading: 45 });
    const blue = boat('Blue', { at: [-4, 4], heading: 45 }); // to windward (north-west of Red)
    expect(verdict(red, blue)).toEqual({ keepsClear: 'Blue', rule: '11' });
  });

});

describe('Rule 12 · clear astern', () => {
  it('boat clear astern keeps clear of boat clear ahead', () => {
    //   ← Blue        ← Red      (both starboard, Red one length behind)
    const blue = boat('Blue', { at: [0, 0], heading: 270 });
    const red = boat('Red', { at: [10, 0], heading: 270 });
    expect(verdict(red, blue)).toEqual({ keepsClear: 'Red', rule: '12' });
  });
});

describe('Rule 15 · overlap from astern', () => {
  //  t=10   ← Blue          ← Red             Red clear astern (Rule 12: Red keeps clear)
  //  t=11   ← Blue
  //          ← Red                            Red pokes her bow in to leeward: now Rule 11, Blue keeps clear...
  //  t=12   contact                           ...but Blue had no time to respond, so Red breaks Rule 15
  it('boat that just gained right of way by overlapping to leeward must give room', () => {
    const blue = boat('Blue', { at: [0, 0], heading: 270 });
    const red = boat('Red', { at: [10, -3], heading: 270 });
    const p = pair(blue, red);
    expect(p.at(10)).toMatchObject({ keepsClear: 'Red', rule: '12', foul: null });
    moveTo(red, [4, -3.5]);
    expect(p.at(11)).toMatchObject({ keepsClear: 'Blue', rule: '11', foul: null });
    moveTo(red, [1, -2.0]);
    expect(p.at(12).foul).toEqual({ by: 'Red', rule: '15', kind: 'contact', why: 'overlap' });
  });

  it('once the windward boat has had time to respond, Rule 11 applies normally', () => {
    const blue = boat('Blue', { at: [0, 0], heading: 270 });
    const red = boat('Red', { at: [10, -3], heading: 270 });
    const p = pair(blue, red);
    p.at(10);
    moveTo(red, [4, -3.5]); p.at(11);
    moveTo(red, [1, -2.0]);
    expect(p.at(16).foul).toEqual({ by: 'Blue', rule: '11', kind: 'contact', why: null });
  });
});

describe('Rule 13 · tacking too close', () => {
  //            wind ↓
  //        Blue ↑ (head to wind, mid-tack)
  //    ↖ Red (S, close-hauled)
  it('a boat between head to wind and close-hauled keeps clear', () => {
    const red = boat('Red', { at: [0, 0], heading: 315 });
    const blue = boat('Blue', { at: [-6, 10], heading: 350, tacking: true, lastTackT: 19.6 });
    expect(verdict(red, blue, 20)).toEqual({ keepsClear: 'Blue', rule: '13' });
    expect(pair(red, moveTo(blue, [-1.5, 3])).at(20).foul).toMatchObject({ by: 'Blue', rule: '13' });
  });

  //  t=20  Blue (port) tacks under Red's bow...           Rule 13: Blue keeps clear
  //  t=21  ...Blue is on starboard now, Red is on port   Rule 10: Red keeps clear...
  //  t=21.5 contact: Red had no time to respond          ...so Blue breaks Rule 15
  it('tacking onto starboard right in front of a port boat breaks Rule 15', () => {
    const red = boat('Red', { at: [0, 0], heading: 45 });
    const blue = boat('Blue', { at: [6, 9], heading: 10, tacking: true, lastTackT: 19.8 });
    blue.tack = 'S';
    const p = pair(red, blue);
    expect(p.at(20)).toMatchObject({ keepsClear: 'Blue', rule: '13', foul: null });
    blue.tacking = false; moveTo(blue, [6, 9], 315);
    expect(p.at(21)).toMatchObject({ keepsClear: 'Red', rule: '10', foul: null });
    moveTo(red, [4.5, 4.5]);
    expect(p.at(21.5).foul).toEqual({ by: 'Blue', rule: '15', kind: 'contact', why: 'tack' });
  });
});

describe('Rule 18.2(b) · mark-room at the zone', () => {
  // Leeward mark at the origin, approached on a run (not a beat). Zone = 3 lengths = 22.9 m.
  const mark: RulesMark = { name: 'Leeward mark', p: { x: 0, y: 0 }, type: 'round', beat: false };

  //            wind ↓
  //      Blue ↙   ↙ Red        Blue inside (nearer the mark) and to windward
  //                            Red outside and to leeward
  //    ·  ·  zone  ·  ·
  //          ● mark
  it('overlapped at the zone: outside boat gives mark-room, even though she is leeward', () => {
    const blue = boat('Blue', { at: [3, 26], heading: 190 });
    const red = boat('Red', { at: [9, 24.5], heading: 190 });
    const p = pair(blue, red, [mark]);
    expect(p.at(100)).toMatchObject({ keepsClear: 'Blue', rule: '11' }); // outside the zone: plain Rule 11
    moveTo(blue, [2.5, 21]); moveTo(red, [8.5, 19.5]);
    expect(Math.hypot(blue.x, blue.y)).toBeLessThan(ZONE);
    expect(p.at(101)).toMatchObject({ keepsClear: 'Red', rule: '18.2(b)' });
    expect(p.rec.mark).toMatchObject({ overlapped: true, inside: blue.id });
  });

  it('outside boat squeezes the inside boat at the mark: outside boat is penalized', () => {
    const blue = boat('Blue', { at: [3, 26], heading: 190 });
    const red = boat('Red', { at: [9, 24.5], heading: 190 });
    const p = pair(blue, red, [mark]);
    p.at(100);
    moveTo(blue, [2.5, 21]); moveTo(red, [8.5, 19.5]); p.at(101);
    moveTo(blue, [2, 12]); moveTo(red, [4, 11]);
    expect(p.at(104).foul).toMatchObject({ by: 'Red', rule: '18.2(b)', kind: 'contact' });
  });

  //      Blue ↙              Blue reaches the zone clear ahead...
  //            Red ↙         ...Red, clear astern, overlaps inside later: no room for Red
  it('clear ahead at the zone: boat clear astern gives mark-room, even if she later gets inside', () => {
    const blue = boat('Blue', { at: [6, 22], heading: 190 });
    const red = boat('Red', { at: [9, 30.5], heading: 190 });
    const p = pair(blue, red, [mark]);
    expect(p.at(100)).toMatchObject({ keepsClear: 'Red', rule: '18.2(b)' });
    expect(p.rec.mark).toMatchObject({ overlapped: false, ahead: blue.id });
    moveTo(blue, [5, 16]); moveTo(red, [2, 17]); // Red now inside and overlapped
    expect(p.at(102)).toMatchObject({ keepsClear: 'Red', rule: '18.2(b)' });
  });

  it('mark-room ends once both boats have left the mark behind', () => {
    const blue = boat('Blue', { at: [3, 21], heading: 190 });
    const red = boat('Red', { at: [9, 19.5], heading: 190 });
    const p = pair(blue, red, [mark]);
    p.at(100);
    blue.leg = 1; red.leg = 1; moveTo(blue, [-20, -40], 300); moveTo(red, [-14, -42], 300);
    p.at(110);
    expect(p.rec.mark).toBeNull();
  });

  it.todo('Rule 18.3: tacking in the zone of a port-rounding windward mark (not modelled yet)');
  it.todo('Mark-room for boats on opposite tacks at a windward mark (not modelled yet)');
});

describe('Incidents before the start signal count too', () => {
  it('contact at −90 s is judged like any other', () => {
    const red = boat('Red', { at: [0, 0], heading: 45, started: false });
    const blue = boat('Blue', { at: [3, 3], heading: 315, started: false });
    expect(pair(red, blue).at(-90).foul).toEqual({ by: 'Red', rule: '10', kind: 'contact', why: null });
  });
});

describe('Barging at the committee boat', () => {
  // Starting line runs east from the pin to the committee boat at (60, 0); course side is north.
  // Rule 18 does not apply at a starting mark surrounded by navigable water when boats are
  // approaching it to start (Rule 18.1(a)), so a windward barger gets no mark-room: Rule 11 decides.
  //
  //                 line · · · · · · · · · ▣ committee boat
  //                          Red ↗  (close-hauled, leeward)
  //                  Blue → (reaching in from windward, "barging")
  // Committee boat is not a course mark, so the rules context has no marks.
  it('before the gun, the windward barger keeps clear', () => {
    const red = boat('Red', { at: [50, -6], heading: 45, started: false });
    const blue = boat('Blue', { at: [44, -3], heading: 80, started: false });
    expect(verdict(red, blue, -5)).toEqual({ keepsClear: 'Blue', rule: '11' });
  });

  it('after the gun, still Rule 11: no room for the barger at the committee boat', () => {
    const red = boat('Red', { at: [50, -6], heading: 45, started: false });
    const blue = boat('Blue', { at: [44, -3], heading: 80, started: false });
    expect(verdict(red, blue, 1)).toEqual({ keepsClear: 'Blue', rule: '11' });
  });

  it('leeward boat closes the door and touches the barger: barger is penalized', () => {
    const red = boat('Red', { at: [50, -6], heading: 45, started: false });
    const blue = boat('Blue', { at: [49, -4], heading: 55, started: false });
    expect(pair(red, blue).at(1).foul).toMatchObject({ by: 'Blue', rule: '11', kind: 'contact' });
  });
});

describe('Rule 22.1 · returning after being over early', () => {
  //            wind ↓
  //    line · · · · · · · · · ·
  //        Red ↙ (OCS, dipping back on starboard)     Blue ↗ (port, started properly)
  it('a boat returning to start keeps clear, even on starboard', () => {
    const red = boat('Red', { at: [0, 0], heading: 225, ocs: true, started: false });
    const blue = boat('Blue', { at: [-8, -8], heading: 45 });
    expect(verdict(red, blue, 10)).toEqual({ keepsClear: 'Red', rule: '22.1' });
  });

  it('once she has returned (OCS cleared), normal rules apply again', () => {
    const red = boat('Red', { at: [0, 0], heading: 315, ocs: false, started: false });
    const blue = boat('Blue', { at: [-8, -8], heading: 45 });
    expect(verdict(red, blue, 25)).toEqual({ keepsClear: 'Blue', rule: '10' });
  });

  it('before the start signal, being over the line gives up no rights', () => {
    const red = boat('Red', { at: [0, 0], heading: 315, ocs: true, started: false });
    const blue = boat('Blue', { at: [-8, -8], heading: 45 });
    expect(verdict(red, blue, -10)).toEqual({ keepsClear: 'Blue', rule: '10' });
  });
});

describe('Rule 22.2 · taking a penalty', () => {
  it('a boat doing turns keeps clear of boats that are not', () => {
    const red = boat('Red', { at: [0, 0], heading: 315, penalty: 400 });
    const blue = boat('Blue', { at: [10, 0], heading: 45 });
    expect(verdict(red, blue)).toEqual({ keepsClear: 'Red', rule: '22.2' });
  });
});

describe('Rule 16.1 · changing course', () => {
  //            wind ↓
  //   ← Blue  (windward)
  //   ← Red   (leeward) ...then Red swings up 35° into Blue, and they touch a moment later
  it('a right-of-way boat that suddenly luffs into the keep-clear boat breaks 16.1', () => {
    const red = boat('Red', { at: [0, 0], heading: 270 });
    const blue = boat('Blue', { at: [0, 6], heading: 270 });
    const p = pair(red, blue);
    expect(p.at(30).foul).toBeNull();
    moveTo(red, [-2, 3.5], 305, 270); // was heading 270 three seconds ago, now 305: turned toward Blue
    expect(p.at(31).foul).toEqual({ by: 'Red', rule: '16.1', kind: 'contact', why: null });
  });

  it('a slow, steady luff that gives the windward boat time to respond is fine: windward boat fouls (Rule 11)', () => {
    const red = boat('Red', { at: [0, 0], heading: 270 });
    const blue = boat('Blue', { at: [0, 6], heading: 270 });
    const p = pair(red, blue);
    p.at(30);
    moveTo(red, [-2, 3.5], 305, 298); // only 7° in the last three seconds: Blue had time
    expect(p.at(40).foul).toEqual({ by: 'Blue', rule: '11', kind: 'contact', why: null });
  });

  //            wind ↓
  //      ↖ Blue (S)          Blue "hunts" the port boat: bears away toward Red as Red tries to duck
  //    ↗ Red (P)
  it('starboard boat bears away into a port boat that is ducking her: starboard breaks 16.1', () => {
    const red = boat('Red', { at: [0, 0], heading: 60 }); // port, footing to duck
    const blue = boat('Blue', { at: [3, 3.5], heading: 260, headingAgo: 315 }); // was close-hauled, bore away 55°
    expect(pair(red, blue).at(60).foul).toMatchObject({ by: 'Blue', rule: '16.1' });
  });

  it('turning away from the other boat is not a 16.1 problem (that is avoiding a collision)', () => {
    const red = boat('Red', { at: [0, 0], heading: 45 });
    const blue = boat('Blue', { at: [3, 3], heading: 330, headingAgo: 300 }); // starboard boat turned away
    expect(pair(red, blue).at(60).foul).toMatchObject({ by: 'Red', rule: '10' });
  });
});

describe('Rule 17 · overlapped from astern: no luffing above proper course', () => {
  //  t=60   ← Blue        ← Red          Red clear astern (Rule 12)
  //  t=61   ← Blue
  //          ← Red                       Red overlaps to leeward within two lengths: Rule 11, and Rule 17 restricts Red
  //  t=70   Red luffs above her proper course into Blue
  it('the leeward boat that came from astern may not sail above her proper course', () => {
    const blue = boat('Blue', { at: [0, 0], heading: 270 });
    const red = boat('Red', { at: [10, -4], heading: 270 });
    const p = pair(blue, red);
    expect(p.at(60)).toMatchObject({ keepsClear: 'Red', rule: '12' });
    moveTo(red, [4, -4.5]);
    expect(p.at(61)).toMatchObject({ keepsClear: 'Blue', rule: '11' });
    expect(p.rec.r17).toBe(red.id);
    red.aboveProper = true; moveTo(red, [0.5, -2], 290, 287);
    expect(p.at(70).foul).toEqual({ by: 'Red', rule: '17', kind: 'contact', why: null });
  });

  it('sailing her proper course, the leeward boat keeps her rights: windward boat fouls (Rule 11)', () => {
    const blue = boat('Blue', { at: [0, 0], heading: 270 });
    const red = boat('Red', { at: [10, -4], heading: 270 });
    const p = pair(blue, red);
    p.at(60); moveTo(red, [4, -4.5]); p.at(61);
    moveTo(red, [0.5, -2]); // still on her proper course; Blue drifted down onto her
    expect(p.at(70).foul).toMatchObject({ by: 'Blue', rule: '11' });
  });

  it('an overlap from more than two lengths away to leeward does not bring Rule 17', () => {
    const blue = boat('Blue', { at: [0, 0], heading: 270 });
    const red = boat('Red', { at: [12, -25], heading: 270 });
    const p = pair(blue, red);
    p.at(60); moveTo(red, [4, -24]); p.at(61);
    expect(p.rec.r17).toBeNull();
  });

  it('before the start signal there is no proper course, so Rule 17 cannot bite', () => {
    const blue = boat('Blue', { at: [0, 0], heading: 270, started: false });
    const red = boat('Red', { at: [10, -4], heading: 270, started: false });
    const p = pair(blue, red);
    p.at(-60); moveTo(red, [4, -4.5]); p.at(-59);
    red.aboveProper = true; moveTo(red, [0.5, -2], 290, 287);
    expect(p.at(-50).foul).toMatchObject({ by: 'Blue', rule: '11' });
  });
});

describe('Rule 20 · room to tack at an obstruction', () => {
  //   shore ████████████████
  //        ↖ Red (leeward, close-hauled, about to hit the shore) — hails "Room to tack!"
  //     ↖ Blue (to windward, same tack)
  it('a hailed boat that does not start to tack within 5 s breaks Rule 20', () => {
    const red = boat('Red', { at: [0, 0], heading: 315 }), blue = boat('Blue', { at: [2, 9], heading: 315 }); // ~8 m to windward, overlapped
    const p = pair(red, blue);
    p.at(50);
    p.rec.hail = { by: red.id, at: 50, kind: 'room' };
    expect(p.at(53).foul).toBeNull(); // still time to respond
    expect(p.at(55.5).foul).toEqual({ by: 'Blue', rule: '20', kind: 'hail', why: null });
  });

  it('tacking promptly answers the hail', () => {
    const red = boat('Red', { at: [0, 0], heading: 315 }), blue = boat('Blue', { at: [2, 9], heading: 315 }); // ~8 m to windward, overlapped
    const p = pair(red, blue);
    p.at(50);
    p.rec.hail = { by: red.id, at: 50, kind: 'room' };
    blue.lastTackT = 52; moveTo(blue, [3, 12], 45);
    expect(p.at(56).foul).toBeNull();
    expect(p.rec.hail).toBeNull();
  });
});
