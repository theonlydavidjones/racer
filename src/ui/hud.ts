import { beatFor, seaDrag, steadySpeed } from '../boat/seaway';
import { crewWords } from './crewWords';
import { bow, type Boat } from '../boat/boat';
import type { CourseMark } from '../courses/course';
import { PLACES } from '../sim/places';
import { timeToCover } from '../boat/dynamics';
import { polar } from '../boat/polar';
import { currentWords } from '../sim/outlook';
import { byHand, sailPlan } from '../boat/physics';
import type { SailTrim } from '../boat/trim';
import { D2R, KT, V, brg, clamp, dist, dot, n360, sub, wrap, type Vec } from '../core/math';
import { HAIL_RESPONSE, cpa, situationText } from '../rules';
import type { World } from '../sim/world';
import { $ } from './dom';
import { flagCanvas, pennantCanvas } from '../render/flags';
import { FLAG_NAME } from '../sim/signals';
import { VESSEL } from '../sim/traffic';
import { transitOffset } from '../sim/transits';
import { targetShape, type Shape } from '../boat/controls';

/** "Main: a bit full (outhaul, backstay) · draft aft (Cunningham)": what's off in each sail's shape and the line that fixes it. */
function shapeWords(u: Boat): string {
  const tws = u.ww.kt, parts: string[] = [];
  const one = (name: 'main' | 'jib', s: Shape | null) => {
    if (!s) return;
    const t = targetShape(name, tws, u.awa, u.depower), out: string[] = [], c = u.ctl;
    const main = name === 'main', maxed = (...ks: (keyof typeof c)[]) => ks.every(k => (c[k] as number) >= 0.97);
    if (s.depth > t.depth + 0.012) out.push(maxed(...(main ? ['outhaul', 'backstay'] as const : ['backstay'] as const)) ? 'too full (flattening lines all on)' : `too full (${main ? 'outhaul, backstay' : 'backstay'} on)`);
    else if (s.depth < t.depth - 0.012) out.push(`too flat (ease ${main ? 'outhaul, backstay' : 'backstay'})`);
    if (s.draft > t.draft + 0.04) out.push(maxed(...(main ? ['cunningham', 'downhaul'] as const : ['jibCunningham'] as const)) ? 'draft aft (the mast bend: Cunningham all on)' : `draft aft (${main ? 'Cunningham, downhaul' : 'jib Cunningham'} on)`);
    else if (s.draft < t.draft - 0.04) out.push(`draft forward (ease ${main ? 'Cunningham' : 'jib Cunningham'})`);
    if (s.twist > t.twist + 3) out.push(`twisted open (${main ? (u.awa > 60 ? 'vang on' : 'sheet in, traveller up') : 'jib car forward next tack'})`);
    else if (s.twist < t.twist - 3) out.push(`leech too closed (${main ? (u.awa > 60 ? 'ease the vang' : u.ww.kt >= 13 ? 'ease the sheet, traveller down' : 'ease the sheet, traveller up') : 'jib car aft next tack'})`);
    parts.push(`<b>${main ? 'Main' : 'Jib'}:</b> ${out.length ? out.join(', ') : 'shape good'}`);
  };
  if (u.luff) return '';
  one('main', u.shape.main); one('jib', u.shape.jib);
  return `${parts.join(' · ')} <b>· shape ${Math.round(u.shape.eff * 100)}%</b>`;
}
import { toast } from './feedback';
import { drawCourse, drawCurrentArrows, drawWindField, drawPuffs, drawLaylines, drawWindShadow, fitCanvas, makeTf, type Tf } from './draw2d';
import { onLand } from '../geo/shore';
import { INK, chartCredit, drawEncChart, drawEncLand, type Ink } from './encChart';
import { layerOn, type LayerKey } from './layers';
import { drawFog, drawSea, nm } from './mapLayers';
import { visibilityFor } from '../environment/weather';
import type { SeaHere } from '../environment/sea';
import { laylinesFor } from '../sim/laylines';

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
export function pointOfSail(u: Boat): { short: string; long: string } {
  const a = Math.abs(u.twa), beat = beatFor(u);
  const [short, long] = a < 30 ? ['head to wind', 'head to wind'] : a < beat + 7 ? ['close-hauled', 'close-hauled']
    : a < 80 ? ['close reach', 'on a close reach'] : a <= 100 ? ['beam reach', 'on a beam reach']
    : a < 160 ? ['broad reach', 'on a broad reach'] : ['run', 'running'];
  return { short, long };
}

export class Hud {
  private acc = 0;
  mapZoom = false;
  /** Whether the trim panel's Pole row is showing (deep downwind, or the pole is out). */
  private poleRowShown: boolean | null = null; // (null until the first frame decides)
  /** Label of the key bound to Hail (set by main, which owns the key map). */
  hailKey: () => string = () => 'H';
  private dialC = $<HTMLCanvasElement>('dial');
  private mapC = $<HTMLCanvasElement>('map');

  /** Mean close-hauled heading on each tack over the last couple of minutes (the reference for lifts and headers). */
  private meanHdg: Record<'S' | 'P', number | null> = { S: null, P: null };
  /**
   * The tactical compass: a tape of headings around yours, with the bearing to the next mark, the wind, the heading
   * you'd sail on the other tack (or gybe), and your average close-hauled heading on this tack. Steer above the
   * average and you're lifted; below it, headed.
   */
  private compass(w: World, u: Boat, dt: number): void {
    const [ctx, W, H] = fitCanvas($<HTMLCanvasElement>('compassTape')), cx = W / 2, span = 70, px = W / (2 * span);
    ctx.clearRect(0, 0, W, H);
    const h = u.h, x = (b: number) => cx + wrap(b - h) * px;
    // ticks and numbers
    ctx.strokeStyle = 'rgba(150,196,218,.45)'; ctx.fillStyle = '#c9dbe4'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (let d = Math.ceil((h - span) / 5) * 5; d <= h + span; d += 5) {
      const X = x(d), big = d % 10 === 0;
      ctx.beginPath(); ctx.moveTo(X, H - 1); ctx.lineTo(X, H - (big ? 12 : 7)); ctx.stroke();
      if (d % 30 === 0) { const n = ((d % 360) + 360) % 360; ctx.fillText(({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[n] ?? String(n).padStart(3, '0'), X, H - 16); }
    }
    const marker = (b: number, col: string, label: string, top: boolean) => {
      let X = x(b); const off = X < 8 || X > W - 8; X = Math.max(8, Math.min(W - 8, X));
      ctx.fillStyle = col; ctx.beginPath();
      if (top) { ctx.moveTo(X - 5, 2); ctx.lineTo(X + 5, 2); ctx.lineTo(X, 9); } else { ctx.moveTo(X - 4, 13); ctx.lineTo(X, 9); ctx.lineTo(X + 4, 13); }
      ctx.fill(); ctx.font = '700 10px system-ui, sans-serif'; ctx.fillText(off ? (X < cx ? '◂ ' : '') + label + (X > cx ? ' ▸' : '') : label, Math.max(26, Math.min(W - 26, X)), top ? 20 : 24);
    };
    const upwind = u.twa < 80, from = u.ww.from;
    // the other tack (or gybe): where you'd point after turning
    const other = upwind ? n360(from + (u.tack === 'S' ? 1 : -1) * beatFor(u)) : n360(from + wrap(from - h)); // the mirror image across the wind
    marker(other, '#9fb3bf', upwind ? 'tack' : 'gybe', false);
    // average close-hauled heading on this tack: a slow running mean while you're close-hauled
    if (upwind && Math.abs(u.twa - beatFor(u)) < 6) { const m = this.meanHdg[u.tack]; this.meanHdg[u.tack] = m == null ? h : n360(m + wrap(h - m) * Math.min(1, dt / 90)); }
    const mean = this.meanHdg[u.tack];
    if (upwind && mean != null) {
      marker(mean, '#e8e8e8', 'avg', false);
      const d = wrap(h - mean) * (u.tack === 'S' ? -1 : 1); // starboard: lifted when heading is higher (smaller) than the mean
      if (Math.abs(d) >= 3) { ctx.fillStyle = d > 0 ? '#3fd197' : '#ff6a5c'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(d > 0 ? `lifted ${Math.round(d)}°` : `headed ${Math.round(-d)}°`, cx - 34, 13); }
    }
    marker(from, '#6fb7ff', 'wind', true);
    const m = w.nextMark(u);
    if (m) marker(brg(m.p.x - u.x, m.p.y - u.y), '#ffd21a', m.key === 'dest' ? 'DEST' : m.name.split(' ')[0], true);
    // the lubber line and the heading
    ctx.strokeStyle = '#ffb35c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = '#ffb35c'; ctx.font = '800 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(Math.round(n360(h))).padStart(3, '0') + '°', cx + 22, 13);
  }

  private trCache: { key: string; t: ReturnType<World['laylineTransit']> } = { key: '', t: null };
  /**
   * Transits: before the start, what the far end of the line lines up with (in line = on the line); on a beat, what
   * the mark lines up with along your layline (in line = on the layline).
   */
  private transit(w: World, u: Boat): void {
    const el = $('transit');
    if (w.freeSail || u.finished || !w.settings.aids) { el.hidden = true; return; }
    const C = w.C, deg = (o: number) => (Math.abs(o) < 0.8 ? '<span class="on">in line now</span>' : `${Math.abs(o).toFixed(0)}° ${o > 0 ? 'right' : 'left'} of it`);
    if (w.t < 0 || !u.started) {
      const T = w.lineTransit; if (!T) { el.hidden = true; return; }
      el.hidden = false;
      el.innerHTML = `Line transit: <b>${C.pinLabel}</b> in line with <b>${T.name}</b> means you're on the line · ${C.pinLabel} is ${deg(transitOffset(u, C.pin, T.p))}`;
      return;
    }
    const m = w.nextMark(u), L = laylinesFor(w, u);
    if (!m || !L || L.kind !== 'up' || u.twa > 70) { el.hidden = true; return; }
    const i = u.tack === 'S' ? 0 : 1, g = L.tracks[i], key = `${m.name}:${Math.round(Math.atan2(g.x, g.y) * 30)}`;
    if (key !== this.trCache.key) this.trCache = { key, t: w.laylineTransit(L.mark.p, g) };
    const T = this.trCache.t; if (!T) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `${u.tack === 'S' ? 'Starboard' : 'Port'} layline: <b>${m.name.split(' ')[0]}</b> in line with <b>${T.name}</b> · ${m.name.split(' ')[0]} is ${deg(transitOffset(u, L.mark.p, T.p))}`;
  }

  /**
   * The windex, as you'd see it looking up at the masthead: the boat from above, bow up, the arrow pointing into the
   * apparent wind, and the two reference tabs at the close-hauled angle.
   */
  private windex(u: Boat): void {
    const [ctx, W, H] = fitCanvas($<HTMLCanvasElement>('windexDial')), cx = W / 2, cy = H / 2 + 1, R = Math.min(W, H) / 2 - 1;
    ctx.clearRect(0, 0, W, H);
    // the boat, bow up
    ctx.fillStyle = 'rgba(160,180,190,.25)'; ctx.beginPath(); ctx.moveTo(cx, cy - R * 0.85); ctx.quadraticCurveTo(cx + R * 0.32, cy - R * 0.1, cx + R * 0.2, cy + R * 0.8); ctx.lineTo(cx - R * 0.2, cy + R * 0.8); ctx.quadraticCurveTo(cx - R * 0.32, cy - R * 0.1, cx, cy - R * 0.85); ctx.fill();
    // reference tabs, ±28° off the bow
    ctx.strokeStyle = '#9fb3bf'; ctx.lineWidth = 2;
    for (const s of [-1, 1]) { const a = (s * 28 - 90) * D2R; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55); ctx.lineTo(cx + Math.cos(a) * R * 0.95, cy + Math.sin(a) * R * 0.95); ctx.stroke(); }
    // the vane: points into the apparent wind (arel: + from starboard)
    const a = (u.arel - 90) * D2R, tip = { x: cx + Math.cos(a) * R * 0.95, y: cy + Math.sin(a) * R * 0.95 }, tail = { x: cx - Math.cos(a) * R * 0.6, y: cy - Math.sin(a) * R * 0.6 };
    ctx.strokeStyle = '#ff5a3c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.fillStyle = '#ff5a3c'; ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x - Math.cos(a - 0.45) * 6, tip.y - Math.sin(a - 0.45) * 6); ctx.lineTo(tip.x - Math.cos(a + 0.45) * 6, tip.y - Math.sin(a + 0.45) * 6); ctx.fill();
    ctx.fillRect(tail.x - 2.5, tail.y - 2.5, 5, 5);
  }

  private sigKey = '';
  private toldHelm = false;
  /** The race committee's flags flying now, what they mean, and the next signal. */
  private signals(w: World): void {
    const show = !w.freeSail && (w.t < 8 || w.flags.includes('X') || !!w.user.roundEnd);
    const el = $('sigPanel'); el.hidden = !show; if (!show) return;
    const key = w.flags.join(',') + '|' + (w.courseSignal?.no ?? '');
    if (key !== this.sigKey) {
      this.sigKey = key;
      const box = $('sigFlags'); box.innerHTML = '';
      for (const f of w.flags) { const c = document.createElement('canvas'); c.width = 66; c.height = 44; c.getContext('2d')!.drawImage(flagCanvas(f), 0, 0, 66, 44); c.title = FLAG_NAME[f]; box.appendChild(c); }
      if (!w.flags.length) box.textContent = 'none';
      if (w.courseSignal) { // the course number, in numeral pennants, top to bottom
        const col = document.createElement('span'); col.className = 'pennants'; col.title = `Course ${w.courseSignal.no}`;
        for (const d of String(w.courseSignal.no)) { const c = document.createElement('canvas'); c.width = 56; c.height = 28; c.getContext('2d')!.drawImage(pennantCanvas(d), 0, 0, 56, 28); col.appendChild(c); }
        const lab = document.createElement('small'); lab.textContent = `Course ${w.courseSignal.no}`; col.appendChild(lab);
        box.appendChild(col);
      }
    }
    const next = w.sequence.find(s => s.t > w.t), u = w.user;
    const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    let txt = next ? `${next.name} in ${mmss(next.t - w.t)}` : w.flags.includes('X') ? 'X: individual recall. Boats over early must return.' : '';
    if (u.roundEnd) txt = 'I flag: go back round an end of the line.';
    else if (u.scoring) txt = u.scoring === 'ZFP' ? 'Z flag: you have a 20% penalty.' : `You're disqualified (${u.scoring}).`;
    else if (u.ocs && w.t >= 0) txt = 'X flag: you\'re over. Return and start.';
    $('sigText').textContent = txt;
  }

  update(w: World, dt: number): void {
    this.signals(w);
    this.transit(w, w.user);
    this.compass(w, w.user, dt);
    this.acc += dt; if (this.acc < 0.1) return; this.acc = 0;
    const u = w.user, ww = u.ww, m = w.nextMark(u);
    $('clock').textContent = fmtClock(w.t);
    $('clockLab').textContent = w.freeSail ? 'Sailing' : w.t < 0 ? 'Start in' : 'Race time';
    $('clockSub').textContent = w.clock + ' · ' + (w.freeSail ? 'Cruising' : w.t < 0 ? (w.t > -10 ? 'Build speed' : w.t > -60 ? 'Final minute' : 'Pre-start') :
      u.finished ? 'Finished' : u.ocs ? 'OCS · return' : !u.started ? 'Not started' : m ? `Next ${m.name.split(' ')[0]} · ${sideWord(m.side)}` : 'To finish');
    $('spd').textContent = (u.v / KT).toFixed(1);
    $('sog').textContent = 'SOG ' + (Math.hypot(u.vx, u.vy) / KT).toFixed(1);
    this.windex(u);
    const poleTxt = u.pole === 'set' ? (u.poleTack === u.tack ? ' · wing' : '') : u.pole === 'setting' ? ' · poling' : u.pole === 'stowing' ? ' · stowing' : '';
    { const pos = pointOfSail(u);
      $('tackLab').textContent = (u.tack === 'S' ? 'Stbd' : 'Port') + (u.penalty > 0 ? ' · turns ' + Math.ceil(u.penalty / 360) : poleTxt || ` · ${pos.short}`);
      $('tackLab').title = `${u.tack === 'S' ? 'Starboard' : 'Port'} tack, ${pos.long}: ${Math.round(Math.abs(u.twa))}° off the true wind, ${Math.round(Math.abs(u.awa))}° apparent`; }
    // the pole only on deep points of sail: a poled-out jib fills from about 145° true (polar.ts jibEfficiency), so the
    // row appears at 140° (time to set it as you bear away) and goes below 135°; while it's out it stays, to take it in
    const deep = Math.abs(u.twa), wantPole = u.pole !== 'down' || deep >= (this.poleRowShown === true ? 135 : 140);
    if (wantPole !== this.poleRowShown) { this.poleRowShown = wantPole; $('tpPoleRow').hidden = !wantPole; }
    const bp = $('bPole');
    bp.textContent = u.pole === 'down' ? 'Pole out' : u.pole === 'set' ? 'Pole in' : u.pole === 'setting' ? 'Poling…' : 'Stowing…';
    bp.classList.toggle('on', u.pole === 'set' || u.pole === 'setting');
    $('tpPole').textContent = u.pole === 'set' ? (u.poleTack === u.tack ? 'Wing' : 'Set') : u.pole === 'down' ? 'Stowed' : '…';
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
      $('seaSub').textContent = (s.hsW < 0.05 ? 'glassy' : s.steep > 0.075 ? 'steep chop' : 'chop') + (s.hsS >= 0.05 ? ` · ${ftS(s.hsS)} swell` : '');
      $('seaSub').title = `${s.hsW < 0.05 ? 'Glassy' : `${ft(s.hsW)} of ${s.steep > 0.075 ? 'steep ' : ''}chop`}${s.hsS >= 0.05 ? `, ${ft(s.hsS)} of swell` : ''}`; }
    const dev = wrap(w.wind.from - w.avgFrom), lifted = u.tack === 'S' ? dev > 0 : dev < 0, sl = $('shiftLab');
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
    this.situation(w, u); this.lineBox(w, u); this.dialC.hidden = !w.settings.windDial; if (w.settings.windDial) this.dial(u); this.map(w, u);
  }

  /** How each sail is drawing, in words, with what to do about it. */
  private trimPanel(u: Boat): void {
    const word = (t: SailTrim | null, off: string) => !t ? [off, 'off'] : t.flow === 'good' ? ['Good', 'good'] : t.flow === 'luffing' ? ['Luffing', 'luffing'] : ['Stalled', 'stalled'];
    const plan = sailPlan(u);
    const [mw, mc] = u.luff ? ['Eased', 'off'] : word(u.trim.main, '');
    const backed = (u.jibBacked ?? 0) > 0.3;
    const [jw, jc] = backed ? ['Aback', 'backed'] : u.luff ? ['Eased', 'off'] : word(u.trim.jib, plan === 'wing' ? 'Poled out' : 'Down');
    $('tpCrew').textContent = crewWords(u);
    const tm = $('tpMain'), tj = $('tpJib');
    tm.textContent = mw; tm.className = 'tp-state ' + mc;
    tj.textContent = jw; tj.className = 'tp-state ' + jc;
    // the sails' shape against the best shape for the conditions, and which line fixes it
    const sw = shapeWords(u);
    $('tpShape').innerHTML = sw;
    // heel and helm balance: what the boat feels like on the tiller
    { const heel = Math.round(u.heelMag ?? 0), hn = u.helmNeed ?? 0, up = u.twa < 70;
      const helm = Math.abs(hn) < 0.8 ? 'neutral' : hn > 0 ? `${hn.toFixed(0)}° weather` : `${(-hn).toFixed(0)}° lee`;
      // who's trimming: the crew depowers on their own (controls.ts depowerLimits); when they've done all they can, it's the helm's job
      const crewTrims = !(['backstay', 'vang', 'outhaul', 'traveller'] as const).some(k => byHand(u, k)), dp = u.depower ?? 0;
      const overUp = crewTrims ? (dp < 0.95 ? ' · overpowered: the crew is depowering' : ' · overpowered with everything on: feather (sail a touch higher, letting the main lift) or ease the main in the puffs')
        : ' · overpowered: backstay on, vang on, traveller down, flatten';
      const advice = u.luff ? '' : hn > 5 ? (up ? overUp : ' · ease the main or vang') : hn < -1.5 ? ' · lee helm: traveller up, ease backstay, fuller sails' : heel > 24 && up ? (crewTrims && dp < 0.95 ? ' · heeling too far: the crew is depowering' : ' · heeling too far: depower') : '';
      if (!this.toldHelm && hn > 3.5 && up && !u.luff) { this.toldHelm = true; toast(`Weather helm: she wants to round up into the wind. Let go of the tiller and she will. Hold the tiller a little to windward to sail straight, or take the helm off her: backstay on, traveller down (Trim coach explains).`, 6000); }
      $('tpBalance').innerHTML = `Heel <b>${heel}°</b> · Helm <b class="${hn > 5 || hn < -1.5 ? 'warn' : ''}">${helm}</b><span class="warn">${advice}</span>`; }
    // (the line under the sails' state is the trim coach's headline: app.ts coachTick)
  }

  private deepT = 0;
  private abackT = 0;
  private hinted = { deep: false, aback: false };
  /** Coach the whisker pole: suggest it on a deep run, and warn when it's left out on a reach. */
  private poleHints(w: World, u: Boat): void {
    if (w.t < 0 || u.finished) return;
    const deep = u.twa > 158 && u.pole === 'down' && !u.poleWant;
    this.deepT = deep ? this.deepT + 0.1 : 0;
    if (!deep && u.twa < 140) this.hinted.deep = false;
    if (this.deepT > 6 && !this.hinted.deep) {
      this.hinted.deep = true;
      toast('Running deep: the main is blanketing the jib. Pole it out to windward and go wing-on-wing (Pole / O).', 4500);
    }
    const aback = u.pole === 'set' && u.twa < 140;
    this.abackT = aback ? this.abackT + 0.1 : 0;
    if (!aback) this.hinted.aback = false;
    if (this.abackT > 3 && !this.hinted.aback) {
      this.hinted.aback = true;
      toast('The poled-out jib is aback on this course. Stow the pole (Pole / O).', 4000);
    }
  }

  /** The most pressing nearby boat: who keeps clear, under which rule, and time to collision. */
  private situation(w: World, u: Boat): void {
    let best: { o: Boat; r: ReturnType<World['rights']>; c: { t: number; d: number }; d: number; risk: boolean } | null = null, bestScore = -1e9;
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
        $('situMsg').textContent = hail.by === o.id ? `You replied "You tack". Give ${o.name} room to tack and pass astern of you.` : `${o.name} replied "You tack". Tack now: they must give you room.`;
        el.className = hail.by === o.id ? 'kc' : 'row';
      } else if (hail.by === o.id) {
        const left = Math.max(0, hail.at + HAIL_RESPONSE - w.t);
        $('situMsg').textContent = `${o.name} hailed "Room to tack!" Tack now, or press ${key} to reply "You tack" and give them room: ${left.toFixed(0)} s to respond.`;
        el.className = 'kc alarm';
      } else if (hail.respondedAt != null) {
        const left = Math.max(0, hail.respondedAt + HAIL_RESPONSE - w.t);
        $('situMsg').textContent = u.lastTackT >= hail.at ? `You're tacking: ${o.name} is giving you room.` : `${o.name} is tacking to give you room. Tack now: ${left.toFixed(0)} s.`;
        el.className = u.lastTackT >= hail.at ? 'row' : 'kc alarm';
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

  /** Before the start: distance / time to line, time to burn, favored end. After: next mark range and bearing. */
  private lineBox(w: World, u: Boat): void {
    const el = $('linebox'), C = w.C;
    if (u.finished) { el.hidden = true; return; }
    if (w.freeSail) {
      // just sailing: how you're doing against the boat's target speed at this angle
      const target = steadySpeed(polar(u.ww.kt, u.twa, sailPlan(u)), v => seaDrag(u.sea, u.h, v)), pct = target > 0.05 ? Math.round(100 * u.v / target) : 0;
      const vmg = u.v * Math.cos(u.twa * D2R) / KT;
      el.hidden = false; el.className = '';
      const speed = `Target ${(target / KT).toFixed(1)} kt at ${Math.round(u.twa)}° · you ${pct}%`;
      const d = w.dest;
      if (d && w.arrivedT == null) {
        // to the destination: range and bearing, your speed made good toward it over the ground (with the current), and how long at that rate
        const rng = dist(u, d.p), b = brg(d.p.x - u.x, d.p.y - u.y), vmc = (u.vx * (d.p.x - u.x) + u.vy * (d.p.y - u.y)) / Math.max(1, rng);
        const eta = vmc > 0.1 ? rng / vmc : Infinity, nm = rng / 1852;
        el.innerHTML = `<b>${d.name}</b> · ${nm < 0.2 ? Math.round(rng) + ' m' : nm.toFixed(2) + ' nm'} at ${String(Math.round(b)).padStart(3, '0')}° · `
          + (vmc > 0.05 ? `making ${(vmc / KT).toFixed(1)} kt toward it${isFinite(eta) ? ` · ${eta < 60 ? 'under a minute' : eta < 3600 ? Math.round(eta / 60) + ' min' : (eta / 3600).toFixed(1) + ' h'}` : ''}` : 'sailing away from it')
          + `<br><small>${speed}</small>`;
        return;
      }
      el.textContent = speed + (u.twa < 70 ? ` · VMG upwind ${vmg.toFixed(1)} kt` : u.twa > 110 ? ` · VMG downwind ${(-vmg).toFixed(1)} kt` : '');
      return;
    }
    el.hidden = false;
    if (w.t < 0 || u.ocs || !u.started) {
      const d = w.lineD(bow(u)), uN = Math.sin(u.h * D2R) * w.N.x + Math.cos(u.h * D2R) * w.N.y;
      let fav = '';
      if (w.settings.aids) {
        // the end closer to the wind on the water is favored
        const k = dot(sub(w.pin, w.committee), V(u.ww.from)) / w.lineLen, deg = Math.asin(clamp(Math.abs(k), 0, 1)) / D2R;
        fav = deg < 2 ? ' · <span class="fav">Square line</span>' : ` · <span class="fav">${k > 0 ? C.pinLabel : C.committeeLabel} end favored ${deg.toFixed(0)}°</span>`;
      }
      if (d > 0) { el.className = 'over'; el.innerHTML = w.t < 0 ? `Over the line by ${d.toFixed(0)} m · get back` : 'OCS · dip back below the line'; return; }
      el.className = '';
      // time to the line on this heading if you sheet in now: accelerating from your current speed, with the current
      const cN = u.cur.x * w.N.x + u.cur.y * w.N.y;
      const tl = uN > 0.15 ? timeToCover(-d, u.v, polar(u.ww.kt, u.twa, sailPlan(u)), uN, cN) : Infinity;
      const tStr = isFinite(tl) ? `${tl.toFixed(0)} s to line` : uN > 0.15 ? 'bear away to sail' : 'sailing away';
      const burn = w.t < 0 && isFinite(tl) ? ` · burn ${Math.max(0, -w.t - tl).toFixed(0)} s` : '';
      el.innerHTML = `Line ${(-d).toFixed(0)} m · ${tStr}${burn}${fav}`;
    } else {
      el.className = '';
      const m = w.nextMark(u), tgt = m ? m.p : w.center;
      const d = dist(u, tgt), bs = String(Math.round(brg(tgt.x - u.x, tgt.y - u.y))).padStart(3, '0');
      el.textContent = m ? `${m.name} to ${m.side === 's' ? 'starboard' : 'port'} · ${d.toFixed(0)} m · ${bs}°` : `Finish line · ${d.toFixed(0)} m · ${bs}°`;
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
    ctx.fillText('TWA ' + Math.round(u.twa) + '°', cx, cy + R * 0.56);
    ctx.fillText('AWA ' + Math.round(u.awa) + '°', cx, cy + R * 0.8);
  }

  private map(wd: World, u: Boat): void {
    const [ctx, w, h] = fitCanvas(this.mapC);
    ctx.clearRect(0, 0, w, h);
    const W = wd.C.base;
    let tf: Tf, scale: number, ctr = { x: u.x, y: u.y };
    if (this.mapZoom) { scale = Math.min(w, h) / 220; tf = makeTf(u.x, u.y, W, scale, w, h); }
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
    this.chartBody(ctx, w, h, wd, u, tf, scale, ctr, W, this.mapZoom, 'inset');
    const day = (wd.settings.chartPal ?? 'day') === 'day', I = INK[day ? 'day' : 'dusk'];
    // the map's own words, each on a halo so it reads over the chart
    const say = (t: string, x: number, y: number, align: CanvasTextAlign) => { ctx.textAlign = align; ctx.lineJoin = 'round'; ctx.strokeStyle = I.halo; ctx.lineWidth = 3; ctx.strokeText(t, x, y); ctx.fillStyle = I.text; ctx.fillText(t, x, y); };
    ctx.font = '600 9px "Saira Semi Condensed", sans-serif';
    say('WIND ↓', 34, 12, 'left'); // (right of the layers button on the map's corner)
    const fog = this.fogNote(wd, true);
    if (fog) say(fog, 6, h - 6, 'left');
    const ckt = Math.hypot(u.cur.x, u.cur.y) / KT;
    if (ckt > 0.05 && layerOn(wd.settings, 'current')) {
      // the current where you are
      const cb = (brg(u.cur.x, u.cur.y) - W) * D2R, ox = w - 18, oy = 16;
      const cc = day ? '#0060aa' : '#6fd0ff';
      ctx.strokeStyle = I.halo; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(ox - Math.sin(cb) * 8, oy + Math.cos(cb) * 8); ctx.lineTo(ox + Math.sin(cb) * 8, oy - Math.cos(cb) * 8); ctx.stroke();
      ctx.strokeStyle = cc; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox - Math.sin(cb) * 8, oy + Math.cos(cb) * 8); ctx.lineTo(ox + Math.sin(cb) * 8, oy - Math.cos(cb) * 8); ctx.stroke();
      ctx.fillStyle = cc; ctx.beginPath(); ctx.arc(ox + Math.sin(cb) * 8, oy - Math.cos(cb) * 8, 2.5, 0, 6.29); ctx.fill();
      say('CURRENT HERE ' + ckt.toFixed(1) + ' kt', w - 6, h - 6 - (fog ? 12 : 0), 'right');
    }
  }

  /**
   * The full-screen chart (ui/chart.ts): north up, centred on (cx, cy) at `scale` px/m, with the places' names, and the
   * spot you've picked. Same picture as the inset map: land, wind, puffs, current, the course or your destination, boats, ships.
   */
  drawChart(c: HTMLCanvasElement, wd: World, cx: number, cy: number, scale: number, pick: Vec | null): void {
    const pal = wd.settings.chartPal ?? 'day', [ctx, w, h] = fitCanvas(c), u = wd.user, tf = makeTf(cx, cy, 0, scale, w, h), I = INK[pal];
    // the places' names go over the chart: its own print keeps clear of them
    ctx.font = '600 11px "Saira Semi Condensed", sans-serif';
    const avoid = PLACES.filter(pl => scale > 0.12 || !pl.buoy).map(pl => { const q = tf(pl.p.x, pl.p.y); return [q[0] - 4, q[1] - 18, ctx.measureText(pl.name).width + 14, 22] as [number, number, number, number]; });
    const me = tf(u.x, u.y); avoid.push([me[0] - 26, me[1] - 26, 52, 52]); // (and clear of your boat)
    this.chartBody(ctx, w, h, wd, u, tf, scale, { x: cx, y: cy }, 0, true, 'chart', avoid);
    // the places, by name
    ctx.font = '600 11px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'left';
    const placed: [number, number, number, number][] = [[me[0] - 26, me[1] - 26, 52, 52]]; // (your boat's spot is kept clear of names)
    for (const pl of PLACES) {
      const q = tf(pl.p.x, pl.p.y); if (q[0] < -50 || q[0] > w + 50 || q[1] < -20 || q[1] > h + 20) continue;
      // (the sim's own places: the racing marks in amber, under the chart's print)
      if (!pl.buoy) { ctx.fillStyle = I.text; ctx.beginPath(); ctx.arc(q[0], q[1], 2.5, 0, 6.29); ctx.fill(); }
      const bw = ctx.measureText(pl.name).width; // (zoomed out, the names would pile up: each only where it fits)
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
    // the fog layer: what visibility it shows, and whose (or why there's none)
    const fogLine = this.fogNote(wd, false);
    if (fogLine) {
      ctx.font = '600 11px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'left';
      const fw = ctx.measureText(fogLine).width; ctx.fillStyle = I.halo; ctx.fillRect(10, 8, fw + 12, 18);
      ctx.fillStyle = I.text; ctx.fillText(fogLine, 16, 21);
    }
    // north, the wind, and a scale bar
    ctx.fillStyle = I.text; ctx.font = '700 12px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('N', w - 28, 22); ctx.beginPath(); ctx.moveTo(w - 28, 28); ctx.lineTo(w - 23, 42); ctx.lineTo(w - 33, 42); ctx.closePath(); ctx.fill();
    const wf = wd.wind.from * D2R, ox = w - 28, oy = 80;
    ctx.strokeStyle = '#ffb627'; ctx.fillStyle = '#ffb627'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(ox + Math.sin(wf) * 18, oy - Math.cos(wf) * 18); ctx.lineTo(ox - Math.sin(wf) * 12, oy + Math.cos(wf) * 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox - Math.sin(wf) * 18, oy + Math.cos(wf) * 18); ctx.lineTo(ox - Math.sin(wf) * 10 + Math.cos(wf) * 6, oy + Math.cos(wf) * 10 + Math.sin(wf) * 6); ctx.lineTo(ox - Math.sin(wf) * 10 - Math.cos(wf) * 6, oy + Math.cos(wf) * 10 - Math.sin(wf) * 6); ctx.closePath(); ctx.fill();
    ctx.font = '600 10px "Saira Semi Condensed", sans-serif'; ctx.fillText(`WIND ${Math.round(wd.wind.kt)} KT`, ox - 6, oy + 34);
    const nmPx = 1852 * scale, bar = nmPx > 240 ? nmPx / 10 : nmPx > 120 ? nmPx / 2 : nmPx, lab = nmPx > 240 ? '0.1 nm' : nmPx > 120 ? '0.5 nm' : '1 nm';
    ctx.strokeStyle = I.text; ctx.fillStyle = I.text; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(16, h - 18); ctx.lineTo(16 + bar, h - 18); ctx.moveTo(16, h - 23); ctx.lineTo(16, h - 13); ctx.moveTo(16 + bar, h - 23); ctx.lineTo(16 + bar, h - 13); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillText(lab, 20 + bar, h - 14);
    ctx.font = '9px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'right';
    const cw = ctx.measureText(chartCredit()).width; ctx.fillStyle = I.deep; ctx.globalAlpha = 0.85; ctx.fillRect(w - cw - 16, h - 19, cw + 12, 15);
    ctx.fillStyle = I.text; ctx.globalAlpha = 1; ctx.fillText(chartCredit(), w - 10, h - 8);
  }

  /** The sea state, remembered for ten seconds of the race at each spot (it's worked out from the wind, current and fetch). */
  private seaCache = new Map<string, SeaHere>(); private seaT = -1;
  private seaAt(wd: World, p: Vec): SeaHere | null {
    if (wd.sea.flat) return null;
    const tb = Math.floor(wd.t / 10); if (tb !== this.seaT) { this.seaCache.clear(); this.seaT = tb; }
    if (onLand(p)) return null;
    const k = `${Math.round(p.x)},${Math.round(p.y)}`; let v = this.seaCache.get(k);
    if (!v) { v = wd.seaHere(p); if (this.seaCache.size > 5000) this.seaCache.clear(); this.seaCache.set(k, v); }
    return v;
  }

  /** The fog layer's line of words: the visibility here and whose it is, or why there's none. */
  fogNote(wd: World, short: boolean): string | null {
    if (!layerOn(wd.settings, 'fog')) return null;
    const v = visibilityFor(wd.raceDate, wd.clockUtc);
    if ('none' in v) return short ? (v.noFog ? 'NO FOG FORECAST · NWS' : 'FOG: NO DATA') : `Fog: ${v.none}`;
    if (v.source === 'observed') { const m = v.points[0].m; return short ? `VIS ${nm(m, v.cap).toUpperCase()} AT PIER 17` : `Visibility ${nm(m, v.cap)} at Pier 17: ${v.says}.`; }
    if (v.source === 'outlook') { const w = v.words!(wd.user); return short ? (w ? `${w.toUpperCase()} · NWS` : w === '' ? 'NO FOG HERE · NWS' : 'FOG: OFF THE GRID') : `${w ? w[0].toUpperCase() + w.slice(1) : w === '' ? 'No fog' : 'Nothing'} here: ${v.says}.`; }
    const m = v.at(wd.user);
    if (!Number.isFinite(m)) return short ? 'FOG: OFF THE NWS GRID' : `Fog: you're beyond the NWS forecast grid (${v.says}).`;
    return short ? `VIS ${nm(m, v.cap).toUpperCase()} · NWS` : `Visibility ${nm(m, v.cap)} here: ${v.says}.`;
  }


  private chartBody(ctx: CanvasRenderingContext2D, w: number, h: number, wd: World, u: Boat, tf: Tf, scale: number, ctr: Vec, W: number, labels: boolean, detail: 'inset' | 'chart', avoid: [number, number, number, number][] = []): void {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    const S = wd.settings, pal = S.chartPal ?? 'day', I = INK[pal], on = (k: LayerKey) => layerOn(S, k), half = Math.max(w, h) / scale * 0.75;
    drawEncChart(ctx, tf, scale, w, h, pal, detail, avoid); // NOAA's chart underneath everything the sim draws
    if (on('sea')) drawSea(ctx, tf, p => this.seaAt(wd, p), ctr, half, I, detail === 'chart');
    if (on('wind')) { // the wind across the course: where it blows harder and lighter, and which way; and the puffs and lulls
      drawWindField(ctx, tf, p => { const f = wd.fieldAt(p); return { k: f.k / Math.max(0.3, wd.fieldMeanK), from: wd.wind.from + f.turn }; }, ctr.x, ctr.y, half, Math.max(250, half / 7), onLand, I);
      drawPuffs(ctx, tf, wd.puffs.cells, wd.puffs.dir, wd.puffs.gustiness, I);
    }
    const fog = on('fog') ? visibilityFor(wd.raceDate, wd.clockUtc) : null;
    if (fog && !('none' in fog)) drawFog(ctx, tf, fog, ctr, half, I, detail === 'chart');
    drawEncLand(ctx, tf, pal);
    if (fog && !('none' in fog)) drawFog(ctx, tf, fog, ctr, half, I, detail === 'chart', 'marks');
    // the current across the water around you, from the sim's own current field
    if (on('current')) drawCurrentArrows(ctx, tf, p => wd.currentAt(p), ctr.x, ctr.y, half, Math.max(60, half / 4), 9, onLand, I);
    if (wd.freeSail) drawSailing(ctx, tf, wd.dest, u, w, h, I);
    else drawCourse(ctx, wd.C, !!S.aids, tf, scale, u.leg < wd.C.marks.length ? u.leg : -1, I);
    if (on('laylines')) drawLaylines(ctx, tf, laylinesFor(wd, u), wd.freeSail ? 2500 : 450, 1.2, I);
    // ships and ferries: their hull to scale (at least a few pixels), a heading line, and the name when zoomed in
    if (on('ships')) for (const v of wd.vessels) {
      const ty = VESSEL[v.kind], u2 = V(v.h), a = tf(v.x + u2.x * ty.len / 2, v.y + u2.y * ty.len / 2), b2 = tf(v.x - u2.x * ty.len / 2, v.y - u2.y * ty.len / 2);
      const bw = Math.max(3.5, ty.beam * scale);
      ctx.lineCap = 'round';
      ctx.strokeStyle = I.shipHalo; ctx.lineWidth = bw + 3; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke();
      ctx.strokeStyle = I.ship; ctx.lineWidth = bw; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke(); ctx.lineCap = 'butt';
      if (v.moving) { const f = tf(v.x + u2.x * (ty.len / 2 + v.v * 60), v.y + u2.y * (ty.len / 2 + v.v * 60)); ctx.strokeStyle = I.ship; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(f[0], f[1]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      if (labels) { ctx.font = '600 9px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'left'; ctx.lineWidth = 3; ctx.strokeStyle = I.shipHalo; const lx = (a[0] + b2[0]) / 2 + 6, ly = (a[1] + b2[1]) / 2 - 6; ctx.strokeText(ty.name, lx, ly); ctx.fillStyle = I.shipText; ctx.fillText(ty.name, lx, ly); }
    }
    if (on('shadows') && !wd.freeSail) for (const b of wd.boats) drawWindShadow(ctx, tf, b); // where each boat's dirty air goes
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
 * Just sailing, on the map: the buoys around you, and where you're heading. If that's off the map, an arrow at the
 * edge points to it.
 */
function drawSailing(ctx: CanvasRenderingContext2D, tf: Tf, dest: CourseMark | null, u: Boat, w: number, h: number, I: Ink): void {
  // the racing marks and buoys the sim knows (the chart draws the real ones under them): small orange rings
  for (const pl of PLACES) if (pl.buoy) {
    const s = tf(pl.p.x, pl.p.y);
    ctx.strokeStyle = I.halo; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(s[0], s[1], 3, 0, 6.29); ctx.stroke();
    ctx.strokeStyle = I.mark; ctx.lineWidth = 1.6; ctx.stroke();
  }
  if (!dest) return;
  const a = tf(u.x, u.y), b = tf(dest.p.x, dest.p.y), inside = b[0] > 8 && b[0] < w - 8 && b[1] > 8 && b[1] < h - 8;
  ctx.save();
  ctx.strokeStyle = I.halo; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  ctx.setLineDash([5, 4]); ctx.strokeStyle = I.line; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.restore();
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
