import { D2R, LOA, wrap } from '../core/math';
import type { Finding, Moment } from '../sim/debrief';
import type { World } from '../sim/world';
import { drawCourse, drawHull, drawLand, fitCanvas, hexA, makeTf } from '../ui/draw2d';
import type { BoatSnap, Frame } from './recorder';
import { ReplayView, type ReplayClip } from './replayView';

/**
 * The race replay: your whole race from overhead (wind up), with the debrief on it. Each thing the debrief says cost
 * you time is a coloured stretch of your track and a tick on the timeline; pick one to jump to it and watch it.
 */

/** Each finding's colour, on the track, the timeline and the list. Rule incidents ('rule') are red, as on the water. */
export const MOMENT_INK: Record<string, string> = {
  start: '#ffb627', shifts: '#6fd0ff', laylines: '#d38cff', tacks: '#ff8fb1', dirty: '#9aa5ff', lee: '#7fd38a',
  downwind: '#4fd1c5', heel: '#ff9f5a', trim: '#e6d36a', penalty: '#ff5d4c', roundings: '#c6e86a', rule: '#ff5d4c'
};
const ink = (key: string) => MOMENT_INK[key] ?? '#e9f2f5';

export interface RaceReplayData {
  frames: Frame[];
  moments: Moment[];
  findings: Finding[];
  /** The mean wind's direction (from), °: the chart is turned so it blows down the page. */
  wind: number;
  /** When you reached each mark (race time, s), for the timeline. */
  marks: { name: string; t: number }[];
  /** Rule incidents' close-up clips, by Moment.ref, and a line on what happened for each. */
  clips: { clip: ReplayClip; title: string; what: string }[];
}

const SPEEDS = [10, 30, 60];
const mmss = (t: number) => `${t < 0 ? '−' : '+'}${Math.floor(Math.abs(t) / 60)}:${String(Math.floor(Math.abs(t) % 60)).padStart(2, '0')}`;
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** A boat's place between two 1-s frames (heading the short way round). */
function lerpSnap(a: BoatSnap, b: BoatSnap, f: number): BoatSnap {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + wrap(b[2] - a[2]) * f, f < 0.5 ? a[3] : b[3], a[4] + (b[4] - a[4]) * f];
}

export class RaceReplay {
  private cv!: HTMLCanvasElement;
  private tl!: HTMLCanvasElement;
  private D: RaceReplayData | null = null;
  private w: World | null = null;
  private t = 0;
  private playing = false;
  private speed = 30;
  private follow = false;
  private sel: Moment | null = null;
  private anim = 0;
  private last = 0;
  private clipView: ReplayView | null = null;
  private dragging = false;
  /** The finding each moment belongs to, numbered as in the list (1 = cost you most). */
  private rank = new Map<string, number>();

  constructor(private root: HTMLElement) {}

  get isOpen(): boolean { return !this.root.hidden; }

  open(w: World, D: RaceReplayData): void {
    this.w = w; this.D = D;
    this.rank = new Map(D.findings.map((f, i) => [f.key, i + 1]));
    this.root.innerHTML = `<div class="panel rrPanel" role="dialog" aria-modal="true" aria-labelledby="rrTitle">
  <div class="rrHead"><div><div class="eyebrow">Race replay</div><h2 id="rrTitle">Your race, debriefed</h2></div>
    <button class="ghost" type="button" data-rr="close">Close</button></div>
  <div class="rrGrid">
    <div class="rrMain">
      <canvas class="rrCanvas"></canvas>
      <div class="rrBar">
        <button class="ghost rrBtn" type="button" data-rr="prev" title="The moment before">◀</button>
        <button class="ghost rrBtn rrPlay" type="button" data-rr="play">Play</button>
        <button class="ghost rrBtn" type="button" data-rr="next" title="The next moment">▶</button>
        <div class="seg rrSpeed">${SPEEDS.map(s => `<button type="button" data-sp="${s}" aria-pressed="${s === this.speed}">${s}×</button>`).join('')}</div>
        <button class="ghost rrBtn" type="button" data-rr="view">Follow you</button>
        <span class="rrClock"></span>
      </div>
      <canvas class="rrTime"></canvas>
      <div class="rrCaption"></div>
    </div>
    <div class="debrief rrList">${this.listHtml()}</div>
  </div>
</div>`;
    this.cv = this.root.querySelector('.rrCanvas')!;
    this.tl = this.root.querySelector('.rrTime')!;
    this.root.hidden = false;
    this.root.onclick = e => this.click(e);
    this.tl.onpointerdown = e => { this.dragging = true; this.tl.setPointerCapture(e.pointerId); this.scrub(e, true); };
    this.tl.onpointermove = e => { if (this.dragging) this.scrub(e, false); };
    this.tl.onpointerup = () => { this.dragging = false; };
    this.follow = false; this.sel = null; this.t = D.frames[0]?.t ?? 0;
    this.caption();
    this.setPlaying(true);
  }

  close(): void {
    this.setPlaying(false); this.clipView?.stop(); this.clipView = null;
    this.root.hidden = true; this.root.innerHTML = '';
  }

  /** The list: the debrief's findings, numbered and coloured as on the track; then the rule incidents. */
  private listHtml(): string {
    const D = this.D!, total = D.findings.reduce((a, f) => a + f.lost, 0);
    const has = (key: string) => D.moments.some(m => m.key === key);
    const items = D.findings.map((f, i) => `<li class="${has(f.key) ? 'rrPick' : ''}" data-key="${f.key}" ${has(f.key) ? 'tabindex="0"' : ''}>
      <div class="dbHead"><b><span class="rrNo" style="background:${ink(f.key)}">${i + 1}</span>${esc(f.title)}</b><span class="dbLost">${f.key === 'start' && f.lost < 2 ? 'on time' : `−${f.lost} s`}</span></div>
      <p>${esc(f.detail)}</p><p class="dbTip">${esc(f.tip)}</p></li>`).join('');
    const rules = D.moments.filter(m => m.key === 'rule').map(m => `<li class="rrPick" data-at="${m.t1}" tabindex="0">
      <div class="dbHead"><b><span class="rrNo" style="background:${ink('rule')}">!</span>${esc(m.text)}</b><span class="dbLost">${mmss(m.t1)}</span></div></li>`).join('');
    return `<p class="lede">${D.findings.length ? `What cost you time, most first: about ${total} s in all. Pick one to see it on the water.` : 'Nothing cost you more than a couple of seconds.'}</p>
      <ol>${items}</ol>${rules ? `<div class="eyebrow">Rule incidents</div><ol>${rules}</ol>` : ''}`;
  }

  private click(e: MouseEvent): void {
    const el = e.target as HTMLElement, D = this.D!;
    const b = el.closest<HTMLElement>('[data-rr]')?.dataset.rr;
    if (b === 'close') { this.close(); return; }
    if (b === 'play') { this.clipView?.stop(); this.clipView = null; if (this.t >= this.end()) this.t = D.frames[0].t; this.setPlaying(!this.playing); return; }
    if (b === 'prev' || b === 'next') { this.step(b === 'next' ? 1 : -1); return; }
    if (b === 'view') { this.follow = !this.follow; this.paintButtons(); this.draw(); return; }
    if (b === 'clip' && this.sel?.ref != null) { this.playClip(this.sel.ref); return; }
    const sp = el.closest<HTMLElement>('[data-sp]')?.dataset.sp;
    if (sp) { this.speed = +sp; this.paintButtons(); return; }
    const li = el.closest<HTMLElement>('li.rrPick');
    if (li) {
      if (li.dataset.at) { const m = D.moments.find(x => x.key === 'rule' && x.t1 === +li.dataset.at!); if (m) this.pick(m); return; }
      // a finding: its worst moment
      const ms = D.moments.filter(m => m.key === li.dataset.key).sort((a, b) => b.lost - a.lost);
      if (ms.length) this.pick(ms[0]);
    }
  }

  /** Jump to a moment: close in on you, from a little before it, and play it. */
  pick(m: Moment): void {
    this.clipView?.stop(); this.clipView = null;
    this.sel = m; this.follow = true;
    this.t = Math.max(this.D!.frames[0].t, m.t0 - 10);
    this.caption(); this.paintButtons(); this.setPlaying(true);
  }

  private step(dir: 1 | -1): void {
    const ms = this.D!.moments, cur = this.sel ? this.sel.t0 : this.t;
    const m = dir > 0 ? ms.find(x => x.t0 > cur + 0.5) : [...ms].reverse().find(x => x.t0 < cur - 0.5);
    if (m) this.pick(m);
  }

  private playClip(ref: number): void {
    const c = this.D!.clips[ref]; if (!c) return;
    this.setPlaying(false);
    this.clipView = new ReplayView(this.cv); this.clipView.play(this.w!, c.clip);
  }

  private end(): number { const F = this.D!.frames; return F[F.length - 1]?.t ?? 0; }

  private scrub(e: PointerEvent, down: boolean): void {
    const D = this.D!, r = this.tl.getBoundingClientRect(), [x0, x1] = this.span(r.width);
    const t = D.frames[0].t + (e.clientX - r.left - x0) / (x1 - x0) * (this.end() - D.frames[0].t);
    this.clipView?.stop(); this.clipView = null;
    if (down) {
      // a click on (or near) a tick picks that moment
      const near = D.moments.find(m => Math.abs(this.tx(m.t0, r.width) - (e.clientX - r.left)) < 7 || (t >= m.t0 && t <= m.t1 && m.t1 - m.t0 > 5));
      if (near && e.clientY - r.top < 30) { this.dragging = false; this.pick(near); return; }
      this.setPlaying(false);
      // scrubbing elsewhere lets go of the picked moment (its caption would no longer match what's shown)
      if (this.sel) { this.sel = null; this.caption(); this.paintButtons(); }
    }
    this.t = Math.min(this.end(), Math.max(D.frames[0].t, t));
    this.draw();
  }

  private setPlaying(on: boolean): void {
    this.playing = on; cancelAnimationFrame(this.anim);
    this.paintButtons();
    if (on) { this.last = performance.now(); this.anim = requestAnimationFrame(this.tick); } else this.draw();
  }
  private tick = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    // a picked moment plays at a watchable pace (a few times real time), the rest at the chosen speed
    const near = this.sel && this.follow && this.t < this.sel.t1 + 5;
    this.t += dt * (near ? Math.min(this.speed, 6) : this.speed);
    if (this.t >= this.end()) { this.t = this.end(); this.playing = false; this.paintButtons(); this.draw(); return; }
    this.draw();
    this.anim = requestAnimationFrame(this.tick);
  };

  private paintButtons(): void {
    const q = (s: string) => this.root.querySelector<HTMLElement>(s);
    const p = q('[data-rr="play"]'); if (p) p.textContent = this.playing ? 'Pause' : 'Play';
    const v = q('[data-rr="view"]'); if (v) v.textContent = this.follow ? 'Whole course' : 'Follow you';
    this.root.querySelectorAll<HTMLElement>('[data-sp]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.sp! === this.speed)));
    this.root.querySelectorAll<HTMLElement>('li[data-key]').forEach(li => li.classList.toggle('on', this.sel?.key === li.dataset.key));
  }

  private caption(): void {
    const el = this.root.querySelector<HTMLElement>('.rrCaption'); if (!el) return;
    const m = this.sel;
    if (!m) { el.innerHTML = '<span class="lede">Pick a finding, a tick on the timeline, or ◀ ▶ to go from one moment to the next. Your track is coloured where it cost you time.</span>'; return; }
    const n = m.key === 'rule' ? '!' : this.rank.get(m.key) ?? '·', c = m.ref != null ? this.D!.clips[m.ref] : null;
    el.innerHTML = `<span class="rrNo" style="background:${ink(m.key)}">${n}</span><span><b>${m.key === 'start' ? 'The start' : mmss(m.key === 'rule' ? m.t1 : m.t0)}</b> ${esc(c ? `${c.title}. ${c.what}` : m.text)}${m.lost >= 1 ? ` <span class="dbLost">about −${Math.round(m.lost)} s</span>` : ''}</span>${c ? '<button class="ghost rrBtn" type="button" data-rr="clip">Close-up</button>' : ''}`;
  }

  /* ---------- drawing ---------- */

  /** Every boat where she was at time t. */
  private at(t: number): BoatSnap[] {
    const F = this.D!.frames;
    let lo = 0, hi = F.length - 1;
    if (t <= F[0].t) return F[0].b;
    if (t >= F[hi].t) return F[hi].b;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (F[mid].t <= t) lo = mid; else hi = mid; }
    const f = (t - F[lo].t) / (F[hi].t - F[lo].t || 1);
    return F[lo].b.map((s, i) => lerpSnap(s, F[hi].b[i] ?? s, f));
  }

  private draw(): void {
    if (!this.D || !this.w || this.root.hidden || this.clipView) return;
    const w = this.w, D = this.D, F = D.frames, W = D.wind, u = w.user.id;
    const [ctx, wpx, hpx] = fitCanvas(this.cv);
    const now = this.at(this.t), me = now[u];
    // the view: the whole course (your track and the marks), or close round you
    let cx: number, cy: number, scale: number;
    if (this.follow) { scale = Math.min(wpx, hpx) / 320; cx = me[0]; cy = me[1]; }
    else {
      const pts = [...F.map(f => f.b[u]).filter(Boolean).map(p => ({ x: p[0], y: p[1] })), ...w.C.marks.map(m => m.p), w.C.pin, w.C.committee];
      // the extent across and along the wind, in the turned frame
      const s = Math.sin(W * D2R), c = Math.cos(W * D2R), ac = pts.map(p => p.x * c - p.y * s), al = pts.map(p => p.x * s + p.y * c);
      const a0 = Math.min(...ac), a1 = Math.max(...ac), l0 = Math.min(...al), l1 = Math.max(...al);
      scale = Math.min(wpx / Math.max(150, (a1 - a0) * 1.12), hpx / Math.max(150, (l1 - l0) * 1.12));
      const am = (a0 + a1) / 2, lm = (l0 + l1) / 2;
      cx = am * c + lm * s; cy = -am * s + lm * c;
    }
    const tf = makeTf(cx, cy, W, scale, wpx, hpx), P = (p: BoatSnap) => tf(p[0], p[1]);
    ctx.fillStyle = '#0c2534'; ctx.fillRect(0, 0, wpx, hpx);
    if (this.follow) { // boat-length grid, close in
      ctx.strokeStyle = 'rgba(150,196,218,.07)'; ctx.lineWidth = 1; const g = LOA * scale;
      for (let gx = (wpx / 2) % g; gx < wpx; gx += g) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, hpx); ctx.stroke(); }
      for (let gy = (hpx / 2) % g; gy < hpx; gy += g) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(wpx, gy); ctx.stroke(); }
    }
    drawLand(ctx, tf);
    drawCourse(ctx, w.C, true, tf, scale, -1);
    // the marks, big enough to find on the whole course, and named
    const named = new Set<string>();
    ctx.font = '600 12px "Saira Semi Condensed", sans-serif';
    for (const m of w.C.marks) {
      const q = tf(m.p.x, m.p.y);
      ctx.strokeStyle = '#ffc21a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], 7, 0, 6.29); ctx.stroke();
      ctx.fillStyle = '#ffc21a'; ctx.beginPath(); ctx.arc(q[0], q[1], 3, 0, 6.29); ctx.fill();
      if (!named.has(m.name)) { named.add(m.name); ctx.fillText(m.name, q[0] + 10, q[1] + 4); }
    }
    const k = F.findIndex(f => f.t > this.t), upto = k < 0 ? F.length : k;
    const line = (i: number, a: number, b: number) => {
      ctx.beginPath(); let on = false;
      for (let f = a; f < b; f++) { const p = F[f].b[i]; if (!p) continue; const q = P(p); on ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); on = true; }
      return on;
    };
    // the others' tracks, so far
    w.boats.forEach((bt, i) => { if (i === u) return; ctx.strokeStyle = hexA(bt.color, .45); ctx.lineWidth = 1.3; if (line(i, 0, upto)) ctx.stroke(); });
    // yours: all of it faint, so far bright
    ctx.strokeStyle = 'rgba(233,242,245,.18)'; ctx.lineWidth = 1.5; if (line(u, 0, F.length)) ctx.stroke();
    ctx.strokeStyle = 'rgba(233,242,245,.8)'; ctx.lineWidth = 2; if (line(u, 0, upto)) ctx.stroke();
    // where it cost you time: each moment's stretch of your track in its colour, with its number
    const idx = (t: number) => { const j = F.findIndex(f => f.t >= t); return j < 0 ? F.length - 1 : j; };
    for (const m of D.moments) {
      // (still ahead of the playhead: dimmer and thinner, so it doesn't read as where you are now)
      const a = idx(m.t0), b = Math.max(a + 1, idx(m.t1)), on = this.sel === m, ahead = m.t0 > this.t;
      ctx.strokeStyle = hexA(ink(m.key), on ? 1 : ahead ? .35 : .8); ctx.lineWidth = on ? 6 : ahead ? 2.5 : 4; ctx.lineCap = 'round';
      if (line(u, a, b + 1)) ctx.stroke();
      ctx.lineCap = 'butt';
    }
    for (const m of D.moments) {
      const p = F[idx(m.t0)]?.b[u]; if (!p) continue;
      const q = P(p), on = this.sel === m, r = on ? 9 : 7;
      ctx.fillStyle = ink(m.key); ctx.strokeStyle = '#0c2534'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 6.29); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#0c2534'; ctx.font = `700 ${on ? 11 : 10}px "Saira Semi Condensed", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(m.key === 'rule' ? '!' : this.rank.get(m.key) ?? '·'), q[0], q[1] + 0.5);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    // the boats now (drawn at least big enough to see their heading on the whole course)
    const hs = Math.max(scale, 1.6);
    w.boats.forEach((bt, i) => {
      const p = now[i]; if (!p) return;
      drawHull(ctx, P(p), p[2] - W, p[4], hs, i === u ? bt.color : hexA(bt.color, .7), i === u ? `You · ${p[3]}` : this.follow ? bt.name : null);
    });
    // the picked moment, while it's on: a ring round you
    if (this.sel && this.t >= this.sel.t0 && this.t <= this.sel.t1 + 2) {
      const q = P(me); ctx.strokeStyle = ink(this.sel.key); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(16, 10 * hs), 0, 6.29); ctx.stroke();
    }
    // wind arrow and scale
    ctx.fillStyle = '#e9f2f5'; ctx.font = '600 12px "Saira Semi Condensed", sans-serif';
    ctx.fillText('WIND', 12, 18);
    ctx.strokeStyle = '#e9f2f5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(26, 26); ctx.lineTo(26, 52); ctx.moveTo(20, 45); ctx.lineTo(26, 53); ctx.lineTo(32, 45); ctx.stroke();
    const bar = this.follow ? 50 : scale * 500 > 160 ? 100 : 500; // metres
    ctx.strokeStyle = '#94abb7'; ctx.fillStyle = '#94abb7'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(12, hpx - 14); ctx.lineTo(12 + bar * scale, hpx - 14); ctx.stroke();
    ctx.fillText(`${bar} m`, 16 + bar * scale, hpx - 10);
    const clock = this.root.querySelector<HTMLElement>('.rrClock'); if (clock) clock.textContent = `${mmss(this.t)} ${this.t < 0 ? 'to the gun' : 'after the gun'}`;
    this.drawTimeline();
  }

  /** The x of time t on a timeline `width` wide. */
  private span(width: number): [number, number] { return [10, width - 10]; }
  private tx(t: number, width: number): number {
    const F = this.D!.frames, [x0, x1] = this.span(width), t0 = F[0].t, t1 = this.end();
    return x0 + (t - t0) / Math.max(1, t1 - t0) * (x1 - x0);
  }

  private drawTimeline(): void {
    const D = this.D!, [ctx, wpx, hpx] = fitCanvas(this.tl), X = (t: number) => this.tx(t, wpx);
    ctx.clearRect(0, 0, wpx, hpx);
    const base = 30;
    ctx.fillStyle = 'rgba(150,196,218,.12)'; ctx.fillRect(X(D.frames[0].t), base - 1, X(this.end()) - X(D.frames[0].t), 2);
    // the gun and the marks
    ctx.font = '600 11px "Saira Semi Condensed", sans-serif'; ctx.textBaseline = 'top';
    const tickAt = (t: number, label: string, color: string) => {
      const x = X(t); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, base - 4); ctx.lineTo(x, base + 6); ctx.stroke();
      ctx.fillStyle = color; const tw = ctx.measureText(label).width; ctx.fillText(label, Math.min(wpx - tw - 2, Math.max(2, x - tw / 2)), base + 9);
    };
    tickAt(0, 'Gun', '#ffb627');
    for (const m of D.marks) tickAt(m.t, m.name, '#94abb7');
    // the moments: a bar for how long, its height for what it cost
    for (const m of D.moments) {
      const a = X(m.t0), b = Math.max(a + 3, X(m.t1)), h = Math.min(22, 6 + 2 * Math.sqrt(Math.max(0, m.lost)) * 2);
      ctx.fillStyle = hexA(ink(m.key), this.sel === m ? 1 : .8);
      ctx.fillRect(a, base - 2 - h, b - a, h);
      if (this.sel === m) { ctx.strokeStyle = '#e9f2f5'; ctx.lineWidth = 1.5; ctx.strokeRect(a - 1, base - 3 - h, b - a + 2, h + 2); }
    }
    // the playhead
    const x = X(this.t); ctx.strokeStyle = '#e9f2f5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x, hpx - 2); ctx.stroke();
    ctx.textBaseline = 'alphabetic';
  }
}
