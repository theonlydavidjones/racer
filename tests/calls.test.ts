import { describe, expect, it } from 'vitest';
import { testBoat, sail, startTack } from './helpers/testBoat';
import { DEFAULT_CREW, Z, newCrew, placeCrew, type CrewSpec } from '../src/boat/crewPhys';
import { AI_WAIT_MAX, CALL_AT, HAIL_WAIT, aiCrewReady, boomStrike, callsTurn, decideTurn } from '../src/boat/calls';
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
  // (turned on round through dead downwind at `rate` deg/s to 60° past it, her heading set by hand: no turn the crew see)
  // (the middle crew on the mainsheet: a helm on it needs no warning of their own turn, mainHandReady; crewWork.ts mainHand)
  const jibe = (called: boolean, skill: number, rate: number) => {
    const b = testBoat({ heading: 170, kt: 4, windKt: 14 }); b.isUser = false;
    b.crew = newCrew({ helm: { ...DEFAULT_CREW.helm, skill: Math.min(skill, 0.3) }, crew: DEFAULT_CREW.crew.map(p => ({ ...p, skill: Math.max(skill, 0.35) })) }, 'S');
    sail(b, 30, () => held(b, 170));
    let byLee = NaN, across = NaN;
    sail(b, 30, t => { if (called) b.callT = t; held(b, 170 + Math.min(60, rate * t));
      if (b.byLee && Number.isNaN(byLee)) byLee = t; if (b.tack === 'S' && Number.isNaN(across)) across = t; });
    return { crashed: b.crashT != null, tack: b.tack, late: across - byLee };
  };
  it('called, the crew bring the main across as her stern passes the wind', () => {
    const c = jibe(true, 0.2, 2); expect(c.crashed).toBe(false); expect(c.tack).toBe('S'); expect(c.late).toBeLessThan(0.5);
  }, 60_000);
  it('uncalled, a novice crew finish getting ready by the lee, then bring it across: late, but jibed', () => {
    const u = jibe(false, 0.2, 2);
    expect(u.crashed).toBe(false); expect(u.tack, 'jibed').toBe('S');
    expect(u.late, 'some seconds by the lee first').toBeGreaterThan(3); expect(u.late).toBeLessThan(7);
  }, 60_000);
  it('uncalled and swung hard through it, the wind takes the boom before a novice crew can: a crash jibe', () => {
    expect(jibe(false, 0.2, 14).crashed).toBe(true);
    expect(jibe(true, 0.2, 14).crashed).toBe(false);
  }, 60_000);
});

describe('The turn seen coming, without a call (physics.ts crewAndHeel comingFor)', () => {
  // (a tack by hand: her helm put over and held, the tiller, as the keys do, nobody calling it)
  const handTack = (skill: number) => {
    const twa = beatAngle(12), b = testBoat({ heading: 360 - twa, kt: 5, windKt: 12 }); b.crew = newCrew(crew(skill), 'S');
    sail(b, 60, () => { b.h = 360 - twa; });
    let held = 0, cueMax = 0; (b as Boat & { handsOff?: boolean }).handsOff = true; b.tiller = -0.8;
    sail(b, 12, () => { if ((b.jibHold ?? 0) > 0) held += 1 / 60; cueMax = Math.max(cueMax, b.comingFor ?? 0); if (b.tack === 'P' && Math.abs(b.twa - beatAngle(12)) < 8) b.tiller = 0; });
    return { held, cueMax, tack: b.tack };
  };
  it('an expert crew see a tack by hand coming and are ready; a novice is caught', () => {
    const e = handTack(0.95), n = handTack(0.2);
    expect(e.tack).toBe('P'); expect(n.tack).toBe('P');
    expect(e.held, 'expert: the jib let fly at once').toBe(0);
    expect(n.held, 'novice: held aback a while').toBeGreaterThan(0.5);
    expect(e.cueMax, 'never more than CUE_MAX').toBeLessThanOrEqual(6);
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

describe('A crash jibe and the crew in its way (calls.ts boomStrike)', () => {
  /** An AI boat on a run, jibed on round unseen and uncalled, one crewmate held at `pose` (the cabin top's lines, or the
   * bench). Who was struck, and for how long. */
  const strike = (pose: 'piano' | 'sit', called: boolean) => {
    const b = testBoat({ heading: 170, kt: 4, windKt: 14 }); b.isUser = false; b.crew = newCrew({ helm: { ...DEFAULT_CREW.helm, skill: 0.3 }, crew: DEFAULT_CREW.crew.map(p => ({ ...p, skill: 0.35 })) }, 'S'); // (the middle crew on the main, slow)
    sail(b, 30, () => held(b, 170));
    // (at the cabin top's lines on a job, standing at its after end; or on the bench, as the crew sit)
    const a = b.crew!.people[2]!, put = () => { if (pose === 'piano') a.job = { line: 'cunningham', reach: 0, work: 5, station: { arm: 0.3, z: 0.85, pose: 'piano' } }; };
    let struck = false, outFor = 0;
    sail(b, 30, t => { if (called) b.callT = t; if (!struck) put(); held(b, 170 + Math.min(60, 14 * t)); if (!struck && a.outUntil > 0) { struck = true; outFor = a.outUntil - (b.crew!.clock ?? 0); } });
    return { struck, outFor, crashed: b.crashT != null };
  };
  it('standing at the cabin top\'s lines, unwarned: struck, and out of action for a while; ducked in time, or ready, not', () => {
    // (the boom seen swinging at t = 0, across at `t`: a novice standing at the cabin top's after end, under the boom)
    const at = (t: number, ready = false, pose: 'piano' | 'sit' | 'cross' = 'piano') => {
      const b = testBoat({ heading: 170, kt: 4, windKt: 14 }); b.isUser = false; b.crew = newCrew(crew(0.2), 'S');
      const a = b.crew!.people[2]!; a.pose = pose; a.x = 0.3; a.z = 0.85; a.ready = ready; b.boomSeenT = 0;
      boomStrike(b, t, -95); return a.outUntil - (b.crew!.clock ?? 0);
    };
    expect(at(1), 'across a second after it was seen: struck').toBeGreaterThan(19);
    expect(at(1)).toBeLessThan(61);
    expect(at(3), 'three seconds: a novice has ducked').toBeLessThanOrEqual(0);
    expect(at(1, true), 'ready for it (called)').toBeLessThanOrEqual(0);
    expect(at(1, false, 'sit'), 'sitting: it passes over').toBeLessThanOrEqual(0);
    expect(at(1, false, 'cross'), 'crouched crossing: under it').toBeLessThanOrEqual(0);
  });
  it('a crash jibe on the water: the crew sitting in the cockpit, the boom passes over their heads; a called jibe crashes nobody', () => {
    const s = strike('sit', false); expect(s.crashed).toBe(true); expect(s.struck).toBe(false);
    const c = strike('sit', true); expect(c.crashed).toBe(false); expect(c.struck).toBe(false);
  }, 60_000);
});

describe('Called, then put about by hand; a tack back in the hold; a turn decided once (review round 1)', () => {
  it('you call, then tack her yourself before they\'re ready: the call is dropped, not a second tack back', () => {
    const S = { ...DEFAULT_SETTINGS, mode: 'sail' as const, windKt: 12, windKind: 'west' as const, current: 'slack', sea: 'flat' as const, traffic: 0 as const, fleet: 0, opponents: [], crew: { n: 2, helm: { ...DEFAULT_CREW.helm, skill: 0.1 }, people: DEFAULT_CREW.crew.map(p => ({ ...p, skill: 0.1 })) } };
    const w = new World(courseFile('train'), S as never, 4242, { freeSail: true }); w.running = true;
    for (let i = 0; i < 60 * 30; i++) w.step(DT);
    const u = w.user, t0 = u.tack;
    applyCommand(w, { k: 'turn' }); expect(u.callWait).toBeTruthy();
    u.steer = u.tack === 'S' ? 1 : -1; // (a steering key held: up into the wind and through)
    for (let i = 0; i < 60 * 8 && u.tack === t0; i++) w.step(DT);
    u.steer = 0;
    expect(u.tack).not.toBe(t0); expect(u.callWait ?? null).toBeNull();
    for (let i = 0; i < 60 * 10; i++) w.step(DT);
    expect(u.tack, 'not tacked back').not.toBe(t0); expect(u.turnTarget ?? null).toBeNull();
  }, 120_000);
  it('back through the wind while the old sheet is still fast: the jib fills on it again, not held aback on the new tack', () => {
    const twa = beatAngle(12), b = testBoat({ heading: 360 - twa, kt: 5, windKt: 12 }); b.crew = newCrew(crew(0.1), 'S');
    sail(b, 60, () => { b.h = 360 - twa; });
    startTack(b); let backT = NaN;
    sail(b, 20, t => { if (b.tack === 'P' && Number.isNaN(backT) && (b.jibHold ?? 0) > 0) { backT = t; startTack(b); } });
    expect(Number.isNaN(backT), 'held aback on the first tack').toBe(false);
    expect(b.tack).toBe('S'); expect(b.jibHold ?? 0).toBeLessThanOrEqual(0); expect(b.ctl.jibsheetW).toBeGreaterThan(0.9);
  }, 60_000);
  it('a turn decided is decided once, called or not: no second draw on the next think', () => {
    const b = testBoat({ heading: 0, kt: 5, windKt: 10 }); b.crew = newCrew(crew(0.3), 'S');
    for (let k = 0; k < 50; k++) decideTurn(b, k * 0.05);
    expect(b.turnsDecided).toBe(1);
    decideTurn(b, 20); expect(b.turnsDecided, 'still the same turn, not yet made').toBe(1);
    b.lastTackT = 21; decideTurn(b, 22); expect(b.turnsDecided, 'made: the next is a new one').toBe(2);
  });
});

describe('Review round 2: sailing alone, a tap of the key, the helm on the main', () => {
  it('sailing alone, a tack by hand is your own: no jib held aback, no word about a crew', () => {
    const twa = beatAngle(12), b = testBoat({ heading: 360 - twa, kt: 5, windKt: 12 }); b.crew = newCrew({ helm: { ...DEFAULT_CREW.helm, skill: 0.2 }, crew: [] }, 'S');
    sail(b, 60, () => { b.h = 360 - twa; });
    startTack(b); let held = 0; sail(b, 15, () => { if ((b.jibHold ?? 0) > 0) held++; });
    expect(b.tack).toBe('P'); expect(held).toBe(0);
  }, 60_000);
  it('a tap of a steering key while the crew get ready doesn\'t drop your call', () => {
    const S = { ...DEFAULT_SETTINGS, mode: 'sail' as const, windKt: 12, windKind: 'west' as const, current: 'slack', sea: 'flat' as const, traffic: 0 as const, fleet: 0, opponents: [] };
    const w = new World(courseFile('train'), S, 4242, { freeSail: true }); w.running = true;
    for (let i = 0; i < 60 * 30; i++) w.step(DT);
    const u = w.user; applyCommand(w, { k: 'turn' });
    for (let i = 0; i < 30; i++) w.step(DT);
    u.steer = 1; for (let i = 0; i < 6; i++) w.step(DT); u.steer = 0; // (a tenth of a second)
    let went = false; for (let i = 0; i < 60 * 5 && !went; i++) { w.step(DT); went = u.turnTarget != null; }
    expect(went).toBe(true);
  }, 120_000);
});

describe('An AI boat waits for her crew on a called turn, as your helm does (the owner, 16 Nov 2026: calls.ts aiCrewReady)', () => {
  const ready = (skill: number, after: number, most?: number) => {
    const b = testBoat({ heading: 0, kt: 5, windKt: 12 }); b.isUser = false; b.crew = newCrew(crew(skill), 'S');
    b.decidedT = 10; b.callT = 10; return aiCrewReady(b, 10 + after, most);
  };
  it('an expert crew is ready in about a second, a novice in four or five; never more than AI_WAIT_MAX; a hail\'s tack HAIL_WAIT', () => {
    expect(ready(0.95, 0.5)).toBe(false); expect(ready(0.95, 1.2)).toBe(true);
    expect(ready(0.2, 3)).toBe(false); expect(ready(0.2, 5)).toBe(true);
    expect(ready(0, 5.5), 'the slowest, 5.6 s').toBe(false); expect(ready(0, AI_WAIT_MAX)).toBe(true);
    expect(ready(0.2, HAIL_WAIT, HAIL_WAIT), 'within rule 20.2\'s time').toBe(true);
  });
});

describe('Through a roll tack the crew forward of the winch keep their seats (crewPhys.ts placeCrew: the roll\'s targets)', () => {
  // (placeCrew driven directly, the reproduction from Deep Physics' review: both crew forward of the winch, the front hand
  // away at the jib car when she tacks and the job ending at the tack, two seconds slow near head to wind, then sailing.
  // Held fore and aft where she stood, short of any seat, the roll's hold put her at the middle hand's seat and the
  // spacing sent him aft and back)
  it('on each tack, the middle hand\'s seat (Z.deckFwd) is his throughout, and the front hand makes for hers', () => {
    for (const first of ['S', 'P'] as const) {
      const c = newCrew(JSON.parse(JSON.stringify(DEFAULT_CREW)) as CrewSpec, first), other = first === 'S' ? 'P' : 'S';
      const k = (tack: 'S' | 'P', twa: number) => ({ need: 300, twa, tws: 6, v: 1.1, pole: false, tack, windward: tack === 'S' ? 1 : -1, beat: 45, heel: 3, bestHeel: 6, rmPerDeg: 250 });
      const step = (tack: 'S' | 'P', twa: number, job: boolean) => {
        c.fore01 = 1;
        c.people[2]!.job = job ? { line: 'car', reach: 0, work: 1, station: { arm: 0.8, z: -0.37, pose: 'car' } } as never : null;
        placeCrew(c, k(tack, twa) as never, 1 / 60);
      };
      for (let i = 0; i < 60 * 30; i++) step(first, 45, i > 60 * 15);
      expect(c.people[2]!.z, 'the front hand at the car').toBeLessThan(0);
      const zs: number[] = [];
      for (let i = 0; i < 60 * 12; i++) { step(other, i < 120 ? 4 : 45, false); zs.push(c.tgt![1]!.z); }
      expect(Math.max(...zs.map(z => Math.abs(z - Z.deckFwd))), `onto ${other}: the middle hand never sent from his seat`).toBeLessThan(0.05);
      expect(c.tgt![2]!.z, 'the front hand back at hers, beside the cabin').toBeCloseTo(Z.cabinSide, 2);
    }
  });
});
