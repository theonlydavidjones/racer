import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { adjust, engage, standby, tack } from '../src/boat/autopilot';
import { applyCommand } from '../src/sim/commands';
import { SLOW_TACK } from '../src/boat/physics';
import { FULL_RUDDER } from '../src/boat/balance';
import { place } from '../src/sim/places';
import { dist, n360, wrap } from '../src/core/math';

const S = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 14, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', ...o });
const run = (w: World, s: number, each?: () => void) => { for (let i = 0; i < s * 60; i++) { w.step(DT); each?.(); } };

describe('the tiller pilot', () => {
  it('Auto holds a compass course on a reach in a seaway, working the tiller no faster than the ram can', () => {
    const w = new World(COURSES[0], S({ sea: 'real' }), 4, { freeSail: true }), u = w.user;
    u.h = n360(w.wind.from + 90); u.v = 2.5; // a beam reach on port tack
    engage(u, w.pilot, 'auto'); const set = w.pilot.course;
    let worst = 0, last = u.tiller, fastest = 0;
    run(w, 120, () => {
      if (w.t > 20) worst = Math.max(worst, Math.abs(wrap(u.h - set)));
      fastest = Math.max(fastest, Math.abs(u.tiller - last) / DT); last = u.tiller;
    });
    expect(worst).toBeLessThan(8);
    expect(fastest).toBeLessThanOrEqual(2 / 4.5 + 1e-9);
  });

  it('AutoTrim learns her standing weather helm, so she holds her course close-hauled in a breeze', () => {
    const w = new World(COURSES[0], S({ windKt: 20, sea: 'flat' }), 5, { freeSail: true }), u = w.user;
    u.h = n360(w.wind.from + 45); u.v = 2.5;
    engage(u, w.pilot, 'auto'); const set = w.pilot.course;
    let err = 0, n = 0;
    run(w, 120, () => { if (w.t > 60) { err += wrap(u.h - set); n++; } });
    expect(Math.abs(err / n)).toBeLessThan(2); // no standing error: the trim carries the helm she needs
  });

  it('Wind holds the apparent wind angle, and Tack puts it on the other side', () => {
    const w = new World(COURSES[0], S({ sea: 'flat' }), 6, { freeSail: true }), u = w.user;
    u.h = n360(w.wind.from + 50); u.v = 2.5;
    run(w, 10);
    engage(u, w.pilot, 'wind'); w.pilot.awa = 30; // wind 30° on the starboard bow... and she's on port tack: she'll come up to it
    w.pilot.awa = u.arel > 0 ? 30 : -30;
    // (the wind gusts and swings a few degrees second to second: the pilot's error is taken over its last 10 s)
    const held = (secs: number) => { let e = 0; for (let i = 0; i < secs; i++) { run(w, 1); e += u.arel - w.pilot.awa; } return Math.abs(e / secs); };
    run(w, 50); expect(held(10)).toBeLessThan(6);
    const before = u.tack;
    tack(u, w.pilot); run(w, 30);
    expect(u.tack).not.toBe(before);
    expect(held(10)).toBeLessThan(8);
  });

  it('the buttons turn the set course; Standby leaves the ram on the tiller pin, holding it, until you lift it off or take the tiller', () => {
    const w = new World(COURSES[0], S(), 7, { freeSail: true }), u = w.user;
    engage(u, w.pilot, 'auto'); const c = w.pilot.course;
    adjust(u, w.pilot, 10); expect(wrap(w.pilot.course - c)).toBeCloseTo(10);
    run(w, 3); standby(w.pilot); const held = w.pilot.ram;
    u.tiller = 0.3; run(w, 1); expect(u.tiller).toBe(held); // (the stopped ram still has it: Raymarine 81402 p.43)
    applyCommand(w, { k: 'pilot', op: 'lift' }); expect(w.pilot.onPin).toBe(false);
    u.tiller = 0.3; run(w, 1); expect(u.tiller).toBe(0.3);
    // your hand on the tiller lifts it off as well
    engage(u, w.pilot, 'auto'); run(w, 1); standby(w.pilot);
    applyCommand(w, { k: 'tiller', v: -0.2 }); expect(w.pilot.onPin).toBe(false); run(w, 1); expect(u.tiller).toBe(-0.2);
  });

  // The bug (Crew Habits, 18 Nov 2026): Wind, close-hauled in 22 kt, a seaway, off Alcatraz, seed 3: Tack pressed with her
  // making barely a knot. She stalled head to wind, gathered sternway, the pilot alarmed to standby with the tiller over,
  // and nothing said the ram still held it there: left alone she circled and crash-gybed for ten minutes. Now Tack warns
  // her too slow (the handbook's AutoTack has no speed check, so it still tacks), the alarm says where the ram holds the
  // tiller, and lifting it off frees it.
  it('Wind tacked too slow in 22 kt: a warning, the alarm says the ram holds the tiller, and lifting it off frees it', () => {
    const w = new World(COURSES[0], S({ windKt: 22, sea: 'real', sailFrom: 'alcatraz' }), 3, { freeSail: true }), u = w.user;
    u.h = n360(w.wind.from + 42); u.v = 2.5;
    engage(u, w.pilot, 'wind'); w.pilot.awa = -30;
    run(w, 300); w.drainEvents();
    expect(u.v).toBeLessThan(SLOW_TACK);
    applyCommand(w, { k: 'pilot', op: 'tack' });
    const toasts = () => w.drainEvents().flatMap(e => e.type === 'toast' ? [e.msg] : []);
    expect(toasts()).toContain('Too slow to tack: bear away for way first.');
    let alarm: string | undefined;
    for (let i = 0; i < 60 && !alarm; i++) { run(w, 1); alarm = toasts().find(m => m.startsWith('Pilot alarm')); }
    expect(alarm).toBeDefined(); expect(w.pilot.mode).toBe('off');
    const ram = w.pilot.ram, deg = Math.round(Math.abs(ram) * FULL_RUDDER);
    expect(deg).toBeGreaterThan(5);
    expect(alarm).toContain(`the ram's still on the tiller pin, holding it ${deg}° to ${ram > 0 ? 'starboard' : 'port'}: take the helm, or lift the pilot off`);
    run(w, 20); expect(u.tiller).toBe(ram); // (held there, as a stopped ram on its pin does)
    applyCommand(w, { k: 'pilot', op: 'lift' });
    applyCommand(w, { k: 'tiller', v: 0 }); run(w, 5); expect(u.tiller).toBe(0); // (free: yours)
  });

  it('Nav beats to a waypoint upwind, tacking on its own call (the layline), and holds her heading when she gets there', () => {
    const w = new World(COURSES[0], S({ sea: 'flat' }), 8, { freeSail: true }), u = w.user;
    const to = place('crissy')!; w.setDest(to.p, to.name);
    engage(u, w.pilot, 'nav');
    let tacks = 0, called = 0, lastTack = u.tack, was: string | null = null;
    for (let i = 0; i < 60 * 60 * 25 && w.arrivedT == null; i++) {
      w.step(DT);
      if (u.tack !== lastTack) { tacks++; lastTack = u.tack; }
      if (w.pilot.goTack && w.pilot.goTack !== was) called++;
      was = w.pilot.goTack;
    }
    expect(w.arrivedT, `still ${Math.round(dist(u, to.p))} m away`).not.toBeNull();
    expect(called).toBeGreaterThanOrEqual(1); // it called a tack itself (not only by finding it could lay the mark)
    expect(tacks).toBeGreaterThanOrEqual(called);
    expect(w.pilot.mode).toBe('auto');
  }, 180_000);

  it('Nav tacks off a lee shore instead of running aground', () => {
    // starboard tack in a westerly heads her for the city shore; the destination is out under the Gate
    const w = new World(COURSES[0], S({ sea: 'flat' }), 3, { freeSail: true }), u = w.user;
    u.h = n360(w.wind.from - 45); u.v = 2.5;
    const to = place('gate')!; w.setDest(to.p, to.name);
    engage(u, w.pilot, 'nav');
    let aground = 0;
    for (let i = 0; i < 60 * 900 && w.arrivedT == null; i++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'toast' && /Aground/.test(e.msg)) aground++; }
    expect(aground).toBe(0);
    expect(w.pilot.mode).not.toBe('off');
  }, 180_000);

  it('Nav allows for the current: in a cross-current she makes good the bearing instead of being set off it', () => {
    const w = new World(COURSES[0], S({ sea: 'flat', current: 'ebb' }), 9, { freeSail: true }), u = w.user;
    const to = place('alcatraz')!; w.setDest(to.p, to.name);
    u.h = 60; u.v = 2.5; engage(u, w.pilot, 'nav');
    const start = { x: u.x, y: u.y }, L = dist(start, to.p), ux = (to.p.x - start.x) / L, uy = (to.p.y - start.y) / L;
    let worst = 0;
    for (let i = 0; i < 60 * 600 && w.arrivedT == null; i++) { w.step(DT); worst = Math.max(worst, Math.abs((u.x - start.x) * uy - (u.y - start.y) * ux)); }
    expect(worst).toBeLessThan(150); // off the straight track, m, over a mile of it
  }, 180_000);
});
