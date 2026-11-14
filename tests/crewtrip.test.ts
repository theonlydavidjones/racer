import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { buildCrew, ground, syncCrew } from '../src/render/crew';

/**
 * The crew move about the boat smoothly: no snapping, no feet sliding on the deck, setting off and stopping eased (the
 * owner's jitter, which Crew Model measured as mostly the figures' trips, not their changes of seat).
 *
 * An AI boat racing in the Bay's westerly and sea, her helm and crew sailing her, every figure drawn each step
 * (render/crew.ts), measuring:
 * - the hips' fastest speed and acceleration (a pose jumping to a new place carried them at up to 5.3 m/s, setting off at
 *   136 m/s², before the spring was held to a person's pace: crew.ts HIP);
 * - the fastest hand or foot (a high step's lift, or a foot popped up onto the coaming's edge: 13 to 40 m/s in a frame);
 * - a planted foot sliding across the deck (not in a step's swing, down on what's under it, yet moving).
 */
function race(kt: number, secs: number, seed = 3) {
  const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, tideDate: '2026-07-11', current: 'slack', sea: 'real', traffic: 0, mode: 'race', fleet: 2, opponents: ['stock:1', 'stock:2'] } as Settings;
  const w = new World(COURSES[0], S, seed, {}), b = w.boats.find(x => !x.isUser)!;
  const cr = buildCrew(b.crew!.spec.helm, b.crew!.spec.crew, [1, 2, 3], 1), figs = [cr.helm, ...cr.crew];
  type P = { hip: number[]; v: number[]; feet: number[][]; hands: number[][] };
  const prev: (P | undefined)[] = figs.map(() => undefined);
  const out = figs.map(() => ({ slide: 0, slideFast: 0, maxHip: 0, maxLimb: 0, maxAcc: 0 }));
  while (w.t < secs) {
    w.step(DT);
    syncCrew(cr, b.rel >= 0 ? 1 : -1, b.crew, DT, false, undefined, b.heel, b.tacking);
    if (w.t < 5) continue; // (from the start: everyone put straight in their places)
    figs.forEach((f, i) => {
      const c = f.cur!, o = out[i], q = prev[i];
      const now: P = { hip: [c.hip.x, c.hip.y, c.hip.z], v: [0, 0], feet: c.feet.map(p => [p.x, p.y, p.z]), hands: c.hands.map(p => [p.x, p.y, p.z]) };
      if (q) {
        const d = (a: number[], z: number[]) => Math.hypot(a[0] - z[0], a[1] - z[1], a[2] - z[2]) / DT;
        now.v = [(now.hip[0] - q.hip[0]) / DT, (now.hip[2] - q.hip[2]) / DT];
        o.maxHip = Math.max(o.maxHip, d(now.hip, q.hip));
        o.maxAcc = Math.max(o.maxAcc, Math.hypot(now.v[0] - q.v[0], now.v[1] - q.v[1]) / DT);
        for (let k = 0; k < 2; k++) {
          const a = now.feet[k], z = q.feet[k];
          o.maxLimb = Math.max(o.maxLimb, d(a, z), d(now.hands[k], q.hands[k]));
          // (planted: not in a step's swing, down on what's under it, not lifting)
          const planted = !f.swing?.[k] && a[1] < ground(a[0], a[2]) + 0.08 && Math.abs(a[1] - z[1]) < 0.003, h = Math.hypot(a[0] - z[0], a[2] - z[2]);
          if (planted && h > 0.0005) { o.slide += h; if (h / DT > 0.3) o.slideFast += DT; }
        }
      }
      prev[i] = now;
    });
  }
  const mins = (secs - 5) / 60;
  return out.map((o, i) => ({ who: i ? `crew ${i}` : 'helm', slide: o.slide / mins, slideFast: o.slideFast, maxHip: o.maxHip, maxLimb: o.maxLimb, maxAcc: o.maxAcc }));
}

describe('The crew move about the boat smoothly (render/crew.ts)', () => {
  for (const kt of [6, 14, 22]) it(`an AI boat racing in ${kt} kt, six minutes`, () => {
    const r = race(kt, 360);
    console.log(`${kt} kt\n` + r.map(o => `  ${o.who}: hips at most ${o.maxHip.toFixed(2)} m/s and ${o.maxAcc.toFixed(1)} m/s², a hand or foot at most ${o.maxLimb.toFixed(2)} m/s, planted feet sliding ${o.slide.toFixed(2)} m/min (faster than 0.3 m/s for ${o.slideFast.toFixed(1)} s)`).join('\n'));
    for (const o of r) {
      const t = `${o.who} in ${kt} kt`;
      // (crew.ts HIP: 2 m/s along the deck and 1.6 up or down at most, together about 2.6; setting off and pulling up at
      // 8 m/s² at most, measured along the deck. Both above a person's own pace for now: HIP's comment)
      expect(o.maxHip, `${t}: the hips' fastest, m/s`).toBeLessThan(2.7);
      expect(o.maxAcc, `${t}: the hips' sharpest start or stop, m/s²`).toBeLessThan(8.5);
      // (a step's swing at its quickest, a hand to its place at LIMB_SPEED with the hips moving too: measured up to 6.5)
      expect(o.maxLimb, `${t}: the fastest hand or foot, m/s`).toBeLessThan(7);
      // (feet put down where a pose has them glide there, the last of it: measured up to 1.5 m a minute, 5.5 s of it faster
      // than 0.3 m/s in six minutes. To be brought down: they should step, not glide)
      expect(o.slide, `${t}: planted feet sliding, m a minute`).toBeLessThan(2);
    }
  }, 600000);
});
