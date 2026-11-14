/**
 * The setup and the start of a sail: a new World for the setup's choices (prepare, newGame, setupChanged), the setup screen (the course picker and its card, the tide, the crew, the choices), the conditions dialog, and beginning a race or a cruise.
 * (A part of src/app.ts, as it was there: it reaches the app's own state through `app`, app.ts's ctx.)
 */
import { PREP_MEANING } from '../sim/signals';
import { LESSONS, type LessonId } from '../sim/lessons';
import { lessonGridHtml } from '../ui/lessons';
import { describeSea } from '../environment/sea';
import { CURRENTS, warmBasins } from '../environment/current';
import { COURSES, courseFile } from '../courses/registry';
import { RC_COURSE } from '../courses/committee';
import { place } from '../sim/places';
import { setupKey } from '../replay/ghost';
import { harborOf, slipById, slipPlace } from '../geo/marina';
import { type BoatSpec } from '../boat/spec';
import { V } from '../core/math';
import { DEFAULT_SETTINGS, chooseWindKind, saveSettings, type Settings } from '../settings';
import { randomSeed } from '../core/rng';
import { CONDITION_KEYS, World, describeTide } from '../sim/world';
import { LocalHost, WorkerHost, type WorldArgs } from '../sim/host';
import { spawnSimWorker } from '../sim/spawn';
import { YOU, pullCrew, saveMembers } from '../club/members';
import { CurrentField, nextSaturday, sfClock } from '../environment/tide';
import { compassPoint, degAndPoint, turnWords } from '../core/compass';
import { WIND_KINDS, WIND_KIND_LABEL, windKindFreq, windTerrain, type WindKind } from '../environment/wind';
import { compass, sunPosition, sunTimes } from '../environment/sun';
import { $ } from '../ui/dom';
import { horn, logMessage, toast } from '../ui/feedback';
import { sideWord } from '../ui/hud';
import { passageNow, whyNot } from '../sim/navigator';
import type { AppCtx } from '../app';
import { burgeeCanvas } from '../render/burgees';
import { morph } from '../ui/morph';
import { CLUB_TILE, emptyTile, initials, splitNo, tile } from '../ui/tiles';
import { sailNo } from '../boat/spec';

export function mountSetup(app: AppCtx) {
/** The course file the prepared race was built from (the setup's course row reads its length). */
let courseFileNow: WorldArgs['file'] | null = null;
function newGame(seed = randomSeed()): void {
  if (app.condLive && app.w?.running) { saveSettings(app.S); void app.host.ask({ k: 'conditions', settings: app.S }).then(() => app.view.conditionsChanged(app.w)); return; } // (redrawn once the race has them: the committee boat to the new wind) // (the owner: at once, without a restart)
  // (a setup change still waiting on its debounce is overtaken: this race is built from the settings as they are now)
  clearTimeout(app.setupTimer); const fs = [...setupAfter]; setupAfter.clear();
  prepare(seed); show(); fs.forEach(f => f());
}

function prepare(seed = randomSeed()): void {
  app.incidentClips = []; // (a new race: its own rule incidents)
  app.pendingPenalty = null; // (an incident's penalty is for the race it happened in)
  // in the showroom (editing one of your boats, or her page in the Fleet): she's the boat shown, her flags flying
  const shown: BoatSpec | null = app.boatPanel?.open ? app.boatPanel.editing : app.fleet?.showing ?? null, showFlags = !!shown;
  const WS0 = shown && shown.id !== app.S.boatId ? (() => { const o = app.S.opponents.filter(x => x !== shown.id); return { ...app.S, boat: shown, opponents: o, fleet: o.length }; })() : app.S;
  // (an older race sailed again keeps the direction it was pinned to, for this race only: replayPin)
  const WS1 = app.replayPin != null ? { ...WS0, windDir: app.replayPin } : WS0;
  // (on show: the showroom's own time of day and conditions, if you've set them; your races' and cruises' are untouched)
  const WS = shown ? { ...WS1, ...(app.showCond ?? {}), ...(app.showMin != null ? { tideTime: app.hhmm(app.showMin + WS1.seq) } : {}) } : WS1;
  const rc = app.S.course === RC_COURSE ? app.committee(WS) : null;
  const courseSignal = rc ? { no: rc.est.no, why: rc.why } : undefined;
  // (the practice drills, alone, in the setup's day and conditions: the tack and gybe drill off the Cityfront; the
  // mark-rounding drill round the practice course's marks, so its file is forced to the practice course)
  const soloDrill = (app.S.mode === 'manoeuvres' || app.S.mode === 'roundings' || app.S.mode === 'lesson') && !shown;
  const WSd = soloDrill ? { ...WS, opponents: [], fleet: 0, traffic: 0 as const, sailFrom: 'cityfront', sailTo: '' } : WS;
  const drillFile = app.S.mode === 'roundings' ? (COURSES.find(c => !c.group) ?? COURSES[0]) : null;
  const args: WorldArgs = { file: drillFile ?? (rc ? rc.est.file : courseFile(app.S.course === RC_COURSE ? COURSES[0].id : app.S.course)), settings: WSd, seed,
    opts: app.S.mode === 'drill' ? { startAt: app.S.drillFrom ?? app.DRILL_FROM, solo: app.S.drillSolo ?? true, showFlags, courseSignal } : (app.S.mode === 'sail' || soloDrill) && !shown ? { freeSail: true } : { showFlags, courseSignal, ...(shown ? { startAt: app.S.seq * 60 } : {}) } };
  // the one World the page builds for this race (the setup's cards read it), handed to the host as its mirror
  courseFileNow = args.file;
  const facts = new World(args.file, args.settings, args.seed, args.opts);
  if (app.host) app.host.rebuild(args, facts);
  else {
    // the race in a worker of its own (sim/host.ts WorkerHost), the page drawing its mirror; in the page's own thread where
    // a worker can't start, or with ?inproc (the dev handles and the check scripts that change the World directly)
    const wk = app.SIM_INPROC ? null : spawnSimWorker();
    app.host = wk ? new WorkerHost(wk, args, app.SIM_GUARD, why => { document.documentElement.dataset.sim = 'local'; toast(`The race moved to the page's own thread (${why.split('\n')[0]}).`, 4000); }, facts)
      : new LocalHost(facts, app.SIM_GUARD);
  }
  app.w = app.host.view; app.shownDest = app.w.dest; app.speedSet = app.w.speed; app.drillShown = false; app.resultsShown = false;
  warmBasinsIdle(() => app.w);
  document.documentElement.dataset.sim = app.host.mode; // (where the race sails, for the checks: 'worker' or 'local')
  app.unshown = true; document.documentElement.dataset.prepared = String(++app.prepared);
}
/** The scene for the race prepare() built: the boats, marks and labels drawn, and the view live again. */
function show(): void {
  app.unshown = false; setStill(false);
  app.showTrimOwner(); app.showLash(); app.showCrewPlace();
  app.word('bCourse', app.w.freeSail ? 'Navigator' : 'Course'); app.keysHint(); app.insetViews();
  app.view.setWorld(app.w);
  // a ghost race: the run chosen in Run a past race, shown only while the race is that very race (its setup's key: the same
  // course, seed, start time and conditions); any other race has none
  app.activeGhost = app.ghostNext && app.S.mode === 'race' && setupKey(app.results.raceSetup()) === app.ghostNext.key ? app.ghostNext : null; app.view.setGhost(app.w, app.activeGhost?.pts ?? null);
  app.labels.build(app.w);
}
function setStill(on: boolean): void { app.still = on; document.body.classList.toggle('still', on); }
/** Leaving the setup without sailing (the start page): its race drawn, and live again. */
function wake(): void { if (app.unshown) show(); else setStill(false); }

const setupAfter = new Set<() => void>();
/**
 * A choice in the setup: its race built once the clicks stop (120 ms), then `after` (the cards that read it). Outside
 * the setup (the showroom, the pause menu's conditions) the change is drawn at once, as before.
 */
function setupChanged(after?: () => void, wait = 120): void {
  if (!app.still || app.condLive) { newGame(); after?.(); return; }
  if (after) setupAfter.add(after);
  clearTimeout(app.setupTimer);
  const go = () => { if (!app.still) return; prepare(); const fs = [...setupAfter]; setupAfter.clear(); fs.forEach(f => f()); };
  if (wait <= 0) go(); else app.setupTimer = window.setTimeout(go, wait);
}

/* ---------------- setup + flow ---------------- */
function buildSetupChoices(): void {
  // the course picker, grouped (Seaweed Soup starting west / east, practice), each with its marks and length
  const groups = new Map<string, typeof COURSES>();
  for (const c of COURSES) { const g = c.group ?? 'Practice'; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(c); }
  const shortMark = (k: string) => k === 'X' ? '' : k;
  const label = (c: typeof COURSES[number]) => {
    if (!c.group) return c.title;
    const route = c.legs.map(l => shortMark(l.mark)).filter(Boolean).join(' → ');
    return `${c.title.replace('Seaweed Soup · ', '')} · ${route}${c.distanceNm ? ` · ${c.distanceNm} nm` : ''}`;
  };
  const sel = $('courseSel') as HTMLSelectElement;
  groups.delete('Practice');
  sel.innerHTML = [...groups].map(([g, cs]) => `<optgroup label="${g}">${cs.map(c => `<option value="${c.id}">${label(c)}</option>`).join('')}</optgroup>`).join('');
  sel.value = app.S.course;
  sel.onchange = () => { app.S.course = lastPick = sel.value; saveSettings(app.S); setupChanged(() => { courseCard(); tideBox(); }); };
  $('condDlg').querySelector('[data-k="current"]')!.innerHTML = Object.values(CURRENTS).map(c => `<button type="button" data-v="${c.id}">${c.button}</button>`).join('');
}
function courseCard(): void {
  const C = app.w.C;
  const chips = ['<span class="m">Start</span>']
    .concat(C.marks.map(m => `<span class="m ${m.type === 'pass' ? 'x' : m.side}">${m.name.split(' ')[0]}${m.type === 'pass' ? '' : ' ' + sideWord(m.side)}</span>`))
    .concat(['<span class="m">Finish</span>']);
  const sig = app.w.courseSignal;
  $('courseCard').innerHTML = (sig ? `<div class="rcpick"><b>The committee will fly course ${sig.no}</b><small>${sig.why}</small></div>` : '')
    + `<div class="legs">${chips.join('<span class="arr">→</span>')}</div>`;
  { // the host club: its courses and its sailing instructions
    const host = hostOf(app.S.course), rc = app.S.course === RC_COURSE;
    document.querySelectorAll<HTMLButtonElement>('#hostSeg [data-host]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.host === host)));
    document.querySelectorAll<HTMLButtonElement>('#courseMode [data-cm]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.cm === 'rc') === rc)));
    $('courseMode').hidden = host === 'practice';
    $('judgingField').hidden = host === 'practice'; // (the practice area is always umpired)
    $('courseSel').hidden = host === 'practice' || rc;
    if (!rc && host !== 'practice') ($('courseSel') as HTMLSelectElement).value = app.S.course;
    const flag = app.S.prepFlag === 'black' ? 'black flag' : `${app.S.prepFlag ?? 'P'} flag`;
    const line = C.biasAdjustable ? ` · line ${app.S.bias ? (app.S.bias > 0 ? 'pin' : 'boat') + ' up ' + Math.abs(app.S.bias) + '°' : 'square'}` : '';
    $('siSum').textContent = `${host === 'practice' ? 'Practice' : 'Sailing instructions'}: ${app.S.seq}-min sequence · ${flag} · ${app.S.penaltyTurns === 1 ? 'one-turn' : 'two-turn'} penalty${app.S.judging === 'protests' && host !== 'practice' ? ' · protests' : ''}${line}`;
  }
  $('lengthField').hidden = app.S.mode === 'sail' || app.S.course !== RC_COURSE;
  $('biasField').hidden = !C.biasAdjustable;
  $('prepNote').textContent = PREP_MEANING[app.S.prepFlag ?? 'P'];
  $('fleetField').hidden = app.S.mode === 'sail';
  { // racing from her slip: sail out to the line from her marina
    const sl = slipById(app.S.boat.slip), btn = $<HTMLButtonElement>('raceFromSlip');
    $('raceFromField').hidden = app.S.mode === 'sail';
    btn.disabled = !sl; btn.textContent = sl ? `From her slip (${slipPlace(sl)})` : 'From her slip (she has none)';
    if (!sl && app.S.raceFrom === 'slip') app.S.raceFrom = 'water';
    app.S.raceFrom ??= 'water';
    // (racing only: cruising, she leaves her slip at the time you set, and there's no warning signal to be early for)
    $('raceFromNote').textContent = app.S.mode !== 'sail' && app.S.raceFrom === 'slip' && app.w.fromSlip && app.w.startAt > app.S.seq * 60
      ? `She starts in her slip in ${harborOf(sl!.marina)?.short ?? 'her marina'}, ${Math.round((app.w.startAt - app.S.seq * 60) / 60)} minutes before the warning signal: push off, sail out of the harbor and over to the line. (Speed up the clock if you like.)`
      : '';
  }
  { // her slip, if she has one (Marina)
    const slip = slipById(app.S.boat.slip);
    if (!slip && (app.S.sailFrom === 'slip' || app.S.sailTo === 'slip')) { if (app.S.sailFrom === 'slip') app.S.sailFrom = 'cityfront'; if (app.S.sailTo === 'slip') app.S.sailTo = ''; }
  }
  // racing: an outboard on the transom bracket goes below (the class rules don't allow racing with it mounted aft: NFIA
  // clarification, March 2006, under class rule 1.11); the bracket can stay
  if (app.S.mode !== 'sail' && app.S.boat.perf.outboard === 'bracket') {
    app.S.boat.perf.outboard = 'stowed'; saveSettings(app.S); if (app.still) prepare(); else newGame();
    toast('Her outboard\'s been taken off the bracket and stowed below for the race: the class rules don\'t allow racing with it mounted aft (NFIA, 2006, class rule 1.11). Put it back on the bracket in the Fleet for a cruise.', 7000);
  }
  const cruise = app.S.mode === 'sail';
  for (const id of ['hostField', 'courseField', 'fleetField']) $(id).hidden = cruise;
  $('whereField').hidden = !cruise;
  if (cruise) app.setupChart?.sync(); // (the chart shows where she'll really start and go: the Fleet's "Cruise her" sets her start)
  $('bGo').textContent = cruise ? 'Cast off' : 'Start the sequence';
  $('bPreview').textContent = cruise ? 'Passage plan' : 'Course and strategist';
  $('setupTitle').textContent = cruise ? 'Cruise' : 'Create a race';
  $('setupBack').textContent = app.nav.backLabel() || (cruise ? '‹ Start page' : '‹ Race');
  $('whenLab').textContent = cruise ? 'When' : 'Start time'; $('timeLab').textContent = cruise ? 'Leave at' : 'Start signal';
  { const c = app.S.crew ?? DEFAULT_SETTINGS.crew, kg = c.helm.w + c.people.slice(0, c.n).reduce((a, p) => a + p.w, 0);
    $('crewSum').textContent = `${c.n ? `You + ${c.n}` : 'Single-handed'}, ${Math.round(kg / 0.4536)} lb aboard`; }
  app.adjustUi();
  setupHeads();
}
/* Real tide: race day, start time, and a graph of the current at the start line through the day. */
function tideBox(): void {
  $('windDaySeg').hidden = !app.w.seaBreeze || app.w.realWind;
  { // where the day's weather comes from, what the records say for the month, and what today is
    const mo = Number(app.w.raceDate.slice(5, 7)) - 1, f = windKindFreq(mo), month = new Date(app.w.raceDate + 'T12:00').toLocaleDateString('en-US', { month: 'long' });
    const odds = WIND_KINDS.filter(k => f[k] >= 0.01).map(k => `${WIND_KIND_LABEL[k].toLowerCase()} ${Math.round(f[k] * 100)}%`).join(', ');
    const wx = app.w.weather, day = new Date(app.w.raceDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const span = (() => { const ks: number[] = [], ds: number[] = []; for (let m = 0; m <= 240; m += 30) { const b = wx.at(app.w.gunUtc - 60 + m); ks.push(b.kt); ds.push(b.from); } return `${Math.round(Math.min(...ks))}–${Math.round(Math.max(...ks))} kt`; })();
    const src = wx.source === 'observed' ? `What happened on ${day}: ${WIND_KIND_LABEL[wx.kind].toLowerCase()}, ${span} around the race (the wind observed every 6 minutes at Fort Point, its real shifts and gusts)${wx.realSwell ? ', and the swell observed at the Bar buoy' : ''}.`
      : wx.source === 'forecast' ? `The National Weather Service forecast for ${day} (issued ${new Date(wx.issued!).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: '2-digit' })}): ${WIND_KIND_LABEL[wx.kind].toLowerCase()}, ${span} around the race${wx.realSwell ? ', and its swell forecast outside the Gate' : ''}. Hour by hour; the shifts and puffs within the hour are the sim's.`
      : wx.source === 'records' ? `No observations or forecast for ${day} yet: a ${WIND_KIND_LABEL[wx.kind].toLowerCase()} day, drawn from the ${month} records.`
      : `You chose a ${WIND_KIND_LABEL[wx.kind].toLowerCase()} day${f[app.w.windKind] < 0.02 ? ` (it almost never blows in ${month}; you get the westerly)` : ''}, from the ${month} records.`;
    $('windKindNote').textContent = `${src} Across the course: ${wx.fieldSource}${app.S.aids ? ' (shaded on the map)' : ''}. ${month} race days at Fort Point, 2021–25: ${odds}. ${app.KIND_NOTE[app.w.windKind]}`.replace(/around the race/g, app.S.mode === 'sail' ? 'through the afternoon' : 'around the race');
    const issued = wx.issued ? new Date(wx.issued).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
    condSource = !app.w.seaBreeze ? 'Wind: as you set it' : wx.source === 'observed' ? 'Wind: observed at Fort Point' : wx.source === 'forecast' ? `Wind: NWS forecast, issued ${issued}`
      : wx.source === 'records' ? `Wind: no forecast yet; a ${WIND_KIND_LABEL[wx.kind].toLowerCase()} day from the ${month} records` : `Wind: a ${WIND_KIND_LABEL[wx.kind].toLowerCase()} day you chose, from the ${month} records`;
  }

  $('swellDaySeg').hidden = app.w.sea.flat || app.w.weather.realSwell;
  const d = $<HTMLInputElement>('tideDate'), tm = $<HTMLInputElement>('tideTime');
  d.value = app.w.raceDate; tm.value = app.S.tideTime || '12:00';
  drawTideGraph();
}
/** The day for the conditions strip: wind and current as arrows, the sea, the sun (or when she'd arrive). */
type Strip = { windKt?: number; windFrom?: number; windAll?: boolean; curKt?: number; curSet?: number; curKind?: string; sea?: string; seaSub?: string; sunset?: string; arrive?: string };
/** Where the day's wind comes from, in one line for the conditions card (tideBox). */
let condSource = '';
/** Current (filled: flood up, ebb down) and the westerly (line, right scale) at the start line through the day; the conditions card's rows. */
function drawTideGraph(): void {
  const cv = $<HTMLCanvasElement>('tideGraph'), dpr = devicePixelRatio || 1, W = cv.clientWidth || 360, H = cv.clientHeight || 120;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const p = app.w.C.center, from = app.w.gunUtc - 3 * 60, to = app.w.gunUtc + 4 * 60, n = 84;
  const top = 16, bot = H - 18, mid = (top + bot) / 2, x = (i: number) => 8 + (W - 16) * i / n;
  const tx = (m: number) => 8 + (W - 16) * (m - from) / (to - from);
  const cruise = app.S.mode === 'sail';
  // race window: the gun to about 75 minutes later
  if (!cruise) { ctx.fillStyle = 'rgba(255,182,39,.10)'; ctx.fillRect(tx(app.w.gunUtc), top - 6, tx(app.w.gunUtc + 75) - tx(app.w.gunUtc), bot - top + 12); }
  const rows: [string, string][] = [];
  const strip: Strip = {};
  if (app.w.tide) {
    // signed current at the line: + flood (east, into the Bay), − ebb
    const f = new CurrentField(app.w.tide.stations), fl = V(f.stations.find(s => s.id === 'SFB1204')?.flood ?? 88);
    const pts: number[] = [];
    for (let i = 0; i <= n; i++) { f.setTime(from + (to - from) * i / n); const c = f.atShore(p); pts.push((c.x * fl.x + c.y * fl.y) / 0.5144); }
    const max = Math.max(1, ...pts.map(Math.abs)), y = (v: number) => mid - v / max * (bot - top) / 2;
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(8, mid); ctx.lineTo(W - 8, mid); ctx.stroke();
    for (const [sign, col] of [[1, 'rgba(111,168,255,.40)'], [-1, 'rgba(255,140,90,.40)']] as const) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x(0), mid);
      pts.forEach((v, i) => ctx.lineTo(x(i), sign * v > 0 ? y(v) : mid)); ctx.lineTo(x(n), mid); ctx.fill();
    }
    ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = '#9cc3ff'; ctx.fillText('FLOOD ↑', 10, top + 2);
    ctx.fillStyle = '#ffb08a'; ctx.fillText('EBB ↓', 10, bot);
    f.setTime(app.w.gunUtc);
    { const c = f.atShore(p), along = c.x * fl.x + c.y * fl.y; strip.curKt = Math.hypot(c.x, c.y) / 0.5144; strip.curSet = (Math.atan2(c.x, c.y) * 180 / Math.PI + 360) % 360; strip.curKind = strip.curKt < 0.1 ? 'slack' : along > 0 ? 'flood' : 'ebb'; }
    rows.push(['Current', `${describeTide(f, p, app.w.gunUtc).label}${cruise ? '' : ' at the line'}`]);
  }
  if (app.w.seaBreeze) {
    // the westerly in the open water near the line, kt, on its own scale (right)
    const kts: number[] = [];
    for (let i = 0; i <= n; i++) { const b = app.w.weather.at(from + (to - from) * i / n); kts.push(b.kt * windTerrain(p, b.from)); }
    const kmax = Math.max(10, Math.ceil(Math.max(...kts) / 5) * 5), yk = (v: number) => bot - v / kmax * (bot - top);
    ctx.strokeStyle = '#7fe0a8'; ctx.lineWidth = 2; ctx.beginPath(); kts.forEach((v, i) => (i ? ctx.lineTo(x(i), yk(v)) : ctx.moveTo(x(i), yk(v)))); ctx.stroke();
    ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = '#7fe0a8'; ctx.textAlign = 'right';
    ctx.fillText(`WIND · top ${kmax} kt`, W - 10, top + 2); ctx.fillText('0', W - 10, bot);
    const b = app.w.weather.at(app.w.gunUtc), b2 = app.w.weather.at(app.w.gunUtc + 90), k = windTerrain(p, b.from);
    strip.windKt = Math.round(b.kt * k); strip.windFrom = app.S.windDir ?? b.from; strip.windAll = app.w.windKind === 'light' && app.S.windDir == null;
    const trend = b2.kt > b.kt + 0.6 ? `building to ${Math.round(b2.kt * k)} kt` : b2.kt < b.kt - 0.6 ? `easing to ${Math.round(b2.kt * k)} kt` : 'steady';
    rows.unshift(['Wind', `${WIND_KIND_LABEL[app.w.windKind]} ${Math.round(b.kt * k)} kt from ${app.S.windDir != null ? `${degAndPoint(app.S.windDir)} (an older setting)` : app.w.windKind === 'light' ? 'all over' : degAndPoint(b.from) + (app.S.windTurn ? ` (${turnWords(app.S.windTurn)} from the usual ${compassPoint(b.from - app.S.windTurn)})` : '')}, ${trend} over 90 min${app.w.windKind === 'west' ? ' (more in the slot)' : ''}`]);
  } else { strip.windKt = Math.round(app.w.wind.kt); strip.windFrom = app.w.wind.from; rows.unshift(['Wind', `${Math.round(app.w.wind.kt)} kt from ${degAndPoint(app.w.wind.from)}, as you set it`]); }
  if (!app.w.tide) rows.push(['Current', CURRENTS[app.S.current]?.label ?? app.S.current]);
  if (app.w.sea.flat) { strip.sea = 'Flat'; strip.seaSub = 'sea'; } else if (app.w.sea.swell) { strip.sea = `${Math.round(app.w.sea.swell.hs / 0.3048)} ft`; strip.seaSub = `${Math.round(app.w.sea.swell.tp)} s swell`; }
  rows.push(['Sea', app.w.sea.flat ? 'Flat' : `${app.w.sea.swell ? `${Math.round(app.w.sea.swell.hs / 0.3048)} ft, ${Math.round(app.w.sea.swell.tp)} s swell outside the Gate${app.w.sea.swell.total ? ` (the buoy reads ${Math.round(app.w.sea.swell.total / 0.3048)} ft with the ocean's own wind waves, which the sea here makes for itself)` : ''}` : 'No swell'}${(app.S.chop ?? 1) !== 1 ? `, chop × ${(app.S.chop ?? 1).toFixed(1)}` : ''}${app.S.rain ? `, ${app.S.rain === 2 ? 'heavy' : 'light'} rain` : ''}${app.S.fog && app.S.fog !== 'real' ? `, ${['no', 'patchy', 'thick'][app.S.fog]} fog` : ''}`]);
  { // the sun: when it's up, and where it is at the gun
    const st = sunTimes(app.w.gunUtc * 60000), sp = sunPosition(app.w.gunUtc * 60000);
    ctx.fillStyle = 'rgba(8,14,30,.35)';
    if (Number.isFinite(st.set)) { const xs = tx(st.set / 60000); if (xs < W - 8) ctx.fillRect(Math.max(8, xs), top - 6, W - 8 - Math.max(8, xs), bot - top + 12); }
    if (Number.isFinite(st.rise)) { const xr = tx(st.rise / 60000); if (xr > 8) ctx.fillRect(8, top - 6, Math.min(W - 16, xr - 8), bot - top + 12); }
    strip.sunset = sfClock(st.set / 60000);
    rows.push(['Sun', sp.el > 0 ? `${Math.round(sp.el)}° up in the ${compass(sp.az)}, sets ${sfClock(st.set / 60000)}` : `After sunset (${sfClock(st.set / 60000)}): sailing in the dusk`]);
  }
  ctx.strokeStyle = '#ffb627'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx(app.w.gunUtc), top - 6); ctx.lineTo(tx(app.w.gunUtc), bot + 6); ctx.stroke();
  ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(232,238,246,.8)'; ctx.textAlign = 'center';
  for (let m = Math.ceil(from / 60) * 60; m <= to; m += 60) if (tx(m) > 20 && tx(m) < W - 20) ctx.fillText(sfClock(m).slice(0, 2) + ':00', tx(m), H - 4);
  const pn = cruise && app.w.dest ? passageNow(app.w) : null, near = pn?.eta != null && tx(pn.eta) - tx(app.w.gunUtc) < 44;
  ctx.fillStyle = '#ffb627'; if (near) ctx.textAlign = 'right'; ctx.fillText(cruise ? 'leave' : 'gun', tx(app.w.gunUtc) - (near ? 4 : 0), 10); ctx.textAlign = 'center';
  // cruising somewhere: when she'd get there leaving then (sim/navigator.ts passageNow: the course she'd sail, tacks and
  // all, in the forecast wind and NOAA's current), as a second bar; past the graph's end, an arrow at its edge
  if (pn?.eta != null) {
    const xa = tx(pn.eta), inside = xa <= W - 8, xd = Math.min(xa, W - 10);
    ctx.strokeStyle = '#3fd197'; ctx.lineWidth = 2; ctx.setLineDash(inside ? [] : [3, 3]); ctx.beginPath(); ctx.moveTo(xd, top - 6); ctx.lineTo(xd, bot + 6); ctx.stroke(); ctx.setLineDash([]);
    // (close to the leave bar, the label goes to the right of its bar, clear of 'leave')
    const close = inside && near;
    ctx.fillStyle = '#3fd197'; ctx.textAlign = !inside ? 'right' : close ? 'left' : 'center';
    ctx.fillText(inside ? 'arrive' : `arrive ${sfClock(pn.eta)} →`, !inside ? W - 12 : close ? xd + 4 : xd, 10);
  }
  const day = new Date(app.w.raceDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (pn) rows.unshift(['Arrive', pn.eta != null ? `about ${sfClock(pn.eta)}: ${(pn.sailedM / 1852).toFixed(1)} nm over the ground in ${Math.floor(pn.minutes / 60) ? `${Math.floor(pn.minutes / 60)} h ` : ''}${Math.round(pn.minutes % 60)} min${pn.tacks.length ? `, ${pn.tacks.length} tack${pn.tacks.length > 1 ? 's' : ''}` : ''}${pn.gybes.length ? `, ${pn.gybes.length} jibe${pn.gybes.length > 1 ? 's' : ''}` : ''}` : `leaving then she can't get there: ${whyNot(pn.why)}`]);
  if (pn?.eta != null) strip.arrive = sfClock(pn.eta);
  condStrip(strip, rows); sunsetNow = strip.sunset ?? '';
  $('condSum').innerHTML = `<dt>When</dt><dd>${day}, ${cruise ? 'leaving' : 'gun'} at ${sfClock(app.w.gunUtc)}</dd>` + rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('tideNote').textContent = `${condSource}${app.w.tide ? ' · current: NOAA predictions' : ''}. Graph: flood up, ebb down, the wind as a line${cruise ? '' : ', about a race shaded'}, dark after sunset.`;
}
$<HTMLInputElement>('tideDate').addEventListener('change', e => { app.S.tideDate = (e.target as HTMLInputElement).value || nextSaturday(); saveSettings(app.S); setupChanged(tideBox); });
$<HTMLInputElement>('tideTime').addEventListener('change', e => { app.S.tideTime = (e.target as HTMLInputElement).value || '12:00'; saveSettings(app.S); setupChanged(tideBox); });

function paintSeg(): void {
  document.querySelectorAll<HTMLElement>('.seg[data-k]').forEach(seg => {
    const k = seg.dataset.k as keyof Settings;
    const cur = String(app.S[k]);
    seg.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(cur === b.dataset.v)));
  });  document.querySelectorAll<HTMLInputElement>('input[data-t]').forEach(c => { c.checked = (app.S[c.dataset.t as 'aids' | 'windDial' | 'camRide'] ?? 0) === 1; });
}
// the on-screen training aids: a switch each (on = shown)
document.querySelectorAll<HTMLInputElement>('input[data-t]').forEach(c => c.addEventListener('change', () => {
  const k = c.dataset.t as 'aids' | 'windDial' | 'camRide'; app.S[k] = c.checked ? 1 : 0; (app.w.settings as Settings)[k] = app.S[k]; saveSettings(app.S); paintSeg();
}));
document.querySelectorAll<HTMLElement>('.seg[data-k]').forEach(seg => seg.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest('button'); if (!b) return;
  const k = seg.dataset.k as keyof Settings, v = b.dataset.v!;
  if (k === 'aids' || k === 'windDial') { app.S[k] = Number(v) as 0 | 1; (app.w.settings as Settings)[k] = app.S[k]; saveSettings(app.S); paintSeg(); return; }
  if (k === 'windKind') { chooseWindKind(app.S, v as WindKind); paintSeg(); setupChanged(() => { courseCard(); tideBox(); }); return; }
  (app.S as unknown as Record<string, string | number>)[k] = (k === 'current' || k === 'course' || k === 'mode' || k === 'sea' || k === 'prepFlag' || k === 'judging' || k === 'raceLength' || k === 'raceFrom' || (k === 'fog' && v === 'real')) ? v : Number(v);
  paintSeg(); setupChanged(() => { courseCard(); tideBox(); });
}));
/**
 * Your crew in the race setup (the Yacht Club, phase 3; the owner: the race setup "isn't where crew are configured",
 * but you may swap people in and out there): you at the helm, then a pick for each seat from the club's members (the
 * middle crew: the main; the forward hand: the jib, the cabin top, the pole), the seats swapped, and the members
 * themselves set up in the Yacht Club. There's no crew count (the owner): both seats left at None is single-handed, for
 * practice or a race, and a seat left empty moves the forward hand up to the middle (one crew does both jobs).
 */
function crewRows(): void {
  const rows = $('crewRows'), boat = app.S.boats.find(b => b.id === app.S.boatId) ?? app.S.boat, seats = boat.crewIds ?? [];
  // (anyone who crews; someone in the other seat can be brought across: the two swap)
  const crewers = app.MEMBERS.filter(m => m.id !== YOU && m.roles.includes('crew'));
  const you = app.MEMBERS.find(m => m.id === YOU);
  const seatTiles = (i: number) => crewers.map(m => tile(initials(m.name), m.name, CLUB_TILE, { round: true, on: seats[i] === m.id, dim: seats[i] !== m.id && seats.includes(m.id), data: { seat: String(i), id: m.id }, title: seats[i] === m.id ? `${m.name}, ${i ? 'forward: jib and pole' : 'middle: the main'}` : seats.includes(m.id) ? `${m.name} (in the other seat: tap to swap)` : m.name })).join('')
    + emptyTile('Nobody', false, { round: true, on: !seats[i], data: { seat: String(i), id: '' }, title: 'Nobody in this seat' });
  morph(rows, `<div class="t-pickrow"><span class="t-lab">Helm</span><span class="t-group">${tile(initials(you?.name ?? 'You'), you?.name ?? 'You', '#ffb627', { round: true, on: true })}</span></div>
    <div class="t-pickrow"><span class="t-lab">Main</span><span class="t-group">${seatTiles(0)}</span></div>
    <div class="t-pickrow"><span class="t-lab">Jib · pole</span><span class="t-group">${seatTiles(1)}</span></div>
    <div class="t-pickrow"><span></span><span class="t-links">${seats.length === 2 ? '<button type="button" class="ghost sm" data-crew="swap" title="Swap the middle crew and the forward hand">Seats ⇅</button>' : ''}<button type="button" class="linkbtn" data-crew="club">Edit in the Yacht Club</button></span></div>`);
  setupHeads();
}
// (one listener on the crew rows, which are redrawn in place: a seat's tile, the swap, the Yacht Club)
$('crewRows').addEventListener('click', e => {
  const t = e.target as HTMLElement, boat = app.S.boats.find(b => b.id === app.S.boatId) ?? app.S.boat;
  const changed = () => { pullCrew(app.S, app.MEMBERS); saveMembers(app.MEMBERS); saveSettings(app.S); crewRows(); setupChanged(courseCard); };
  if (t.closest('[data-crew="club"]')) { app.nav.go({ k: 'club', tab: 'members' }); return; }
  if (t.closest('[data-crew="swap"]')) { const ids = boat.crewIds ?? []; if (ids.length === 2) { boat.crewIds = [ids[1], ids[0]]; changed(); } return; }
  const b = t.closest<HTMLElement>('[data-seat]'); if (!b) return;
  const i = Number(b.dataset.seat), id = b.dataset.id ?? '', ids = [...(boat.crewIds ?? [])];
  if (id) { const j = ids.indexOf(id); if (j >= 0 && j !== i) ids[j] = ids[i]; ids[i] = id; } else ids.splice(i, 1);
  boat.crewIds = ids.filter(Boolean).slice(0, 2); changed();
});
/*
 * The setup as four rows (the owner OK'd design/setup-tight, 13 Nov 2026): each a line of tiles and words, its controls
 * opening in place under Change. The controls are the same as before; only their summaries are new.
 */
let rowOpen: string | null = null, headsQueued = false, sunsetNow = '';
const burgeeUrls = new Map<string, string>();
function setupHeads(): void { if (headsQueued) return; headsQueued = true; requestAnimationFrame(() => { headsQueued = false; drawHeads(); }); }
function drawHeads(): void {
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const S = app.S, w = app.w, cruise = S.mode === 'sail', set = (row: string, lead: string, main: string) => {
    const r = document.getElementById('row-' + row); if (!r) return;
    morph(r.querySelector('.srow-lead')!, lead); morph(r.querySelector('.srow-main')!, main);
  };
  // the course: the host's burgee, the course from above, its number and length; the start's rules in a line
  const host = hostOf(S.course), practice = host === 'practice';
  let burgee = burgeeUrls.get(host);
  if (burgee == null && !practice) { try { burgee = burgeeCanvas(host)?.toDataURL() ?? ''; } catch { burgee = ''; } burgeeUrls.set(host, burgee); }
  const C = w.C, nm = courseFileNow?.distanceNm;
  const title = C.title.replace(/^Seaweed Soup · /, '') + (S.course === RC_COURSE && !practice ? ' (the committee\'s choice)' : '');
  set('course', practice ? '<span class="t-lab">Practice</span>' : burgee ? `<img class="t-burgee" src="${burgee}" alt="Golden Gate Yacht Club">` : '',
    `${courseThumb(92, 52)}<span class="t-text"><span class="t-h">${esc(title)}${nm ? ` · ${nm} nm` : ''}</span><span class="t-s">${esc($('siSum').textContent!.replace(/^(Sailing instructions|Practice): /, ''))}</span></span>`);
  // the fleet: a tile each, and + to add one
  const fl = app.fleetChosen;
  set('fleet', '<span class="t-lab">Racing</span>', fl.length ? `<span class="t-group">${fl.slice(0, 8).map(b => { const [c, n] = splitNo(b.no); return tile(n, b.name, b.hull, { country: c, ring: b.tag }); }).join('')}${fl.length > 8 ? `<span class="t-s">+${fl.length - 8}</span>` : ''}${emptyTile('Add', true)}</span>`
    : `<span class="t-text"><span class="t-h">Nobody: a solo race</span><span class="t-s">Add the club's boats under Change</span></span>`);
  // her and her crew: her tile, then the helm and the two seats; what they weigh, and where she starts
  const boat = S.boats.find(b => b.id === S.boatId) ?? S.boat, [bc, bn] = splitNo(sailNo(boat)), seats = boat.crewIds ?? [];
  const name = (id?: string) => app.MEMBERS.find(m => m.id === id)?.name ?? '';
  const you = app.MEMBERS.find(m => m.id === YOU)?.name ?? 'You';
  const seat = (i: number, label: string) => seats[i] ? tile(initials(name(seats[i])), name(seats[i]), CLUB_TILE, { round: true }) : emptyTile(label, false, { round: true });
  const kg = ($('crewSum').textContent!.match(/([\d,]+)\s*lb/) || [])[1];
  set('boat', tile(bn, boat.name || 'Unnamed', boat.hull.upper, { country: bc, on: true }),
    `<span class="t-group">${tile(initials(you), 'Helm', '#ffb627', { round: true })}${seat(0, 'Main')}${seat(1, 'Jib')}</span><span class="t-text">${kg ? `<span class="t-s">${kg} lb aboard</span>` : ''}${cruise || !$('drillView').hidden ? '' : `<span class="t-s">${S.raceFrom === 'slip' ? 'From her slip' : 'Starts at the line'}</span>`}</span>`);
  // when: the day, and the gun (or when she leaves)
  const day = new Date(w.raceDate + 'T12:00');
  set('when', `<span class="t-date"><b>${day.getDate()}</b><small>${day.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</small></span>`,
    `<span class="t-text"><span class="t-h">${day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${cruise ? 'leaving at' : 'gun at'} ${esc(S.tideTime || '12:00')}</span>${sunsetNow ? `<span class="t-s">Sunset ${esc(sunsetNow)}</span>` : ''}</span>`);
  // which rows show (a row whose fields are all hidden: not this mode's), and which is open
  for (const r of document.querySelectorAll<HTMLElement>('.srow')) {
    const was = r.hidden;
    r.hidden = ![...r.querySelector('.srow-body')!.children].some(c => !(c as HTMLElement).hidden);
    // (the cruise's chart, drawn while its row was still hidden, had no size: drawn again now it shows)
    if (was && !r.hidden && r.dataset.row === 'where') app.setupChart?.sync(true);
    const open = !r.hidden && (r.classList.contains('always') || r.dataset.row === rowOpen); // (a hidden row isn't open)
    r.classList.toggle('open', open);
    r.querySelector('.srow-head')!.setAttribute('aria-expanded', String(open));
    r.querySelector('.srow-go')!.textContent = open ? 'Done ▴' : 'Change ▾';
  }
}
// a row's line opens it (and closes the one open); Done folds it
document.addEventListener('click', e => {
  const head = (e.target as HTMLElement).closest<HTMLElement>('.srow-head'); if (!head) return;
  const row = head.closest<HTMLElement>('.srow')!.dataset.row!;
  rowOpen = rowOpen === row ? null : row; drawHeads();
  // the date's calendar opens downward: the When row, last on the screen, is brought up so it has room (the owner: "date
  // picker gets cropped at bottom of screen"); the panel gets room below it to scroll into (styles: .whenroom)
  if (rowOpen === 'when') { const r = $('row-when'); r.closest('.panel')?.classList.add('whenroom'); r.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  else document.querySelectorAll('.panel.whenroom').forEach(p => p.classList.remove('whenroom'));
});
document.addEventListener('keydown', e => {
  const k = e as KeyboardEvent, head = (k.target as HTMLElement).closest<HTMLElement>('.srow-head');
  if (head && (k.key === 'Enter' || k.key === ' ')) { k.preventDefault(); head.click(); }
});
/** The course from above, north up: the legs mark to mark, the line in amber, the marks. */
function courseThumb(W: number, H: number): string {
  const C = app.w.C, line = C.committee && C.pin ? [C.committee, C.pin] : [], pts = [...line, ...C.marks.map(m => m.p)], pad = 8;
  if (!pts.length) return '';
  const xs = pts.map(q => q.x), ys = pts.map(q => q.y), minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const k = Math.min((W - 2 * pad) / Math.max(1, maxX - minX), (H - 2 * pad) / Math.max(1, maxY - minY)), ox = (W - (maxX - minX) * k) / 2, oy = (H - (maxY - minY) * k) / 2;
  const X = (q: { x: number }) => (ox + (q.x - minX) * k).toFixed(1), Y = (q: { y: number }) => (H - oy - (q.y - minY) * k).toFixed(1);
  const mid = line.length ? { x: (line[0].x + line[1].x) / 2, y: (line[0].y + line[1].y) / 2 } : C.marks[0].p;
  const path = [mid, ...C.marks.map(m => m.p), mid].map((q, i) => `${i ? 'L' : 'M'}${X(q)} ${Y(q)}`).join(' ');
  return `<svg class="t-course" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><rect width="${W}" height="${H}" rx="8" fill="#123b52"/><path d="${path}" fill="none" stroke="#9fd3ea" stroke-width="1.4" stroke-dasharray="3 3"/>${line.length ? `<line x1="${X(line[0])}" y1="${Y(line[0])}" x2="${X(line[1])}" y2="${Y(line[1])}" stroke="#ffb627" stroke-width="2.2"/>` : ''}${C.marks.map(m => `<circle cx="${X(m.p)}" cy="${Y(m.p)}" r="3" fill="#ffb627"/>`).join('')}</svg>`;
}
/** The day as one strip of pictures: the wind and the current as arrows on a ring, the sea, the sun (and when she'd arrive). */
function condStrip(st: Strip, rows: [string, string][]): void {
  const say = (k: string) => (rows.find(r => r[0] === k)?.[1] ?? '').replace(/<[^>]*>/g, '').replace(/"/g, '&quot;');
  const arrow = (to: number | undefined, col: string) => to == null ? '' : `<svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true"><circle r="11" fill="none" stroke="#2e4a5e"/><g transform="rotate(${Math.round(to)})"><line y1="7" y2="-5" stroke="${col}" stroke-width="2.4" stroke-linecap="round"/><path d="M0 -9 L4 -3 L-4 -3 Z" fill="${col}"/></g></svg>`;
  const cell = (title: string, pic: string, big: string, small: string) => `<div title="${title}">${pic}<span><b>${big}</b><small>${small}</small></span></div>`;
  morph($('condStrip'), [
    st.windKt != null ? cell(say('Wind'), arrow(st.windAll ? undefined : ((st.windFrom ?? 0) + 180) % 360, '#7ee0a5'), `${st.windKt} kt`, st.windAll ? 'all over' : `from ${compassPoint(st.windFrom ?? 0)}`) : '',
    st.curKt != null ? cell(say('Current'), arrow(st.curKind === 'slack' ? undefined : st.curSet, '#6fb7ff'), `${st.curKt.toFixed(1)} kt`, st.curKind ?? '') : cell(say('Current'), '', 'Current', say('Current')),
    st.sea ? cell(say('Sea'), '<svg viewBox="0 0 24 16" width="22" height="16" aria-hidden="true"><path d="M1 10 q3 -5 6 0 t6 0 t6 0" fill="none" stroke="#9fd3ea" stroke-width="2"/></svg>', st.sea, st.seaSub ?? '') : '',
    st.arrive ? cell(say('Arrive'), '', st.arrive, 'arrive') : st.sunset ? cell(say('Sun'), `<svg viewBox="-12 -12 24 24" width="20" height="20" aria-hidden="true"><circle r="5" fill="#ffcf5a"/>${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line y1="-8" y2="-11" stroke="#ffcf5a" stroke-width="1.6" transform="rotate(${a})"/>`).join('')}</svg>`, st.sunset, 'sunset') : ''
  ].join(''));
  setupHeads();
}
function openSetup(view: 'setup' | 'drill' = 'setup'): void { app.results.settleLog(() => openSetupNow(view)); }
/** Back to where the sail was set up: the setup, or the Drill page (for a drill). */
function toSetup(): void { if (app.nav.here.k === 'drill') app.showPlace(app.nav.here); else openSetup(); }
/*
 * The Drill page shows the setup's own boat-and-crew and when rows, its conditions strip, graph and Change the conditions:
 * the same elements, moved there while it's open and back when the setup opens, so there's one set of each.
 */
const DOCKED = ['row-boat', 'row-when', 'condHead', 'condStrip', 'tideGraph', 'condMore', 'bCond'];
const dockHome = new Map<string, Comment>();
function dockSetup(view: 'setup' | 'drill'): void {
  for (const id of DOCKED) {
    const el = $(id);
    if (!dockHome.has(id)) { const c = document.createComment(id); el.before(c); dockHome.set(id, c); }
    if (view === 'drill') $('drillSide').appendChild(el); else dockHome.get(id)!.after(el);
  }
}
// the start drill's minutes to the gun, and alone or with the fleet (the debrief's own choices set these too)
function paintDrillPage(): void {
  for (const b of $('drillFromSeg').querySelectorAll<HTMLElement>('[data-df]')) b.setAttribute('aria-pressed', String(+b.dataset.df! === (app.S.drillFrom ?? app.DRILL_FROM)));
  for (const b of $('drillSoloSeg').querySelectorAll<HTMLElement>('[data-ds]')) b.setAttribute('aria-pressed', String((b.dataset.ds === '1') === (app.S.drillSolo ?? true)));
}
$('drillFromSeg').addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-df]'); if (!b) return; app.S.drillFrom = +b.dataset.df!; saveSettings(app.S); paintDrillPage(); });
$('drillSoloSeg').addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ds]'); if (!b) return; app.S.drillSolo = b.dataset.ds === '1'; saveSettings(app.S); paintDrillPage(); });
function openSetupNow(view: 'setup' | 'drill' = 'setup'): void {
  app.replayPin = null; // (back at the setup: an older race's pinned wind direction is done with)
  if (app.S.mode === 'drill' || app.S.mode === 'manoeuvres' || app.S.mode === 'roundings' || app.S.mode === 'lesson') { app.S.mode = 'race'; prepare(); }
  // (behind the setup the view is still: the last frame stays and nothing sails; a race just prepared isn't running,
  // and is sent nothing until it starts)
  setStill(true); rowOpen = null; setupHeads();
  app.courseView.close(); app.navView.close(); if (app.w.running) app.send({ k: 'running', on: false }); ($('courseSel') as HTMLSelectElement).value = app.S.course; paintSeg(); crewRows(); courseCard(); dockSetup(view); $('setup').hidden = view !== 'setup'; $('drillView').hidden = view !== 'drill'; if (view === 'drill') { $('drillBack').textContent = app.nav.backLabel(); paintDrillPage(); } if (app.S.mode === 'sail') app.setupChart?.sync(true); tideBox(); }
function beginRace(seed?: number): void { app.results.settleLog(() => beginRaceNow(seed)); }
function beginRaceNow(seed?: number): void {
  // (the pause menu's and the results' Back to setup: the setup you sailed from, or the Drill page for a drill)
  const drilling = app.S.mode === 'drill' || app.S.mode === 'manoeuvres' || app.S.mode === 'roundings';
  app.nav.reset(drilling ? { k: 'drill' } : { k: 'setup' });
  for (const id of ['bSettings', 'bSet2', 'bDSetup']) $(id).textContent = drilling ? 'Back to Drill' : 'Back to setup';
  app.realRaceHolds();
  saveSettings(app.S);
  newGame(seed);
  if (app.S.mode === 'manoeuvres') { logMessage('— Tacks and jibes'); app.send({ k: 'running', on: true }); app.send({ k: 'pause', on: false }); app.word('bFast', 'Speed 1×');
    toast(`Tacks and jibes: ${Math.round(app.w.wind.kt)} kt from ${Math.round(app.w.wind.from)}°, ${app.w.cur.label.toLowerCase()}. She's close-hauled: tack when you're ready, or bear away to a run, settle there, and jibe. Each one is scored against a good crew's, in the Coach card.`, 6000); return; }
  if (app.S.mode === 'lesson') { // (Learn to sail: its cue is in the coach's places, sim/lessons.ts)
    const L = LESSONS.find(l => l.id === app.w.lesson?.id);
    logMessage(`— Learn to sail · ${L ? `${L.no} ${L.title}` : ''}`); app.send({ k: 'running', on: true }); app.send({ k: 'pause', on: false }); app.word('bFast', 'Speed 1×');
    return; }
  if (app.S.mode === 'roundings') { logMessage('— Mark roundings · the practice course'); app.send({ k: 'running', on: true }); app.send({ k: 'pause', on: false }); app.word('bFast', 'Speed 1×');
    const W = app.w.rounding!.marks[0];
    toast(`Mark roundings: ${Math.round(app.w.wind.kt)} kt from ${Math.round(app.w.wind.from)}°, ${app.w.cur.label.toLowerCase()}. Beat up to ${W.name.replace(/ \(.*/, '')} (leave it to port) and set the pole for the run down to the pin (the leeward mark, to port); then beat up again. Each rounding is scored against a good crew's, in the Coach card. Wide in, close out.`, 7000); return; }
  logMessage(`— ${app.S.mode === 'sail' ? `Cruise · ${place(app.S.sailFrom)?.name ?? ''}${app.w.dest ? ' to ' + app.w.dest.name : ''}` : app.S.mode === 'drill' ? 'Start practice' : 'Race'} · ${app.S.mode === 'sail' ? '' : app.w.C.title}`);
  app.send({ k: 'running', on: true }); app.send({ k: 'pause', on: false });
  app.word('bFast', 'Speed 1×');
  horn(1.0);
  const m0 = app.w.C.marks[0];
  if (app.w.fromSlip) {
    const m = Math.round((app.w.startAt - app.S.seq * 60) / 60);
    toast(`In her ${app.w.homeSlip!.kind === 'alongside' ? 'berth' : 'slip'} in ${harborOf(app.w.homeSlip!.marina)?.short ?? 'her marina'}, ${app.w.homeSlip!.label}, ${app.w.homeSlip!.kind === 'alongside' ? 'alongside the end of the dock, bow out,' : 'bow in'} and made fast. Sails are down: hoist them at the dock or once you're clear (J jib, U main; the main goes up best head to wind). Push off (${app.keymap.keys.pushOff[0]?.toUpperCase() ?? 'the button'}) to have the crew walk her out by hand into the fairway, then sail her out through the entrance${app.S.mode === 'sail' ? '' : `: the warning signal is in ${m} minutes. Speed it up if you like.`}`, 7000);
    return;
  }
  toast(app.S.mode === 'sail'
    ? `Cruising${app.w.dest ? ` to ${app.w.dest.name}` : ''}: no race. ${Math.round(app.w.wind.kt)} kt from ${Math.round(app.w.wind.from)}°, ${app.w.cur.label.toLowerCase()}. Sea: ${describeSea(app.w.seaHere(app.w.user))}.`
    : app.S.mode === 'drill'
    ? `Start practice${app.w.boats.length === 1 ? ', alone' : ''}: ${app.w.startAt / 60 === 1 ? 'one minute' : `${app.w.startAt / 60} minutes`} to the gun. Current: ${app.w.cur.label}.`
    : `${app.S.seq}-minute sequence.${app.w.courseSignal ? ` The committee is flying course ${app.w.courseSignal.no}.` : ''} Current: ${app.w.cur.label}. Sea: ${describeSea(app.w.seaHere(app.w.user))}. First mark: ${m0.name} to ${m0.side === 's' ? 'starboard' : 'port'}.`, 3800);
  if (app.w.courseSignal && app.S.mode !== 'sail') logMessage(`Course ${app.w.courseSignal.no}, in numeral pennants on the flagpole (Rule 27.1: signaled by the warning signal). ${app.w.courseSignal.why}`);
}

$('bGo').onclick = () => { if (app.S.mode === 'drill') app.S.mode = 'race'; app.courseView.close(); app.navView.close(); $('setup').hidden = true; beginRace(); };
$('bDrill').onclick = () => { app.S.mode = 'drill'; app.courseView.close(); app.navView.close(); $('setup').hidden = $('drillView').hidden = true; beginRace(); };
$('bManoeuvres').onclick = () => { app.S.mode = 'manoeuvres'; app.courseView.close(); app.navView.close(); $('setup').hidden = $('drillView').hidden = true; beginRace(); };
$('bRoundings').onclick = () => { app.S.mode = 'roundings'; app.courseView.close(); app.navView.close(); $('setup').hidden = $('drillView').hidden = true; beginRace(); };
/* The host club: the Seaweed Soup's courses (the committee's choice, or one you pick), or the practice area's. */
const hostOf = (id: string): 'ggyc' | 'practice' => id === RC_COURSE || COURSES.find(c => c.id === id)?.group ? 'ggyc' : 'practice';
let lastPick = hostOf(app.S.course) === 'ggyc' && app.S.course !== RC_COURSE ? app.S.course : COURSES.find(c => c.group)!.id;
function setCourse(id: string): void { app.S.course = id; saveSettings(app.S); setupChanged(() => { courseCard(); tideBox(); }); }
$('hostSeg').addEventListener('click', e => {
  const h = (e.target as HTMLElement).closest<HTMLElement>('[data-host]')?.dataset.host; if (!h || h === hostOf(app.S.course)) return;
  setCourse(h === 'practice' ? COURSES.find(c => !c.group)!.id : RC_COURSE);
});
$('courseMode').addEventListener('click', e => {
  const m = (e.target as HTMLElement).closest<HTMLElement>('[data-cm]')?.dataset.cm; if (!m) return;
  setCourse(m === 'rc' ? RC_COURSE : lastPick);
});
/* Change the conditions: one dialog over the setup. */
$('bCond').onclick = () => { $('condDlg').hidden = false; };
$('bCondClose').onclick = () => {
  $('condDlg').hidden = true;
  if (app.condLive) { app.condLive = false; $('pause').hidden = false; }
  if (app.showSaved) { // (from the showroom: what was set becomes the showroom's, and your own conditions go back as they were)
    const cond: Partial<Settings> = {}, rec = app.S as unknown as Record<string, unknown>;
    for (const k of CONDITION_KEYS) (cond as Record<string, unknown>)[k] = rec[k];
    app.showCond = cond; Object.assign(app.S, app.showSaved); app.showSaved = null; saveSettings(app.S); paintSeg(); newGame(); app.showBar();
  }
};

/** Learn to sail's lesson tiles (ui/lessons.ts): the ones passed ticked; a tile starts its lesson. */
function openLessons(): void {
  $('lessonGrid').innerHTML = lessonGridHtml(app.S.lessonsPassed ?? []);
  $('lessons').hidden = false;
}
$('lessonGrid').addEventListener('click', e => { const id = (e.target as HTMLElement).closest<HTMLElement>('[data-lesson]')?.dataset.lesson as LessonId | undefined; if (id) { $('lessons').hidden = true; beginLesson(id); } });
$('bLessonsX').onclick = () => { $('lessons').hidden = true; };
/** Start a Learn to sail lesson (its tile, in the Drill section). */
function beginLesson(id: LessonId): void { app.S.mode = 'lesson'; app.S.lesson = id; app.courseView.close(); app.navView.close(); for (const el of ['home', 'raceChoose', 'setup', 'drillView']) $(el).hidden = true; beginRace(); }
return { beginLesson, openLessons, beginRace, buildSetupChoices, courseCard, crewRows, newGame, openSetup, paintSeg, prepare, setupChanged, setupHeads, tideBox, toSetup, wake };
}

/**
 * The page's own copy of the harbors' still-water grids (environment/current.ts), worked on in its idle time round the
 * boats, so the chart and the water have them before they're looked at, and a race in the page's own thread (?inproc,
 * or a worker that wouldn't start) never stops to build one. Started once; it naps a second when there's nothing near.
 */
let basinsWarming = false;
function warmBasinsIdle(view: () => { boats: readonly { x: number; y: number }[] } | undefined): void {
  if (basinsWarming) return; basinsWarming = true;
  const idle = (cb: (ms: number) => void) => typeof requestIdleCallback === 'function' ? requestIdleCallback(d => cb(Math.max(0, d.timeRemaining() - 1)), { timeout: 1000 }) : setTimeout(() => cb(4), 50);
  const tick = (ms: number) => { const w = view(), more = !!w && warmBasins(w.boats, 3000, ms); if (more) idle(tick); else setTimeout(() => idle(tick), 1000); };
  idle(tick);
}
