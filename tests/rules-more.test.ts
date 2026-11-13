import { describe, expect, it } from 'vitest';
import type { RulesContext, RulesMark } from '../src/rules';
import { boat, moveTo, pair, verdict } from './diagram';

/* Every diagram: wind from the top of the page (north). x = metres east, y = metres north. */

describe('Rule 21.3 · backing a sail', () => {
  it('a boat moving astern by backing a sail keeps clear, even on starboard', () => {
    const red = boat('Red', { at: [0, 0], heading: 315, backing: true }); // starboard, but going backwards
    const blue = boat('Blue', { at: [20, 0], heading: 45 }); // port
    expect(verdict(red, blue)).toEqual({ keepsClear: 'Red', rule: '21.3' });
  });
});

describe('Rule 18.2(c) and (d) · mark-room after 18.2(a) has ended', () => {
  // Leeward mark at the origin, approached on a run; next mark off to the east.
  const mark: RulesMark = { name: 'Leeward mark', p: { x: 0, y: 0 }, type: 'round', beat: false };

  /** Blue reaches the zone clear ahead (18.2(a): Red gives her room), then passes head to wind, ending it (18.2(b)). */
  function setup() {
    const blue = boat('Blue', { at: [6, 22], heading: 190 });
    const red = boat('Red', { at: [9, 30.5], heading: 190 });
    const p = pair(blue, red, [mark]);
    expect(p.at(100).rule).toBe('18.2(a)');
    blue.lastTackT = 100.5; blue.headToWindT = 100.5; // Blue passes head to wind: 18.2(a) no longer applies
    moveTo(blue, [6, 20]); moveTo(red, [8, 28]);
    expect(p.at(101)).toMatchObject({ keepsClear: 'Red', rule: '12' }); // not overlapped: the basic rules
    return { blue, red, p };
  }

  //      Blue ↙  Red ↙         Red gets an inside overlap from astern with plenty of room
  //          ● mark
  it('18.2(c): an inside overlap gets mark-room from the outside boat', () => {
    const { blue, red, p } = setup();
    moveTo(blue, [6, 16]); moveTo(red, [1.5, 15.5]); // Red overlapped, nearer the mark
    expect(p.at(102)).toMatchObject({ keepsClear: 'Blue', rule: '18.2(c)' });
  });

  //   Blue right at the mark; Red pushes in from astern where there's no room
  it('18.2(d): no mark-room for an overlap from astern that the outside boat could never have given', () => {
    const { blue, red, p } = setup();
    moveTo(blue, [3.5, 4]); moveTo(red, [2, 14]); expect(p.at(103).rule).toBe('12'); // Red still clear astern, Blue at the mark
    moveTo(red, [1, 4.5]); // Red's bow now inside Blue, between her and the mark: no room
    expect(p.at(104).rule).not.toBe('18.2(c)');
  });
});

describe('Rule 18.2(d) · an overlap obtained by tacking, not by gybing', () => {
  //   Red ↙ (gybes) ... Blue ↙        Red changes tack and the overlap begins at once
  function overlapAfter(passedHeadToWind: boolean) {
    const blue = boat('Blue', { at: [0, 0], heading: 190 });
    const red = boat('Red', { at: [-6, 20], heading: 190 });
    const p = pair(blue, red);
    p.at(100);
    red.lastTackT = 100.5; if (passedHeadToWind) red.headToWindT = 100.5;
    moveTo(red, [-6, 1]); // now overlapped
    p.at(101);
    return { red, p };
  }
  it('a gybe that brings an overlap does not make her the tacking boat', () => {
    const { p } = overlapAfter(false);
    expect(p.rec.ovStart).toMatchObject({ tacker: null });
  });
  it('a tack that brings an overlap does', () => {
    const { red, p } = overlapAfter(true);
    expect(p.rec.ovStart).toMatchObject({ tacker: red.id });
  });
});

describe('Rule 18.4 · gybing in the zone', () => {
  // Leeward mark at the origin; the next leg is a reach to the east-north-east (port tack), so a boat on starboard
  // must gybe at the mark.
  const marks: RulesMark[] = [
    { name: 'Leeward mark', p: { x: 0, y: 0 }, type: 'round', beat: false },
    { name: 'Reach mark', p: { x: 200, y: 100 }, type: 'round', beat: false }
  ];
  //        Blue ↙ Red ↙          Blue inside on starboard; must gybe at the mark to head for the reach mark
  //           ● mark
  //        Blue ↓                ...but sails straight on past it, taking Red with her
  it('the inside boat sails on past the mark instead of gybing, taking the outside boat wide: she breaks 18.4', () => {
    const blue = boat('Blue', { at: [-1, 25], heading: 190 });
    const red = boat('Red', { at: [5, 26], heading: 190 });
    const p = pair(blue, red, marks);
    p.at(100);
    moveTo(blue, [-1, 20]); moveTo(red, [5, 21]);
    expect(p.at(101)).toMatchObject({ keepsClear: 'Red', rule: '18.2(a)' });
    moveTo(blue, [-4, -10]); moveTo(red, [-2.2, -9]); // well past the mark, still on starboard, sailing away from it
    expect(p.at(106).foul).toMatchObject({ by: 'Blue', rule: '18.4', kind: 'contact' });
  });
});

describe('Rule 19 · room to pass an obstruction', () => {
  // The shore to the north: land above y = 20 (to windward). A continuing obstruction.
  const shore: Partial<RulesContext> = { obstacle: p => (p.y > -10 ? { d: 20 - p.y, n: { x: 0, y: -1 }, continuing: true } : null) };

  //   ~~~~~~~~~~~ shore ~~~~~~~~~~~
  //   Blue →        (inside, 4 m off, windward)
  //   Red ↗         (outside, leeward) luffs toward Blue and the shore
  it('19.2(b): the outside boat squeezes the inside boat toward the shore: outside boat is penalized', () => {
    const blue = boat('Blue', { at: [0, 16], heading: 90 }); // port beam reach, windward
    const red = boat('Red', { at: [0, 11.5], heading: 90 });
    const p = pair(blue, red, [], shore);
    expect(p.at(10)).toMatchObject({ keepsClear: 'Blue', rule: '11' }); // the basic rule still applies
    moveTo(red, [2, 13.8], 50, 60); moveTo(blue, [2.5, 16]); // Red heads up, closing on Blue toward the shore
    expect(p.at(11).foul).toMatchObject({ by: 'Red', rule: '19', kind: 'contact', part: '19.2(b)' });
  });

  it('the inside boat still keeps clear in other ways: bearing down onto the outside boat is her foul', () => {
    const blue = boat('Blue', { at: [0, 16], heading: 90 });
    const red = boat('Red', { at: [0, 11.5], heading: 90 });
    const p = pair(blue, red, [], shore);
    p.at(10);
    moveTo(blue, [2, 13.8], 130); moveTo(red, [2.5, 11.5]); // Blue bears away into Red
    expect(p.at(11).foul).toMatchObject({ by: 'Blue', rule: '11' });
  });

  //   ~~~~~~~~~~~ shore ~~~~~~~~~~~
  //       Blue →  (3 m off)
  //   Red →       (clear astern, then forces in between Blue and the shore: no room there)
  it('19.2(c): a boat from clear astern pushing in where there is no room is not entitled to room, and keeps clear', () => {
    const blue = boat('Blue', { at: [10, 17], heading: 90 }); // only 3 m off the shore
    const red = boat('Red', { at: [0, 18.6], heading: 90 }); // clear astern, closer in
    const p = pair(blue, red, [], shore);
    expect(p.at(10)).toMatchObject({ keepsClear: 'Red', rule: '12' });
    moveTo(red, [9, 18.6]); moveTo(blue, [11, 17]); // overlapped, inside
    expect(p.at(11).foul).toMatchObject({ by: 'Red', rule: '19', part: '19.2(c)' });
  });
});

describe('Rule 23 · interfering with another boat', () => {
  //   Blue (port, leg 3) ↗        Red (starboard, leg 1) bears off toward her to block her
  it('23.2: going out of your way to hinder a boat on another leg breaks 23, though you have right of way', () => {
    const red = boat('Red', { at: [0, -8], heading: 320, leg: 1 });
    const blue = boat('Blue', { at: [-8, -6], heading: 45, leg: 3 });
    const p = pair(red, blue);
    p.at(50);
    moveTo(red, [0, 0], 350, 320); moveTo(blue, [-0.5, 2.5]); // Red luffs toward Blue, who was crossing ahead
    red.aboveProper = true; // (luffed above close-hauled: off her proper course, as the World judges it)
    expect(p.at(52).foul).toMatchObject({ by: 'Red', rule: '23', part: '23.2' });
  });

  it('16.1 after the start: a right-of-way boat turning onto a boat taking a penalty, or returning to start, gives her no room: her foul', () => {
    for (const kind of ['penalty', 'returning'] as const) {
      const red = boat('Red', { at: [0, -8], heading: 320 });
      const blue = boat('Blue', { at: [-8, -6], heading: 45, ...(kind === 'penalty' ? { penalty: 1 } : { started: false }) });
      if (kind === 'returning') blue.returning = true;
      const p = pair(red, blue);
      p.at(50);
      moveTo(red, [0, 0], 350, 320); moveTo(blue, [-0.5, 2.5]); // Red turns onto Blue, on her proper course (not above it)
      expect(p.at(52).foul, kind).toMatchObject({ by: 'Red', rule: '16.1' });
    }
  });

  it('23.2 after the start: turning toward a boat on another leg while on her proper course (rounding her mark) is not 23.2', () => {
    // Red, rounding her mark, turns onto her new course; Blue, on another leg, is there and must keep clear (port)
    const red = boat('Red', { at: [0, -8], heading: 270, leg: 2 });
    const blue = boat('Blue', { at: [-8, -6], heading: 45, leg: 1 });
    const p = pair(red, blue);
    p.at(50);
    moveTo(red, [0, 0], 320, 270); moveTo(blue, [-0.5, 2.5]); // her rounding turn, on her proper course (not above it)
    expect(p.at(52).foul?.rule).not.toBe('23');
  });

  it('23.2 doesn\'t stop a boat sailing her proper course: the port boat on the other leg must still keep clear', () => {
    const red = boat('Red', { at: [0, 0], heading: 315, leg: 1 });
    const blue = boat('Blue', { at: [-3, 3], heading: 45, leg: 3 });
    expect(pair(red, blue).at(50).foul).toMatchObject({ by: 'Blue', rule: '10' });
  });

  it('23.1: a boat that has finished (not racing) mustn\'t interfere with one still racing', () => {
    const red = boat('Red', { at: [0, 0], heading: 45, finished: true }); // port, finished
    const blue = boat('Blue', { at: [3, 3], heading: 315 }); // starboard, racing
    expect(pair(red, blue).at(300).foul).toMatchObject({ by: 'Red', rule: '23', part: '23.1' });
  });

  it('23.1: a boat that has retired is no longer racing either: she mustn\'t interfere with one still racing', () => {
    const red = boat('Red', { at: [0, 0], heading: 45, retired: true }); // port, retired (heading home)
    const blue = boat('Blue', { at: [3, 3], heading: 315 }); // starboard, racing
    expect(pair(red, blue).at(300).foul).toMatchObject({ by: 'Red', rule: '23', part: '23.1' });
    // (Part 2 still applies between them (its preamble: boats that are racing or have been racing): a boat racing on port
    // keeps clear of a retired one on starboard, as of a finished one)
    const r1 = boat('Red', { at: [0, 0], heading: 315, retired: true }), b1 = boat('Blue', { at: [-3, 3], heading: 45 });
    expect(pair(r1, b1).at(300).foul).toMatchObject({ by: 'Blue', rule: '10' });
    const r2 = boat('Red', { at: [0, 0], heading: 45, retired: true }), b2 = boat('Blue', { at: [3, 3], heading: 315, finished: true });
    expect(pair(r2, b2).at(300).foul).toBeNull(); // (neither racing: no penalties between them)
  });

  it('two boats that have both finished: no penalties', () => {
    const red = boat('Red', { at: [0, 0], heading: 45, finished: true });
    const blue = boat('Blue', { at: [3, 3], heading: 315, finished: true });
    expect(pair(red, blue).at(300).foul).toBeNull();
  });
});

describe("the rules judge each boat in the wind she's in", () => {
  it('Fetching (Definitions): the same boat in the same place fetches the mark or not by her own wind, not the course\'s', async () => {
    const { fetching } = await import('../src/rules/pairs');
    // a mark 200 m away, bearing 315° from her on starboard, the course's wind from 0°, close-hauled 42°: she lays it
    const b = { id: 1, x: 0, y: 0, h: 318, vx: 0, vy: 0, tack: 'S' as const, tacking: false, lastTackT: -99, penalty: 0, ocs: false, started: true, leg: 0 };
    const mk = { p: { x: -200 * Math.sin(45 * Math.PI / 180), y: 200 * Math.cos(45 * Math.PI / 180) } } as never;
    const ctx = { t: 10, windFrom: 0, marks: [], beat: 42 } as never;
    expect(fetching(b, mk, ctx)).toBe(true);
    // where she is, the wind has backed 8°: she's headed, and no longer lays it on this tack
    expect(fetching({ ...b, ww: { from: 352 } }, mk, ctx)).toBe(false);
  });
});
