import { beatFor, seaDrag, steadySpeed } from '../boat/seaway';
import { bow, type Boat } from '../boat/boat';
import { timeToCover } from '../boat/dynamics';
import { polar } from '../boat/polar';
import { sailPlan } from '../boat/physics';
import type { SailTrim } from '../boat/trim';
import { D2R, KT, V, brg, clamp, dist, dot, n360, sub, wrap } from '../core/math';
import { HAIL_RESPONSE, cpa, situationText } from '../rules';
import type { World } from '../sim/world';
import { $ } from './dom';
import { flagCanvas } from '../render/flags';
import { FLAG_NAME } from '../sim/signals';
import { VESSEL } from '../sim/traffic';
import { transitOffset } from '../sim/transits';
import { targetShape, type Shape } from '../boat/controls';

/** "Main: a bit full (outhaul, backstay) · draft aft (Cunningham)": what's off in each sail's shape and the line that fixes it. */
function shapeWords(u: Boat): string {
  const tws = u.ww.kt, parts: string[] = [];
  const one = (name: 'main' | 'jib', s: Shape | null) => {
    if (!s) return;
    const t = targetShape(name, tws, u.awa), out: string[] = [];
    const main = name === 'main';
    if (s.depth > t.depth + 0.012) out.push(`too full (${main ? 'outhaul, backstay' : 'backstay'} on)`);
    else if (s.depth < t.depth - 0.012) out.push(`too flat (ease ${main ? 'outhaul, backstay' : 'backstay'})`);
    if (s.draft > t.draft + 0.04) out.push(`draft aft (${main ? 'Cunningham, downhaul' : 'jib Cunningham'} on)`);
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
import { drawCourse, drawCurrentArrows, drawLand, drawPuffs, drawLaylines, fitCanvas, makeTf, type Tf } from './draw2d';
import { onLand } from '../geo/shore';
import { laylinesFor } from '../sim/laylines';

export function fmtClock(t: number): string {
  const a = Math.abs(t), m = Math.floor(a / 60), s = Math.floor(a % 60);
  return (t < 0 ? '' : '+') + m + ':' + String(s).padStart(2, '0');
}
export const sideWord = (s: string) => s === 's' ? 'stbd' : 'port';

/** Instrument pods, wind dial, course map, situation banner and line-aid readout. Redraws at 10 Hz. */
export class Hud {
  private acc = 0;
  mapZoom = false;
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
    if (m) marker(brg(m.p.x - u.x, m.p.y - u.y), '#ffd21a', m.name.split(' ')[0], true);
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

  private sigKey = '';
  private toldHelm = false;
  /** The race committee's flags flying now, what they mean, and the next signal. */
  private signals(w: World): void {
    const show = !w.freeSail && (w.t < 8 || w.flags.includes('X') || !!w.user.roundEnd);
    const el = $('sigPanel'); el.hidden = !show; if (!show) return;
    const key = w.flags.join(',');
    if (key !== this.sigKey) {
      this.sigKey = key;
      const box = $('sigFlags'); box.innerHTML = '';
      for (const f of w.flags) { const c = document.createElement('canvas'); c.width = 66; c.height = 44; c.getContext('2d')!.drawImage(flagCanvas(f), 0, 0, 66, 44); c.title = FLAG_NAME[f]; box.appendChild(c); }
      if (!w.flags.length) box.textContent = 'none';
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
    $('clockSub').textContent = w.clock + ' · ' + (w.freeSail ? 'Just sail' : w.t < 0 ? (w.t > -10 ? 'Build speed' : w.t > -60 ? 'Final minute' : 'Pre-start') :
      u.finished ? 'Finished' : u.ocs ? 'OCS · return' : !u.started ? 'Not started' : m ? `Next ${m.name.split(' ')[0]} · ${sideWord(m.side)}` : 'To finish');
    $('spd').textContent = (u.v / KT).toFixed(1);
    $('sog').textContent = 'SOG ' + (Math.hypot(u.vx, u.vy) / KT).toFixed(1) + ' kt';
    $('hdg').textContent = String(Math.round(u.h) % 360).padStart(3, '0');
    const poleTxt = u.pole === 'set' ? (u.poleTack === u.tack ? ' · wing' : '') : u.pole === 'setting' ? ' · poling' : u.pole === 'stowing' ? ' · stowing' : '';
    $('tackLab').textContent = (u.tack === 'S' ? 'Starboard' : 'Port') + (u.penalty > 0 ? ' · turns ' + Math.ceil(u.penalty / 360) : poleTxt);
    const bp = $('bPole');
    bp.textContent = u.pole === 'down' ? 'Pole out' : u.pole === 'set' ? 'Pole in' : u.pole === 'setting' ? 'Poling…' : 'Stowing…';
    bp.classList.toggle('on', u.pole === 'set' || u.pole === 'setting');
    this.poleHints(w, u);
    this.trimPanel(u);
    $('twd').textContent = String(Math.round(ww.from) % 360).padStart(3, '0');
    // the sea where you are: chop height (what slows you), and the swell
    { const s = u.sea, ft = (m: number) => (m / 0.3048).toFixed(1) + ' ft';
      $('seaVal').textContent = s.hsW < 0.03 && s.hsS < 0.03 ? 'Flat' : ft(s.hsW);
      $('seaSub').textContent = (s.hsW < 0.05 ? 'glassy' : s.steep > 0.075 ? 'steep chop' : 'chop') + (s.hsS >= 0.05 ? ` · swell ${ft(s.hsS)}` : ''); }
    const dev = wrap(w.wind.from - w.avgFrom), lifted = u.tack === 'S' ? dev > 0 : dev < 0, sl = $('shiftLab');
    if (Math.abs(dev) >= 2 && u.twa < 70) { sl.textContent = (lifted ? 'Lift ' : 'Header ') + Math.abs(dev).toFixed(0) + '°'; sl.className = 'sub ' + (lifted ? 'lift' : 'head'); }
    else {
      // in a puff or a lull?
      const k = w.puffs.at(u).k;
      sl.textContent = ww.kt.toFixed(0) + ' kt on water' + (k > 1.08 ? ' · puff' : k < 0.92 ? ' · lull' : '');
      sl.className = 'sub' + (k > 1.08 ? ' lift' : '');
    }
    this.situation(w, u); this.lineBox(w, u); this.dial(u); this.map(w, u);
  }

  /** How each sail is drawing, in words, with what to do about it. */
  private trimPanel(u: Boat): void {
    const word = (t: SailTrim | null, off: string) => !t ? [off, 'off'] : t.flow === 'good' ? ['Good', 'good'] : t.flow === 'luffing' ? ['Luffing', 'luffing'] : ['Stalled', 'stalled'];
    const plan = sailPlan(u);
    const [mw, mc] = u.luff ? ['Eased', 'off'] : word(u.trim.main, '');
    const [jw, jc] = u.luff ? ['Eased', 'off'] : word(u.trim.jib, plan === 'wing' ? 'Poled out' : 'Down');
    const tm = $('tpMain'), tj = $('tpJib');
    tm.textContent = mw; tm.className = 'tp-state ' + mc;
    tj.textContent = jw; tj.className = 'tp-state ' + jc;
    // the sails' shape against the best shape for the conditions, and which line fixes it
    const sw = shapeWords(u);
    $('tpShape').innerHTML = sw;
    // heel and helm balance: what the boat feels like on the tiller
    { const heel = Math.round(u.heelMag ?? 0), hn = u.helmNeed ?? 0, up = u.twa < 70;
      const helm = Math.abs(hn) < 0.8 ? 'neutral' : hn > 0 ? `${hn.toFixed(0)}° weather` : `${(-hn).toFixed(0)}° lee`;
      const advice = u.luff ? '' : hn > 5 ? (up ? ' · overpowered: backstay on, traveller down, flatten' : ' · ease the main or vang') : hn < -1.5 ? ' · lee helm: traveller up, ease backstay, fuller sails' : heel > 24 && up ? ' · heeling too far: depower' : '';
      if (!this.toldHelm && hn > 3.5 && up && !u.luff) { this.toldHelm = true; toast(`Weather helm: she wants to round up into the wind. Let go of the tiller and she will. Hold the tiller a little to windward to sail straight, or take the helm off her: backstay on, traveller down (Trim coach explains).`, 6000); }
      $('tpBalance').innerHTML = `Heel <b>${heel}°</b> · Helm <b class="${hn > 5 || hn < -1.5 ? 'warn' : ''}">${helm}</b><span class="warn">${advice}</span>`; }
    const bad = [u.trim.jib, u.trim.main].find(t => t && t.flow !== 'good' && t.amount > 0.1);
    $('tpHint').textContent = u.luff || u.awa > 115 || !bad ? ''
      : bad.flow === 'luffing' ? (u.manualTrim ? 'Windward telltales lifting: trim in, or bear away.' : 'Windward telltales lifting: bear away a little.')
      : (u.manualTrim ? 'Leeward telltales drooping: ease, or head up.' : 'Leeward telltales drooping: head up a little.');
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
      el.textContent = `Target ${(target / KT).toFixed(1)} kt at ${Math.round(u.twa)}° · you ${pct}%` + (u.twa < 70 ? ` · VMG upwind ${vmg.toFixed(1)} kt` : u.twa > 110 ? ` · VMG downwind ${(-vmg).toFixed(1)} kt` : '');
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
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    drawPuffs(ctx, tf, wd.puffs.cells, wd.puffs.dir, wd.puffs.gustiness);
    drawLand(ctx, tf);
    { // the current across the water around you, from the sim's own current field
      const half = Math.max(w, h) / scale * 0.75, mid = ctr;
      drawCurrentArrows(ctx, tf, p => wd.currentAt(p), mid.x, mid.y, half, Math.max(60, half / 4), 9, onLand);
    }
    drawCourse(ctx, wd.C, !!wd.settings.aids, tf, scale, u.leg < wd.C.marks.length ? u.leg : -1);
    if (wd.settings.aids) drawLaylines(ctx, tf, laylinesFor(wd, u), 450);
    // ships and ferries: their hull to scale (at least a few pixels), a heading line, and the name when zoomed in
    for (const v of wd.vessels) {
      const ty = VESSEL[v.kind], u2 = V(v.h), a = tf(v.x + u2.x * ty.len / 2, v.y + u2.y * ty.len / 2), b2 = tf(v.x - u2.x * ty.len / 2, v.y - u2.y * ty.len / 2);
      ctx.strokeStyle = 'rgba(230,230,225,.9)'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(3, ty.beam * scale);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b2[0], b2[1]); ctx.stroke(); ctx.lineCap = 'butt';
      if (v.moving) { const f = tf(v.x + u2.x * (ty.len / 2 + v.v * 60), v.y + u2.y * (ty.len / 2 + v.v * 60)); ctx.strokeStyle = 'rgba(230,230,225,.45)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(f[0], f[1]); ctx.stroke(); ctx.setLineDash([]); }
      if (this.mapZoom) { ctx.fillStyle = 'rgba(230,230,225,.85)'; ctx.font = '9px system-ui, sans-serif'; ctx.fillText(ty.name, (a[0] + b2[0]) / 2 + 6, (a[1] + b2[1]) / 2 - 6); }
    }
    for (const b of wd.boats) {
      const p = tf(b.x, b.y), s = b.isUser ? 5 : 4;
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate((b.h - W) * D2R);
      ctx.fillStyle = b.color; ctx.beginPath(); ctx.moveTo(0, -s * 1.6); ctx.lineTo(s * 0.8, s); ctx.lineTo(-s * 0.8, s); ctx.closePath(); ctx.fill();
      if (b.isUser) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore();
    ctx.fillStyle = '#94abb7'; ctx.font = '600 9px "Saira Semi Condensed", sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('WIND ↓', 6, 12);
    const ckt = Math.hypot(u.cur.x, u.cur.y) / KT;
    if (ckt > 0.05) {
      // the current where you are
      const cb = (brg(u.cur.x, u.cur.y) - W) * D2R, ox = w - 18, oy = 16;
      ctx.strokeStyle = '#6fd0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox - Math.sin(cb) * 8, oy + Math.cos(cb) * 8); ctx.lineTo(ox + Math.sin(cb) * 8, oy - Math.cos(cb) * 8); ctx.stroke();
      ctx.fillStyle = '#6fd0ff'; ctx.beginPath(); ctx.arc(ox + Math.sin(cb) * 8, oy - Math.cos(cb) * 8, 2.5, 0, 6.29); ctx.fill();
      ctx.textAlign = 'right'; ctx.fillText('CURRENT HERE ' + ckt.toFixed(1) + ' kt', w - 6, h - 6);
    }
  }
}
