import { it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
const world = (kt: number, up: boolean) => {
  const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, windDir: 270, mode: 'sail', sailFrom: 'cityfront', tideDate: '2026-11-14', current: 'slack', sea: 'flat' } as Settings;
  const w = new World(COURSES[0], S, 3, { freeSail: true }), u = w.user;
  u.rig = up ? { main: 1, jib: 1, mainUp: true, jibUp: true } : { main: 0, jib: 0, mainUp: false, jibUp: false }; u.v = 0; u.astern = 0; u.sway = 0;
  return { w, u };
};
it('irons probe', () => {
  for (const kt of [6, 10, 15, 20]) for (const up of [false, true]) {
    const { w, u } = world(kt, up); const out: string[] = [];
    for (let i = 0; i < 60 * 120; i++) { const ww = w.windHere(u, u); u.h = ww.from; u.turnTarget = null; u.steer = 0; u.tiller = 0; w.step(DT); if (i % 1200 === 1199) out.push(`${(i+1)/60}s ast=${(u.astern??0).toFixed(2)} v=${u.v.toFixed(2)} hove=${!!u.hove} aws=${u.aws.toFixed(2)} tw=${(ww.kt*0.5144).toFixed(2)}`); }
    console.log(kt, up ? 'sails up' : 'bare', out.join(' | '));
  }
});
it('beam on, sails up and luffing, from rest', () => {
  const { w, u } = world(15, true);
  for (let i = 0; i < 60 * 20; i++) { const ww = w.windHere(u, u); u.h = ww.from + 90; u.turnTarget = null; u.steer = 0; u.tiller = 0; w.step(DT); if (i % 120 === 119) console.log(((i+1)/60).toFixed(0), 'v', u.v.toFixed(2), 'sway', (u.sway??0).toFixed(3), 'ast', (u.astern??0).toFixed(2)); }
});
