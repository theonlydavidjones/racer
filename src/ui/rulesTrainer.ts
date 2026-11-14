import { CASES, type CaseFrame, type RulesCase } from '../rules/cases';
import { wrap } from '../core/math';

/**
 * The Rules trainer (the owner's go, 13 Nov 2026; design/rules-trainer-mockup.png): a World Sailing Case (The Case Book
 * for 2025–2028, as src/rules/cases.ts holds it: the Rules session's data, the same the engine's tests sail) set on the
 * water, the boats sailed up to the moment and paused; the question ("Who broke a rule?", or "Who must keep clear?"),
 * the boats' letters and Neither to choose from; then the Case's answer in one line, with its rules as chips. Only the
 * Cases marked for teaching. Overhead, wind from the top of the picture, as the Case Book draws them.
 */

const LOA = 7.64; // (the diagrams' boat: a Folkboat, src/rules/cases.ts)
const INK: Record<string, string> = { W: '#56b4e9', L: '#e8603c', A: '#56b4e9', B: '#e8603c', S: '#56b4e9', P: '#e8603c', I: '#1fbf8f', O: '#e69f00', M: '#1fbf8f', PL: '#e8603c', PW: '#e69f00' };
/** The choices: every boat on the water by her letter, and Neither when the question is who broke a rule (the Rules
 * session's call, 14 Nov 2026: the pair is only the two the engine judges; a boat on screen that broke nothing is a fair
 * wrong answer). */
export const caseChoices = (c: RulesCase): string[] => [...c.boats.map(b => b.letter), ...(c.ask === 'keepsClear' ? [] : ['neither'])];
const ink = (l: string, i: number) => INK[l] ?? ['#56b4e9', '#e8603c', '#1fbf8f', '#e69f00'][i % 4];
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** A boat at time t: between her keyframes she sails on in a straight line, turning evenly. */
function poseAt(F: CaseFrame[], t: number): { x: number; y: number; h: number } {
  if (t <= F[0].t) return F[0];
  for (let i = 1; i < F.length; i++) if (t <= F[i].t) {
    const a = F[i - 1], b = F[i], f = (t - a.t) / Math.max(1e-6, b.t - a.t);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, h: a.h + wrap(b.h - a.h) * f };
  }
  return F[F.length - 1];
}

export class RulesTrainer {
  private el: HTMLElement; private cv!: HTMLCanvasElement;
  private list = CASES.filter(c => c.teach);
  private k = 0; private t = 0; private t0 = 0; private raf = 0; private last = 0;
  private picked: string | null = null;
  /** Cases answered right at the first try, by number (kept with the settings by the page). */
  constructor(host: HTMLElement, private right: () => number[], private onRight: (n: number) => void) { this.el = host; }

  open(): void { this.el.hidden = false; this.show(this.k); }
  close(): void { this.el.hidden = true; cancelAnimationFrame(this.raf); }

  private get c(): RulesCase { return this.list[this.k]; }

  private show(k: number): void {
    this.k = (k + this.list.length) % this.list.length; this.picked = null;
    const c = this.c, who = caseChoices(c);
    const n = this.right().filter(x => this.list.some(c2 => c2.case === x)).length;
    this.el.querySelector('.rtBody')!.innerHTML = `
      <div class="rtStage"><canvas width="640" height="480"></canvas><div class="rtTiles"><div class="ttile"><b>${n} / ${this.list.length}</b><span>Cases right</span></div></div></div>
      <div class="rtPanel">
        <div class="eyebrow">Rules trainer · Case ${c.case}</div>
        <h2>${c.ask === 'keepsClear' ? 'Who must keep clear?' : 'Who broke a rule?'}</h2>
        <p class="rtSetup">${esc(c.title)}.</p>
        <div class="rtChoices">${who.map(w => `<button type="button" class="rtChoice" data-who="${w}" disabled>${w === 'neither' ? 'Neither' : w}</button>`).join('')}</div>
        <div class="rtAnswer" hidden></div>
        <div class="btnrow"><button type="button" class="ghost" data-rt="again">Watch again</button><button type="button" class="cta" data-rt="next">Next Case</button></div>
        <details class="thow"><summary>The source</summary><p>World Sailing, The Case Book for 2025–2028, Case ${c.case}; the boats placed from its diagram.</p></details>
      </div>`;
    this.cv = this.el.querySelector('canvas')!;
    this.play();
  }

  /** The Case's last frame (the end of the sailing it shows). */
  private get endT(): number { return Math.max(...this.c.boats.map(b => b.frames[b.frames.length - 1].t)); }
  /** Where it stops to ask: who broke a rule, at the moment before it; who must keep clear, once it has all happened (the
   * Rules session's data: `ask`). */
  private get askT(): number { return this.c.ask === 'keepsClear' ? this.endT : this.c.momentT; }

  /** Sail it up to `until` (by default where it asks), from a few seconds before the moment, a little faster than real time. */
  private play(until = this.askT, from?: number, speed = 1.5): void {
    cancelAnimationFrame(this.raf);
    this.t0 = Math.min(...this.c.boats.map(b => b.frames.find(f => f.look !== false)?.t ?? b.frames[0].t));
    this.t = from ?? Math.max(this.t0, this.c.momentT - 12); this.last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.5, (now - this.last) / 1000); this.last = now; // (a slow frame still moves on: a tab in the background, a slow machine)
      this.t = Math.min(until, this.t + dt * speed);
      this.draw();
      if (this.t < until) this.raf = requestAnimationFrame(tick);
      else if (!this.picked) this.el.querySelectorAll<HTMLButtonElement>('.rtChoice').forEach(b => { b.disabled = false; }); // paused: ask
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** The water from above: every boat where she is at t, her track so far faint, the marks, the wind. */
  private draw(): void {
    const c = this.c, g = this.cv.getContext('2d')!, W = this.cv.width, H = this.cv.height;
    // (fitted to the boats over what's shown, from a few seconds before the moment to the end, and the marks near them: a
    // Case's far mark would shrink the boats to specks)
    const near = c.boats.flatMap(b => b.frames.filter(f => f.t >= c.momentT - 12 && f.t <= this.endT).map(f => ({ x: f.x, y: f.y })));
    const pts = near.concat((c.marks ?? []).map(m => m.p).filter(p => near.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 60)));
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const span = Math.max(40, Math.max(...xs) - Math.min(...xs) + 2 * LOA, (Math.max(...ys) - Math.min(...ys) + 2 * LOA) * W / H);
    const s = W / span, P = (x: number, y: number): [number, number] => [W / 2 + (x - cx) * s, H / 2 - (y - cy) * s]; // (north up: the wind from the top)
    g.fillStyle = '#0f2f44'; g.fillRect(0, 0, W, H);
    // the wind
    g.strokeStyle = '#e9f2f5'; g.fillStyle = '#e9f2f5'; g.lineWidth = 2; g.beginPath(); g.moveTo(40, 26); g.lineTo(40, 66); g.stroke();
    g.beginPath(); g.moveTo(34, 60); g.lineTo(40, 72); g.lineTo(46, 60); g.fill();
    g.font = '700 11px system-ui'; g.textAlign = 'center'; g.fillText('WIND', 40, 18);
    // a bank (Case 43): the shore along P's course, d m off her port side (the Rules session's data), drawn as land
    if (c.bank) {
      const B = c.boats.find(b => b.letter === 'P') ?? c.boats[0], f0 = B.frames[0], f1 = B.frames[B.frames.length - 1];
      const h = f0.h * Math.PI / 180, px = -Math.cos(h), py = Math.sin(h); // (her port side: x east, y north, h from north)
      const ext = 400, ux = Math.sin(h), uy = Math.cos(h), o = c.bank.d + 0.5;
      const A = P(f0.x + px * o - ux * ext, f0.y + py * o - uy * ext), Bq = P(f1.x + px * o + ux * ext, f1.y + py * o + uy * ext);
      const C2 = P(f1.x + px * (o + 400) + ux * ext, f1.y + py * (o + 400) + uy * ext), D2 = P(f0.x + px * (o + 400) - ux * ext, f0.y + py * (o + 400) - uy * ext);
      g.fillStyle = '#c8b27a'; g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(Bq[0], Bq[1]); g.lineTo(C2[0], C2[1]); g.lineTo(D2[0], D2[1]); g.closePath(); g.fill();
    }
    // the marks, with their zone (three lengths)
    for (const m of c.marks ?? []) {
      const [x, y] = P(m.p.x, m.p.y);
      g.strokeStyle = 'rgba(255,182,39,.4)'; g.setLineDash([5, 5]); g.beginPath(); g.arc(x, y, 3 * LOA * s, 0, 6.29); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#ffb627'; g.beginPath(); g.arc(x, y, Math.max(4, 0.6 * s), 0, 6.29); g.fill();
    }
    c.boats.forEach((b, i) => {
      const col = ink(b.letter, i), F = b.frames;
      // her track so far, dotted
      g.strokeStyle = col; g.globalAlpha = 0.5; g.setLineDash([2, 4]); g.beginPath();
      for (let tt = Math.max(this.t0, F[0].t); tt <= this.t; tt += 0.5) { const q = poseAt(F, tt), [x, y] = P(q.x, q.y); tt === Math.max(this.t0, F[0].t) ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
      // her hull: bow toward her heading
      const q = poseAt(F, this.t), [x, y] = P(q.x, q.y), L = LOA * s, Bm = 2.2 * s;
      g.save(); g.translate(x, y); g.rotate(q.h * Math.PI / 180);
      g.fillStyle = col; g.strokeStyle = '#0c2534'; g.lineWidth = 1.5; g.beginPath();
      g.moveTo(0, -L / 2); g.bezierCurveTo(Bm * 0.6, -L / 4, Bm / 2, L / 4, Bm * 0.35, L / 2); g.lineTo(-Bm * 0.35, L / 2); g.bezierCurveTo(-Bm / 2, L / 4, -Bm * 0.6, -L / 4, 0, -L / 2); g.fill(); g.stroke();
      g.restore();
      g.fillStyle = col; g.font = '800 15px system-ui'; g.fillText(b.letter, x, y - L / 2 - 8);
    });
  }

  /** The answer: right or not, the Case's one line and its rules. */
  private answer(who: string): void {
    if (this.picked) return;
    const c = this.c, ok = who === c.answer.who; this.picked = who;
    if (ok && !this.right().includes(c.case)) this.onRight(c.case);
    const n = this.right().filter(x => this.list.some(c2 => c2.case === x)).length, tile = this.el.querySelector('.rtTiles b'); if (tile) tile.textContent = `${n} / ${this.list.length}`;
    this.el.querySelectorAll<HTMLButtonElement>('.rtChoice').forEach(b => { b.disabled = true; b.classList.toggle('right', b.dataset.who === c.answer.who); b.classList.toggle('wrong', b.dataset.who === who && !ok); });
    const a = this.el.querySelector<HTMLElement>('.rtAnswer')!;
    const head = c.answer.who === 'neither' ? 'Neither broke a rule.' : `${c.answer.who}${c.answer.rule ? `: rule ${c.answer.rule}` : ''}.`;
    a.innerHTML = `<b>${esc(head)}</b> ${esc(c.answer.line)}<div class="rtRules">${c.rules.map(r => `<span class="rtRule${c.answer.rule && c.answer.rule.startsWith(r) ? ' key' : ''}">${esc(r)}</span>`).join('')}</div>`;
    a.className = 'rtAnswer ' + (ok ? 'ok' : 'no'); a.hidden = false;
    if (this.t < this.endT) this.play(this.endT, this.t, 4); // (then the rest of it, quicker: what happened, up to 16 s on to the contact)
  }

  /** Clicks inside the trainer. */
  click(e: Event): void {
    const el = e.target as HTMLElement, who = el.closest<HTMLElement>('[data-who]')?.dataset.who, act = el.closest<HTMLElement>('[data-rt]')?.dataset.rt;
    if (who) this.answer(who);
    else if (act === 'again') this.play(this.picked ? this.endT : this.askT);
    else if (act === 'next') this.show(this.k + 1);
    else if (act === 'close') this.close();
  }
}
