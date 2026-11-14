import { describe, expect, it } from 'vitest';
import { LL } from '../src/geo/geo';
import { onLand } from '../src/geo/shore';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { outward, wreck } from '../src/boat/physics';
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
/** Crissy Field's shore, from the water off it: the open shore, where the chart gives no kind (a beach): mud and sand. */
const offCrissy = LL(37.8075, -122.4560);
/** The Marina Green, from the water off it: NOAA's chart has it a sea wall (SLCONS CATSLC 10: geo/shoreKind.ts). */
const offMarinaGreen = LL(37.8095, -122.4380);

describe('wrecks', () => {
  it('into a harbor breakwater at 2 m/s (about 4 kn): a wreck, at that harbor, held there', () => {
    const w = world('sail'); aim(w, offWestHarbor, 180, 2, 2); const r = run(w, 4);
    expect(r.wrecked, r.toasts.join(' / ')).toHaveLength(1); expect(r.wrecked[0]).toMatch(/hit the breakwater at 3\.\d kn @ /);
    expect(w.user.wrecked).toBeTruthy();
  });
  it('into the same breakwater at 1 m/s: damage, told so, not wrecked', () => {
    const w = world('sail'); aim(w, offWestHarbor, 180, 2, 1); const r = run(w, 6);
    expect(r.wrecked).toHaveLength(0); expect(w.user.damage?.level).toBe('damage'); expect(r.toasts.some(m => /^Damage: she hit the breakwater/.test(m))).toBe(true);
  });
  it('at a walk (0.3 m/s): a scrape, the usual bump, no damage kept', () => {
    const w = world('sail'); aim(w, offWestHarbor, 180, 1, 0.3); run(w, 8);
    expect(w.user.wrecked).toBeUndefined(); expect(w.user.damage?.level ?? 'scrape').toBe('scrape');
  });
  it('a beach at 2 m/s (the chart gives Crissy Field\'s shore no kind): aground, no damage', () => {
    const w = world('sail'); aim(w, offCrissy, 180, 2, 2); const r = run(w, 4);
    expect(r.wrecked).toHaveLength(0); expect(w.user.damage).toBeUndefined(); expect(r.toasts.some(m => /Aground/.test(m))).toBe(true);
  });
  it('racing, wrecked: she retires (RET only, in a season race too: the owner, 14 Nov 2026)', () => {
    const w = world('race'); aim(w, offWestHarbor, 180, 2, 2); run(w, 4);
    expect(w.user.wrecked).toBeTruthy(); expect(w.user.retired).toBe(true);
  });
  it('carry on: she sails again, still marked wrecked', () => {
    const w = world('sail'); aim(w, offWestHarbor, 180, 2, 2); run(w, 3);
    const u = w.user; u.h = 0; w.carryOn(); u.v = 1; run(w, 3);
    expect(u.wrecked?.carryOn).toBe(true); expect(Math.hypot(u.vx, u.vy)).toBeGreaterThan(0.05);
  });
  it('the AI boats are never wrecked or marked (only your boat: the owner, 14 Nov 2026)', () => {
    const w = world('race'); const ai = w.boats.find(b => !b.isUser)!;
    const u = V(180); let d = 0; while (!onLand({ x: offWestHarbor.x + u.x * d, y: offWestHarbor.y + u.y * d })) d += 0.25;
    Object.assign(ai, { x: offWestHarbor.x + u.x * (d - 5.8), y: offWestHarbor.y + u.y * (d - 5.8), h: 180, v: 2 });
    for (let i = 0; i < 30; i++) w.step(DT);
    expect(ai.wrecked).toBeUndefined(); expect(ai.damage).toBeUndefined();
  });
  // (the blow is her speed into the face, along its normal, not her speed: a glancing touch closes slowly, physics.ts closingAt)
  for (const [deg, want] of [[5, 'scrape'], [20, 'damage']] as const) it(`along the breakwater at 3 m/s, ${deg} degrees into it: ${want}, not a wreck (a glancing blow)`, () => {
    const w = world('sail'), u = w.user;
    // (the face's own line, from its outward normal there: she runs along it, turned `deg` toward it, from 30 m back and
    // 3 m off it; her speed into it 3·sin(deg): 0.26 m/s at 5, 1.03 at 20)
    const d = V(180); let k = 0; while (!onLand({ x: offWestHarbor.x + d.x * k, y: offWestHarbor.y + d.y * k })) k += 0.05;
    const f = { x: offWestHarbor.x, y: offWestHarbor.y - k }, n = outward({ x: f.x, y: f.y - 0.05 }), t = { x: -n.y, y: n.x }; // (along it, westward)
    const r = deg * Math.PI / 180, dir = { x: t.x * Math.cos(r) - n.x * Math.sin(r), y: t.y * Math.cos(r) - n.y * Math.sin(r) };
    const back = 3 / Math.tan(r) + 3.82; // (from where her bow meets it, back along her course)
    Object.assign(u, { docked: undefined, x: f.x - dir.x * back, y: f.y - dir.y * back, h: (Math.atan2(dir.x, dir.y) * 180 / Math.PI + 360) % 360, v: 3, astern: 0, sway: 0, turnRate: 0, steer: 0, tiller: 0, turnTarget: null });
    u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false };
    const res = run(w, 6);
    expect(res.wrecked, res.toasts.join(' / ')).toHaveLength(0); expect(u.damage?.level ?? 'scrape').toBe(want);
  });
  it('wrecked by a ship in a race (World.shipEncounters, not her own step): retired at once, while she\'s held', () => {
    const w = world('race'), u = w.user;
    wreck(u, 'hit by the container ship', u, () => { /* (the page's statement) */ });
    w.step(DT);
    expect(u.wrecked?.where).toBe('on the Bay'); expect(u.retired).toBe(true);
  });
  // (the open shore's kinds from NOAA's chart, geo/shoreKind.ts: the Marina Green is a sea wall)
  it('the Marina Green\'s seawall at 2 m/s: a wreck, "hit the seawall"; at 1 m/s, damage', () => {
    const w = world('sail'); aim(w, offMarinaGreen, 180, 2, 2); const r = run(w, 4);
    expect(r.wrecked, r.toasts.join(' / ')).toHaveLength(1); expect(r.wrecked[0]).toMatch(/^hit the seawall at 3\.\d kn @ /);
    const w2 = world('sail'); aim(w2, offMarinaGreen, 180, 2, 1); const r2 = run(w2, 6);
    expect(r2.wrecked).toHaveLength(0); expect(w2.user.damage).toEqual({ level: 'damage', what: 'the seawall' });
  });
  // (the physics review's cases: a beach beside a construction read as the construction, and a pier always under water read as
  // standing concrete. Each the chart's natural coast or the bottom, not the edge: aground, no wreck)
  for (const [where, la, lo] of [['Crissy Field, east', 37.8085, -122.4544], ['Crissy Field, east end', 37.8085, -122.4508], ['off the East Beach', 37.8085, -122.4478], ['by Torpedo Wharf', 37.8085, -122.4666], ['Aquatic Park\'s cove (a submerged ruined pier)', 37.8085, -122.4242]] as const)
    it(`${where} at 2 m/s: the chart's natural coast or the bottom, not a construction: no wreck`, () => {
      const w = world('sail'); aim(w, LL(la, lo), 180, 2, 2); const r = run(w, 4);
      expect(r.wrecked, r.toasts.join(' / ')).toHaveLength(0);
    });
});

