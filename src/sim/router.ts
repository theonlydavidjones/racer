import { KT, V, brg, cross, dist, dot, sub, unit, wrap, type Vec } from '../core/math';
import { beatAngle, runAngle } from '../boat/polar';
import { speedInChop } from '../boat/seaway';
import { landDist, manoeuvreS, sailLeg, type SailResult, type LegKind } from './routing';
import type { Outlook } from './outlook';

/**
 * The isochrone router (the owner, 15 November 2026): the fastest way from a to b through the day's wind, the land's lee
 * and the tide, found the way a navigator with a tidal atlas would, not by rules. From the start, every minute, the
 * boat sails every heading she can at her polar speed in the chop (boat/seaway.ts speedInChop) through the wind on the
 * water and the current where she is then (sim/outlook.ts), each tack or jibe costing its time (routing.ts manoeuvreS).
 * The farthest point reached in each direction from the start is kept (the isochrone, the line she can reach in that
 * many minutes); the first to reach the mark, traced back, is the route. So she sails out of a lee into the breeze, or
 * across a tide to the side where it helps, where the time it gains is more than the distance it costs, and never
 * doubles back unless that really is quicker.
 *
 * The method is the one sailing routers use (isochrones: R. W. James, "Application of wave forecasts to marine
 * navigation", US Navy Hydrographic Office, 1957; Hagiwara 1989). Its steps here are estimates chosen for the Bay's
 * scales: STEP_MIN 1 min (100–200 m at her speeds, finer than the lee's and the tide's changes), HEADING_STEP 5°,
 * SECTOR 2° (how finely the front is kept), SHORE 20 m (how close to the land she may sail).
 */
const SHORE = 20;
/** How finely the router works (estimates for the Bay's scales): a front every `step` minutes, headings `heading`° apart,
 * the front kept in `sector`° sectors round the start. COARSE is for quick looks; its minutes can be out by half. */
export interface Grain { step: number; heading: number; sector: number }
export const FINE: Grain = { step: 1, heading: 5, sector: 2 }, COARSE: Grain = { step: 2, heading: 10, sector: 4 };

interface Node { p: Vec; t: number; side: number; parent: number; turn: '' | 'tack' | 'gybe'; kt: number; cur: number }

/** The wind on the water (the air's motion minus the water's), as routing.ts windFor has it with no scenario. */
function windOn(o: Outlook, p: Vec, t: number): { kt: number; from: number } {
  const w = o.wind(p, t), c = o.current(p, t), a = V(w.from);
  const wx = -a.x * w.kt - c.x / KT, wy = -a.y * w.kt - c.y / KT;
  return { kt: Math.hypot(wx, wy), from: brg(-wx, -wy) };
}

/** Polar speed in chop, remembered (it's solved by iteration): as routing.ts chopSpeed. */
const speeds = new Map<string, number>();
function chopSpeed(kt: number, twa: number, hs: number, tp: number): number {
  const k = `${Math.round(kt * 10)},${Math.round(twa * 2)},${Math.round(hs * 50)},${Math.round(tp * 5)}`;
  let v = speeds.get(k);
  if (v == null) { v = speedInChop(Math.round(kt * 10) / 10, Math.round(twa * 2) / 2, Math.round(hs * 50) / 50, Math.round(tp * 5) / 5); if (speeds.size > 100000) speeds.clear(); speeds.set(k, v); }
  return v;
}

/** landDist (routing.ts, to 600 m) remembered here on its own 25 m cells by a number, not a string: the router asks
 * hundreds of thousands of times a plan. */
const near = new Map<number, number>();
function landNear(p: Vec): number {
  const i = Math.round(p.x / 25), j = Math.round(p.y / 25), k = (i + 1e5) * 2e5 + (j + 1e5);
  let v = near.get(k); if (v === undefined) { v = landDist({ x: i * 25, y: j * 25 }); if (near.size > 400000) near.clear(); near.set(k, v); }
  return v;
}
/** Clear water along a segment, at least SHORE m from the land: if the land is farther from its middle than half its
 * length and SHORE (and a cell's error), no point of it is nearer; otherwise looked at every 25 m. */
function clear(p: Vec, q: Vec): boolean {
  const L = dist(p, q), m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  if (landNear(m) > L / 2 + SHORE + 18) return true;
  const n = Math.max(1, Math.ceil(L / 25));
  for (let k = 1; k <= n; k++) { const f = k / n; if (landNear({ x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f }) <= SHORE) return false; }
  return true;
}

/**
 * Route from a to b leaving at minute t0. `arrive`: how close counts as there (m). Gives up after `maxMin` minutes. The
 * result has sailLeg's form (routing.ts SailResult), so the passage, the chart and the laylines read it as they did.
 */
export function routeLeg(o: Outlook, a: Vec, b: Vec, t0: number, arrive = 30, maxMin = 360, grain: Grain = FINE): SailResult {
  const g = routeLegSteps(o, a, b, t0, arrive, maxMin, grain); let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}
/** routeLeg one isochrone at a time: it yields after each minute's front, so a plan can be worked out a slice a frame
 * (sim/navigator.ts passageLive) instead of holding a frame up for a second or two. */
export function* routeLegSteps(o: Outlook, a: Vec, b: Vec, t0: number, arrive = 30, maxMin = 360, grain: Grain = FINE): Generator<void, SailResult, void> {
  const STEP_MIN = grain.step, HEADING_STEP = grain.heading, SECTOR = grain.sector;
  const nodes: Node[] = [{ p: { ...a }, t: t0, side: 0, parent: -1, turn: '', kt: 0, cur: 0 }];
  let front = [0], best = -1;
  const legU = unit(sub(b, a)), w0 = windOn(o, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, t0);
  const off0 = Math.abs(wrap(brg(legU.x, legU.y) - w0.from));
  const kind: LegKind = off0 < beatAngle(w0.kt) + 3 ? 'beat' : off0 > 150 ? 'run' : 'reach';
  if (dist(a, b) <= arrive) return finish(0, true);
  // (which point of each sector of the front is kept: the one farthest out from the start and nearest the mark. Farthest
  // from the start alone, the front lost the boats working round a point of land toward the mark behind it (Raccoon
  // Strait from the Cityfront: never got there); nearest the mark alone, it kept boats that had come no way and turned
  // twice as often. On the Yellow Bluff, Horseshoe Bay and Raccoon cases this one was quickest, with the fewest turns)
  const score = (q: Vec) => dist(q, a) - dist(q, b);
  // (a front that stops gaining on the mark, its nearest point no nearer for STALL minutes: the router's grain can't
  // thread the last of the way in, or she's stuck. From that point she sails the rest by the rules, routing.ts sailLeg)
  const STALL = 10; let nearD = dist(a, b), nearStep = 0;
  for (let step = 0; step * STEP_MIN < maxMin && best < 0; step++) {
    const sectors = new Map<number, number>(); // sector → node index, the farthest from the start
    for (const i of front) {
      const n = nodes[i], w = windOn(o, n.p, n.t), c = o.current(n.p, n.t), ch = o.chop(n.p, n.t);
      if (w.kt < 0.5) continue; // (becalmed here: she waits for the tide to carry her, which the next minute's front shows)
      const beat = beatAngle(w.kt);
      // (her beat angle, every HEADING_STEP from there, and her run angle exactly: the angles a navigator sails)
      const run = runAngle(w.kt), twas: number[] = []; for (let x = beat; x <= 180; x += HEADING_STEP) twas.push(x); if (!twas.some(x => Math.abs(x - run) < 0.5)) twas.push(run);
      for (const twa of twas) for (const sd of [1, -1]) {
        if (twa === 180 && sd < 0) continue;
        const h = w.from - sd * twa, v = chopSpeed(w.kt, twa, ch.hs, ch.tp); // (sd +1: wind from starboard, starboard tack/jibe)
        // a tack or jibe costs its time, drifting with the current: the minute's sailing is that much shorter
        const turn: Node['turn'] = n.side && sd !== n.side ? (twa < 90 ? 'tack' : 'gybe') : '', lost = turn ? manoeuvreS(turn, w.kt, ch.hs) : 0;
        const secs = STEP_MIN * 60, sail = Math.max(0, secs - lost), d = V(h);
        const q = { x: n.p.x + d.x * v * sail + c.x * secs, y: n.p.y + d.y * v * sail + c.y * secs };
        if (!clear(n.p, q)) continue;
        const idx = nodes.length; nodes.push({ p: q, t: n.t + STEP_MIN, side: sd, parent: i, turn, kt: w.kt, cur: dot(c, legU) / KT });
        // there: this minute's segment passes within `arrive` of the mark
        const s = sub(q, n.p), L2 = s.x * s.x + s.y * s.y, f = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(b, n.p), s) / L2)) : 0;
        if (dist({ x: n.p.x + s.x * f, y: n.p.y + s.y * f }, b) <= arrive) {
          nodes[idx].p = { x: n.p.x + s.x * f, y: n.p.y + s.y * f }; nodes[idx].t = n.t + STEP_MIN * f;
          if (best < 0 || nodes[idx].t < nodes[best].t) best = idx;
          continue;
        }
        const r = sub(q, a), key = Math.round(brg(r.x, r.y) / SECTOR), cur = sectors.get(key);
        if (cur == null || score(q) > score(nodes[cur].p)) sectors.set(key, idx);
      }
    }
    if (best >= 0) break;
    front = [...sectors.values()];
    if (!front.length) return finish(0, false, 'land');
    let k = front[0]; for (const i of front) if (dist(nodes[i].p, b) < dist(nodes[k].p, b)) k = i;
    const dk = dist(nodes[k].p, b);
    if (dk < nearD - 10) { nearD = dk; nearStep = step; }
    else if ((step - nearStep) * STEP_MIN >= STALL) {
      const n = nodes[k], r = sailLeg(o, n.p, b, n.t, 'middle', undefined, arrive, Math.max(10, maxMin - (n.t - t0)));
      return r.ok ? finish(k, true, undefined, r) : finish(k, false, 'time');
    }
    yield;
  }
  if (best < 0) { // (out of time: the front's point nearest the mark)
    let k = front[0]; for (const i of front) if (dist(nodes[i].p, b) < dist(nodes[k].p, b)) k = i;
    return finish(k, false, 'time');
  }
  return finish(best, true);

  function finish(end: number, ok: boolean, why?: 'land' | 'time', rescue?: SailResult): SailResult {
    let chain: Node[] = []; for (let i = end; i >= 0; i = nodes[i].parent) chain.unshift(nodes[i]);
    // the last board into the mark sailed exactly (routing.ts sailLeg: her beat or run angle on the layline the current
    // makes): the router's headings are 5° apart, and the board she lays the mark on is the one the chart's laylines draw
    let tail: SailResult | null = rescue ?? null, tailKind: 'tack' | 'gybe' | null = null;
    // (from the earliest of her last three turns whose laid board (one tack or jibe onto the layline at most) gets there within 2 minutes or 3% of the router's
    // time, what the 5° steps and the minute's grain can be out by: so a jink in the last minute onto the mark goes, and
    // the board she lays it on is her last)
    const endT = chain[chain.length - 1].t, slack = Math.max(2, 0.03 * (endT - t0));
    const turnsAt = chain.map((n, k) => n.turn ? k : -1).filter(k => k > 0).slice(-3);
    if (ok && !rescue) find: for (const li of turnsAt) for (const plan of ['middle', 'left', 'right'] as const) {
      // (left starts on starboard, right on port, looking up the wind: whichever lays it on one board)
      const from = chain[li - 1], r = sailLeg(o, from.p, b, from.t, plan, undefined, arrive, 90);
      if (r.ok && r.turns.length <= 1 && from.t + r.minutes <= endT + slack) { tail = r; tailKind = chain[li].turn as 'tack' | 'gybe'; chain = chain.slice(0, li); break find; }
    }
    // (a point every half step: the drawn track's points are no farther apart than a boat sails in 30 s)
    const path: { p: Vec; t: number }[] = [];
    chain.forEach((n, k) => { if (k) { const m = chain[k - 1]; path.push({ p: { x: (m.p.x + n.p.x) / 2, y: (m.p.y + n.p.y) / 2 }, t: (m.t + n.t) / 2 }); } path.push({ p: n.p, t: n.t }); });
    if (tail) path.push(...tail.path.slice(1));
    const turns = chain.filter(n => n.turn).map(n => ({ p: nodes[n.parent].p, kind: n.turn as 'tack' | 'gybe' }));
    if (tail) { if (tailKind) turns.push({ p: chain[chain.length - 1].p, kind: tailKind }); turns.push(...tail.turns); }
    let maxLeft = 0, maxRight = 0, minShore = Infinity, sumKt = 0, sumCur = 0;
    for (const n of chain) { const xt = cross(legU, sub(n.p, a)); maxLeft = Math.max(maxLeft, xt); maxRight = Math.max(maxRight, -xt); minShore = Math.min(minShore, landDist(n.p)); sumKt += n.kt; sumCur += n.cur; }
    const m = Math.max(1, chain.length - 1);
    return { ok, why, minutes: path[path.length - 1].t - t0, kind, path, tacks: turns.length, turns, meanKt: sumKt / m, meanCurAlong: sumCur / m, maxLeft, maxRight, minShore };
  }
}
