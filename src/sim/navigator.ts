import { KT, LOA, dist, dot, segCross, segPt, sub, unit, type Vec } from '../core/math';
import { heldPast, helmPlan, narrowOn, nextCorner, offLeg, type HelmPlan } from './helmPlan';
import { describeSea } from '../environment/sea';
import { sunTimes } from '../environment/sun';
import { slotFlow, slotWeight } from '../environment/wind';
import { place } from './places';
import { ROUTES, SERVICES, VESSEL } from './traffic';
import type { SimView } from './host';
import { clockOf, nearestStation, outlookFor, stationEvents, type Outlook } from './outlook';
import { FINE, routeLegSteps, trackClear, type Grain } from './router';
import { groundLaylines, landDist, routeAroundSteps, sailLegSteps, type SailResult } from './routing';
import { landAlong } from '../geo/shore';
import { harborAt, harborRouteSteps, slipAt } from '../geo/marina';
import { kt1, mins, nearFeature, type Brief, type BriefItem, type BriefSection } from './brief';

/**
 * The navigator: before a cruise (or any time under way), a passage plan for where you're going, the way a careful
 * skipper makes one: when to leave so the tide carries you, the current gates on the way and when they turn, where the
 * wind will be strongest (the slot), the ship and ferry routes you'll cross and the rules for crossing them, and the
 * hazards. Timeliness and safety, worked out from the same wind and tide the boat sails in (sim/outlook.ts).
 */

export interface PassagePlan extends Brief {
  /** The way round the land, and her track over the ground leaving now. */
  route: Vec[]; track: { p: Vec; t: number }[];
  /** Places to mark on the chart: current gates, crossings of ship and ferry routes. */
  marks: { p: Vec; kind: 'gate' | 'lane' | 'wind'; label: string }[];
}

/** The routes in the traffic model, as a navigator names them. (The sim's tracks are approximate: the real lanes are
 * on NOAA chart 18649.) */
const ROUTE_NAME: Record<string, string> = {
  channel: 'the deep-water ship route', sausalito: 'the Sausalito ferry route', alcatraz: 'the Alcatraz ferry route', tour: 'the bay-cruise boats\' loop'
};

/** The passage by the old rules (routing.ts sailLeg, stretch by stretch along the way round the land, up the middle or
 * the long board first to either side): #406's planner, kept as a floor under the router. */
/**
 * Where the next stretch of a passage starts: from where the last one ended (`end`, within its arrive of the turn) if
 * the next turn can be seen from there clear of the land, else from the turn itself, the track jumping to it. That jump
 * is sailed by nobody and judged by nothing, so it's taken only if it crosses no land and no gap narrower than the
 * pilot's turning room (helmPlan.ts narrowOn); else the next stretch starts where she is and the router finds the way.
 * Jumped regardless, a 119 m jump ran across the Berkeley Pier ruin's west tip, and the pilot was handed over before a
 * gap too narrow that a meter's shift in the plan made or unmade (Deep Physics, 19 Nov 2026, on beat-chop).
 */
function onFrom(end: Vec, turn: Vec, next: Vec | undefined): Vec {
  if (!next) return turn;
  if (landAlong(end, next) === Infinity && landDist(end) > 20) return end;
  return landAlong(end, turn) === Infinity && !narrowOn(end, turn) ? turn : end;
}
function* rulesPassage(o: Outlook, route: Vec[], t: number): Generator<void, { ok: boolean; why?: 'land' | 'time'; minutes: number; track: { p: Vec; t: number }[]; legs: SailResult[] }, void> {
  let tt = t, ok = true, why: 'land' | 'time' | undefined, at = route[0];
  const track: { p: Vec; t: number }[] = [], legs: SailResult[] = [];
  for (let i = 1; i < route.length; i++) {
    const arrive = i === route.length - 1 ? 30 : 120;
    // (each plan's track held, segment by segment, to the router's own test against the piers, wharves, breakwaters and
    // docks: nothing crossed, nothing nearer than WHARF_CLEAR. The rules sail in 10 s steps, ~30 m, and look only for
    // land under her: a pier can lie between two of them, or a few metres off her track)
    const sound = (q: SailResult): SailResult => q.ok && !trackClear(q.path, route[i], arrive) ? { ...q, ok: false, why: 'land' } : q;
    let r = sound(yield* sailLegSteps(o, at, route[i], tt, 'middle', undefined, arrive, 360));
    if (!r.ok && r.why === 'land') for (const pl of ['left', 'right'] as const) { const q = sound(yield* sailLegSteps(o, at, route[i], tt, pl, undefined, arrive, 360)); if (q.ok && (!r.ok || q.minutes < r.minutes)) r = q; }
    legs.push(r); track.push(...(i > 1 ? r.path.slice(1) : r.path)); tt += r.minutes;
    if (!r.ok) { ok = false; why = r.why; break; }
    const end = r.path[r.path.length - 1].p, next = route[i + 1];
    at = onFrom(end, route[i], next);
    if (at === route[i] && next) track.push({ p: { ...route[i] }, t: tt });
  }
  return { ok, why, minutes: tt - t, track, legs };
}

/**
 * A passage from a to b leaving at t, by the isochrone router (sim/router.ts): straight from a to b first, the router
 * finding its own way round the land, the lee and the tide; if it can't (the land between hides the way from its
 * front), stretch by stretch along the way round the land (routeAround), each by the router, and a stretch the router
 * can't sail by the old rules (sailLeg, up the middle or either side). A generator: it yields as the router works,
 * so the page can work a plan out a slice a frame (passageLive).
 */
function* passageSteps(o: Outlook, route: Vec[], t: number, grain: Grain = FINE): Generator<void, { ok: boolean; why?: 'land' | 'time'; minutes: number; track: { p: Vec; t: number }[]; legs: SailResult[] }, void> {
  const a = route[0], b = route[route.length - 1];
  // (first the old rules' plans over the way round the land, which take a moment: the router then has a time to beat, and
  // searches no water it couldn't beat it from. The passage is the quicker: the router's 5° headings and 1-minute fronts
  // can be a few minutes out on a reach the rules sail dead straight)
  const rules = yield* rulesPassage(o, route, t);
  // (the direct try given up after four times the straight line at 2 kn, 20 minutes at least: where the land hides the
  // way from its front it would otherwise search the whole Bay for six hours before the way round the land was tried.
  // An estimate: docs/CONSTANTS.md)
  // (a front that has lost the way given up here, router.ts GIVE_UP, only when the stretches follow to try again)
  const direct = yield* routeLegSteps(o, a, b, t, 30, Math.min(360, Math.max(20, 4 * dist(a, b) / (2 * KT) / 60)), grain, rules.ok ? t + rules.minutes : Infinity, route.length > 2);
  if (direct.ok && (!rules.ok || direct.minutes <= rules.minutes)) return { ok: true, minutes: direct.minutes, track: direct.path, legs: [direct] };
  if (rules.ok && (!direct.ok || rules.minutes < direct.minutes)) return rules;
  if (route.length <= 2) return { ok: direct.ok, why: direct.why, minutes: direct.minutes, track: direct.path, legs: [direct] };
  let tt = t, ok = true, why: 'land' | 'time' | undefined;
  const track: { p: Vec; t: number }[] = [], legs: SailResult[] = [];
  // each stretch from where the last one really ended (she counts as round a turn within 120 m of it, and cuts the
  // corner from there, as a boat does), so the track runs on unbroken and every metre of it is sailed and timed
  let at = route[0];
  for (let i = 1; i < route.length; i++) {
    const arrive = i === route.length - 1 ? 30 : 120;
    let r = yield* routeLegSteps(o, at, route[i], tt, arrive, 360, grain);
    // (the router couldn't: the old rules, up the middle, then the long board first to one side or the other)
    if (!r.ok) for (const pl of ['middle', 'left', 'right'] as const) {
      const q = yield* sailLegSteps(o, at, route[i], tt, pl, undefined, arrive, 360);
      if (q.ok && trackClear(q.path, route[i], arrive) && (!r.ok || q.minutes < r.minutes)) r = q;
    }
    legs.push(r); track.push(...(i > 1 ? r.path.slice(1) : r.path)); tt += r.minutes;
    if (!r.ok) { ok = false; why = r.why; break; } // (stopped where she ran ashore: nothing drawn beyond it)
    // (on from where she is, if she can see the next turn from there clear of the land; or else from the turn itself)
    const end = r.path[r.path.length - 1].p, next = route[i + 1];
    at = onFrom(end, route[i], next);
    if (at === route[i] && next) track.push({ p: { ...route[i] }, t: tt });
  }
  return { ok, why, minutes: tt - t, track, legs };
}

/** The current along her track over the ground (kt, + helping) at each point. */
function alongTrack(o: Outlook, track: { p: Vec; t: number }[]): number[] {
  return track.map((q, i) => {
    const n = track[Math.min(track.length - 1, i + 1)], pr = track[Math.max(0, i - 1)], d = unit(sub(n.p, pr.p));
    return dot(o.current(q.p, q.t), d) / KT;
  });
}

/** A place on the way, by its local name, or else by the nearest NOAA current station's. */
const placeName = (o: Outlook, p: Vec): string => {
  const f = nearFeature(p, 1500); if (f) return f;
  if (o.stations) { const s = nearestStation(o.stations, p); if (dist(s.p, p) < 2000) return `NOAA's station "${s.name}"`; }
  return nearFeature(p, 3000) ?? 'open water';
};

/**
 * The passage leaving now, as she'd sail it: the navigator's way round the land, each stretch sailed at the Folkboat's
 * polar speeds through the forecast wind and NOAA's current as they change on the way (sailLeg: the best VMG angles
 * upwind and down, tacking or gybing on the layline the current makes, crabbing across it on a reach; the polar's
 * angles are her course through the water, so her leeway is in them). The same passage the passage plan, the chart
 * and the setup's tide graph show: worked out once for where she is, where she's going and the minute.
 */
export interface PassageNow {
  route: Vec[]; track: { p: Vec; t: number }[]; ok: boolean; minutes: number; legs: SailResult[];
  /** why she can't get there leaving now: the planner's course ran ashore, or it takes too long (becalmed, or a foul tide) */
  why?: 'land' | 'time';
  /** distance over the ground along her track (m), and where she tacks and gybes */
  sailedM: number; tacks: Vec[]; gybes: Vec[];
  /** the laylines into the destination over the ground (routing.ts groundLaylines: the wind, the chop and the current
   * where she made her last tack or gybe), if she beats or runs the last of the way in: her last board is on one */
  laylines: { kind: 'beat' | 'run'; tracks: [Vec, Vec] } | null;
  /** when she leaves and arrives (minutes since epoch UTC; null if she can't get there leaving now) */
  leave: number; eta: number | null;
}
/**
 * A plan's plotted course for the helm (World.planTarget): its track, from where she was when it was planned, thinned to
 * its corners (Douglas-Peucker, within HELM_TOL m of the track: the tacks, gybes and the bends round a tide or a shadow
 * are corners; the steps along a straight board aren't), and a corner kept wherever the chord would cross land or pass
 * through a gap narrower than GAP_MIN, so the helm never steers a leg the router didn't (sim/helmPlan.ts narrowOn).
 */
export function helmPoints(pn: PassageNow): Vec[] {
  const p = pn.track.map(q => q.p); if (p.length < 3) return p.slice();
  const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1;
  const stack: [number, number][] = [[0, p.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!; let far = -1, fd = HELM_TOL, most = -1, md = -1;
    for (let i = a + 1; i < b; i++) { const d = segPt(p[i], p[a], p[b]); if (d > fd) { fd = d; far = i; } if (d > md) { md = d; most = i; } }
    // (a chord within the tolerance is taken only if the router's track would be: across no land, and through no gap
    // too narrow for the pilot (helmPlan.ts narrowOn), else the track's own corner is kept. Cut without that, rounding
    // the Berkeley Pier ruin's west tip 8 m inside the tolerance, a chord ran across the tip, and a meter's shift in the
    // track flipped the pilot's verdict on it to a gap too narrow: Deep Physics, 19 Nov 2026)
    if (far < 0 && most >= 0 && (landAlong(p[a], p[b]) !== Infinity || narrowOn(p[a], p[b]))) far = most;
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return p.filter((_, i) => keep[i]);
}
/** helmPoints' tolerance (m): about one of her lengths, well inside World.planTarget's 30 m for a corner made, so the
 * pilot's course between two corners is the plotted one to within a boat length (an estimate, not a measured figure). */
const HELM_TOL = 8;
/**
 * On Nav, the navigator's plan to the helm (World.planTarget: the pilot follows the plotted course, not the rhumb line,
 * the owner's r253), as a navPlan command for the page to send. A plan is asked of `plan` (the page's passageLive,
 * worked out between frames) only when something calls for one, not on a timer (the Coordinator, 18 Nov 2026: a plan
 * each 150 m took up to an eighth of the page's thread for the whole passage): the pilot engaged, or a new race; a corner
 * made, or past one and not yet clear to turn for the next; off the plan by more than HELM_OFF m; the wind or the tide at the course changed by more than HELM_WIND, HELM_KT
 * or HELM_TIDE since it was planned; or, failing all of those, HELM_EVERY minutes of the clock on. Meanwhile the helm
 * keeps the plan it has. A plan's taken only if she's within HELM_OFF m of its track (one held over from before she was
 * steered off it waits for the next; one begun some way back, as a long plan is by the time it's in, is taken up at the
 * leg she's on). The corners are counted as the World counts them (sim/helmPlan.ts), on the page's copy of the race.
 */
export class HelmFeed {
  private helm: { pn: PassageNow; P: HelmPlan; world: unknown; t: number; wind: { from: number; kt: number }; tide: number } | null = null;
  private want = true; private nav = false;
  /** How many plans it has asked for, and taken (for the tests). */
  asked = 0; taken = 0;
  constructor(private plan: (w: SimView) => PassageNow | null) {}
  tick(w: SimView): { k: 'navPlan'; to: Vec; pts: Vec[] } | null {
    const nav = w.pilot.mode === 'nav' && w.running && w.cruising && !!w.dest;
    if (!nav || !this.nav || this.helm?.world !== w) { this.helm = null; this.want = true; }
    this.nav = nav; if (!nav) return null;
    const dest = w.dest!.p, u = w.user, h = this.helm;
    if (h && !this.want) {
      const was = h.P.i; nextCorner(h.P, u, dest);
      const dw = Math.abs(((w.wind.from - h.wind.from + 540) % 360) - 180);
      this.want = h.P.i !== was || heldPast(h.P, u) || offLeg(h.P, u) > HELM_OFF || dw > HELM_WIND || Math.abs(w.wind.kt - h.wind.kt) > HELM_KT
        || Math.abs(w.cur.kt - h.tide) > HELM_TIDE || w.clockUtc - h.t >= HELM_EVERY || h.P.to.x !== dest.x || h.P.to.y !== dest.y;
      if (!this.want) return null;
    }
    this.asked++;
    const pn = this.plan(w); if (!pn || pn === h?.pn || !pn.ok || !pn.track.length) return null; // (asked again each frame till it's in)
    const pts = helmPoints(pn), P = helmPlan(dest, pts, u); if (!P || offLeg(P, u) > HELM_OFF) return null; // (she's not on it: the next)
    this.helm = { pn, P, world: w, t: w.clockUtc, wind: { from: w.wind.from, kt: w.wind.kt }, tide: w.cur.kt }; this.want = false; this.taken++;
    return { k: 'navPlan', to: { x: dest.x, y: dest.y }, pts };
  }
}
/** HelmFeed's triggers (estimates, docs/CONSTANTS.md): planned afresh off the plan by HELM_OFF m (a few times what she
 * strays sailing one: tests/nav-follows-plan, 11-26 m), the wind HELM_WIND° or HELM_KT kt off what it was planned in, the
 * tide at the course HELM_TIDE kt, or HELM_EVERY minutes on. */
const HELM_OFF = 100, HELM_WIND = 10, HELM_KT = 3, HELM_TIDE = 0.3, HELM_EVERY = 5;
const nowMemo = new WeakMap<SimView, { key: string; refs: unknown[]; v: PassageNow }>();
/** What a plan is worked out for: where she is and is bound, the minute, and the conditions (changed from the pause
 * menu, World.applyConditions, they're new objects). */
function nowKey(w: SimView, cell = 25, every = 1): { key: string; refs: unknown[] } | null {
  const dest = w.dest; if (!dest) return null;
  const u = w.user, t0 = w.clockUtc;
  return { key: `${Math.round(dest.p.x)},${Math.round(dest.p.y)}|${Math.round(u.x / cell)},${Math.round(u.y / cell)}|${Math.floor(t0 / every)}|${cell}`, refs: [w.weather, w.tide, w.windModel, w.sea] };
}
/** The page's live plan is worked out again each LIVE_M m she sails or LIVE_MIN minutes of the clock (a plan takes a few
 * seconds of the page's spare time, and the passage doesn't change in less). */
const LIVE_M = 150, LIVE_MIN = 2;
const fresh = (m: { key: string; refs: unknown[] } | undefined, k: { key: string; refs: unknown[] }) => !!m && m.key === k.key && m.refs.every((r, i) => r === k.refs[i]);
/** A place inside a marina's basin, for the passage: the marina's entrance nearest it (the middle of the way in). The
 * way between the entrance and her slip, round the docks and along the fairways, is the marina's own (ROADMAP 8m2,
 * Marinas), not the passage's. */
/** Where a passage to a destination ends: bound for a slip, the middle of its harbor's entrance nearest it by water, where the
 * pilot hands her over (geo/marina.ts harborRoute, world.ts navTarget: one mouth for the plan and the pilot); else as
 * outOfBasin. The harbor's flood the first time, a little at a time. */
function* destOut(p: Vec): Generator<void, Vec, void> {
  const s = slipAt(p);
  if (s) { const r = yield* harborRouteSteps(s); if (r) return { ...r.mouth }; }
  return outOfBasin(p);
}
function outOfBasin(p: Vec): Vec {
  const H = harborAt(p); if (!H || !H.exits.length) return p;
  let e = H.exits[0]; for (const x of H.exits) if (dist(x, p) < dist(e, p)) e = x;
  return { ...e };
}
/** The page's plans' outlook, one for a World in its conditions: its caches (the lee, the wind, the current, the chop, by
 * place and time) are memos of the day, so a plan after the first reads them warm (a new outlook for each, every re-plan
 * under way filled them again, ~45 s of work from Mile Rock: the physics review of nav-pace). */
const outlooks = new WeakMap<SimView, { refs: unknown[]; o: ReturnType<typeof outlookFor> }>();
function sharedOutlook(w: SimView) {
  const refs = [w.weather, w.tide, w.windModel, w.sea, w.settings, w.gunUtc], m = outlooks.get(w);
  if (m && m.refs.every((r, i) => r === refs[i])) return m.o;
  const o = outlookFor(w); outlooks.set(w, { refs, o }); return o;
}
function* passageNowSteps(w: SimView): Generator<void, PassageNow | null, void> {
  const dest = w.dest; if (!dest) return null;
  const u = w.user, t0 = w.clockUtc, from = outOfBasin({ x: u.x, y: u.y }), to = yield* destOut(dest.p);
  const o = sharedOutlook(w);
  yield;
  const route = yield* routeAroundSteps(from, to);
  const r = yield* passageSteps(o, route, t0);
  const sailedM = r.track.slice(1).reduce((a, q, i) => a + dist(r.track[i].p, q.p), 0);
  const turns = r.legs.flatMap(l => l.turns), last = r.legs[r.legs.length - 1];
  const lk: 'beat' | 'run' | null = !last ? null : last.turns.length ? (last.turns[last.turns.length - 1].kind === 'gybe' ? 'run' : 'beat') : last.kind === 'reach' ? null : last.kind;
  // (the laylines she tacked or gybed onto: the wind and the current where and when she made her last turn, which is
  // where she saw she'd lay the mark; with no turn on the last stretch, those at the mark when she gets there)
  const lt = last?.turns[last.turns.length - 1], ltT = lt ? r.track.find(q => dist(q.p, lt.p) < 1)?.t : undefined;
  const laylines = lk && r.ok ? { kind: lk, tracks: groundLaylines(o, lt && ltT != null ? lt.p : to, lt && ltT != null ? ltT : t0 + r.minutes, lk) } : null;
  return { route, track: r.track, ok: r.ok, why: r.why, minutes: r.minutes, legs: r.legs, sailedM,
    tacks: turns.filter(q => q.kind === 'tack').map(q => q.p), gybes: turns.filter(q => q.kind === 'gybe').map(q => q.p),
    laylines, leave: t0, eta: r.ok ? t0 + r.minutes : null };
}
/** The passage leaving now, worked out at once (the tests, the brief): remembered for where she is, the minute and the conditions. */
export function passageNow(w: SimView): PassageNow | null {
  const k = nowKey(w); if (!k) return null;
  const m = nowMemo.get(w); if (fresh(m, k)) return m!.v;
  const g = passageNowSteps(w); let r = g.next(); while (!r.done) r = g.next();
  if (r.value) nowMemo.set(w, { ...k, v: r.value });
  return r.value;
}
/**
 * The passage leaving now for the page (the HUD, the chart, the plan): the latest one worked out, while the next is
 * worked out in the background, a few milliseconds at a time between frames (the router takes a second or two, which
 * would hold a frame up). Null until the first is ready; `ready`, if given, is called when a new one is in (for what
 * draws only on demand: the setup's tide graph).
 */
const jobs = new WeakMap<SimView, { key: string; refs: unknown[]; g: Generator<void, PassageNow | null, void>; ready?: () => void }>();
/** The background plan's share of the page's thread: SLICE_MS of work every TICK_MS (an eighth of a 60 fps frame: a design
 * choice inside Capacity's frame budget); SLICE_NEW_MS while there's no plan at all for where she's going (a destination
 * just chosen: the player's waiting on it), or the passage panel's plan, asked for and waited on. */
const SLICE_MS = 2, SLICE_NEW_MS = 6, TICK_MS = 16;
/** For the tests (tests/sailHome-mileRock.test.ts), kept only while `on`: each slice's length (ms, on `clock`), the live
 * plan's and the panel's, that none runs over its budget, and how many live plans were started (one for a passage
 * sailed, not one each 150 m). The test sets `clock` to the process's CPU time: it doesn't run while the process waits
 * for a core, so a loaded host doesn't read as a long slice (the slices' own budgets stay on the wall clock). */
export const liveLog = { on: false, slices: [] as number[], panel: [] as number[], starts: 0, clock: () => performance.now() };
const clock0 = () => liveLog.on ? liveLog.clock() : 0;
const noteSlice = (c0: number, to = liveLog.slices) => { if (liveLog.on) to.push(liveLog.clock() - c0); };
/** The destination's part of a plan's key (where she's going, not where she is or when). */
const destOf = (key: string) => key.slice(0, key.indexOf('|'));
export function passageLive(w: SimView, ready?: () => void): PassageNow | null {
  const k = nowKey(w, LIVE_M, LIVE_MIN); if (!k) return null;
  const m = nowMemo.get(w); if (fresh(m, k)) return m!.v;
  const j = jobs.get(w);
  // (a plan being worked out for the same destination in the same conditions is let finish, though she's sailed on or the
  // clock's turned since it began: started again each 150 m, a long first plan (Mile Rock to Gashouse Cove, ~39 s of work)
  // never finished under way: the owner's "ten minutes in, still plotting", ROADMAP 8b. The next starts from where she is
  // once it's in)
  const same = !!j && sameAim(j, k);
  if (j && same && ready && j.ready !== ready) { const a = j.ready; j.ready = () => { a?.(); ready(); }; } // (each caller told when it's in)
  if (!j || !same) {
    const job = { ...k, g: passageNowSteps(w), ready }; jobs.set(w, job); if (liveLog.on) liveLog.starts++;
    const first = !m || !sameAim(m, k); // (nothing yet to show for where she's going, in these conditions)
    const pump = () => {
      if (jobs.get(w) !== job) return; // (a newer plan took its place)
      // (the panel's share too while the panel waits on this plan, its own pump idle: on the background's 2 ms a frame, the
      // panel's plan from Mile Rock came in past its 120 s, 4 runs in 4, once this plan had to be started afresh)
      const t = performance.now(), c0 = clock0(), budget = first || waiting.has(w) ? SLICE_NEW_MS : SLICE_MS;
      for (;;) {
        const r = job.g.next();
        if (r.done) { noteSlice(c0); if (r.value) nowMemo.set(w, { key: job.key, refs: job.refs, v: r.value }); jobs.delete(w); job.ready?.(); return; }
        if (performance.now() - t > budget) break;
      }
      noteSlice(c0);
      setTimeout(pump, TICK_MS);
    };
    setTimeout(pump, 0);
  }
  return m && sameAim(m, k) ? m.v : null; // (the last plan for where she's going in these conditions, until the new one is in)
}
/** Two plans' keys for the same destination in the same conditions (where she is, and when, aside). */
const sameAim = (a: { key: string; refs: unknown[] }, b: { key: string; refs: unknown[] }) => destOf(a.key) === destOf(b.key) && a.refs.every((r, i) => r === b.refs[i]);
/** The live plan for where she's going, if it's recent enough for the panel to brief from: begun within 300 m of her and
 * five minutes of now. */
function liveFor(w: SimView): PassageNow | null {
  const k = nowKey(w), m = nowMemo.get(w); if (!k || !m || !sameAim(m, k)) return null;
  return dist(m.v.route[0], outOfBasin({ x: w.user.x, y: w.user.y })) < 300 && Math.abs(w.clockUtc - m.v.leave) <= 5 ? m.v : null;
}
/** Panels waiting on the live plan (passagePlanSteps): their pumps idle meanwhile, not spinning on its yields. */
const waiting = new WeakSet<SimView>();

/** Why a passage can't be sailed, in words: the planner's course ran ashore, or it took too long. */
export const whyNot = (why?: 'land' | 'time'): string => why === 'land'
  ? 'the planner\'s course runs ashore on the way (its tacks or jibes don\'t fit between the shores there): pick a spot a little further out, or sail that part by eye'
  : 'it takes too long, becalmed or against a foul tide somewhere on the way';

/** passagePlanSteps worked out at once (the tests). */
export function passagePlan(w: SimView): PassagePlan | null { const g = passagePlanSteps(w, false); let r = g.next(); while (!r.done) r = g.next(); return r.value; }
/**
 * passagePlanSteps a slice at a time between frames (it sails the passage leaving now and up to five times later, a
 * second or two each), then `done` with the plan. Returns a function that stops it (the panel closed, or another asked).
 */
export function passagePlanLater(w: SimView, done: (p: PassagePlan | null) => void): () => void {
  const g = passagePlanSteps(w); let stopped = false;
  const pump = () => {
    if (stopped) return;
    if (waiting.has(w) && jobs.get(w)) { setTimeout(pump, TICK_MS); return; } // (the live plan's own pump is at it)
    const t = performance.now(), c0 = clock0();
    for (;;) { const r = g.next(); if (r.done) { noteSlice(c0, liveLog.panel); done(r.value); return; } if (performance.now() - t > SLICE_NEW_MS) break; } // (the panel's: asked for and waited on)
    noteSlice(c0, liveLog.panel);
    setTimeout(pump, TICK_MS);
  };
  setTimeout(pump, 0);
  return () => { stopped = true; };
}
/** `live`: between frames, the passage leaving now taken from the page's live plan (waited on); at once (the tests), worked out here. */
function* passagePlanSteps(w: SimView, live = true): Generator<void, PassagePlan | null, void> {
  const dest = w.dest; if (!dest) return null;
  const o = sharedOutlook(w), u = w.user, t0 = w.clockUtc;
  const from = outOfBasin({ x: u.x, y: u.y }), to = yield* destOut(dest.p);
  const sections: BriefSection[] = [], marks: PassagePlan['marks'] = [];
  // (the same passage the chart and the setup show: passageNow)
  // (the passage leaving now: the live plan's, the one the inset and the HUD draw, if it's recent; else that plan, started
  // or joined and waited on. Worked out here a second time, it was ~45 s more of the page's thread from Mile Rock)
  const k = nowKey(w)!, m = nowMemo.get(w);
  let pn = fresh(m, k) ? m!.v : live ? liveFor(w) : (yield* passageNowSteps(w));
  // (the plan it waits on is the one being worked out when it began waiting, or the one that starts at once: once that's
  // in, it's taken, though she's sailed on. Waiting on whatever was running, it waited again on the next live plan, begun
  // each 150 m as she sails (passageLive), whenever the first took her more than that: the panel's plan from Mile Rock in
  // 16 s of the page's thread with one, 42 s with two, on the same quiet host; Marinas, 18 Nov 2026)
  let on: unknown;
  while (!pn && live) {
    passageLive(w); const j = jobs.get(w); if (on === undefined) on = j ?? null;
    if (j && j === on) { waiting.add(w); yield; waiting.delete(w); continue; }
    pn = liveFor(w) ?? nowMemo.get(w)?.v ?? null; if (!pn) pn = (yield* passageNowSteps(w));
    break;
  }
  if (!pn) return null;
  const route = pn.route, now = { ok: pn.ok, minutes: pn.minutes, track: pn.track, legs: pn.legs };
  const cant = whyNot(pn.why);
  const straight = dist(from, to), routeLen = route.slice(1).reduce((a, p, i) => a + dist(route[i], p), 0);
  const fromName = w.fromSlip && !w.running ? `her slip (${w.homeSlip?.id})` : place(w.settings.sailFrom)?.name.replace(/^Off /, 'off ') ?? 'here';

  /* ---------- the passage, and when to leave ---------- */
  const items: BriefItem[] = [];
  const nm = (m: number) => `${(m / 1852).toFixed(1)} nm`;
  items.push({ head: 'The way', src: 'model', text: `${nm(routeLen)} to ${dest.name.replace(/^Off /, 'off ')}${route.length > 2 ? ` round the land (${nm(straight)} as the crow flies)` : ''}. ${now.ok ? `Leaving at ${clockOf(t0)}, about ${mins(now.minutes)} at the Folkboat's polar speeds, arriving ${clockOf(t0 + now.minutes)}.` : `Leaving now she can't get there: ${cant}.`} ${pn.tacks.length ? `Part of it is a beat: ${pn.tacks.length} tack${pn.tacks.length > 1 ? 's' : ''} or so.` : ''}${pn.gybes.length ? ` ${pn.gybes.length} jibe${pn.gybes.length > 1 ? 's' : ''} downwind.` : ''}` });
  // the same passage leaving later: the tide and the wind change under it
  const horizon = (o.stations ? w.tide!.to : t0 + 600) - 10; // (the end of the span every station is predicted over)
  const rows: string[][] = [];
  let quick = { off: 0, minutes: now.ok ? now.minutes : Infinity };
  for (const off of [0, 30, 60, 90, 120, 180]) {
    const p = off === 0 ? now : yield* passageSteps(o, route, t0 + off); // (the fine grain: the coarse one's minutes were out by up to half, and the advice on when to go is read off them)
    if (t0 + off + (p.ok ? p.minutes : 0) > horizon && off > 0) break;
    const tr = alongTrack(o, p.track), cur = tr.reduce((a, b) => a + b, 0) / Math.max(1, tr.length);
    rows.push([clockOf(t0 + off), p.ok ? clockOf(t0 + off + p.minutes) : '—', p.ok ? mins(p.minutes) : 'can\'t get there', `${cur >= 0 ? 'helping' : 'against'} ${kt1(Math.abs(cur))} kt`]);
    if (p.ok && p.minutes < quick.minutes) quick = { off, minutes: p.minutes };
  }
  // the earliest arrival is leaving now; the shortest time on the water may come from waiting for the tide
  const laterFirst = now.ok && quick.off + quick.minutes < now.minutes;
  if (quick.off > 0 && (!now.ok || quick.minutes < 0.85 * now.minutes)) items.push({ head: 'When to go', src: 'model', text: `${!now.ok ? 'Leaving now you won\'t get there;' : laterFirst ? `Waiting beats leaving now: leaving now you'd arrive ${clockOf(t0 + now.minutes)}, but` : `Leaving now gets you there first (${clockOf(t0 + now.minutes)}), but`} leaving at ${clockOf(t0 + quick.off)} it's ${mins(quick.minutes)} on the water${now.ok ? ` instead of ${mins(now.minutes)}` : ''}, arriving ${clockOf(t0 + quick.off + quick.minutes)}: the tide and the wind are kinder then. To sail it then, set the start time in the Cruise setup. A navigator times a passage to the tide first: it's predictable to the minute, and it can be the biggest number in the sum.` });
  else if (now.ok) items.push({ head: 'When to go', src: 'model', text: `Now is as good as any time in the next couple of hours: waiting doesn't buy a kinder tide.` });
  sections.push({ id: 'passage', title: `To ${dest.name.replace(/^Off /, 'off ')}`, lede: `From ${fromName}, starting ${clockOf(t0)}. Worked out at the Folkboat's polar speeds in the day's wind and NOAA's tide, along the way and through the time it takes.`, table: { cols: ['Leave', 'Arrive', 'Time', 'Current on the way (average)'], rows }, items });

  /* ---------- current gates ---------- */
  const gi: BriefItem[] = [];
  if (now.track.length > 2) {
    const tr = alongTrack(o, now.track);
    // the stretches with the strongest current against her, and the best help, each named by its NOAA station
    const spots: { i: number; v: number }[] = [];
    for (let i = 1; i < tr.length - 1; i++) if (Math.abs(tr[i]) > 0.6 && Math.abs(tr[i]) >= Math.abs(tr[i - 1]) && Math.abs(tr[i]) >= Math.abs(tr[i + 1])) spots.push({ i, v: tr[i] });
    const picked: { i: number; v: number }[] = [];
    for (const s of spots.sort((a, b) => Math.abs(b.v) - Math.abs(a.v))) if (picked.every(q => dist(now.track[q.i].p, now.track[s.i].p) > 1500) && picked.length < 4) picked.push(s);
    for (const s of picked.sort((a, b) => a.i - b.i)) {
      const q = now.track[s.i], name = placeName(o, q.p);
      let turn = '';
      if (o.stations) {
        const st = nearestStation(o.stations, q.p), ev = stationEvents(st, q.t, q.t + 6 * 60).find(e => e.kind.startsWith('slack'));
        if (ev) turn = ` It turns at ${clockOf(ev.t)} (NOAA, ${st.name}).`;
      }
      marks.push({ p: q.p, kind: 'gate', label: s.v < 0 ? `${kt1(-s.v)} kt against` : `${kt1(s.v)} kt with you` });
      gi.push({ head: name, src: 'model', text: s.v < 0
        ? `About ${clockOf(q.t)}: ${kt1(-s.v)} kt of current against you here, out of a boat speed of 4–5 kt.${turn} ${-s.v > 2 ? 'That\'s a gate: arrive at slack or on the fair tide if you can, or go close inshore where the current is weaker.' : 'Keep out of the strongest stream; it\'s weaker near the shore and in the lee of points.'}`
        : `About ${clockOf(q.t)}: ${kt1(s.v)} kt with you: a free ride.${turn}` });
    }
  }
  if (!gi.length) gi.push({ text: o.stations ? 'No strong current on the way: the tide barely matters for this passage at this time.' : 'Practice current: the same everywhere but near the shore, so there are no gates.', src: o.stations ? 'model' : 'data' });
  gi.push({ head: 'Reading it on the water', src: 'practice', text: 'Check what the tide is doing as you go: look at the buoys and moored boats (they lean and trail a wake downstream), and at your track over the ground against your heading on the chart. A tide line (a line of foam and debris, a change in the ripples) is where the current changes.' });
  sections.push({ id: 'gates', title: 'Current gates', lede: 'Where the tide is strongest on your way, from NOAA\'s current stations. The Golden Gate, Raccoon Strait and the water off Alcatraz and Point Blunt run hardest. Sailors say the tide turns along the shores before it turns in the middle (general practice: the sim weakens the current near the shore, but doesn\'t turn it earlier).', items: gi });

  /* ---------- the wind on the way ---------- */
  const wi: BriefItem[] = [];
  if (now.track.length) {
    const ws = now.track.map(q => ({ q, w: o.wind(q.p, q.t) }));
    const hi = ws.reduce((a, b) => (b.w.kt > a.w.kt ? b : a)), lo = ws.reduce((a, b) => (b.w.kt < a.w.kt ? b : a));
    const gust = hi.w.kt * hi.w.gust;
    marks.push({ p: hi.q.p, kind: 'wind', label: `${Math.round(hi.w.kt)} kt` });
    wi.push({ head: 'Strongest', src: 'model', text: `About ${Math.round(hi.w.kt)} kt (gusts near ${Math.round(gust)}) near ${placeName(o, hi.q.p)} at ${clockOf(hi.q.t)}. ${hi.w.kt >= 21 ? 'That\'s small-craft-advisory strength (the National Weather Service issues one for the Bay at about 21 kt): a hard ride in a Folkboat. Have everything depowered before you get there, or come back another day.' : hi.w.kt >= 16 ? 'Fresh: the crew will be hiking, with the backstay, Cunningham and outhaul hard on and the traveler down. Ease the main in the gusts rather than letting her round up.' : 'A good sailing breeze.'}` });
    if (lo.w.kt < 5) wi.push({ head: 'Lightest', src: 'model', text: `Only ${Math.round(lo.w.kt)} kt near ${placeName(o, lo.q.p)} about ${clockOf(lo.q.t)} (the lee of the land or an island). ${u.spec?.perf.outboard && u.spec.perf.outboard !== 'none' ? 'You have the outboard if you need it.' : 'She has no outboard aboard: allow time, and stay off a lee shore in case it dies.'}` });
    const slot = ws.filter(x => x.w.kt > 12 && slotWeight(x.q.p) * slotFlow(x.w.from) > 0.5);
    if (slot.length) wi.push({ head: 'The slot', src: 'practice', text: 'On a westerly afternoon the wind funnels in through the Golden Gate and blows hardest in a band from the bridge toward Alcatraz and Angel Island: the slot. It builds through the afternoon and eases toward sunset. Crossing it, expect the breeze to jump as you sail into it, and the chop with it.' });
    const sea = ws.map(x => ({ x, s: o.sea(x.q.p, x.q.t) })).reduce((a, b) => (b.s.steep * b.s.hsW > a.s.steep * a.s.hsW ? b : a));
    if (sea.s.hsW > 0.25) wi.push({ head: 'The roughest water', src: 'model', text: `${describeSea(sea.s)} near ${placeName(o, sea.x.q.p)} about ${clockOf(sea.x.q.t)}${dot(o.current(sea.x.q.p, sea.x.q.t), { x: -Math.sin(sea.x.w.from * Math.PI / 180), y: -Math.cos(sea.x.w.from * Math.PI / 180) }) < -0.3 ? ', where the tide runs into the wind and steepens the waves' : ''}.` });
  }
  sections.push({ id: 'wind', title: 'The wind on the way', items: wi });

  /* ---------- ships and ferries ---------- */
  const li: BriefItem[] = [];
  const crossed = new Set<string>();
  for (let i = 1; i < now.track.length; i++) for (const [id, pts] of Object.entries(ROUTES)) {
    if (!ROUTE_NAME[id] || crossed.has(id)) continue;
    for (let j = 1; j < pts.length; j++) if (segCross(now.track[i - 1].p, now.track[i].p, pts[j - 1], pts[j])) {
      crossed.add(id);
      const q = now.track[i];
      // what the traffic model says will be near then: what AIS would show you
      let ais = '';
      if (w.traffic.on) {
        for (const dtm of [0, -2, 2, -4, 4, -6, 6, -8, 8, -10, 10]) { if (ais) break; for (const v of w.traffic.vessels(((q.t + dtm) * 60) % 86400)) {
          const svc = SERVICES[v.id]; if (svc.route !== id || !v.moving) continue;
          const d = dist(v, q.p);
          if (d < 1852 * 0.8) {
            const nm = VESSEL[v.kind].name, name = v.kind === 'ferry' || v.kind === 'alcatraz' || v.kind === 'coastguard' ? nm : nm[0].toLowerCase() + nm.slice(1), when = Math.round(dtm);
            ais = ` On AIS (the ships' transponders, on a phone app or the chartplotter): the ${name} passes within ${(d / 1852).toFixed(1)} nm of that spot at ${clockOf(q.t + dtm)}, ${when === 0 ? 'just as you get there' : when < 0 ? `${-when} min before you get there` : `${when} min after`}, at ${VESSEL[v.kind].kt} kt.`;
            break;
          }
        } }
      }
      marks.push({ p: q.p, kind: 'lane', label: ROUTE_NAME[id] });
      li.push({ head: `${ROUTE_NAME[id][0].toUpperCase()}${ROUTE_NAME[id].slice(1)}`, src: 'model', text: `You cross it about ${clockOf(q.t)} near ${placeName(o, q.p)}.${ais}` });
      break;
    }
  }
  if (crossed.has('channel')) li.push({ head: 'Crossing a shipping lane', src: 'rule', text: 'Big ships keep to the deep water and can neither stop nor turn for you: at 11–12 kt a ship 2 nm off is on you in about ten minutes, and from her bridge a Folkboat is hidden under the bow for the last few hundred meters. Cross at right angles, as quickly as you can, and pass astern of a ship, never ahead. The Inland Navigation Rules: a sailing vessel shall not impede a vessel that can navigate safely only within a narrow channel (Rule 9(b)), and the deep-water route through the Central Bay is used that way; out in the traffic separation scheme beyond the Gate, Rule 10(j) says the same of a vessel following a lane, and Rule 10(c) says to cross a lane on a heading as nearly as practical at right angles. Five or more short blasts mean "I doubt you\'re keeping clear" (Rule 34(d)). Listen on VHF 14, Vessel Traffic Service San Francisco, to hear the ships coming. (The ship route here is the sim\'s approximation; the real lanes are on NOAA chart 18649.)' });
  if (crossed.has('sausalito') || crossed.has('alcatraz') || crossed.has('tour')) li.push({ head: 'Ferries', src: 'rule', text: 'Ferries are fast (the sim\'s Sausalito ferry makes 17 kt) and keep a schedule. Outside a narrow channel a power-driven vessel keeps clear of a sailing one (Rule 18), and you\'re the stand-on boat: hold a steady course and speed so the ferry can read you (Rule 17(a)(i)). If she isn\'t keeping clear you may act (17(a)(ii)) and sound five short blasts (34(d)); when she can\'t avoid a collision alone, you must act (17(b)). Their wakes are steep: meet them bow-on.' });
  if (!li.length) li.push({ text: 'You don\'t cross the ship route or the ferry routes on this passage. Keep a lookout anyway (Rule 5): ships turn into and out of the Central Bay toward Oakland and Richmond, and the tour boats go everywhere.', src: 'rule' });
  sections.push({ id: 'traffic', title: 'Ships and ferries', items: li });

  /* ---------- hazards and seamanship ---------- */
  const hi: BriefItem[] = [];
  if (now.track.length) {
    const close = now.track.slice(3, -3).reduce((a, q) => (landDist(q.p) < landDist(a.p) ? q : a), now.track[0]);
    const cd = landDist(close.p);
    if (cd < 250) hi.push({ head: 'Close to the shore', src: 'model', text: `The route passes about ${Math.round(cd)} m (${Math.round(cd / LOA)} boat lengths) off the shore near ${placeName(o, close.p)}. Inshore the current is weaker but the wind is fluky and there are rocks off most points: keep a chart handy and a good lookout.` });
    for (const id of ['m-17', 'm-18']) { const pl = place(id); if (pl && now.track.some(q => dist(q.p, pl.p) < 500)) hi.push({ head: pl.name.replace(/^\d+ · /, ''), src: 'practice', text: `The buoy marks a rock deep enough for a Folkboat: it's a hazard to deep-draft ships beside the shipping lanes, not to you (Blossom Rock was blasted to about 40 ft, Harding Rock is about 36 ft down). Give the buoy itself room, though: the current runs hard past it, and expect ships nearby.` }); }
    const eta = t0 + now.minutes, set = sunTimes(eta * 60000).set / 60000;
    if (Number.isFinite(set) && eta > set - 45) hi.push({ head: 'Sunset', src: 'rule', text: `The sun sets at ${clockOf(set)}${eta > set ? ', before you arrive' : ', not long after you arrive'}. Between sunset and sunrise show your navigation lights (Rule 20): a sailing boat under 20 m shows red and green sidelights and a white sternlight, or a tricolour at the masthead (Rule 25).` });
  }
  hi.push({ head: 'Fog', src: 'rule', text: 'The summer fog pours in through the Gate in the afternoon. In fog a sailing boat sounds one long and two short blasts at least every two minutes (Rule 35(c); under 12 m, any efficient sound signal every two minutes will do, Rule 35(j)), goes at a safe speed she can stop in (Rule 19(b)), and listens for ships. Know your position before it closes in.' });
  hi.push({ head: 'Cold water', src: 'practice', text: 'The Bay is cold all year (in the 50s °F), and the current carries a person in the water away fast. Lifejackets on, and a plan for getting someone back aboard, before you leave the dock.' });
  sections.push({ id: 'safety', title: 'Hazards and seamanship', items: hi });

  return {
    title: `Passage plan: to ${dest.name.replace(/^Off /, 'off ')}`,
    sub: `${new Date(w.raceDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}, from ${clockOf(t0)}.`,
    sections, route, track: now.track, marks
  };
}
