import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { dist } from '../src/core/math';
import { passageNow, passagePlan } from '../src/sim/navigator';

// the owner: "a realistic course estimate on the cruise chart: not only the navigator's route round land, but the
// course she'd actually sail, with the tacks (or gybes) on legs that are upwind or dead downwind ... the sailed
// distance and an ETA", the in-game navigator and the chart agreeing.
const S = (o: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, mode: 'sail', sailFrom: 'cityfront', sailTo: 'crissy', tideDate: '2026-07-11', tideTime: '12:00', current: 'real', sea: 'flat', ...o });
const at = (o: Partial<Settings>) => new World(COURSES[0], S(o), 7, { freeSail: true });

describe('the passage she would sail leaving now', () => {
  it('is the one the passage plan is worked from (one passage for the plan, the chart and the tide graph)', () => {
    const w = at({}), pn = passageNow(w)!, pl = passagePlan(w)!;
    expect(pl.route).toEqual(pn.route); expect(pl.track).toEqual(pn.track);
    expect(passageNow(w)).toBe(pn); // (worked out once, while nothing's changed)
  });

  it('beats to a mark upwind: tacks on the way, sails further than the straight line, and arrives when the track does', () => {
    const w = at({}), pn = passageNow(w)!; // (the Cityfront to off Crissy Field: west, into the westerly)
    expect(pn.ok).toBe(true);
    expect(pn.legs.some(l => l.kind === 'beat')).toBe(true);
    expect(pn.tacks.length).toBeGreaterThan(0);
    const straight = dist({ x: w.user.x, y: w.user.y }, w.dest!.p);
    expect(pn.sailedM).toBeGreaterThan(straight * 1.2); // (a beat at about 45° each side: √2 the distance, less the current's help)
    expect(pn.eta).toBeCloseTo(pn.track[pn.track.length - 1].t, 6); expect(pn.eta! - pn.leave).toBeCloseTo(pn.minutes, 6);
    // each tack is on her track
    for (const q of pn.tacks) expect(Math.min(...pn.track.map(r => dist(r.p, q)))).toBeLessThan(60);
  });

  it('runs to a mark downwind and reaches across: no tacks on a reach', () => {
    const run = passageNow(at({ sailFrom: 'crissy', sailTo: 'cityfront' }))!;
    expect(run.ok).toBe(true); expect(run.legs.every(l => l.kind !== 'beat')).toBe(true); expect(run.tacks.length).toBe(0);
  });

  it('takes the current: the same passage at slack water and on the real tide arrives at different times', () => {
    const real = passageNow(at({ tideTime: '15:00' }))!, slack = passageNow(at({ tideTime: '15:00', current: 'slack' }))!;
    expect(real.ok && slack.ok).toBe(true);
    expect(Math.abs(real.minutes - slack.minutes)).toBeGreaterThan(0.5);
  });
});

import { sailLeg } from '../src/sim/routing';
import { beatAngle } from '../src/boat/polar';
import { LL } from '../src/geo/geo';
import { KT, V, brg, wrap } from '../src/core/math';
import { onLand } from '../src/geo/shore';
import type { Outlook } from '../src/sim/outlook';

/** A plain day for sailLeg: one wind and one current everywhere, flat water. */
const plain = (kt: number, from: number, cur: { kt: number; to: number }): Outlook => {
  const c = V(cur.to), cv = { x: c.x * cur.kt * KT, y: c.y * cur.kt * KT };
  return { t0: 0, stations: null, wind: () => ({ kt, from, gust: 1 }), current: () => cv, windOnWater: () => ({ kt, from }),
    sea: () => { throw new Error('not used'); }, chop: () => ({ hs: 0, tp: 2 }), breeze: () => ({ kt, from, gust: 1 }) } as unknown as Outlook;
};

describe('sailLeg (the review of the course estimate)', () => {
  it("doesn't hold a fetch she can't lay: a cross-tide setting her to leeward makes a reach a beat, tacked on the layline", () => {
    // 8 kt from 000; the mark 1500 m on 310° (a close reach on paper); a knot of current setting 220°, to leeward
    const a = LL(37.8350, -122.4000), u = V(310), b = { x: a.x + u.x * 1500, y: a.y + u.y * 1500 };
    expect(onLand(a) || onLand(b)).toBe(false);
    const r = sailLeg(plain(8, 0, { kt: 1, to: 220 }), a, b, 0, 'middle');
    expect(r.ok).toBe(true); expect(r.turns.length).toBeGreaterThan(0); expect(r.turns.every(q => q.kind === 'tack')).toBe(true);
    // and tacks as a boat would: a few on a 0.8 nm fetch, none a few seconds after the last (the review: bursts of them)
    expect(r.turns.length).toBeLessThanOrEqual(3);
    const tt = r.turns.map(q => r.path.find(x => dist(x.p, q.p) < 1)!.t);
    for (let i = 1; i < tt.length; i++) expect((tt[i] - tt[i - 1]) * 60, `tack ${i}`).toBeGreaterThan(30);
    // and never closer to the wind, through the water, than she can sail (her polar's beat angle, less a little for the
    // wind's own bend by the current)
    const beat = beatAngle(8);
    for (let i = 1; i < r.path.length; i++) {
      const d = { x: r.path[i].p.x - r.path[i - 1].p.x, y: r.path[i].p.y - r.path[i - 1].p.y }, dt = (r.path[i].t - r.path[i - 1].t) * 60;
      if (dt <= 0 || r.turns.some(q => dist(q.p, r.path[i - 1].p) < 1)) continue; // (not across a tack: she's stopped in it, drifting)
      const cv = V(220), wv = { x: d.x / dt - cv.x * KT, y: d.y / dt - cv.y * KT }; // (through the water)
      expect(Math.abs(wrap(brg(wv.x, wv.y) - 0)), `step ${i}`).toBeGreaterThan(beat - 8);
    }
  });

  it('runs on from where she rounded each turn of the route: the track has no jumps', () => {
    const pn = passageNow(at({ sailTo: 'raccoon' }))!;
    expect(pn.route.length).toBeGreaterThan(2);
    let worst = 0; for (let i = 1; i < pn.track.length; i++) worst = Math.max(worst, dist(pn.track[i - 1].p, pn.track[i].p));
    expect(worst).toBeLessThan(110); // (a point every 30 s at most: about 3 m/s × 30 s, and the current)
  });

  it('is worked out again when the conditions change under way (the pause menu: World.applyConditions)', () => {
    const w = at({}), a = passageNow(w)!;
    w.applyConditions({ ...w.settings, current: 'slack' });
    const b = passageNow(w)!; expect(b).not.toBe(a);
  });
});

describe('the laylines drawn with the passage', () => {
  // the owner: "I don't understand how the laylines work, since the course plotting doesn't follow those laylines"
  for (const [from, to, tt] of [['alcatraz', 'crissy', '15:00'], ['cityfront', 'crissy', '12:00'], ['pier39', 'gate', '15:00'], ['alcatraz', 'gate', '13:00']] as const)
    it(`${from} to ${to} at ${tt}: her last board into the mark is on one of them (within 5°)`, () => {
      const pn = passageNow(at({ sailFrom: from, sailTo: to, tideTime: tt }))!;
      expect(pn.ok).toBe(true); expect(pn.laylines).not.toBe(null);
      const tr = pn.track, end = tr[tr.length - 1].p, lastTurn = pn.tacks.concat(pn.gybes).reduce((a, q) => {
        const i = tr.findIndex(r => dist(r.p, q) < 1); return i > a ? i : a; }, -1);
      expect(lastTurn).toBeGreaterThan(0);
      // the last board's track over the ground, from just after the turn (she's drifting in it) to the mark
      const st = tr[Math.min(tr.length - 2, lastTurn + 1)].p, dir = Math.atan2(end.x - st.x, end.y - st.y) * 180 / Math.PI;
      const off = Math.min(...pn.laylines!.tracks.map(g => Math.abs(wrap(dir - Math.atan2(g.x, g.y) * 180 / Math.PI))));
      expect(off).toBeLessThan(5);
    });
});

describe('passages along a shore', () => {
  // the review's survey: tacking up the middle, the lanes either side of the course met the shore (the Gate to Pier 39
  // and the Bay Bridge downwind in 8 kt, Berkeley to Belvedere upwind): she sails it the long board first instead
  for (const [from, to] of [['gate', 'pier39'], ['berkeley', 'belvedere']] as const)
    it(`${from} to ${to} in 8 kt gets there`, () => {
      const pn = passageNow(at({ sailFrom: from, sailTo: to, windKt: 8, tideTime: '15:00' }))!;
      expect(pn.ok, pn.why).toBe(true);
    }, 30_000);
});

import { beatInChop } from '../src/boat/seaway';
describe('the same plan whatever was planned before it', () => {
  it("beatInChop remembers the angle for its rounded key, not for whoever asked first (the review's survey: a plan changed with the order)", () => {
    const a = beatInChop(8.13, 0.211, 2.43), b = beatInChop(8.11, 0.209, 2.41); // (the same key: 8.25 kt... 0.2 m, 2.4 s)
    expect(a).toBe(b);
  });
  it('Berkeley to Belvedere in 8 kt in the real sea gets there (it ran ashore depending on what came before)', () => {
    const pn = passageNow(at({ sailFrom: 'berkeley', sailTo: 'belvedere', windKt: 8, tideTime: '15:00', sea: 'real' }))!;
    expect(pn.ok, pn.why).toBe(true);
  }, 30_000);
});
