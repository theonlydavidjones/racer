import { describe, expect, it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import train from '../src/courses/data/training-windward-return.json';
import type { CourseFile } from '../src/courses/course';
import { buildCourse } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { V, brg } from '../src/core/math';
import { onLand, shoreDist } from '../src/geo/shore';
import { inBasin } from '../src/geo/marina';

const SS2 = ss2 as unknown as CourseFile, TRAIN = train as unknown as CourseFile;
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', ...o });

describe('courses load from JSON', () => {
  it('Seaweed Soup course 2: seven legs, X is a pass mark, line is an obstruction', () => {
    const C = buildCourse(SS2, { bias: 0, fleet: 3 });
    expect(C.marks.map(m => `${m.key}${m.type === 'pass' ? '(pass)' : ''}:${m.side}`)).toEqual(
      ['A:s', 'X(pass):s', '6:s', 'X(pass):p', 'A:s', 'X(pass):s', '6:s']);
    expect(C.obstruction).toBe(true);
    expect(C.pinKind).toBe('mark');
    expect(C.lineLen).toBeGreaterThan(200); // GGYC flagpole to X
    // first leg (to A) is a beat into the westerly; leg to 6 is downwind
    expect(C.marks[0].beat).toBe(true);
    expect(C.marks[2].beat).toBe(false);
  });

  it('training course: line length grows with the fleet and the bias rotates it', () => {
    const a = buildCourse(TRAIN, { bias: 0, fleet: 1 }), b = buildCourse(TRAIN, { bias: 8, fleet: 5 });
    expect(b.lineLen - a.lineLen).toBeCloseTo(14 * 4, 6);
    expect(brg(b.L.x, b.L.y) - brg(a.L.x, a.L.y)).toBeCloseTo(8, 6);
  });
});

describe('fixed timestep is reproducible', () => {
  it('same seed and inputs give the same race', () => {
    const run = () => {
      const w = new World(SS2, settings({ fleet: 5 }), 1234);
      for (let i = 0; i < 60 * 240; i++) w.step(DT); // 4 minutes: through the start
      return JSON.stringify(w.boats.map(b => [b.x, b.y, b.h, b.v, b.leg, b.ocs, b.started, b.penalty]));
    };
    expect(run()).toEqual(run());
  }, 30_000);
});

describe('start line: OCS and Rule 21.1 return (through the real sim)', () => {
  const place = (w: World, d: number, heading: number) => {
    const u = w.user;
    u.x = w.center.x + w.N.x * d; u.y = w.center.y + w.N.y * d; u.h = heading; u.v = 0; u.prevD = null; u.luff = true;
  };

  it('over the line at the gun → OCS; dip back below → cleared; cross again → started', () => {
    const w = new World(TRAIN, settings({ fleet: 0, current: 'slack', seq: 2 }), 1);
    const toCourse = brg(w.N.x, w.N.y);
    w.t = -0.5; place(w, 6, toCourse);
    for (let i = 0; i < 60; i++) w.step(DT);
    expect(w.user.ocs).toBe(true);
    expect(w.drainEvents().some(e => e.type === 'toast' && /Over early/.test(e.msg))).toBe(true);

    place(w, -12, toCourse); w.step(DT); w.step(DT); // first step after a teleport only records the line distance
    expect(w.user.ocs).toBe(false);
    expect(w.user.started).toBe(false);

    place(w, -4.5, toCourse); w.user.v = 2; w.user.luff = false;
    for (let i = 0; i < 120 && !w.user.started; i++) w.step(DT);
    expect(w.user.started).toBe(true);
    expect(w.startReport).not.toBeNull();
  });

  it('Rule 21.1: after the gun, not started and on the course side, sailing back toward the line she is returning; sailing away she is not', () => {
    const w = new World(TRAIN, settings({ fleet: 0, current: 'slack', seq: 2 }), 1);
    const toCourse = brg(w.N.x, w.N.y);
    w.t = 30; place(w, 15, toCourse + 180); w.user.v = 2; w.user.luff = false; // above the line, heading back down to it
    w.step(DT); w.step(DT);
    expect(w.user.started).toBe(false);
    expect(w.user.returning).toBe(true);
    const w2 = new World(TRAIN, settings({ fleet: 0, current: 'slack', seq: 2 }), 1);
    w2.t = 30; place(w2, 15, toCourse); w2.user.v = 2; w2.user.luff = false; w2.step(DT); w2.step(DT); // above it, sailing away
    expect(w2.user.returning).toBe(false);
    place(w, -10, toCourse + 180); w.user.v = 2; w.step(DT); // hull completely below the line: done
    expect(w.user.returning).toBe(false);
  });

  it('Rule 21.1 holds once she is coming back: slowing or luffing on the way gives her no rights back; sailing away for 2 s does', () => {
    const w = new World(TRAIN, settings({ fleet: 0, current: 'slack', seq: 2 }), 1);
    const toCourse = brg(w.N.x, w.N.y), u = w.user;
    w.t = 30; place(w, 20, toCourse + 180); u.v = 2; u.luff = false;
    w.step(DT); w.step(DT);
    expect(u.returning).toBe(true);
    u.h = toCourse + 95; u.v = 0.1; w.step(DT); // luffed head to wind, nearly stopped, still above the line
    expect(u.returning).toBe(true);
    u.h = toCourse; u.v = 2;
    for (let i = 0; i < 60; i++) { u.h = toCourse; u.v = 2; w.step(DT); } // a second sailing away: still latched
    expect(u.returning).toBe(true);
    for (let i = 0; i < 90; i++) { u.h = toCourse; u.v = 2; w.step(DT); } // clearly away for over 2 s: released
    expect(u.returning).toBe(false);
  });

  it('Rule 21.1 with the I flag (30.1): sailing along the line to round an end, she is returning', () => {
    const w = new World(TRAIN, settings({ fleet: 0, current: 'slack', seq: 2 }), 1);
    const u = w.user, toPin = brg(w.C.pin.x - w.center.x, w.C.pin.y - w.center.y);
    w.t = 30; place(w, 6, toPin); u.v = 2; u.luff = false; u.ocs = true; u.roundEnd = true;
    w.step(DT); w.step(DT);
    expect(u.returning).toBe(true);
  });

  it('Definitions, Start: dipping only her bow below the line after the gun and coming back up is not a start; whole hull below, then across, is', () => {
    const w = new World(TRAIN, settings({ fleet: 0, current: 'slack', seq: 2 }), 1);
    const toCourse = brg(w.N.x, w.N.y), u = w.user;
    // (moves her without forgetting where she was, so the line crossing is seen; her centre is half a length behind her bow)
    const to = (dBow: number, down = false) => { const k = down ? 1 : -1; u.x = w.center.x + w.N.x * (dBow + k * 3.8); u.y = w.center.y + w.N.y * (dBow + k * 3.8); u.h = down ? toCourse + 180 : toCourse; u.v = 0; u.luff = true; w.step(DT); };
    w.t = 30; place(w, 6, toCourse); w.step(DT); // on the course side after the gun (not OCS: she wasn't there at the gun)
    to(2, true); to(-1, true); to(2); // heading down, her bow dips just below (stern still above); she turns and comes up again
    expect(u.started).toBe(false);
    to(-1); to(-6); to(-1); to(2); // whole hull below, then across
    expect(u.started).toBe(true);
  });

  it('at the gun: bow below but stern still over is OCS (rule 29.1, "any part of her hull"); whole hull below, then across, starts', () => {
    const w = new World(TRAIN, settings({ fleet: 0, current: 'slack', seq: 2 }), 1);
    const toCourse = brg(w.N.x, w.N.y), u = w.user;
    // heading down to the line, bow 1 m below it and stern 6.6 m above, at the gun
    w.t = -0.5; u.x = w.center.x + w.N.x * 2.8; u.y = w.center.y + w.N.y * 2.8; u.h = toCourse + 180; u.v = 0; u.luff = true; u.prevD = null;
    for (let i = 0; i < 60; i++) w.step(DT);
    expect(u.ocs).toBe(true);
    const w2 = new World(TRAIN, settings({ fleet: 0, current: 'slack', seq: 2 }), 1), u2 = w2.user;
    w2.t = -0.5; u2.x = w2.center.x - w2.N.x * 4.8; u2.y = w2.center.y - w2.N.y * 4.8; u2.h = toCourse; u2.v = 0; u2.luff = true; u2.prevD = null; // bow 1 m below
    for (let i = 0; i < 60; i++) w2.step(DT);
    expect(u2.ocs).toBe(false);
    u2.x += w2.N.x * 3; u2.y += w2.N.y * 3; w2.step(DT); // across
    expect(u2.started).toBe(true);
  });

  it('behind the line at the gun → not OCS', () => {
    const w = new World(TRAIN, settings({ fleet: 0, current: 'slack', seq: 2 }), 1);
    w.t = -0.5; place(w, -20, brg(w.N.x, w.N.y));
    for (let i = 0; i < 60; i++) w.step(DT);
    expect(w.user.ocs).toBe(false);
  });
});

describe('laylines and course description', () => {
  it('before the start, laylines point at the first mark (a beat) and straddle the wind', async () => {
    const { laylinesFor } = await import('../src/sim/laylines');
    const w = new World(SS2, settings({ fleet: 0, current: 'slack' }), 3);
    w.step(DT);
    const L = laylinesFor(w, w.user)!;
    expect(L.kind).toBe('up');
    expect(L.mark.key).toBe('A');
    // tracks arriving at an upwind mark head into the wind, one each side of it
    const into = (g: { x: number; y: number }) => brg(g.x, g.y);
    const off = L.tracks.map(g => ((into(g) - w.user.ww.from + 540) % 360) - 180);
    expect(off[0]).toBeLessThan(-35); expect(off[1]).toBeGreaterThan(35);
  });

  it('on the run to 6 the laylines are downwind ones', async () => {
    const { laylinesFor } = await import('../src/sim/laylines');
    const w = new World(SS2, settings({ fleet: 0, current: 'slack' }), 3);
    w.step(DT); w.user.started = true; w.user.leg = 2;
    expect(laylinesFor(w, w.user)!.kind).toBe('down');
  });

  it('describes how to sail every leg', async () => {
    const { legDescriptions } = await import('../src/ui/courseView');
    const w = new World(SS2, settings({ fleet: 0 }), 3);
    const legs = legDescriptions(w);
    expect(legs).toHaveLength(8);
    expect(legs[0]).toBe('Start → A: beat (upwind). Round A leaving it to starboard (clockwise).');
    expect(legs[1]).toBe("A → X: run (downwind). Pass X leaving it to starboard. Don't round it.");
    expect(legs[3]).toContain('Pass X leaving it to port');
    expect(legs[7]).toBe('6 → Finish: cross the line between GGYC flagpole and X.');
  });
});

describe('start practice debrief', () => {
  const drill = async (d: number, speedKt: number) => {
    const { startDebrief } = await import('../src/sim/startDebrief');
    const w = new World(TRAIN, settings({ mode: 'drill', fleet: 0, current: 'slack' }), 5, { startAt: 60 });
    const u = w.user, toCourse = brg(w.N.x, w.N.y);
    w.t = -0.2;
    u.x = w.center.x + w.N.x * d - w.L.x * w.lineLen * 0.3; u.y = w.center.y + w.N.y * d - w.L.y * w.lineLen * 0.3;
    u.h = toCourse; u.v = speedKt * 0.5144; u.prevD = null;
    for (let i = 0; i < 60 * 3; i++) w.step(DT);
    return { w, r: startDebrief(w) };
  };

  it('starts at one minute to go in practice mode', () => {
    const w = new World(TRAIN, settings({ mode: 'drill' }), 5, { startAt: 60 });
    expect(w.t).toBe(-60);
  });

  it('on the line at full speed: great start', async () => {
    const { r, w } = await drill(-4.5, 4.6);
    expect(w.gun).not.toBeNull();
    expect(r.grade).toBe('great');
    expect(r.facts[0]).toMatch(/behind the line/);
  });

  it('over the line at the gun: OCS, with advice about the last 10 seconds', async () => {
    const { r } = await drill(2, 4.5);
    expect(r.grade).toBe('ocs');
    expect(r.tips.join(' ')).toMatch(/one boat length behind the line/);
  });

  it('four lengths back: late, with how many seconds to turn earlier', async () => {
    const { r } = await drill(-35, 4.5);
    expect(r.grade).toBe('late');
    expect(r.tips[0]).toMatch(/s late/);
  });

  it('on the line but crawling: slow', async () => {
    const { r } = await drill(-5, 1.2); // centre 5 m back: bow ~1 m behind the line
    expect(r.grade).toBe('slow');
  });
});

describe('hails at the Cityfront shore (Rule 20)', () => {
  const setup = () => {
    const w = new World(SS2, settings({ fleet: 1, current: 'slack' }), 4);
    w.t = 30; for (const b of w.boats) { b.started = true; b.ocs = false; b.leg = 0; }
    w.step(DT);
    const red = w.boats[1], u = w.user, from = w.wind.from;
    // a spot about 30 m off the beach where the starboard close-hauled course runs straight at it
    const h = (from - 41 + 360) % 360, wv = V(from), hv = V(h);
    let p = { x: 0, y: 0 };
    // (along the Marina Green seawall, east of the harbor: a straight stretch the starboard course meets squarely)
    search: for (let x = 100; x < 1200; x += 10) for (let y = -900; y < 100; y += 4) {
      const q = { x, y }, hit = { x: x + hv.x * 30, y: y + hv.y * 30 };
      if (!onLand(q) && shoreDist(q) > 22 && onLand(hit) && !inBasin(q) && !inBasin(hit)) { p = q; break search; } // the open beach, not West Harbor's docks
    }
    Object.assign(red, { x: p.x, y: p.y, h, v: 2.4, desired: h, tack: 'S' as const, lastTackT: w.t - 3 }); // just tacked onto starboard toward the shore
    Object.assign(u, { x: p.x + wv.x * 9, y: p.y + wv.y * 9, h, v: 2.4, tack: 'S' as const, lastTackT: -999, turnTarget: null });
    w.pairs = {};
    return { w, red, u };
  };

  it('a boat pinned against the shore hails you; ignore it and you foul Rule 20', () => {
    const { w, red, u } = setup();
    let hailed = false, foul: string | null = null;
    for (let i = 0; i < 60 * 12 && !foul; i++) {
      w.step(DT);

      if (w.pairRecord(u, red)?.hail?.by === red.id) hailed = true;
      for (const e of w.drainEvents()) if (e.type === 'incident') foul = e.incident.rule;
    }
    expect(hailed).toBe(true);
    expect(foul).toBe('20');
  });

  it('tack when hailed and there is no foul', async () => {
    const { tackTarget } = await import('../src/boat/physics');
    const { w, red, u } = setup();
    let foul: string | null = null, tacked = false;
    for (let i = 0; i < 60 * 12 && !foul; i++) {
      w.step(DT);
      if (!tacked && w.pairRecord(u, red)?.hail) { const t = tackTarget(u); u.turnDir = t.dir; u.turnTarget = t.target; tacked = true; }
      for (const e of w.drainEvents()) if (e.type === 'incident') foul = e.incident.rule;
    }
    expect(tacked).toBe(true);
    expect(foul).toBeNull();
  });
});

describe('Rule 31 · touching a mark', () => {
  it('sailing into the next mark costs a one-turn penalty, once per touch', () => {
    const w = new World(SS2, settings({ fleet: 0, current: 'slack' }), 7);
    w.t = 30; const u = w.user; u.started = true; u.ocs = false; u.leg = 0;
    const m = w.C.marks[0], h = w.wind.from + 180; // run straight down onto the mark from upwind
    const back = { x: Math.sin(w.wind.from * Math.PI / 180), y: Math.cos(w.wind.from * Math.PI / 180) };
    Object.assign(u, { x: m.p.x + back.x * 12, y: m.p.y + back.y * 12, h: h % 360, v: 2, desired: h % 360 });
    let toasts = '';
    for (let i = 0; i < 60 * 8; i++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'toast') toasts += e.msg; }
    expect(toasts).toContain('Rule 31');
    expect(u.penaltyTotal).toBe(360);
    expect(w.fouls).toBe(1);
  });

  it('marks of other legs don\'t count', () => {
    const w = new World(SS2, settings({ fleet: 0, current: 'slack' }), 7);
    const u = w.user; u.started = true; u.leg = 0;
    const names = w.touchableMarks(u).map(t => t.name);
    expect(names).toContain(w.C.marks[0].name);
    expect(names).not.toContain(w.C.marks[2].name);
  });
});

describe('"You tack" (Rule 20.2(c))', () => {
  it('an AI boat clear ahead replies "You tack" to your hail instead of tacking', () => {
    const w = new World(SS2, settings({ fleet: 1, current: 'slack' }), 4);
    w.t = 30; for (const b of w.boats) { b.started = true; b.ocs = false; b.leg = 0; }
    w.step(DT);
    const red = w.boats[1], u = w.user, from = w.wind.from, h = (from - 41 + 360) % 360, wv = V(from), hv = V(h);
    Object.assign(u, { x: 0, y: 0, h, tack: 'S' as const, lastTackT: -999 });
    Object.assign(red, { x: hv.x * 16 + wv.x * 5, y: hv.y * 16 + wv.y * 5, h, tack: 'S' as const, lastTackT: -999 }); // two lengths ahead, a little to windward
    w.pairs = {};
    expect(w.hail(u, red, 'room')).toBe(true);
    expect(w.pairRecord(u, red)?.hail?.replyAt).toBe(w.t);
    // she now owes you room to tack and pass astern of her, but right of way doesn't pass with it (WS Case 101): you're clear astern
    expect(w.rights(u, red)).toMatchObject({ kc: u, rule: '12' });
  });

  it('an AI boat beside you tacks instead', () => {
    const w = new World(SS2, settings({ fleet: 1, current: 'slack' }), 4);
    w.t = 30; for (const b of w.boats) { b.started = true; b.ocs = false; b.leg = 0; }
    w.step(DT);
    const red = w.boats[1], u = w.user, from = w.wind.from, h = (from - 41 + 360) % 360, wv = V(from);
    Object.assign(u, { x: 0, y: 0, h, tack: 'S' as const, lastTackT: -999 });
    Object.assign(red, { x: wv.x * 8, y: wv.y * 8, h, tack: 'S' as const, lastTackT: -999 });
    w.pairs = {};
    w.hail(u, red, 'room');
    expect(w.pairRecord(u, red)?.hail?.replyAt).toBeUndefined();
  });

  it('when an AI boat hails you, H replies "You tack"', () => {
    const w = new World(SS2, settings({ fleet: 1, current: 'slack' }), 4);
    w.t = 30; for (const b of w.boats) { b.started = true; b.ocs = false; b.leg = 0; }
    w.step(DT);
    const red = w.boats[1], u = w.user;
    u.lastTackT = -999; w.pairs = {};
    w.hail(red, u, 'room');
    w.userHail();
    expect(w.pairRecord(u, red)?.hail?.replyAt).toBe(w.t);
    // (you owe Red room to tack and avoid you: an obligation judged at an incident, not right of way, WS Case 101)
    expect(w.rights(u, red).rule).not.toBe('20');
  });
});

describe('The committee boat (Rule 31) and penalties in one incident (Rule 44.1(a))', () => {
  it('touching the committee boat before starting is a one-turn penalty, and she bounces off', () => {
    const w = new World(TRAIN, settings({ fleet: 0, current: 'slack' }), 3);
    const u = w.user, cb = w.committeeHull!;
    w.t = w.sequence.find(s => s.name === 'Preparatory signal')!.t + 10; // (racing: after her preparatory signal)
    expect(w.touchableMarks(u).map(m => m.name)).toContain('the committee boat');
    // sail straight at the middle of its side
    const side = V(w.C.base + 90), c = w.C.committee, h = brg(-side.x, -side.y);
    Object.assign(u, { x: c.x + side.x * 9, y: c.y + side.y * 9, h, v: 2, desired: h });
    let toasts = '';
    for (let i = 0; i < 60 * 6; i++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'toast') toasts += e.msg; }
    expect(toasts).toContain('committee boat');
    expect(u.penaltyTotal).toBe(360);
    // she never ends up inside its hull
    const a = cb.p, b2 = cb.q!, ax = b2.x - a.x, ay = b2.y - a.y, k = Math.max(0, Math.min(1, ((u.x - a.x) * ax + (u.y - a.y) * ay) / (ax * ax + ay * ay)));
    expect(Math.hypot(u.x - (a.x + ax * k), u.y - (a.y + ay * k))).toBeGreaterThan(2);
  });

  it('rule 31 is "while racing": touching the committee boat before the preparatory signal costs nothing (she still bounces off)', () => {
    const w = new World(TRAIN, settings({ fleet: 0, current: 'slack' }), 3);
    const u = w.user, prep = w.sequence.find(s => s.name === 'Preparatory signal')!.t;
    w.t = prep - 30;
    const side = V(w.C.base + 90), c = w.C.committee, h = brg(-side.x, -side.y);
    Object.assign(u, { x: c.x + side.x * 9, y: c.y + side.y * 9, h, v: 2, desired: h });
    let toasts = '';
    for (let i = 0; i < 60 * 6; i++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'toast') toasts += e.msg; }
    expect(w.t).toBeLessThan(prep);
    expect(toasts).toContain("aren't racing");
    expect(u.penaltyTotal).toBe(0);
  });

  it('a mark touch after an unrelated foul elsewhere, however soon, is a new incident: a one-turn penalty (Rule 31; Appeal 65)', () => {
    const w = new World(SS2, settings({ fleet: 0, current: 'slack' }), 7);
    w.t = 30; const u = w.user; u.started = true; u.ocs = false; u.leg = 0;
    const m = w.C.marks[0], h = w.wind.from + 180, back = V(w.wind.from);
    Object.assign(u, { x: m.p.x + back.x * 12, y: m.p.y + back.y * 12, h: h % 360, v: 2, desired: h % 360 });
    (w as unknown as { lastFoul: Map<number, unknown> }).lastFoul.set(u.id, { t: w.t, x: u.x + 60, y: u.y + 60, vs: -1 }); // a foul 85 m away, a moment ago
    for (let i = 0; i < 60 * 6; i++) { w.step(DT); w.drainEvents(); }
    expect(u.penaltyTotal).toBe(360);
  });

  it('a mark touch in the same incident as a Part 2 foul costs no extra turn (Rule 44.1(a))', () => {
    const w = new World(SS2, settings({ fleet: 0, current: 'slack' }), 7);
    w.t = 30; const u = w.user; u.started = true; u.ocs = false; u.leg = 0;
    const m = w.C.marks[0], h = w.wind.from + 180, back = V(w.wind.from);
    Object.assign(u, { x: m.p.x + back.x * 12, y: m.p.y + back.y * 12, h: h % 360, v: 2, desired: h % 360 });
    (w as unknown as { lastFoul: Map<number, unknown> }).lastFoul.set(u.id, { t: w.t, x: u.x, y: u.y, vs: -1 }); // she has just fouled a boat, here at the mark
    let toasts = '';
    for (let i = 0; i < 60 * 6; i++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'toast') toasts += e.msg; }
    expect(toasts).toContain('44.1(a)');
    expect(u.penaltyTotal).toBe(0);
  });
});

describe('Exoneration (Rule 43.1(a))', () => {
  //            wind ↓
  //    Zed ↗ (port) forces Fox (starboard) to swerve...
  //    Fox ↖  ...into Vic, overlapped to leeward of her: Fox is exonerated, Zed takes the penalty
  it('a boat compelled to foul by another boat\'s foul is exonerated', () => {
    const w = new World(SS2, settings({ fleet: 2, current: 'slack' }), 5);
    w.t = 60;
    const [vic, fox, zed] = w.boats, from = w.wind.from, stb = (from - 45 + 360) % 360, port = (from + 45) % 360;
    const up = V(from), right = V(from + 90), at = (a: number, b: number) => ({ x: 200 * right.x + a * right.x + b * up.x, y: 200 * right.y + a * right.y + b * up.y });
    for (const b of w.boats) Object.assign(b, { started: true, ocs: false, leg: 0, penalty: 0, lastTackT: -999, tacking: false });
    Object.assign(vic, { ...at(0, 0), h: stb, tack: 'S', v: 2 });
    Object.assign(fox, { ...at(1.2, 1.5), h: stb, tack: 'S', v: 2 }); // to windward of Vic, overlapped, touching
    Object.assign(zed, { ...at(14, 10), h: port, tack: 'P', v: 2 }); // port boat Fox had to swerve to avoid
    for (const b of w.boats) { const u = V(b.h); b.vx = u.x * b.v; b.vy = u.y * b.v; }
    fox.forced14 = zed.id;
    const incidents: { fouler: number; rule: string; ex?: number }[] = [];
    (w as unknown as { checkPairs(): void }).checkPairs();
    for (const e of w.drainEvents()) if (e.type === 'incident') incidents.push({ fouler: e.incident.fouler.id, rule: e.incident.rule, ex: e.incident.exoneratedBy });
    const foxOnVic = incidents.find(i => i.fouler === fox.id);
    expect(foxOnVic).toMatchObject({ rule: '11', ex: zed.id });
    expect(zed.penaltyTotal).toBeGreaterThan(0); // Zed (port, an AI boat) takes the penalty for the cross
    expect(fox.penalty).toBe(0); // Fox doesn't
  });

  it('not compelled once she is clear of the boat that fouled her: the later foul is her own (Appeal 2)', () => {
    const w = new World(SS2, settings({ fleet: 2, current: 'slack' }), 5);
    w.t = 60;
    const [vic, fox, zed] = w.boats, from = w.wind.from, stb = (from - 45 + 360) % 360, port = (from + 45) % 360;
    const up = V(from), right = V(from + 90), at = (a: number, b: number) => ({ x: 200 * right.x + a * right.x + b * up.x, y: 200 * right.y + a * right.y + b * up.y });
    for (const b of w.boats) Object.assign(b, { started: true, ocs: false, leg: 0, penalty: 0, lastTackT: -999, tacking: false });
    Object.assign(vic, { ...at(0, 0), h: stb, tack: 'S', v: 2 });
    Object.assign(fox, { ...at(1.2, 1.5), h: stb, tack: 'S', v: 2 }); // to windward of Vic, overlapped, touching
    Object.assign(zed, { ...at(14, 10), h: port, tack: 'P', v: 2 });
    for (const b of w.boats) { const u = V(b.h); b.vx = u.x * b.v; b.vy = u.y * b.v; }
    fox.forced14 = zed.id; Object.assign(fox, at(9, 1.5)); // (Fox clear of Vic for now)
    (w as unknown as { checkPairs(): void }).checkPairs(); w.drainEvents(); // Zed fouls Fox (the swerve)
    // a second later Zed is long gone, and Fox, free to keep clear, touches Vic: the old 3 s window would have excused her
    w.t += 1; fox.forced14 = null; Object.assign(zed, at(60, 40)); Object.assign(fox, at(1.2, 1.5));
    const incidents: { fouler: number; rule: string; ex?: number }[] = [];
    (w as unknown as { checkPairs(): void }).checkPairs();
    for (const e of w.drainEvents()) if (e.type === 'incident') incidents.push({ fouler: e.incident.fouler.id, rule: e.incident.rule, ex: e.incident.exoneratedBy });
    expect(incidents.find(i => i.fouler === fox.id)).toMatchObject({ rule: '11', ex: undefined });
  });
});
