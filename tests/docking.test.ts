import { describe, expect, it } from 'vitest';
import { slipTaken, slipsIn, type Slip } from '../src/geo/marina';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';

/** Real docking (docs/DOCKING-PROPOSAL.md): any free berth, the crew stepping off with the lines, the lines' real forces. */
const home = slipsIn('west-harbor').find(s => s.kind === 'bow-in')!;
const boat = { ...DEFAULT_BOAT, marina: home.marina, slip: home.id };
const cruise = (windKt = 2, solo = false) => {
  const b = solo ? { ...boat } : boat;
  const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt, mode: 'sail', sailFrom: 'slip', boats: [b], boat: b, boatId: b.id, tideDate: '2026-11-14', current: 'slack', ...(solo ? { crew: { n: 0, helm: DEFAULT_SETTINGS.crew.helm, people: [] } } : {}) } as Settings;
  return new World(COURSES[0], S, 1, { freeSail: true });
};
/** Her, sails down, coming straight into `s` from `back` m outside it at `v` m/s. */
const approach = (w: World, s: Slip, back: number, v: number) => {
  const u = w.user, r = s.heading * Math.PI / 180;
  Object.assign(u, { docked: undefined, x: s.p.x - Math.sin(r) * back, y: s.p.y - Math.cos(r) * back, h: s.heading, v, astern: 0, sway: 0, turnRate: 0, steer: 0, tiller: 0, turnTarget: null });
  u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false };
};
const free = slipsIn('west-harbor').filter(s => s.kind === 'bow-in' && !slipTaken(s) && s.id !== home.id);

describe('docking', () => {
  it('there are free slips to come in to, and Lines ready picks the nearest', () => {
    expect(free.length).toBeGreaterThan(5);
    const w = cruise(); for (let i = 0; i < 30; i++) w.step(DT);
    approach(w, free[0], 9, 0.4);
    expect(w.linesReady()).toBe(true); expect(w.user.mooring?.berth).toBe(free[0].id);
    expect(w.linesReady()).toBe(true); expect(w.user.mooring).toBeUndefined(); // (again: stood down)
  });
  it('crewed, at a slow walk into a free slip: the crew steps off, the line stops her in her berth, and she\'s made fast there', () => {
    let made = 0; const notes: string[] = [];
    for (const s of free.slice(0, 6)) {
      const w = cruise(); for (let i = 0; i < 30; i++) w.step(DT);
      approach(w, s, 9, 0.4); w.linesReady();
      let stepped = false;
      for (let i = 0; i < 60 * 90 && !w.user.docked; i++) { w.step(DT); if (w.user.mooring?.phase === 'ashore') stepped = true; }
      notes.push(`${s.label}: stepped ${stepped}, docked ${!!w.user.docked}, ${w.user.mooring?.phase ?? '-'}`);
      if (w.user.docked?.slip === s.id) made++;
    }
    expect(made, notes.join('; ')).toBeGreaterThanOrEqual(5);
  }, 120000);
  it('too fast (2 kn): "Too fast", and nobody steps', () => {
    const w = cruise(); for (let i = 0; i < 30; i++) w.step(DT);
    const s = free[0]; approach(w, s, 9, 1.0); w.linesReady();
    const cues = new Set<string>();
    for (let i = 0; i < 60 * 8; i++) { w.user.v = Math.max(w.user.v, 1.0); w.step(DT); if (w.user.mooring?.cue) cues.add(w.user.mooring.cue); if (w.user.mooring?.phase !== 'ready') break; }
    expect(cues.has('Too fast')).toBe(true); expect(w.user.mooring?.phase ?? 'ready').toBe('ready');
  }, 60000);
  it('single-handed: you step off with the midships line (nobody on the tiller), then the bow and stern lines: made fast', () => {
    let made = 0, mids = 0;
    for (const s of free.slice(0, 4)) {
      const w = cruise(2, true); for (let i = 0; i < 30; i++) w.step(DT);
      expect(w.user.crew?.spec.crew.length).toBe(0);
      approach(w, s, 9, 0.35); w.linesReady(); expect(w.user.mooring?.solo).toBe(true);
      for (let i = 0; i < 60 * 90 && !w.user.docked; i++) { w.step(DT); if (w.user.mooring?.lines[0]?.role === 'midships') mids++; }
      if (w.user.docked?.slip === s.id) made++;
    }
    expect(mids).toBeGreaterThan(0); expect(made).toBeGreaterThanOrEqual(3);
  }, 120000);
  it('in a breeze across the slip (15 kt): the wind pushes her while the lines go on; she\'s held, or the line renders and she\'s lost', () => {
    let made = 0, lost = 0, tried = 0;
    for (const s of free.slice(0, 4)) {
      const w = cruise(15); for (let i = 0; i < 30; i++) w.step(DT);
      approach(w, s, 9, 0.4); w.linesReady(); tried++;
      let had = false;
      for (let i = 0; i < 60 * 90 && !w.user.docked; i++) { w.step(DT); if (w.user.mooring?.lines.length) had = true; else if (had && !w.user.mooring) { lost++; break; } }
      if (w.user.docked) made++;
      for (const L of w.user.mooring?.lines ?? []) expect(Number.isFinite(L.T ?? 0)).toBe(true);
    }
    expect(made + lost).toBeGreaterThan(0); // (one or the other happens: nothing hangs or blows up)
  }, 120000);
  it('the handoff: lines let go with way on, and a line ashore with way on, carry her speed, sway and turn across the step', () => {
    const w = cruise(4); for (let i = 0; i < 30; i++) w.step(DT);
    const s = free[0], u = w.user; approach(w, s, 9, 0.4); w.linesReady();
    for (let i = 0; i < 60 * 40 && !(u.mooring?.lines.length); i++) w.step(DT); // (a line ashore)
    expect(u.mooring?.lines.length).toBeGreaterThan(0);
    // lines off while she's moving: 0.4 m/s ahead, sliding sideways, turning
    Object.assign(u, { v: 0.4, astern: 0, sway: 0.15, turnRate: 1.5 });
    const before = { v: u.v - (u.astern ?? 0), sway: u.sway!, r: u.turnRate! };
    w.letGoLines(); w.step(DT);
    const after = { v: u.v - (u.astern ?? 0), sway: u.sway!, r: u.turnRate! };
    expect(Math.abs(after.v - before.v)).toBeLessThan(0.02); expect(Math.abs(after.sway - before.sway)).toBeLessThan(0.02); expect(Math.abs(after.r - before.r)).toBeLessThan(0.3);
    // and the other way: a line going ashore while she has way on
    const w2 = cruise(4); for (let i = 0; i < 30; i++) w2.step(DT);
    const u2 = w2.user; approach(w2, s, 9, 0.4); w2.linesReady();
    let prev = { v: 0, sway: 0, r: 0 }, jump = 0;
    for (let i = 0; i < 60 * 40; i++) {
      const had = !!u2.mooring?.lines.length; prev = { v: u2.v - (u2.astern ?? 0), sway: u2.sway ?? 0, r: u2.turnRate ?? 0 };
      w2.step(DT);
      if (!had && u2.mooring?.lines.length) { jump = Math.max(Math.abs(u2.v - (u2.astern ?? 0) - prev.v), Math.abs((u2.sway ?? 0) - prev.sway)); break; }
    }
    expect(jump).toBeLessThan(0.02);
  }, 120000);
  it('Home still makes her fast in her own slip on its own (as before)', () => {
    const w = cruise(); for (let i = 0; i < 30; i++) w.step(DT);
    w.sendHome(); approach(w, home, 2, 0.2);
    const u = w.user; Object.assign(u, { x: home.p.x - Math.sin(home.heading * Math.PI / 180) * 30, y: home.p.y - Math.cos(home.heading * Math.PI / 180) * 30 }); w.step(DT); // (out of it first: coming back is coming home)
    approach(w, home, 1.5, 0.2); for (let i = 0; i < 60 * 5 && !u.docked; i++) w.step(DT);
    expect(u.docked?.slip).toBe(home.id);
  }, 60000);
});
