import { describe, expect, it } from 'vitest';
import { realRace } from '../src/sim/realRaces';
import { courseFile } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { outlookFor } from '../src/sim/outlook';
import { planLegs } from '../src/sim/strategist';
import { SHORE_CALL_ON, tooShoal } from '../src/sim/routing';
import { onLand } from '../src/geo/shore';

// The Cityfront on 7 Nov 2026's ebb (GGYC_T00227699-r1): the runs to Fort Mason, against the stream.
describe('working the shore against a foul tide (routing.ts shoreLeg)', () => {
  const r = realRace('GGYC_T00227699-r1')!;
  const S: Settings = { ...DEFAULT_SETTINGS, mode: 'race', course: r.courseId, tideDate: r.date, tideTime: r.start, windKind: 'auto', windKt: 0, current: 'real', sea: 'real', opponents: [], fleet: 0 };
  const w = new World(courseFile(r.courseId), S, 7), legs = planLegs(w, outlookFor(w));
  const runs = legs.filter(L => L.name.includes('Fort Mason'));
  it('is worked out on the Fort Mason runs, quicker than straight down the course, and keeps off the land and the shoals', () => {
    expect(runs.length).toBe(2);
    for (const L of runs) {
      const P = L.plans.shore;
      expect(P.ok).toBe(true);
      expect(P.minutes).toBeLessThan(L.plans.middle.minutes);
      // every 5 m along the track: in the water, and outside the chart's shoals, but for the last 400 m to the mark
      const pts = P.path.map(q => q.p);
      let bad = 0;
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k], d = Math.hypot(b.x - a.x, b.y - a.y);
        for (let s = 0; s < d; s += 5) {
          const p = { x: a.x + (b.x - a.x) * s / d, y: a.y + (b.y - a.y) * s / d };
          if (Math.hypot(p.x - L.to.x, p.y - L.to.y) > 400 && (onLand(p) || tooShoal(p))) bad++;
        }
      }
      expect(bad).toBe(0);
    }
  });
  it('is not the call while the shore relief has no source (SHORE_CALL_ON)', () => {
    expect(SHORE_CALL_ON).toBe(false);
    for (const L of legs) expect(L.best).not.toBe('shore');
  });
}, 120000);
