import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { WaveField, waveTime, N_WAVES } from '../src/environment/waveField';
import { foamDrift } from '../src/environment/sea';
import { D2R, V } from '../src/core/math';
import { LL } from '../src/geo/geo';
import { EnvelopeFrame, FOAM_ACROSS, FOAM_ALONG, FoamFrame, turnTexture, uvAt } from '../src/render/waterFrame';

/**
 * "Rushing water", its fourth return (the owner: "way out at the map edge outside the Golden Gate"): the drawn water's
 * layers that lie along the wind or the waves (the ripples, the foam's streaks, the wave groups' light) were turned
 * about the Bay's origin, so 14 km from it a degree of turn swept them 250 m past a still boat. Each is held here, at
 * the map's west edge, its corners and off the bar, to moving past a still boat no faster than the water it lies on
 * (the foam) or its own waves' groups (the light), and not at all (the ripples, with no current), while the wind turns.
 */
const SPOTS: [string, { x: number; y: number }][] = [
  ['the west edge', LL(37.81, -122.605)], ['past the west edge', LL(37.81, -122.64)], ['the north-west corner', LL(37.98, -122.605)],
  ['the south-west corner', LL(37.74, -122.605)], ['the north-east corner', LL(37.98, -122.19)], ['the south-east corner', LL(37.74, -122.19)],
  ['off the bar', LL(37.80, -122.54)], ['the GGYC line', { x: 0, y: 0 }],
];
const TILE = 30, REP = { x: 4000, y: 4000 }, C = { x: 0.5, y: 0.5 }; // (scene.ts: 120 km of water, 4000 tiles, turned about its middle)
const uvOf = (p: { x: number; y: number }) => ({ x: (p.x + 60000) / 120000, y: (p.y + 60000) / 120000 });

describe('the drawn water turns where you are, not about the Bay\'s origin (the owner\'s "rushing water" at the map\'s edge)', () => {
  it('the ripples: the mean wind turning 10° in a minute, they don\'t move at the boat, and 200 m off by no more than that turn sweeps 200 m', () => {
    for (const [name, at] of SPOTS) {
      let off = { x: 0, y: 0 }, rot = -250 * D2R; const near = { x: at.x + 200, y: at.y };
      let atBoat = 0, off200 = 0, old = 0;
      for (let k = 0; k < 600; k++) {
        const r1 = rot - (10 * D2R) / 600, o1 = turnTexture(off, REP, C, rot, r1, uvOf(at));
        const a0 = uvAt(uvOf(at), off, REP, rot, C), a1 = uvAt(uvOf(at), o1, REP, r1, C), b0 = uvAt(uvOf(near), off, REP, rot, C), b1 = uvAt(uvOf(near), o1, REP, r1, C);
        const u0 = uvAt(uvOf(at), off, REP, r1, C); // (as it was: the rotation changed, the offset left alone)
        atBoat = Math.max(atBoat, Math.hypot(a1.x - a0.x, a1.y - a0.y) * TILE / 0.1); off200 = Math.max(off200, Math.hypot(b1.x - b0.x, b1.y - b0.y) * TILE / 0.1);
        old = Math.max(old, Math.hypot(u0.x - a0.x, u0.y - a0.y) * TILE / 0.1);
        off = o1; rot = r1;
      }
      expect(atBoat, name).toBeLessThan(1e-3); // m/s
      expect(off200, name).toBeLessThan(200 * (10 * D2R) / 60 * 1.05);
      if (name === 'the west edge') expect(old).toBeGreaterThan(30); // (what the owner saw: over 30 m/s past her)
    }
  });
  it('the foam: it drifts with the surface water and no faster while the wind here swings 20° and back, and a new local origin changes nothing', () => {
    for (const [name, at] of SPOTS) {
      const f = new FoamFrame(), drift = { x: 0.4, y: -0.2 }, dt = 1 / 60; let o = { x: Math.round(at.x / 500) * 500, y: Math.round(at.y / 500) * 500 };
      f.step(V(70), drift, 0, o, at);
      let worst = 0, worst200 = 0; const near = { x: at.x + 200, y: at.y };
      for (let k = 0; k < 3600; k++) {
        const dir = V(70 + 20 * Math.sin(k / 3600 * 2 * Math.PI)), a0 = f.at(at), b0 = f.at(near), d0 = { x: f.dx, y: f.dy };
        if (k === 1800) { const p0 = f.at(near); o = { x: o.x + 500, y: o.y - 500 }; f.step(d0, drift, 0, o, at); const p1 = f.at(near); expect(Math.hypot(p1.x - p0.x, p1.y - p0.y), name).toBeLessThan(1e-6); }
        f.step(dir, drift, dt, o, at);
        const a1 = f.at(at), b1 = f.at(near);
        // back to meters on the water, by the streaks' own lengths along and across the wind
        const m = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot((q.x - p.x) * FOAM_ALONG, (q.y - p.y) * FOAM_ACROSS) / dt;
        worst = Math.max(worst, m(a0, a1)); worst200 = Math.max(worst200, m(b0, b1));
      }
      const sp = Math.hypot(drift.x, drift.y), swing = 20 * D2R * 2 * Math.PI / 60; // (its fastest turn, rad/s)
      expect(worst, name).toBeLessThan(sp * FOAM_ALONG / FOAM_ACROSS * 1.02); // (the drift, read in the streaks' stretched coordinates)
      expect(worst200, name).toBeLessThan(sp * FOAM_ALONG / FOAM_ACROSS + 200 * swing * FOAM_ALONG / FOAM_ACROSS * 1.05);
    }
  });
  it('the wave groups\' light: each envelope moves at its group speed along its wave and not across it, while the field turns 30° with the wind', () => {
    for (const [name, at] of SPOTS) {
      const f = new WaveField(12), sea = { hsW: 0.6, tpW: 3, hsS: 1, tpS: 12, fromS: 270, white: 0 } as never, env = new EnvelopeFrame(), e = new Float32Array(N_WAVES * 2);
      const o = { x: Math.round(at.x / 500) * 500, y: Math.round(at.y / 500) * 500 };
      f.update(sea, 250, 0, at); env.pack(f, e, 600, o, at);
      let prev = Array.from({ length: N_WAVES }, (_, i) => env.at(e, i, at, o)), worstA = 0, worstC = 0;
      for (let s = 1; s <= 120; s++) {
        for (let k = 0; k < 60; k++) { f.update(sea, 250 + 30 * Math.min(1, s / 60), 1 / 60, at); env.pack(f, e, 600 + s - 1 + (k + 1) / 60, o, at); }
        const now = Array.from({ length: N_WAVES }, (_, i) => env.at(e, i, at, o));
        for (let i = 0; i < 12; i++) { const cg = 0.5 * f.w[i] / f.k[i]; worstA = Math.max(worstA, Math.abs((now[i].x - prev[i].x) + cg) / cg); worstC = Math.max(worstC, Math.abs(now[i].y - prev[i].y)); }
        prev = now;
      }
      expect(worstA, name).toBeLessThan(0.03); // (along: its group speed, within 3%: float32 in the shader's numbers)
      expect(worstC, name).toBeLessThan(0.02); // (across: still, m a second)
    }
  });
  it('on a sea-breeze afternoon at the map\'s west edge, the day\'s own turning wind: the three layers as the scene draws them, 6 minutes', () => {
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, tideDate: '2026-11-14', windKt: 0, mode: 'sail', sailFrom: 'gate', sailTo: '' } as Settings, 1, { freeSail: true } as never);
    for (let i = 0; i < 60; i++) w.step(DT);
    w.moveHere(LL(37.81, -122.605), 'here');
    const u = w.user, at = { x: u.x, y: u.y }, o = { x: Math.round(at.x / 500) * 500, y: Math.round(at.y / 500) * 500 };
    const foam = new FoamFrame(), env = new EnvelopeFrame(), e = new Float32Array(N_WAVES * 2);
    let off = { x: 0, y: 0 }, rot = -w.windModel.base * D2R, base0 = w.windModel.base, turned = 0;
    let rip = 0, fo = 0, pa: { x: number; y: number } | null = null;
    for (let i = 0; i < 60 * 360; i++) {
      u.x = at.x; u.y = at.y; u.v = 0; w.step(DT);
      turned = Math.max(turned, Math.abs(w.windModel.base - base0));
      // the ripples (scene.ts render): eased to the mean wind, turned where they lie at the boat
      const d = Math.atan2(Math.sin(-w.windModel.base * D2R - rot), Math.cos(-w.windModel.base * D2R - rot)), r1 = rot + d * Math.min(1, DT * 0.2);
      const o1 = turnTexture(off, REP, C, rot, r1, uvOf(at)), a0 = uvAt(uvOf(at), off, REP, rot, C), a1 = uvAt(uvOf(at), o1, REP, r1, C);
      rip = Math.max(rip, Math.hypot(a1.x - a0.x, a1.y - a0.y) * TILE / DT); off = o1; rot = r1;
      // the foam: down the wind here, drifting with the surface water
      const fh = w.fieldAt(at), go = V(w.wind.from + fh.turn + 180), fd = foamDrift(w.wind.from, w.wind.kt, w.cvec);
      const q0 = pa; foam.step(go, fd, DT, o, at); const q1 = foam.at(at);
      if (q0) fo = Math.max(fo, Math.hypot((q1.x - q0.x) * FOAM_ALONG, (q1.y - q0.y) * FOAM_ACROSS) / DT - Math.hypot(fd.x, fd.y) * FOAM_ALONG / FOAM_ACROSS);
      pa = q1;
      env.pack(w.waves, e, waveTime(w.t), o, at);
    }
    expect(rip).toBeLessThan(1e-3); expect(fo).toBeLessThan(0.02);
  }, 300_000);
});
