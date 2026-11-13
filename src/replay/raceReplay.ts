import { D2R, LOA, wrap } from '../core/math';
import type { Finding, Moment } from '../sim/debrief';
import type { SimView } from '../sim/host';
import { drawCourse, drawHull, drawLand, fitCanvas, hexA, makeTf } from '../ui/draw2d';
import type { BoatSnap, Frame } from './recorder';
import { ReplayView, type ReplayClip } from './replayView';
import { gapWords, legWords, rivalWho, type LegVs, type Versus, type VsMoment } from './versus';

/**
 * The race replay: your whole race from overhead (wind up), with the debrief on it. Each thing the debrief says cost
 * you time is a coloured stretch of your track and a tick on the timeline; pick one to jump to it and watch it.
 */

/**
 * Each finding's colour, on the track, the timeline and the list. Eleven kinds can't all be told apart by colour,
 * least of all by the one sailor in twelve who is colour-blind, so there are six colours from the Okabe–Ito set (chosen
 * to stay distinct for red–green and blue–yellow colour blindness; lightened for the dark chart), and five kinds reuse
 * one of them in a second style (STYLED): dashed on the track, hatched on the timeline, a hollow badge in the list.
 * Rule incidents ('rule') are vermilion, as a foul is red on the water. Checked with Machado et al. (2009)'s
 * simulations: the closest pair is ΔE ≈ 10 (deuteranopia, start/penalty; tritanopia, shifts/downwind), against 2–3 before.
 */
const OI = { orange: '#e69f00', sky: '#56b4e9', purple: '#d98cc0', yellow: '#f0e442', green: '#1fbf8f', verm: '#ff6a2a' };
export const MOMENT_INK: Record<string, string> = {
  start: OI.orange, shifts: OI.sky, laylines: OI.purple, tacks: OI.yellow, downwind: OI.green, penalty: OI.verm, rule: OI.verm,
  heel: OI.orange, dirty: OI.sky, roundings: OI.purple, trim: OI.yellow, lee: OI.green
};
/** The kinds drawn in the second style: dashed, hatched, hollow. */
export const STYLED = new Set(['heel', 'dirty', 'roundings', 'trim', 'lee']);
const ink = (key: string) => MOMENT_INK[key] ?? '#e9f2f5';
/** A number badge: filled, or hollow for the second style. */
const badge = (key: string, n: string | number) => STYLED.has(key)
  ? `<span class="rrNo hollow" style="border-color:${ink(key)};color:${ink(key)}">${n}</span>`
  : `<span class="rrNo" style="background:${ink(key)}">${n}</span>`;

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
  /** Your race against the boat that won (or second, if you won), leg by leg; null when there's no one to measure against. */
  vs?: Versus | null;
  /** A real past race: a line on where you'd have placed among the real fleet that day. */
  real?: string;
  /** The tactical debrief's chart (ui/tacticsView.ts), drawn into the list by the app; a leg picked there jumps to it. */
  tactics?: (host: HTMLElement, onLeg: (i: number) => void) => void;
  /** The planner's ideal track on each leg (0-based), dashed beside yours when you sail a leg. */
  idealPaths?: { x: number; y: number }[][];
  /** The boats chosen on the tactical chart, drawn beside you like the rival. */
  chosen?: () => number[];
}

const SPEEDS = [10, 30, 60];
/** The timeline's strip of legs against the winner, px from its top. */
const STRIP_Y = 50;
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
  private w: SimView | null = null;
  private t = 0;
  private playing = false;
  private speed = 30;
  private follow = false;
  private sel: Moment | null = null;
  /** The leg picked in the comparison with the winner. */
  private selLeg: LegVs | null = null;
  /** The moment against her picked (a tack, a shift, a mark). */
  private selVsm: VsMoment | null = null;
  private anim = 0;
  private last = 0;
  private clipView: ReplayView | null = null;
  private dragging = false;
  /**
   * The moments that get a numbered pin. A long leg can hold dozens of small spells (a few seconds each of a poor
   * downwind angle, say), and a pin on every one buries the track. So, by judgement: a pin for each finding's worst
   * moment, every rule incident, the start and penalties, and any other moment that cost 5 s or more (about two boat
   * lengths on a beat); the smaller ones keep their coloured stretch of track and their bar on the timeline.
   */
  private pinned = new Set<Moment>();
  /** The finding each moment belongs to, numbered as in the list (1 = cost you most). */
  private rank = new Map<string, number>();

  constructor(private root: HTMLElement) {}

  get isOpen(): boolean { return !this.root.hidden; }

  open(w: SimView, D: RaceReplayData): void {
    this.w = w; this.D = D;
    this.rank = new Map(D.findings.map((f, i) => [f.key, i + 1]));
    const worst = new Map<string, Moment>();
    for (const m of D.moments) if (!worst.has(m.key) || m.lost > worst.get(m.key)!.lost) worst.set(m.key, m);
    this.pinned = new Set(D.moments.filter(m => worst.get(m.key) === m || m.lost >= 5 || ['rule', 'start', 'penalty'].includes(m.key)));
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
    const th = this.root.querySelector<HTMLElement>('.tacHost'); if (th && D.tactics) D.tactics(th, i => this.pickLegNo(i));
    this.tl.onpointerdown = e => { this.dragging = true; this.tl.setPointerCapture(e.pointerId); this.scrub(e, true); };
    this.tl.onpointermove = e => { if (this.dragging) this.scrub(e, false); };
    this.tl.onpointerup = () => { this.dragging = false; };
    this.follow = false; this.sel = null; this.selLeg = null; this.selVsm = null; this.t = D.frames[0]?.t ?? 0;
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
      <div class="dbHead"><b>${badge(f.key, i + 1)}${esc(f.title)}</b><span class="dbLost">${f.key === 'start' && f.lost < 2 ? 'on time' : `−${f.lost} s`}</span></div>
      <p>${esc(f.detail)}</p><p class="dbTip">${esc(f.tip)}</p></li>`).join('');
    const rules = D.moments.filter(m => m.key === 'rule').map(m => `<li class="rrPick" data-at="${m.t1}" tabindex="0">
      <div class="dbHead"><b>${badge('rule', '!')}${esc(m.text)}</b><span class="dbLost">${mmss(m.t1)}</span></div></li>`).join('');
    return `${this.D!.tactics ? '<div class="eyebrow">Tactics, leg by leg</div><div class="tacHost"></div>' : ''}${this.vsHtml()}<p class="lede">${D.findings.length ? `What cost you time, most first: about ${total} s in all. Pick one to see it on the water.` : 'Nothing cost you more than a couple of seconds.'}</p>
      <ol>${items}</ol>${rules ? `<div class="eyebrow">Rule incidents</div><ol>${rules}</ol>` : ''}`;
  }

  /** Against the winner: the gap, then each leg with what you lost or gained and where it went. */
  private vsHtml(): string {
    const real = this.D!.real ? `<div class="eyebrow">Against the real fleet</div><p class="lede">${esc(this.D!.real)}</p>` : '';
    const V = this.D!.vs; if (!V || V.legs.length < 2) return real;
    const who = rivalWho(V, this.w!.boats[V.rival].finished);
    const sgn = (x: number) => Math.abs(x) < 0.5 ? '±0 s' : `${x > 0 ? '−' : '+'}${Math.round(Math.abs(x))} s`;
    const kindW = { beat: 'a beat', reach: 'a reach', run: 'a run', start: '' } as const;
    const lede = esc(gapWords(V));
    // each leg's moments (her tacks against yours, the shifts, the mark), under the leg, each one to jump to
    const mom = (L: LegVs) => L.moments.length ? `<ul class="rrMoments">${L.moments.map(m => `<li class="rrPick rrVsm" data-vsm="${V.moments.indexOf(m)}" tabindex="0"><span class="dbLost">${m.kind === 'mark' ? '⚑' : `${m.lostM > 0 ? '−' : '+'}${Math.round(Math.abs(m.lostM))} m`}</span> ${esc(m.text)}</li>`).join('')}</ul>` : '';
    const rows = V.legs.map(L => `<li class="rrPick rrLeg" data-leg="${L.i}" tabindex="0">
      <div class="dbHead"><b><span class="rrNo rrVs ${L.lost > 0.5 ? 'lost' : L.lost < -0.5 ? 'won' : ''}">${L.i ? `L${L.i}` : 'S'}</span>${L.i ? `To ${esc(L.name)}, ${kindW[L.kind]}` : 'The start'}</b><span class="dbLost">${sgn(L.lost)}</span></div>
      <p>${esc(legWords(L, V.rivalName))}</p>${mom(L)}</li>`).join('');
    return `${real}<div class="eyebrow">Against ${esc(V.rivalName)}, ${who}</div><p class="lede">${lede} Their track is drawn beside yours; pick a leg, or a moment under it, to sail it side by side. The metres are ground made good up or down the course, less your plain speed difference.</p><ol>${rows}</ol><div class="eyebrow">What cost you time</div>`;
  }

  /** Jump to one of the moments against her: follow you from a little before it. */
  private pickVsm(m: VsMoment): void {
    this.clipView?.stop(); this.clipView = null;
    this.sel = null; this.selLeg = null; this.selVsm = m; this.follow = true;
    this.t = Math.max(this.D!.frames[0].t, m.t0 - 5);
    this.caption(); this.paintButtons(); this.setPlaying(true);
  }

  /** Jump to leg i (0 the start) from the tactical chart: as a leg of the comparison if there is one, else from its start. */
  pickLegNo(i: number): void {
    const L = this.D?.vs?.legs.find(x => x.i === i);
    if (L) { this.pickLeg(L); return; }
    const t0 = i === 0 ? -15 : this.D?.marks[i - 1]?.t; if (t0 == null) return;
    this.sel = null; this.selLeg = null; this.selVsm = null; this.follow = true; this.t = Math.max(this.D!.frames[0].t, t0 - 5);
    this.caption(); this.paintButtons(); this.setPlaying(true);
  }

  /** Jump to a leg of the comparison: follow you from its start, the rival in view. */
  private pickLeg(L: LegVs): void {
    this.clipView?.stop(); this.clipView = null;
    this.sel = null; this.selLeg = L; this.selVsm = null; this.follow = true;
    this.t = Math.max(this.D!.frames[0].t, L.t0 - 5);
    this.caption(); this.paintButtons(); this.setPlaying(true);
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
      if (li.dataset.vsm != null) { const m = D.vs?.moments[+li.dataset.vsm]; if (m) this.pickVsm(m); return; }
      if (li.dataset.leg != null) { const L = D.vs?.legs.find(x => x.i === +li.dataset.leg!); if (L) this.pickLeg(L); return; }
      if (li.dataset.at) { const m = D.moments.find(x => x.key === 'rule' && x.t1 === +li.dataset.at!); if (m) this.pick(m); return; }
      // a finding: its worst moment
      const ms = D.moments.filter(m => m.key === li.dataset.key).sort((a, b) => b.lost - a.lost);
      if (ms.length) this.pick(ms[0]);
    }
  }

  /** Jump to a moment: close in on you, from a little before it, and play it. */
  pick(m: Moment): void {
    this.clipView?.stop(); this.clipView = null;
    this.sel = m; this.selLeg = null; this.selVsm = null; this.follow = true;
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
      // the strip of legs along the bottom: that leg against the winner
      const leg = e.clientY - r.top > STRIP_Y - 2 ? D.vs?.legs.find(L => L.i > 0 ? t >= L.t0 && t <= L.t1 : t <= Math.max(L.you, 3)) : undefined;
      if (leg) { this.dragging = false; this.pickLeg(leg); return; }
      this.setPlaying(false);
      // scrubbing elsewhere lets go of the picked moment (its caption would no longer match what's shown)
      if (this.sel || this.selLeg || this.selVsm) { this.sel = null; this.selLeg = null; this.selVsm = null; this.caption(); this.paintButtons(); }
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
    const near = (this.sel && this.follow && this.t < this.sel.t1 + 5) || (this.selVsm && this.follow && this.t < this.selVsm.t1 + 5);
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
    this.root.querySelectorAll<HTMLElement>('li[data-leg]').forEach(li => li.classList.toggle('on', this.selLeg?.i === +li.dataset.leg!));
    this.root.querySelectorAll<HTMLElement>('li[data-vsm]').forEach(li => li.classList.toggle('on', !!this.selVsm && this.D!.vs?.moments[+li.dataset.vsm!] === this.selVsm));
  }

  private caption(): void {
    const el = this.root.querySelector<HTMLElement>('.rrCaption'); if (!el) return;
    const m = this.sel, L = this.selLeg, V = this.D!.vs, M = this.selVsm;
    if (M && V) {
      el.innerHTML = `<span class="rrNo rrVs ${M.lostM > 0 ? 'lost' : 'won'}">L${M.leg}</span><span>${M.kind === 'mark' ? '' : `<span class="dbLost">${M.lostM > 0 ? '−' : '+'}${Math.round(Math.abs(M.lostM))} m</span> `}${esc(M.text)}</span>`;
      return;
    }
    if (L && V) {
      const sgn = Math.abs(L.lost) < 0.5 ? '±0 s' : `${L.lost > 0 ? '−' : '+'}${Math.round(Math.abs(L.lost))} s`;
      el.innerHTML = `<span class="rrNo rrVs ${L.lost > 0.5 ? 'lost' : L.lost < -0.5 ? 'won' : ''}">${L.i ? `L${L.i}` : 'S'}</span><span><b>${L.i ? `To ${esc(L.name)}` : 'The start'}</b> <span class="dbLost">${sgn}</span> ${esc(legWords(L, V.rivalName))}</span>`;
      return;
    }
    if (!m) { el.innerHTML = '<span class="lede">Pick a finding, a tick on the timeline, or ◀ ▶ to go from one moment to the next. Your track is coloured where it cost you time.</span>'; return; }
    const n = m.key === 'rule' ? '!' : this.rank.get(m.key) ?? '·', c = m.ref != null ? this.D!.clips[m.ref] : null;
    el.innerHTML = `${badge(m.key, n)}<span><b>${m.key === 'start' ? 'The start' : mmss(m.key === 'rule' ? m.t1 : m.t0)}</b> ${esc(c ? `${c.title}. ${c.what}` : m.text)}${m.lost >= 1 ? ` <span class="dbLost">about −${Math.round(m.lost)} s</span>` : ''}</span>${c ? '<button class="ghost rrBtn" type="button" data-rr="clip">Close-up</button>' : ''}`;
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
    // the others' tracks, so far; the boat you're measured against brighter, all of hers faint ahead
    // (the tactical chart's chips choose them, the rival among them at first; without the chart, the rival)
    const rv = D.vs?.rival ?? -1, picked = new Set((D.chosen ? D.chosen() : rv >= 0 ? [rv] : []).filter(i => i !== u));
    w.boats.forEach((bt, i) => { if (i === u || picked.has(i)) return; ctx.strokeStyle = hexA(bt.color, .45); ctx.lineWidth = 1.3; if (line(i, 0, upto)) ctx.stroke(); });
    for (const id of picked) {
      const c = w.boats[id].color;
      ctx.strokeStyle = hexA(c, .2); ctx.lineWidth = 1.5; if (line(id, 0, F.length)) ctx.stroke();
      ctx.setLineDash([2, 3]); ctx.strokeStyle = hexA(c, .9); ctx.lineWidth = 2.5; if (line(id, 0, upto)) ctx.stroke(); ctx.setLineDash([]);
    }
    // the ideal (the planner's perfect sail) on the leg you're sailing, dashed
    const ip = this.selLeg && this.selLeg.i > 0 ? D.idealPaths?.[this.selLeg.i - 1] : null;
    if (ip && ip.length > 1) {
      ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(233,242,245,.75)'; ctx.lineWidth = 2; ctx.beginPath();
      ip.forEach((p, k) => { const q = tf(p.x, p.y); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke(); ctx.setLineDash([]);
      // named halfway along, as the still has it
      const m = tf(ip[ip.length >> 1].x, ip[ip.length >> 1].y); ctx.fillStyle = 'rgba(233,242,245,.85)'; ctx.font = '600 11px "Saira Semi Condensed", sans-serif'; ctx.fillText('the ideal', m[0] + 8, m[1] - 6);
    }
    // yours: all of it faint, so far bright
    ctx.strokeStyle = 'rgba(233,242,245,.18)'; ctx.lineWidth = 1.5; if (line(u, 0, F.length)) ctx.stroke();
    ctx.strokeStyle = 'rgba(233,242,245,.8)'; ctx.lineWidth = 2; if (line(u, 0, upto)) ctx.stroke();
    // where it cost you time: each moment's stretch of your track in its colour, with its number
    const idx = (t: number) => { const j = F.findIndex(f => f.t >= t); return j < 0 ? F.length - 1 : j; };
    for (const m of D.moments) {
      // (still ahead of the playhead: dimmer and thinner, so it doesn't read as where you are now)
      const a = idx(m.t0), b = Math.max(a + 1, idx(m.t1)), on = this.sel === m, ahead = m.t0 > this.t;
      ctx.strokeStyle = hexA(ink(m.key), on ? 1 : ahead ? .35 : .8); ctx.lineWidth = on ? 6 : ahead ? 2.5 : 4;
      if (STYLED.has(m.key)) ctx.setLineDash(on ? [10, 6] : [8, 6]); else ctx.lineCap = 'round';
      if (line(u, a, b + 1)) ctx.stroke();
      ctx.lineCap = 'butt'; ctx.setLineDash([]);
    }
    for (const m of D.moments) {
      if (!this.pinned.has(m) && this.sel !== m) continue;
      const p = F[idx(m.t0)]?.b[u]; if (!p) continue;
      const q = P(p), on = this.sel === m, r = on ? 9 : 7;
      const hollow = STYLED.has(m.key);
      ctx.fillStyle = hollow ? '#0c2534' : ink(m.key); ctx.strokeStyle = hollow ? ink(m.key) : '#0c2534'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 6.29); ctx.fill(); ctx.stroke();
      ctx.fillStyle = hollow ? ink(m.key) : '#0c2534'; ctx.font = `700 ${on ? 11 : 10}px "Saira Semi Condensed", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(m.key === 'rule' ? '!' : this.rank.get(m.key) ?? '·'), q[0], q[1] + 0.5);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
    // the boats now (drawn at least big enough to see their heading on the whole course)
    const hs = Math.max(scale, 1.6);
    w.boats.forEach((bt, i) => {
      const p = now[i]; if (!p) return;
      const lab = i === u ? `You · ${p[3]}` : i === rv ? null : this.follow ? bt.name : null;
      drawHull(ctx, P(p), p[2] - W, p[4], i === rv ? hs * 1.15 : hs, i === u || i === rv ? bt.color : hexA(bt.color, .7), lab);
      // her name below her hull (yours is above yours), so the two don't crowd when you're close
      if (i === rv) { const q = P(p); ctx.fillStyle = bt.color; ctx.font = '700 12px "Saira Semi Condensed", sans-serif'; ctx.fillText(`${bt.name}${D.vs!.won ? ' (won)' : ''}`, q[0] + 12, q[1] + 20); }
    });
    // close in, with her out of sight: an arrow at the edge toward her, and how far
    if (rv >= 0 && this.follow && now[rv]) {
      const q = P(now[rv]), mx = 28, inside = q[0] > mx && q[0] < wpx - mx && q[1] > mx && q[1] < hpx - mx;
      if (!inside) {
        const c0 = [wpx / 2, hpx / 2], dx = q[0] - c0[0], dy = q[1] - c0[1], k2 = Math.min((wpx / 2 - mx) / Math.abs(dx || 1e-6), (hpx / 2 - mx) / Math.abs(dy || 1e-6));
        const ex = c0[0] + dx * k2, ey = c0[1] + dy * k2, an = Math.atan2(dy, dx), d = Math.hypot(now[rv][0] - me[0], now[rv][1] - me[1]);
        ctx.fillStyle = w.boats[rv].color; ctx.beginPath(); ctx.moveTo(ex + Math.cos(an) * 10, ey + Math.sin(an) * 10);
        ctx.lineTo(ex + Math.cos(an + 2.5) * 9, ey + Math.sin(an + 2.5) * 9); ctx.lineTo(ex + Math.cos(an - 2.5) * 9, ey + Math.sin(an - 2.5) * 9); ctx.fill();
        ctx.font = '600 12px "Saira Semi Condensed", sans-serif'; const txt = `${w.boats[rv].name} ${d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1852).toFixed(1)} nm`}`, tw = ctx.measureText(txt).width;
        ctx.fillText(txt, Math.min(wpx - tw - 6, Math.max(6, ex - Math.cos(an) * 16 - tw / 2)), Math.min(hpx - 6, Math.max(14, ey - Math.sin(an) * 16 + 4)));
      }
    }
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
      if (STYLED.has(m.key)) {
        // hatched: a pale fill with diagonal stripes in the colour
        ctx.fillStyle = hexA(ink(m.key), .25); ctx.fillRect(a, base - 2 - h, b - a, h);
        ctx.save(); ctx.beginPath(); ctx.rect(a, base - 2 - h, b - a, h); ctx.clip();
        ctx.strokeStyle = hexA(ink(m.key), this.sel === m ? 1 : .9); ctx.lineWidth = 2;
        for (let sx = a - h; sx < b; sx += 5) { ctx.beginPath(); ctx.moveTo(sx, base - 2); ctx.lineTo(sx + h, base - 2 - h); ctx.stroke(); }
        ctx.restore();
      } else { ctx.fillStyle = hexA(ink(m.key), this.sel === m ? 1 : .8); ctx.fillRect(a, base - 2 - h, b - a, h); }
      if (this.sel === m) { ctx.strokeStyle = '#e9f2f5'; ctx.lineWidth = 1.5; ctx.strokeRect(a - 1, base - 3 - h, b - a + 2, h + 2); }
    }
    // against the winner: your legs along the bottom, each with what you lost (vermilion) or gained (sky) on her
    if (D.vs) for (const L of D.vs.legs) {
      // (the start: from the gun to your crossing, so the strip adds up to the whole gap)
      const a = X(L.i === 0 ? Math.min(0, L.you) : L.t0) + 1, b = X(L.i === 0 ? Math.max(L.you, 3) : L.t1) - 1, on = this.selLeg === L, lost = L.lost > 0.5, won = L.lost < -0.5;
      ctx.fillStyle = lost ? hexA(OI.verm, on ? .9 : .55) : won ? hexA(OI.sky, on ? .9 : .55) : 'rgba(150,196,218,.25)';
      ctx.fillRect(a, STRIP_Y, Math.max(2, b - a), 13);
      if (on) { ctx.strokeStyle = '#e9f2f5'; ctx.lineWidth = 1.5; ctx.strokeRect(a - 1, STRIP_Y - 1, b - a + 2, 15); }
      const txt = Math.abs(L.lost) < 0.5 ? '±0' : `${L.lost > 0 ? '−' : '+'}${Math.round(Math.abs(L.lost))} s`;
      ctx.font = '700 11px "Saira Semi Condensed", sans-serif'; ctx.textBaseline = 'middle';
      if (ctx.measureText(txt).width < b - a - 4) { ctx.fillStyle = '#0c2534'; ctx.fillText(txt, a + 3, STRIP_Y + 7); }
      ctx.textBaseline = 'alphabetic';
    }
    // the moments against her on the strip: a tick at each tack, gybe or shift (white), the picked one taller
    if (D.vs) for (const m of D.vs.moments) {
      if (m.kind !== 'tack') continue;
      // a small triangle above the strip, pointing down at the moment (not a line, which reads as a leg's edge)
      const x = X(m.t0 + 5), on = this.selVsm === m, r = on ? 6 : 4.5;
      ctx.fillStyle = on ? '#ffffff' : 'rgba(233,242,245,.85)'; ctx.strokeStyle = '#0c2534'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, STRIP_Y + 1); ctx.lineTo(x - r, STRIP_Y - r * 1.4); ctx.lineTo(x + r, STRIP_Y - r * 1.4); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // the playhead
    const x = X(this.t); ctx.strokeStyle = '#e9f2f5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x, hpx - 2); ctx.stroke();
    ctx.textBaseline = 'alphabetic';
  }
}
