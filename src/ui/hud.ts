import { bow, type Boat } from '../boat/boat';
import { timeToCover } from '../boat/dynamics';
import { beatAngle, polar } from '../boat/polar';
import { sailPlan } from '../boat/physics';
import type { SailTrim } from '../boat/trim';
import { D2R, KT, V, brg, clamp, dist, dot, sub, wrap } from '../core/math';
import { HAIL_RESPONSE, cpa, situationText } from '../rules';
import type { World } from '../sim/world';
import { $ } from './dom';
import { toast } from './feedback';
import { drawCourse, drawLand, drawLaylines, fitCanvas, makeTf, type Tf } from './draw2d';
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

  update(w: World, dt: number): void {
    this.acc += dt; if (this.acc < 0.1) return; this.acc = 0;
    const u = w.user, ww = u.ww, m = w.nextMark(u);
    $('clock').textContent = fmtClock(w.t);
    $('clockLab').textContent = w.freeSail ? 'Sailing' : w.t < 0 ? 'Start in' : 'Race time';
    $('clockSub').textContent = w.freeSail ? 'Just sail' : w.t < 0 ? (w.t > -10 ? 'Build speed' : w.t > -60 ? 'Final minute' : 'Pre-start') :
      u.finished ? 'Finished' : u.ocs ? 'OCS · return' : !u.started ? 'Not started' : m ? `Next ${m.name.split(' ')[0]} · ${sideWord(m.side)}` : 'To finish';
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
    const dev = wrap(w.wind.from - w.avgFrom), lifted = u.tack === 'S' ? dev > 0 : dev < 0, sl = $('shiftLab');
    if (Math.abs(dev) >= 2 && u.twa < 70) { sl.textContent = (lifted ? 'Lift ' : 'Header ') + Math.abs(dev).toFixed(0) + '°'; sl.className = 'sub ' + (lifted ? 'lift' : 'head'); }
    else { sl.textContent = ww.kt.toFixed(0) + ' kt on water'; sl.className = 'sub'; }
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
      const target = polar(u.ww.kt, u.twa, sailPlan(u)), pct = target > 0.05 ? Math.round(100 * u.v / target) : 0;
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
    const a0 = (u.rel - 90) * D2R, ba = beatAngle(u.ww.kt) * D2R;
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
    let tf: Tf, scale: number;
    if (this.mapZoom) { scale = Math.min(w, h) / 220; tf = makeTf(u.x, u.y, W, scale, w, h); }
    else {
      const pts = [wd.pin, wd.committee].concat(wd.C.marks.map(m => m.p));
      const rot = (p: { x: number; y: number }) => { const r = Math.hypot(p.x, p.y), be = Math.atan2(p.x, p.y) - W * D2R; return { x: Math.sin(be) * r, y: Math.cos(be) * r }; };
      const rp = pts.map(rot), xs = rp.map(p => p.x), ys = rp.map(p => p.y);
      const spanX = Math.max(...xs) - Math.min(...xs) + 160, spanY = Math.max(...ys) - Math.min(...ys) + 160;
      scale = Math.min(w / spanX, h / spanY);
      const mcx = (Math.max(...xs) + Math.min(...xs)) / 2, mcy = (Math.max(...ys) + Math.min(...ys)) / 2;
      const back = { x: Math.sin(Math.atan2(mcx, mcy) + W * D2R) * Math.hypot(mcx, mcy), y: Math.cos(Math.atan2(mcx, mcy) + W * D2R) * Math.hypot(mcx, mcy) };
      tf = makeTf(back.x, back.y, W, scale, w, h);
    }
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    drawLand(ctx, tf);
    drawCourse(ctx, wd.C, !!wd.settings.aids, tf, scale, u.leg < wd.C.marks.length ? u.leg : -1);
    if (wd.settings.aids) drawLaylines(ctx, tf, laylinesFor(wd, u), 450);
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
    if (wd.cur.kt > 0) {
      const cb = (wd.cur.set - W) * D2R, ox = w - 18, oy = 16;
      ctx.strokeStyle = '#6fd0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox - Math.sin(cb) * 8, oy + Math.cos(cb) * 8); ctx.lineTo(ox + Math.sin(cb) * 8, oy - Math.cos(cb) * 8); ctx.stroke();
      ctx.fillStyle = '#6fd0ff'; ctx.beginPath(); ctx.arc(ox + Math.sin(cb) * 8, oy - Math.cos(cb) * 8, 2.5, 0, 6.29); ctx.fill();
      ctx.textAlign = 'right'; ctx.fillText(wd.cur.kt.toFixed(1) + ' kt', w - 6, h - 6);
    }
  }
}
