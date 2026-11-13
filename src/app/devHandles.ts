/**
 * Dev-only handles on window for debugging and browser tests (the dev server only). window.sim() returns the race's World; the others reach the view, the HUD and the camera.
 * (A part of src/app.ts, as it was there: it reaches the app's own state through `app`, app.ts's ctx.)
 */
import { type Ghost } from '../replay/ghost';
import type { AppCtx } from '../app';

export function installDevHandles(app: AppCtx) {
// Dev-only handle for debugging and browser tests: window.sim() returns the current World.
if (import.meta.env.DEV) Object.assign(window, { __ghost: (pts: Ghost['pts'] | null) => { app.activeGhost = pts ? { at: 'dev', key: 'dev', pts } : null; app.view.setGhost(app.w, pts); } }); // (a ghost on any race, for checking how it's drawn)
if (import.meta.env.DEV) Object.assign(window, { sim: () => app.host.world, __w: () => app.w, __host: () => app.host, __hud: app.hud, __plan: app.planChart, __look: (yaw: number, pitch: number, chase?: number) => { app.setLook(yaw, pitch); if (chase) app.look.chase = chase; }, __over: app.over, __view: app.view, __twa: (a: number) => { app.showroomTwa = a; }, __nav: () => app.nav.trail });

}
