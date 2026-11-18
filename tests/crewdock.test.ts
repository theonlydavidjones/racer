import { describe, expect, it } from 'vitest';
import { SLIPS, slipTaken, slipsIn } from '../src/geo/marina';
import { moveLazyCar, tiedTack } from '../src/boat/physics';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { Z } from '../src/boat/crewPhys';

// At the dock and leaving it under bare poles the crew sit centred, not hiked or to leeward (the owner, 13 Nov 2026):
// physics.ts crewAtDock, and an upright heel aimed for with the sails struck. Their weight moves only her heel.

const atSlip = (windKt: number) => {
  const slip = SLIPS[0], boat = { ...DEFAULT_BOAT, slip: slip.id };
  const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' };
  return new World(COURSES[0], S, 1, { freeSail: true });
};
/** The furthest any crew member's arm (|x|, m) is from the middle over `secs`, once they've had 20 s to settle; and the
 * most any of them leaned out. */
function spread(w: World, secs: number) {
  const u = w.user; let far = 0, lean = 0;
  for (let i = 0; i < 20 * 60; i++) w.step(DT);
  for (let i = 0; i < secs * 60; i++) { w.step(DT); for (const p of u.crew!.people.slice(1)) { far = Math.max(far, Math.abs(p.x)); lean = Math.max(lean, p.lean); } }
  return { far, lean };
}

describe('the crew at the dock', () => {
  for (const W of [6, 18])
    it(`in her slip in ${W} kt, made fast, sails down: the crew sit in the middle, not out on the rail or to leeward`, () => {
      const w = atSlip(W), u = w.user; expect(u.docked).toBeTruthy();
      const { far, lean } = spread(w, 30);
      expect(far, 'arm from the middle, m').toBeLessThan(0.3); expect(lean).toBe(0);
      expect(u.crew!.people.slice(1).every(p => p.pose === 'sit')).toBe(true);
    }, 30_000);
  it('placed by you at the dock (up to windward), they stay there; given back to Auto, to the middle', () => {
    const w = atSlip(12), u = w.user;
    u.crew!.place = { across: 'up', fore: null };
    for (let i = 0; i < 20 * 60; i++) w.step(DT);
    const wd = u.crew!.wind;
    expect(u.crew!.people.slice(1).every(p => p.x * wd > 0.3), `up to windward: ${u.crew!.people.map(p => (p.x * wd).toFixed(2) + p.pose)} tack ${u.tack} wind ${wd}`).toBe(true);
    expect(u.crew!.place?.across).toBe('up'); // (your placing kept)
    u.crew!.place = undefined; const { far } = spread(w, 10);
    expect(far).toBeLessThan(0.3);
  }, 30_000);
  it('pushed off and walked out under bare poles: still in the middle, no hiking', () => {
    const w = atSlip(14), u = w.user;
    for (let i = 0; i < 5 * 60; i++) w.step(DT);
    expect(w.pushOff()).toBe(true);
    for (let i = 0; i < 20 * 60; i++) w.step(DT); // (settled at the dock first)
    let far = 0, lean = 0, n = 0;
    for (let i = 0; i < 60 * 60 && (u.handled || n < 20 * 60); i++) { w.step(DT); if (!u.handled) n++; for (const p of u.crew!.people.slice(1)) { if (p.job?.station) continue; far = Math.max(far, Math.abs(p.x)); lean = Math.max(lean, p.lean); } }
    expect(far, 'arm from the middle, m').toBeLessThan(0.45); expect(lean).toBeLessThan(0.05);
  }, 60_000);
});

describe('in her slip, the jobs of sailing end (physics.ts crewAtDock)', () => {
  it('a job under way as she comes into her slip ends there: nobody left at the jib car while she lies made fast', () => {
    // (the crew soak, v208, 18 Nov 2026: home in 22 kt, the bow hand set off for the lazy jib car as she came into her
    // slip, and was still at it a minute later and for good, at the car on the foredeck, the job frozen: at the dock
    // only the hoist is worked, crewRig, and the place the crew sit, crewAtDock)
    const w = atSlip(12), u = w.user, slip = SLIPS[0];
    for (let i = 0; i < 60; i++) w.step(DT);
    const a = u.crew!.people[u.crew!.people.length - 1]!;
    a.job = { line: 'car', reach: 4, work: 6, station: { arm: 0.8, z: Z.car, pose: 'car' }, side: u.tack, target: { fore: 0, ins: 0 } };
    // (out of her slip, as from a sail, and sent home; then in bow first, slow)
    Object.assign(u, { docked: undefined, x: slip.p.x + 20, y: slip.p.y, v: 0 }); w.step(DT); w.sendHome();
    Object.assign(u, { x: slip.p.x, y: slip.p.y, h: slip.heading + 10, v: 0.2, astern: 0 });
    w.step(DT);
    expect(u.docked, 'made fast in her slip').toBeTruthy();
    for (let i = 0; i < 30 * 60; i++) w.step(DT);
    expect(u.crew!.people.map(p => p.job?.line ?? null), 'jobs, made fast').toEqual(u.crew!.people.map(() => null));
    expect(u.crew!.people.every(p => p.pose !== 'car'), 'nobody posed at the car').toBe(true);
    expect(Math.min(...u.crew!.people.map(p => p.z)), 'everyone back in the cockpit').toBeGreaterThan(Z.cockpitFwd - 0.05);
  });
});

describe('tied up, the crew finish what the dock wants and nothing else (physics.ts crewTiedUp)', () => {
  it('her lines going on: a job open as the hand steps ashore ends, not frozen till she lies in her berth or for good', () => {
    // (the physics review of the dock's jobs, 18 Nov 2026: on her lines only the lines' physics ran, world.ts mooringStep,
    // so a car or sheet job open as the hand stepped ashore froze through the warping in, for good if she never lay in her
    // berth)
    const home = slipsIn('west-harbor').find(s => s.kind === 'bow-in')!, s = slipsIn('west-harbor').filter(q => q.kind === 'bow-in' && !slipTaken(q) && q.id !== home.id)[0]!;
    const boat = { ...DEFAULT_BOAT, marina: home.marina, slip: home.id };
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 2, mode: 'sail', sailFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings, 1, { freeSail: true }), u = w.user;
    for (let i = 0; i < 30; i++) w.step(DT);
    const r = s.heading * Math.PI / 180;
    Object.assign(u, { docked: undefined, x: s.p.x - Math.sin(r) * 9, y: s.p.y - Math.cos(r) * 9, h: s.heading, v: 0.4, astern: 0, sway: 0, turnRate: 0, steer: 0, tiller: 0, turnTarget: null });
    u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false };
    expect(w.linesReady()).toBe(true);
    let at = -1; const a = u.crew!.people[u.crew!.people.length - 1]!;
    for (let i = 0; i < 60 * 60 && at < 0; i++) { w.step(DT); if (u.mooring?.lines.length) { at = w.t; a.job = { line: 'car', reach: 30, work: 6, station: { arm: 0.8, z: Z.car, pose: 'car' }, side: u.tack, target: { fore: 0, ins: 0 } }; } }
    expect(at, 'a line ashore').toBeGreaterThan(0);
    for (let i = 0; i < 2 * 60; i++) w.step(DT);
    expect(u.mooring?.lines.length, 'still on her lines, not yet in her berth').toBeGreaterThan(0);
    expect(a.job?.line ?? null, 'the job open as the line went ashore').toBeNull();
    expect(a.z, 'and the hand back in the cockpit').toBeGreaterThan(Z.cockpitFwd - 0.05);
  });
  it('her lines going on: the main struck once the bow line is on comes down then, not when she lies in her berth', () => {
    // (crewRig didn't run on her lines: "Striking the main", and nothing till she was made fast in her berth, or ever)
    const home = slipsIn('west-harbor').find(s => s.kind === 'bow-in')!, s = slipsIn('west-harbor').filter(q => q.kind === 'bow-in' && !slipTaken(q) && q.id !== home.id)[0]!;
    const boat = { ...DEFAULT_BOAT, marina: home.marina, slip: home.id };
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 2, mode: 'sail', sailFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack' } as Settings, 1, { freeSail: true }), u = w.user;
    for (let i = 0; i < 30; i++) w.step(DT);
    const r = s.heading * Math.PI / 180;
    Object.assign(u, { docked: undefined, x: s.p.x - Math.sin(r) * 9, y: s.p.y - Math.cos(r) * 9, h: s.heading, v: 0.4, astern: 0, sway: 0, turnRate: 0, steer: 0, tiller: 0, turnTarget: null });
    u.rig = { main: 1, jib: 0, mainUp: true, jibUp: false };
    expect(w.linesReady()).toBe(true);
    let on = false;
    for (let i = 0; i < 60 * 60 && !on; i++) { w.step(DT); on = !!u.mooring?.lines.length; }
    expect(on, 'a line ashore').toBe(true);
    w.setSail('main', false);
    for (let i = 0; i < 10 * 60 && !u.docked; i++) w.step(DT);
    expect(u.rig!.main, 'the main, struck on her lines').toBeLessThan(1);
  });
  it('one crew, on her lines: your car call waits while they are ashore with the line, and is worked once she lies in her berth', () => {
    // (the car is the bow hand's, ownerOf: one crew, that's who steps ashore with the bow line, so nobody aboard to go forward)
    const home = slipsIn('west-harbor').find(s => s.kind === 'bow-in')!, s = slipsIn('west-harbor').filter(q => q.kind === 'bow-in' && !slipTaken(q) && q.id !== home.id)[0]!;
    const boat = { ...DEFAULT_BOAT, marina: home.marina, slip: home.id };
    const crew = { n: 1 as const, helm: DEFAULT_SETTINGS.crew.helm, people: DEFAULT_SETTINGS.crew.people.slice(0, 1) };
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 2, mode: 'sail', sailFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack', crew } as Settings, 1, { freeSail: true }), u = w.user;
    expect(u.crew!.spec.crew.length).toBe(1);
    for (let i = 0; i < 30; i++) w.step(DT);
    const r = s.heading * Math.PI / 180;
    Object.assign(u, { docked: undefined, x: s.p.x - Math.sin(r) * 9, y: s.p.y - Math.cos(r) * 9, h: s.heading, v: 0.4, astern: 0, sway: 0, turnRate: 0, steer: 0, tiller: 0, turnTarget: null });
    u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false };
    expect(w.linesReady()).toBe(true);
    let on = false;
    for (let i = 0; i < 60 * 60 && !on; i++) { w.step(DT); on = !!u.mooring?.lines.length; }
    expect(on, 'a line ashore').toBe(true);
    const side = u.tack, was = u.ctl.car[side].fore, to = was > 0 ? was - 1 : was + 1;
    moveLazyCar(u, to - was, 0, side);
    for (let i = 0; i < 3 * 60; i++) w.step(DT);
    expect(u.docked, 'still on her lines').toBeFalsy();
    expect(u.ctl.car[side].fore, 'not worked while the hand is ashore').toBe(was);
    expect(u.crew!.people[1]!.job ?? null, 'nobody on it').toBeNull();
    for (let i = 0; i < 120 * 60 && !(u.docked && u.carCmd == null); i++) w.step(DT);
    expect(u.docked, 'made fast in her berth').toBeTruthy();
    expect(u.ctl.car[side].fore, 'worked once she lies in her berth').toBe(to);
  });
  it('one crew, on her lines: the main struck while they handle the lines comes down once her lines are on, not before', () => {
    // (the halyards are the bow hand's, ownerOf, as the car and the pole: one crew, that's who is on the dock with the bow
    // line, warping her in; struck meanwhile, the main came down with nobody at the mast)
    const home = slipsIn('west-harbor').find(s => s.kind === 'bow-in')!, s = slipsIn('west-harbor').filter(q => q.kind === 'bow-in' && !slipTaken(q) && q.id !== home.id)[0]!;
    const boat = { ...DEFAULT_BOAT, marina: home.marina, slip: home.id };
    const crew = { n: 1 as const, helm: DEFAULT_SETTINGS.crew.helm, people: DEFAULT_SETTINGS.crew.people.slice(0, 1) };
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 2, mode: 'sail', sailFrom: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack', crew } as Settings, 1, { freeSail: true }), u = w.user;
    for (let i = 0; i < 30; i++) w.step(DT);
    const r = s.heading * Math.PI / 180;
    Object.assign(u, { docked: undefined, x: s.p.x - Math.sin(r) * 9, y: s.p.y - Math.cos(r) * 9, h: s.heading, v: 0.4, astern: 0, sway: 0, turnRate: 0, steer: 0, tiller: 0, turnTarget: null });
    u.rig = { main: 1, jib: 0, mainUp: true, jibUp: false };
    expect(w.linesReady()).toBe(true);
    let on = false;
    for (let i = 0; i < 60 * 60 && !on; i++) { w.step(DT); on = !!u.mooring?.lines.length; }
    expect(on, 'a line ashore').toBe(true);
    w.setSail('main', false);
    for (let i = 0; i < 60 && u.mooring?.phase === 'ashore'; i++) w.step(DT);
    expect(u.mooring?.phase, 'still handling her lines').toBe('ashore');
    expect(u.rig!.main, 'the main, while the hand is on the dock with the line').toBe(1);
    for (let i = 0; i < 90 * 60 && u.rig!.main > 0; i++) w.step(DT);
    expect(u.rig!.main, 'struck once her lines are on').toBe(0);
  });
  it('her tack lying to a dock: held within 4° of dead ahead or astern, by the side the wind is on beyond (tiedTack)', () => {
    // (on her lines the tack followed every wander of the wind across her bow, and the crew, sat now, were sent across with it)
    expect(tiedTack(3, 'P')).toBe('P'); expect(tiedTack(-3, 'S')).toBe('S');
    expect(tiedTack(178, 'P')).toBe('P'); expect(tiedTack(-178, 'S')).toBe('S');
    expect(tiedTack(10, 'P')).toBe('S'); expect(tiedTack(-10, 'S')).toBe('P');
  });
  it('the pole half stowed as she is made fast: stowed, not left so with nobody on it', () => {
    // (made fast, crewPole didn't run: a pole stowing as she came in stayed stowing, its hand sat down, and her sail plan read
    // the crew busy with the pole till she left)
    const w = atSlip(6), u = w.user;
    for (let i = 0; i < 60; i++) w.step(DT);
    expect(u.docked).toBeTruthy();
    u.poleWant = false; u.pole = 'stowing'; u.poleT = 6;
    for (let i = 0; i < 20 * 60; i++) w.step(DT);
    expect(u.pole, 'the pole').toBe('down');
    expect(u.crew!.people.some(p => p.job?.line === 'pole'), 'anyone still on the pole').toBe(false);
  });
  it('your call for a lazy jib car, made fast with the jib down: worked there, as a crew sets the cars before leaving the slip', () => {
    // (made fast, carJob didn't run: the call waited till she was under way)
    const w = atSlip(6), u = w.user;
    for (let i = 0; i < 60; i++) w.step(DT);
    const side = u.tack, was = { ...u.ctl.car[side] };
    moveLazyCar(u, was.fore > 0 ? -1 : 1, 0, side);
    for (let i = 0; i < 40 * 60; i++) w.step(DT);
    expect(u.ctl.car[side].fore, 'the car moved a hole').toBe(was.fore + (was.fore > 0 ? -1 : 1));
    expect(u.carCmd ?? null, 'the call done').toBeNull();
    expect(u.crew!.people.every(p => p.job == null), 'and back from it').toBe(true);
  });
});
