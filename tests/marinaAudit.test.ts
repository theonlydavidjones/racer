// The marina audit's small items (docs/marinas/marina-audit.md, items 2 to 4).
import { describe, expect, it } from 'vitest';
import { slipById, slipsIn, slipTaken } from '../src/geo/marina';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { teach } from '../src/boat/coach';

const cruise = (slip: string) => {
  const s = slipById(slip)!, boat = { ...DEFAULT_BOAT, marina: s.marina, slip: s.id };
  const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 6, mode: 'sail', sailFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
  const w = new World(COURSES[0], S, 1, { freeSail: true }); for (let i = 0; i < 30; i++) w.step(DT); return w;
};

describe('the marina audit\'s small items', () => {
  it('2: a guest dock is kept free: Berkeley\'s one berth, Berkeley YC\'s guest dock, is free to come in to', () => {
    const g = slipsIn('berkeley').filter(s => /guest/i.test(s.dock));
    expect(g.length).toBeGreaterThan(0);
    for (const s of g) expect(slipTaken(s), s.id).toBe(false);
  });
  it('3: sent home, the toast names her slip once', () => {
    const w = cruise('west-harbor:405'); w.drainEvents();
    expect(w.sendHome()).toBe(true);
    const t = w.drainEvents().flatMap(e => e.type === 'toast' ? [e.msg] : []).find(m => m.startsWith('Heading home'))!;
    expect(t).toMatch(/^Heading home to Slip 405, West Harbor\./);
  });
  it('4: coming in under bare poles, the coach says the sails are down, not that they\'re going up or down', () => {
    const w = cruise('west-harbor:405'), u = w.user, s = slipById('west-harbor:405')!, r = s.heading * Math.PI / 180;
    Object.assign(u, { docked: undefined, handled: undefined, x: s.p.x - Math.sin(r) * 9, y: s.p.y - Math.cos(r) * 9, h: s.heading, v: 0.4, vx: Math.sin(r) * 0.4, vy: Math.cos(r) * 0.4 });
    u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false };
    expect(w.linesReady()).toBe(true);
    const head = teach(u).top.head;
    expect(head).not.toMatch(/going up/);
    expect(head).toBe('Sails down.');
    u.rig = { main: 0.4, jib: 0, mainUp: true, jibUp: false }; // (the main going up)
    expect(teach(u).top.head).toMatch(/going up/);
  });
});
