// The owner (ROADMAP 8b): sailing outside the Gate near Mile Rock, "Sail Home" from the nav view, and "ten minutes in the
// course is still plotting in the nav map". The page's passage plan (sim/navigator.ts passageLive) is worked out a slice
// at a time between frames; it was started again each 150 m she sailed (or two minutes of the clock), and from Mile Rock
// to her slip in Gashouse Cove its first plan is some 39 s of work: at its share of the page, under way, it never
// finished. Sailed here as the page does: a frame every 16 ms, she at 6 kt, the plan asked for each frame.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { COURSES } from '../src/courses/registry';
import { DT, World } from '../src/sim/world';
import { SLIPS } from '../src/geo/marina';
import { LL } from '../src/geo/geo';
import { passageLive, liveSlices } from '../src/sim/navigator';

describe('Sail Home from Mile Rock: the plan is drawn while she sails', () => {
  it('in within 150 s of sailing at 6 kt, every slice of it within its budget', async () => {
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo: '', current: 'real', tideDate: '2026-11-14', traffic: 0, fleet: 0, opponents: [], windKind: 'west', windKt: 14 } as Settings, 1, { freeSail: true });
    w.step(DT);
    const p = LL(37.7955, -122.512); w.user.x = p.x; w.user.y = p.y; w.step(DT);
    const slip = SLIPS.find(s => s.marina === 'gashouse-cove')!;
    w.setDest(slip.p, 'Her slip');
    const t0 = performance.now(), V = 6 * 1852 / 3600, h = 75 * Math.PI / 180; // (6 kt, in toward the Gate)
    let plan = null as ReturnType<typeof passageLive>, last = t0;
    liveSlices.length = 0;
    while (!plan && performance.now() - t0 < 150_000) {
      await new Promise(r => setTimeout(r, 16));
      const now = performance.now(), dt = (now - last) / 1000; last = now;
      w.user.x += Math.sin(h) * V * dt; w.user.y += Math.cos(h) * V * dt; // (sailing, her clock with her)
      (w as unknown as { t: number }).t += dt; // (her clock on as she sails: the plan is asked again every two minutes of it too)
      plan = passageLive(w);
    }
    const s = (performance.now() - t0) / 1000; 
    expect(plan, `no plan after ${s.toFixed(0)} s, ${(s * V).toFixed(0)} m sailed`).not.toBeNull();
    expect(Math.max(...liveSlices), 'the longest slice (ms)').toBeLessThan(12);
  }, 200_000);
});
