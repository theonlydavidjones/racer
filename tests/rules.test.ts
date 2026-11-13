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

describe('Windward and leeward are sides, not "farther upwind"', () => {
  //            wind ↓
  //     ↖ Red      Red is half a length ahead and 3 m to leeward of Blue, both close-hauled on starboard.
  //        ↖ Blue  Red's centre is farther upwind (she's ahead), but she is on Blue's leeward side.
  it('close-hauled, slightly ahead and to leeward: still the leeward boat', () => {
    const blue = boat('Blue', { at: [0, 0], heading: 315 });
    const red = boat('Red', { at: [-0.707 * 4 - 0.707 * 3, 0.707 * 4 - 0.707 * 3], heading: 315 });
    expect(red.y).toBeGreaterThan(blue.y);
    expect(verdict(red, blue)).toEqual({ keepsClear: 'Blue', rule: '11' });
  });
  it('same on port tack', () => {
    const blue = boat('Blue', { at: [0, 0], heading: 45 });
    const red = boat('Red', { at: [0.707 * 4 + 0.707 * 3, 0.707 * 4 - 0.707 * 3], heading: 45 });
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

describe('Rule 13 · both boats tacking at once', () => {
  it('the one on the other\'s port side keeps clear', () => {
    const red = boat('Red', { at: [0, 0], heading: 0, tacking: true, lastTackT: 9.5 });
    const blue = boat('Blue', { at: [6, 0], heading: 0, tacking: true, lastTackT: 9.5 }); // Red is on Blue's port side
    expect(verdict(red, blue)).toEqual({ keepsClear: 'Red', rule: '13' });
  });
  it('the one astern keeps clear', () => {
    const red = boat('Red', { at: [0, -12], heading: 0, tacking: true, lastTackT: 9.5 });
    const blue = boat('Blue', { at: [1, 0], heading: 0, tacking: true, lastTackT: 9.5 });
    expect(verdict(red, blue)).toEqual({ keepsClear: 'Red', rule: '13' });
  });
});

describe('Rule 18.2(a) · mark-room at the zone', () => {
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
    expect(p.at(101)).toMatchObject({ keepsClear: 'Red', rule: '18.2(a)' });
    expect(p.rec.mark).toMatchObject({ overlapped: true, inside: blue.id });
  });

  it('outside boat squeezes the inside boat at the mark: outside boat is penalized', () => {
    const blue = boat('Blue', { at: [3, 26], heading: 190 });
    const red = boat('Red', { at: [9, 24.5], heading: 190 });
    const p = pair(blue, red, [mark]);
    p.at(100);
    moveTo(blue, [2.5, 21]); moveTo(red, [8.5, 19.5]); p.at(101);
    moveTo(blue, [2, 12]); moveTo(red, [4, 11]);
    expect(p.at(104).foul).toMatchObject({ by: 'Red', rule: '18.2(a)', kind: 'contact' });
  });

  //      Blue ↙              Blue reaches the zone clear ahead...
  //            Red ↙         ...Red, clear astern, overlaps inside later: no room for Red
  it('clear ahead at the zone: boat clear astern gives mark-room, even if she later gets inside', () => {
    const blue = boat('Blue', { at: [6, 22], heading: 190 });
    const red = boat('Red', { at: [9, 30.5], heading: 190 });
    const p = pair(blue, red, [mark]);
    expect(p.at(100)).toMatchObject({ keepsClear: 'Red', rule: '18.2(a)' });
    expect(p.rec.mark).toMatchObject({ overlapped: false, ahead: blue.id });
    moveTo(blue, [5, 16]); moveTo(red, [2, 17]); // Red now inside and overlapped
    expect(p.at(102)).toMatchObject({ keepsClear: 'Red', rule: '18.2(a)' });
  });

  it('18.2(b): mark-room ends when the entitled boat leaves the zone', () => {
    const blue = boat('Blue', { at: [3, 26], heading: 190 });
    const red = boat('Red', { at: [9, 24.5], heading: 190 });
    const p = pair(blue, red, [mark]);
    p.at(100);
    moveTo(blue, [2.5, 21]); moveTo(red, [8.5, 19.5]);
    expect(p.at(101).rule).toBe('18.2(a)');
    moveTo(blue, [2.5, 28]); moveTo(red, [8.5, 26]); // both sailed back out of the zone (still on the same leg)
    expect(p.at(105)).toMatchObject({ keepsClear: 'Blue', rule: '11' });
  });

  it('18.2(b): mark-room ends when the entitled boat passes head to wind', () => {
    const blue = boat('Blue', { at: [3, 26], heading: 190 });
    const red = boat('Red', { at: [9, 24.5], heading: 190 });
    const p = pair(blue, red, [mark]);
    p.at(100);
    moveTo(blue, [2.5, 21]); moveTo(red, [8.5, 19.5]);
    p.at(101);
    blue.lastTackT = 101.5; blue.headToWindT = 101.5; blue.tacking = false;
    expect(p.at(102).rule).not.toBe('18.2(a)');
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

});

describe('Rule 18.1(a) · opposite tacks at a windward mark', () => {
  const mark: RulesMark = { name: 'Windward mark', p: { x: 0, y: 0 }, type: 'round', beat: true, side: 'p' };
  it('no mark-room between boats on opposite tacks on a beat: port/starboard (Rule 10) still decides', () => {
    const blue = boat('Blue', { at: [12, -10], heading: 315 }); // starboard, fetching
    const red = boat('Red', { at: [-6, -12], heading: 45 }); // port, nearer the mark
    const p = pair(blue, red, [mark]);
    expect(p.at(100)).toMatchObject({ keepsClear: 'Red', rule: '10' });
    expect(p.rec.mark).toBeNull();
  });
});

describe('Rule 18.3 · tacking in the zone', () => {
  // Windward mark at the origin, to be left to port. The starboard layline runs down to the right (SE).
  //            wind ↓
  //              ● mark
  //               ╲          Blue ↖ on starboard, fetching the mark (just above the layline)
  //        Red ↗   ╲  ↖      Red comes in on port, tacks onto starboard inside the zone,
  //                  Blue      ahead and just to leeward of Blue
  const mark: RulesMark = { name: 'Windward mark', p: { x: 0, y: 0 }, type: 'round', beat: true, side: 'p' };
  const blueAt: [number, number] = [14, -12];
  const ahead = (d: number, l: number): [number, number] => [blueAt[0] - 0.707 * d - 0.707 * l, blueAt[1] + 0.707 * d - 0.707 * l]; // d along Blue's heading, l to leeward

  const scene = (opt: { markSide?: 's' | 'p'; blue?: [number, number]; redAt?: [number, number] } = {}) => {
    const mk = { ...mark, side: opt.markSide ?? 'p' };
    const blue = boat('Blue', { at: opt.blue ?? blueAt, heading: 315 });
    const redAt = opt.redAt ?? ahead(4, 5);
    const red = boat('Red', { at: redAt, heading: 8 }); // on port, nearly head to wind
    const p = pair(blue, red, [mk]);
    expect(p.at(100).foul).toBeNull(); // Red on port, Blue on starboard
    // Red passes head to wind at 100.8
    red.tacking = true; red.tack = 'S'; red.lastTackT = 100.8; red.headToWindT = 100.8; moveTo(red, redAt, 0);
    const mid = p.at(101);
    red.tacking = false; moveTo(red, redAt, 315);
    return { blue, red, p, mid };
  };

  it('a boat that tacks from port to starboard in the zone, under the bow of a boat fetching the mark, must keep clear', () => {
    const { red, p, mid } = scene();
    expect(Math.hypot(red.x, red.y)).toBeLessThan(ZONE);
    expect(mid).toMatchObject({ keepsClear: 'Red', rule: '13' }); // while she is tacking
    expect(p.rec.r183).toMatchObject({ tacker: red.id });
    expect(p.at(103)).toMatchObject({ keepsClear: 'Red', rule: '18.3' }); // though she is now the leeward boat
  });

  it('Blue, fetching, need not sail above close-hauled: contact is Red\'s foul under 18.3', () => {
    const { blue, p } = scene();
    p.at(103);
    moveTo(blue, ahead(4, 3.6)); // Blue holds her course and closes on Red's windward side
    expect(p.at(104).foul).toMatchObject({ by: 'Red', rule: '18.3', kind: 'contact' });
  });

  it('Blue forced to luff above close-hauled to avoid her counts too', () => {
    const { p } = scene();
    expect(p.at(103, { swerve: true }).foul).toMatchObject({ by: 'Red', rule: '18.3', kind: 'swerve' });
  });

  it('tacking outside the zone is plain Rule 11 (after Rule 15 gives Blue time to respond)', () => {
    const far = (k: number): [number, number] => [blueAt[0] * k, blueAt[1] * k];
    const blue = boat('Blue', { at: far(2.2), heading: 315 });
    const redAt: [number, number] = [far(2.2)[0] - 2.83 - 3.54, far(2.2)[1] + 2.83 - 3.54];
    const red = boat('Red', { at: redAt, heading: 45 });
    const p = pair(blue, red, [mark]);
    p.at(100);
    red.tacking = true; red.tack = 'S'; red.lastTackT = 100.8; red.headToWindT = 100.8; moveTo(red, redAt, 0); p.at(101);
    red.tacking = false; moveTo(red, redAt, 315);
    expect(p.rec.r183).toBeNull();
    expect(p.at(110)).toMatchObject({ keepsClear: 'Blue', rule: '11' });
  });

  it('if Blue tacked onto starboard inside the zone herself, 18.2 is off but Red owes her nothing extra under 18.3', () => {
    const { blue, red, p } = (() => {
      const blue = boat('Blue', { at: blueAt, heading: 45 }); // Blue enters the zone on port...
      const redAt = ahead(4, 5), red = boat('Red', { at: redAt, heading: 8 });
      const p = pair(blue, red, [mark]);
      p.at(99);
      moveTo(blue, blueAt, 315); blue.lastTackT = 99.5; blue.headToWindT = 99.5; // ...then tacks onto starboard, fetching
      p.at(100);
      red.tacking = true; red.tack = 'S'; red.lastTackT = 100.8; red.headToWindT = 100.8; moveTo(red, redAt, 0); p.at(101);
      red.tacking = false; moveTo(red, redAt, 315);
      return { blue, red, p };
    })();
    expect(p.rec.r183).toMatchObject({ tacker: red.id, binds: false });
    expect(p.at(110)).toMatchObject({ keepsClear: 'Blue', rule: '11' }); // plain windward/leeward
    void blue;
  });

  it('a mark to be left to starboard: no 18.3', () => {
    const { p } = scene({ markSide: 's' });
    expect(p.rec.r183).toBeNull();
  });

  it('only against a boat fetching the mark: Blue below the layline (she would have to tack) gets no 18.3 protection', () => {
    const lowBlue: [number, number] = [6, -16]; // below the starboard layline: can't lay the mark on starboard
    const { p, red } = scene({ blue: lowBlue, redAt: [lowBlue[0] - 6.37, lowBlue[1] - 0.71] });
    expect(Math.hypot(red.x, red.y)).toBeLessThan(ZONE);
    expect(p.rec.r183).toBeNull();
  });
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

describe('Rule 21.1 · returning after being over early', () => {
  //            wind ↓
  //    line · · · · · · · · · ·
  //        Red ↙ (OCS, dipping back on starboard)     Blue ↗ (port, started properly)
  it('a boat returning to start keeps clear, even on starboard', () => {
    const red = boat('Red', { at: [0, 0], heading: 225, ocs: true, started: false });
    const blue = boat('Blue', { at: [-8, -8], heading: 45 });
    expect(verdict(red, blue, 10)).toEqual({ keepsClear: 'Red', rule: '21.1' });
  });

  it('once she has returned (OCS cleared), normal rules apply again', () => {
    const red = boat('Red', { at: [0, 0], heading: 315, ocs: false, started: false });
    const blue = boat('Blue', { at: [-8, -8], heading: 45 });
    expect(verdict(red, blue, 25)).toEqual({ keepsClear: 'Blue', rule: '10' });
  });

  it('21.1 covers any boat sailing back to start, not only one over early: round an end, or above the line at the gun', () => {
    const red = boat('Red', { at: [0, 0], heading: 225, started: false }); red.returning = true; // not OCS, coming back on starboard
    const blue = boat('Blue', { at: [-8, -8], heading: 45 });
    expect(verdict(red, blue, 30)).toEqual({ keepsClear: 'Red', rule: '21.1' });
  });

  it('over early but sailing on, away from the line, she keeps her rights until she turns back (21.1: "sailing towards")', () => {
    const red = boat('Red', { at: [0, 0], heading: 315, ocs: true, started: false }); red.returning = false;
    const blue = boat('Blue', { at: [-8, -8], heading: 45 });
    expect(verdict(red, blue, 10)).toEqual({ keepsClear: 'Blue', rule: '10' });
  });

  it('Rule 15: back below the line, she has right of way again, but must first give the other boat room to keep clear', () => {
    const red = boat('Red', { at: [6, 6], heading: 225, started: false }); red.returning = true; // starboard, coming back
    const blue = boat('Blue', { at: [-8, -8], heading: 45 }); // port, started
    const p = pair(red, blue);
    expect(p.at(30)).toMatchObject({ keepsClear: 'Red', rule: '21.1' });
    red.returning = false; // her hull is now below the line
    expect(p.at(30.5)).toMatchObject({ keepsClear: 'Blue', rule: '10' });
    moveTo(red, [-2.5, -2.5], 225); moveTo(blue, [-3.5, -3.5], 45);
    expect(p.at(31.5).foul).toMatchObject({ by: 'Red', rule: '15', why: 'rule21' });
  });

  it('before the start signal, being over the line gives up no rights', () => {
    const red = boat('Red', { at: [0, 0], heading: 315, ocs: true, started: false });
    const blue = boat('Blue', { at: [-8, -8], heading: 45 });
    expect(verdict(red, blue, -10)).toEqual({ keepsClear: 'Blue', rule: '10' });
  });
});

describe('Rule 21.2 · taking a penalty', () => {
  it('a boat doing turns keeps clear of boats that are not', () => {
    const red = boat('Red', { at: [0, 0], heading: 315, penalty: 400 });
    const blue = boat('Blue', { at: [10, 0], heading: 45 });
    expect(verdict(red, blue)).toEqual({ keepsClear: 'Red', rule: '21.2' });
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
  it('on a beat, a starboard boat that bears away onto a port boat ducking her breaks 16.2', () => {
    const red = boat('Red', { at: [0, 0], heading: 60 }); // port, footing to duck
    const blue = boat('Blue', { at: [3, 3.5], heading: 260, headingAgo: 315 }); // was close-hauled, bore away 55°
    expect(pair(red, blue).at(60).foul).toMatchObject({ by: 'Blue', rule: '16.2' });
  });

  it('a starboard boat on a reach that turns toward a port boat breaks 16.1 (16.2 is only for beats)', () => {
    const red = boat('Red', { at: [0, 0], heading: 100 }); // port, broad reach
    const blue = boat('Blue', { at: [3, 2], heading: 220, headingAgo: 270 }); // starboard, was beam reaching, bore away toward Red
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

  it('replying "You tack" answers the hail: no Rule 20 breach after 5 s', () => {
    const red = boat('Red', { at: [0, 0], heading: 315 }), blue = boat('Blue', { at: [-6, 13], heading: 315 }); // Blue clear ahead, to windward
    const p = pair(red, blue);
    p.at(50);
    p.rec.hail = { by: red.id, at: 50, kind: 'room', replyAt: 50.5 };
    expect(p.at(54)).toMatchObject({ keepsClear: 'Blue', rule: '20', foul: null }); // Blue now gives Red room to tack and avoid her
    red.tacking = true; red.lastTackT = 54.5; red.headToWindT = 54.5; moveTo(red, [0, 0], 0);
    expect(p.at(56).foul).toBeNull();
  });

  it('20.2(d): once the hailed boat responds, the hailing boat must tack as soon as possible', () => {
    const red = boat('Red', { at: [0, 0], heading: 315 }), blue = boat('Blue', { at: [-6, 13], heading: 315 });
    const p = pair(red, blue);
    p.at(50);
    p.rec.hail = { by: red.id, at: 50, kind: 'room', replyAt: 50.5 };
    expect(p.at(55).foul).toBeNull();
    expect(p.at(56).foul).toEqual({ by: 'Red', rule: '20', kind: 'hail', why: null }); // Red never tacked
  });

  it('after "You tack", the boat that replied must give room: contact is her foul', () => {
    const red = boat('Red', { at: [0, 0], heading: 315 }), blue = boat('Blue', { at: [-6, 13], heading: 315 });
    const p = pair(red, blue);
    p.at(50);
    p.rec.hail = { by: red.id, at: 50, kind: 'room', replyAt: 50.5 };
    red.lastTackT = 51; red.headToWindT = 51; moveTo(red, [-3, 9], 45); // Red tacks onto port, toward Blue's stern
    moveTo(blue, [-4.5, 10.5], 315); // Blue slowed down and is still in the way
    expect(p.at(53).foul).toMatchObject({ by: 'Blue', rule: '20', kind: 'contact' });
  });

  it('the "You tack" obligation ends once the hailing boat has tacked and got going', () => {
    const red = boat('Red', { at: [0, 0], heading: 315 }), blue = boat('Blue', { at: [-6, 13], heading: 315 });
    const p = pair(red, blue);
    p.at(50);
    p.rec.hail = { by: red.id, at: 50, kind: 'room', replyAt: 50.5 };
    red.lastTackT = 51; red.headToWindT = 51; moveTo(red, [6, 4], 45);
    p.at(58);
    expect(p.rec.hail).toBeNull();
    expect(p.at(59).rule).toBe('10');
  });

  it('tacking promptly answers the hail', () => {
    const red = boat('Red', { at: [0, 0], heading: 315 }), blue = boat('Blue', { at: [2, 9], heading: 315 }); // ~8 m to windward, overlapped
    const p = pair(red, blue);
    p.at(50);
    p.rec.hail = { by: red.id, at: 50, kind: 'room' };
    blue.lastTackT = 52; blue.headToWindT = 52; moveTo(blue, [3, 12], 45);
    expect(p.at(53).foul).toBeNull(); // Blue responded at 52-53
    red.lastTackT = 54; red.headToWindT = 54; moveTo(red, [-1, 2], 45); // and Red tacks as soon as possible (20.2(d))
    expect(p.at(56).foul).toBeNull();
    expect(p.at(59).foul).toBeNull();
    expect(p.rec.hail).toBeNull();
  });
});
