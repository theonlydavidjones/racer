import type * as THREE from 'three';

/**
 * The frame-time readout (the ` key, a developer's tool): frames per second and the slowest frame lately, the
 * JavaScript time per frame by part (the sim's steps, the 3D scene, the rest: labels, HUD, maps), and what the GPU is
 * given (draw calls, triangles, shader programs, geometries and textures held) and the JS heap. For checking the
 * performance budget (ROADMAP, "Performance review") on a real machine.
 */
export class PerfMeter {
  private el: HTMLDivElement | null = null;
  private last = 0; private n = 0; private sum = { frame: 0, js: 0, sim: 0, scene: 0 }; private worst = 0; private shown = 0;
  get on(): boolean { return !!this.el; }
  toggle(): void {
    if (this.el) { this.el.remove(); this.el = null; return; }
    const el = this.el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;top:72px;transform:translateX(-50%);z-index:99;background:rgba(0,0,0,.72);color:#cfe;font:11px/1.35 ui-monospace,monospace;padding:6px 8px;border-radius:4px;pointer-events:none;white-space:pre';
    document.body.appendChild(el); this.n = 0; this.last = 0;
  }
  /** Once a frame: `now` the frame's timestamp, and the JS times (ms) of the whole frame, the sim's steps and the scene. */
  frame(now: number, js: number, sim: number, scene: number, r: THREE.WebGLRenderer): void {
    if (!this.el) return;
    if (this.last) { const f = now - this.last; this.sum.frame += f; this.worst = Math.max(this.worst, f); }
    this.last = now; this.n++; this.sum.js += js; this.sim(sim, scene);
    if (now - this.shown < 500 || this.n < 2) return;
    const k = this.n, fr = this.sum.frame / (k - 1), i = r.info, mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    this.el.textContent = `${(1000 / fr).toFixed(0)} fps  ${fr.toFixed(1)} ms/frame  worst ${this.worst.toFixed(0)} ms\n`
      + `JS ${(this.sum.js / k).toFixed(1)} ms: sim ${(this.sum.sim / k).toFixed(1)}, scene ${(this.sum.scene / k).toFixed(1)}, rest ${((this.sum.js - this.sum.sim - this.sum.scene) / k).toFixed(1)}\n`
      + `${i.render.calls} draw calls  ${(i.render.triangles / 1e6).toFixed(2)} M triangles  ${i.programs?.length ?? 0} programs\n`
      + `GPU: ${i.memory.geometries} geometries  ${i.memory.textures} textures${mem ? `  heap ${(mem.usedJSHeapSize / 1e6).toFixed(0)} MB` : ''}`;
    this.shown = now; this.n = 0; this.last = now; this.worst = 0; this.sum = { frame: 0, js: 0, sim: 0, scene: 0 };
  }
  private sim(sim: number, scene: number): void { this.sum.sim += sim; this.sum.scene += scene; }
}
