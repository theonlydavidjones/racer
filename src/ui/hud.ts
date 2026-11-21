import { fillFlagIndex } from './flagIndex';
import { beatFor, seaDrag, steadySpeed } from '../boat/seaway';
import { crewWords, showCrewRow } from './crewWords';
import { bow, type Boat } from '../boat/boat';
import type { CourseMark } from '../courses/course';
import { PLACES } from '../sim/places';
import { harborRouteCached, slipAt } from '../geo/marina';
import { timeToCover } from '../boat/dynamics';
import { polar } from '../boat/polar';
import { currentWords } from '../sim/outlook';
import { byHand, sailPlan } from '../boat/physics';
import type { SailTrim } from '../boat/trim';
import { D2R, KT, V, brg, clamp, dist, dot, n360, sub, wrap, type Vec } from '../core/math';
import { HAIL_RESPONSE, cpa, situationText } from '../rules';
import { youTackPays } from '../sim/world';
import type { SimView } from '../sim/host';
import { $, setHidden, setHtml, setText, setTitle } from './dom';
import { routeAroundSteps } from '../sim/routing';
import { passageLive, passagePlanLater, type PassageNow, type PassagePlan } from '../sim/navigator';
import { clockOf } from '../sim/outlook';
import { pennantCanvas, signalCanvas } from '../render/flags';
import { FLAG_NAME, type Flag } from '../sim/signals';
import { VESSEL } from '../sim/traffic';
import { transitOffset } from '../sim/transits';
import { BOOM_STOP, targetShape, type Shape } from '../boat/controls';

/** "Main: a bit full (outhaul, backstay) · draft aft (Cunningham)": what's off in each sail's shape and the line that fixes it. */
function shapeWords(u: Boat): string {
  const tws = u.ww.kt, parts: string[] = [];
  const one = (name: 'main' | 'jib', s: Shape | null) => {
    if (!s) return;
    const t = targetShape(name, tws, u.awa, u.depower), out: string[] = [], c = u.ctl;
    const main = name === 'main', maxed = (...ks: (keyof typeof c)[]) => ks.every(k => (c[k] as number) >= 0.97);
    if (s.depth > t.depth + 0.012) out.push(maxed(...(main ? ['outhaul', 'backstay'] as const : ['backstay'] as const)) ? 'too full (flattening lines all on)' : `too full (${main ? 'outhaul, backstay' : 'backstay'} on)`);
    else if (s.depth < t.depth - 0.012) out.push(`too flat (ease ${main ? 'outhaul, backstay' : 'backstay'})`);
    if (s.draft > t.draft + 0.04) out.push(maxed(...(main ? ['cunningham', 'downhaul'] as const : ['jibCunningham', 'jibHalyard'] as const)) ? (main ? 'draft aft (the mast bend: Cunningham all on)' : 'draft aft (jib luff all on)') : `draft aft (${main ? 'Cunningham, main halyard' : 'jib Cunningham, jib halyard'} on)`);
    else if (s.draft < t.draft - 0.04) out.push(`draft forward (ease ${main ? 'Cunningham' : 'jib halyard, jib Cunningham'})`);
    if (s.twist > t.twist + 3) out.push(`twisted open (${main ? (u.awa > 60 ? 'vang on' : 'sheet in, traveler up') : 'jib car forward next tack'})`);
    else if (s.twist < t.twist - 3) out.push(`leech too closed (${main ? (u.awa > 60 ? 'ease the vang' : u.ww.kt >= 13 ? 'ease the sheet, traveler down' : 'ease the sheet, traveler up') : 'jib car aft next tack'})`);
    parts.push(`<b>${main ? 'Main' : 'Jib'}:</b> ${out.length ? out.join(', ') : 'shape good'}`);
  };
  if (u.luff) return '';
  one('main', u.shape.main); one('jib', u.shape.jib);
  return `${parts.join(' · ')} <b>· shape ${Math.round(u.shape.eff * 100)}%</b>`;
}
import { toast } from './feedback';
import { drawCourse, drawLaylines, fitCanvas, makeTf, type Tf, PEN } from './draw2d';
import { ShadowLayer } from './shadowLayer';
import { onLand } from '../geo/shore';
import { drawEncNamesAgain, encAidPoints, INK, SEEN, chartCredit, drawEncChart, drawEncLand, type ChartPalette, type Ink } from './encChart';
import { keySig, renderKey, type SimKey } from './legend';
import { fieldLayer, layerOn, type LayerKey } from './layers';
import { drawCompass } from './compassTape';
import { canLay, destName } from './navNames';
import { FlowField, Streaks, drawLegend, drawReadout, readout, type FlowKind } from './flow';
import type { Settings } from '../settings';
import { drawFog, drawSea, drawSetFog, nm, setFogAlpha } from './mapLayers';
import { setVisibility, visibilityFor } from '../environment/weather';
import { rainAt, rainLevel } from '../environment/rain';
import { driveCurveFor } from '../boat/driveCurve';
import type { SeaHere } from '../environment/sea';
import { laylinesFor } from '../sim/laylines';
import { pointOfSailWord } from './pointOfSail';

export function fmtClock(t: number): string {
  const a = Math.abs(t), m = Math.floor(a / 60), s = Math.floor(a % 60);
  return (t < 0 ? '' : '+') + m + ':' + String(s).padStart(2, '0');
}
export const sideWord = (s: string) => s === 's' ? 'stbd' : 'port';

/** Instrument pods, wind dial, course map, situation banner and line-aid readout. Redraws at 10 Hz. */
/**
 * The point of sail, by the true wind angle: close-hauled is as close as she sails well (her beat angle in this wind
 * and sea, boat/seaway.ts), a beam reach the wind square across her (80–100°), a run within 20° of dead downwind; head
 * to wind inside 30°, where no sail draws.
 */
// (her point of sail: ui/pointOfSail.ts, shown with the windex in the band and on the dial)
export { pointOfSail } from './pointOfSail';

/** Which way north points on a map turned so that `W` (deg, the wind's direction) is at the top: the angle (rad) to
 * turn an up-pointing arrow by, clockwise on the canvas (makeTf: a bearing b is drawn at b − W from up). */
export const northOnMap = (W: number) => -W * Math.PI / 180;
/** How the inset map is turned (deg at the top): wind up in a race, as racers read a course; north up just sailing, as a
 * cruising chart is (the owner picked a destination off a wind-up map in a westerly as if it were north-up). */
export const insetRotation = (wd: { freeSail: boolean; C: { base: number } }) => wd.freeSail ? 0 : wd.C.base;

export class Hud {
  /** The start practice's favored-end call (8za; app.ts): 'ask' before the gun, where the card hides which end is
   *  favored and asks which you think; `favCall` the end you've called, if any. 'race' does the same in a race, but
   *  shows the favored end (gold) as soon as you've called one; the verdict goes to Messages at the gun (the owner,
   *  20 Nov 2026: "don't highlight the favored side until I've identified it myself"). */
  favAsk: 'off' | 'ask' | 'race' = 'off';
  /** Whether the committee's flags are flying in the start card now (signals()). */
  private flagsUp = false;
  favCall: 'pin' | 'committee' | null = null;
  /** The end favored on the line now, before the gun ('square' under 2° of bias): the race's call is judged on its last value. */
  favNow: 'pin' | 'committee' | 'square' | null = null;
  private askKey = '';
  /** Where the chart's north arrow and wind go, across (px): drawChart works it out before the chart's print. */
  private northX = 0;
  private acc = 0;
  mapZoom = false;
  /** What the inset shows, cruising: the water round her (the map), or the navigator's passage (her course to the
   * destination, whole, north up; a tap opens the passage plan). The owner: "It should just be a view in the inset map." */
  insetView: 'map' | 'nav' = 'map';
  /** The passage the navigator view shows: worked out again each minute of the clock, or 300 m on (it takes a moment). */
  private insetPlan: PassageNow | null = null;
  private navMemo: { pn: PassageNow; t: number; x: number; y: number; dest: unknown } | null = null;
  navPassage(wd: SimView): PassageNow | null {
    if (!wd.dest) return null;
    const u = wd.user, m = this.navMemo;
    if (!m || m.dest !== wd.dest || wd.clockUtc - m.t >= 1 || Math.hypot(u.x - m.x, u.y - m.y) > 300) {
      const pn = passageLive(wd, this.bumpNav); if (!pn) return m && m.dest === wd.dest ? m.pn : null;
      this.navMemo = { pn, t: wd.clockUtc, x: u.x, y: u.y, dest: wd.dest };
    }
    return this.navMemo!.pn;
  }
  /** Bumped when a passage or a plan the maps draw comes in: the full chart, drawn on demand, draws again (ui/chart.ts). */
  navRev = 0;
  private bumpNav = (): void => { this.navRev++; };
  /**
   * The navigator's plan for the chart's layer (the owner, 17 Nov 2026: the navigator as a layer on the one chart, its
   * panel retired): the current gates on the way and where the wind's strongest (sim/navigator.ts passagePlan), worked out
   * between frames when she has a new destination, or she's sailed NAV_PLAN_M on or NAV_PLAN_MIN minutes have passed
   * since it was planned; only while it's shown, and the last one drawn until the next is in.
   */
  private planMemo: { plan: PassagePlan | null; dest: unknown; t: number; x: number; y: number } | null = null;
  private planJob: { dest: unknown; stop: () => void } | null = null;
  navPlan(wd: SimView): PassagePlan | null {
    if (!wd.dest || !wd.cruising && wd.running) return null;
    const u = wd.user, m = this.planMemo;
    const stale = !m || m.dest !== wd.dest || wd.clockUtc - m.t >= NAV_PLAN_MIN || Math.hypot(u.x - m.x, u.y - m.y) > NAV_PLAN_M;
    if (stale && this.planJob?.dest !== wd.dest) {
      this.planJob?.stop();
      const at = { dest: wd.dest, t: wd.clockUtc, x: u.x, y: u.y };
      const job = { dest: wd.dest, stop: () => {} };
      this.planJob = job;
      job.stop = passagePlanLater(wd, plan => { if (this.planJob === job) this.planJob = null; this.planMemo = { plan, ...at }; this.navRev++; });
    }
    return m && m.dest === wd.dest ? m.plan : null;
  }
  /** The chart's one line about the passage (ui/chart.ts): where to, how long, and when she'd get there; null with none. */
  navLine(wd: SimView): string | null {
    if (!wd.dest || !wd.freeSail) return null;
    const pn = this.navPassage(wd); if (!pn) return null;
    const to = wd.dest.name.replace(/^Off /, 'off ');
    if (!pn.ok || pn.eta == null) return `To ${to}: no passage leaving now`;
    return `To ${to} · ${Math.max(1, Math.round(pn.eta - wd.clockUtc))} min · ETA ${clockOf(pn.eta)}`;
  }
  private warm = 0;
  /** Build the full chart's other field (the wind's or the current's, whichever isn't shown) when the page is next idle,
   * for the view just drawn: the first switch to it then draws a field already built. At most one waiting at a time. */
  private warmFields(tf: Tf, w: number, h: number, scale: number, wd: SimView, shown: FlowKind | null): void {
    const ric = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (!ric || this.warm) return;
    this.warm = ric(() => {
      this.warm = 0;
      for (const k of ['wind', 'current'] as const) if (k !== shown) this.flowField[k].ready(tf, w, h, scale, wd, k, 14, 10);
    }, { timeout: 2000 });
  }
  /** The page's own choices of what the maps show (their layers and palette), set by the app: the maps draw from them,
   * not from the race's copy, which has them only once the race has had the command (in the setup, where nothing sails,
   * not until it starts: the planner's layers didn't switch). */
  display: (() => Pick<Settings, 'mapLayers' | 'chartPal'>) | null = null;
  /** The settings the maps draw with: the race's, with the page's own layers and palette. */
  shown(wd: SimView): Settings {
    const d = this.display?.(); const s = wd.settings as Settings;
    return d ? { ...s, mapLayers: d.mapLayers, chartPal: d.chartPal } : s;
  }
  /** Label of the key bound to Hail (set by main, which owns the key map). */
  hailKey: () => string = () => 'H';
  private dialC = $<HTMLCanvasElement>('dial');
  private mapC = $<HTMLCanvasElement>('map');
  /** The wind or current as Windy draws it (ui/flow.ts): the colour field for each map, and its moving streaks (drawn
   * every frame on a canvas over each map: the maps themselves are drawn ten times a second, or when the chart moves). */
  // (one of each per kind, each kept: switching layers draws the one already built, and each kind's streaks carry on
  // where they were, rather than one field rebuilt, and one set of streaks thrown onto another flow, at every switch:
  // the owner, 15 Nov 2026, "toggling between current and waves in cruise planner takes forever, and the moving lines
  // redraw themselves in weird ways")
  private flowField: Record<FlowKind, FlowField> = { wind: new FlowField(), current: new FlowField() };
  /** The wind shadows on each map (ui/shadowLayer.ts): the race's own wind, the lee of everything upwind. */
  private shadows = { inset: new ShadowLayer(), chart: new ShadowLayer() };
  /** Shadows switched on and none in view, on each map: the chart says so. */
  private shadowNone: Record<'inset' | 'chart', boolean> = { inset: false, chart: false }; // (the full chart's only: the inset shows no field)
  private streaks: Record<FlowKind, Streaks> = { wind: new Streaks(900), current: new Streaks(900) };
  private mapFx = $<HTMLCanvasElement>('mapFx');
  /** how each map was drawn last (its transform), for the streaks */
  private drawn: Partial<Record<'inset' | 'chart', { tf: Tf; w: number; h: number; scale: number; kind: FlowKind | null }>> = {};

  /** Mean close-hauled heading on each tack over the last couple of minutes (the reference for lifts and headers). */
  private meanHdg: Record<'S' | 'P', number | null> = { S: null, P: null };
  /**
   * The heading pod (the chase-view layout): her heading, over a tape 50° either side of it. Blue, where the true wind
   * comes from; yellow, the next mark (an arrow at the tape's edge when either is off it); a grey tick under the tape
   * for the heading she'd sail on the other tack (or after a gybe), a white one for her average close-hauled heading
   * on this tack. Steer above the average and she's lifted, below it headed: the pod's label says by how much.
   */
  /** What the compass tape last drew (compass): its size and its angles, to a twentieth of a degree. */
  private tapeKey: number[] = [];
  private compass(w: SimView, u: Boat, dt: number): void {
    // (the state first, every frame: the heading's figure, the close-hauled mean and its lifted/headed note)
    const h = u.h, hdg = String(Math.round(n360(h)) % 360).padStart(3, '0') + '°', hEl = $('hdg');
    if (hEl.textContent !== hdg) hEl.textContent = hdg;
    const upwind = u.twa < 80, from = u.ww.from;
    // average close-hauled heading on this tack: a slow running mean while you're close-hauled
    if (upwind && Math.abs(u.twa - (beatFor(u) - (u.leeway ?? 0))) < 6) { const m = this.meanHdg[u.tack]; this.meanHdg[u.tack] = m == null ? h : n360(m + wrap(h - m) * Math.min(1, dt / 90)); }
    const mean = this.meanHdg[u.tack], lift = $('hdgLift');
    let note = '', cls = '';
    if (upwind && mean != null) {
      const d = wrap(h - mean) * (u.tack === 'S' ? -1 : 1); // starboard: lifted when heading is higher (smaller) than the mean
      if (Math.abs(d) >= 3) { note = d > 0 ? `lifted ${Math.round(d)}°` : `headed ${Math.round(-d)}°`; cls = d > 0 ? 'lift' : 'head'; }
    }
    if (lift.textContent !== note) { lift.textContent = note; lift.className = cls ? 'vh ' + cls : 'vh'; } // (read out, not shown: the compass shows it)
    const m = w.nextMark(u), markB = m ? brg(m.p.x - u.x, m.p.y - u.y) : null;
    // the lift/header tint (r272, the owner's H2): only close-hauled and settled on a mean, fading in over a second or two
    const hauled = upwind && mean != null && Math.abs(u.twa - (beatFor(u) - (u.leeway ?? 0))) < 10;
    this.tintA = clamp(this.tintA + (hauled ? dt : -dt) / 1.5, 0, 1);
    const dl = mean != null ? wrap(h - mean) * (u.tack === 'S' ? -1 : 1) : 0, shift = hauled && dl >= 3 ? 'lift' as const : hauled && dl <= -3 ? 'head' as const : null;
    // the tape: drawn again only when something on it has moved (a twentieth of a degree is about a tenth of a pixel on
    // it) or it's changed size. Steady on a course it was the same picture redrawn every frame
    const [ctx, W, H] = fitCanvas($<HTMLCanvasElement>('compassTape')), q = (a: number) => Math.round(a * 20);
    const key = [W, H, q(h), this.tintA > 0 && mean != null ? q(mean) : -1, Math.round(this.tintA * 20), shift === 'lift' ? 1 : shift === 'head' ? 2 : 0, q(from), markB == null ? -1 : q(markB)], k0 = this.tapeKey;
    if (k0.length === key.length && key.every((v, i) => v === k0[i])) return;
    this.tapeKey = key;
    drawCompass(ctx, W, H, h, from, markB, this.tintA > 0 && mean != null ? { mean, lifted: dl >= 0, alpha: this.tintA } : null, shift);
  }
  /** The lift/header tint's opacity (0 hidden … 1 shown): it fades in once she's close-hauled and settled. */
  private tintA = 0;



  private trCache: { key: string; t: ReturnType<SimView['laylineTransit']> } = { key: '', t: null };
  /**
   * Transits: before the start, what the far end of the line lines up with (in line = on the line); on a beat, what
   * the mark lines up with along your layline (in line = on the layline).
   */
  private transit(w: SimView, u: Boat): void {
    const el = $('transit');
    if (w.freeSail || u.finished || u.retired || !w.settings.aids) { el.hidden = true; return; }
    const C = w.C, deg = (o: number) => (Math.abs(o) < 0.8 ? '<span class="on">in line now</span>' : `${Math.abs(o).toFixed(0)}° ${o > 0 ? 'right' : 'left'} of it`);
    if (w.t < 0 || !u.started) {
      const T = w.lineTransit; if (!T) { setHidden(el, true); return; }
      setHidden(el, false);
      setHtml(el, `Line transit: <b>${C.pinLabel}</b> in line with <b>${T.name}</b> means you're on the line · ${C.pinLabel} is ${deg(transitOffset(u, C.pin, T.p))}`);
      setTitle($('nextCard'), (el.textContent ?? '') + ' · Click for the course and the strategist');
      return;
    }
    const m = w.nextMark(u), L = laylinesFor(w, u);
    if (!m || !L || L.kind !== 'up' || u.twa > 70) { setHidden(el, true); return; }
    const i = u.tack === 'S' ? 0 : 1, g = L.tracks[i], key = `${m.name}:${Math.round(Math.atan2(g.x, g.y) * 30)}`;
    if (key !== this.trCache.key) this.trCache = { key, t: w.laylineTransit(L.mark.p, g) };
    const T = this.trCache.t; if (!T) { setHidden(el, true); return; }
    setHidden(el, false);
    setHtml(el, `${u.tack === 'S' ? 'Starboard' : 'Port'} layline: <b>${m.name.split(' ')[0]}</b> in line with <b>${T.name}</b> · ${m.name.split(' ')[0]} is ${deg(transitOffset(u, L.mark.p, T.p))}`);
    setTitle($('nextCard'), (el.textContent ?? '') + ' · Click for the course and the strategist');
  }

  private sigKey = '';
  /** The flag index (the Flags tile opens it): every flag the committee can fly, what it means, and what's up now. */
  flagIndex(w: SimView, open?: boolean): void {
    const el = $('flagIndex');
    if (open != null) el.hidden = !open;
    if (!el.hidden) fillFlagIndex($('fiBody'), { flying: w.flags, prep: w.prepFlag, course: w.courseSignal?.no ?? null });
  }
  private toldHelm = false;
  /** The race committee's flags flying now, what they mean, and the next signal. */
  private signals(w: SimView): void {
    // (shown while the committee's flags matter, and only with something flying: no "none" tile after the gun; it's back
    // the moment a flag goes up, the class and prep flags before the start, a recall, a postponement; the owner, 15 Nov)
    const flying = w.flags.length > 0 || (!!w.courseSignal && !w.cancelled);
    const show = !w.freeSail && flying && (w.t < 8 || w.flags.includes('X') || !!w.user.roundEnd || !!w.cancelled);
    // (the flags fly in the start card now, beside its timer: r272, the owner, 20 Nov; the old tile stays hidden)
    $('sigPanel').hidden = true; this.flagsUp = show; $('ncFlags').hidden = !show; if (!show) return;
    const key = w.flags.join(',') + '|' + (w.courseSignal?.no ?? '');
    if (key !== this.sigKey) {
      this.sigKey = key;
      if (!$('flagIndex').hidden) this.flagIndex(w); // (open: what's flying changes under you)
      const box = $('ncFlags'); box.innerHTML = '';
      const flagPic = (f: Flag) => { const c = document.createElement('canvas'); c.width = 66; c.height = 44; c.getContext('2d')!.drawImage(signalCanvas(f), 0, 0, 66, 44); c.title = FLAG_NAME[f]; return c; };
      // a flag flown over A (AP over A, N over A) is one hoist, one above the other, as it's flown
      const over = w.flags.includes('A') ? w.flags.filter(f => f !== 'A') : [];
      if (over.length) { const col = document.createElement('span'); col.className = 'sig-over'; col.title = `${over.map(f => FLAG_NAME[f]).join(', ')} over A`; col.append(...over.map(flagPic), flagPic('A')); box.appendChild(col); }
      else for (const f of w.flags) box.appendChild(flagPic(f));
      if (w.courseSignal && !w.cancelled) { // (once racing's called off, there's no course to sail) // the course number, in numeral pennants, top to bottom
        const col = document.createElement('span'); col.className = 'pennants'; col.title = `Course ${w.courseSignal.no}`;
        for (const d of String(w.courseSignal.no)) { const c = document.createElement('canvas'); c.width = 56; c.height = 28; c.getContext('2d')!.drawImage(pennantCanvas(d), 0, 0, 56, 28); col.appendChild(c); }
        // (flags and pennants only on the tile, the owner: the index says what they mean)
        box.appendChild(col);
      }
    }
    const next = w.sequence.find(s => s.t > w.t), u = w.user;
    const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    let txt = w.cancelled ? (w.cancelled.up[0] === 'N' ? 'N over A: abandoned, no more racing today.' : 'AP over A: postponed, no more racing today.') : next ? `${next.name} in ${mmss(next.t - w.t)}` : w.flags.includes('X') ? 'X: individual recall. Boats over early must return.' : '';
    if (u.roundEnd) txt = 'I flag: go back round an end of the line.';
    else if (u.scoring) txt = u.scoring === 'ZFP' ? 'Z flag: you have a 20% penalty.' : `You're disqualified (${u.scoring}).`;
    else if (u.ocs && w.t >= 0) txt = 'X flag: you\'re over. Return and start.';
    setText($('sigText'), txt);
  }

  update(w: SimView, dt: number): void {
    this.signals(w);
    this.transit(w, w.user);
    this.compass(w, w.user, dt);
    this.insetStreaks(dt);
    this.acc += dt; if (this.acc < 0.1) return; this.acc = 0;
    const u = w.user, ww = u.ww, m = w.nextMark(u);
    $('clock').textContent = fmtClock(w.t);
    // (racing, the clock lives in the start card before the gun and in the nav strip after it: r272, the owner, 20 Nov)
    { const pod = $('clock').closest<HTMLElement>('.pod')!, d = w.freeSail ? '' : 'none'; if (pod.style.display !== d) pod.style.display = d; }
    $('clockLab').textContent = w.freeSail ? 'Sailing' : w.t < 0 ? 'Start in' : 'Race time';
    // a boat scored DSQ, UFD, BFD or ZFP while racing sees it here, first on the line, for the rest of her race (the
    // Flags tile shows flags only: the owner, 12 Nov; the Coordinator's ruling, 15 Nov)
    const code = !w.freeSail && !w.cancelled && !u.retired && w.t >= 0 && u.scoring ? u.scoring : '';
    const sub = $('clockSub'), state = (w.freeSail ? (w.lesson ? 'Lesson' : 'Cruising') : w.cancelled ? (w.cancelled.up[0] === 'N' ? 'Abandoned' : 'Postponed') : w.t < 0 ? (w.t > -10 ? 'Build speed' : w.t > -60 ? 'Final minute' : 'Pre-start') :
      u.finished ? 'Finished' : u.retired ? 'Retired · home' : u.ocs ? 'OCS · return' : !u.started ? 'Not started' : m ? `Next ${m.name.split(' ')[0]} · ${sideWord(m.side)}` : 'To finish');
    const subKey = code + '|' + w.clock + '|' + state;
    if (sub.dataset.k !== subKey) { // (in the give-way red, the one word that has to be seen)
      sub.dataset.k = subKey;
      if (!code) sub.textContent = w.clock + ' · ' + state;
      else { const c = document.createElement('span'); c.className = 'code'; c.textContent = code; sub.replaceChildren(c, ' · ' + state); } // (the code over the clock: one line in the card)
    }
    $('spd').textContent = (u.v / KT).toFixed(1);
    $('sog').textContent = 'SOG ' + (Math.hypot(u.vx, u.vy) / KT).toFixed(1);
    // (the windex is in the sail controls band: ui/sailBand.ts; the pole's tab too)
    this.poleHints(w, u);
    this.trimPanel(u);
    // the wind on the water here (the windex has the angle); its direction goes under it
    $('tws').textContent = ww.kt.toFixed(0);
    const twd = String(Math.round(ww.from) % 360).padStart(3, '0') + '°';
    // the tide where you are: the current's speed, flood or ebb by the nearest NOAA station's flood direction (or, with
    // a practice current, the Gate's: the flood sets in, about 095°: environment/current.ts)
    { const c = u.cur, kt = Math.hypot(c.x, c.y) / KT;
      const st = w.tide?.stations.length ? w.tide.stations.reduce((a, s) => (dist(s.p, u) < dist(a.p, u) ? s : a)) : null;
      const flood = st ? st.flood : 95, slack = kt < 0.15;
      $('tideVal').textContent = slack ? 'Slack' : kt.toFixed(1);
      $('tideLab').textContent = slack ? 'Tide' : dot(c, V(flood)) >= 0 ? 'Flood' : 'Ebb';
      $('tideVal').title = slack ? 'Slack water here' : `The tide here: ${currentWords(c, flood)}`; }
    // the sea where you are: chop height (what slows you), and the swell
    { const s = u.sea, ft = (m: number) => (m / 0.3048).toFixed(1) + ' ft';
      const ftS = (m: number) => (m / 0.3048).toFixed(m < 0.3 ? 1 : 0) + ' ft'; // short enough for the box
      // (with a swell the chop's word shortens, so the line fits the card; the full words on hover)
      const chop = s.hsW < 0.05 ? 'glassy' : s.steep > 0.075 ? 'steep chop' : 'chop';
      $('seaSub').textContent = s.hsS >= 0.05 ? (s.hsW < 0.05 ? '' : chop === 'steep chop' ? 'steep · ' : 'chop · ') + `${ftS(s.hsS)} swell` : chop;
      $('seaSub').title = `${s.hsW < 0.05 ? 'Glassy' : `${ft(s.hsW)} of ${s.steep > 0.075 ? 'steep ' : ''}chop`}${s.hsS >= 0.05 ? `, ${ft(s.hsS)} of swell` : ''}`; }
    // (the wind she's in against her own minute's average: the course's wind can be shifting the other way where she is)
    const dev = wrap(ww.from - (u.avgFrom ?? w.avgFrom)), lifted = u.tack === 'S' ? dev > 0 : dev < 0, sl = $('shiftLab');
    if (Math.abs(dev) >= 2 && u.twa < 70) { sl.textContent = `${twd} · ${lifted ? 'lift' : 'head'} ${Math.abs(dev).toFixed(0)}°`; sl.className = 'sub ' + (lifted ? 'lift' : 'head'); sl.title = `True wind from ${twd}, ${lifted ? 'a lift' : 'a header'} of ${Math.abs(dev).toFixed(0)}° on this tack`; }
    else {
      // in a puff or a lull?
      const k = w.puffs.at(u).k, lee = u.leeK ?? 1, dirty = (u.shadowK ?? 1) / lee; // the land's lee, and other boats' and ships' wakes
      // short enough for the box; the full words on hover
      const blanket = dirty < 0.95 ? ` · dirty −${Math.round((1 - dirty) * 100)}%` : lee < 0.92 ? ` · lee −${Math.round((1 - lee) * 100)}%` : '';
      const why = dirty < 0.95 ? `in another boat's or a ship's dirty air (${Math.round((1 - dirty) * 100)}% less wind)` : lee < 0.92 ? `in the lee of the land (${Math.round((1 - lee) * 100)}% less wind)` : k > 1.08 ? 'in a puff' : k < 0.92 ? 'in a lull' : '';
      sl.textContent = twd + (blanket || (k > 1.08 ? ' · puff' : k < 0.92 ? ' · lull' : ' true'));
      sl.title = `${ww.kt.toFixed(1)} kt of wind on the water here${why ? ', ' + why : ''}`;
      sl.className = 'sub' + (blanket ? ' head' : k > 1.08 ? ' lift' : '');
    }
    this.situation(w, u); this.lineBox(w, u); this.navStrip(w, u); this.dialC.hidden = !w.settings.windDial; if (w.settings.windDial) this.dial(u); this.map(w, u);
  }

  /** How each sail is drawing, in words, with what to do about it. */
  private trimPanel(u: Boat): void {
    const word = (t: SailTrim | null, off: string) => !t ? [off, 'off'] : t.flow === 'good' ? ['Good', 'good'] : t.flow === 'luffing' ? ['Luffing', 'luffing'] : ['Stalled', 'stalled'];
    const plan = sailPlan(u);
    const [mw, mc] = u.luff ? ['Eased', 'off'] : word(u.trim.main, '');
    const backed = (u.jibBacked ?? 0) > 0.3;
    const [jw, jc] = backed ? ['Aback', 'backed'] : u.luff ? ['Eased', 'off'] : word(u.trim.jib, plan === 'wing' ? 'Poled out' : 'Down');
    $('tpCrew').textContent = crewWords(u); showCrewRow(u);
    const tm = $('tpMain'), tj = $('tpJib');
    tm.textContent = mw; tm.className = 'tp-state ' + mc;
    tj.textContent = jw; tj.className = 'tp-state ' + jc;
    // what each state means, and what fixes it (on hover)
    // (each sail's own telltales, as the boat has them: the jib's on its luff, windward and leeward; the main's on its leech)
    const why: Record<string, string> = { good: 'Drawing well. Upwind and reaching, the jib\'s luff telltales stream on both sides; on a broad reach or run they hang, and the sail wants easing out square to the wind.',
      luffing: 'Luffing: eased too far, or she\'s pointing too high, so the front of the sail lifts. Trim in, or if it\'s already in hard, bear away until it stops.',
      stalled: 'Stalled: trimmed in too far for this wind angle (or she\'s borne away without easing), so the flow breaks off the back. Ease until the jib\'s leeward luff telltales stream.',
      backed: 'Aback: the jib is sheeted to windward and pushes her bow away (heaving to).', off: '' };
    const mainWhy: Record<string, string> = { good: 'Drawing well. Upwind and reaching, the main\'s leech telltales stream off the back; on a broad reach or run they hang, and the sail wants easing out square to the wind.',
      stalled: 'Stalled: trimmed in too far for this wind angle (or she\'s borne away without easing), so the flow breaks off the back. Ease until the main\'s leech telltales stream.' };
    // (the boom on the shroud, stalled on a broad reach: it can't be eased any further, so not "ease")
    const onShroud = mc === 'stalled' && u.sheets.main >= BOOM_STOP - 0.5;
    tm.title = onShroud ? 'Stalled with the boom on the shroud: it can\'t go out any further. Come up until the main\'s leech telltales stream, or bear away to a run, where they hang and the main just pushes.' : mainWhy[mc] ?? why[mc] ?? '';
    tj.title = why[jc] ?? '';
    // the sails' shape against the best shape for the conditions, and which line fixes it
    const sw = shapeWords(u);
    $('tpShape').innerHTML = sw;
    // heel and helm balance: what the boat feels like on the tiller
    { const heel = Math.round(u.heelMag ?? 0), hn = u.helmNeed ?? 0, up = u.twa < 70;
      // who's trimming: the crew depowers on their own (controls.ts depowerLimits); when they've done all they can, it's the helm's job
      const crewTrims = !(['backstay', 'vang', 'outhaul', 'traveller'] as const).some(k => byHand(u, k)), dp = u.depower ?? 0;
      const overUp = crewTrims ? (dp < 0.95 ? ' · overpowered: the crew is depowering' : ' · overpowered with everything on: feather (sail a touch higher, letting the main lift) or ease the main in the puffs')
        : ' · overpowered: backstay on, vang on, traveler down, flatten';
      const advice = u.luff ? '' : hn > 5 ? (up ? overUp : ' · ease the main or vang') : hn < -1.5 ? ' · lee helm: traveler up, ease backstay, fuller sails' : heel > 24 && up ? (crewTrims && dp < 0.95 ? ' · heeling too far: the crew is depowering' : ' · heeling too far: depower') : '';
      if (!this.toldHelm && hn > 3.5 && up && !u.luff) { this.toldHelm = true; toast(`Weather helm: she wants to round up into the wind. Let go of the tiller and she will. Hold the tiller a little to windward to sail straight, or take the helm off her: backstay on, traveler down (Trim coach explains).`, 6000); }
      // the Coach card's second line (the chase-view layout): where the crew are, and what to do when she's overpowered
      // where the crew are, the line's last word: a button that opens their places, in place of a Crew button (the
      // surface audit, owner 13 Nov), amber once you've placed them as a line is in the band. It's built once and only its
      // words change, so a click never straddles a rewrite of the line.
      const c = u.crew, crewWhere = !c ? '' : `crew ${c.mode === 'hike' ? 'hiking' : c.mode === 'leeward' ? 'to leeward' : c.mode === 'foredeck' ? 'on the foredeck' : c.fore > 0.55 ? 'forward' : c.fore < 0.25 ? 'aft' : 'amidships'}`;
      const box = $('tpBalance');
      // (the sails' states, heel and helm left the line (the owner, 15 Nov 2026: the band shows them); where the crew are
      // and what to do when she's overpowered stay)
      if (!box.querySelector('.tp-crew')) box.innerHTML = '<button type="button" class="tp-crew"></button><span class="tp-adv warn"></span>';
      const cb = box.querySelector<HTMLButtonElement>('.tp-crew')!, placed = !!c?.place;
      if (cb.textContent !== crewWhere) cb.textContent = crewWhere;
      cb.hidden = !c;
      cb.classList.toggle('mine', placed);
      const tt = `Where the crew sit: click to place them (keys 7–0). ${placed ? 'Placed by you' : 'On auto'}`; if (cb.title !== tt) cb.title = tt;
      const adv = box.querySelector('.tp-adv')!; if (adv.textContent !== advice) adv.textContent = advice; }
    // (the line under the sails' state is the trim coach's headline: app.ts coachTick)
  }

  private deepT = 0;
  private abackT = 0;
  private hinted = { deep: false, aback: false };
  /** Coach the whisker pole: suggest it on a deep run, and warn when it's left out on a reach. */
  private poleHints(w: SimView, u: Boat): void {
    if (w.t < 0 || u.finished || u.retired) return; // (the pole is yours to call: a cue, never done for you)
    const deep = u.twa > 158 && u.pole === 'down' && !u.poleWant;
    this.deepT = deep ? this.deepT + 0.1 : 0;
    if (!deep && u.twa < 140) this.hinted.deep = false;
    if (this.deepT > 6 && !this.hinted.deep) {
      this.hinted.deep = true;
      toast('Running deep: the main is blanketing the jib. Pole it out to windward and go wing-on-wing (the band\'s Pole tab, or O).', 4500);
    }
    // (poled out up where it doesn't pay: from 154.5 true down to 145 the jib does less than it would to leeward; below
    // that the crew bring it in themselves, ai.ts poleMustCome)
    const aback = u.pole === 'set' && u.twa < 154.5;
    this.abackT = aback ? this.abackT + 0.1 : 0;
    if (!aback) this.hinted.aback = false;
    if (this.abackT > 3 && !this.hinted.aback) {
      this.hinted.aback = true;
      toast('Poled out on a broad reach, the jib does less than sheeted to leeward. Stow the pole (O) or bear away toward a run.', 4000);
    }
  }

  /** The most pressing nearby boat: who keeps clear, under which rule, and time to collision. */
  private situation(w: SimView, u: Boat): void {
    let best: { o: Boat; r: ReturnType<SimView['rights']>; c: { t: number; d: number }; d: number; risk: boolean } | null = null, bestScore = -1e9;
    for (const o of w.boats) {
      if (o.isUser) continue;
      const d = dist(u, o); if (d > 90) continue;
      const r = w.rights(u, o), c = cpa(u, o), risk = c.t < 10 && c.d < 14;
      const score = risk ? 100 - c.t * 5 - c.d : -d;
      if (score > bestScore) { bestScore = score; best = { o, r, c, d, risk }; }
    }
    const el = $('situ');
    if (!best || (!best.risk && best.d > 45)) { el.hidden = true; return; }
    el.hidden = false;
    const { o, r, c, risk } = best, kc = r.kc === u;
    // Rule 17: whoever got the leeward overlap from astern may not luff above her proper course
    const r17 = w.t > 0 ? w.pairRecord(u, o)?.r17 : null;
    const note17 = r17 === u.id ? ' Rule 17: you came from astern, so sail no higher than your proper course.'
      : r17 === o.id ? ` ${o.name} came from astern: they may not luff you above their proper course (Rule 17).` : '';
    const hail = w.pairRecord(u, o)?.hail;
    if (hail && hail.kind === 'room') {
      // a hail for room to tack trumps everything else
      const key = this.hailKey();
      if (hail.replyAt != null) {
        // (the room passes, not right of way: WS Case 101. So the colour follows who keeps clear, as everywhere else)
        $('situMsg').textContent = hail.by === o.id ? `You replied "You tack". Give ${o.name} room to tack and pass astern of you.` : `${o.name} replied "You tack". Tack now${kc ? ' and keep clear of them' : ''}: they must give you room to do it.`;
        el.className = kc ? 'kc' : 'row';
      } else if (hail.by === o.id && hail.passedOn) {
        // Rule 20.3: you passed the hail on to the boat to windward of you
        const po = hail.passedOn, nm = w.boats.find(b => b.id === po.to)?.name ?? 'the boat to windward';
        const left = po.respondedAt != null ? Math.max(0, po.respondedAt + HAIL_RESPONSE - w.t) : null;
        $('situMsg').textContent = po.failed ? `${nm} didn't respond to your hail, so you can't tack yet. Keep clear of the obstruction.`
          : left == null ? `You passed the hail on to ${nm}. Tack as soon as they respond (Rule 20.3).` : `${nm} has responded. Tack now (Rule 20.3): ${left.toFixed(0)} s.`;
        el.className = left != null ? 'kc alarm' : 'kc';
      } else if (hail.by === o.id) {
        const left = Math.max(0, hail.at + HAIL_RESPONSE - w.t);
        const passTo = !youTackPays(o, u) ? w.canPassOn(u, o) : null, blocked = !!passTo;
        $('situMsg').textContent = blocked
          ? `${o.name} hailed "Room to tack!" With ${passTo!.name} to windward you can't tack yet: press ${key} to pass the hail on to them (Rule 20.3): ${left.toFixed(0)} s.`
          : `${o.name} hailed "Room to tack!" Tack now, or press ${key} to reply "You tack" and give them room: ${left.toFixed(0)} s to respond.`;
        el.className = 'kc alarm';
      } else if (hail.passedOn && hail.clearAt == null) {
        const nm = w.boats.find(b => b.id === hail.passedOn!.to)?.name ?? 'the boat to windward';
        $('situMsg').textContent = `${o.name} passed your hail on to ${nm} (Rule 20.3), and will tack once they respond. Be ready to tack.`;
        el.className = 'row';
      } else if (hail.clearAt != null) {
        const left = Math.max(0, hail.clearAt + HAIL_RESPONSE - w.t);
        const tacked = (u.headToWindT ?? -Infinity) >= hail.at; // (a gybe isn't the tack rule 20.2(d) asks for)
        $('situMsg').textContent = tacked ? `You're tacking: ${o.name} is giving you room.` : `${o.name} is tacking to give you room. Tack now: ${left.toFixed(0)} s.`;
        el.className = tacked ? 'row' : 'kc alarm';
      } else if (hail.respondedAt != null) {
        $('situMsg').textContent = `${o.name} is tacking to give you room. Tack as soon as she's through the wind.`;
        el.className = 'kc';
      } else {
        $('situMsg').textContent = `You hailed "Room to tack!" ${o.name} must tack or reply "You tack".`;
        el.className = 'row';
      }
      $('situRule').textContent = 'Rule 20'; el.hidden = false;
      return;
    }
    $('situMsg').textContent = situationText(r.rule, kc, o.name) + note17 + (risk && c.t < 8 && c.d < 9 ? ` Collision in ${c.t.toFixed(0)} s.` : '');
    $('situRule').textContent = 'Rule ' + r.rule;
    el.className = (kc ? 'kc' : 'row') + (kc && risk && c.t < 6 && c.d < 8 ? ' alarm' : '');
  }

  private cardKey = '';
  /** The Coach card's second line as last drawn. */
  /** The signal flags drawn into the card's sketch (as data URLs, made once). */
  private flagUrl: Partial<Record<'N' | 'AP' | 'A', string>> = {};
  /** The "where next" card's header, number and sketch (only rewritten when they change). */
  private card(cls: string, head: string, num: string, unit: string, svg: string): void {
    const key = cls + head + num + unit + svg; if (key === this.cardKey) return; this.cardKey = key;
    const el = $('nextCard'); el.hidden = false; el.className = cls;
    $('ncHead').textContent = head; $('ncNum').innerHTML = `${num}<span>${unit}</span>`; $('ncSketch').innerHTML = svg;
  }
  /**
   * A line in the card's sketch, seen from below it looking up the course: its two ends (the favoured one starred),
   * and you as a dot (red when you're over it), your arrow toward the line or away from it.
   */
  private lineSketch(w: SimView, u: Boat, ends: [string, string], fav: 0 | 1 | -1, over: boolean, toward: boolean, called: 0 | 1 | -1 = -1): string {
    const T = (x: number, y: number, t: string, c = '#94abb7', a = 'middle') => `<text x="${x}" y="${y}" text-anchor="${a}" fill="${c}" font-size="13" font-weight="700">${t}</text>`;
    // which end is on the left, looking up the course (N): the pin if it's to the left of N
    const left = { x: -w.N.y, y: w.N.x }, pinLeft = dot(sub(w.pin, w.center), left) > 0;
    const [lName, rName] = pinLeft ? ends : [ends[1], ends[0]], lFav = fav === (pinLeft ? 0 : 1), rFav = fav === (pinLeft ? 1 : 0);
    // (the end called, start practice: ringed till the gun shows which was favored)
    const lCall = called === (pinLeft ? 0 : 1), rCall = called === (pinLeft ? 1 : 0), ring = '#ffb627';
    const along = clamp(dot(sub(u, w.center), left) / (w.lineLen / 2), -1.3, 1.3); // + toward the left end
    const X = Math.round(75 - along * 61), Y = over ? 4 : 30, col = over ? '#ff5d4c' : '#3fd197', dir = toward === over ? 1 : -1; // (arrow down, away from the line's course side, or up)
    const ly = over ? 18 : 12;
    return `<line x1="14" y1="${ly}" x2="136" y2="${ly}" stroke="#94abb7" stroke-width="2" stroke-dasharray="4 3"/>`
      + (lCall ? `<rect x="5" y="${ly - 9}" width="18" height="18" rx="3" fill="none" stroke="${ring}" stroke-width="1.5"/>` : '') + (rCall ? `<circle cx="136" cy="${ly}" r="8.5" fill="none" stroke="${ring}" stroke-width="1.5"/>` : '')
      + `<rect x="8" y="${ly - 6}" width="12" height="12" rx="2" fill="${lFav ? '#ffb627' : '#e9f2f5'}"/>${T(1, ly + 21, lName + (lFav ? ' ★' : ''), lFav ? '#ffb627' : '#94abb7', 'start')}`
      + `<circle cx="136" cy="${ly}" r="5" fill="${rFav ? '#ffb627' : '#e9f2f5'}"/>${T(149, ly + 21, rName + (rFav ? ' ★' : ''), rFav ? '#ffb627' : '#94abb7', 'end')}`
      + `<circle cx="${X}" cy="${Y}" r="4" fill="${col}"/><path d="M${X} ${Y + 3 * dir} v${7 * dir}" stroke="${col}" stroke-width="2"/>`
      + `<path d="M${X - 3.5} ${Y + 7 * dir} l3.5 ${4 * dir} l3.5 ${-4 * dir}" fill="none" stroke="${col}" stroke-width="2"/>`;
  }
  /** The sketch's two ends as places to click (the owner, 20 Nov 2026: the call's made on the picture, no buttons):
   *  each end's area gets its end, looking up the course; off when there's no call to make. Written only on change. */
  private callEnds(w: SimView, on: boolean): void {
    const pinLeft = on && dot(sub(w.pin, w.center), { x: -w.N.y, y: w.N.x }) > 0, key = on ? String(pinLeft) : '';
    if (key === this.askKey) return; this.askKey = key;
    const l = $('ncEndL'), r = $('ncEndR'); l.hidden = r.hidden = !on; if (!on) return;
    l.dataset.end = pinLeft ? 'pin' : 'committee'; r.dataset.end = pinLeft ? 'committee' : 'pin';
  }
  /** What the nav strip last showed (written only when it changes). */
  private nsKey = '';
  /**
   * The nav strip, top right (r272, the owner, 20 Nov 2026): where she's bound and how it lies, in the chartplotter's
   * terms, one row; only what the instruments don't already show (no speed, heading or clock). Cruising: the destination
   * (its short name: ui/navNames.ts), BRG, DTW, TTG and VMC (her speed made good toward it, over the ground). Racing: the
   * race time after the gun, the next mark by its code and the side it's left to, BRG, DTW, and VMG while she has to tack or
   * jibe to reach it, VMC once she can lay it (by the laylines). No destination, no strip: the inset alone.
   * Each label's hover says it in full.
   */
  private navStrip(w: SimView, u: Boat): void {
    const el = $('navStrip'), race = !w.cruising;
    const m = !race ? (w.dest && w.arrivedT == null ? w.dest : null) : u.finished || u.retired ? null : w.nextMark(u);
    if (!m) { if (!el.hidden) { el.hidden = true; document.body.classList.remove('nav-on'); this.nsKey = ''; this.fitCompass(); } return; }
    const p = m.p, r = dist(u, p), b = brg(p.x - u.x, p.y - u.y), vmc = (u.vx * (p.x - u.x) + u.vy * (p.y - u.y)) / Math.max(1, r), ttg = vmc > 0.1 ? r / vmc : Infinity;
    const [n, un] = this.range(r), name = destName(m, race);
    const side = race ? (m.side === 's' ? ' <span class="s">▶ stbd</span>' : ' <span class="p">◀ port</span>') : '';
    const ttgS = !isFinite(ttg) ? '--' : ttg < 3600 ? `${Math.round(ttg / 60)}<small>min</small>` : `${(ttg / 3600).toFixed(1)}<small>h</small>`;
    // racing, VMG (straight up or down the wind) on a beat or a run, VMC (toward the mark) on a reach; cruising, VMC
    // VMG when she has to tack or jibe to reach the mark, VMC once she can lay it (the owner, 20 Nov 2026), by the
    // laylines the inset draws; a reach has none, and cruising is always VMC
    const L = race ? laylinesFor(w, u) : null, from = u.ww.from;
    const isG = !!L && L.mark.p === p && !canLay(b, from, L.kind, u.tack, [brg(L.tracks[0].x, L.tracks[0].y), brg(L.tracks[1].x, L.tracks[1].y)]);
    const toWind = V(from), vmg = isG ? (L!.kind === 'up' ? 1 : -1) * (u.vx * toWind.x + u.vy * toWind.y) : vmc;
    const brgS = `${String(Math.round(b) % 360).padStart(3, '0')}<small>°</small>`, vm = `${(vmg / KT).toFixed(1)}<small>kn</small>`;
    // racing, after the gun: the race's time first (the owner, 20 Nov: no timer card after the gun)
    const rt = race && w.t >= 0 ? fmtClock(w.t) : ''; setText($('nsRace'), rt); $('nsRaceC').hidden = !rt;
    const key = [rt.length, race, name, side, brgS, n, un, ttgS, vm, isG].join('|');
    if (key === this.nsKey) return; this.nsKey = key;
    $('nsLab').textContent = race ? 'Next' : 'To'; $('nsName').textContent = name; if (side) $('nsName').insertAdjacentHTML('beforeend', side);
    $('nsBrgC').title = race ? 'Bearing to the mark' : 'Bearing to the destination';
    $('nsBrg').innerHTML = brgS; $('nsDtw').innerHTML = `${n}<small>${un}</small>`;
    $('nsTtgC').hidden = race; $('nsTtg').innerHTML = ttgS;
    $('nsVmL').textContent = isG ? 'VMG' : 'VMC';
    $('nsVmC').title = isG ? 'Velocity made good: speed straight upwind (or downwind)' : `Velocity made on course: speed toward ${race ? 'the mark' : 'the destination'}`;
    $('nsVm').innerHTML = vm; $('nsVm').classList.toggle('good', vmg > 0.15);
    if (el.hidden) { el.hidden = false; document.body.classList.add('nav-on'); }
    this.fitCompass();
  }
  /** The compass bar one shape at every size (the owner, 20 Nov): 44 px tall, 560 wide, the same degrees to the pixel;
   *  narrower only when the nav strip (or the inset, with no strip) would otherwise reach it, and then only its width. */
  fitCompass(): void {
    const bar = $('compassBar'), s = $('navStrip'), right = (s.hidden ? $('map') : s).getBoundingClientRect().left;
    const mid = innerWidth / 2, left = $('hud').getBoundingClientRect().right;
    const half = Math.min(mid - left, right - mid) - 12;
    bar.style.width = Math.max(240, Math.min(560, Math.floor(2 * half))) + 'px';
  }
  /** Distance in the card's units: metres close in, nautical miles further off. */
  private range(m: number): [string, string] { return m < 0.2 * 1852 ? [m.toFixed(0), 'm'] : [(m / 1852).toFixed(m < 1852 * 10 ? 1 : 0), 'nm']; }

  /**
   * The "where next" card (the chase-view layout), top left: what's next and how far, in five states. Start line
   * (before the start: distance, time to the line, time to burn, the favoured end); Over early (red); Next mark (its
   * name, range, which side to leave it, the bearing); Finish; and, cruising, the Navigator (the destination, range,
   * speed made good toward it, the time at that rate). The transits go on its last line (transit()).
   */
  private lineBox(w: SimView, u: Boat): void {
    const el = $('linebox'), C = w.C;
    if (w.t >= 0 || u.finished) this.callEnds(w, false);
    if (u.finished) { $('nextCard').hidden = true; return; }
    if (w.cruising) { // (cruising, or retired from the race and heading home)
      // just sailing: how you're doing against the boat's target speed at this angle
      const vtU = polar(u.ww.kt, u.twa, sailPlan(u)), target = steadySpeed(vtU, v => seaDrag(u.sea, u.h, v), driveCurveFor(u.ww.kt, u.twa, vtU)), pct = target > 0.05 ? Math.round(100 * u.v / target) : 0;
      const vmg = u.v * Math.cos(u.twa * D2R) / KT;
      const speed = `Target ${(target / KT).toFixed(1)} kt at ${Math.round(u.twa)}° · you ${pct}%`;
      const d = w.dest;
      if (d && w.arrivedT == null) {
        // to the destination: range and bearing, your speed made good toward it over the ground (with the current), and how long at that rate
        const rng = dist(u, d.p), b = brg(d.p.x - u.x, d.p.y - u.y), vmc = (u.vx * (d.p.x - u.x) + u.vy * (d.p.y - u.y)) / Math.max(1, rng);
        // (the nav strip, top right, has it now: r272)
        void rng; void b; void vmc;
        if (!$('nextCard').hidden) { $('nextCard').hidden = true; this.cardKey = ''; }
        return;
      }
      // no destination, no card (the owner, 13 Nov: it only repeated the boat speed)
      if (!$('nextCard').hidden) { $('nextCard').hidden = true; this.cardKey = ''; }
      void speed; void vmg;
      return;
    }
    // the committee has called racing off (AP or N over A, signals.ts cancelSignal): that's what's next, whatever the leg
    if (w.cancelled) {
      const ab = w.cancelled.up[0] === 'N', img = (f: 'N' | 'AP' | 'A') => (this.flagUrl[f] ??= signalCanvas(f).toDataURL());
      this.card('ocs', ab ? 'Racing abandoned' : 'Racing postponed', ab ? 'N' : 'AP', 'over A',
        `<image href="${img(ab ? 'N' : 'AP')}" x="60" y="1" width="31" height="21" preserveAspectRatio="none"/><image href="${img('A')}" x="60" y="24" width="31" height="21" preserveAspectRatio="none"/>`);
      el.innerHTML = 'No more racing today · sail home'; // (the wind that called it off is in the message)
      $('ncTop').hidden = true;
      return;
    }
    if (w.t < 0 || u.ocs || !u.started) {
      const d = w.lineD(bow(u)), uN = Math.sin(u.h * D2R) * w.N.x + Math.cos(u.h * D2R) * w.N.y;
      // the end closer to the wind on the water is favored
      const k = dot(sub(w.pin, w.committee), V(u.ww.from)) / w.lineLen, deg = Math.asin(clamp(Math.abs(k), 0, 1)) / D2R;
      // (start practice: the favored end yours to find, shown at the gun; racing, shown once you've called it)
      const asking = w.t < 0 && (this.favAsk === 'ask' || (this.favAsk === 'race' && !this.favCall));
      const favEnd: 0 | 1 | -1 = asking || !w.settings.aids || deg < 2 ? -1 : k > 0 ? 0 : 1;
      // (the end favored now, kept for the call's verdict: the app reads the last one before the gun, so a shift after it
      // doesn't change the answer; till the gun the gold follows the end favored now. The owner, 20 Nov)
      if (w.t < 0) this.favNow = deg < 2 ? 'square' : k > 0 ? 'pin' : 'committee';
      // (one short line on the card, the owner: no degrees; the end's name only)
      const ends: [string, string] = [C.pinLabel.toUpperCase().split(' ')[0].slice(0, 8), C.committeeLabel.toUpperCase().split(' ')[0].slice(0, 8)];
      const callIx: 0 | 1 | -1 = this.favAsk === 'ask' && w.t < 0 && this.favCall ? (this.favCall === 'pin' ? 0 : 1) : -1;
      // (start practice: the call can change till the gun; racing, it stands once made, the gold showing the end)
      this.callEnds(w, w.t < 0 && (this.favAsk === 'ask' || (this.favAsk === 'race' && !this.favCall)));
      // the card's top row: the countdown (before the gun) and the flags flying
      setText($('ncTimer'), w.t < 0 ? fmtClock(w.t) : ''); $('ncTimerBox').hidden = w.t >= 0; $('ncTop').hidden = w.t >= 0 && !this.flagsUp;
      if (d > 0) {
        this.card('ocs', 'Over early', d.toFixed(0), 'm', this.lineSketch(w, u, ends, favEnd, true, uN < 0, callIx));
        el.innerHTML = w.t < 0 ? `Over by ${d.toFixed(0)} m · get back below the line` : u.roundEnd ? 'I flag: back round an end of the line' : 'OCS · dip back below the line and start';
        return;
      }
      // time to the line on this heading if you sheet in now: accelerating from your current speed, with the current
      const cN = u.cur.x * w.N.x + u.cur.y * w.N.y;
      const vtL = polar(u.ww.kt, u.twa, sailPlan(u)), tl = uN > 0.15 ? timeToCover(-d, u.v, vtL, uN, cN, 240, driveCurveFor(u.ww.kt, u.twa, vtL)) : Infinity;
      const tStr = isFinite(tl) ? `${tl.toFixed(0)} s to the line` : uN > 0.15 ? 'bear away to sail' : 'sailing away';
      const burn = w.t < 0 && isFinite(tl) ? ` · burn ${Math.max(0, -w.t - tl).toFixed(0)} s` : '';
      this.card(u.ocs ? 'ocs' : '', u.ocs ? 'Over early' : 'Start line', (-d).toFixed(0), 'm', this.lineSketch(w, u, ends, favEnd, false, uN > 0, callIx));
      // in the last minute, the time to burn matters more than which end is favoured
      // (no "sailing away" or favored-end words: the gold marks the end, the strip the way; the owner, 20 Nov)
      el.innerHTML = u.ocs ? 'You were over: now start properly' : isFinite(tl) ? tStr + (w.t > -60 ? burn : '') : '';
    } else {
      const m = w.nextMark(u), tgt = m ? m.p : w.center;
      const d = dist(u, tgt), b = brg(tgt.x - u.x, tgt.y - u.y), bs = String(Math.round(b)).padStart(3, '0'), [n, un] = this.range(d);
      if (m) {
        // (the next mark is the nav strip's now, top right: r272)
        void d; void bs; void n; void un;
        if (!$('nextCard').hidden) { $('nextCard').hidden = true; this.cardKey = ''; }
      } else {
        const ends: [string, string] = [C.pinLabel.toUpperCase().split(' ')[0].slice(0, 8), C.committeeLabel.toUpperCase().split(' ')[0].slice(0, 8)];
        const near = dist(u, w.pin) < dist(u, w.committee) ? 0 : 1;
        this.card('', 'Finish line', n, un, this.lineSketch(w, u, ends, near, false, true));
        $('ncTop').hidden = true;
        el.innerHTML = `Bearing ${bs}° · the ${near === 0 ? C.pinLabel : C.committeeLabel} end is closer`;
      }
    }
  }

  private dial(u: Boat): void {
    const [ctx, w, h] = fitCanvas(this.dialC), cx = w / 2, cy = h / 2, R = w / 2 - 6;
    ctx.clearRect(0, 0, w, h);
    const a0 = (u.rel - 90) * D2R, ba = beatFor(u) * D2R;
    // no-go zone: inside the close-hauled angle
    ctx.fillStyle = 'rgba(255,93,76,.22)';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0 - ba, a0 + ba); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(150,196,218,.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 36; i++) { const a = i * 10 * D2R, r1 = i % 9 === 0 ? R - 7 : R - 3; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); }
    ctx.fillStyle = '#e9f2f5';
    const s = R / 30;
    ctx.beginPath(); ctx.moveTo(cx, cy - 13 * s); ctx.quadraticCurveTo(cx + 5 * s, cy - 4 * s, cx + 3.5 * s, cy + 11 * s); ctx.lineTo(cx - 3.5 * s, cy + 11 * s); ctx.quadraticCurveTo(cx - 5 * s, cy - 4 * s, cx, cy - 13 * s); ctx.fill();
    const ax = cx + Math.cos(a0) * (R - 2), ay = cy + Math.sin(a0) * (R - 2), bx = cx + Math.cos(a0) * (R * 0.45), by = cy + Math.sin(a0) * (R * 0.45);
    ctx.strokeStyle = '#ffb627'; ctx.fillStyle = '#ffb627'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    const pa = Math.atan2(by - ay, bx - ax);
    ctx.beginPath(); ctx.moveTo(bx + Math.cos(pa) * 4, by + Math.sin(pa) * 4); ctx.lineTo(bx - Math.cos(pa - 0.5) * 9, by - Math.sin(pa - 0.5) * 9); ctx.lineTo(bx - Math.cos(pa + 0.5) * 9, by - Math.sin(pa + 0.5) * 9); ctx.fill();
    ctx.fillStyle = '#94abb7'; ctx.font = '600 10px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'center';
    // her point of sail, as the windex shows it (the owner: the dial names it); also on the canvas for the checks
    // (the element's own words only when they change: a write a frame restyles the page every frame)
    const pos = pointOfSailWord(u), lab = `Wind angle dial: ${pos}, true wind ${Math.round(u.twa)}°, apparent ${Math.round(u.awa)}°`;
    if (this.dialC.dataset.pos !== pos) this.dialC.dataset.pos = pos;
    if (this.dialC.getAttribute('aria-label') !== lab) this.dialC.setAttribute('aria-label', lab);
    ctx.fillStyle = '#e9f2f5'; ctx.font = '700 10px "Saira Semi Condensed", sans-serif'; ctx.fillText(pos, cx, cy - R * 0.5);
    ctx.fillStyle = '#94abb7'; ctx.font = '600 10px "Saira Semi Condensed", sans-serif';
    ctx.fillText('TWA ' + Math.round(u.twa) + '°', cx, cy + R * 0.56);
    ctx.fillText('AWA ' + Math.round(u.awa) + '°', cx, cy + R * 0.8);
  }

  private map(wd: SimView, u: Boat): void {
    const [ctx, w, h] = fitCanvas(this.mapC);
    ctx.clearRect(0, 0, w, h);
    const nav = this.insetView === 'nav' && wd.cruising ? this.navPassage(wd) : null;
    const W = nav ? 0 : insetRotation(wd);
    let tf: Tf, scale: number, ctr = { x: u.x, y: u.y };
    if (nav) { // the navigator's view: her course to the destination, whole, north up, round the circle's middle
      const pts = [{ x: u.x, y: u.y }, ...nav.track.map(q => q.p), wd.dest!.p], xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      ctr = { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 };
      const span = Math.max(400, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 1.15);
      scale = Math.min(w, h) / span; tf = makeTf(ctr.x, ctr.y, 0, scale, w, h);
    } else if (this.mapZoom) { scale = Math.min(w, h) / 220; tf = makeTf(u.x, u.y, W, scale, w, h); }
    else if (wd.freeSail) { scale = Math.min(w, h) / 2800; tf = makeTf(u.x, u.y, W, scale, w, h); } // just sailing: the water around you, about 1.5 nm across
    else {
      const pts = [wd.pin, wd.committee].concat(wd.C.marks.map(m => m.p));
      const rot = (p: { x: number; y: number }) => { const r = Math.hypot(p.x, p.y), be = Math.atan2(p.x, p.y) - W * D2R; return { x: Math.sin(be) * r, y: Math.cos(be) * r }; };
      const rp = pts.map(rot), xs = rp.map(p => p.x), ys = rp.map(p => p.y);
      const spanX = Math.max(...xs) - Math.min(...xs) + 160, spanY = Math.max(...ys) - Math.min(...ys) + 160;
      scale = Math.min(w / spanX, h / spanY);
      const mcx = (Math.max(...xs) + Math.min(...xs)) / 2, mcy = (Math.max(...ys) + Math.min(...ys)) / 2;
      const back = { x: Math.sin(Math.atan2(mcx, mcy) + W * D2R) * Math.hypot(mcx, mcy), y: Math.cos(Math.atan2(mcx, mcy) + W * D2R) * Math.hypot(mcx, mcy) };
      tf = makeTf(back.x, back.y, W, scale, w, h); ctr = back;
    }
    this.insetPlan = nav; // (chartBody draws her course with it: drawSailing)
    this.chartBody(ctx, w, h, wd, u, tf, scale, ctr, W, this.mapZoom, 'inset');
    this.insetPlan = null;
    const day = (this.shown(wd).chartPal ?? 'day') === 'day', I = INK[day ? 'day' : 'dusk'];
    // the map's own words, each on a halo so it reads over the chart
    const say = (t: string, x: number, y: number, align: CanvasTextAlign) => { ctx.textAlign = align; ctx.lineJoin = 'round'; ctx.strokeStyle = I.halo; ctx.lineWidth = 3; ctx.strokeText(t, x, y); ctx.fillStyle = I.text; ctx.fillText(t, x, y); };
    ctx.font = '600 9px "Saira Semi Condensed", sans-serif';
    const lab = nav ? 'NAVIGATOR' : W === 0 && wd.freeSail ? 'NORTH UP' : 'WIND ↓';
    // (the inset is a circle: the label and the north arrow go at its top middle, inside the rim, where it's widest
    // enough for them, clear of the layers button on its upper left; racing, wind up, the next mark often lands there, so
    // they step aside, left or right along the rim, off any mark or boat under them: chart audit #9)
    const tw = ctx.measureText(lab).width, ly0 = 26, bw = tw + 22;
    const R = Math.min(w, h) / 2 - 6, under = [...(wd.freeSail ? [] : [...wd.C.marks.map(m => m.p), wd.C.pin, wd.C.committee]), ...wd.boats.map(b => ({ x: b.x, y: b.y }))].map(q => {
      const [x, y] = tf(q.x, q.y), dx = x - w / 2, dy = y - h / 2, d = Math.hypot(dx, dy); // (one off the map is shown on its rim)
      return d > R ? [w / 2 + dx / d * R, h / 2 + dy / d * R] : [x, y]; });
    // (and NOAA's buoys inside the inset, the yellow ones by the line: those off it aren't drawn; chart audit #9)
    for (const q of encAidPoints()) { const [x, y] = tf(q.x, q.y); if (Math.hypot(x - w / 2, y - h / 2) < R) under.push([x, y]); }
    const free = (x0: number) => !under.some(([x, y]) => x > x0 - 10 && x < x0 + bw + 10 && y > ly0 - 22 && y < ly0 + 10);
    const lx0 = [w / 2 - bw / 2, w / 2 - bw / 2 - bw * 0.75, w / 2 - bw / 2 + bw * 0.75].find(free) ?? w / 2 - bw / 2;
    say(lab, lx0, ly0, 'left');
    // north, as the map's turned (wind up in a race): a small arrow by the label, so a westerly's map isn't read as north-up
    { const a = northOnMap(W), nx = lx0 + tw + 14, ny = ly0 - 3;
      ctx.save(); ctx.translate(nx, ny); ctx.rotate(a); ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4, 4); ctx.lineTo(0, 2); ctx.lineTo(-4, 4); ctx.closePath();
      ctx.strokeStyle = I.halo; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = I.text; ctx.fill(); ctx.restore();
      const t = (k: number) => [nx + Math.sin(a) * k, ny - Math.cos(a) * k]; const [lx, ly] = t(13); say('N', lx, ly + 3, 'center'); }
    const fog = this.fogNote(wd, true);
    // (the inset is a circle now: its labels go at the bottom middle, inside it, not in the corners)
    if (fog) say(fog, w / 2, h - 10, 'center');
    // with the wind or the current on: what's on the water where you are, the layer's own first (as the chart's readout)
    const kind = this.drawn.inset?.kind;
    if (nav) { // the navigator's view: how far she has to sail, and when she'd get there
      const y = h - 34 - (fog ? 12 : 0), turns = nav.tacks.length + nav.gybes.length;
      ctx.font = '700 11px "Saira Semi Condensed", sans-serif';
      say(nav.ok ? `${(nav.sailedM / 1852).toFixed(1)} NM · ARRIVE ${clockOf(nav.eta!)}${turns ? ` · ${nav.tacks.length ? `${nav.tacks.length} TACK${nav.tacks.length > 1 ? 'S' : ''}` : `${nav.gybes.length} JIBE${nav.gybes.length > 1 ? 'S' : ''}`}` : ''}` : 'CAN\'T GET THERE FROM HERE', w / 2, y, 'center');
    } else if (kind) {
      const [a, b] = readout(wd, kind, u, u.ww, u.cur), y = h - 34 - (fog ? 12 : 0);
      ctx.font = '700 11px "Saira Semi Condensed", sans-serif'; say(a.toUpperCase(), w / 2, y, 'center');
      ctx.font = '600 9px "Saira Semi Condensed", sans-serif'; say(b.toUpperCase(), w / 2, y + 12, 'center');
    }
  }

  /**
   * The full-screen chart (ui/chart.ts): north up, centred on (cx, cy) at `scale` px/m, with the places' names, and the
   * spot you've picked. Same picture as the inset map: land, wind, puffs, current, the course or your destination, boats, ships.
   */
  drawChart(c: HTMLCanvasElement, wd: SimView, cx: number, cy: number, scale: number, pick: Vec | null, opts: { cornerFree?: boolean } = {}): void {
    const pal = this.shown(wd).chartPal ?? 'day', [ctx, w, h] = fitCanvas(c), u = wd.user, tf = makeTf(cx, cy, 0, scale, w, h), I = INK[pal];
    // the places' names go over the chart: its own print keeps clear of them
    ctx.font = '600 11px "Saira Semi Condensed", sans-serif';
    const avoid = PLACES.filter(pl => pl.buoy && scale > 0.12).map(pl => { const q = tf(pl.p.x, pl.p.y); return [q[0] - 4, q[1] - 18, ctx.measureText(pl.name).width + 14, 22] as [number, number, number, number]; });
    const me = tf(u.x, u.y); avoid.push([me[0] - 26, me[1] - 26, 52, 52]); // (and clear of your boat)
    // north and the wind: on the full chart at its top right, under the field picker; on the setup's small chart just left
    // of the expand icon, or, with her boat or the destination under them there, at its top left: the wind's label never
    // on her (chart audit #11); the chart's print keeps clear of them
    { const busy = (x: number) => [me, ...(wd.dest ? [tf(wd.dest.p.x, wd.dest.p.y)] : [])].some(([bx, by]) => Math.abs(bx - x) < 48 && by < 130);
      this.northX = opts.cornerFree ? (busy(w - 72) && !busy(48) ? 48 : w - 72) : w - 28;
      avoid.push(opts.cornerFree ? [this.northX - 34, 6, 68, 116] : [w - 84, 64, 80, 118]); } // (the full chart's too, so its print isn't under "WIND n KT": chart audit #2)
    // the chart's own panels over it, the Layers panel, the field picker and Day | Dusk, the passage line, the info box: the
    // names keep clear of them, the sim's and the chart's own print alike (chart audit #1)
    const panels: [number, number, number, number][] = [];
    if (c.id === 'chartC' && typeof document !== 'undefined') { const cr = c.getBoundingClientRect();
      for (const id of ['chartLayersPanel', 'chartField', 'chartPal', 'chartPlan', 'chartInfo']) { const e = document.getElementById(id); if (!e || e.hidden || !e.offsetParent) continue;
        const r = e.getBoundingClientRect(); if (r.width && r.height) panels.push([r.left - cr.left - 4, r.top - cr.top - 4, r.width + 8, r.height + 8]); } }
    avoid.push(...panels);
    this.chartBody(ctx, w, h, wd, u, tf, scale, { x: cx, y: cy }, 0, true, 'chart', avoid);
    // the places, by name
    ctx.font = '600 11px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'left';
    const placed: [number, number, number, number][] = [[me[0] - 26, me[1] - 26, 52, 52]]; // (your boat's spot is kept clear of names)
    placed.push(...panels); // (and the chart's own panels: chart audit #1)
    for (const pl of PLACES) {
      if (!pl.buoy) continue; // (the spots, 'Off Crissy Field' and the rest, are no longer on the chart: owner, 20 Nov 2026)
      const q = tf(pl.p.x, pl.p.y); if (q[0] < -50 || q[0] > w + 50 || q[1] < -20 || q[1] > h + 20) continue;
      // (the sim's own places: the racing marks in amber, under the chart's print)
      if (!pl.buoy) { ctx.fillStyle = I.text; ctx.beginPath(); ctx.arc(q[0], q[1], 2.5, 0, 6.29); ctx.fill(); }
      const bw = ctx.measureText(pl.name).width; // (zoomed out, the names would pile up: each only where it fits)
      if (q[1] - 17 < 0 || q[0] + 6 + bw > w) continue; // (not cut by the chart's edge: chart audit #1)
      if (placed.some(b => q[0] + 6 < b[0] + b[2] && q[0] + 6 + bw > b[0] && q[1] - 17 < b[1] + b[3] && q[1] - 3 > b[1])) continue;
      placed.push([q[0] + 6, q[1] - 17, bw, 14]);
      if (scale > 0.12 || !pl.buoy) { ctx.lineJoin = 'round'; ctx.strokeStyle = I.halo; ctx.lineWidth = 3; ctx.strokeText(pl.name, q[0] + 6, q[1] - 6); ctx.fillStyle = pl.buoy ? (pal === 'day' ? '#c24a00' : I.mark) : I.text; ctx.fillText(pl.name, q[0] + 6, q[1] - 6); }
    }
    if (pick) { // the spot you've picked: a ring, and the line from you to it
      const a = tf(u.x, u.y), b = tf(pick.x, pick.y);
      ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = I.pick; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = I.pick; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(b[0], b[1], 9, 0, 6.29); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b[0] - 14, b[1]); ctx.lineTo(b[0] + 14, b[1]); ctx.moveTo(b[0], b[1] - 14); ctx.lineTo(b[0], b[1] + 14); ctx.stroke();
    }
    // the fog layer: what visibility it shows, in one short line under the Layers panel (top left), with whose it is and the
    // caveats behind a hover (chart.ts reads fogCaption); the wind shadows note below it (the owner, 20 Nov 2026)
    this.fogCaption = null;
    let capY = 156;
    const cap = (text: string, tip: string) => {
      ctx.font = '600 11px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'left';
      const fw = ctx.measureText(text).width; ctx.fillStyle = I.halo; ctx.fillRect(10, capY, fw + 12, 18);
      ctx.fillStyle = I.text; ctx.fillText(text, 16, capY + 13);
      if (!this.fogCaption) this.fogCaption = { text, tip, rect: [10, capY, 10 + fw + 12, capY + 18] }; capY += 22;
    };
    const fogShort = this.fogNote(wd, true);
    if (fogShort) cap(fogShort, this.fogNote(wd, false) ?? '');
    // the wind shadows switched on with none in view: say so, so the switch isn't taken for broken
    if (this.shadowNone.chart) cap('NO WIND SHADOWS HERE', 'Wind shadows: nothing upwind casts one here (land, boats, ships, piers)');
    // north, the wind, and a scale bar
    ctx.fillStyle = I.text; ctx.font = '700 12px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'center';
    // (`cornerFree`: the top-right corner left for the setup chart's expand icon, north and the wind just left of it)
    // (the full chart's top-right corner is the field picker's and Day | Dusk: north and the wind go just under them)
    const nx = this.northX, dy = opts.cornerFree ? 0 : 56;
    ctx.fillText('N', nx, 22 + dy); ctx.beginPath(); ctx.moveTo(nx, 28 + dy); ctx.lineTo(nx + 5, 42 + dy); ctx.lineTo(nx - 5, 42 + dy); ctx.closePath(); ctx.fill();
    const wf = wd.wind.from * D2R, ox = nx, oy = 80 + dy;
    ctx.strokeStyle = '#ffb627'; ctx.fillStyle = '#ffb627'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(ox + Math.sin(wf) * 18, oy - Math.cos(wf) * 18); ctx.lineTo(ox - Math.sin(wf) * 12, oy + Math.cos(wf) * 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox - Math.sin(wf) * 18, oy + Math.cos(wf) * 18); ctx.lineTo(ox - Math.sin(wf) * 10 + Math.cos(wf) * 6, oy + Math.cos(wf) * 10 + Math.sin(wf) * 6); ctx.lineTo(ox - Math.sin(wf) * 10 - Math.cos(wf) * 6, oy + Math.cos(wf) * 10 - Math.sin(wf) * 6); ctx.closePath(); ctx.fill();
    ctx.font = '600 10px "Saira Semi Condensed", sans-serif';
    // (on a halo, like the chart's other overlays, and, on the full chart, kept inside its right edge: centered on the arrow
    // 28 px in, it ran off it and into the chart's own names; chart audit #2)
    { const t = `WIND ${Math.round(wd.wind.kt)} KT`, tx = opts.cornerFree ? ox - 6 : w - 8; ctx.save(); ctx.textAlign = opts.cornerFree ? 'center' : 'right'; ctx.lineJoin = 'round'; ctx.strokeStyle = I.halo; ctx.lineWidth = 3; ctx.strokeText(t, tx, oy + 34); ctx.fillText(t, tx, oy + 34); ctx.restore(); }
    const nmPx = 1852 * scale, bar = nmPx > 240 ? nmPx / 10 : nmPx > 120 ? nmPx / 2 : nmPx, lab = nmPx > 240 ? '0.1 nm' : nmPx > 120 ? '0.5 nm' : '1 nm';
    // (on a halo, so a ship or the chart's print under it doesn't swallow it: chart audit #10)
    // (and above NOAA's credit line where that reaches across under it, on the setup's narrow chart: chart audit #11)
    ctx.save(); ctx.font = '9px "Saira Semi Condensed", sans-serif'; const crW = ctx.measureText(chartCredit()).width; ctx.font = '600 10px "Saira Semi Condensed", sans-serif';
    const sbW = bar + ctx.measureText(lab).width + 18, lift = w - crW - 16 < 10 + sbW + 4 ? 18 : 0; ctx.fillStyle = I.halo; ctx.fillRect(10, h - 28 - lift, sbW, 20); ctx.restore();
    ctx.save(); ctx.translate(0, -lift);
    ctx.strokeStyle = I.text; ctx.fillStyle = I.text; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(16, h - 18); ctx.lineTo(16 + bar, h - 18); ctx.moveTo(16, h - 23); ctx.lineTo(16, h - 13); ctx.moveTo(16 + bar, h - 23); ctx.lineTo(16 + bar, h - 13); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillText(lab, 20 + bar, h - 14); ctx.restore();
    ctx.font = '9px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'right';
    const cw = ctx.measureText(chartCredit()).width; ctx.fillStyle = I.deep; ctx.globalAlpha = 0.85; ctx.fillRect(w - cw - 16, h - 19, cw + 12, 15);
    ctx.fillStyle = I.text; ctx.globalAlpha = 1; ctx.fillText(chartCredit(), w - 10, h - 8);
    const kind = this.drawn.chart?.kind; if (kind && h >= 420 && w >= 600) drawLegend(ctx, kind, w / 2, h - 40); // (the colours' scale, in kt: not on the setup's small chart, where it would cover it)
  }

  /** The inset's overlay (the streaks were drawn on it; they're the full chart's only now). */
  /** what the streaks cost (ms of JS a frame, smoothed), the inset's and the chart's: for the frame-cost check */
  fxMs = { inset: 0, chart: 0 };
  private insetStreaks(dt: number): void {
    const t0 = performance.now(); this.insetStreaks0(dt); this.fxMs.inset += (performance.now() - t0 - this.fxMs.inset) * 0.05;
  }
  private insetStreaks0(_dt: number): void {
    // (the streaks are the full chart's only, the owner, 13 Nov 2026: the inset's overlay is put away, once. It was
    // placed over the map every half second, then sized (a read of its layout, forced just after that write) and cleared
    // every frame, empty: work for nothing on every frame, under the inset that the owner saw lagging, 15 Nov 2026)
    if (!this.mapFx.hidden) { this.mapFx.hidden = true; this.mapFx.style.display = 'none'; }
  }

  /** The chart's streaks and the readout under the cursor, every frame while it's open, on its overlay. */
  chartFx(fx: HTMLCanvasElement, wd: SimView, dt: number, cursor: [number, number] | null): void {
    const t0 = performance.now(); this.chartFx0(fx, wd, dt, cursor); this.fxMs.chart += (performance.now() - t0 - this.fxMs.chart) * 0.05;
  }
  private chartFx0(fx: HTMLCanvasElement, wd: SimView, dt: number, cursor: [number, number] | null): void {
    const [ctx, w, h] = fitCanvas(fx); ctx.clearRect(0, 0, w, h);
    const d = this.drawn.chart; if (!d?.kind) return;
    this.streaks[d.kind].draw(ctx, d.tf, w, h, d.scale, this.flowField[d.kind], d.kind, dt, 1.4);
    if (cursor) {
      const o = d.tf(0, 0), ex = d.tf(1, 0), ey = d.tf(0, 1), a = ex[0] - o[0], b = ex[1] - o[1], c = ey[0] - o[0], e = ey[1] - o[1], det = a * e - b * c;
      const X = cursor[0] - o[0], Y = cursor[1] - o[1], p = { x: (e * X - c * Y) / det, y: (-b * X + a * Y) / det };
      if (!onLand(p)) drawReadout(ctx, readout(wd, d.kind, p), cursor[0], cursor[1], w);
    }
  }

  /** The sea state, remembered for ten seconds of the race at each spot (it's worked out from the wind, current and fetch). */
  private seaCache = new Map<string, SeaHere>(); private seaT = -1;
  private seaAt(wd: SimView, p: Vec): SeaHere | null {
    if (wd.sea.flat) return null;
    const tb = Math.floor(wd.t / 10); if (tb !== this.seaT) { this.seaCache.clear(); this.seaT = tb; }
    if (onLand(p)) return null;
    const k = `${Math.round(p.x)},${Math.round(p.y)}`; let v = this.seaCache.get(k);
    if (!v) { v = wd.seaHere(p); if (this.seaCache.size > 5000) this.seaCache.clear(); this.seaCache.set(k, v); }
    return v;
  }

  /** The chart's fog caption as last drawn (canvas pixels), its source and caveats as the hover's text (ui/chart.ts). */
  fogCaption: { text: string; tip: string; rect: [number, number, number, number] } | null = null;
  /** The fog layer's line of words: the visibility here and whose it is, or why there's none. */
  fogNote(wd: SimView, short: boolean): string | null {
    if (!layerOn(this.display ? this.shown(wd) : wd.settings as Settings, 'fog')) return null; // (the page's own layers when set; the race's otherwise)
    // the visibility where she is: the fog and rain you've set, when they close it in (owner: her own, not Pier 17's)
    // (the rain falling: the panel's, or the record's, environment/rain.ts)
    const rl = rainLevel(wd.settings.rain, wd.clockUtc), rainReal = typeof wd.settings.rain !== 'number';
    const set = setVisibility({ fog: wd.settings.fog, rain: rl }), why = set.fogSet && rl ? 'fog and rain' : set.fogSet ? 'fog' : 'rain';
    const here = (m: number) => rainReal && !set.fogSet
      ? (short ? `VIS ${nm(m).toUpperCase()} HERE · RAIN` : `Visibility ${nm(m)} here, in the ${rainAt(wd.clockUtc).says}.`)
      : (short ? `VIS ${nm(m).toUpperCase()} HERE · ${why.toUpperCase()} SET` : `Visibility ${nm(m)} here, in the ${why} you've set.`);
    if (set.fogSet) return here(set.m);
    const v = visibilityFor(wd.raceDate, wd.clockUtc);
    if (Number.isFinite(set.m)) { const real = 'none' in v || v.source === 'outlook' ? Infinity : v.source === 'observed' ? v.points[0].m : v.at(wd.user); if (!(real < set.m)) return here(set.m); }
    if ('none' in v) return short ? (v.noFog ? 'NO FOG FORECAST · NWS' : 'FOG: NO DATA') : `Fog: ${v.none}`;
    if (v.source === 'observed') { const m = v.points[0].m; return short ? `VIS ${nm(m, v.cap).toUpperCase()} AT PIER 17` : `Visibility ${nm(m, v.cap)} at Pier 17: ${v.says}.`; }
    if (v.source === 'outlook') { const w = v.words!(wd.user); return short ? (w ? `${w.toUpperCase()} · NWS` : w === '' ? 'NO FOG HERE · NWS' : 'FOG: OFF THE GRID') : `${w ? w[0].toUpperCase() + w.slice(1) : w === '' ? 'No fog' : 'Nothing'} here: ${v.says}.`; }
    const m = v.at(wd.user);
    if (!Number.isFinite(m)) return short ? 'FOG: OFF THE NWS GRID' : `Fog: you're beyond the NWS forecast grid (${v.says}).`;
    return short ? `VIS ${nm(m, v.cap).toUpperCase()} · NWS` : `Visibility ${nm(m, v.cap)} here: ${v.says}.`;
  }


  /** What each map drew last, for its key (ui/legend.ts). */
  private keyState: Partial<Record<'inset' | 'chart', { sim: SimKey[]; pal: ChartPalette; scale: number }>> = {};
  /** Fill a layers list's key with what's on that map now (rebuilt only when that changes, unless `force`). */
  keyInto(el: HTMLElement, detail: 'inset' | 'chart', force: boolean): void {
    const k = this.keyState[detail]; if (!k) return;
    const sig = keySig(k.sim, SEEN[detail], k.pal);
    if (!force && el.dataset.sig === sig) return;
    renderKey(el, k.sim, SEEN[detail], k.pal, detail, k.scale); el.dataset.sig = sig;
  }

  private chartBody(ctx: CanvasRenderingContext2D, w: number, h: number, wd: SimView, u: Boat, tf: Tf, scale: number, ctr: Vec, W: number, labels: boolean, detail: 'inset' | 'chart', avoid: [number, number, number, number][] = []): void {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    const S = this.shown(wd), pal = S.chartPal ?? 'day', I = INK[pal], on = (k: LayerKey) => layerOn(S, k), half = Math.max(w, h) / scale * 0.75;
    drawEncChart(ctx, tf, scale, w, h, pal, detail, avoid); // NOAA's chart underneath everything the sim draws
    // one field layer at a time (ui/layers.ts fieldLayer): the wind or the current as colour for its speed, with moving
    // streaks over it (drawn every frame on the map's overlay: insetStreaks, chartFx); the sea state; or the fog
    const field = fieldLayer(S), kind: FlowKind | null = field === 'wind' || field === 'current' ? field : null;
    if (field === 'sea' && detail === 'chart') drawSea(ctx, tf, p => this.seaAt(wd, p), ctr, half, I, detail === 'chart');
    this.drawn[detail] = { tf, w, h, scale, kind };
    // (before she leaves, in the setup and the planner: the course she'd sail leaving now, tacks, gybes and all, and the
    // laylines she'd sail into the destination on, from the same passage: sim/navigator.ts passageNow)
    const plan = detail === 'inset' ? this.insetPlan ?? (wd.freeSail && !wd.running && wd.dest ? passageLive(wd) : null) : wd.freeSail && wd.dest ? (wd.running ? this.navPassage(wd) : passageLive(wd)) : null;
    const fog = field === 'fog' && detail === 'chart' ? visibilityFor(wd.raceDate, wd.clockUtc) : null; // (the inset gives fog in words only)
    const L = plan && wd.dest ? (plan.laylines ? { mark: wd.dest, kind: plan.laylines.kind === 'beat' ? 'up' as const : 'down' as const, tracks: plan.laylines.tracks } : null) : laylinesFor(wd, u);
    // what this map shows, for its key
    const sim: SimKey[] = ['you'];
    if (wd.boats.length > 1) sim.push('boats');
    if (!wd.freeSail) { sim.push('start', 'marks'); if (u.leg < wd.C.marks.length) sim.push('next'); }
    else if (wd.dest) sim.push('dest', 'destline', ...(plan && plan.track.length > 1 ? ['track' as const] : [])); // (her course, listed whenever it's drawn: under way too, once the plan's in; chart audit #8)
    if (on('laylines') && L) sim.push('laylines');
    if (on('ships') && wd.vessels.length) sim.push('ships');
    // (the field layers, the wind's and the current's colours and streaks, the sea state, the fog, are on the full chart
    // only: the owner, 13 Nov 2026, "they shouldn't be present on the inset map, just the expanded map". The inset stays
    // calm and plain, and keeps its readout of the wind, the current and the fog where you are.)
    const flowHere = kind && detail === 'chart';
    if (flowHere && kind === 'current') sim.push('current');
    if (flowHere && kind === 'wind') sim.push('wind'); // (the puffs and lulls are in its colours: ui/flow.ts)
    if (field === 'sea' && detail === 'chart' && !wd.sea.flat) sim.push('sea');
    if (fog && !('none' in fog)) sim.push('fog');
    // (the shadows, sampled below: in the key only when there's one in view)
    const shadowsOn = on('shadows');
    this.keyState[detail] = { sim, pal, scale }; // (the shadows add themselves when drawn, below: the key reads this list when asked)
    // (the fog and rain set in the conditions replace the record's fog, as the caption says: one veil over the whole chart)
    const setNow = field === 'fog' && detail === 'chart' ? { fog: wd.settings.fog, rain: rainLevel(wd.settings.rain, wd.clockUtc) } : null, setFog = !!setNow && setFogAlpha(setNow) > 0.02;
    if (setFog) sim.push('fog');
    if (setFog) drawSetFog(ctx, w, h, I, setNow!);
    else if (fog && !('none' in fog)) drawFog(ctx, tf, fog, ctr, half, I, detail === 'chart');
    drawEncLand(ctx, tf, pal);
    // the wind's or the current's colours, over the land's edge as the mock-up had them (a soft glow along the shore),
    // every 10 s of the clock (the chart's paused); the full chart's only
    if (flowHere) this.flowField[kind].draw(ctx, tf, w, h, scale, wd, kind, 0.6, 14, 10);
    // (and the other kinds' fields built while the page is idle, for this view: switched on, they're drawn at once)
    if (detail === 'chart') this.warmFields(tf, w, h, scale, wd, kind);
    if (!setFog && fog && !('none' in fog)) drawFog(ctx, tf, fog, ctr, half, I, detail === 'chart', 'marks');
    if (wd.freeSail) {
      drawSailing(ctx, tf, wd.dest, u, w, h, I, plan);
      // the navigator's layer (the owner's, 17 Nov 2026): on the full chart, and on the inset in its navigator's view
      if (wd.dest && plan && (detail === 'chart' || this.insetPlan)) drawNavLayer(ctx, tf, wd.dest, plan, this.navPlan(wd), I, detail === 'chart');
      // a lesson's buoy (the tiller: steer for it), a filled yellow dot while it's the one to reach
      if (wd.lesson?.buoy && wd.lesson.step === 0) { const s = tf(wd.lesson.buoy.x, wd.lesson.buoy.y); ctx.fillStyle = I.halo; ctx.beginPath(); ctx.arc(s[0], s[1], 6, 0, 6.29); ctx.fill(); ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(s[0], s[1], 4, 0, 6.29); ctx.fill(); }
    } else drawCourse(ctx, wd.C, !!S.aids, tf, scale, u.leg < wd.C.marks.length ? u.leg : -1, I);
    if (on('laylines')) drawLaylines(ctx, tf, L, wd.freeSail ? 2500 : 450, 1.2, I);
    if (detail === 'chart') { drawEncNamesAgain(ctx, pal); drawEta(ctx, I); } // (NOAA's names and the ETA over the sim's lines, on a halo: chart audit #4)
    else etaLabel = null;
    // ships and ferries: their hull to scale (at least a few pixels), a heading line, and the name when zoomed in
    if (on('ships')) for (const v of wd.vessels) {
      const ty = VESSEL[v.kind], u2 = V(v.h), a = tf(v.x + u2.x * ty.len / 2, v.y + u2.y * ty.len / 2), b2 = tf(v.x - u2.x * ty.len / 2, v.y - u2.y * ty.len / 2);
      const bw = Math.max(3.5, ty.beam * scale);
      ctx.lineCap = 'round';
      ctx.strokeStyle = I.shipHalo; ctx.lineWidth = bw + 3; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke();
      ctx.strokeStyle = I.ship; ctx.lineWidth = bw; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke(); ctx.lineCap = 'butt';
      if (v.moving) { const f = tf(v.x + u2.x * (ty.len / 2 + v.v * 60), v.y + u2.y * (ty.len / 2 + v.v * 60)); ctx.strokeStyle = I.ship; ctx.globalAlpha = PEN.ahead.alpha; ctx.lineWidth = PEN.ahead.w; ctx.setLineDash(PEN.ahead.dash); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(f[0], f[1]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      if (labels) { ctx.font = '600 9px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'left'; ctx.lineWidth = 3; ctx.strokeStyle = I.shipHalo; const lx = (a[0] + b2[0]) / 2 + 6, ly = (a[1] + b2[1]) / 2 - 6; ctx.strokeText(ty.name, lx, ly); ctx.fillStyle = I.shipText; ctx.fillText(ty.name, lx, ly); }
    }
    // the wind shadows (the owner: "toggling wind shadow doesn't do anything that I can see": it was a 60 m cone behind
    // each boat, a few pixels on the chart, and off when cruising): the lee of land, boats, ships, the committee boat
    // and the bridge piers, from the race's own wind, so the map and the sails agree; the inset's every 2 s of race time
    if (shadowsOn) {
      const L = this.shadows[detail]; L.draw(ctx, tf, w, h, wd, detail === 'chart' ? 8 : 6, detail === 'chart' ? 0.5 : 2);
      if (L.maxDeficit >= 0.05) sim.push('shadows');
      this.shadowNone[detail] = L.maxDeficit < 0.05;
    } else this.shadowNone[detail] = false;
    // the boats: each in her colour with a halo and a dark edge, so she reads on any part of the chart; you bigger, in cyan
    // (bigger on the full chart, and bigger still zoomed out, where everything else shrinks round her)
    const big = detail === 'chart' ? (scale < 0.1 ? 1.6 : 1.25) : 1;
    for (const b of [...wd.boats].sort((x, y) => (x.isUser ? 1 : 0) - (y.isUser ? 1 : 0))) {
      const p = tf(b.x, b.y), s = (b.isUser ? 6.5 : 4.5) * big;
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate((b.h - W) * D2R); ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(0, -s * 1.6); ctx.lineTo(s * 0.8, s); ctx.lineTo(-s * 0.8, s); ctx.closePath();
      ctx.strokeStyle = I.halo; ctx.lineWidth = b.isUser ? 5 : 3.5; ctx.stroke();
      ctx.fillStyle = b.isUser ? I.you : b.color; ctx.fill();
      ctx.strokeStyle = I.edge; ctx.lineWidth = b.isUser ? 1.6 : 1.1; ctx.stroke();
      ctx.restore();
      if (b.isUser) { ctx.strokeStyle = I.you; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p[0], p[1], s * 2.3, 0, 6.29); ctx.stroke(); } // a ring round you
    }
    ctx.restore();
  }

}

/**
 * The course she'd sail (sim/navigator.ts passageNow): her track over the ground, solid, with a small mark where she
 * tacks (a triangle pointing into the wind's side) and where she gybes (a circle), so the beats and runs show as the
 * zigzags they are.
 */
function drawTrack(ctx: CanvasRenderingContext2D, tf: Tf, plan: PassageNow, I: Ink): void {
  const pts = plan.track.map(q => tf(q.p.x, q.p.y));
  const path = () => { ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); };
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = I.halo; ctx.lineWidth = PEN.track.halo; path(); ctx.stroke();
  ctx.strokeStyle = I.you; ctx.lineWidth = PEN.track.w; path(); ctx.stroke();
  for (const q of plan.tacks) { const s = tf(q.x, q.y); ctx.fillStyle = I.halo; ctx.beginPath(); ctx.arc(s[0], s[1], 4.5, 0, 6.29); ctx.fill(); ctx.fillStyle = I.you; ctx.beginPath(); ctx.moveTo(s[0], s[1] - 3.5); ctx.lineTo(s[0] + 3, s[1] + 2.5); ctx.lineTo(s[0] - 3, s[1] + 2.5); ctx.closePath(); ctx.fill(); }
  for (const q of plan.gybes) { const s = tf(q.x, q.y); ctx.fillStyle = I.halo; ctx.beginPath(); ctx.arc(s[0], s[1], 4.5, 0, 6.29); ctx.fill(); ctx.strokeStyle = I.you; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(s[0], s[1], 2.8, 0, 6.29); ctx.stroke(); }
  ctx.restore();
}

/** The navigator's route to the destination (routeAround: the passage plan's way round the land), re-planned as she
 * goes: when the destination changes, or she's 100 m from where it was last planned from (at most every 2 s). On a long
 * leg the search takes 60–200 ms, which held a frame up every 2 s while she cruised (Capacity, 15 Nov 2026), so it's
 * worked out in the background a little at a time (routing.ts routeAroundSteps), 2 ms in every 16, and the last route
 * stays drawn until the new one is in (for a new destination, the straight line to it until then). */
let routeMemo: { dest: CourseMark; from: Vec; at: number; pts: Vec[] } | null = null;
let routeJob: { dest: CourseMark; from: Vec; at: number; g: Generator<void, Vec[], void> } | null = null;
const ROUTE_SLICE_MS = 2, ROUTE_TICK_MS = 16;
export function navRoute(u: { x: number; y: number }, dest: CourseMark): Vec[] {
  const now = performance.now(), here = { x: u.x, y: u.y }, m = routeMemo;
  const stale = !m || m.dest !== dest || (dist(m.from, here) > 100 && now - m.at > 2000);
  if (stale && (!routeJob || routeJob.dest !== dest)) {
    const fresh = !routeJob;
    routeJob = { dest, from: here, at: now, g: routeAroundSteps(here, dest.p) };
    if (fresh) setTimeout(pumpRoute, 0);
  }
  return m && m.dest === dest ? m.pts : [here, { ...dest.p }];
}
/** One slice of the route's search, then the next a frame on, until it's done. */
function pumpRoute(): void {
  const job = routeJob; if (!job) return;
  const t = performance.now();
  for (;;) {
    const r = job.g.next();
    if (r.done) { if (routeJob === job) { routeMemo = { dest: job.dest, from: job.from, at: job.at, pts: r.value }; routeJob = null; } return; }
    if (routeJob !== job) { setTimeout(pumpRoute, 0); return; } // (replaced by a new destination's: that one next)
    if (performance.now() - t > ROUTE_SLICE_MS) break;
  }
  setTimeout(pumpRoute, ROUTE_TICK_MS);
}
/** Whether a route is still being worked out (the passage panel draws the way round the land until it's in). */
export function navRoutePending(): boolean { return routeJob !== null; }
/** Finish the route being worked out, at once (the tests: the same route, arrived at in slices). */
export function navRouteFinish(): void {
  const job = routeJob; if (!job) return;
  let r = job.g.next(); while (!r.done) r = job.g.next();
  routeMemo = { dest: job.dest, from: job.from, at: job.at, pts: r.value }; routeJob = null;
}

/** A slip's destination, once its way in is worked out: its harbor's mouth (the same object while it's the same, so the
 * route to it is worked out once: navRoute). Any other: itself. */
let mouthMemo: { dest: CourseMark; m: CourseMark } | null = null;
function toMouth(dest: CourseMark): CourseMark {
  if (mouthMemo?.dest === dest) return mouthMemo.m;
  const s = slipAt(dest.p), way = s ? harborRouteCached(s) : null; if (!way) return dest;
  mouthMemo = { dest, m: { ...dest, p: { ...way.mouth } } }; return mouthMemo.m;
}
/**
 * Just sailing, on the map: the buoys around you, and where you're heading, by the navigator's route. If that's off the map, an arrow at the
 * edge points to it.
 */
/** How far off her the route starts when her course is drawn, px: clear of the ring round her (r267). */
const ROUTE_GAP_PX = 34;
function drawSailing(ctx: CanvasRenderingContext2D, tf: Tf, dest: CourseMark | null, u: Boat, w: number, h: number, I: Ink, plan: PassageNow | null = null): void {
  // the racing marks and buoys the sim knows (the chart draws the real ones under them): small orange rings
  for (const pl of PLACES) if (pl.buoy) {
    const s = tf(pl.p.x, pl.p.y);
    ctx.strokeStyle = I.halo; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(s[0], s[1], 3, 0, 6.29); ctx.stroke();
    ctx.strokeStyle = I.mark; ctx.lineWidth = 1.6; ctx.stroke();
  }
  if (!dest) return;
  const a = tf(u.x, u.y), b = tf(dest.p.x, dest.p.y), inside = b[0] > 8 && b[0] < w - 8 && b[1] > 8 && b[1] < h - 8;
  // the navigator's route there (the passage plan's: round the land, sim/navigator.ts), from where she is now
  // (bound for her slip with the way in drawn: the route to its harbor's mouth, where the way in takes over: drawNavLayer)
  const legs = navRoute(u, toMouth(dest)).map(q => tf(q.x, q.y)); legs[0] = a;
  const path = () => { ctx.beginPath(); legs.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); };
  // (with her course drawn, the route starts a little off her, so the one line leaving the boat is her course: r267)
  if (plan && plan.track.length > 1 && legs.length > 1) { const [x0, y0] = legs[0], [x1, y1] = legs[1], L = Math.hypot(x1 - x0, y1 - y0), k = Math.min(0.5, ROUTE_GAP_PX / Math.max(1, L)); legs[0] = [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k]; }
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = PEN.dest.cap; ctx.setLineDash(PEN.dest.dash);
  ctx.strokeStyle = I.halo; ctx.lineWidth = PEN.dest.halo; path(); ctx.stroke();
  ctx.strokeStyle = I.line; ctx.lineWidth = PEN.dest.w; path(); ctx.stroke(); ctx.setLineDash([]);
  // the turns on the way: small dots
  for (const q of legs.slice(1, -1)) { ctx.fillStyle = I.halo; ctx.beginPath(); ctx.arc(q[0], q[1], 3.5, 0, 6.29); ctx.fill(); ctx.fillStyle = I.line; ctx.beginPath(); ctx.arc(q[0], q[1], 2, 0, 6.29); ctx.fill(); }
  ctx.restore();
  if (plan && plan.track.length > 1) drawTrack(ctx, tf, plan, I);
  const shape = (pts: [number, number][]) => {
    ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.strokeStyle = I.halo; ctx.lineWidth = 4; ctx.stroke(); ctx.fillStyle = I.mark; ctx.fill(); ctx.strokeStyle = I.edge; ctx.lineWidth = 1.2; ctx.stroke();
  };
  if (inside) shape([[b[0], b[1] - 8], [b[0] + 6.5, b[1]], [b[0], b[1] + 8], [b[0] - 6.5, b[1]]]); // where you're heading: an orange diamond
  else {
    // pinned to the edge of the map, pointing the way
    const dx = b[0] - a[0], dy = b[1] - a[1], k = Math.min((w / 2 - 12) / Math.abs(dx || 1e-6), (h / 2 - 12) / Math.abs(dy || 1e-6));
    const ex = a[0] + dx * k, ey = a[1] + dy * k, ang = Math.atan2(dy, dx);
    shape([[ex + Math.cos(ang) * 8, ey + Math.sin(ang) * 8], [ex + Math.cos(ang + 2.5) * 8, ey + Math.sin(ang + 2.5) * 8], [ex + Math.cos(ang - 2.5) * 8, ey + Math.sin(ang - 2.5) * 8]]);
  }
}

/** How long, minutes, and how far on, m, before the chart's plan (its gates and strongest wind) is worked out again. */
const NAV_PLAN_MIN = 10, NAV_PLAN_M = 1852;
/** The current gates' and the strongest wind's colors on the navigator's layer. */
const NAV_GATE = '#6fd0ff', NAV_WIND = '#e9f2f5';
/** The full chart's ETA by the destination, set by drawNavLayer and drawn once the laylines are down (drawEta). */
let etaLabel: { t: string; x: number; y: number } | null = null;
function drawEta(ctx: CanvasRenderingContext2D, I: Ink): void {
  const e = etaLabel; etaLabel = null; if (!e) return;
  ctx.save(); ctx.font = '700 12px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5; ctx.strokeStyle = I.halo; ctx.strokeText(e.t, e.x, e.y); ctx.fillStyle = '#e8601c'; ctx.fillText(e.t, e.x, e.y); ctx.restore();
}
/**
 * The navigator's layer over her course (drawTrack): a tick and the clock every 15 minutes along it (the full chart), the
 * current gates she passes (blue circles: when the tide there turns with her or against her) and where the wind's
 * strongest on the way (a white triangle: its knots), named on the full chart, and when she'd get there by the
 * destination. Not the ship and ferry routes she crosses: the owner, 17 Nov 2026, "should just be common knowledge to look
 * out for", and the ferries don't keep to a line or a time.
 */
function drawNavLayer(ctx: CanvasRenderingContext2D, tf: Tf, dest: CourseMark, now: PassageNow, plan: PassagePlan | null, I: Ink, chart: boolean): void {
  ctx.save(); ctx.lineJoin = 'round';
  const say = (t: string, x: number, y: number, col: string, font: string) => { ctx.font = font; ctx.textAlign = 'left'; ctx.lineWidth = 3.5; ctx.strokeStyle = I.halo; ctx.strokeText(t, x, y); ctx.fillStyle = col; ctx.fillText(t, x, y); };
  // bound for her slip: the way in from the harbor's mouth, along the fairways to off her slip, for her to be brought in by
  // hand (the pilot hands her over at the mouth: world.ts navTarget), once it's worked out (the passage's plan works it out)
  const slip = slipAt(dest.p), way = slip ? harborRouteCached(slip) : null;
  if (way) {
    const pts = [way.mouth, way.entry, ...way.path.slice(1), way.approach].map(q => tf(q.x, q.y));
    const path = () => { ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); };
    ctx.lineCap = PEN.dest.cap; ctx.setLineDash(PEN.dest.dash);
    ctx.strokeStyle = I.halo; ctx.lineWidth = PEN.dest.halo; path(); ctx.stroke();
    ctx.strokeStyle = I.line; ctx.lineWidth = PEN.dest.w; path(); ctx.stroke(); ctx.setLineDash([]);
    for (const q of pts.slice(1, -1)) { ctx.fillStyle = I.halo; ctx.beginPath(); ctx.arc(q[0], q[1], 3.5, 0, 6.29); ctx.fill(); ctx.fillStyle = I.line; ctx.beginPath(); ctx.arc(q[0], q[1], 2, 0, 6.29); ctx.fill(); }
  }
  const tr = now.track;
  if (chart && tr.length > 1) {
    const step = 15; let next = Math.ceil(tr[0].t / step) * step; if (next - tr[0].t < 3) next += step; // (none on top of her)
    for (const q of tr) if (q.t >= next) {
      const s = tf(q.p.x, q.p.y);
      // (the tick and its clock in the chart's text color, dark by day, light at dusk: I.edge is black in both, unreadable on the dusk halo; chart audit #3)
      ctx.fillStyle = I.halo; ctx.beginPath(); ctx.arc(s[0], s[1], 3.5, 0, 6.29); ctx.fill(); ctx.fillStyle = I.text; ctx.beginPath(); ctx.arc(s[0], s[1], 2, 0, 6.29); ctx.fill();
      say(clockOf(q.t), s[0] + 6, s[1] + 3, I.text, '600 10px "Saira Semi Condensed", sans-serif');
      while (next <= q.t) next += step;
    }
  }
  for (const m of plan?.marks ?? []) {
    if (m.kind === 'lane') continue;
    const s = tf(m.p.x, m.p.y), r = chart ? 7 : 5;
    ctx.fillStyle = I.halo; ctx.beginPath(); ctx.arc(s[0], s[1], r + 2, 0, 6.29); ctx.fill();
    ctx.fillStyle = m.kind === 'gate' ? NAV_GATE : NAV_WIND; ctx.strokeStyle = I.edge; ctx.lineWidth = 1.2; ctx.beginPath();
    if (m.kind === 'wind') { ctx.moveTo(s[0], s[1] - r - 1); ctx.lineTo(s[0] + r, s[1] + r); ctx.lineTo(s[0] - r, s[1] + r); ctx.closePath(); } else ctx.arc(s[0], s[1], r, 0, 6.29);
    ctx.fill(); ctx.stroke();
    if (chart) say(m.label, s[0] + r + 5, s[1] + 4, I.edge, '600 11px "Saira Semi Condensed", sans-serif');
  }
  // (the inset gives when she'd get there once, in its own words at its foot: ui/hud.ts map)
  // (the ETA by the destination waits for the laylines, drawn after this layer, so none crosses it: chart audit #4)
  if (chart && now.ok && now.eta != null) { const s = tf(dest.p.x, dest.p.y); etaLabel = { t: `ETA ${clockOf(now.eta)}`, x: s[0] + 11, y: s[1] + 18 }; }
  ctx.restore();
}
