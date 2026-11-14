import { describe, expect, it } from 'vitest';
import { slipsIn } from '../src/geo/marina';
import { FORT_MASON_PILES, setOntoPier, underPier } from '../src/geo/fortMason';
import { onLand } from '../src/geo/shore';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { brg, unit, type Vec } from '../src/core/math';

/** Fort Mason's piers as pile fields (ROADMAP 8n): solid and dangerous; set onto the piles she's stopped dead, and told so. */
const home = slipsIn('gashouse-cove')[0];
const boat = { ...DEFAULT_BOAT, marina: home.marina, slip: home.id };
const cruise = () => {
  const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 2, mode: 'sail', sailFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
  const w = new World(COURSES[0], S, 1, { freeSail: true }); for (let i = 0; i < 30; i++) w.step(DT); return w;
};
const mid = (a: Vec, b: Vec) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const pier3 = FORT_MASON_PILES[0], c3 = pier3.pts.reduce((s, p) => ({ x: s.x + p.x / pier3.pts.length, y: s.y + p.y / pier3.pts.length }), { x: 0, y: 0 });
/** The middle of Pier 3's west face (the Gashouse entrance side), and the way out from it. */
const face = mid(pier3.pts[1], pier3.pts[2]), edge = unit({ x: pier3.pts[2].x - pier3.pts[1].x, y: pier3.pts[2].y - pier3.pts[1].y });
const out = (n => n.x * (face.x - c3.x) + n.y * (face.y - c3.y) > 0 ? n : { x: -n.x, y: -n.y })({ x: edge.y, y: -edge.x }); // (square off the face, away from the pier)
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
    // (her center 6 m off, bow on, drifting in at 0.4 m/s: her bow, 3.8 m ahead of her center, gets there first, in about 5.5 s)
    const p = { x: face.x + out.x * 6, y: face.y + out.y * 6 }, bowP = { x: p.x - out.x * 3.8, y: p.y - out.y * 3.8 };
    const s = setOntoPier([p, bowP], -out.x * 0.4, -out.y * 0.4); expect(s?.pier.name).toBe(pier3.name); expect(s!.s).toBeGreaterThanOrEqual(5); expect(s!.s).toBeLessThanOrEqual(6.5);
    expect(setOntoPier([p, bowP], out.x * 0.4, out.y * 0.4)).toBeNull(); // (drifting away)
  });
  it('careless: let drift onto the pier with no way on to steer, she\'s stopped dead on its piles, and told so in one line', () => {
    const w = cruise(); place(w, 3, 0.3); const msgs = run(w, 30);
    expect(msgs.filter(m => /Set onto the piles of Fort Mason's Pier 3/.test(m)).length).toBeGreaterThanOrEqual(1);
    expect(underPier(w.user)).toBeNull(); // (stopped on them, not in under them)
  });
  it('set sideways onto it: stopped on its piles', () => {
    const w = cruise(); place(w, 3, 0.25, true); const msgs = run(w, 30);
    expect(msgs.some(m => /the piles of Fort Mason's Pier 3/.test(m)), msgs.join(' / ')).toBe(true); expect(underPier(w.user)).toBeNull();
  });
  // (the blow graded by boat/damage.ts, as on concrete: square on at her displacement with her crew; ESTIMATE bands 0.5 and 1.5 m/s)
  it('struck bow first at 1 m/s under way: she bounces off its face, damaged', () => {
    const w = cruise(); place(w, 4, 1); const msgs = run(w, 6);
    expect(msgs.some(m => /Damage: you hit the piles of Fort Mason's Pier 3/.test(m)), msgs.join(' / ')).toBe(true);
    expect(w.user.damage?.level).toBe('damage'); expect(w.user.wrecked).toBeUndefined();
  });
  it('struck bow first at 2 m/s: wrecked, and told how and where; held there; a race retires her', () => {
    const w = cruise(); place(w, 4, 2); const ev: string[] = [];
    for (let i = 0; i < 4 / DT; i++) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'wrecked') ev.push(`${e.how} @ ${e.where}`); }
    expect(ev).toHaveLength(1); expect(ev[0]).toMatch(/hit the piles of Fort Mason's Pier 3 at 3\.\d kn @ /);
    const at = { x: w.user.x, y: w.user.y }; run(w, 5); expect(Math.hypot(w.user.x - at.x, w.user.y - at.y)).toBeLessThan(0.01);
    w.carryOn(); expect(w.user.wrecked?.carryOn).toBe(true); // (carry on, marked wrecked: she sails again)
  });
  it('pinned end on, no way on, the stream and wind setting her back each time: in under the deck among the piles, a wreck', () => {
    const w = cruise(); place(w, 2, 0.25); const u = w.user; let t = 0, wrecked = '';
    // (her drift onto them kept up by hand, as a steady set would: each time she's stopped and pushed off, set back on)
    for (; t < 60 && !wrecked; t += DT) { if (u.v < 0.1 && !u.wrecked) u.v = 0.25; w.step(DT); for (const e of w.drainEvents()) if (e.type === 'wrecked') wrecked = e.how; }
    expect(wrecked).toMatch(/set in under Fort Mason's Pier 3, among its piles/); expect(t).toBeGreaterThan(30);
  });
  it('pinned beam on: she lies across two piles, grinding: damage, not a wreck', () => {
    const w = cruise(); place(w, 1.3, 0.1, true); const u = w.user;
    for (let t = 0; t < 60; t += DT) { if (Math.abs(u.sway ?? 0) < 0.02) u.sway = 0.1; w.step(DT); w.drainEvents(); }
    expect(u.wrecked).toBeUndefined(); expect(u.damage?.level).toBe('damage');
  });
  it('stern first onto the piles (sternway, as after missing a tack): stopped on them, and told it\'s the piles, not the bottom', () => {
    const w = cruise(); place(w, 3, 0); const u = w.user; u.h = (u.h + 180) % 360; u.astern = 0.4; const msgs = run(w, 20);
    expect(msgs.some(m => /Set onto the piles of Fort Mason's Pier 3/.test(m)), msgs.join(' / ')).toBe(true);
    expect(msgs.some(m => /touched bottom/.test(m))).toBe(false); expect(underPier(u)).toBeNull();
  });
  it('lying against them, drifting on at a few cm/s: told once, gently, not over and over', () => {
    const w = cruise(); place(w, 1.3, 0.03, true); const msgs = run(w, 25).filter(m => /piles/.test(m));
    expect(msgs).toHaveLength(1); expect(msgs[0]).toMatch(/Against the piles of Fort Mason's Pier 3: fend off/);
  });
  // (the physics review's case: sailing out of the cove along Pier 3's face with the westerly setting her onto it. She
  // used to slip a few cm into the face and be pushed back along her own heading, still on land, every step: astern
  // through the city)
  for (const kt of [4, 8, 14]) it(`sailing along its face, sails up, ${kt} kt westerly setting her on: she slides along it and never goes through it`, () => {
    const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, windDir: 270, mode: 'sail', sailFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings;
    const w = new World(COURSES[0], S, 1, { freeSail: true }); for (let i = 0; i < 30; i++) w.step(DT);
    const u = w.user, along = brg(-edge.x, -edge.y); // (out along the face, toward the pier's end)
    Object.assign(u, { docked: undefined, x: face.x + out.x * 1.25, y: face.y + out.y * 1.25, h: (brg(edge.x, edge.y) + 0) % 360, v: 1, astern: 0, sway: 0, turnRate: 0, steer: 0, tiller: 0, turnTarget: null });
    void along; u.rig = { main: 1, jib: 1, mainUp: true, jibUp: true };
    let worst = 0;
    for (let i = 0; i < 60 / DT; i++) { w.step(DT); w.drainEvents(); if (onLand(u)) worst = 99; worst = Math.max(worst, Math.hypot(u.x - face.x, u.y - face.y)); }
    expect(onLand(u)).toBe(false); expect(worst).toBeLessThan(150); // (her middle never on land, and nowhere near the city)
  }, 60000);
});
