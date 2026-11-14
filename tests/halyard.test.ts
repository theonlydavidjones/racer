import { describe, expect, it } from 'vitest';
import { testBoat, sail } from './helpers/testBoat';
import { KT } from '../src/core/math';
import { HALYARD, crewSolve, hoistDraw, hoistedShare } from '../src/boat/controls';
import { sailUp } from '../src/boat/physics';
import type { Boat } from '../src/boat/boat';

/** A boat on a close reach in 12 kt with her main hauled up at the mast and its halyard at `downhaul` (yours: held). */
function mainAt(downhaul: number, secs = 40): Boat {
  const b = testBoat({ heading: 300, kt: 4.5, windKt: 12 });
  b.rig = { main: 1, jib: 1, mainUp: true, jibUp: true };
  b.hand = { ...(b.hand ?? {}), downhaul: true }; b.ctl.downhaul = downhaul;
  sail(b, secs);
  return b;
}

describe('Halyards (ROADMAP 8o): hauled up at the mast, the last inches taken up at the piano', () => {
  it('up at the mast, the sail is a few inches short of the top until its halyard takes them up; then it is all the way up', () => {
    const th = HALYARD.takeUpM / HALYARD.luffM.main;
    expect(hoistedShare(1, 0, 'main')).toBeCloseTo(1 - th, 6);
    expect(hoistedShare(1, HALYARD.takeUp / 2, 'main')).toBeCloseTo(1 - th / 2, 6);
    expect(hoistedShare(1, HALYARD.takeUp, 'main')).toBe(1);
    expect(hoistedShare(1, 0.9, 'main')).toBe(1); // (above the take-up, the halyard tensions the luff: the sail is no higher)
    expect(hoistedShare(0.5, 0.9, 'main')).toBeCloseTo(0.5 * (1 - th), 6); // (half up at the mast: the piano can't help)
  });
  it('a part-hoisted sail draws worse per square metre than one all the way up, and worst near the boom', () => {
    expect(hoistDraw(1, 'main')).toBe(1);
    expect(hoistDraw(hoistedShare(1, 0, 'main'), 'main')).toBeLessThan(0.8);
    expect(hoistDraw(0.5, 'main')).toBeLessThan(hoistDraw(hoistedShare(1, 0, 'main'), 'main'));
    expect(hoistDraw(0.05, 'jib')).toBeLessThan(0.4);
  });
  it('with the main up at the mast but its halyard not taken up she sails slower, and the main flogs; taken up, she is herself', () => {
    const slack = mainAt(0), set = mainAt(0.3);
    expect(sailUp(slack, 'main')).toBeLessThan(1); expect(sailUp(set, 'main')).toBe(1);
    expect(slack.v).toBeLessThan(set.v - 0.1 * KT);
  });
  it('a sail being struck: its halyard at the piano goes slack, with nothing to take up', () => {
    const b = testBoat({ heading: 300, kt: 2, windKt: 8 });
    b.rig = { main: 1, jib: 1, mainUp: false, jibUp: false }; b.ctl.downhaul = 0.4; b.ctl.jibHalyard = 0.4;
    sail(b, 20);
    expect(b.rig.main).toBe(0); expect(b.rig.jib).toBe(0);
    expect(b.ctl.downhaul).toBe(0); expect(b.ctl.jibHalyard).toBe(0);
  });
  it('struck, the sails come down fast (the halyard let run): the jib within about 5 s, the main within about 8 s', () => {
    const b = testBoat({ heading: 300, kt: 2, windKt: 8 });
    b.rig = { main: 1, jib: 1, mainUp: false, jibUp: false };
    sail(b, 5); expect(b.rig.jib).toBe(0);
    sail(b, 3); expect(b.rig.main).toBe(0);
  });
  it('hoisted with the crew on the halyards, they take up the last inches soon after, and leave her all the way up', () => {
    const b = testBoat({ heading: 280, kt: 0.5, windKt: 10 });
    b.rig = { main: 0, jib: 0, mainUp: true, jibUp: true }; b.ctl.downhaul = 0; b.ctl.jibHalyard = 0;
    sail(b, 150);
    expect(b.rig.main).toBe(1); expect(b.rig.jib).toBe(1);
    expect(sailUp(b, 'main')).toBe(1); expect(sailUp(b, 'jib')).toBe(1);
  });
  it('the crew never leave a halyard short of its take-up, in any wind', () => {
    for (const tws of [3, 8, 14, 22]) for (const awa of [35, 90, 160]) {
      const x = crewSolve(tws, awa, 'S', 20, 20);
      expect(x.downhaul, `${tws} kt, ${awa}°`).toBeGreaterThanOrEqual(HALYARD.takeUp);
      expect(x.jibHalyard, `${tws} kt, ${awa}°`).toBeGreaterThanOrEqual(HALYARD.takeUp);
    }
  });
});

describe('Jib cars with the jib down (ROADMAP 8p): no sheet load, so neither is loaded and either can be moved', () => {
  it('with the jib up only the windward car is free; struck, both are, and the crew move the leeward one when asked', async () => {
    const { carFree } = await import('../src/boat/crewWork');
    const { applyCommand } = await import('../src/sim/commands');
    const { World } = await import('../src/sim/world');
    const { courseFile } = await import('../src/courses/registry');
    const { DEFAULT_SETTINGS } = await import('../src/settings');
    const S = { ...DEFAULT_SETTINGS, mode: 'sail' as const, windKt: 8, windKind: 'west' as const, current: 'slack', sea: 'flat' as const, traffic: 0 as const, fleet: 0, opponents: [] };
    const w = new World(courseFile('train'), S, 4242, { freeSail: true }), u = w.user, lee = u.tack === 'S' ? 'P' : 'S';
    u.rig = { main: 1, jib: 1, mainUp: true, jibUp: true };
    expect(carFree(u, u.tack)).toBe(true); expect(carFree(u, lee)).toBe(false);
    w.setSail('jib', false); for (let i = 0; i < 60 * 8; i++) w.step(1 / 60);
    expect(u.rig.jib).toBe(0); expect(carFree(u, lee)).toBe(true);
    const was = { ...u.ctl.car[lee] }, to = { fore: was.fore === 0 ? 2 : 0, ins: was.ins };
    applyCommand(w, { k: 'lazyCarTo', fore: to.fore, ins: to.ins, side: lee });
    for (let i = 0; i < 60 * 60; i++) w.step(1 / 60);
    expect(u.ctl.car[lee].fore).toBe(to.fore);
  });
});
