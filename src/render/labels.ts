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
  /** Coming in to a berth: the key and what it does (G · lines ready), by her while it's of use, or null (app.ts). */
  dockHint: (() => string | null) | null = null;
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

  private place(el: HTMLElement, camera: THREE.Camera, x: number, y: number, z: number): void {
    const v = this.tmp.copy(P3(x, y, z)).project(camera);
    // (moved by transform, which the page composites without a layout, and each value written only when it changes:
    // a write a frame, even of the same value, has the page restyle every frame)
    const off = v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
    if (el.hidden !== off) el.hidden = off;
    if (off) return;
    const t = `translate(${((v.x + 1) / 2 * innerWidth).toFixed(1)}px,${((1 - v.y) / 2 * innerHeight).toFixed(1)}px) translate(-50%,-100%)`;
    if (el.style.transform !== t) el.style.transform = t;
  }

  update(w: SimView, camera: THREE.Camera, viewMode: number): void {
    const u = w.user;
    w.boats.forEach((b, i) => {
      const el = this.tagEls[i]; if (!el) return;
      this.place(el, camera, b.x, b.y, viewMode === 2 ? 2 : 10.2);
      if (el.hidden) return;
      const r = w.rights(u, b), kc = r.kc === u, near = dist(u, b) < 70;
      const cls = 'tag' + (near ? (kc ? ' kc' : ' row') : ''), txt = b.tack + (b.ocs && w.t > 0 ? ' · OCS' : '') + (b.penalty > 0 ? (b.penaltyDir ? turnsTag(b) : ' · owes turns') : '') + (b.protestFlag ? ' · protest' : '');
      if (el.className !== cls) el.className = cls;
      if (el.lastChild!.textContent !== txt) el.lastChild!.textContent = txt;
    });
    for (const mt of this.markTags) { this.place(mt.el, camera, mt.p.x, mt.p.y, mt.z); mt.el.classList.toggle('next', mt.idx.includes(u.leg) && w.t > 0); }
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
    // (and coming in to a berth, the lines: shown by her as the tack's is, not only in the Crew panel: the owner, 18 Nov 2026)
    const dock = !say && !word ? this.dockHint?.() ?? null : null;
    const show = kind && w.t - this.hintSince > 2 ? `${key} · ${kind === 'jibe' ? 'jibe-ho' : 'tack'}` : dock ?? '';
    if (he) { if (!show) { if (!he.hidden) he.hidden = true; } else { this.place(he, camera, u.x, u.y, 1.2); if (he.textContent !== show) he.textContent = show; } }
  }
}

/** A boat taking her penalty: which turn she's on, of how many (a turn is 360°: RRS 44.2, a two-turns penalty 720°). */
export function turnsTag(b: { penaltyTotal: number; penaltyTurned: number }): string {
  const n = Math.max(1, Math.round(b.penaltyTotal / 360)), k = Math.min(n, Math.floor(Math.abs(b.penaltyTurned) / 360) + 1);
  return ` · turn ${k} of ${n}`;
}
