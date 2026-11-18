// On Nav, the tiller pilot follows the navigator's plotted course, not the rhumb line (the owner, r253 / ROADMAP 8q5:
// "when in autonav, the boat doesn't seem to be following the plotted course. it just follows the rhum line to the
// destination. this is bad, especially if the plotted route is avoiding a strong tide or wind shadows"). The page sends
// the plan's corners (commands.ts navPlan, as app.ts does when a plan comes in); she's sailed on the pilot to the
// destination and kept within OFF_M of the plotted track the whole way.
// - Cityfront to north of Treasure Island, 14 Nov 13:00 in 14 kt: the plan bends ~550 m off the rhumb line for the tide.
// - Cityfront to off Belvedere Point, 14 Nov 09:00: a plan with a tack in it, which she makes where the plan does.
// - Plans replaced as she sails (the page's each minute or so: here each five), and under power (straight, as before).
import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { engage } from '../src/boat/autopilot';
import { applyCommand } from '../src/sim/commands';
import { HelmFeed, helmPoints, passageNow } from '../src/sim/navigator';
import { segPt, type Vec } from '../src/core/math';

const OFF_M = 80;
const off = (p: Vec, tr: Vec[]) => { let d = Infinity; for (let i = 1; i < tr.length; i++) d = Math.min(d, segPt(p, tr[i - 1], tr[i])); return d; };

function sail(sailTo: string, tideTime: string, o: { replan?: boolean; motor?: boolean; noPlan?: boolean } = {}) {
  const S = { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo, current: 'real', tideDate: '2026-11-14', tideTime, traffic: 0, fleet: 0, opponents: [], windKind: 'west', windKt: 14 } as Settings;
  const w = new World(COURSES[0], S, 1, { freeSail: true }); for (let i = 0; i < 30; i++) w.step(DT); w.drainEvents();
  const pn = passageNow(w as never)!, tr = pn.track.map(q => q.p), rhumb = Math.max(...tr.map(p => segPt(p, tr[0], w.dest!.p)));
  const u = w.user;
  if (o.motor) { u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false } as never; u.motor = { hp: 6, down: true, running: true, gear: 'F', throttle: 0.6 } as never; }
  engage(u, w.pilot, 'nav');
  if (!o.noPlan) applyCommand(w, { k: 'navPlan', to: { ...w.dest!.p }, pts: helmPoints(pn) } as never);
  let worst = 0, at = 0, cur = tr, lastPlan = w.t; const t0 = w.t, tacked: Vec[] = []; let tack = u.tack;
  while (w.t - t0 < pn.minutes * 60 * 1.5 && (w as unknown as { arrivedT: number | null }).arrivedT == null) {
    w.step(DT);
    if (u.tack !== tack) { tacked.push({ x: u.x, y: u.y }); tack = u.tack; }
    if (w.steps % 50 === 0) {
      const d = off(u, cur); if (d > worst) { worst = d; at = (w.t - t0) / 60; }
    }
    // (as the page does: a fresh plan now and then, from where she is, picked up at the leg she's on)
    if (o.replan && w.t - lastPlan >= 300) { lastPlan = w.t; const q = passageNow(w as never); if (q?.ok) { cur = q.track.map(x => x.p); applyCommand(w, { k: 'navPlan', to: { ...w.dest!.p }, pts: helmPoints(q) } as never); } }
  }
  return { end: { x: u.x, y: u.y }, worst, at, rhumb, tacks: pn.tacks, tacked, arrived: (w as unknown as { arrivedT: number | null }).arrivedT != null, min: (w.t - t0) / 60, plan: pn.minutes };
}

describe('Nav follows the plotted course', () => {
  it('Cityfront to north of Treasure Island at 13:00: the plan bent for the tide, and she keeps to it', () => {
    const r = sail('ti-north', '13:00');
    console.log(`ti-north: the plan ${r.plan.toFixed(1)} min, ${r.rhumb.toFixed(0)} m off the rhumb at most; sailed ${r.min.toFixed(1)} min, at most ${r.worst.toFixed(0)} m off the plan (${r.at.toFixed(1)} min in)`);
    expect(r.rhumb, 'the plan bends well off the rhumb line (else this proves nothing)').toBeGreaterThan(300);
    expect(r.arrived).toBe(true);
    expect(r.worst, 'the farthest she was from the plotted course (m)').toBeLessThan(OFF_M);
  }, 600_000);
  it('Cityfront to Belvedere at 09:00: she tacks where the plan does', () => {
    const r = sail('belvedere', '09:00');
    const near = r.tacks.map(t => Math.min(...r.tacked.map(q => Math.hypot(q.x - t.x, q.y - t.y))));
    console.log(`belvedere: at most ${r.worst.toFixed(0)} m off the plan; the plan's tacks ${r.tacks.length}, hers ${r.tacked.length}, each of the plan's within ${near.map(d => d.toFixed(0)).join(', ')} m of one of hers`);
    expect(r.tacks.length, 'the plan has a tack').toBeGreaterThan(0);
    expect(r.arrived).toBe(true);
    expect(r.worst).toBeLessThan(OFF_M);
    for (const d of near) expect(d, 'the plan\'s tack, and the nearest of hers (m)').toBeLessThan(60);
  }, 600_000);
  it('a fresh plan every five minutes from where she is, as the page sends them: picked up at the leg she is on', () => {
    const r = sail('ti-north', '13:00', { replan: true });
    console.log(`ti-north, replanned: at most ${r.worst.toFixed(0)} m off the latest plan`);
    expect(r.arrived).toBe(true); expect(r.worst).toBeLessThan(OFF_M);
  }, 600_000);
  it('under power, straight for the destination as before: the sailing plan changes nothing', () => {
    const a = sail('belvedere', '09:00', { motor: true }), b = sail('belvedere', '09:00', { motor: true, noPlan: true });
    expect(a.arrived).toBe(true);
    expect(Object.is(a.end.x, b.end.x) && Object.is(a.end.y, b.end.y) && a.min === b.min, 'the same passage, to the bit, with the plan sent or not').toBe(true);
  }, 600_000);
});

describe('racing: the pilot never takes a page plan', () => {
  it('a race sailed with a plan and Nav sent is the same to the bit as one without (RRS 52: no pilot racing)', () => {
    const S = { ...DEFAULT_SETTINGS, mode: 'race', current: 'real', tideDate: '2026-11-14', fleet: 3 } as Settings;
    const run = (send: boolean) => {
      const w = new World(COURSES[0], S, 4); const u = w.user, d = { x: u.x + 2000, y: u.y + 1500 };
      for (let i = 0; i < 60 * 240; i++) {
        if (send && i % 600 === 0) { applyCommand(w, { k: 'pilot', op: 'engage', mode: 'nav' }); applyCommand(w, { k: 'navPlan', to: d, pts: [{ x: u.x, y: u.y }, { x: u.x + 500, y: u.y - 300 }, d] } as never); }
        w.step(DT);
      }
      return w.boats.flatMap(b => [b.x, b.y, b.h, b.v]);
    };
    const a = run(true), b = run(false);
    expect(a.every((v, i) => Object.is(v, b[i]))).toBe(true);
  }, 300_000);
});

describe('the helm asks for a plan on events, not on a timer (HelmFeed)', () => {
  it('Cityfront to north of Treasure Island: a handful of plans for the passage, where a plan each 150 m or 2 min was dozens, and she keeps to them', () => {
    const S = { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo: 'ti-north', current: 'real', tideDate: '2026-11-14', tideTime: '13:00', traffic: 0, fleet: 0, opponents: [], windKind: 'west', windKt: 14 } as Settings;
    const w = new World(COURSES[0], S, 1, { freeSail: true }); for (let i = 0; i < 30; i++) w.step(DT); w.drainEvents();
    (w as unknown as { running: boolean }).running = true;
    const feed = new HelmFeed(v => passageNow(v as never)); let cur: Vec[] = [], worst = 0, timer = 0, key = '';
    engage(w.user, w.pilot, 'nav'); const t0 = w.t;
    while (w.t - t0 < 60 * 60 && (w as unknown as { arrivedT: number | null }).arrivedT == null) {
      if (w.steps % 60 === 0) { // (a frame a second of her clock)
        const c = feed.tick(w as never); if (c) { applyCommand(w, c as never); cur = [{ x: w.user.x, y: w.user.y }, ...c.pts]; }
        const k = `${Math.round(w.user.x / 150)},${Math.round(w.user.y / 150)}|${Math.floor(w.clockUtc / 2)}`; if (k !== key) { key = k; timer++; } // (the old cadence)
        if (cur.length > 1) worst = Math.max(worst, off(w.user, cur));
      }
      w.step(DT);
    }
    console.log(`HelmFeed: ${feed.taken} plans taken for the passage (${((w.t - t0) / 60).toFixed(1)} min); the old cadence started ${timer}; at most ${worst.toFixed(0)} m off the plan she had`);
    expect((w as unknown as { arrivedT: number | null }).arrivedT != null).toBe(true);
    expect(feed.taken, 'plans for the passage').toBeLessThan(timer / 3);
    expect(worst).toBeLessThan(OFF_M);
  }, 600_000);
});
