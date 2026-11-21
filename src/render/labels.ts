import './three-setup';
import * as THREE from 'three';
import { dist, type Vec } from '../core/math';
import type { SimView } from '../sim/host';
import { P3 } from './coords';
import { isSpot } from '../sim/places';

interface MarkTag { el: HTMLDivElement; p: Vec; z: number; idx: number[] }

/** HTML tags floating over boats and marks, positioned by projecting through the 3D camera. */
/** How long the order ("Tacking!", "Jibe-ho!") shows once given (s). */
const ORDER_S = 1.2;
export class Labels {
  private tagEls: (HTMLDivElement | null)[] = [];
  private markTags: MarkTag[] = [];
  /** Cruising, where she's heading: one tag that follows the destination however it changes (the chart, the navigator,
   * Home, or cleared), checked every frame, since nothing rebuilds the labels mid-sail (the owner, 16 Nov 2026: "the
   * destination pin on the horizon doesn't seem to update"). A named place shows its name; a spot on open water, a pin. */
  private destEl: HTMLDivElement | null = null;
  private destOf: SimView['dest'] | undefined = undefined;
  /** Coming in to a berth: the one-word cue by your boat (Closer, Too fast, Step, Made fast, Bump: sim/world.ts mooringStep). */
  private cueEl: HTMLDivElement | null = null;
  /** The helm's call by her (the owner, 15 Nov 2026: "some kind of confirmation when I call jibe ho"): "Ready to jibe" …
   *  "Jibe-ho!" (or "Ready about" … "Tacking!"): the warning while the crew get ready, the order for a moment (ORDER_S). */
  private callEl: HTMLDivElement | null = null;
  private call: { kind: 'jibe' | 'tack'; t0: number; doneT: number | null } | null = null;
  /** The one-line hint, at the moment the call is useful (a run: jibe-ho; close-hauled: tack), until it's been used a few
   *  times: `hint` gives the key's name, and null once learned. */
  private hintEl: HTMLDivElement | null = null;
  private hintSince = 0; private hintKind: 'jibe' | 'tack' | null = null;
  hint: (() => string | null) | null = null;
  private tmp = new THREE.Vector3();
  constructor(private root: HTMLElement) {}
  /** The helm's called the turn (app.ts, its key): the call shows by her. */
  called(kind: 'jibe' | 'tack', t: number): void { this.call = { kind, t0: t, doneT: null }; }

  build(w: SimView): void {
    this.root.innerHTML = ''; this.tagEls = [];
    this.cueEl = document.createElement('div'); this.cueEl.className = 'tag cue'; this.cueEl.hidden = true; this.root.appendChild(this.cueEl);
    this.callEl = document.createElement('div'); this.callEl.className = 'tag cue call'; this.callEl.hidden = true; this.root.appendChild(this.callEl);
    this.hintEl = document.createElement('div'); this.hintEl.className = 'tag cue khint'; this.hintEl.hidden = true; this.root.appendChild(this.hintEl);
    this.call = null;
    for (const b of w.boats) {
      if (b.isUser) { this.tagEls.push(null); continue; }
      const d = document.createElement('div'); d.className = 'tag';
      d.innerHTML = `<i style="background:${b.color}"></i><span>${b.name}</span><b></b>`;
      this.root.appendChild(d); this.tagEls.push(d);
    }
    const mk = (txt: string) => { const d = document.createElement('div'); d.className = 'tag mk'; d.textContent = txt; this.root.appendChild(d); return d; };
    this.markTags = []; this.destEl = null;
    const seen: Record<string, number> = {};
    if (w.freeSail) { // just sailing: only where you're heading
      if (w.rounding) for (const m of w.rounding.marks) this.markTags.push({ el: mk(m.name), p: m.p, z: 4, idx: [] }); // the rounding drill's marks
      this.destEl = mk(''); this.destEl.hidden = true; this.destOf = undefined;
      return;
    }
    w.C.marks.forEach((m, i) => {
      if (seen[m.name] == null) { seen[m.name] = this.markTags.length; this.markTags.push({ el: mk(m.name), p: m.p, z: 4, idx: [i] }); }
      else this.markTags[seen[m.name]].idx.push(i);
    });
    const C = w.C;
    if (C.pinKind !== 'mark') this.markTags.push({ el: mk(C.pinLabel), p: C.pin, z: 3, idx: [] });
    this.markTags.push({ el: mk(C.committeeLabel), p: C.committee, z: C.committeeKind === 'boat' ? 10 : 16, idx: [] });
  }

  /** Where a point is on the screen (px), or null when it's behind the camera or off the screen. */
  private project(camera: THREE.Camera, x: number, y: number, z: number): [number, number] | null {
    const v = this.tmp.copy(P3(x, y, z)).project(camera);
    if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
  }
  /** A tag at a screen point (its bottom middle there), `dy` px higher; hidden for null. */
  private put(el: HTMLElement, at: [number, number] | null, dy = 0): void {
    // (moved by transform, which the page composites without a layout, and each value written only when it changes:
    // a write a frame, even of the same value, has the page restyle every frame)
    const off = !at;
    if (el.hidden !== off) el.hidden = off;
    if (off) return;
    const t = `translate(${at[0].toFixed(1)}px,${(at[1] - dy).toFixed(1)}px) translate(-50%,-100%)`;
    if (el.style.transform !== t) el.style.transform = t;
  }
  private place(el: HTMLElement, camera: THREE.Camera, x: number, y: number, z: number): void { this.put(el, this.project(camera, x, y, z)); }
  /** Each tag's size (px), measured when its words or look change, not every frame (a read after the frame's writes
   *  would make the page lay out again). */
  private sizes = new WeakMap<HTMLElement, { key: string; w: number; h: number }>();
  private sizeOf(el: HTMLElement): { w: number; h: number } {
    const key = el.className + '|' + el.textContent, c = this.sizes.get(el);
    if (c && c.key === key) return c;
    const n = { key, w: el.offsetWidth || 0, h: el.offsetHeight || 0 }; this.sizes.set(el, n); return n;
  }
  /** The inset map and its credit line, which no tag may cover (in-race audit #4), read once a second. */
  private keepOut: [number, number, number, number][] = []; private keepOutAt = '';
  private keepOutRects(): [number, number, number, number][] {
    const k = innerWidth + 'x' + innerHeight + '@' + Math.floor(performance.now() / 1000); // (and once a second: the inset grows when it's zoomed)
    if (k !== this.keepOutAt) { this.keepOutAt = k; this.keepOut = [];
      for (const id of ['map', 'mapCredit']) { const e = typeof document.getElementById === 'function' ? document.getElementById(id) : null; /* (none in a test's stand-in page) */ if (!e) continue; const r = e.getBoundingClientRect(); if (r.width && r.height) this.keepOut.push([r.left - 4, r.top - 4, r.width + 8, r.height + 8]); } }
    return this.keepOut;
  }
  /**
   * The boats' and the marks' tags, laid out so none covers another (in-race audit #3: where boats bunch, "Green P ·
   * protest" lay over the X mark's tag and "Blue P") or the inset map: first come first placed, the next mark first,
   * then the marks, then the boats nearest you; one that would overlap is lifted a tag's height (up to five) or put one below, and
   * one that still can't be placed is left off for the moment.
   */
  private declutter(items: { el: HTMLElement; at: [number, number] | null }[]): void {
    const placed: [number, number, number, number][] = [...this.keepOutRects()];
    const hit = (r: [number, number, number, number]) => placed.some(b => r[0] < b[0] + b[2] && r[0] + r[2] > b[0] && r[1] < b[1] + b[3] && r[1] + r[3] > b[1]);
    for (const it of items) {
      if (!it.at) { this.put(it.el, null); continue; }
      if (it.el.hidden) it.el.hidden = false; // (to be measured)
      const { w, h } = this.sizeOf(it.el); let done = false;
      for (const k of [0, 1, -1, 2, 3, 4, 5]) { // (up a tag at a time, or one step below its boat, as the inset sits above the horizon)
        const dy = k * (h + 2), r: [number, number, number, number] = [it.at[0] - w / 2 - 2, it.at[1] - dy - h - 1, w + 4, h + 2];
        if (hit(r)) continue;
        placed.push(r); this.put(it.el, it.at, dy); done = true; break;
      }
      if (!done) this.put(it.el, null);
    }
  }

  update(w: SimView, camera: THREE.Camera, viewMode: number): void {
    const u = w.user;
    const boatTags: { el: HTMLElement; at: [number, number] | null; d: number }[] = [];
    w.boats.forEach((b, i) => {
      const el = this.tagEls[i]; if (!el) return;
      const at = this.project(camera, b.x, b.y, viewMode === 2 ? 2 : 10.2);
      boatTags.push({ el, at, d: dist(u, b) });
      if (!at) return;
      const r = w.rights(u, b), kc = r.kc === u, near = dist(u, b) < 70;
      const cls = 'tag' + (near ? (kc ? ' kc' : ' row') : ''), txt = b.tack + (b.ocs && w.t > 0 ? ' · OCS' : '') + (b.penalty > 0 ? (b.penaltyDir ? turnsTag(b) : ' · owes turns') : '') + (b.protestFlag ? ' · protest' : '');
      if (el.className !== cls) el.className = cls;
      if (el.lastChild!.textContent !== txt) el.lastChild!.textContent = txt;
    });
    const markTags = this.markTags.map(mt => { const next = mt.idx.includes(u.leg) && w.t > 0; mt.el.classList.toggle('next', next); return { el: mt.el, at: this.project(camera, mt.p.x, mt.p.y, mt.z), next }; });
    // (the next mark's tag first, then the other marks, then the boats, nearest you first: in-race audit #3)
    this.declutter([...markTags.filter(m => m.next), ...markTags.filter(m => !m.next), ...boatTags.sort((a, b) => a.d - b.d)]);
    const de = this.destEl;
    if (de) {
      const d = w.dest;
      if (d !== this.destOf) { // (a new destination, or none: its words and its look, once)
        this.destOf = d;
        const pin = !!d && isSpot(d.name);
        de.textContent = d && !pin ? d.name : ''; if (pin) de.appendChild(document.createElement('b')); de.className = pin ? 'tag mk pin' : 'tag mk';
        if (pin) de.title = d!.name; else de.removeAttribute('title');
      }
      if (d) this.place(de, camera, d.p.x, d.p.y, 6); else if (!de.hidden) de.hidden = true;
    }
    // the cue while it's news (a few seconds), or for as long as it holds while the hand waits at the shrouds
    const m = u.mooring, c = this.cueEl, word = m?.cue && (m.phase === 'ready' || w.t - (m.cueT ?? -99) < 4) ? m.cue : '';
    if (c) { if (!word) { if (!c.hidden) c.hidden = true; } else { this.place(c, camera, u.x, u.y, 3.2); if (c.textContent !== word) c.textContent = word; } }
    // the helm's call: the warning first, while the crew get to their places, then the order as she's put over (sim/world.ts
    // callTurn, boat/physics.ts), a moment only
    const k = this.call, ce = this.callEl;
    if (k && w.t < k.t0 - 1) this.call = null; // (a new race: the clock went back)
    let say = '';
    if (k && this.call) {
      // (the warning held while the crew get ready, as the sim holds the turn: world.ts callTurn, boat/calls.ts; a crewmate
      // busy at a job answers "Not ready!")
      // (then the order, for a moment only: once called, it's called. The owner, 15 Nov 2026)
      // (the race's copy here hears of the call a moment after you make it: a third of a second's grace before reading it)
      const waiting = !!u.callWait, heard = w.t - k.t0 > 0.3;
      // (a call dropped, not put over, she not turning: no order said)
      const dropped = heard && !waiting && k.doneT == null && u.turnTarget == null && !u.tacking && u.gybeTo == null;
      if (heard && !waiting && k.doneT == null) k.doneT = w.t;
      if (dropped || (k.doneT != null && w.t - k.doneT > ORDER_S)) this.call = null;
      else say = waiting && u.callWait!.notReady ? 'Not ready!' : waiting || !heard ? (k.kind === 'jibe' ? 'Ready to jibe' : 'Ready about') : (k.kind === 'jibe' ? 'Jibe-ho!' : 'Tacking!');
    }
    if (ce) { if (!say || word) { if (!ce.hidden) ce.hidden = true; } else { this.place(ce, camera, u.x, u.y, 3.2); if (ce.textContent !== say) ce.textContent = say; } }
    // the hint: on a run (from 150° off the wind) or close-hauled (to 50°), held two seconds there, she not turning
    const he = this.hintEl, key = this.hint?.() ?? null, twa = Math.abs(u.twa ?? 90);
    const kind: 'jibe' | 'tack' | null = !key || say || word || u.turnTarget != null || !w.running || (u.v ?? 0) < 0.8 ? null : twa >= 150 ? 'jibe' : twa <= 50 ? 'tack' : null;
    if (kind !== this.hintKind) { this.hintKind = kind; this.hintSince = w.t; }
    const show = kind && w.t - this.hintSince > 2 ? `${key} · ${kind === 'jibe' ? 'jibe-ho' : 'tack'}` : '';
    if (he) { if (!show) { if (!he.hidden) he.hidden = true; } else { this.place(he, camera, u.x, u.y, 1.2); if (he.textContent !== show) he.textContent = show; } }
  }
}

/** A boat taking her penalty: which turn she's on, of how many (a turn is 360°: RRS 44.2, a two-turns penalty 720°). */
export function turnsTag(b: { penaltyTotal: number; penaltyTurned: number }): string {
  const n = Math.max(1, Math.round(b.penaltyTotal / 360)), k = Math.min(n, Math.floor(Math.abs(b.penaltyTurned) / 360) + 1);
  return ` · turn ${k} of ${n}`;
}
