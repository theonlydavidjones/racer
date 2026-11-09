import { bow, type Boat } from '../boat/boat';
import { polar } from '../boat/polar';
import { D2R, KT, V, brg, clamp, dist, dot, sub, unit, wrap } from '../core/math';
import { cpa, situationText } from '../rules';
import type { World } from '../sim/world';
import { $ } from './dom';
import { drawCourse, drawLand, fitCanvas, makeTf, type Tf } from './draw2d';

export function fmtClock(t: number): string {
  const a = Math.abs(t), m = Math.floor(a / 60), s = Math.floor(a % 60);
  return (t < 0 ? '' : '+') + m + ':' + String(s).padStart(2, '0');
}
export const sideWord = (s: string) => s === 's' ? 'stbd' : 'port';

/** Instrument pods, wind dial, course map, situation banner and line-aid readout. Redraws at 10 Hz. */
export class Hud {
  private acc = 0;
  mapZoom = false;
  private dialC = $<HTMLCanvasElement>('dial');
  private mapC = $<HTMLCanvasElement>('map');

  update(w: World, dt: number): void {
    this.acc += dt; if (this.acc < 0.1) return; this.acc = 0;
    const u = w.user, ww = u.ww, m = w.nextMark(u);
    $('clock').textContent = fmtClock(w.t);
    $('clockLab').textContent = w.t < 0 ? 'Start in' : 'Race time';
    $('clockSub').textContent = w.t < 0 ? (w.t > -10 ? 'Build speed' : w.t > -60 ? 'Final minute' : 'Pre-start') :
      u.finished ? 'Finished' : u.ocs ? 'OCS · return' : !u.started ? 'Not started' : m ? `Next ${m.name.split(' ')[0]} · ${sideWord(m.side)}` : 'To finish';
    $('spd').textContent = (u.v / KT).toFixed(1);
    $('sog').textContent = 'SOG ' + (Math.hypot(u.vx, u.vy) / KT).toFixed(1) + ' kt';
    $('hdg').textContent = String(Math.round(u.h) % 360).padStart(3, '0');
    $('tackLab').textContent = (u.tack === 'S' ? 'Starboard' : 'Port') + (u.penalty > 0 ? ' · turns ' + Math.ceil(u.penalty / 360) : '');
    $('twd').textContent = String(Math.round(ww.from) % 360).padStart(3, '0');
    const dev = wrap(w.wind.from - w.avgFrom), lifted = u.tack === 'S' ? dev > 0 : dev < 0, sl = $('shiftLab');
    if (Math.abs(dev) >= 2 && u.twa < 70) { sl.textContent = (lifted ? 'Lift ' : 'Header ') + Math.abs(dev).toFixed(0) + '°'; sl.className = 'sub ' + (lifted ? 'lift' : 'head'); }
    else { sl.textContent = ww.kt.toFixed(0) + ' kt on water'; sl.className = 'sub'; }
    $('bTack').textContent = u.twa < 100 ? 'Tack' : 'Gybe';
    this.situation(w, u); this.lineBox(w, u); this.dial(u); this.map(w, u);
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
    $('situMsg').textContent = situationText(r.rule, kc, o.name) + (risk && c.t < 8 && c.d < 9 ? ` Collision in ${c.t.toFixed(0)} s.` : '');
    $('situRule').textContent = 'Rule ' + r.rule;
    el.className = (kc ? 'kc' : 'row') + (kc && risk && c.t < 6 && c.d < 8 ? ' alarm' : '');
  }

  /** Before the start: distance / time to line, time to burn, favored end. After: next mark range and bearing. */
  private lineBox(w: World, u: Boat): void {
    const el = $('linebox'), C = w.C;
    if (u.finished) { el.hidden = true; return; }
    el.hidden = false;
    if (w.t < 0 || u.ocs || !u.started) {
      const d = w.lineD(bow(u)), vn = u.vx * w.N.x + u.vy * w.N.y;
      let fav = '';
      if (w.settings.aids) {
        // the end closer to the wind on the water is favored
        const k = dot(sub(w.pin, w.committee), V(u.ww.from)) / w.lineLen, deg = Math.asin(clamp(Math.abs(k), 0, 1)) / D2R;
        fav = deg < 2 ? ' · <span class="fav">Square line</span>' : ` · <span class="fav">${k > 0 ? C.pinLabel : C.committeeLabel} end favored ${deg.toFixed(0)}°</span>`;
      }
      if (d > 0) { el.className = 'over'; el.innerHTML = w.t < 0 ? `Over the line by ${d.toFixed(0)} m · get back` : 'OCS · dip back below the line'; return; }
      el.className = '';
      const tl = vn > 0.15 ? -d / vn : Infinity;
      const tStr = isFinite(tl) ? `${tl.toFixed(0)} s to line` : 'sailing away';
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
    const a0 = (u.rel - 90) * D2R;
    // no-go zone
    ctx.fillStyle = 'rgba(255,93,76,.22)';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0 - 42 * D2R, a0 + 42 * D2R); ctx.closePath(); ctx.fill();
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
    const m = wd.nextMark(u);
    if (wd.settings.aids && m && m.beat && u.started) {
      // laylines to the next windward mark, allowing for current at the mark
      const ww = u.ww, vs = polar(ww.kt, 42), c = wd.currentAt(m.p), mk = tf(m.p.x, m.p.y);
      ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(233,242,245,.4)'; ctx.lineWidth = 1;
      for (const hh of [ww.from - 42, ww.from + 42]) {
        const uu = V(hh), g = unit({ x: uu.x * vs + c.x, y: uu.y * vs + c.y });
        const e = tf(m.p.x - g.x * 450, m.p.y - g.y * 450);
        ctx.beginPath(); ctx.moveTo(mk[0], mk[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
      }
      ctx.setLineDash([]);
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
    if (wd.cur.kt > 0) {
      const cb = (wd.cur.set - W) * D2R, ox = w - 18, oy = 16;
      ctx.strokeStyle = '#6fd0ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ox - Math.sin(cb) * 8, oy + Math.cos(cb) * 8); ctx.lineTo(ox + Math.sin(cb) * 8, oy - Math.cos(cb) * 8); ctx.stroke();
      ctx.fillStyle = '#6fd0ff'; ctx.beginPath(); ctx.arc(ox + Math.sin(cb) * 8, oy - Math.cos(cb) * 8, 2.5, 0, 6.29); ctx.fill();
      ctx.textAlign = 'right'; ctx.fillText(wd.cur.kt.toFixed(1) + ' kt', w - 6, h - 6);
    }
  }
}
