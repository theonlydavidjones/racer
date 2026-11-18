/**
 * The end of a race and the pause screen: the Pause button and its menu, the debriefs (the comparison with the winner, the tactical debrief and its chart, the race replay, a real past race's line), the boats' logbooks, the scores and the results screen.
 * (A part of src/app.ts, as it was there: it reaches the app's own state through `app`, app.ts's ctx.)
 */
import { place } from '../sim/places';
import { keepGhost, setupKey, trackOf } from '../replay/ghost';
import { addLog, type LogEntry, type RaceSetup } from '../boat/logbook';
import { saveSettings } from '../settings';
import { localDay } from '../boat/spec';
import { slipById, slipPlace } from '../geo/marina';
import { type BoatSpec } from '../boat/spec';
import { tactics, type Tactics } from '../replay/tactics';
import { tacticsHtml, tacticsTop, type TacShown } from '../ui/tacticsView';
import { planLegs } from '../sim/strategist';
import { outlookFor } from '../sim/outlook';
import { beatAngle } from '../boat/polar';
import { bigMoments, gapWords, legWords, rivalWho, versus, type VsInput } from '../replay/versus';
import { V, brg, dist, wrap } from '../core/math';
import { RULES, hearings, ptsText, raceScores, scoreOrder, type Decision, type ScoreOut } from '../rules';
import { ReplayView } from '../replay/replayView';
import { keepSeasonRace } from '../club/season';
import { placeAmong, realRace } from '../sim/realRaces';
import type { Boat } from '../boat/boat';
import { compass } from '../environment/sun';
import { $ } from '../ui/dom';
import { toast } from '../ui/feedback';
import { fmtClock } from '../ui/hud';
import { sfClock } from '../environment/tide';
import { onSaveTrouble } from '../store/cloud';
import type { AppCtx } from '../app';

export function mountResults(app: AppCtx) {
$('bPause').onclick = () => {
  if (!app.w.running) return; app.send({ k: 'pause', on: true }); app.setControlsIdle(); $('pause').hidden = false;
  $('bRestart').textContent = app.w.drill || app.w.rounding ? 'Restart Drill' : app.w.freeSail ? 'Restart Cruise' : 'Restart Race';
  const d = $('pauseDebrief'), html = app.w.drill ? app.drills.drillHtml() : app.w.rounding ? app.drills.roundHtml() : app.w.userFinishT == null ? debriefHtml('Your race so far') : ''; d.innerHTML = html; d.hidden = !html;
  mountDebriefTactics(d);
  $('bWatch2').hidden = !html || app.w.track.length < 2;
  $('pause').querySelector('.panel')!.classList.toggle('nodeb', !html); // (no debrief: the column alone)
  // aground on a cruise: wait for the tide to float her, the time she floats on the button (the owner, 14 Nov 2026)
  const floats = app.w.cruising ? app.w.floatTime() : null, wait = $('bWaitTide');
  wait.hidden = floats === null; if (floats !== null) wait.textContent = `Wait for the Tide (afloat ${sfClock(floats / 60e3)})`;
};
$('bWaitTide').onclick = () => { $('pause').hidden = true; app.send({ k: 'waitTide' }); app.send({ k: 'pause', on: false }); };
/** What the replay's comparison with the winner needs: every boat's start, marks and finish, and the legs. */
function vsInput(log: NonNullable<typeof app.w.log>): VsInput {
  const C = app.w.C, wind = app.w.committeeFrom, last = C.marks[C.marks.length - 1]?.p ?? C.center;
  // the finish leg's point of sail, as the course sets the others' (courses/course.ts: within 55° of the committee's wind a beat, past 125° a run)
  const off = Math.abs(wrap(brg(C.center.x - last.x, C.center.y - last.y) - wind)), fin = off < 55 ? 'beat' : off > 125 ? 'run' : 'reach';
  return {
    frames: app.w.track, you: app.w.user.id, startTimes: app.w.startTimes, marks: log.boatMarks, from: C.center, finishLine: [C.pin, C.committee],
    boats: (sc => app.w.boats.map(b => ({ id: b.id, name: b.isUser ? 'You' : b.name, finishT: b.finished ? b.finishT : null, dsq: b.scoring === 'UFD' || b.scoring === 'BFD' || sc.get(b.id)!.code === 'DSQ', points: sc.get(b.id)!.points })))(scores()),
    legs: [...C.marks.map(m => ({ name: m.name, to: m.p, kind: m.leg })), { name: 'the finish', to: C.center, kind: fin as 'beat' | 'reach' | 'run' }]
  };
}
/* ---------------- the tactical debrief (replay/tactics.ts, ui/tacticsView.ts) ---------------- */
/** The planner's ideal for this race (strategist.planLegs: costly, so once a race), and what's shown on the chart. */
let tacPlan: { w: unknown; legs: ReturnType<typeof planLegs> } | null = null;
const tacShown: TacShown = { best: true, ideal: true, boats: new Set() };
let tacShownFor: unknown = null;
/** The plan, once a race (outlookFor reads the gun's day, not the clock: the same plan the briefing showed). */
function tacPlanNow(): ReturnType<typeof planLegs> {
  if (tacPlan?.w !== app.w) { try { tacPlan = { w: app.w, legs: planLegs(app.w, outlookFor(app.w)) }; } catch (e) { console.warn('the tactical debrief: no ideal', e); tacPlan = { w: app.w, legs: [] }; } }
  return tacPlan.legs;
}
/** A planned leg's time, s: its sailing time and the rounding at its end (an island's, or 10 s at a mark: strategist.legEnds). */
const idealS = (P: ReturnType<typeof planLegs>, k: number) => !P[k] ? null : ((P[k + 1] ? P[k + 1].t0 - P[k].t0 : P[k].minutes) * 60);
function tacticsNow(): Tactics | null {
  const log = app.w.log; if (!log || app.w.track.length < 2 || app.w.drill) return null;
  tacPlanNow();
  const C = app.w.C, u = app.w.user.id, V0 = vsInput(log);
  const legs = V0.legs.map((L, k) => ({ name: L.name, from: k === 0 ? C.center : V0.legs[k - 1].to, to: L.to, kind: L.kind, ideal: idealS(tacPlan!.legs, k) }));
  // what the race log measured for you, by leg: past the layline, and each tack or gybe's cost. A moment goes to the leg
  // it happened in: a tack at its turn (the moment opens 3 s before it), a spell at its middle; the first leg from the gun
  const ends = [0, ...C.marks.map((_, k) => log.boatMarks[u]?.[k] ?? null), app.w.user.finished ? app.w.user.finishT : null];
  const at = (m: { key: string; t0: number; t1: number }) => m.key === 'tacks' ? m.t0 + 3 : (m.t0 + m.t1) / 2;
  const ms = log.moments(app.w), logged = legs.map((_, k) => {
    const a = ends[k], b = ends[k + 1] ?? Infinity, inLeg = (m: { key: string; t0: number; t1: number }) => a != null && at(m) >= a && at(m) < b;
    return { laylines: ms.filter(m => m.key === 'laylines' && inLeg(m)).reduce((x, m) => x + m.lost, 0), tacks: ms.filter(m => m.key === 'tacks' && inLeg(m)).map(m => m.lost) };
  });
  return tactics({ frames: app.w.track, you: u, beat: beatAngle(app.w.wind.kt), tws: app.w.wind.kt, hs: app.w.user.sea?.hsW ?? 0, legs, logged,
    boats: app.w.boats.map(b => ({ id: b.id, name: b.isUser ? 'You' : b.name, color: b.color, start: app.w.startTimes[b.id] ?? null, marks: log.boatMarks[b.id] ?? [], finishT: b.finished ? b.finishT : null })) });
}
/** Draw the tactical debrief into `host` (the results' or the pause screen's debrief, or the replay's list), and answer its chips. */
function mountTactics(host: HTMLElement, compact: boolean, onLeg: (i: number) => void): void {
  const T = tacticsNow(); if (!T || T.rows.length < 2) { host.innerHTML = ''; return; }
  if (tacShownFor !== app.w) {
    // a new race: the winner shown beside you (or the boat second, if you won)
    tacShownFor = app.w; tacShown.boats.clear();
    const V = versus(vsInput(app.w.log!)); if (V) tacShown.boats.add(V.rival);
  }
  // (a fleet goes by sail numbers, the owner, 13 Nov 2026: the chips say "USA 122 Varnish", the chart's tight spots "USA 122")
  const boats = app.w.boats.map(b => ({ id: b.id, name: b.isUser ? 'You' : `${b.no} ${b.name}`.trim(), short: b.isUser ? 'You' : b.no || b.name, color: b.color }));
  const paint = () => {
    const sc = scores(), me = sc.get(app.w.user.id), place = me?.rank != null ? `${ordinal(me.rank)} of ${app.w.boats.length}` : 'Racing';
    host.innerHTML = (compact ? '' : tacticsTop(T, place, app.w.user.finishT != null ? app.mmss(app.w.user.finishT) : `${app.mmss(app.w.t)} so far`)) + tacticsHtml(T, boats, app.w.user.id, tacShown, { compact });
  };
  paint();
  host.onclick = e => {
    const el = e.target as HTMLElement, chip = el.closest<HTMLElement>('[data-tchip]')?.dataset.tchip;
    if (chip) {
      if (chip === 'best') tacShown.best = !tacShown.best; else if (chip === 'ideal') tacShown.ideal = !tacShown.ideal;
      else if (chip !== 'you') { const id = +chip; if (tacShown.boats.has(id)) tacShown.boats.delete(id); else tacShown.boats.add(id); }
      paint(); return;
    }
    const leg = el.closest<HTMLElement>('[data-tleg]')?.dataset.tleg; if (leg != null) onLeg(+leg);
  };
}
/** The planner's ideal track on each leg, for the replay (dashed beside yours). */
const idealPaths = () => tacPlanNow().map(L => L.plans[L.best].path.map(q => q.p));

/** The race replay: your race from just before the gun, with the debrief on its track and timeline. */
function watchRace(): void {
  const log = app.w.log; if (!log || app.w.track.length < 2) return;
  app.raceReplay.open(app.w, {
    frames: app.w.track, moments: log.moments(app.w), findings: log.findings(app.w), wind: app.w.gun?.windFrom ?? app.w.wind.from,
    marks: log.places().filter(p => p.t != null).map(p => ({ name: p.name, t: p.t! })), clips: app.incidentClips,
    vs: versus(vsInput(log)), real: realLine(),
    tactics: (host, onLeg) => mountTactics(host, true, onLeg), idealPaths: idealPaths(), chosen: () => [...tacShown.boats]
  });
}
/**
 * A real past race (Charts' sim/realRaces.ts): in a line, where your time would have placed among the real fleet on the
 * day, the gap to its winner and that per mile, with the doubt about the course's length beside the per-mile figure
 * when the published distance and the course sheet disagree. (The results page has the full table: realResults.)
 */
function realLine(): string | undefined {
  const r = app.S.realRace ? realRace(app.S.realRace) : undefined; if (!r || app.w.userFinishT == null) return undefined;
  const fin = r.boats.filter(b => b.elapsedS != null && b.code == null).sort((a, b) => a.elapsedS! - b.elapsedS!); if (!fin.length) return undefined;
  const you = app.w.userFinishT, { place, of } = placeAmong(r, you), gap = you - fin[0].elapsedS!, per = gap / Math.max(0.1, r.distanceNm);
  const day = new Date(r.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  // Charts' "Course uncertain: …" sentence, where the sim's own perfect boat can't match the real times (the course or
  // the recorded wind in doubt); ahead of the doubt about the distance. (Read loosely: the field lands on its own.)
  const uncertain = (r as { uncertain?: string | null }).uncertain ?? null;
  return `On ${day} (${r.event}, race ${r.raceNo}) you'd have placed ${ordinal(place)} of ${of}: ${gap <= 0 ? `${app.mmss(-gap)} ahead of ${app.titleCase(fin[0].boat)}, who won` : `${app.mmss(gap)} behind ${app.titleCase(fin[0].boat)}, who won, ${Math.round(per)} s a mile over its ${r.distanceNm} nm`}.${uncertain ? ` ${uncertain}` : ''}${r.doubt && gap > 0 ? ` ${r.doubt}` : ''}`;
}
$('bWatch').onclick = $('bWatch2').onclick = watchRace;
$('bResume').onclick = () => { $('pause').hidden = true; app.send({ k: 'pause', on: false }); };
$('bRestart').onclick = () => { $('pause').hidden = true; app.beginRace(); };
$('bSettings').onclick = () => { $('pause').hidden = true; app.toSetup(); };
$('bAgain').onclick = () => { $('results').hidden = true; app.beginRace(); };
$('bSet2').onclick = () => { $('results').hidden = true; app.toSetup(); };


/** The tactics debrief: what cost you time, most first, and your place at each mark. */
/** The tactical chart at the top of a debrief: clicking a leg opens "Watch your race" on it. */
function mountDebriefTactics(box: HTMLElement): void {
  const host = box.querySelector<HTMLElement>('.tacHost[data-tac]'); if (!host) return;
  mountTactics(host, false, i => { watchRace(); app.raceReplay.pickLegNo(i); });
}
function debriefHtml(title: string): string {
  const log = app.w.log;
  if (!log || app.w.t <= 0) return '';
  const nth = (n: number) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th');
  const fs = log.findings(app.w), pl = log.places().filter(p => p.place != null);
  // (the tip on hover: the owner, 13 Nov 2026, one line on the screen)
  const items = fs.map(f => `<li title="${app.esc(f.tip).replace(/"/g, '&quot;')}"><div class="dbHead"><b>${app.esc(f.title)}</b><span class="dbLost">${f.key === 'start' && f.lost < 2 ? 'on time' : `−${f.lost} s`}</span></div><p>${app.esc(f.detail)}</p></li>`).join('');
  const marks = pl.length > 1 ? `<p class="lede">Your place at each mark: ${pl.map(p => `${app.esc(p.name)} ${nth(p.place!)}`).join(' → ')}.</p>` : '';
  const total = fs.reduce((a, f) => a + f.lost, 0);
  return `<div class="eyebrow">${title}</div><div class="tacHost" data-tac></div>${items ? `<p class="lede">What cost you time, most first: about ${total} s in all.</p><ol>${items}</ol>` : '<p class="lede">Nothing cost you more than a couple of seconds.</p>'}${marks}${vsDebriefHtml(log)}`;
}
/**
 * Against the winner (or the boat second, if you won), in the debrief: the gap, a line for each leg, and the moments
 * that cost or gained most (her tacks and gybes against yours, on the shifts), from the race's own recorded tracks.
 * The replay ("Watch your race") has every moment, to jump to.
 */
function vsDebriefHtml(log: NonNullable<typeof app.w.log>): string {
  const V = app.w.track.length > 1 ? versus(vsInput(log)) : null;
  if (!V || V.legs.length < 2) return '';
  const sgn = (x: number) => Math.abs(x) < 0.5 ? '±0 s' : `${x > 0 ? '−' : '+'}${Math.round(Math.abs(x))} s`;
  const kindW: Record<string, string> = { beat: 'a beat', reach: 'a reach', run: 'a run' };
  const legs = V.legs.map(L => {
    const mark = L.moments.find(m => m.kind === 'mark');
    return `<li><div class="dbHead"><b>${L.i ? `Leg ${L.i}, to ${app.esc(L.name)} (${kindW[L.kind]})` : 'The start'}</b><span class="dbLost">${sgn(L.lost)}</span></div><p>${app.esc(legWords(L, V.rivalName))}${mark ? ` ${app.esc(mark.text)}` : ''}</p></li>`;
  }).join('');
  const big = bigMoments(V);
  const moments = big.length ? `<p class="lede">The moments that counted most:</p><ol>${big.map(m => `<li><div class="dbHead"><span><b>Leg ${m.leg}:</b> ${app.esc(m.text)}</span><span class="dbLost">${m.lostM > 0 ? '−' : '+'}${Math.round(Math.abs(m.lostM))} m</span></div></li>`).join('')}</ol>` : '';
  return `<div class="eyebrow">Against ${app.esc(V.rivalName)}, ${rivalWho(V, app.w.boats[V.rival].finished)}</div><p class="lede">${app.esc(gapWords(V))}</p><ol>${legs}</ol>${moments}`;
}

/* ---------------- the boats' logbooks ---------------- */
function outing(b: BoatSpec, isUser: boolean): Omit<LogEntry, 'kind' | 'title'> {
  const c = app.S.crew, n = c?.n ?? 2;
  return {
    boatId: b.id, at: new Date().toISOString(), day: app.w.raceDate, time: app.S.tideTime || '12:00',
    skipper: isUser ? 'you' : 'ai', crew: isUser ? (n ? `You at the helm, ${n} crew` : 'You, single-handed') : 'Generic AI skipper and crew',
    wind: `${compass(app.w.windModel.base)} ${Math.round(app.w.wind.kt)} kt`
  };
}
/** The settings a race was sailed in, kept with your entry so you can sail it again (Run a past race). */
const REPLAY_KEYS = ['tideTime', 'opponents', 'realRace', 'raceLength', 'windKind', 'windKt', 'windDir', 'windTurn', 'chop', 'swellHs', 'current', 'rain', 'fog', 'windDay', 'swellDay', 'traffic', 'seq', 'prepFlag', 'penaltyTurns', 'judging', 'bias', 'raceFrom', 'crew', 'sea'] as const;
function raceSetup(): RaceSetup {
  const s: Record<string, unknown> = { tideDate: app.w.raceDate };
  for (const k of REPLAY_KEYS) if (app.S[k] !== undefined) s[k] = structuredClone(app.S[k]);
  if (app.replayPin != null) s.windDir = app.replayPin; // (sailed again, then saved: it keeps its pinned direction)
  return { seed: app.w.seed, course: app.w.C.id, s };
}
/** The race, into the logbook of every boat of yours in it: her place (or why she has none) and her time. */
function logRace(rows: Boat[], sc: Map<number, ScoreOut>): void {
  if (app.w.logged || app.S.mode === 'drill') return; app.send({ k: 'shown', logged: true });
  const title = `${app.w.C.title}${app.w.courseSignal ? ` (course ${app.w.courseSignal.no})` : ''}`, out: LogEntry[] = [];
  rows.forEach(b => {
    const spec = b.isUser ? app.S.boat : b.spec && app.S.boats.some(x => x.id === b.spec!.id) ? b.spec : null; if (!spec) return;
    const dsq = b.scoring === 'UFD' || b.scoring === 'BFD' || sc.get(b.id)?.code === 'DSQ';
    const entry: LogEntry = { ...outing(spec, b.isUser), kind: 'race', title, of: rows.length, ...(b.isUser ? hurtOf() : {}), ...(b.isUser ? { setup: raceSetup() } : {}),
      ...(dsq ? { code: 'DSQ' } : b.finished ? { place: sc.get(b.id)!.rank ?? rows.indexOf(b) + 1, ...([...sc.values()].filter(x => x.points != null && x.points === sc.get(b.id)!.points).length > 1 ? { tied: true } : {}), elapsed: b.finishT!, ...(b.scoring === 'ZFP' ? { code: 'ZFP' } : {}) } : { code: 'unfinished' }) };
    out.push(entry);
    // your run, kept as a ghost for this race if you save it (her own track from the race's, once a second)
    if (b.isUser && entry.setup) { const sr = app.seasonRaceOf(); app.pendingSeason = sr ? { ...sr, at: entry.at } : null; }
    if (b.isUser && entry.setup) app.pendingGhost = { at: entry.at, key: setupKey(entry.setup), elapsed: entry.elapsed, place: entry.place, of: entry.of, code: entry.code, pts: trackOf(app.w.track, b.id) };
  });
  stage(out);
}
/** Wrecked and towed in (the wreck's choice, app.ts wreckAsk): this outing's log says so. */
let towedIn: unknown = null;
function towed(): void { towedIn = app.w; }
/** What harm came to her this outing, for her logbook: wrecked (how, where; towed in), or the worst damage short of it. */
function hurtOf(): Partial<LogEntry> {
  const u = app.w.user, d = u.damage?.level;
  if (u.wrecked) return { wreck: `${u.wrecked.how}, ${u.wrecked.where}`, ...(towedIn === app.w ? { towed: true } : {}) };
  return d === 'damage' || d === 'serious' ? { damage: d } : {};
}
/** Repairs (the owner's answers, WRECK-PROPOSAL section 7): wrecked, she's laid up for a few real days; damaged, a day
 * (ESTIMATES: WRECK_DAYS, DAMAGE_DAYS). No money. Once per outing, whether or not it's kept in her logbook. */
const WRECK_DAYS = 3, DAMAGE_DAYS = 1, laidUp = new WeakSet<object>();
function layUp(): void {
  const w = app.w; if (!w || laidUp.has(w)) return;
  const h = hurtOf(), days = h.wreck ? WRECK_DAYS : h.damage ? DAMAGE_DAYS : 0; if (!days) return;
  laidUp.add(w);
  const until = localDay(days - 1); // (laid up today and the days after it: 3 days is today and the next two)
  if (!app.S.boat.laidUpUntil || app.S.boat.laidUpUntil < until) app.S.boat.laidUpUntil = until;
  saveSettings(app.S);
}
/** Leaving an outing (back to the start page, to setup, or starting another): log it if there's anything to log. */
function logOuting(): void {
  if (!app.w || app.w.logged) return;
  layUp(); // (a drill too: she's as damaged)
  if (app.S.mode === 'drill') return;
  if (app.S.mode === 'sail' && app.w.freeSail && (app.w.t >= 60 || app.w.user.wrecked)) {
    app.send({ k: 'shown', logged: true });
    const from = app.S.sailFrom === 'slip' ? `her slip (${(s => s ? slipPlace(s) : '')(slipById(app.S.boat.slip))})` : place(app.S.sailFrom)?.name ?? 'the Bay';
    stage([{ ...outing(app.S.boat, true), kind: 'cruise', title: `From ${from}${app.w.dest ? ` to ${app.w.dest.name}` : ''}`, elapsed: Math.round(app.w.t), nm: app.w.sailedM / 1852, arrived: app.w.arrivedT != null, ...hurtOf() }]);
  } else if (app.S.mode === 'race' && !app.w.freeSail && app.w.cancelled) {
    // racing called off for the wind: no result, but the outing goes in her logbook
    app.send({ k: 'shown', logged: true });
    stage([{ ...outing(app.S.boat, true), kind: 'race', title: app.w.C.title, code: 'CXL', of: app.w.boats.length, setup: raceSetup() }]);
  } else if (app.S.mode === 'race' && !app.w.freeSail && app.w.userFinishT != null && heard().decisions.some(owesAnswer)) {
    // you left with a protest against you unanswered: heard in your absence (RRS 63.1(b)), and the race logged so
    for (const d of heard().decisions) if (owesAnswer(d)) answered.set(`${d.protest.vs}@${d.protest.t}`, 'hearing');
    const sc = scores(); logRace(scoreOrder([...sc.values()], id => app.w.boats[id].finished ? app.w.boats[id].finishT : null).map(s => app.w.boats[s.id]), sc);
  } else if (app.S.mode === 'race' && !app.w.freeSail && app.w.t > 0 && app.w.userFinishT == null) {
    // you left the race before finishing: retired
    app.send({ k: 'shown', logged: true });
    stage([{ ...outing(app.S.boat, true), kind: 'race', title: app.w.C.title, code: 'RET', of: app.w.boats.length, setup: raceSetup(), ...hurtOf() }]);
    // (a season race left unfinished: RET in the series too, if it's saved)
    { const sr = app.seasonRaceOf(); app.pendingSeason = sr && pending ? { ...sr, at: pending[0].at } : null; }
  }
}
/** The sail just ended, waiting for you to say whether it goes in the logbook. */
let pending: LogEntry[] | null = null;
const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
function stage(entries: LogEntry[]): void { if (entries.length) pending = entries; }
/**
 * Leaving a race or a cruise: ask whether to keep it in her logbook (with her race record and crew history) or
 * discard it, then carry on.
 */
function settleLog(next: () => void): void {
  logOuting();
  if (!pending) { next(); return; }
  const p = pending, e = p.find(x => x.boatId === app.S.boat.id) ?? p[0];
  const mins = (s?: number) => s == null ? '' : `${Math.floor(s / 60)} min`;
  $('keepTitle').textContent = e.kind === 'race' ? 'Keep this race?' : 'Keep this cruise?';
  $('keepWhat').textContent = e.kind === 'race'
    ? `${e.title}: ${e.wreck ? `wrecked (${e.wreck})${e.towed ? ', towed in' : ''}` : e.code === 'RET' ? 'retired' : e.code === 'CXL' ? 'racing canceled for the wind' : e.code === 'unfinished' ? 'not finished' : e.code === 'DSQ' ? 'disqualified' : `${ordinal(e.place!)} of ${e.of}`}${e.elapsed ? `, ${mins(e.elapsed)}` : ''}. Saved, it goes in her race record and logbook.`
    : `${e.title}: ${(e.nm ?? 0).toFixed(1)} nm in ${mins(e.elapsed)}${e.arrived ? ', arrived' : ''}${e.wreck ? `, wrecked (${e.wreck})${e.towed ? ', towed in' : ''}` : e.damage ? `, ${e.damage} damage` : ''}. Saved, it goes in her logbook.`;
  $('keepAsk').hidden = false;
  const done = (keep: boolean) => {
    $('keepAsk').hidden = true; pending = null;
    if (keep) addLog(p);
    if (keep && app.pendingGhost) keepGhost(app.pendingGhost); app.pendingGhost = null;
    if (keep && app.pendingSeason) { const r = app.seasonResult(app.pendingSeason.at); if (r) keepSeasonRace(app.pendingSeason.series.id, app.pendingSeason.no, r); } app.pendingSeason = null;
    toast(keep ? 'Saved to her logbook.' : 'Discarded.', 2200);
    next();
  };
  $('bKeep').onclick = () => done(true); $('bDiscard').onclick = () => done(false);
}
onSaveTrouble(msg => toast(msg, 6000));

/** The race's scores (Low Point, with the Z flag's 20% added in points: rules/scoring.ts), by boat id. */
/** Protests against you you've answered after the race (retired, RET, or chose the hearing), for this race's World. */
const answered = new Map<string, 'retire' | 'hearing'>();
let answeredFor: unknown = null, hearingView: ReplayView | null = null;
/**
 * The results' Protests section (the owner's design, 13 Nov 2026): each protest you're a party to. One against you:
 * Retire (RET) or go to the hearing. Heard: the validity ticks (RRS 60.2), the facts found as tiles, and the decision.
 */
function protestSection(): void {
  const w = app.w;
  if (answeredFor !== w) { answered.clear(); answeredFor = w; }
  const el = $('resProtests'), u = w.user, nm = (id: number) => id === u.id ? 'You' : `${w.boats[id].name} <span style="color:var(--muted)">${w.boats[id].no.replace(/^US\s+/, 'USA ')}</span>`;
  const mine = heard().decisions.filter(d => d.protest.by === u.id || d.protest.vs === u.id);
  el.hidden = !mine.length; if (!mine.length) { el.innerHTML = ''; return; }
  const tick = (ok: boolean, what: string) => `<span class="${ok ? 'ok' : 'no'}">${ok ? '✔' : '✘'}</span> ${what}`;
  const OUT: Record<Decision['outcome'], string> = { invalid: 'Protest invalid: not hailed and flagged at the first reasonable opportunity (Rule 60.4)', dismissed: 'Dismissed: no rule broken', exonerated: 'No penalty: exonerated (Rule 43.1)', penaltyTaken: 'Penalty taken: no further penalty (Rule 60.5(c)(2))', notRacing: 'No penalty: not racing (Part 2 preamble)', DSQ: 'Disqualified (Rule 60.5(c))', pending: 'Still racing: her turns still to do', retired: 'Retired (RET): nothing to decide' };
  const clipOf = (t: number) => app.incidentClips.find(c => c.t != null && Math.abs(c.t - t) < 1.5);
  el.innerHTML = '<h3>Protests</h3>' + mine.map((d, i) => {
    const p = d.protest, key = `${p.vs}@${p.t}`, rule = d.rule && d.rule in RULES ? RULES[d.rule as keyof typeof RULES][0] : d.rule ? `Rule ${d.rule}` : 'no rule found';
    const head = `<div class="pHead"><span>${nm(p.by)} protest${p.by === u.id ? '' : 's'} ${p.vs === u.id ? 'you' : nm(p.vs)} · ${rule}</span></div>`;
    if (owesAnswer(d)) return head + `<div><button type="button" class="ghost" data-pr="retire" data-key="${key}">Retire (RET)</button> <button type="button" class="ghost" data-pr="hearing" data-key="${key}">Hearing</button></div>`;
    const turns = p.owed == null ? '–' : !p.owed ? 'Declined' : p.turnsT != null ? 'Taken' : 'Not taken';
    const tiles = [['Contact', p.kind === 'contact' ? 'Yes' : p.kind === 'swerve' ? 'Forced to avoid' : p.kind === 'hail' ? 'A hail' : '–'], ['Broke', p.fouler != null ? nm(p.fouler) : '–'], ['Turns', turns], ['Exonerated', p.exonerated ? 'Yes' : 'No']];
    return head + `<div>${tick(d.valid.hail, 'hailed')} &nbsp; ${tick(d.valid.flag, 'flag')} &nbsp; ${tick(true, 'in time')}${clipOf(p.t) ? ` &nbsp; <a href="#" data-pclip="${i}">▶ Replay</a>` : ''}</div>`
      + `<div class="pTiles">${tiles.map(([k, v]) => `<div class="pTile">${k}<b>${v}</b></div>`).join('')}</div>`
      + `<div class="pDec${d.outcome === 'DSQ' ? ' bad' : ''}">${d.outcome === 'DSQ' ? `${p.vs === u.id ? 'You' : w.boats[p.vs].name}: ` : ''}${OUT[d.outcome]}</div>`;
  }).join('');
  el.querySelectorAll<HTMLButtonElement>('[data-pr]').forEach(b => b.onclick = () => {
    const key = b.dataset.key!, how = b.dataset.pr as 'retire' | 'hearing'; answered.set(key, how);
    if (how === 'hearing') { showResults(); return; }
    // (retired once the worker has it: the results then show RET)
    app.send({ k: 'retire', why: ', answering a protest', afterFinish: true });
    const t0 = performance.now(), wait = () => { if (app.w.user.retired || performance.now() - t0 > 3000) showResults(); else requestAnimationFrame(wait); }; wait();
  });
  el.querySelectorAll<HTMLAnchorElement>('[data-pclip]').forEach(a => a.onclick = e => {
    e.preventDefault(); const c = clipOf(mine[Number(a.dataset.pclip)].protest.t);
    // (in its own small canvas in the section: the incident overlay's Continue would let the finished race run on)
    let cv = el.querySelector<HTMLCanvasElement>('canvas.pClip');
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'pClip'; a.closest('div')!.after(cv); }
    if (c) { hearingView?.stop(); hearingView = new ReplayView(cv); hearingView.play(w, c.clip); }
  });
}

/** A protest against you that would cost you (a DSQ, or not decided yet) that you haven't answered: Retire or Hearing. */
function owesAnswer(d: Decision): boolean {
  if (answeredFor !== app.w) { answered.clear(); answeredFor = app.w; }
  const p = d.protest;
  return p.vs === app.w.user.id && (d.outcome === 'DSQ' || d.outcome === 'pending') && !answered.has(`${p.vs}@${p.t}`);
}

/** The protest hearings, on the facts as they are now (rules/hearing.ts): the decisions and the boats disqualified
 * (not you, until you've chosen the hearing over retiring). */
function heard(): ReturnType<typeof hearings> {
  // (a boat that has finished is through with her turns: 44.2, before she finishes; so not 'pending' once across)
  const w = app.w, h = hearings(w.protests, id => { const b = w.boats[id]; return { id, racing: w.racing(b) && !b.finished, retired: !!b.retired }; });
  if (h.decisions.some(owesAnswer)) h.dsq.delete(w.user.id);
  return h;
}

function scores(): Map<number, ScoreOut> {
  // the boats still racing, in the order they're in now (most marks rounded, then nearest the next), to project them
  const C = app.w.C, toGo = (b: Boat) => { const m = app.w.nextMark(b); return dist(b, m ? m.p : C.center); };
  const out = app.w.boats.filter(b => !b.finished && !b.retired).sort((a, b) => b.leg - a.leg || toGo(a) - toGo(b));
  const dsq = heard().dsq;
  return new Map(raceScores(app.w.boats.map(b => ({ id: b.id, finishT: b.finished ? b.finishT : null, code: b.retired ? 'RET' : dsq.has(b.id) ? 'DSQ' : b.scoring ?? null, ahead: out.indexOf(b) }))).map(s => [s.id, s]));
}

function showResults(): void {
  app.send({ k: 'shown', finishShown: true }); app.resultsShown = true;
  // in order of points (RRS A4, 44.3(c)), then of time across the line for the boats still racing
  const sc = scores(), rows = scoreOrder([...sc.values()], id => app.w.boats[id].finished ? app.w.boats[id].finishT : null).map(s => app.w.boats[s.id]);
  if (!heard().decisions.some(owesAnswer)) logRace(rows, sc); // (your logbook entry once you've answered any protest against you)
  const mine = sc.get(app.w.user.id)!, place = mine.rank ?? rows.indexOf(app.w.user) + 1, tied = rows.filter(b => sc.get(b.id)!.rank === place && sc.get(b.id)!.points === mine.points).length > 1;
  const nth = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  // a Z-flag place waits on the boats still racing: any of them finishing on fewer points beats her (44.3(c))
  $('resTitle').textContent = mine.code === 'UFD' || mine.code === 'BFD' || mine.code === 'DSQ' ? 'You were disqualified' : mine.code === 'RET' ? 'You retired'
    : !mine.final ? `On points, you're likely ${nth(place)}: boats still racing can finish ahead of your ${ptsText(mine.points!)}`
    : place === 1 ? (tied ? 'You tied for first' : 'You won the race') : `You finished ${tied ? 'equal ' : ''}${nth(place)}`;
  const sr = app.w.startReport;
  $('resStart').textContent = sr ? `Your start: crossed ${sr.delay.toFixed(1)} s after the gun at ${sr.kt.toFixed(1)} kt, ${Math.round(sr.frac * 100)}% of the way from ${app.w.C.pinLabel} to ${app.w.C.committeeLabel}.` : 'No clean start recorded.';
  const code = (b: Boat) => { const s = sc.get(b.id)!; return b.scoring === 'ZFP' ? ` · ZFP: ${Number.isInteger(s.across!) ? nth(s.across!) : `tied ${nth(Math.floor(s.across!))}`} across the line, +${ptsText(s.penalty)} points (Rule 30.2, 44.3(c))${s.final ? '' : '; her place waits on the boats still racing'}` : b.scoring ? ` · ${b.scoring}: disqualified (${b.scoring === 'DSQ' ? 'turns not taken, Appendix UF3.4(a)(5)' : `Rule ${b.scoring === 'UFD' ? '30.3' : '30.4'}`})` : ''; };
  const rankOf = (b: Boat) => { const s = sc.get(b.id)!; return s.code === 'UFD' || s.code === 'BFD' || s.code === 'DSQ' ? 'DSQ' : s.code === 'RET' && b.finished ? 'RET' : s.rank == null ? '–' : `${s.final ? '' : '~'}${rows.filter(x => sc.get(x.id)!.rank === s.rank && sc.get(x.id)!.points === s.points).length > 1 ? '=' : ''}${s.rank}`; };
  $('resBody').innerHTML = rows.map(b => `<tr><td>${rankOf(b)}</td><td><span class="dot" style="background:${b.color}"></span>${b.isUser ? 'You' : b.name} <span style="color:var(--muted)">${b.no.replace(/^US\s+/, 'USA ')}</span></td><td>${b.finished ? fmtClock(b.finishT!).replace('+', '') : 'Still racing'}${code(b)}</td><td>${sc.get(b.id)!.points != null ? ptsText(sc.get(b.id)!.points!) : ''}</td></tr>`).join('');
  $('resFouls').textContent = `Fouls you committed: ${app.w.fouls}. Fouls against you: ${app.w.fouledBy}.`
    + (app.w.user.scoring === 'DSQ' ? ' You finished with your penalty turns not done: the umpire disqualified you (Appendix UF3.4(a)(5)).' : '');
  protestSection();
  { const rr = app.realResults(); $('resReal').innerHTML = rr; $('resReal').hidden = !rr; }
  { const sl = app.seasonLine(); $('resSeason').innerHTML = sl; $('resSeason').hidden = !sl; }
  const db = debriefHtml('Your race, debriefed');
  $('resDebrief').innerHTML = db; $('resDebrief').hidden = !db; $('resStart').hidden = !!db; // the debrief has the start in full
  mountDebriefTactics($('resDebrief'));
  $('bWatch').hidden = !app.w.log || app.w.track.length < 2;
  $('results').hidden = false;
  app.send({ k: 'pause', on: true });
}


return { ordinal, raceSetup, scores, settleLog, showResults, towed };
}
