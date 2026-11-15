/**
 * Dev-only handles on window for debugging and browser tests (the dev server only). window.sim() returns the race's World; the others reach the view, the HUD and the camera.
 * (A part of src/app.ts, as it was there: it reaches the app's own state through `app`, app.ts's ctx.)
 */
import { type Ghost } from '../replay/ghost';
import type { AppCtx } from '../app';
import { WindRose, type RoseOpts, type RosePoint } from '../render/windRose';
import { beatFor } from '../boat/seaway';

export function installDevHandles(app: AppCtx) {
// Dev-only handle for debugging and browser tests: window.sim() returns the current World.
if (import.meta.env.DEV) Object.assign(window, { __ghost: (pts: Ghost['pts'] | null) => { app.activeGhost = pts ? { at: 'dev', key: 'dev', pts } : null; app.view.setGhost(app.w, pts); } }); // (a ghost on any race, for checking how it's drawn)
if (import.meta.env.DEV) Object.assign(window, { sim: () => app.host.world, __w: () => app.w, __host: () => app.host, __hud: app.hud, __plan: app.planChart, __look: (yaw: number, pitch: number, chase?: number) => { app.setLook(yaw, pitch); if (chase) app.look.chase = chase; }, __over: app.over, __view: app.view, __twa: (a: number) => { app.showroomTwa = a; }, __nav: () => app.nav.trail, __lesson: (id: Parameters<AppCtx['beginLesson']>[0]) => app.beginLesson(id), __lessons: () => app.openLessons() , __rules: () => app.rulesTrainer.open(), __rt: () => app.rulesTrainer, __bl: () => app.boatLesson });

// Dev-only: the points of sail on the water (render/windRose.ts, design/learn-to-sail), not yet in the app: __rose({ ...opts,
// target }) turns it on round your boat, following her each frame; __rose(false) turns it off.
if (import.meta.env.DEV) {
  let rose: WindRose | null = null, raf = 0;
  Object.assign(window, { __rose: (o: (Partial<RoseOpts> & { target?: RosePoint | null }) | false) => {
    cancelAnimationFrame(raf); rose?.dispose(); rose = null; if (o === false) return;
    const { target = null, ...opts } = o;
    const r = rose = new WindRose(app.view.scene, app.view, { r0: 9, r1: 26, rm: 19, labels: 'all', ...opts });
    const tick = () => { const u = app.w.user; if (u?.ww) r.update(u.x, u.y, u.ww.from, u.h, beatFor(u), (window as unknown as { __roseTarget?: RosePoint | null }).__roseTarget ?? target); raf = requestAnimationFrame(tick); };
    tick();
  } });
}
}
