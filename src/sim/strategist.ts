import { CANCEL_KT } from './signals';
import { D2R, KT, LOA, V, brg, clamp, cross, dot, markReach, sub, unit, wrap, type Vec } from '../core/math';
import { beatAngle, polar } from '../boat/polar';
import { beatInChop, speedInChop } from '../boat/seaway';
import { crewSolve, targetShape, CAR_FORE_PINS } from '../boat/controls';
import { optimalSheet } from '../boat/trim';
import { bestFore } from '../boat/crewPhys';
import { condition, mainRig } from '../boat/condition';
import { tuneBrief } from '../boat/rigTune';
import { ISLAND_ROUNDING_S } from '../courses/committee';
import { describeSea } from '../environment/sea';
import { WIND_KIND_LABEL, slotFlow } from '../environment/wind';
import type { CourseMark } from '../courses/course';
import type { Boat } from '../boat/boat';
import type { World } from './world';
import type { SimView } from './host';
import { clockOf, currentWords, nearestStation, outlookFor, stationEvents, tideWord, type Outlook } from './outlook';
import { AS_FORECAST, bestPlan, comparePlans, type LegKind, type Plan, type SailResult, type Scenario } from './routing';
import { amount, deg3, kt1, mins, sideWords, type Brief, type BriefItem, type BriefSection } from './brief';

/**
 * The race strategist: a briefing before the start, the way a coach or a navigator gives one on the dock. It works
 * from the same wind, tide and sea the race will be sailed in (sim/outlook.ts) and from the boat's own physics, and
 * explains each call, so you learn to make it yourself: what the day will do, where to start, which way to go on each
 * leg and how sure that is, who you're racing, and how to set the boat up as the wind changes.
 *
 * What it can't know is what nobody can forecast: the puffs, the oscillating shifts, where the other boats go. It
 * says so, and says what to watch for on the water.
 */

/** A leg as planned: where it goes, the plans tried, the best, and how sure. */
export interface LegPlan {
  i: number; name: string; from: Vec; to: Vec; kind: LegKind;
  /** The mark is an island (Alcatraz), rounded at a berth off its shore. */
  island: boolean;
  t0: number; minutes: number;
  plans: Record<Plan, SailResult>; best: Plan;
  certainty: 'clear' | 'likely' | 'open';
  /** Ways the day might go differently in which another plan wins. */
  flips: { label: string; plan: Plan }[];
}
export interface RaceBrief extends Brief { legs: LegPlan[]; finishT: number }

/** The ways the day might differ from the forecast that a good strategist plans for. Eight degrees and half an hour
 * are about the spread between the NWS's hourly forecast and what the wind does on the Cityfront; a quarter is the
 * spread in strength. (A rule of thumb, not a statistic: the records here don't keep the forecast errors.) */
const SCENARIOS: { label: string; sc: Scenario }[] = [
  { label: 'the wind veers 8° more', sc: { ...AS_FORECAST, dFrom: 8 } },
  { label: 'the wind backs 8° more', sc: { ...AS_FORECAST, dFrom: -8 } },
  { label: 'the wind\'s changes come 30 min early', sc: { ...AS_FORECAST, early: 30 } },
  { label: 'the wind\'s changes come 30 min late', sc: { ...AS_FORECAST, early: -30 } },
  { label: 'it blows a quarter harder', sc: { ...AS_FORECAST, kMul: 1.25 } },
  { label: 'it blows a quarter lighter', sc: { ...AS_FORECAST, kMul: 0.75 } }
];

const PLAN_WORD: Record<Plan, string> = { left: 'left', right: 'right', middle: 'up the middle', shore: 'along the shore' };
const KIND_WORD: Record<LegKind, string> = { beat: 'a beat', run: 'a run', reach: 'a reach' };

/** Where a leg really starts and ends: an island mark (Alcatraz) is rounded at a berth off its shore, not at its middle. */
function legEnds(C: World['C'], i: number): { from: Vec; to: Vec; extra: number } {
  const n = C.marks.length, prev = i === 0 ? null : C.marks[i - 1], next = i < n ? C.marks[i] : null;
  const prevP = i === 0 ? C.center : prev!.p, nextP = next ? next.p : C.center;
  const berth = (m: CourseMark, toward: Vec) => { const u = unit(sub(toward, m.p)); const r = markReach(m, toward) + 220; return { x: m.p.x + u.x * r, y: m.p.y + u.y * r }; };
  const from = prev?.reach ? berth(prev, nextP) : prevP, to = next?.reach ? berth(next, prevP) : nextP;
  return { from, to, extra: next?.reach ? ISLAND_ROUNDING_S / 60 : next && next.type === 'round' ? 10 / 60 : 0 };
}

/** Plan every leg in turn, each starting when the last one's best plan gets there. */
export function planLegs(w: SimView, o: Outlook): LegPlan[] {
  const C = w.C, out: LegPlan[] = [];
  let t = o.t0;
  for (let i = 0; i <= C.marks.length; i++) {
    const { from, to, extra } = legEnds(C, i);
    const plans = comparePlans(o, from, to, t), best = bestPlan(plans), kind = plans.middle.kind;
    const sorted = (['left', 'middle', 'right', 'shore'] as Plan[]).filter(k => plans[k].ok).map(k => plans[k].minutes).sort((a, b) => a - b);
    const margin = sorted.length > 1 ? (sorted[1] - sorted[0]) / Math.max(1, sorted[0]) : 0;
    const flips: { label: string; plan: Plan }[] = [];
    if (kind !== 'reach') for (const s of SCENARIOS) {
      const r = comparePlans(o, from, to, t, s.sc), b = bestPlan(r);
      if (b !== best && (!r[best].ok || r[best].minutes - r[b].minutes > 0.01 * r[b].minutes)) flips.push({ label: s.label, plan: b });
    }
    const certainty = kind === 'reach' ? 'clear' : flips.length === 0 && margin > 0.04 ? 'clear' : flips.length <= 2 && margin > 0.015 ? 'likely' : 'open';
    const name = i < C.marks.length ? C.marks[i].name : 'the finish';
    out.push({ i, name, from, to, kind, island: !!(i < C.marks.length && C.marks[i].reach), t0: t, minutes: plans[best].minutes, plans, best, certainty, flips });
    t += plans[best].minutes + extra;
  }
  return out;
}

/**
 * The trend of the course-wide wind over a window: a straight line fitted through it every 2 minutes (speed, and the
 * direction unwrapped), and how far it swings about that line. On an observed day the wind is Fort Point's record every
 * 6 minutes, oscillations and all: two snapshots would call an oscillation a shift. A shift is persistent only when the
 * fitted change is bigger than the swings about it.
 */
export function windTrend(o: Outlook, t0: number, t1: number): { kt0: number; kt1: number; from0: number; from1: number; dFrom: number; swing: number; lo: number; hi: number } {
  const ts: number[] = [], ks: number[] = [], ds: number[] = [];
  let prev = o.breeze(t0).from;
  const step = Math.max(1, Math.min(2, (t1 - t0) / 4));
  for (let t = t0; t <= t1 + 1e-6; t += step) { const b = o.breeze(t), d = prev + wrap(b.from - prev); ts.push(t - t0); ks.push(b.kt); ds.push(d); prev = d; }
  const fit = (ys: number[]) => {
    const n = ys.length, mx = ts.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (ts[i] - mx) * (ys[i] - my); sxx += (ts[i] - mx) ** 2; }
    const k = sxx > 0 ? sxy / sxx : 0, c = my - k * mx, res = Math.sqrt(ys.reduce((a, y, i) => a + (y - (c + k * ts[i])) ** 2, 0) / n);
    return { y0: c, y1: c + k * (t1 - t0), res };
  };
  const fk = fit(ks), fd = fit(ds);
  return { kt0: fk.y0, kt1: fk.y1, from0: fd.y0, from1: fd.y1, dFrom: fd.y1 - fd.y0, swing: fd.res, lo: Math.min(...ds), hi: Math.max(...ds) };
}

/** The side a persistent shift favours: toward the new wind upwind (a veer: the right, looking upwind); downwind it's
 * the other way round (the routing finds the left pays on a run in a veer, the right in a back). */
const shiftSide = (dFrom: number, kind: LegKind): 'left' | 'right' => ((dFrom > 0) === (kind !== 'run') ? 'right' : 'left');

/* ---------- the sections ---------- */

const srcWords = (w: SimView) => {
  const wx = w.weather, mo = new Date(w.raceDate + 'T12:00').toLocaleDateString('en-US', { month: 'long' });
  return wx.source === 'observed' ? { lede: `A past day: the wind is what NOAA's Fort Point station recorded every 6 minutes, spread across the course by the other stations around the Bay; the tide is NOAA's prediction for the day. This is hindsight, so the big picture is right; the puffs on the water are the sim's.`, sure: 'high' }
    : wx.source === 'forecast' ? { lede: `The National Weather Service forecast (issued ${new Date(wx.issued!).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: '2-digit' })}), hour by hour on its 2.5 km grid, and NOAA's tidal current predictions. The tide is astronomy and will be close; the wind's timing and strength are a forecast, so the plans below are tested against it coming early or late, stronger or lighter, veered or backed.`, sure: 'medium' }
    : wx.source === 'records' ? { lede: `No forecast reaches this date yet, so the wind is a typical ${WIND_KIND_LABEL[wx.kind].toLowerCase()} day for ${mo}, from five years of NOAA records at Crissy Field. The tide is NOAA's prediction and will hold; the wind on the real day could be anything ${mo} brings. Treat the wind calls as practice in how to think, not a forecast.`, sure: 'low' }
    : { lede: `A ${WIND_KIND_LABEL[wx.kind].toLowerCase()} day you chose, shaped like the NOAA records for ${mo}${w.settings.current === 'real' ? ', with NOAA\'s tide predictions' : ''}.`, sure: 'low' };
};

/**
 * Too windy to race? The SF Bay Folkboat fleet calls racing off at about 23 kt (signals.ts CANCEL_KT): if the forecast
 * reaches it over the course between the warning signal and the finish, say so first, and when, ahead of the dock.
 */
function windLimitSection(w: SimView, o: Outlook, finishT: number): BriefSection | null {
  const gun = o.t0, warn = gun - w.settings.seq;
  let peak = { kt: 0, t: warn };
  const pts = [w.C.center, ...w.C.marks.map(m => m.p)];
  for (let t = warn - 10; t <= finishT; t += 5) { const kt = pts.reduce((a, p) => a + o.wind(p, t).kt, 0) / pts.length; if (kt > peak.kt) peak = { kt, t }; }
  if (peak.kt < CANCEL_KT - 3) return null;
  const over = peak.kt >= CANCEL_KT, when = peak.t < gun ? 'before the start' : `${Math.round(peak.t - gun)} min into the race`;
  return {
    id: 'limit', title: over ? 'Too much wind to race' : 'Close to the wind limit',
    lede: over ? `The forecast reaches ${Math.round(peak.kt)} kt over the course (${clockOf(peak.t)}, ${when}): over the fleet's ${CANCEL_KT} kt limit. Expect the committee to call racing off.`
      : `The forecast peaks at ${Math.round(peak.kt)} kt over the course (${clockOf(peak.t)}, ${when}): a few knots under the fleet's ${CANCEL_KT} kt limit.`,
    items: [
      { head: 'The fleet\'s practice', src: 'practice', text: `On the Bay, Folkboat racing is canceled at about ${CANCEL_KT} kt: at that speed things start breaking on boats, and the fleet doesn't reef. Before the start the committee shows AP over A with two sounds (postponed, no more racing today); once racing, N over A with three sounds (abandoned, no more racing today).` },
      over ? { head: 'Before you leave the dock', src: 'practice', text: 'Check for the race chair\'s word before casting off: on a day like this the fleet usually decides at the dock. If you\'re out when it\'s called off, depower and sail home; the ebb against the westerly makes the worst of the sea off the Cityfront and in the Gate.' }
        : { head: 'If it builds', src: 'practice', text: `A puffier or later breeze than forecast can take it over ${CANCEL_KT} kt: if the committee calls it off, come home with the sails depowered (see Trim and tuning).` }
    ]
  };
}

/** The day: a timeline of the wind, tide and sea at the line, and what it means. */
function daySection(w: SimView, o: Outlook, finishT: number): BriefSection {
  const C = w.C, gun = o.t0, warn = gun - w.settings.seq;
  const times = [warn, gun, ...[30, 60, 90, 120, 150].map(m => gun + m).filter(t => t < finishT - 8), finishT];
  const flood = o.stations ? nearestStation(o.stations, C.center).flood : null;
  const rows = times.map(t => {
    const wd = o.wind(C.center, t), b = o.breeze(t), s = o.sea(C.center, t);
    const lab = t === warn ? 'Warning' : t === gun ? 'Start' : t === finishT ? 'Finish (est.)' : `+${Math.round(t - gun)} min`;
    return [`${clockOf(t)} · ${lab}`, `${Math.round(b.kt)} kt from ${deg3(b.from)}, gusts ~${Math.round(b.kt * b.gust)} (${Math.round(wd.kt)} at the line)`, currentWords(o.current(C.center, t), flood), describeSea(s)];
  });
  const items: BriefItem[] = [];
  const tr = windTrend(o, gun, finishT), dk = tr.kt1 - tr.kt0, dd = tr.dFrom, persistent = Math.abs(dd) >= 5 && Math.abs(dd) > 1.5 * tr.swing;
  const trend = Math.abs(dk) < 1.5 ? `holds at about ${Math.round((tr.kt0 + tr.kt1) / 2)} kt` : `${dk > 0 ? 'builds' : 'eases'} from about ${Math.round(tr.kt0)} to ${Math.round(tr.kt1)} kt`;
  const swing = persistent ? `and ${dd > 0 ? 'veers (swings clockwise)' : 'backs (swings counterclockwise)'} about ${Math.round(Math.abs(dd))}°, from ${deg3(tr.from0)} to ${deg3(tr.from1)}`
    : tr.swing >= 4 ? `and oscillates rather than shifting: it swings ${Math.round(tr.swing)}° or so either side of ${deg3((tr.from0 + tr.from1) / 2)} (between ${deg3(tr.lo)} and ${deg3(tr.hi)}), with no steady trend`
    : 'and holds its direction';
  items.push({ head: 'The breeze', src: 'data', text: `Over the race it ${trend} ${swing}. (A straight line fitted through the wind every 2 minutes, so one gusty reading doesn't count as a trend.)` });
  if (persistent) items.push({ head: 'A persistent shift', src: 'practice', text: `A wind that swings one way through the race isn't an oscillation you can tack on and wait out: it's a persistent shift. Upwind, the boats on the side it swings toward (the ${dd > 0 ? 'right' : 'left'}, looking upwind) gain. Sailing toward the shift you're headed more and more (your bow falls off as it swings), which feels wrong but isn't: don't tack on it. When you do tack you're lifted, pointing higher and higher at the mark. The boats on the other side are lifted the whole time, but lifted the wrong way, away from the mark, and fall behind. Go toward the new wind early. (On a run it works the other way round.)` });
  else if (tr.swing >= 4) items.push({ head: 'Oscillating', src: 'practice', text: `An oscillating wind swings back and forth about a mean. Upwind, tack on the headers: when the compass says you've been knocked several degrees below your mean heading on this tack and it holds for a few seconds, tack, and you come out lifted on the other board. Know your mean headings on each tack before the start, so you can tell a header from the mean.` });
  if (Math.abs(dk) >= 3) items.push({ head: 'Changing gears', src: 'practice', text: `A breeze that ${dk > 0 ? 'builds' : 'dies'} ${Math.abs(Math.round(dk))} kt over an hour or so means the boat set up for the start is wrong by the finish. Plan the changes now (see Trim and tuning) and make them before you're overpowered${dk > 0 ? '' : ' or underpowered'}, not after.` });
  // where it blows harder or lighter across the course, at the start
  const pts: { name: string; p: Vec }[] = [{ name: `the line (${C.committeeLabel})`, p: C.center }, ...C.marks.filter((m, i, a) => a.findIndex(x => x.key === m.key) === i).map(m => ({ name: m.name, p: m.reach ? legEnds(C, C.marks.indexOf(m)).to : m.p }))];
  if (pts.length > 1) {
    const ws = pts.map(q => ({ ...q, kt: o.wind(q.p, gun + 15).kt })).sort((a, b) => b.kt - a.kt), hi = ws[0], lo = ws[ws.length - 1];
    const slot = slotFlow(o.breeze(gun).from) > 0.5;
    if (hi.kt - lo.kt > 1) items.push({ head: 'Where it blows', src: 'model', text: `At the start, about ${Math.round(hi.kt)} kt at ${hi.name} and ${Math.round(lo.kt)} kt at ${lo.name}. ${slot ? 'The westerly comes in through the Gate and blows hardest in a band toward Alcatraz and Angel Island (the slot); ' : 'In this wind there\'s no slot (that\'s the westerly, funnelled through the Gate); '}the land slows the wind within a few hundred meters of the shore, and an island leaves a near-calm close behind it and lighter air for kilometers downwind (behind Angel Island, 3–5 km). (From ${w.weather.fieldSource}.)` });
  }
  // the tide: the nearest NOAA station's slacks and peaks around the race
  if (o.stations) {
    const st = nearestStation(o.stations, C.center), ev = stationEvents(st, warn - 60, finishT + 90);
    const nowKt = (() => { const c = o.current(C.center, gun); return dot(c, V(st.flood)) / KT; })();
    items.push({ head: 'The tide', src: 'data', text: `At the start: ${tideWord(nowKt)} at the line. NOAA's nearest station, ${st.name}: ${ev.length ? ev.map(e => `${e.kind} ${e.kind.startsWith('max') ? `${Math.abs(e.kt).toFixed(1)} kt ` : ''}at ${clockOf(e.t)}`).join('; ') : 'no turn of the tide during the race'}.` });
    // the relief along the shore: the current at the club end of the line against out in the stream
    const shoreP = C.committeeKind === 'shore' ? C.committee : C.pinKind === 'shore' ? C.pin : C.center;
    const far = shoreP === C.committee ? C.pin : C.committee, dirOut = unit(sub(far, shoreP)), out = { x: shoreP.x + dirOut.x * 900, y: shoreP.y + dirOut.y * 900 };
    const cs = Math.hypot(o.current(shoreP, gun).x, o.current(shoreP, gun).y) / KT, co = Math.hypot(o.current(out, gun).x, o.current(out, gun).y) / KT;
    if (co > 0.4 && co - cs > 0.2) items.push({ head: 'Relief along the shore', src: 'model', text: `Near the shore the current is weaker (${kt1(cs)} kt at ${C.committeeKind === 'shore' ? C.committeeLabel : 'the line'} against ${kt1(co)} kt 900 m out), because the water drags on the bottom and the shore. Sailing against the tide, the shore is relief; with it, the stream is a free ride. Racers on the Cityfront close-reach or short-tack along the beach to cheat a foul tide. (The sim's relief is a model fitted to the NOAA stations; real eddies near the shore are messier.)` });
  }
  // wind against tide: steep chop
  const steep = times.map(t => ({ t, s: o.sea(C.center, t), c: o.current(C.center, t), w: o.wind(C.center, t) })).filter(x => dot(x.c, V(x.w.from)) / KT > 0.4 && x.s.hsW > 0.15);
  if (steep.length) items.push({ head: 'Wind against tide', src: 'model', text: `From about ${clockOf(steep[0].t)} the tide (${currentWords(steep[0].c, flood)}) runs into the wind, and the chop gets shorter and steeper (${describeSea(steep[0].s)}). Upwind in a short chop the boat slows on every wave: foot a few degrees lower and keep her powered up rather than pinching.` });
  return { id: 'day', title: 'The day: wind, tide and sea', lede: srcWords(w).lede, table: { cols: ['Time', 'Wind (course-wide)', 'Current at the line', 'Sea at the line'], rows }, items };
}

/** The start: which end is favoured, what the current does at the line, which end leads to the favoured side. */
function startSection(w: SimView, o: Outlook, legs: LegPlan[]): BriefSection {
  // the wind on the water (air minus tide), which is what you see heading to wind on the line, and what the boats sail in
  const C = w.C, gun = o.t0, wd = o.windOnWater(C.center, gun), up = V(wd.from), items: BriefItem[] = [];
  const line = sub(C.committee, C.pin), len = Math.hypot(line.x, line.y), gain = dot(line, up); // + committee end upwind
  const fav = gain > 0 ? C.committeeLabel : C.pinLabel, m = Math.abs(gain), bias = Math.asin(clamp(m / len, -1, 1)) / D2R;
  const first = legs[0];
  if (first.kind === 'beat') {
    items.push({ head: 'Favored end', src: 'model', text: m < LOA ? `The line is square to the wind at the gun (${deg3(wd.from)}): neither end gains more than a boat length. Start where you have clear air and can go the way you want.` : `The ${fav} end is ${Math.round(m)} m (${Math.round(m / LOA)} boat lengths) further upwind: the line is ${Math.round(bias)}° off square to the ${deg3(wd.from)} wind. A boat starting there is that far ahead of one at the other end the moment the gun goes. Check it yourself before the start: head to wind on the line and see which end the bow points nearer to, or sail down the line on a close reach and watch the jib.` });
  } else items.push({ head: 'A reaching start', src: 'model', text: `The first leg is ${KIND_WORD[first.kind]}, so the line's bias matters less than being at full speed in clear air at the gun. The boats to windward have clear air and can roll the boats below them; the end nearer the first mark is the shorter way.` });
  // the current at the line
  const c = o.current(C.center, gun - 1), toward = dot(c, C.N), perMin = toward * 60;
  if (Math.abs(toward) > 0.1) items.push({ head: 'The current at the line', src: 'model', text: toward > 0 ? `The current is carrying you over the line at ${Math.round(perMin)} m a minute (${(perMin / LOA).toFixed(1)} boat lengths). In the last minute hold back further than feels right, approach from below rather than sitting on the line, and watch the transit: being over early with the tide under you is the classic Cityfront mistake. (A boat over the line at the signal hasn't started: she must come back to the pre-start side and start, by the definition of Start and rule 28.1; the committee signals it with the X flag, rule 29.1.)` : `The current is carrying you back from the line at ${Math.round(-perMin)} m a minute (${(-perMin / LOA).toFixed(1)} boat lengths): you'll be late if you time it as in still water. Set up closer, and keep moving; a boat stopped on the line drifts back.` });
  const cp = o.current(C.pin, gun), cc = o.current(C.committee, gun), dcp = (Math.hypot(cp.x, cp.y) - Math.hypot(cc.x, cc.y)) / KT;
  if (Math.abs(dcp) > 0.25) items.push({ head: 'Different at each end', src: 'model', text: `It runs ${kt1(Math.hypot(cp.x, cp.y) / KT)} kt at the ${C.pinLabel} end and ${kt1(Math.hypot(cc.x, cc.y) / KT)} kt at the ${C.committeeLabel} end. Time your run from the end you're starting at.` });
  // which end leads to the favoured side of the first beat
  if (first.kind === 'beat' && first.best !== 'middle' && first.certainty !== 'open') {
    const leftN = { x: -up.y, y: up.x }, leftEnd = dot(sub(C.pin, C.committee), leftN) > 0 ? C.pinLabel : C.committeeLabel, rightEnd = leftEnd === C.pinLabel ? C.committeeLabel : C.pinLabel;
    const want = first.best === 'left' ? leftEnd : rightEnd;
    items.push({ head: 'Start toward your plan', src: 'practice', text: `The first beat favors the ${first.best} (see the legs below), and the ${want} end is on that side. ${want === fav ? `It's also the favored end: a clear call, so expect a crowd there and win the end with timing, not by barging. ${(want === C.committeeLabel ? C.committeeKind : C.pinKind) === 'shore' ? 'This end is the shore, an obstruction: Rule 19 room applies there, but don\'t count on being given it; a windward boat must keep clear of a leeward one (Rule 11).' : 'Approaching a starting mark surrounded by navigable water there\'s no mark-room or obstruction room (the preamble to Section C switches off rules 18 and 19 there), and a windward boat must keep clear of a leeward one (Rule 11).'}` : `The favored end is the other one, so weigh the ${Math.round(m)} m you'd give away there against the gain of getting ${first.best} first. Usually, if the gain on the beat is bigger than the line's bias, start toward the side.`}` });
  }
  return { id: 'start', title: 'The start', items };
}

/** One leg's plan, explained. */
function legItems(o: Outlook, L: LegPlan): BriefItem[] {
  const items: BriefItem[] = [], P = L.plans, best = P[L.best];
  const head = `Leg ${L.i + 1}: to ${L.name}, ${KIND_WORD[L.kind]}`;
  if (L.island) items.push({ head: `Rounding ${L.name}`, src: 'model', text: `The plans are worked out to a berth about 200 m off the island's shore, not to its middle: give the rocks room and swing wide round its downwind side, out of the near-calm in its lee. Allow about ${Math.round(ISLAND_ROUNDING_S / 60)} minutes for the rounding.` });
  const when = `${clockOf(L.t0)}–${clockOf(L.t0 + L.minutes)}, about ${mins(L.minutes)}`;
  if (L.kind === 'reach') {
    const wd = o.wind(L.from, L.t0), c = o.current(L.from, L.t0), u = unit(sub(L.to, L.from)), v = polar(wd.kt, Math.abs(wrap(brg(u.x, u.y) - wd.from)));
    const across = cross(u, c) / KT, crab = Math.asin(clamp(cross(u, c) / Math.max(0.3, v), -0.95, 0.95)) / D2R, twa = Math.abs(wrap(brg(u.x, u.y) - wd.from));
    const kind = twa < 75 ? 'a close reach: sheets well in, ease in the puffs and keep her flat' : twa < 115 ? 'a beam reach: ease to the telltales; the vang holds the leech as the sheet comes out' : twa < 150 ? 'a broad reach: sails well out, vang on, crew back a little in a breeze' : 'nearly a run: wing on wing with the whisker pole is fastest this deep';
    let txt = `${when}. ${kind[0].toUpperCase()}${kind.slice(1)}.`;
    if (Math.abs(crab) > 30) txt += ` The current across the leg (${kt1(Math.abs(across))} kt, setting you to the ${across > 0 ? 'left' : 'right'}) is nearly as fast as she'll sail here: you can't hold a straight line. Get up-current early, while you have speed, and let it carry you down to the mark at the end.`;
    else if (Math.abs(across) > 0.2) txt += ` The current sets you ${across > 0 ? 'to the left' : 'to the right'} of the line to the mark at ${kt1(Math.abs(across))} kt: steer about ${Math.round(Math.abs(crab))}° ${crab > 0 ? 'right' : 'left'} of the mark (up-current) from the start of the leg and keep the mark steady against the shore behind it. Aim straight at it and the current sweeps you down-current in a curve, and the end of the leg is a slow climb back against it.`;
    items.push({ head, src: 'model', text: txt });
    return items;
  }
  const sides = (['left', 'right'] as Plan[]).filter(k => P[k].ok);
  const name = (k: Plan) => k === 'middle' ? 'up the middle' : k === 'shore' ? 'along the shore, in the slacker water near the beach' : `${k} (${sideWords(L.from, L.to, P[k].path.map(q => q.p), L.kind === 'beat' ? k === 'left' : k === 'right')})`;
  const times = (['left', 'middle', 'right', 'shore'] as Plan[]).filter(k => k !== 'shore' || P[k].ok).map(k => `${PLAN_WORD[k]} ${P[k].ok ? mins(P[k].minutes) : 'can\'t get there'}`).join(', ');
  const second = (['left', 'middle', 'right', 'shore'] as Plan[]).filter(k => k !== L.best && P[k].ok).sort((a, b) => P[a].minutes - P[b].minutes)[0];
  const gain = second ? (P[second].minutes - best.minutes) * 60 : 0;
  const sure = L.certainty === 'clear' ? 'A clear call: it holds whichever way the forecast is off.' : L.certainty === 'likely' ? 'Likely, but not certain.' : 'An open leg: no side pays enough to bank on.';
  items.push({ head, src: 'model', text: `${when}. Going ${name(L.best)} is fastest by ${Math.round(gain)} s over going ${second ? PLAN_WORD[second] : '—'} (${times}). ${sure}` });
  // why: the current and the wind on each side
  if (L.best === 'shore') {
    const b = P.shore, m = P.middle;
    items.push({ head: 'Why', src: 'model', text: `The tide's against you on this leg, and it runs slower near the beach: ${kt1(-b.meanCurAlong)} kt against you along the shore, ${kt1(-m.meanCurAlong)} kt out on the course. Work in toward the shore, keep about ${Math.round(Math.max(30, b.minShore))} m off it (the chart's shoals and the beach), and come out to the mark at the end. Bay sailors work the Cityfront this way on an ebb.` });
  } else if (sides.length === 2 && L.best !== 'middle') {
    const other: Plan = L.best === 'left' ? 'right' : 'left', b = P[L.best], a = P[other];
    const dc = b.meanCurAlong - a.meanCurAlong, dk = b.meanKt - a.meanKt, why: string[] = [];
    if (Math.abs(dc) > 0.08) why.push(dc > 0 ? `the current is ${kt1(Math.abs(dc))} kt kinder there (${b.meanCurAlong >= 0 ? `${kt1(b.meanCurAlong)} kt helping` : `${kt1(-b.meanCurAlong)} kt against`}, against ${a.meanCurAlong >= 0 ? `${kt1(a.meanCurAlong)} kt helping` : `${kt1(-a.meanCurAlong)} kt against`} on the ${other})` : `even though the current is ${kt1(-dc)} kt worse there`);
    if (Math.abs(dk) > 0.4) why.push(dk > 0 ? `there's ${kt1(dk)} kt more wind (${kt1(b.meanKt)} against ${kt1(a.meanKt)})` : `even with ${kt1(-dk)} kt less wind`);
    const lt = windTrend(o, L.t0, L.t0 + L.minutes), sh = lt.dFrom;
    // a swing over one leg counts as a shift only when the race-long trend is a persistent shift the same way: on an
    // oscillating day, a leg's worth of the record is just half an oscillation
    const day = windTrend(o, o.t0, Math.max(o.t0 + 60, L.t0 + L.minutes)), dayShift = Math.abs(day.dFrom) >= 5 && Math.abs(day.dFrom) > 1.5 * day.swing;
    if (Math.abs(sh) >= 3 && !(dayShift && Math.sign(day.dFrom) === Math.sign(sh))) why.push(`the wind swings about ${Math.round(Math.abs(sh))}° ${sh > 0 ? 'right (veers)' : 'left (backs)'} during this leg, but over the race it oscillates rather than shifts one way, so treat it as a shift to tack (or jibe) on, not a side to bank on`);
    else if (Math.abs(sh) >= 3 && Math.abs(sh) > 1.5 * lt.swing) {
      const side = shiftSide(sh, L.kind);
      why.push(side === L.best ? `the wind ${sh > 0 ? 'veers' : 'backs'} about ${Math.round(Math.abs(sh))}° during the leg, which favors the ${side}${L.kind === 'run' ? ' on a run' : ''}`
        : `the wind ${sh > 0 ? 'veers' : 'backs'} about ${Math.round(Math.abs(sh))}° during the leg, which on its own would favor the ${side}${L.kind === 'run' ? ' on a run' : ''}, but the rest outweighs it`);
    } else if (lt.swing >= 4) why.push(`the wind oscillates about ${Math.round(lt.swing)}° either way during the leg with no steady trend, so the shifts don't favor a side: tack (or jibe) on them`);
    if (why.length) items.push({ head: 'Why', src: 'model', text: `${why.join('; ')}.`.replace(/^./, s => s.toUpperCase()) });
  }
  if (L.best === 'middle' || L.certainty === 'open') items.push({ head: 'How to sail it', src: 'practice', text: `When the sides are close, play what you can see: tack on the headers (when the compass says you've been knocked 5° or more and it's held for a few seconds), sail toward the dark patches of pressure coming down the course, and stay between the fleet and the mark rather than banking on a corner.` });
  if (L.flips.length) {
    const byPlan = new Map<Plan, string[]>();
    for (const f of L.flips) byPlan.set(f.plan, [...(byPlan.get(f.plan) ?? []), f.label]);
    items.push({ head: 'Plan B', src: 'model', text: [...byPlan].map(([p, ls]) => `go ${PLAN_WORD[p]} if ${ls.join(' or ')}`).join('; ').replace(/^./, s => s.toUpperCase()) + '. Check the wind against the forecast before the start (the compass heading on each tack, the flags on shore, the dark water upwind), and decide then.' });
  }
  if (best.tacks > 0 || L.kind === 'run') items.push({ head: 'Laylines', src: 'model', text: `${L.kind === 'beat' ? `About ${best.tacks} tack${best.tacks === 1 ? '' : 's'} on this plan.` : `About ${best.tacks} jibe${best.tacks === 1 ? '' : 's'}.`} The current bends the layline: with it setting you toward the mark you can tack early; against you, carry on a little past where the mark looks right. The laylines on the map allow for it.` });
  if (best.minShore < 150 && L.kind === 'beat') items.push({ head: 'Near the shore', src: 'model', text: `This plan takes you within ${Math.round(best.minShore)} m of the shore: short-tacking along a shore, a boat close-hauled and approaching it may hail a boat to windward on the same tack for room to tack (Rule 20.1); the hailed boat must respond, by tacking, or by replying "You tack" and giving her room. So you can hail the boat to windward of you, and a boat to leeward can hail you. Since 2025 the hail must be the words "Room to tack".` });
  return items;
}

function courseSection(o: Outlook, legs: LegPlan[]): BriefSection {
  const items = legs.flatMap(L => { const it = legItems(o, L); if (L.island) it.push(it.shift()!); return it; });
  // ("about a tenth longer": the sim's own fleet sailing the same legs took 5–20% longer on the beats, 47 min planned
  // against about 50 sailed; tests/sim-fleet.test.ts holds the brief to that)
  return { id: 'legs', title: 'The course: which way on each leg', lede: 'Each leg is sailed on paper three ways, at the Folkboat\'s polar speeds in the wind and current the day brings along the way: going left first and tacking (or jibing) on the layline, going right first, and staying near the middle. Left and right are looking upwind, as sailors say it; the direction in brackets says where on the water that is. The best plan is drawn on the map. Each is then tested against the forecast being off, to say how sure the call is. The times are for a perfect sail (each tack or jibe costing what the boat measured for the wind: about 3 s in a breeze, over 20 in a drifter): upwind, a race typically takes about a tenth longer, and more on the first beat and round the first mark, where the fleet is bunched.', items };
}

/** The other boats: what you know about them. */
function fleetSection(w: SimView): BriefSection {
  const items: BriefItem[] = [];
  const opp = w.boats.filter(b => !b.isUser);
  const describe = (b: Boat): string => {
    const bits: string[] = [];
    if (b.spec) {
      const p = b.spec.perf, fouled = p.cleanedWeeks >= 8;
      bits.push(`${p.mainAge === 'new' && p.jibAge === 'new' ? 'new sails' : p.mainAge === 'old' || p.jibAge === 'old' ? 'tired sails' : 'part-worn sails'}`, `${p.mast === 'wood' ? 'a wooden mast' : 'an aluminum mast'}`, fouled ? `a bottom ${p.cleanedWeeks} weeks from a scrub (slower, most of all in light air)` : 'a clean bottom');
    } else bits.push(`a ${b.build?.hull === 'wood' ? 'wooden' : 'glassfibre'} club boat in good order`);
    const ai = b.ai;
    if (ai) {
      bits.push(ai.f > 0.65 ? `likes to start near the ${w.C.committeeLabel} end` : ai.f < 0.35 ? `likes to start near the ${w.C.pinLabel} end` : 'usually starts mid-line');
      if (ai.aggr > 4) bits.push('pushes the line hard (is sometimes over early)');
      else if (ai.aggr < 1.5) bits.push('starts cautiously, often a little late');
      if (!ai.aware) bits.push('underrates the current at the start');
    }
    return `${b.name} (${b.no}): ${bits.join('; ')}.`;
  };
  if (opp.length) items.push({ head: `${opp.length} boat${opp.length === 1 ? '' : 's'}`, src: 'model', text: opp.map(describe).join(' ') + ' (What the fleet knows of each other from racing together; the habits are how the AI skippers here sail.)' });
  const u = w.user;
  if (u.spec) {
    const p = u.spec.perf, notes: string[] = [];
    if (p.cleanedWeeks >= 8) notes.push(`her bottom is ${p.cleanedWeeks} weeks from a scrub: she'll be slower than a clean boat, worst in light air, so fight for clear air rather than for height`);
    if (p.mainAge === 'old' || p.jibAge === 'old') notes.push('her sails are tired: the draft blows aft in a breeze, so pull the Cunningham on earlier than the other boats do');
    if (notes.length) items.push({ head: 'Your boat', src: 'model', text: notes.join('; ').replace(/^./, s => s.toUpperCase()) + '.' });
  }
  items.push({ head: 'Racing the fleet', src: 'practice', text: opp.length <= 3 ? 'In a small fleet every boat counts: once you\'re ahead, stay between the boats behind and the next mark (cover them loosely, so you don\'t lose the side you wanted). On a clear call get to the favored side first; on an open leg sail your own race in clear air.' : 'In a bigger fleet, the start and the first beat decide most of it: clear air off the line is worth more than the favored end, and on the first beat sail toward the favored side without getting caught on a layline early, where every boat that tacks ahead of you takes your wind.' });
  return { id: 'fleet', title: 'The competition', items };
}

/** How to set the boat up, phase by phase, from the boat's own sail and crew model (boat/controls.ts, crewPhys.ts). */
function trimSection(w: SimView, o: Outlook, legs: LegPlan[], finishT: number): BriefSection {
  const items: BriefItem[] = [], gun = o.t0, u = w.user, cond = u.cond ?? (u.spec ? condition(u.spec, +w.raceDate.slice(5, 7)) : null);
  const span = finishT - gun;
  const phases = span < 40 ? [{ name: 'The race', a: gun, b: finishT }]
    : [{ name: 'Start and first beat', a: gun - 5, b: gun + Math.min(legs[0].minutes, span / 3) }, { name: 'The middle of the race', a: gun + span / 3, b: gun + 2 * span / 3 }, { name: 'The last legs and the finish', a: gun + 2 * span / 3, b: finishT }];
  const area = [w.C.center, ...legs.map(L => L.to)];
  let prevKt: number | null = null, prevBody = '';
  for (const ph of phases) {
    const kts: number[] = [];
    for (let t = ph.a; t <= ph.b + 0.1; t += 5) for (const p of area) kts.push(o.wind(p, t).kt);
    const lo = Math.min(...kts), hi = Math.max(...kts), mean = kts.reduce((a, b) => a + b, 0) / kts.length;
    let gustKt = 0; for (let t = ph.a; t <= ph.b + 0.1; t += 5) { const br = o.breeze(t); gustKt = Math.max(gustKt, br.kt * br.gust); }
    const sea = o.sea(w.C.center, (ph.a + ph.b) / 2), tws = mean;
    // close-hauled: the angle, speed and the apparent wind the crew trims to
    const flat = beatAngle(tws), chopB = sea.hsW < 0.02 ? flat : beatInChop(tws, sea.hsW, sea.tpW), vb = speedInChop(tws, chopB, sea.hsW, sea.tpW);
    const awx = tws * Math.sin(chopB * D2R), awy = tws * Math.cos(chopB * D2R) + vb / KT, awa = Math.atan2(awx, awy) / D2R, aws = Math.hypot(awx, awy);
    const dep = clamp((tws - 14) / 10, 0, 1); // where the crew starts from, as the boat does (boat/physics.ts)
    const s = crewSolve(tws, awa, 'S', optimalSheet('main', awa), optimalSheet('jib', awa), undefined, mainRig({ tune: u.tune, rigMain: u.rigMain, cond: cond ?? undefined }), cond?.jib, aws, dep);
    const tm = targetShape('main', tws, awa, dep);
    const regime = tws < 6 ? 'light' : tws < 13 ? 'medium' : 'heavy';
    const crew = tws < 6 ? 'Crew to leeward and forward, to heel her a few degrees: the sails hold their shape and the wetted area drops.'
      : tws < 8 ? 'Crew sitting up to windward; no need to hike yet.'
      : tws < 13 ? 'Crew to windward, hiking in the puffs to keep her heel under about 15–18°.'
      : 'Everyone hiking hard: weight out is the cheapest power there is. Past about 18° of heel she\'s slower and fights the helm; depower before you ease the main.';
    const head = `${ph.name} (${clockOf(ph.a)}–${clockOf(ph.b)}): ${Math.round(lo)}–${Math.round(hi)} kt, gusts to ~${Math.round(gustKt)}, ${describeSea(sea)}`;
    // (the traveller isn't given from the crew model: its solver trades the traveller against the mainsheet for the same
    // boom angle, and lands it to leeward in medium air, which isn't how boats are sailed; that's for the trim model)
    const trav = tws < 13 ? 'traveler up enough to keep the boom near the centerline' : tws < 17 ? 'traveler centered, eased down in the puffs' : 'traveler down to leeward once the rest is done';
    const set = `Upwind: outhaul ${amount(s.outhaul, ['eased', 'eased a little', 'half', 'well on', 'tight'])}, backstay ${amount(s.backstay)}, Cunningham ${amount(s.cunningham)}, vang ${amount(s.vang)}, ${trav}, jib cars on pin ${s.carFore + 1} of ${CAR_FORE_PINS} from forward. That sets the main about ${Math.round(tm.depth * 100)}% deep with its draft ${Math.round(tm.draft * 100)}% of the way back and ${Math.round(tm.twist)}° of twist.`;
    const chop = chopB - flat >= 1 ? ` In this chop the best angle upwind opens from ${Math.round(flat)}° to ${Math.round(chopB)}° off the true wind: foot for speed, don't pinch.` : '';
    const body = `${regime[0].toUpperCase()}${regime.slice(1)} air. ${set} Target upwind: ${kt1(vb / KT)} kt at ${Math.round(chopB)}° to the true wind.${chop} ${crew}`;
    items.push({ head, src: 'model', text: body === prevBody ? 'The same as the phase before.' : body });
    prevBody = body;
    if (prevKt != null && Math.abs(mean - prevKt) >= 2.5) {
      const up = mean > prevKt;
      items.push({ head: up ? 'As it builds' : 'As it eases', src: 'model', text: up
        ? `Depower in the order the boat answers to: outhaul first (a flatter foot), then the backstay (it bends the mast to flatten the main and tightens the forestay to flatten the jib), then the Cunningham to pull the draft back forward, then the vang on hard and the jib cars aft to twist off the top of the jib; the traveler down to leeward last, when you're still overpowered.`
        : 'Power up in the reverse order: traveler back up, cars forward, vang and Cunningham off, backstay eased for a fuller jib and main, then the outhaul. Get the crew in off the rail before the boat goes upright.' });
    }
    prevKt = mean;
  }
  // downwind, from the crew model
  const mid = o.breeze(gun + span / 2).kt, fore = bestFore(150, mid, true);
  items.push({ head: 'Downwind', src: 'model', text: `Running deep, wing on wing with the whisker pole (a Folkboat races without a spinnaker unless the sailing instructions allow one). Crew weight ${fore > 0.5 ? 'forward, by the mast, so the transom lifts clear and she stops dragging it' : 'back, to keep the bow up in a breeze'}. Vang on to stop the main twisting off; ease the outhaul and backstay for depth.` });
  { // the rig's tune, set at the dock (boat/rigTune.ts): against the day's range
    const kts = phases.map(ph => o.breeze((ph.a + ph.b) / 2).kt), lo = Math.min(...kts), hi = Math.max(...kts), mean = kts.reduce((a, b) => a + b, 0) / kts.length;
    items.push(u.tune ? { head: 'Rig tune', src: 'model', text: tuneBrief(u.tune, Math.min(lo, w.forecastKt), w.forecastKt || mean, Math.max(hi, w.forecastKt), !!u.spec?.perf.jumpersUnderWay) }
      : { head: 'Rig tune', src: 'practice', text: 'Before you leave the dock, set the rig for the middle of the day\'s range: the sailmakers\' Folkboat guides take up on the shrouds as the breeze builds (less forestay sag, a flatter jib that points) and ease them in light air (more sag, more power).' });
  }
  return { id: 'trim', title: 'Trim and tuning, by phase', lede: 'From the boat\'s own sail and crew model: the settings below are what makes the fastest sail shapes in that wind here, and what the crew will set if they\'re trimming.', items };
}

/** The strategist's whole briefing for a World, before the start. */
export function raceBrief(w: SimView): RaceBrief {
  const o = outlookFor(w), legs = planLegs(w, o), last = legs[legs.length - 1], finishT = last.t0 + last.minutes;
  const sure = srcWords(w).sure;
  const limit = windLimitSection(w, o, finishT);
  const sections = [...(limit ? [limit] : []), daySection(w, o, finishT), startSection(w, o, legs), courseSection(o, legs), fleetSection(w), trimSection(w, o, legs, finishT)];
  return {
    title: `${w.C.title}: the strategist's briefing`,
    sub: `${new Date(w.raceDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}, start ${clockOf(o.t0)}. About ${mins(finishT - o.t0)} round at the polar speeds on these plans; real fleets, and the sim's, take about 15% longer (puffs, lulls, tacks and each other's wind, as the committee's course table allows). Confidence in the wind: ${sure}.`,
    sections, legs, finishT
  };
}
