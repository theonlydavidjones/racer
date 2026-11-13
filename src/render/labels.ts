import './three-setup';
import * as THREE from 'three';
import { dist, type Vec } from '../core/math';
import type { SimView } from '../sim/host';
import { P3 } from './coords';

interface MarkTag { el: HTMLDivElement; p: Vec; z: number; idx: number[] }

/** HTML tags floating over boats and marks, positioned by projecting through the 3D camera. */
export class Labels {
  private tagEls: (HTMLDivElement | null)[] = [];
  private markTags: MarkTag[] = [];
  private tmp = new THREE.Vector3();
  constructor(private root: HTMLElement) {}

  build(w: SimView): void {
    this.root.innerHTML = ''; this.tagEls = [];
    for (const b of w.boats) {
      if (b.isUser) { this.tagEls.push(null); continue; }
      const d = document.createElement('div'); d.className = 'tag';
      d.innerHTML = `<i style="background:${b.color}"></i><span>${b.name}</span><b></b>`;
      this.root.appendChild(d); this.tagEls.push(d);
    }
    const mk = (txt: string) => { const d = document.createElement('div'); d.className = 'tag mk'; d.textContent = txt; this.root.appendChild(d); return d; };
    this.markTags = [];
    const seen: Record<string, number> = {};
    if (w.freeSail) { // just sailing: only where you're heading
      if (w.dest) this.markTags.push({ el: mk(w.dest.name), p: w.dest.p, z: 6, idx: [] });
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
    if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { el.hidden = true; return; }
    el.hidden = false;
    el.style.left = ((v.x + 1) / 2 * innerWidth) + 'px';
    el.style.top = ((1 - v.y) / 2 * innerHeight) + 'px';
  }

  update(w: SimView, camera: THREE.Camera, viewMode: number): void {
    const u = w.user;
    w.boats.forEach((b, i) => {
      const el = this.tagEls[i]; if (!el) return;
      this.place(el, camera, b.x, b.y, viewMode === 2 ? 2 : 10.2);
      if (el.hidden) return;
      const r = w.rights(u, b), kc = r.kc === u, near = dist(u, b) < 70;
      el.className = 'tag' + (near ? (kc ? ' kc' : ' row') : '');
      el.lastChild!.textContent = b.tack + (b.ocs && w.t > 0 ? ' · OCS' : '') + (b.penalty > 0 ? ' · turns' : '');
    });
    for (const mt of this.markTags) { this.place(mt.el, camera, mt.p.x, mt.p.y, mt.z); mt.el.classList.toggle('next', mt.idx.includes(u.leg) && w.t > 0); }
  }
}
