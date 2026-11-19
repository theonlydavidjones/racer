// Crew stability soak (the sprint, the Coordinator, 18 Nov 2026), not part of the suite. To run it:
//   cp scripts/check/crewsoak/soak.ts tests/zz-soak.test.ts && SOAK_OUT=soak.txt npx vitest run tests/zz-soak.test.ts
// (-t "slip out" for the cruises alone, -t "races" for the races; TRACE=1 logs her state every 30 s and the toasts).
// Faults go to SOAK_OUT, one line each, the first of each kind and the 30th; pose faults as POSE (lasting) or BRIEF (one check). Pose checks: crewfig.test.ts through(), at
// 10 cm along each bone against render/crew.ts ground() (the same surfaces crewfig uses, 5 cm allowed), and elbows().
import { it } from 'vitest';
import { writeFileSync, appendFileSync } from 'fs';
import * as THREE from 'three';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { engage } from '../src/boat/autopilot';
import { SLIPS } from '../src/geo/marina';
import { n360 } from '../src/core/math';
import { LL } from '../src/geo/geo';
import { buildCrew, ground, syncCrew, underDeck, type Crew, type Figure } from '../src/render/crew';
import { BONE } from '../src/render/crewBody';
import { halfBeam, uAtZ, L } from '../src/render/hull';
import type { Boat } from '../src/boat/boat';
import { trueDepth } from './helpers/trueDepth';

const OUT = process.env.SOAK_OUT!;
const log = (s: string) => appendFileSync(OUT, s + '\n');
const SHEETS = new Set(['jibsheet', 'mainsheet', 'jibsheetW', 'traveller', 'paddle', 'outboard']);

function bones(f: Figure, step = 0.25): { name: string; p: THREE.Vector3 }[] {
  f.root.updateMatrixWorld(true);
  const w = (o: THREE.Object3D, y = 0) => o.localToWorld(new THREE.Vector3(0, y, 0));
  const out: { name: string; p: THREE.Vector3 }[] = [];
  const seg = (name: string, a: THREE.Vector3, b: THREE.Vector3) => { for (let t = 0; t <= 1.0001; t += step) out.push({ name, p: a.clone().lerp(b, t) }); };
  f.leg.forEach((l, i) => { const hip = w(l.root), knee = w(l.mid), ankle = w(l.mid, -BONE.shin); seg(`thigh${i}`, hip, knee); seg(`shin${i}`, knee, ankle); });
  f.arm.forEach((a, i) => { const sh = w(a.root), el = w(a.mid), wr = w(a.mid, -BONE.fore); seg(`upper${i}`, sh, el); seg(`fore${i}`, el, wr); });
  seg('spine', w(f.root), w(f.head)); out.push({ name: 'head', p: w(f.head, 0.12) });
  return out;
}
function poseFaults(cr: Crew, b: Boat): string[] {
  const bad: string[] = [];
  for (const [who, f] of [['helm', cr.helm], ...cr.crew.map((f, i) => [`crew${i + 1}`, f] as const)] as const) {
    if (!f.root.visible) continue;
    const a = b.crew!.people[who === 'helm' ? 0 : +who.slice(4)], pose = `${a?.pose}${a?.job ? ', job ' + a.job.line : ''}`;
    for (const { name, p } of bones(f, 0.1)) {
      if (Math.abs(p.z) > L / 2 - 0.05 || Math.abs(p.x) > halfBeam(uAtZ(p.z)) - 0.02) continue;
      const g = ground(p.x, p.z, p.y);
      if (underDeck(p.x, p.y, p.z)) continue;
      // (true depth, Crew Figures' tests/helpers/trueDepth.ts: the lesser of straight down under ground() and sideways out
      // from under it at the point's height; straight down alone read a knee by the cabin's after face as 49 cm into it)
      const d = p.y < g - 0.05 ? trueDepth(p.x, p.y, p.z, 0.05) : 0;
      if (d > 0.05) { bad.push(`through ${who}(${pose}) ${name} ${(d * 100).toFixed(0)} cm (straight down ${((g - p.y) * 100).toFixed(0)}) at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) under ground() ${g.toFixed(2)}, tack ${b.tack}, twa ${b.twa.toFixed(0)}, heel ${b.heel.toFixed(0)}, docked ${!!b.docked}`); break; }
    }
    const w = (o: THREE.Object3D, x = 0, y = 0, z = 0) => o.localToWorld(new THREE.Vector3(x, y, z));
    const fw = w(f.root, 0, 0, -1).sub(w(f.root)).setY(0);
    f.arm.forEach((a, i) => {
      const sh = w(a.root), el = w(a.mid), wr = w(a.mid, 0, -BONE.fore), line = wr.clone().sub(sh), t = el.clone().sub(sh).dot(line) / line.lengthSq();
      const off = el.clone().sub(sh.clone().addScaledVector(line, t)), ahead = off.dot(fw) / fw.length();
      if (ahead > 0.08 && -off.y < ahead) bad.push(`elbow ${who}(${pose}) arm${i} ${(ahead * 100).toFixed(0)} cm forward, tack ${b.tack}, twa ${b.twa.toFixed(0)}, docked ${!!b.docked}`);
    });
  }
  return bad;
}

type St = { jobRef: unknown[]; jobT: number[]; still: { x: number; z: number; t: number }[]; turnT: number; tack: string; checked: boolean; seen: Set<string> };
function watcher(label: string, b: Boat, w: World) {
  const n = b.crew!.people.length;
  const s: St = { jobRef: Array(n).fill(null), jobT: Array(n).fill(0), still: b.crew!.people.map(a => ({ x: a.x, z: a.z, t: w.t })), turnT: -1e9, tack: b.tack, checked: true, seen: new Set() };
  const fault = (key: string, msg: string) => { if (s.seen.has(key)) return; s.seen.add(key); log(`${label} ${w.t.toFixed(1)} s: ${msg}`); };
  return () => {
    const c = b.crew!; if (!c) return;
    c.people.forEach((a, i) => {
      const j = a.job;
      if (j !== s.jobRef[i]) { s.jobRef[i] = j; s.jobT[i] = w.t; }
      if (j && !SHEETS.has(j.line) && w.t - s.jobT[i]! > 60) fault(`job${i}${j.line}${s.jobT[i]}`, `JOB never finishes: ${i ? 'crew ' + i : 'helm'} on ${j.line} for ${(w.t - s.jobT[i]!).toFixed(0)} s (reach ${j.reach.toFixed(1)}, work ${j.work.toFixed(1)}, to ${j.to?.toFixed?.(2)}, ctl ${(b.ctl as never)[j.line] ?? ''}) pose ${a.pose} at z ${a.z.toFixed(2)} x ${a.x.toFixed(2)}`);
      const g = a.goal, st = s.still[i]!;
      // (stuck: their goal well away, and not a centimetre nearer it for 10 s: the clock starts when the goal moves off)
      const far = !!g && Math.hypot(g.x - a.x, g.z - a.z) > 0.25;
      if (!far || Math.hypot(a.x - st.x, a.z - st.z) > 0.01) { st.x = a.x; st.z = a.z; st.t = w.t; }
      else if (w.t - st.t > 10) fault(`stuck${i}${st.t}`, `STUCK: ${i ? 'crew ' + i : 'helm'} still for ${(w.t - st.t).toFixed(0)} s at z ${a.z.toFixed(2)} x ${a.x.toFixed(2)}, goal z ${g.z.toFixed(2)} x ${g.x.toFixed(2)}, pose ${a.pose}, job ${j?.line ?? '-'}`);
      if (!Number.isFinite(a.x) || !Number.isFinite(a.z)) fault(`nan${i}`, `NaN position: ${i}`);
    });
    if (b.tack !== s.tack) { s.tack = b.tack; s.turnT = w.t; s.checked = false; }
    if (!s.checked && w.t - s.turnT > 20 && !b.tacking) {
      s.checked = true;
      const p = b.crewPlan, rig = b.rig;
      if (p && (!rig || (rig.main > 0.9 && rig.jib > 0.9))) for (const k of ['jibsheet', 'mainsheet'] as const) {
        const want = (p as never)[k] as number | undefined, have = b.ctl[k];
        if (want != null && Math.abs(want - have) > 0.2) fault(`line${k}${s.turnT}`, `LINE after the turn at ${s.turnT.toFixed(0)} s: ${k} ${have.toFixed(2)}, plan ${want.toFixed(2)}, twa ${b.twa.toFixed(0)}`);
      }
      if (b.pole === 'set' && b.poleTack !== b.tack) fault(`pole${s.turnT}`, `POLE on the old side 20 s after the gybe at ${s.turnT.toFixed(0)} s`);
    }
  };
}
function drawn(label: string, b: Boat, w: World) {
  const cr = buildCrew(b.crew!.spec.helm, b.crew!.spec.crew, [1, 2, 3], 1); let k = 0; const seen = new Map<string, number>(), brief = new Map<string, number>(), run = new Map<string, number>(), first = new Map<string, string>();
  return () => {
    syncCrew(cr, b.rel >= 0 ? 1 : -1, b.crew, DT, false, undefined, b.heel, b.tacking);
    if (++k % 6 || w.t < 3) return;
    // (checked every 0.1 s. A fault that lasts, on consecutive checks, is logged as POSE: a limb through the boat on 2 or
    // more, an elbow forward on 3 or more (0.2 s: a frame or two's lag as the body turns sharply is ik()'s BEND_RATE and
    // ELBOW_SPEED holding the bend, not a held backwards arm, Crew Figures, 19 Nov 2026). One that shows on a single check
    // and is gone by the next is logged apart, as BRIEF: the one-frame knee sweeps)
    const now = new Map<string, string>();
    for (const f of poseFaults(cr, b)) { const key = f.replace(/ \d+ cm.*/, ''); if (!now.has(key)) now.set(key, f); }
    for (const [key, f] of now) {
      const r = (run.get(key) ?? 0) + 1; run.set(key, r); if (r === 1) first.set(key, `${w.t.toFixed(1)} s: ${f}`);
      if (r === (key.startsWith('elbow') ? 3 : 2)) { const c = (seen.get(key) ?? 0) + 1; seen.set(key, c); if (c === 1 || c === 30) log(`${label} ${first.get(key)}: POSE (lasting, ${c === 30 ? '30th time' : 'from here'}) ${f}`); }
    }
    for (const [key, r] of run) if (!now.has(key)) {
      run.delete(key);
      if (r === 1 || (key.startsWith('elbow') && r === 2)) { const c = (brief.get(key) ?? 0) + 1; brief.set(key, c); if (c === 1 || c === 30) log(`${label} ${first.get(key)}: BRIEF (${r} check${r > 1 ? 's' : ''}${c === 30 ? ', 30th time' : ''})`); }
    }
  };
}

it('soak: slip out, cruise with tacks and gybes, home and made fast', () => {
  writeFileSync(OUT, '');
  for (const kt of [8, 14, 22]) {
    const slip = SLIPS[40], boat = { ...DEFAULT_BOAT, slip: slip.id };
    const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack', sea: 'real' };
    const w = new World(COURSES[0], S, 3, { freeSail: true }), u = w.user, L0 = `cruise ${kt} kt`;
    const watch = watcher(L0, u, w), draw = drawn(L0, u, w);
    let nx = 0; const step = (secs: number, each?: () => boolean | void) => { const end = w.t + secs; while (w.t < end) { w.step(DT); if (process.env.TRACE) for (const e of w.drainEvents()) if (e.type === 'toast') log(`${L0} ${w.t.toFixed(1)} TOAST ${(e as { msg: string }).msg} | tiller ${u.tiller.toFixed(2)} ram ${w.pilot.ram.toFixed(2)} alarm ${w.pilot.alarm}`); watch(); draw(); if (process.env.TRACE && w.t >= nx) { nx = w.t + (w.t > 370 && w.t < 470 ? 2 : 30); log(`${L0} ${w.t.toFixed(0)} . v ${u.v.toFixed(2)} twa ${u.twa.toFixed(0)} h ${u.h.toFixed(0)} pilot ${w.pilot.mode} ${w.pilot.course?.toFixed?.(0)} rig ${u.rig ? u.rig.main.toFixed(1) + '/' + u.rig.jib.toFixed(1) : 'up'} docked ${!!u.docked} handled ${!!u.handled} tacking ${u.tacking} astern ${(u.astern ?? 0).toFixed(2)} tiller ${u.tiller.toFixed(2)} helm ${(u.helm ?? 0).toFixed(2)} rel ${u.rel.toFixed(0)} tack ${u.tack} jib ${u.ctl.jibsheet.toFixed(2)}/${u.ctl.jibsheetW.toFixed(2)} main ${u.ctl.mainsheet.toFixed(2)} trav ${u.ctl.traveller.toFixed(2)} jibAng ${u.jib?.toFixed?.(0)} boom ${u.boom?.toFixed?.(0)} jobs ${u.crew!.people.map(a => a.job?.line ?? '-').join(',')} yaw ${(u.yawRate ?? 0).toFixed(1)}`); } if (each?.()) return; } };
    step(5); if (!w.pushOff()) log(`${L0}: push-off refused (kept fast: ${w.drainEvents().filter(e => e.type === 'toast').map(e => (e as { msg: string }).msg).join(' / ').slice(0, 160)})`);
    step(120, () => { if (u.handled?.held) w.setSail('main', true); return !u.handled; });
    if (u.handled) { w.pushOff(); step(60); }
    log(`${L0} ${w.t.toFixed(0)} s: phase out, handled ${!!u.handled}, docked ${!!u.docked}, v ${u.v.toFixed(2)}`);
    w.setSail('main', true); w.setSail('jib', true); step(30);
    // (out of the harbor: the cruise itself in open water east of Alcatraz, as crewcruise sails it)
    const q = LL(37.835, -122.40); Object.assign(u, { x: q.x, y: q.y, h: n360(w.wind.from + 60), v: 2.5, astern: 0, docked: undefined, handled: undefined }); engage(u, w.pilot, 'wind');
    // (on the pilot's wind angle: close-hauled, tacking each 2 minutes; then broad, gybing each 2 minutes)
    // (the pilot to standby, as it says, the tiller is yours: centered, and the pilot on again once she's moving)
    let offAt = -1;
    const keep = (awa: number) => () => { if (w.pilot.mode === 'off') { if (offAt < 0) { offAt = w.t; u.tiller = 0; log(`${L0} ${w.t.toFixed(0)} s: pilot to standby, tiller ${u.tiller.toFixed(2)}, v ${u.v.toFixed(2)}`); } else if (w.t - offAt > 15 && u.v > 0.5 && !u.astern) { engage(u, w.pilot, 'wind'); w.pilot.awa = awa; offAt = -1; } } };
    // (close-hauled at 40° apparent, her polar's 41-43° true or so: at 32° she pinched to 31-36° true, 3.7 kt in 22 kt
    // instead of 5.1, and stalled in the tack, the harness's own fault, 19 Nov 2026)
    for (let i = 0; i < 4; i++) { const a = i % 2 ? -40 : 40; w.pilot.awa = a; step(120, keep(a)); }
    for (let i = 0; i < 3; i++) { const a = i % 2 ? -150 : 150; w.pilot.awa = a; step(120, keep(a)); }
    log(`${L0} ${w.t.toFixed(0)} s: phase cruise done, v ${u.v.toFixed(2)} twa ${u.twa.toFixed(0)}`);
    // (home: sails struck off the harbor, then in her slip bow first, slow, as marina.test brings her in)
    w.sendHome(); w.pilot.mode = 'off'; w.setSail('jib', false); step(40); w.setSail('main', false); step(40);
    Object.assign(u, { x: slip.p.x, y: slip.p.y, h: slip.heading + 10, v: 0.2, astern: 0 }); w.step(DT);
    log(`${L0} ${w.t.toFixed(0)} s: in her slip, arrived ${w.arrivedT != null}, docked ${!!u.docked}`);
    step(120);
    log(`${L0} ${w.t.toFixed(0)} s: end, docked ${!!u.docked}, rig ${JSON.stringify(u.rig)}`);
  }
}, 3_600_000);

it('soak: races at 8, 14 and 20 kt', () => {
  // (22 kt is over the fleet's 23 kt limit on the course with the gusts: the committee abandons it, N over A)
  for (const kt of [8, 14, 20]) {
    const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, tideDate: '2026-07-11', current: 'slack', sea: 'real', traffic: 0, mode: 'race', fleet: 3, opponents: ['stock:1', 'stock:2', 'stock:3'] } as Settings;
    const w = new World(COURSES[0], S, 3, {}), ai = w.boats.filter(b => !b.isUser), L0 = `race ${kt} kt`;
    const watches = ai.map(b => watcher(`${L0} ${b.name}`, b, w)), draw = drawn(`${L0} ${ai[0]!.name}`, ai[0]!, w);
    const far = { x: w.user.x + 3e4, y: w.user.y + 3e4 };
    while (w.t < 20 * 60) { Object.assign(w.user, { x: far.x, y: far.y, v: 0 }); w.step(DT); watches.forEach(f => f()); draw(); }
    log(`${L0}: end at ${w.t.toFixed(0)} s, legs ${ai.map(b => b.leg).join(',')}`);
  }
}, 3_600_000);
