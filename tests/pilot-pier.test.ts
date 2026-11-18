// The tiller pilot's Nav round a long pier in the way (the stability soak, 18 Nov 2026: from off the Berkeley Marina to
// off Emeryville in 14 kt, the abandoned outer Berkeley Pier between, 3 km of it. Its way round swapped between the
// pier's two ends every two seconds, so she wove along it for five minutes; within 25 m of it no way round was clear, so
// it steered straight for Emeryville, through the pier, and she was wrecked on it at 5.4 kt). Fixed (autopilot.ts
// navHeading): the way round kept, and its side, until the way's clear; from here she tries the east end (a dead end:
// the gap to the pier is too narrow), goes back west along it, rounds its west end at about 47 min and is there at 67.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { COURSES } from '../src/courses/registry';
import { DT, World } from '../src/sim/world';
import { applyCommand } from '../src/sim/commands';
import { PLACES } from '../src/sim/places';

describe('the tiller pilot on Nav, a long pier in the way', () => {
  it('from off the Berkeley Marina to off Emeryville in 14 kt: round the pier, never onto it', () => {
    const S = { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'berkeley', sailTo: '', windKind: 'west', windKt: 14, current: 'real', sea: 'real', tideDate: '2026-11-14', traffic: 0, fleet: 0, opponents: [] } as Settings;
    const w = new World(COURSES[0], S, 107, { freeSail: true }), u = w.user;
    const from = PLACES.find(p => p.id === 'berkeley')!.p, to = PLACES.find(p => p.id === 'emeryville')!.p;
    w.step(DT); u.x = from.x; u.y = from.y; w.step(DT);
    applyCommand(w, { k: 'dest', p: to, name: 'Off Emeryville' }); applyCommand(w, { k: 'pilot', op: 'engage', mode: 'nav' });
    let flips = 0, side = 0, hits = 0, last = u.lastHitT;
    while (w.t < 80 * 60 && !u.wrecked && w.arrivedT == null && w.pilot.mode !== 'off') {
      w.step(DT); if (u.lastHitT !== last) { last = u.lastHitT; hits++; }
      const d = w.pilot.detour; if (d) { const s = Math.sign(d.x - u.x); if (side && s && s !== side) flips++; if (s) side = s; }
    }
    expect(u.wrecked, 'wrecked').toBeUndefined();
    expect(hits, 'times she struck anything').toBe(0);
    expect(flips, 'the way round swapped from one end of the pier to the other').toBeLessThan(4);
    // (round it and there, or, with no way round, the pilot's alarm: the tiller handed back)
    expect(w.arrivedT != null || w.pilot.mode === 'off', `there, or the tiller handed back (at ${u.x.toFixed(0)}, ${u.y.toFixed(0)} after ${(w.t / 60).toFixed(0)} min)`).toBe(true);
  }, 300_000);
});
