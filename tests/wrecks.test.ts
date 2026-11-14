import { describe, expect, it } from 'vitest';
import { LL } from '../src/geo/geo';
import { onLand } from '../src/geo/shore';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { V, type Vec } from '../src/core/math';

/** Wrecks (docs/WRECK-PROPOSAL.md, the owner's answers in section 7): every contact graded by boat/damage.ts. */
const settings = (mode: 'sail' | 'race'): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 2, mode, tideDate: '2026-11-14', current: 'slack' } as Settings);
function world(mode: 'sail' | 'race') { const w = mode === 'sail' ? new World(COURSES[0], settings('sail'), 1, { freeSail: true }) : new World(COURSES[0], settings('race'), 1); for (let i = 0; i < 30; i++) w.step(DT); return w; }
/** Her, sails down, heading `h` from `from` toward the first land on that line, her bow `off` m short of it, at `v` m/s. */
function aim(w: World, from: Vec, h: number, off: number, v: number) {
  const u = V(h); let d = 0; while (!onLand({ x: from.x + u.x * d, y: from.y + u.y * d }) && d < 3000) d += 0.25;
  const c = { x: from.x + u.x * (d - off - 3.82), y: from.y + u.y * (d - off - 3.82) }, b = w.user;
  Object.assign(b, { docked: undefined, x: c.x, y: c.y, h, v, astern: 0, sway: 0, turnRate: 0, steer: 0, tiller: 0, turnTarget: null });
  b.rig = { main: 0, jib: 0, mainUp: false, jibUp: false };
}
function run(w: World, s: number) { const out = { toasts: [] as string[], wrecked: [] as string[] }; for (let i = 0; i < s / DT; i++) { w.step(DT); for (const e of w.drainEvents()) { if (e.type === 'toast') out.toasts.push(e.msg); if (e.type === 'wrecked') out.wrecked.push(`${e.how} @ ${e.where}`); } } return out; }
/** West Harbor's breakwater, from the Bay to its north: concrete and rock. */
const offWestHarbor = LL(37.8098, -122.4410);
/** Crissy Field's shore, from the water off it: the open shore (mud and sand, for now). */
const offCrissy = LL(37.8075, -122.4560);

describe('wrecks', () => {
  it('into a harbor breakwater at 2 m/s (about 4 kn): a wreck, at that harbor, held there', () => {
    const w = world('sail'); aim(w, offWestHarbor, 180, 2, 2); const r = run(w, 4);
    expect(r.wrecked, r.toasts.join(' / ')).toHaveLength(1); expect(r.wrecked[0]).toMatch(/hit the breakwater at 3\.\d kn @ /);
    expect(w.user.wrecked).toBeTruthy();
  });
  it('into the same breakwater at 1 m/s: damage, told so, not wrecked', () => {
    const w = world('sail'); aim(w, offWestHarbor, 180, 2, 1); const r = run(w, 6);
    expect(r.wrecked).toHaveLength(0); expect(w.user.damage?.level).toBe('damage'); expect(r.toasts.some(m => /^Damage: you hit the breakwater/.test(m))).toBe(true);
  });
  it('at a walk (0.3 m/s): a scrape, the usual bump, no damage kept', () => {
    const w = world('sail'); aim(w, offWestHarbor, 180, 1, 0.3); run(w, 8);
    expect(w.user.wrecked).toBeUndefined(); expect(w.user.damage?.level ?? 'scrape').toBe('scrape');
  });
  it('the open shore at 2 m/s: aground, no damage (mud and sand until its kinds are sourced)', () => {
    const w = world('sail'); aim(w, offCrissy, 180, 2, 2); const r = run(w, 4);
    expect(r.wrecked).toHaveLength(0); expect(w.user.damage).toBeUndefined(); expect(r.toasts.some(m => /Aground/.test(m))).toBe(true);
  });
  it('racing, wrecked: she retires (RET only, in a season race too: the Coordinator, for now)', () => {
    const w = world('race'); aim(w, offWestHarbor, 180, 2, 2); run(w, 4);
    expect(w.user.wrecked).toBeTruthy(); expect(w.user.retired).toBe(true);
  });
  it('carry on: she sails again, still marked wrecked', () => {
    const w = world('sail'); aim(w, offWestHarbor, 180, 2, 2); run(w, 3);
    const u = w.user; u.h = 0; w.carryOn(); u.v = 1; run(w, 3);
    expect(u.wrecked?.carryOn).toBe(true); expect(Math.hypot(u.vx, u.vy)).toBeGreaterThan(0.05);
  });
  it('the AI boats are never wrecked or marked (only your boat: the Coordinator, for now)', () => {
    const w = world('race'); const ai = w.boats.find(b => !b.isUser)!;
    const u = V(180); let d = 0; while (!onLand({ x: offWestHarbor.x + u.x * d, y: offWestHarbor.y + u.y * d })) d += 0.25;
    Object.assign(ai, { x: offWestHarbor.x + u.x * (d - 5.8), y: offWestHarbor.y + u.y * (d - 5.8), h: 180, v: 2 });
    for (let i = 0; i < 30; i++) w.step(DT);
    expect(ai.wrecked).toBeUndefined(); expect(ai.damage).toBeUndefined();
  });
});
