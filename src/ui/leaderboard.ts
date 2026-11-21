import { sailNo, type BoatSpec } from '../boat/spec';

/**
 * The race's leaderboard (r288, the owner, 20 Nov 2026): the fleet's order now, shown under the instruments for 12 s
 * after each of her roundings (Shift+L pins it on or off), the top three and her neighbors; a click opens the whole
 * fleet with each boat's places gained or lost since the order at her last mark.
 *
 * The order is the race's own arithmetic: finished boats first, in finishing order; then the rest by the distance they
 * still have to sail (to their next mark, round the marks left, and to the finish), shortest first; retired boats last.
 * It's straight-line distance, not the time a beat takes, so on a beat it's a fair read only between boats on the same
 * leg; it's what a race officer's "order at the mark" gives, and that's when it's shown.
 */
export interface LbBoat {
  readonly id: number; readonly isUser: boolean; readonly name: string; readonly no?: string;
  readonly leg: number; readonly x: number; readonly y: number;
  readonly finished: boolean; readonly retired?: boolean; readonly finishT: number | null; readonly spec?: BoatSpec;
}
type P = { readonly x: number; readonly y: number };
const d = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

/** Each boat's distance still to sail, m: to her next mark, round the rest, then to the finish. */
export function toGo(b: LbBoat, marks: readonly P[], finish: P): number {
  let s = 0, at: P = b;
  for (let i = Math.max(0, b.leg); i < marks.length; i++) { s += d(at, marks[i]); at = marks[i]; }
  return s + d(at, finish);
}

/** The fleet in order, first to last, with each boat's distance to go (0 once finished). */
export function raceOrder(boats: readonly LbBoat[], marks: readonly P[], finish: P): { b: LbBoat; g: number }[] {
  const rank = (b: LbBoat) => b.retired ? 2 : b.finished ? 0 : 1;
  return boats.map(b => ({ b, g: b.finished || b.retired ? 0 : toGo(b, marks, finish) }))
    .sort((x, y) => rank(x.b) - rank(y.b) || (x.b.finished && y.b.finished ? (x.b.finishT ?? 0) - (y.b.finishT ?? 0) : x.g - y.g) || x.b.id - y.b.id);
}

/** Places gained (+) or lost (−) since an earlier order (boat ids, first to last); 0 for a boat not in it. */
export function placesGained(now: readonly number[], before: readonly number[]): Map<number, number> {
  const m = new Map<number, number>();
  now.forEach((id, i) => { const j = before.indexOf(id); m.set(id, j < 0 ? 0 : j - i); });
  return m;
}

/** The rows of the short board: the top three, then the boat ahead of her, her, and the boat behind (indexes). */
export function shortRows(n: number, me: number): (number | null)[] {
  const keep = [...new Set([0, 1, 2, me - 1, me, me + 1])].filter(i => i >= 0 && i < n).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  keep.forEach((i, k) => { if (k > 0 && i > keep[k - 1] + 1) out.push(null); out.push(i); });
  return out;
}

/** A boat's sail number, where she has one (a club member's boat, and yours); the stock boats go by name (the owner). */
export const sailOf = (b: LbBoat): string => b.spec ? sailNo(b.spec) : b.isUser ? b.no ?? '' : '';

const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Meters behind the leader, whole, with a thousands comma ("+1,240"). */
export const gapText = (m: number): string => '+' + Math.round(m).toLocaleString('en-US');

/** Shown this long after each of her roundings, s (the owner). */
export const LB_SHOW_S = 12;

export class Leaderboard {
  /** Shift+L: on, or off, till pressed again; null till then, the roundings' 12 s. */
  pinned: boolean | null = null;
  expanded = false;
  private race: unknown = null;
  private leg = -1;
  private until = -Infinity;
  /** The order at her last mark (boat ids), the ▲/▼'s reference; at the gun, before her first. */
  private atMark: number[] | null = null;
  private mark = '';
  private key = '';
  private next = 0;
  constructor(private el: HTMLElement) {
    el.addEventListener('click', e => { e.stopPropagation(); this.expanded = !this.expanded; this.key = ''; this.next = 0; });
  }
  toggle(): void { this.pinned = !(this.pinned ?? this.shown); this.next = 0; }
  private shown = false;
  /**
   * Each frame (it redraws twice a second): `racing` while a race is under way for her (after the gun, not cruising or
   * retired home); `race` the race (a new one starts the board afresh); `w.t` the race clock, s.
   */
  update(w: { boats: readonly LbBoat[]; user: LbBoat; C: { marks: readonly { key: string; p: P }[] }; center: P; t: number }, racing: boolean, race: unknown): void {
    if (race !== this.race) { this.race = race; this.leg = -1; this.until = -Infinity; this.atMark = null; this.mark = ''; this.ref = null; this.expanded = false; } // (Shift+L's choice carries on)
    const u = w.user, t = w.t;
    if (!racing) { this.show(false); return; }
    const order = () => raceOrder(w.boats, w.C.marks.map(m => m.p), w.center);
    if (this.atMark == null) { this.atMark = order().map(f => f.b.id); this.leg = u.leg; } // (the gun: where they start from)
    if (u.leg > this.leg) { // she's rounded: the board for 12 s, its ▲/▼ against the order at the mark before
      this.leg = u.leg; this.until = t + LB_SHOW_S; this.mark = w.C.marks[u.leg - 1]?.key ?? '';
      this.ref = this.atMark; this.atMark = order().map(f => f.b.id); this.next = 0;
    }
    const on = this.pinned ?? (t < this.until);
    if (!on) { if (this.shown) this.expanded = false; this.show(false); return; }
    this.show(true);
    if (performance.now() < this.next) return; this.next = performance.now() + 500;
    const f = order(), me = f.findIndex(x => x.b.isUser), lead = f[0]?.g ?? 0, n = f.length;
    // (▲/▼: at a rounding, the leg just sailed (the order at the mark before against now); between marks, since the last)
    const gained = placesGained(f.map(x => x.b.id), (t < this.until ? this.ref : null) ?? this.atMark);
    const head = `<div class="lb-h"><span>${esc(this.mark || 'Race')}</span><span class="lb-pos">${ord(me + 1)}/${n}</span></div>`;
    // (the number its own column, whole, always; the name gives way, cut with an ellipsis; her "You" dropped whole)
    // (a name with room for fewer than 3 letters goes altogether, as her "You" does: option (b), the owner, 21 Nov 2026)
    const label = (b: LbBoat) => { const no = sailOf(b);
      return `<b>${esc(no)}</b>${b.isUser ? '<i class="lb-n you"><s>&#8203;</s><span>You</span></i>' : `<i class="lb-n"><s>&#8203;</s><span>${esc(b.name)}</span></i>`}`; };
    let html = head;
    if (!this.expanded) {
      for (const i of shortRows(n, me)) {
        if (i == null) { html += '<div class="lb-gap">⋯</div>'; continue; }
        const x = f[i], gap = x.b.finished ? 'fin' : x.b.retired ? 'ret' : i === 0 ? '' : gapText(x.g - lead);
        html += `<div class="lb-r${x.b.isUser ? ' me' : ''}"><span class="lb-p">${i + 1}</span>${label(x.b)}<span class="lb-g">${gap}</span></div>`;
      }
    } else {
      html += '<div class="lb-all">' + f.map((x, i) => { const c = gained.get(x.b.id) ?? 0;
        return `<div class="lb-r lb-chip${x.b.isUser ? ' me' : ''}"><span class="lb-p">${i + 1}</span>${label(x.b)}<span class="lb-ch${c > 0 ? ' up' : c < 0 ? ' dn' : ''}">${c > 0 ? '▲' + c : c < 0 ? '▼' + -c : '–'}</span></div>`; }).join('') + '</div>';
    }
    if (html !== this.key) { this.key = html; this.el.innerHTML = html; }
  }
  private ref: number[] | null = null;
  private show(on: boolean): void { this.shown = on; if (this.el.hidden === on) this.el.hidden = !on; }
}
