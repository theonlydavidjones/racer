import type * as THREE from 'three';

/**
 * The frame-time readout (F9, or the key set in Keys; a developer's tool): frames per second and the slowest frame lately, the
 * JavaScript time per frame by part (the sim's steps, the 3D scene, the rest: labels, HUD, maps), and what the GPU is
 * given (draw calls, triangles, shader programs, geometries and textures held) and the JS heap. For checking the
 * performance budget (ROADMAP, "Performance review") on a real machine. Stutter shows as the 95th-percentile frame and
 * the long frames (over 33 ms: a frame that missed two 60 Hz refreshes) over the last 10 s, which an average hides.
 */
/** How far back the stutter figures look, ms; and what counts as a long frame, ms. */
const WINDOW = 10000, LONG = 33;
export class PerfMeter {
  private el: HTMLDivElement | null = null;
  /** The frames' intervals over the last WINDOW ms: when each ended, and how long it took (a ring, oldest first). */
  private span: { t: number; f: number }[] = [];
  private last = 0; private n = 0; private sum = { frame: 0, js: 0, sim: 0, scene: 0 }; private worst = 0; private shown = 0;
  get on(): boolean { return !!this.el; }
  toggle(): void {
    if (this.el) { this.el.remove(); this.el = null; return; }
    const el = this.el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;top:72px;transform:translateX(-50%);z-index:99;background:rgba(0,0,0,.72);color:#cfe;font:11px/1.35 ui-monospace,monospace;padding:6px 8px;border-radius:4px;pointer-events:none;white-space:pre';
    document.body.appendChild(el); this.n = 0; this.last = 0; this.span = [];
  }
  /** Once a frame: `now` the frame's timestamp, and the JS times (ms) of the whole frame, the sim's steps and the scene. */
  frame(now: number, js: number, sim: number, scene: number, r: THREE.WebGLRenderer): void {
    if (!this.el) return;
    if (this.last) { const f = now - this.last; this.sum.frame += f; this.worst = Math.max(this.worst, f); this.span.push({ t: now, f }); }
    while (this.span.length && now - this.span[0].t > WINDOW) this.span.shift();
    this.last = now; this.n++; this.sum.js += js; this.sim(sim, scene);
    if (now - this.shown < 500 || this.n < 2) return;
    const k = this.n, fr = this.sum.frame / (k - 1), i = r.info, mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    // the stutter over the last 10 s: the 95th-percentile frame, and how many frames ran long
    const fs = this.span.map(x => x.f).sort((a, b) => a - b), p95 = fs.length ? fs[Math.min(fs.length - 1, Math.floor(fs.length * 0.95))] : 0, long = fs.filter(f => f > LONG).length;
    const secs = this.span.length ? Math.min(WINDOW, now - this.span[0].t + this.span[0].f) / 1000 : 0;
    this.el.textContent = `${(1000 / fr).toFixed(0)} fps  ${fr.toFixed(1)} ms/frame  worst ${this.worst.toFixed(0)} ms\n`
      + `last ${secs.toFixed(0)} s: 95% of frames under ${p95.toFixed(1)} ms  ${long} long (> ${LONG} ms) of ${fs.length}\n`
      + `JS ${(this.sum.js / k).toFixed(1)} ms: sim ${(this.sum.sim / k).toFixed(1)}, scene ${(this.sum.scene / k).toFixed(1)}, rest ${((this.sum.js - this.sum.sim - this.sum.scene) / k).toFixed(1)}\n`
      + `${i.render.calls} draw calls  ${(i.render.triangles / 1e6).toFixed(2)} M triangles  ${i.programs?.length ?? 0} programs\n`
      + `GPU: ${i.memory.geometries} geometries  ${i.memory.textures} textures${mem ? `  heap ${(mem.usedJSHeapSize / 1e6).toFixed(0)} MB` : ''}`;
    this.shown = now; this.n = 0; this.last = now; this.worst = 0; this.sum = { frame: 0, js: 0, sim: 0, scene: 0 };
  }
  private sim(sim: number, scene: number): void { this.sum.sim += sim; this.sum.scene += scene; }
}
