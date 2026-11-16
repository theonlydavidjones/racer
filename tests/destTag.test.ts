import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Labels } from '../src/render/labels';
import { destMark, latLon, place } from '../src/sim/places';
import type { SimView } from '../src/sim/host';

/**
 * The destination's tag in the 3D view follows the destination (the owner, 16 Nov 2026: "when I change sailing
 * destinations, the destination pin on the horizon doesn't seem to update"): built once when she set off, it kept the
 * first destination's place and name through every change after. And a spot on open water shows as a plain pin, not its
 * latitude and longitude ("use pins instead of coordinates for non-named destinations").
 */
// (the few parts of a page the tags use: the tests run without one)
class El {
  className = ''; hidden = false; title = ''; style = { transform: '' } as Record<string, string>; children: El[] = []; private txt = '';
  classList = { toggle: (c: string, on: boolean) => { const s = new Set(this.className.split(' ').filter(Boolean)); if (on) s.add(c); else s.delete(c); this.className = [...s].join(' '); } };
  get textContent() { return this.txt + this.children.map(c => c.textContent).join(''); }
  set textContent(v: string) { this.txt = v; this.children = []; }
  set innerHTML(_: string) { this.children = []; this.txt = ''; }
  get lastChild() { return this.children.at(-1) ?? null; }
  appendChild(c: El) { this.children.push(c); return c; }
  removeAttribute(a: string) { if (a === 'title') this.title = ''; }
}
const g = globalThis as Record<string, unknown>;
g.document ??= { createElement: () => new El() };
g.innerWidth ??= 1400; g.innerHeight ??= 860;

describe('the destination tag follows the destination', () => {
  it('moves and renames with each new destination, shows a pin for a spot, and goes when there is none', () => {
    const root = new El();
    const a = place('crissy')!, start = destMark(a)!;
    const w = { freeSail: true, rounding: null, dest: start, boats: [], user: { leg: 0, x: a.p.x - 400, y: a.p.y - 400, mooring: null }, t: 0 } as unknown as SimView;
    const L = new Labels(root as unknown as HTMLElement); L.build(w);
    const cam = new THREE.PerspectiveCamera(60, 1400 / 860, 1, 50000);
    const look = (p: { x: number; y: number }) => { cam.position.set(p.x - 300, 40, -(p.y - 300)); cam.lookAt(p.x, 0, -p.y); cam.updateMatrixWorld(); cam.updateProjectionMatrix(); };
    const tag = () => root.children.find(c => c.className.includes('mk'))!;
    const at = (p: { x: number; y: number }) => { const v = new THREE.Vector3(p.x, 6, -p.y).project(cam); return [(v.x + 1) / 2 * 1400, (1 - v.y) / 2 * 860]; };
    const where = () => tag().style.transform.match(/translate\(([-\d.]+)px,([-\d.]+)px\)/)!.slice(1).map(Number);
    look(a.p); L.update(w, cam, 0);
    expect(tag().textContent).toBe(a.name); expect(tag().hidden).toBe(false);
    // a named place picked on the chart
    const b = place('alcatraz')!; w.dest = destMark(b)!; look(b.p); L.update(w, cam, 0);
    expect(tag().textContent).toBe(b.name); expect(tag().className).not.toContain('pin');
    const [x, y] = where(), [ex, ey] = at(b.p); expect(Math.hypot(x - ex, y - ey)).toBeLessThan(2);
    // a spot on open water: a pin, its position only on hover
    const q = { x: b.p.x + 900, y: b.p.y - 600 }; w.dest = destMark({ id: 'pick', name: latLon(q), group: 'Spots', p: q } as never)!; look(q); L.update(w, cam, 0);
    expect(tag().className).toContain('pin'); expect(tag().textContent).toBe(''); expect(tag().title).toBe(latLon(q));
    const [x2, y2] = where(), [ex2, ey2] = at(q); expect(Math.hypot(x2 - ex2, y2 - ey2)).toBeLessThan(2);
    // none: the tag goes
    w.dest = null; L.update(w, cam, 0); expect(tag().hidden).toBe(true);
  });
});
