// Crew audit (the Coordinator, 21 Nov 2026), not part of the suite. Every figure of the watched boats, every 3rd frame
// (0.05 s), through races (start, tacks, roundings, gybes) at 4, 12 and 20 kt on the AI boats, a 22 kt cruise beating
// and running, and a cruise from the slip and home, made fast. Rough edges by kind, each run of them (lasting 2 checks
// or more) counted, its worst kept with the 6 s before it and 1 s after, as a replay (tests/helpers/crewReplay) for stills.
//   cp scripts/check/crewaudit/audit.ts tests/zz-audit.test.ts && AUDIT_OUT=<dir> node_modules/.bin/vitest run tests/zz-audit.test.ts [-t race|cruise]
//   (AUDIT_SCALE=0.05 for a short trial; the replays it writes draw in the crew lab as docs/crew/crew-audit.md says)
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'fs';
import * as THREE from 'three';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { engage } from '../src/boat/autopilot';
import { SLIPS } from '../src/geo/marina';
import { n360 } from '../src/core/math';
import { LL } from '../src/geo/geo';
import { buildCrew, fistAt, ground, syncCrew, underDeck, type Crew, type Figure } from '../src/render/crew';
import { BONE } from '../src/render/crewBody';
import { halfBeam, uAtZ, L } from '../src/render/hull';
import type { Boat } from '../src/boat/boat';
import { trueDepth } from './helpers/trueDepth';

const OUT = process.env.AUDIT_OUT ?? '/tmp/audit';
mkdirSync(OUT, { recursive: true });
const V3 = () => new THREE.Vector3();
const wp = (o: THREE.Object3D, x = 0, y = 0, z = 0) => o.localToWorld(new THREE.Vector3(x, y, z));
type Seg = { name: string; a: THREE.Vector3; b: THREE.Vector3; r: number };
function segs(f: Figure): { limbs: Seg[]; body: Seg[]; arms: Seg[] } {
  f.root.updateMatrixWorld(true); const k = f.scale, limbs: Seg[] = [], body: Seg[] = [], arms: Seg[] = [];
  f.leg.forEach((l, i) => { const h = wp(l.root), kn = wp(l.mid), an = wp(l.mid, 0, -BONE.shin); limbs.push({ name: `thigh${i}`, a: h, b: kn, r: 0.075 * k }, { name: `shin${i}`, a: kn, b: an, r: 0.055 * k }); });
  f.arm.forEach((a, i) => { const sh = wp(a.root), el = wp(a.mid), wr = wp(a.mid, 0, -BONE.fore); const s1 = { name: `upper${i}`, a: sh, b: el, r: 0.045 * k }, s2 = { name: `fore${i}`, a: el, b: wr, r: 0.04 * k }; limbs.push(s1, s2); arms.push(s1, s2); });
  body.push(...limbs.filter(s => s.name.startsWith('thigh') || s.name.startsWith('shin')), { name: 'torso', a: wp(f.root), b: wp(f.head), r: 0.12 * k }, { name: 'head', a: wp(f.head, 0, 0.05), b: wp(f.head, 0, 0.16), r: 0.1 * k });
  return { limbs, body, arms };
}
const segDist = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()))); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
const pts = (s: Seg, step: number) => { const n = Math.max(1, Math.ceil(s.a.distanceTo(s.b) / step)), o: THREE.Vector3[] = []; for (let q = 0; q <= n; q++) o.push(s.a.clone().lerp(s.b, q / n)); return o; };

type Ev = { kind: string; mag: number; where: string };
/** One check of a boat's drawn crew: each rough edge seen now. */
function check(cr: Crew, b: Boat, prevJ: Map<string, THREE.Vector3>, dt: number): Ev[] {
  const ev: Ev[] = [], figs = [['helm', cr.helm] as const, ...cr.crew.map((f, j) => [`crew${j + 1}`, f] as const)].filter(([, f]) => f.root.visible);
  const S = new Map(figs.map(([w, f]) => [w, segs(f)]));
  for (const [who, f] of figs) {
    const k = who === 'helm' ? 0 : +who.slice(4), a = b.crew!.people[k]!, tag = `${who} ${a.pose}${a.job ? '/' + a.job.line : ''}`, s = S.get(who)!;
    const moving = !!(f.going || f.route || f.walking);
    // 1. through the boat: every 5 cm of each limb and the spine (crewfig's through(), its allowances)
    let deep = 0, dw = '';
    for (const sg of [...s.limbs, { name: 'spine', a: wp(f.root), b: wp(f.head), r: 0 }]) for (const p of pts(sg, 0.05)) {
      if (Math.abs(p.z) > L / 2 - 0.05 || Math.abs(p.x) > halfBeam(uAtZ(p.z)) - 0.02 || underDeck(p.x, p.y, p.z)) continue;
      const d = trueDepth(p.x, p.y, p.z, 0.025); if (d > deep) { deep = d; dw = `${sg.name} at (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`; }
    }
    if (deep > 0.03) ev.push({ kind: `CLIP ${tag}`, mag: deep, where: dw });
    // 2. arms through a body, theirs or another's (crewarms' capsules: the bone's line inside the part)
    for (const arm of s.arms) for (const [whom, o] of S) for (const c of o.body) {
      if (whom === who && c.name.startsWith('thigh') === false && c.name !== 'torso' && c.name !== 'head') continue;
      let worst = 0; for (const [q, p] of pts(arm, 0.02).entries()) { if (arm.name.startsWith('upper') && q * 0.02 < 0.06) continue; worst = Math.max(worst, c.r - segDist(p, c.a, c.b)); }
      if (worst > 0.03) ev.push({ kind: `ARM ${tag} ${arm.name.slice(0, -1)} → ${whom === who ? 'own' : whom} ${c.name.replace(/\d$/, '')}${b.tacking ? ' (tacking)' : ''}`, mag: worst, where: '' });
    }
    // 3. legs through another's body (two people in one place)
    for (const [whom, o] of S) if (whom > who) for (const l of s.limbs.concat({ name: 'torso', a: wp(f.root), b: wp(f.head), r: 0.12 * f.scale })) for (const c of o.body.concat(o.arms)) {
      let worst = 0; for (const p of pts(l, 0.04)) worst = Math.max(worst, c.r + l.r - segDist(p, c.a, c.b));
      if (worst > 0.06) ev.push({ kind: `PEOPLE ${tag} ${l.name.replace(/\d$/, '')} ↔ ${whom} ${c.name.replace(/\d$/, '')}`, mag: worst, where: '' });
    }
    const fw = wp(f.root, 0, 0, -1).sub(wp(f.root)).setY(0).normalize();
    // 4. elbows forward of the shoulder-to-wrist line (crewfig elbows()), once settled
    f.arm.forEach((am, i) => { const sh = wp(am.root), el = wp(am.mid), wr = wp(am.mid, 0, -BONE.fore), line = wr.clone().sub(sh), t = el.clone().sub(sh).dot(line) / line.lengthSq(), off = el.clone().sub(sh.clone().addScaledVector(line, t)), ahead = off.dot(fw);
      if (!moving && ahead > 0.08 && -off.y < ahead) ev.push({ kind: `ELBOW ${tag} arm${i}`, mag: ahead, where: '' }); });
    // 5. knees bent the wrong way: behind the hip-to-ankle line, against the way they face
    f.leg.forEach((lg, i) => { const h = wp(lg.root), kn = wp(lg.mid), an = wp(lg.mid, 0, -BONE.shin), line = an.clone().sub(h), t = kn.clone().sub(h).dot(line) / line.lengthSq(), off = kn.clone().sub(h.clone().addScaledVector(line, t)), lf = wp(f.root, 0, 0, -1).sub(wp(f.root)).normalize();
      if (off.length() > 0.06 && off.dot(lf) < -0.06) ev.push({ kind: `KNEE ${tag} leg${i} backward`, mag: -off.dot(lf), where: '' }); });
    // 6. hands short of where the pose puts them (a line not in the hand: the arm can't reach it)
    if (f.cur) for (const i of [0, 1] as const) { const want = f.cur.hands[i]; if (!want) continue; const par = f.root.parent!; const fi = par.localToWorld(fistAt(f, i)), wt = par.localToWorld(want.clone()); const d = fi.distanceTo(wt) - 0.065; if (!moving && d > 0.1) ev.push({ kind: `HAND ${tag} hand${i} short`, mag: d, where: '' }); }
    // 7. feet in the air: a foot not stepping, its ankle well over what's under it (on the deck or inside the boat)
    f.leg.forEach((lg, i) => { const an = f.root.parent!.worldToLocal(wp(lg.mid, 0, -BONE.shin)); if (f.swing?.[i] || moving || Math.abs(an.x) > halfBeam(uAtZ(an.z)) - 0.05 || Math.abs(an.z) > L / 2 - 0.1) return; if (a.pose === 'hike' || a.pose === 'bow') return;
      const up = an.y - ground(an.x, an.z, an.y + 0.02) - 0.06; if (up > 0.08) ev.push({ kind: `FOOT ${tag} foot${i} in the air`, mag: up, where: `(${an.x.toFixed(2)}, ${an.y.toFixed(2)}, ${an.z.toFixed(2)})` }); });
    // 8. pops: a joint faster than a person moves it (crewfig motion: 5.5 m/s)
    for (const [jn, o, y] of [['head', f.head, 0.1], ['hand0', f.arm[0].mid, -BONE.fore], ['hand1', f.arm[1].mid, -BONE.fore], ['elbow0', f.arm[0].mid, 0], ['elbow1', f.arm[1].mid, 0], ['knee0', f.leg[0].mid, 0], ['knee1', f.leg[1].mid, 0], ['foot0', f.leg[0].mid, -BONE.shin], ['foot1', f.leg[1].mid, -BONE.shin]] as const) {
      const p = f.root.parent!.worldToLocal(wp(o, 0, y)), key = `${who}${jn}`, q = prevJ.get(key); prevJ.set(key, p);
      if (q && dt > 0) { const v = p.distanceTo(q) / dt; if (v > 5.5) ev.push({ kind: `POP ${tag} ${jn}`, mag: v, where: '' }); }
    }
    // 9. not where the physics has their weight: the hips well off the person's place, sat still
    if (f.cur && !moving && !b.tacking) { const d = Math.hypot(f.cur.hip.x - a.x, f.cur.hip.z - a.z); if (d > 0.3) ev.push({ kind: `WEIGHT ${tag} hips off their place`, mag: d, where: `hips (${f.cur.hip.x.toFixed(2)}, ${f.cur.hip.z.toFixed(2)}) person (${a.x.toFixed(2)}, ${a.z.toFixed(2)})` }); }
  }
  return ev;
}

type Rec = { t: number; w: number; heel: number; tacking?: boolean; clock: number; roll?: unknown; people: Record<string, unknown>[] };
type Agg = { n: number; dur: number; max: number; tMax: number; where: string; label: string; file?: string; runs: number[]; long?: string };
const longs = new Set<string>();
const agg = new Map<string, Agg>();
const pending: { key: string; until: number; buf: Rec[]; file: string }[] = [];
let fileN = 0;
function watch(label: string, b: Boat, w: World) {
  const cr = buildCrew(b.crew!.spec.helm, b.crew!.spec.crew, [1, 2, 3], 1); new THREE.Group().add(cr.group);
  const prevJ = new Map<string, THREE.Vector3>(), ring: Rec[] = [], run = new Map<string, { t0: number; n: number; max: number; where: string; tMax: number }>();
  let k = 0, lastT = w.t;
  return () => {
    syncCrew(cr, b.rel >= 0 ? 1 : -1, b.crew, DT, false, undefined, b.heel, b.tacking);
    const c = b.crew!;
    ring.push({ t: w.t, w: b.rel >= 0 ? 1 : -1, heel: b.heel, tacking: b.tacking, clock: c.clock, roll: JSON.parse(JSON.stringify(c.roll ?? null)), people: c.people.map(a => JSON.parse(JSON.stringify({ x: a.x, z: a.z, pose: a.pose, lean: a.lean, goal: a.goal, job: a.job ?? null, ready: a.ready, outUntil: a.outUntil }))) });
    while (ring.length && ring[0]!.t < w.t - 7) ring.shift();
    for (const p of pending) if (p.buf !== ring && p.until >= w.t && (p as { b?: Boat }).b === b) p.buf.push(ring[ring.length - 1]!);
    if (++k % 3 || w.t < 5) return;
    const now = new Map<string, Ev>();
    for (const e of check(cr, b, prevJ, w.t - lastT)) { const o = now.get(e.kind); if (!o || e.mag > o.mag) now.set(e.kind, e); }
    lastT = w.t;
    for (const [key, e] of now) { const r = run.get(key); if (!r) run.set(key, { t0: w.t, n: 1, max: e.mag, where: e.where, tMax: w.t }); else { r.n++; if (e.mag > r.max) { r.max = e.mag; r.where = e.where; r.tMax = w.t; } } }
    // (a run lasting 3 s: its first, kept as a replay of its 6 s before it and 1 s after, once per kind)
    for (const [key, r] of run) if (r.n * 0.05 >= 3 && !longs.has(key)) {
      longs.add(key); const file = `long${++fileN}.json`, pnd = { key, until: w.t + 1, buf: ring.filter(x => x.t >= w.t - 6), file, b, spec: b.crew!.spec, tMax: w.t, label } as never;
      pending.push(pnd); const g = agg.get(key) ?? { n: 0, dur: 0, max: 0, tMax: 0, where: '', label: '', runs: [] }; g.long = `${file} at ${label} ${w.t.toFixed(2)} s (${now.get(key)!.where})`; agg.set(key, g);
    }
    for (const [key, r] of [...run]) if (!now.has(key)) {
      run.delete(key);
      if (r.n < 2 && !key.startsWith('POP')) continue; // (lasting: two checks or more; a pop is one frame by nature)
      const g = agg.get(key) ?? { n: 0, dur: 0, max: 0, tMax: 0, where: '', label: '', runs: [] }; g.n++; g.dur += r.n * 0.05; g.runs.push(r.n * 0.05);
      if (r.max > g.max) {
        g.max = r.max; g.tMax = r.tMax; g.where = r.where; g.label = label;
        // (the worst so far: its 6 s before and 1 s after, as a replay)
        const file = g.file ?? `rec${++fileN}.json`; g.file = file;
        const buf = ring.filter(x => x.t >= r.tMax - 6); const pnd = { key, until: w.t + 1, buf, file, b } as { key: string; until: number; buf: Rec[]; file: string; b: Boat };
        for (let i = pending.length - 1; i >= 0; i--) if (pending[i]!.file === file) pending.splice(i, 1);
        pending.push(pnd); (pnd as { spec?: unknown }).spec = b.crew!.spec; (pnd as { tMax?: number }).tMax = r.tMax; (pnd as { label?: string }).label = label;
      }
      agg.set(key, g);
    }
    for (let i = pending.length - 1; i >= 0; i--) { const p = pending[i]! as typeof pending[number] & { spec: unknown; tMax: number; label: string }; if (p.until < w.t) { writeFileSync(`${OUT}/${p.file}`, JSON.stringify({ key: p.key, label: p.label, tMax: p.tMax, spec: p.spec, frames: p.buf })); pending.splice(i, 1); } }
  };
}
function report(name: string) {
  const rows = [...agg].filter(([, g]) => g.n > 0).sort((a, b) => a[0].localeCompare(b[0])).map(([k, g]) => `${k.padEnd(70)} runs ${String(g.n).padStart(4)} total ${g.dur.toFixed(1).padStart(6)} s longest ${Math.max(...g.runs).toFixed(2)} s worst ${g.max.toFixed(3)} at ${g.label} ${g.tMax.toFixed(2)} s ${g.where} [${g.file}]${g.long ? ' LONG ' + g.long : ''}`);
  writeFileSync(`${OUT}/audit-${name}.txt`, rows.join('\n') + '\n');
}

it('audit: races at 4, 12 and 20 kt (the AI boats: start, tacks, roundings, gybes)', () => {
  agg.clear(); longs.clear();
  for (const [kt, mins] of [[12, 22], [20, 14], [4, 14]] as const) {
    const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, tideDate: '2026-07-11', current: 'slack', sea: 'real', traffic: 0, mode: 'race', fleet: 3, opponents: ['stock:1', 'stock:2', 'stock:3'] } as Settings;
    const w = new World(COURSES[0], S, 3, {}), ai = w.boats.filter(b => !b.isUser);
    const ws = ai.map(b => watch(`race ${kt} kt ${b.name}`, b, w)), far = { x: w.user.x + 3e4, y: w.user.y + 3e4 };
    while (w.t < mins * 60 * +(process.env.AUDIT_SCALE ?? 1)) { Object.assign(w.user, { x: far.x, y: far.y, v: 0 }); w.step(DT); ws.forEach(f => f()); }
  }
  report('race');
}, 7_200_000);

it('audit: cruises (22 kt beating and running; from the slip and home, made fast)', () => {
  agg.clear(); longs.clear();
  { const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 22, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', sea: 'real', traffic: 0 } as Settings;
    const w = new World(COURSES[0], S, 3, { freeSail: true }), u = w.user, p = LL(37.835, -122.40); u.x = p.x; u.y = p.y;
    w.step(DT); u.h = n360(u.ww.from + 45); u.v = 2.5; engage(u, w.pilot, 'wind'); const f = watch('cruise 22 kt', u, w);
    const step = (s: number) => { const end = w.t + s; while (w.t < end) { w.step(DT); f(); } };
    for (const a of [40, -40, 40, -40, 150, -150, 150]) { w.pilot.awa = a; step(90); if (w.pilot.mode === 'off') engage(u, w.pilot, 'wind'); } }
  { const slip = SLIPS[40], boat = { ...DEFAULT_BOAT, slip: slip.id };
    const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 10, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack', sea: 'real' };
    const w = new World(COURSES[0], S, 3, { freeSail: true }), u = w.user, f = watch('slip 10 kt', u, w);
    const step = (s: number) => { const end = w.t + s; while (w.t < end) { w.step(DT); f(); } };
    step(5); w.pushOff(); step(120); w.setSail('main', true); w.setSail('jib', true); step(40);
    w.sendHome(); w.pilot.mode = 'off'; w.setSail('jib', false); step(40); w.setSail('main', false); step(40);
    Object.assign(u, { x: slip.p.x, y: slip.p.y, h: slip.heading + 10, v: 0.2, astern: 0 }); w.step(DT); step(90); }
  report('cruise');
}, 7_200_000);
