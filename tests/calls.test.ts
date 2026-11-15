import { describe, expect, it } from 'vitest';
import { testBoat, sail, startTack } from './helpers/testBoat';
import { DEFAULT_CREW, newCrew, type CrewSpec } from '../src/boat/crewPhys';
import { CALL_AT, callsTurn } from '../src/boat/calls';
import { beatAngle } from '../src/boat/polar';
import { World, DT } from '../src/sim/world';
import { courseFile } from '../src/courses/registry';
import { DEFAULT_SETTINGS } from '../src/settings';
import { applyCommand } from '../src/sim/commands';
import type { Boat } from '../src/boat/boat';

// The helm's call for a turn and what it does for her crew (boat/calls.ts; the owner, 15 Nov 2026).
const crew = (skill: number): CrewSpec => ({
  helm: { ...DEFAULT_CREW.helm, skill }, crew: DEFAULT_CREW.crew.map(p => ({ ...p, skill }))
});
const held = (b: Boat, h: number) => { b.h = ((h % 360) + 360) % 360; b.turnRate = 0; b.desired = b.h; };

describe('An AI skipper calls a decided turn by their skill (calls.ts callsTurn)', () => {
  it('a skilled skipper nearly always, a novice often not; the same turn the same way every time', () => {
    const share = (skill: number) => { const b = testBoat({ heading: 0, kt: 5, windKt: 10 }); b.crew = newCrew(crew(skill), 'S'); let n = 0; for (let i = 1; i <= 400; i++) if (callsTurn(b, i)) n++; return n / 400; };
    expect(share(1)).toBeGreaterThan(0.93);
    expect(share(0.1)).toBeLessThan(0.5); expect(share(0.1)).toBeGreaterThan(CALL_AT.novice - 0.1);
    expect(share(0.6)).toBeGreaterThan(share(0.1)); expect(share(0.6)).toBeLessThan(share(1));
    const b = testBoat({ heading: 0, kt: 5, windKt: 10 }); b.crew = newCrew(crew(0.5), 'S');
    expect([1, 2, 3, 4, 5].map(i => callsTurn(b, i))).toEqual([1, 2, 3, 4, 5].map(i => callsTurn(b, i)));
  });
});

describe('A tack, called or not (physics.ts jibLetGo, crewPhys.ts readyFor)', () => {
  /** A beat in 12 kt, then a tack: called (the call 2 s before), or sprung on a novice crew. Her speed lost, the jib's
   * time aback, and how soon the crew start across. */
  const tack = (called: boolean, skill: number) => {
    const twa = beatAngle(12), b = testBoat({ heading: 360 - twa, kt: 5, windKt: 12 });
    b.crew = newCrew(crew(skill), 'S');
    sail(b, 60, () => { b.h = 360 - twa; });
    const v0 = b.v; let vMin = v0, aback = 0, moved = Infinity, t0 = NaN;
    if (called) b.callT = 0;
    sail(b, 2, () => { b.h = 360 - twa; });
    if (called) b.callT = 0; // (the helper's clock starts again: the call 2 s before the turn, as the order comes)
    startTack(b);
    const x0 = b.crew!.people[1]!.x;
    sail(b, 25, t => {
      if (called) b.callT = Math.min(b.callT ?? 0, t);
      if (b.tack === 'P' && Number.isNaN(t0)) t0 = t;
      if (!Number.isNaN(t0)) { vMin = Math.min(vMin, b.v); if ((b.jibHold ?? 0) > 0) aback += 1 / 60; if (moved === Infinity && Math.abs(b.crew!.people[1]!.x - x0) > 0.1 && Math.sign(b.crew!.people[1]!.goal?.x ?? x0) !== Math.sign(x0)) moved = t - t0; }
    });
    return { lost: v0 - vMin, aback, moved, tack: b.tack };
  };
  it('called, the crew let the jib fly as it comes across and go at once; a novice crew unwarned hold it aback and go late', () => {
    const c = tack(true, 0.2), u = tack(false, 0.2);
    expect(c.tack).toBe('P'); expect(u.tack).toBe('P');
    expect(c.aback, 'called: let fly at once (s aback)').toBeLessThan(0.4);
    expect(u.aback, 'unwarned: a reaction later').toBeGreaterThan(c.aback + 0.5);
    expect(u.moved, 'unwarned, they start across later').toBeGreaterThan(c.moved);
    expect(u.lost, 'and she loses more way').toBeGreaterThan(c.lost);
  }, 60_000);
  it('an expert crew reads an uncalled tack coming and are as quick as if called', () => {
    const c = tack(true, 0.95), u = tack(false, 0.95);
    expect(u.aback).toBeLessThan(0.4); expect(Math.abs(u.moved - c.moved)).toBeLessThan(0.2);
  }, 60_000);
});

describe('A jibe on an AI boat, called or not (physics.ts gybeMeant, boomStep)', () => {
  // (turned on round through dead downwind, nobody aiming her there first: no turn to read coming)
  const jibe = (called: boolean, skill: number) => {
    const b = testBoat({ heading: 170, kt: 4, windKt: 14 }); b.isUser = false; b.crew = newCrew(crew(skill), 'S');
    sail(b, 30, () => held(b, 170));
    sail(b, 30, t => { if (called) b.callT = t; held(b, 170 + Math.min(50, 2 * t)); }); // (on round, 40° by the lee: past where her main holds, BOOM physics.ts boomStep)
    return b;
  };
  it('called, the crew bring the main across; sprung on them unseen, the wind takes it: a crash jibe', () => {
    expect(jibe(true, 0.2).crashT).toBeUndefined();
    expect(jibe(false, 0.2).crashT).toBeDefined();
  }, 60_000);
});

describe('Your call: "Ready about", the crew get ready, then the helm puts her over (world.ts callTurn)', () => {
  const world = () => {
    const S = { ...DEFAULT_SETTINGS, mode: 'sail' as const, windKt: 12, windKind: 'west' as const, current: 'slack', sea: 'flat' as const, traffic: 0 as const, fleet: 0, opponents: [] };
    const w = new World(courseFile('train'), S, 4242, { freeSail: true }); w.running = true; // (as the page sets it once she's sailing)
    for (let i = 0; i < 60 * 30; i++) w.step(DT);
    w.drainEvents(); return w;
  };
  it('the turn waits for the crew to be ready, a few seconds; called again, she goes at once', () => {
    const w = world(), u = w.user;
    applyCommand(w, { k: 'turn' });
    expect(u.callWait).toBeTruthy(); expect(u.turnTarget ?? null).toBeNull();
    let went = -1; for (let i = 0; i < 60 * 3 && went < 0; i++) { w.step(DT); if (u.turnTarget != null) went = i * DT; }
    expect(went, 'put over once they are ready (a club crew: about 3 s)').toBeGreaterThan(1); expect(went).toBeLessThan(3.5);
    const w2 = world(); applyCommand(w2, { k: 'turn' }); applyCommand(w2, { k: 'turn' });
    expect(w2.user.turnTarget).not.toBeNull(); expect(w2.user.callWait).toBeNull();
  }, 120_000);
  it('a crewmate busy at a job says "Not ready", and the helm waits', () => {
    const w = world(), u = w.user, a = u.crew!.people[2]!;
    const busy = () => { a.job = { line: 'outboard', reach: 0, work: 30, station: null }; }; // (aft at the bracket, both hands on it)
    busy(); applyCommand(w, { k: 'turn' });
    for (let i = 0; i < 60 * 3; i++) { busy(); w.step(DT); }
    expect(u.turnTarget ?? null, 'still waiting').toBeNull();
    expect(u.callWait?.notReady).toBe(true);
    expect(w.drainEvents().some(e => e.type === 'toast' && /Not ready/.test((e as { msg: string }).msg))).toBe(true);
  }, 120_000);
});
