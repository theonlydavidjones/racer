import { KT, LOA, dist, dot, segCross, sub, unit, type Vec } from '../core/math';
import { describeSea } from '../environment/sea';
import { sunTimes } from '../environment/sun';
import { slotFlow, slotWeight } from '../environment/wind';
import { place } from './places';
import { ROUTES, SERVICES, VESSEL } from './traffic';
import type { World } from './world';
import { clockOf, nearestStation, outlookFor, stationEvents, type Outlook } from './outlook';
import { groundLaylines, landDist, routeAround, sailLeg, type SailResult } from './routing';
import { landAlong } from '../geo/shore';
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

/** A passage from a to b leaving at t: round the land, each stretch sailed up the middle (tacking on a lane either side). */
function passage(o: Outlook, route: Vec[], t: number): { ok: boolean; why?: 'land' | 'time'; minutes: number; track: { p: Vec; t: number }[]; legs: SailResult[] } {
  let tt = t, ok = true, why: 'land' | 'time' | undefined;
  const track: { p: Vec; t: number }[] = [], legs: SailResult[] = [];
  // each stretch from where the last one really ended (she counts as round a turn within 120 m of it, and cuts the
  // corner from there, as a boat does), so the track runs on unbroken and every metre of it is sailed and timed
  let at = route[0];
  for (let i = 1; i < route.length; i++) {
    const r = sailLeg(o, at, route[i], tt, 'middle', undefined, i === route.length - 1 ? 30 : 120, 360);
    legs.push(r); track.push(...(i > 1 ? r.path.slice(1) : r.path)); tt += r.minutes;
    if (!r.ok) { ok = false; why = r.why; break; } // (stopped where she ran ashore: nothing drawn beyond it)
    // (on from where she is, if she can see the next turn from there clear of the land; or else from the turn itself)
    const end = r.path[r.path.length - 1].p, next = route[i + 1];
    at = next && landAlong(end, next) === Infinity && landDist(end) > 20 ? end : route[i];
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
const nowMemo = new WeakMap<World, { key: string; refs: unknown[]; v: PassageNow }>();
export function passageNow(w: World): PassageNow | null {
  const dest = w.dest; if (!dest) return null;
  const u = w.user, t0 = w.clockUtc, from = { x: u.x, y: u.y };
  const key = `${Math.round(dest.p.x)},${Math.round(dest.p.y)}|${Math.round(u.x / 25)},${Math.round(u.y / 25)}|${Math.floor(t0)}`;
  // (and the conditions it was worked in: changed from the pause menu, World.applyConditions, they're new objects)
  const refs = [w.weather, w.tide, w.windModel, w.sea];
  const m = nowMemo.get(w); if (m && m.key === key && m.refs.every((r, i) => r === refs[i])) return m.v;
  const o = outlookFor(w), route = routeAround(from, dest.p), r = passage(o, route, t0);
  const sailedM = r.track.slice(1).reduce((a, q, i) => a + dist(r.track[i].p, q.p), 0);
  const turns = r.legs.flatMap(l => l.turns), last = r.legs[r.legs.length - 1];
  const lk: 'beat' | 'run' | null = !last ? null : last.turns.length ? (last.turns[last.turns.length - 1].kind === 'gybe' ? 'run' : 'beat') : last.kind === 'reach' ? null : last.kind;
  // (the laylines she tacked or gybed onto: the wind and the current where and when she made her last turn, which is
  // where she saw she'd lay the mark; with no turn on the last stretch, those at the mark when she gets there)
  const lt = last?.turns[last.turns.length - 1], ltT = lt ? r.track.find(q => dist(q.p, lt.p) < 1)?.t : undefined;
  const laylines = lk ? { kind: lk, tracks: groundLaylines(o, lt && ltT != null ? lt.p : dest.p, lt && ltT != null ? ltT : t0 + r.minutes, lk) } : null;
  const v: PassageNow = { route, track: r.track, ok: r.ok, why: r.why, minutes: r.minutes, legs: r.legs, sailedM,
    tacks: turns.filter(q => q.kind === 'tack').map(q => q.p), gybes: turns.filter(q => q.kind === 'gybe').map(q => q.p),
    laylines, leave: t0, eta: r.ok ? t0 + r.minutes : null };
  nowMemo.set(w, { key, refs, v });
  return v;
}

/** Why a passage can't be sailed, in words: the planner's course ran ashore, or it took too long. */
export const whyNot = (why?: 'land' | 'time'): string => why === 'land'
  ? 'the planner\'s course runs ashore on the way (its tacks or gybes don\'t fit between the shores there): pick a spot a little further out, or sail that part by eye'
  : 'it takes too long, becalmed or against a foul tide somewhere on the way';

export function passagePlan(w: World): PassagePlan | null {
  const dest = w.dest; if (!dest) return null;
  const o = outlookFor(w), u = w.user, t0 = w.clockUtc;
  const from = { x: u.x, y: u.y }, to = dest.p;
  const sections: BriefSection[] = [], marks: PassagePlan['marks'] = [];
  // (the same passage the chart and the setup show: passageNow)
  const pn = passageNow(w)!, route = pn.route, now = { ok: pn.ok, minutes: pn.minutes, track: pn.track, legs: pn.legs };
  const cant = whyNot(pn.why);
  const straight = dist(from, to), routeLen = route.slice(1).reduce((a, p, i) => a + dist(route[i], p), 0);
  const fromName = w.fromSlip && !w.running ? `her slip (${w.homeSlip?.id})` : place(w.settings.sailFrom)?.name.replace(/^Off /, 'off ') ?? 'here';

  /* ---------- the passage, and when to leave ---------- */
  const items: BriefItem[] = [];
  const nm = (m: number) => `${(m / 1852).toFixed(1)} nm`;
  items.push({ head: 'The way', src: 'model', text: `${nm(routeLen)} to ${dest.name.replace(/^Off /, 'off ')}${route.length > 2 ? ` round the land (${nm(straight)} as the crow flies)` : ''}. ${now.ok ? `Leaving at ${clockOf(t0)}, about ${mins(now.minutes)} at the Folkboat's polar speeds, arriving ${clockOf(t0 + now.minutes)}.` : `Leaving now she can't get there: ${cant}.`} ${pn.tacks.length ? `Part of it is a beat: ${pn.tacks.length} tack${pn.tacks.length > 1 ? 's' : ''} or so.` : ''}${pn.gybes.length ? ` ${pn.gybes.length} gybe${pn.gybes.length > 1 ? 's' : ''} downwind.` : ''}` });
  // the same passage leaving later: the tide and the wind change under it
  const horizon = (o.stations ? w.tide!.to : t0 + 600) - 10; // (the end of the span every station is predicted over)
  const rows: string[][] = [];
  let quick = { off: 0, minutes: now.ok ? now.minutes : Infinity };
  for (const off of [0, 30, 60, 90, 120, 180]) {
    const p = off === 0 ? now : passage(o, route, t0 + off);
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
    wi.push({ head: 'Strongest', src: 'model', text: `About ${Math.round(hi.w.kt)} kt (gusts near ${Math.round(gust)}) near ${placeName(o, hi.q.p)} at ${clockOf(hi.q.t)}. ${hi.w.kt >= 21 ? 'That\'s small-craft-advisory strength (the National Weather Service issues one for the Bay at about 21 kt): a hard ride in a Folkboat. Have everything depowered before you get there, or come back another day.' : hi.w.kt >= 16 ? 'Fresh: the crew will be hiking, with the backstay, Cunningham and outhaul hard on and the traveller down. Ease the main in the gusts rather than letting her round up.' : 'A good sailing breeze.'}` });
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
  if (crossed.has('channel')) li.push({ head: 'Crossing a shipping lane', src: 'rule', text: 'Big ships keep to the deep water and can neither stop nor turn for you: at 11–12 kt a ship 2 nm off is on you in about ten minutes, and from her bridge a Folkboat is hidden under the bow for the last few hundred metres. Cross at right angles, as quickly as you can, and pass astern of a ship, never ahead. The Inland Navigation Rules: a sailing vessel shall not impede a vessel that can navigate safely only within a narrow channel (Rule 9(b)), and the deep-water route through the Central Bay is used that way; out in the traffic separation scheme beyond the Gate, Rule 10(j) says the same of a vessel following a lane, and Rule 10(c) says to cross a lane on a heading as nearly as practical at right angles. Five or more short blasts mean "I doubt you\'re keeping clear" (Rule 34(d)). Listen on VHF 14, Vessel Traffic Service San Francisco, to hear the ships coming. (The ship route here is the sim\'s approximation; the real lanes are on NOAA chart 18649.)' });
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
