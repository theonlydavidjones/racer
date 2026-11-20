import { describe, expect, it } from 'vitest';
import { SLIPS, inBasin } from '../src/geo/marina';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { applyCommand } from '../src/sim/commands';
import { hoistTabWord } from '../src/ui/hoistTab';

// The owner, r247 (18 Nov 2026): "while cruising, I started a cruise mid-water with sails down. I don't see hoist
// buttons. I should always see those if sails are down." Their route: started in her slip (sails down), opened the
// chart, picked a spot, "Move her here".
describe('the Hoist tabs: a sail that\'s down always has its tab', () => {
  const slip = SLIPS.find(s => s.id === 'west-harbor:101') ?? SLIPS[0];
  const boat = { ...DEFAULT_BOAT, slip: slip.id, marina: slip.id.split(':')[0] };
  const cruise = () => new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'slip', sailTo: '', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack', traffic: 0 } as Settings, 1, { freeSail: true });
  // (running: the page sets it as the sail begins, app.ts)
  const tabs = (w: World) => (['main', 'jib'] as const).map(k => hoistTabWord(w.user, k, w.running, inBasin(w.user)));
  it('in her slip, sails down: Hoist main and Hoist jib', () => {
    const w = cruise(); w.running = true; w.step(DT);
    expect(w.user.docked).toBeTruthy();
    expect(tabs(w)).toEqual(['Hoist main', 'Hoist jib']);
  });
  it('moved from her slip to open water by the chart ("Move her here"), sails still down: Hoist main and Hoist jib', () => {
    const w = cruise(); w.running = true; w.step(DT);
    expect(applyCommand(w, { k: 'moveHere', p: { x: w.center.x, y: w.center.y }, name: 'open water' })).toBe(true);
    for (let i = 0; i < 40; i++) w.step(DT);
    expect(w.user.docked).toBeUndefined(); expect(inBasin(w.user)).toBe(false);
    expect(tabs(w)).toEqual(['Hoist main', 'Hoist jib']);
  });
  it('on open water with them up and hoisted: no tab (striking is for a harbor); struck there, Hoist again', () => {
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'cityfront', sailTo: '', traffic: 0 } as Settings, 1, { freeSail: true });
    w.running = true; w.step(DT); expect(tabs(w)).toEqual([null, null]);
    w.user.rig = { main: 0, jib: 0, mainUp: false, jibUp: false };
    expect(tabs(w)).toEqual(['Hoist main', 'Hoist jib']);
  });
});
