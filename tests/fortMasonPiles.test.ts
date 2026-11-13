import { describe, expect, it } from 'vitest';
import { slipsIn } from '../src/geo/marina';
import { FORT_MASON_PILES, setOntoPier, underPier } from '../src/geo/fortMason';
import { onLand } from '../src/geo/shore';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { brg, unit, type Vec } from '../src/core/math';

/** Fort Mason's piers as pile fields (ROADMAP 8n): set in among the piles she's a wreck, not a bump. */
const home = slipsIn('gashouse-cove')[0];
const boat = { ...DEFAULT_BOAT, marina: home.marina, slip: home.id };
const cruise = () => {
  const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 2, mode: 'sail', sailFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
  const w = new World(COURSES[0], S, 1, { freeSail: true }); for (let i = 0; i < 30; i++) w.step(DT); return w;
};
const mid = (a: Vec, b: Vec) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const pier3 = FORT_MASON_PILES[0], c3 = pier3.pts.reduce((s, p) => ({ x: s.x + p.x / pier3.pts.length, y: s.y + p.y / pier3.pts.length }), { x: 0, y: 0 });
/** The middle of Pier 3's west face (the Gashouse entrance side), and the way out from it. */
const face = mid(pier3.pts[1], pier3.pts[2]), out = unit({ x: face.x - c3.x, y: face.y - c3.y });
/** Her, sails down, `off` m out from Pier 3's west face, heading for it (bow on) at `v` m/s, or lying alongside it set sideways. */
function place(w: World, off: number, v: number, beam = false) {
  const u = w.user, p = { x: face.x + out.x * off, y: face.y + out.y * off }, toward = brg(-out.x, -out.y);
  Object.assign(u, { docked: undefined, handled: undefined, pushing: undefined, x: p.x, y: p.y, h: beam ? (toward + 270) % 360 : toward, v: beam ? 0 : v, astern: 0, sway: beam ? v : 0, turnRate: 0, steer: 0, tiller: 0, turnTarget: null });
  u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false };
}
function run(w: World, s: number) { const msgs: string[] = []; for (let i = 0; i < s / DT; i++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'toast') msgs.push(e.msg); } return msgs; }

describe("Fort Mason's piers", () => {
  it('the three piers are where the chart has them: their middles under a deck, the water between them and the Gashouse entrance open', () => {
    expect(FORT_MASON_PILES.map(f => f.name)).toEqual(["Fort Mason's Pier 3", "Fort Mason's Pier 2", "Fort Mason's Pier 1"]);
    for (const f of FORT_MASON_PILES) { const c = f.pts.reduce((s, p) => ({ x: s.x + p.x / f.pts.length, y: s.y + p.y / f.pts.length }), { x: 0, y: 0 }); expect(underPier(c)?.name).toBe(f.name); expect(onLand(c)).toBe(true); }
    expect(underPier({ x: face.x + out.x * 5, y: face.y + out.y * 5 })).toBeNull(); // (off its face, in the entrance)
    expect(underPier(mid(FORT_MASON_PILES[0].pts[4], FORT_MASON_PILES[1].pts[5]))).toBeNull(); // (the slip of water between Piers 3 and 2)
  });
  it('drifting toward a pier, the coach can see it coming', () => {
    const p = { x: face.x + out.x * 6, y: face.y + out.y * 6 };
    const s = setOntoPier(p, -out.x * 0.4, -out.y * 0.4); expect(s?.pier.name).toBe(pier3.name); expect(s!.s).toBeGreaterThan(10); expect(s!.s).toBeLessThan(20);
    expect(setOntoPier(p, out.x * 0.4, out.y * 0.4)).toBeNull(); // (drifting away)
  });
  it('careless: let drift onto the pier with no way on to steer, she goes in among the piles and is wrecked, and stays wrecked', () => {
    const w = cruise(); place(w, 3, 0.3); const msgs = run(w, 30);
    expect(w.user.wrecked).toBe(pier3.name); expect(msgs.some(m => /Wrecked/.test(m))).toBe(true);
    const at = { x: w.user.x, y: w.user.y }; run(w, 10); expect(Math.hypot(w.user.x - at.x, w.user.y - at.y)).toBeLessThan(0.01); // (held there)
  });
  it('set sideways onto it: wrecked', () => {
    const w = cruise(); place(w, 3, 0.25, true); run(w, 30);
    expect(w.user.wrecked).toBe(pier3.name);
  });
  it('struck bow first under way, she bounces off its face (a collision, not a wreck)', () => {
    const w = cruise(); place(w, 4, 2); const msgs = run(w, 4);
    expect(w.user.wrecked).toBeUndefined(); expect(msgs.some(m => /Collision/.test(m)), msgs.join(" / ")).toBe(true);
  });
  it('racing, wrecked: she retires', () => {
    const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 2, mode: 'race', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
    const w = new World(COURSES[0], S, 1); for (let i = 0; i < 30; i++) w.step(DT);
    place(w, 3, 0.3); run(w, 30);
    expect(w.user.wrecked).toBe(pier3.name); expect(w.user.retired).toBe(true);
  });
});
