// On Nav, the tiller pilot follows the navigator's plotted course, not the rhumb line (the owner, r253 / ROADMAP 8q5:
// "when in autonav, the boat doesn't seem to be following the plotted course. it just follows the rhum line to the
// destination. this is bad, especially if the plotted route is avoiding a strong tide or wind shadows"). The page sends
// the plan's corners (commands.ts navPlan, as app.ts does when a plan comes in); she's sailed on the pilot to the
// destination and kept within OFF_M of the plotted track the whole way.
// - Cityfront to north of Treasure Island, 14 Nov 13:00 in 14 kt: the plan bends ~550 m off the rhumb line for the tide.
// - Cityfront to off Belvedere Point, 14 Nov 09:00: a plan with a tack in it, which she makes where the plan does.
import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { engage } from '../src/boat/autopilot';
import { applyCommand } from '../src/sim/commands';
import { helmPoints, passageNow } from '../src/sim/navigator';
import { segPt, type Vec } from '../src/core/math';

const OFF_M = 80;
const off = (p: Vec, tr: Vec[]) => { let d = Infinity; for (let i = 1; i < tr.length; i++) d = Math.min(d, segPt(p, tr[i - 1], tr[i])); return d; };

function sail(sailTo: string, tideTime: string) {
  const S = { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo, current: 'real', tideDate: '2026-11-14', tideTime, traffic: 0, fleet: 0, opponents: [], windKind: 'west', windKt: 14 } as Settings;
  const w = new World(COURSES[0], S, 1, { freeSail: true }); for (let i = 0; i < 30; i++) w.step(DT); w.drainEvents();
  const pn = passageNow(w as never)!, tr = pn.track.map(q => q.p), rhumb = Math.max(...tr.map(p => segPt(p, tr[0], w.dest!.p)));
  engage(w.user, w.pilot, 'nav');
  applyCommand(w, { k: 'navPlan', to: { ...w.dest!.p }, pts: helmPoints(pn) } as never);
  let worst = 0, at = 0; const t0 = w.t;
  while (w.t - t0 < pn.minutes * 60 * 1.5 && (w as unknown as { arrivedT: number | null }).arrivedT == null) {
    w.step(DT);
    if (w.steps % 50 === 0) { const d = off(w.user, tr); if (d > worst) { worst = d; at = (w.t - t0) / 60; } }
  }
  return { worst, at, rhumb, arrived: (w as unknown as { arrivedT: number | null }).arrivedT != null, min: (w.t - t0) / 60, plan: pn.minutes };
}

describe('Nav follows the plotted course', () => {
  for (const [to, tt, why] of [['ti-north', '13:00', 'bent for the tide'], ['belvedere', '09:00', 'with a tack']]) it(`Cityfront to ${to} at ${tt}: ${why}, within ${OFF_M} m of the plan`, () => {
    const r = sail(to, tt);
    console.log(`${to} ${tt}: the plan ${r.plan.toFixed(1)} min, ${r.rhumb.toFixed(0)} m off the rhumb at most; sailed ${r.min.toFixed(1)} min, arrived ${r.arrived}, at most ${r.worst.toFixed(0)} m off the plan (${r.at.toFixed(1)} min in)`);
    expect(r.arrived).toBe(true);
    expect(r.worst, 'the farthest she was from the plotted course (m)').toBeLessThan(OFF_M);
  }, 600_000);
});
