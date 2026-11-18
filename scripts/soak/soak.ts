// A stability soak, headless: long cruises from each marina and whole races over a spread of seeds and winds, watching
// every boat for NaN or Infinity, for sitting still, spinning or being on land, the heap for growth, and the step for
// thrown errors (the owner's stability sprint, 18 Nov 2026). Run:
// SOAK_OUT=<out.jsonl> SOAK_K=<k> SOAK_N=<n> npx vitest run tests/soak.test.ts --pool=forks --execArgv=--expose-gc
// (the k-th of n shares of the jobs; SOAK_ONLY=cruise|race, SOAK_MIN=<minutes> to shorten). Without SOAK_OUT it does nothing.
import { DEFAULT_SETTINGS, type Settings } from '../../src/settings';
import { COURSES } from '../../src/courses/registry';
import { DT, World } from '../../src/sim/world';
import { applyCommand } from '../../src/sim/commands';
import { MARINAS, SLIPS, harborRoute } from '../../src/geo/marina';
import { PLACES } from '../../src/sim/places';
import { onLand } from '../../src/geo/shore';
import { DEFAULT_BOAT } from '../../src/boat/spec';
import type { Boat } from '../../src/boat/boat';

const proc = (globalThis as any).process, fs = await import('node:fs');
const out: string = proc.env.SOAK_OUT, K = +(proc.env.SOAK_K ?? 0), N = +(proc.env.SOAK_N ?? 1), ONLY = proc.env.SOAK_ONLY, MIN = +(proc.env.SOAK_MIN ?? 0);
const gc: (() => void) | undefined = (globalThis as any).gc;
const CORE = ['x', 'y', 'h', 'v', 'heel', 'sway', 'astern', 'turnRate', 'boom', 'jib', 'tiller', 'steer', 'twa', 'rel'];
type Fault = { kind: string; t: number; boat?: string; note: string };

function watch(w: World, label: string, minutes: number, each?: (w: World) => void) {
  const faults: Fault[] = [], seen = new Set<string>();
  const say = (kind: string, b: Boat | null, note: string, key = `${kind}:${b?.id}`) => { if (seen.has(key)) return; seen.add(key); faults.push({ kind, t: +w.t.toFixed(1), boat: b ? `${b.id} ${b.name}${b.isUser ? ' (user)' : ''}` : undefined, note }); };
  const tr = new Map<number, { at: { t: number; x: number; y: number }[]; hs: { t: number; d: number }[]; h: number; land: number }>();
  const heap: number[] = []; let nextHeap = w.t, steps = 0, worst = 0, nan = new Map<string, number>();
  const scan = (o: any, path: string, depth: number) => {
    for (const k in o) { const v = o[k];
      if (typeof v === 'number') { if (Number.isNaN(v)) nan.set(`${path}.${k}`, (nan.get(`${path}.${k}`) ?? 0) + 1); }
      else if (v && typeof v === 'object' && depth > 0 && !Array.isArray(v) && !(v instanceof Map) && !(v instanceof Set)) scan(v, `${path}.${k}`, depth - 1); }
  };
  const t0 = performance.now(), end = w.t + minutes * 60; let err: string | null = null;
  const racing = !w.freeSail;
  while (w.t < end && !(racing && w.boats.slice(1).every(b => b.finished || b.retired))) {
    const s0 = performance.now();
    try { each?.(w); w.step(DT); } catch (e) { err = String((e as Error)?.stack ?? e).slice(0, 1500); say('threw', null, err); break; }
    const ms = performance.now() - s0; if (steps > 600 && ms > worst) worst = ms;
    if (++steps % 30) continue;
    if (!Number.isFinite(w.t)) say('nonfinite', null, 'w.t');
    for (const b of w.boats) {
      for (const f of CORE) { const v = (b as any)[f]; if (v !== undefined && !Number.isFinite(v)) say('nonfinite', b, `${f} = ${v}`, `nf:${b.id}:${f}`); }
      for (const [nm, o] of [['ww', b.ww], ['cur', (b as any).cur]] as const) if (o) for (const f in o) { const v = (o as any)[f]; if (typeof v === 'number' && !Number.isFinite(v)) say('nonfinite', b, `${nm}.${f} = ${v}`, `nf:${b.id}:${nm}.${f}`); }
      scan(b, b.isUser ? 'user' : 'ai', 2);
      let T = tr.get(b.id); if (!T) tr.set(b.id, T = { at: [], hs: [], h: b.h, land: 0 });
      const live = racing ? !b.isUser && b.started && !b.finished && !b.retired : b.isUser && w.pilot.mode !== 'off';
      // on land: her center on the land's side of the shore, half a second or more
      if (onLand(b)) { T.land += 0.5; if (T.land >= 2) say('on land', b, `at ${b.x.toFixed(0)}, ${b.y.toFixed(0)}, v ${b.v.toFixed(2)}`); } else T.land = 0;
      if (!live) { T.at.length = 0; T.hs.length = 0; T.h = b.h; continue; }
      // stuck: less than 10 m made good in 3 minutes
      T.at.push({ t: w.t, x: b.x, y: b.y }); while (T.at.length && w.t - T.at[0].t > 180) T.at.shift();
      if (w.t - T.at[0].t >= 179 && Math.hypot(b.x - T.at[0].x, b.y - T.at[0].y) < 10) say('stuck', b, `within 10 m of ${b.x.toFixed(0)}, ${b.y.toFixed(0)} for 3 min; v ${b.v.toFixed(2)}, wind ${b.ww.kt.toFixed(1)} kt, leg ${b.leg}, mode ${b.ai?.mode ?? 'pilot ' + w.pilot.mode}`, `stuck:${b.id}:${Math.floor(w.t / 600)}`);
      // spinning: more than three full turns of heading in a minute
      const d = Math.abs(((b.h - T.h + 540) % 360) - 180); T.h = b.h; T.hs.push({ t: w.t, d }); while (T.hs.length && w.t - T.hs[0].t > 60) T.hs.shift();
      const turned = T.hs.reduce((s, q) => s + q.d, 0);
      if (turned > 1080) say('spinning', b, `${turned.toFixed(0)}° of turning in a minute at ${b.x.toFixed(0)}, ${b.y.toFixed(0)}; v ${b.v.toFixed(2)}, wind ${b.ww.kt.toFixed(1)} kt, mode ${b.ai?.mode ?? 'pilot ' + w.pilot.mode}`, `spin:${b.id}:${Math.floor(w.t / 600)}`);
    }
    if (w.t >= nextHeap) { nextHeap += 300; gc?.(); heap.push(Math.round(proc.memoryUsage().heapUsed / 1e5) / 10); }
  }
  const wall = (performance.now() - t0) / 1000;
  const unfinished = racing ? w.boats.slice(1).filter(b => !b.finished).map(b => `${b.name}${b.retired ? ' (retired)' : ''} leg ${b.leg}`) : [];
  const row = { label, simMin: +((steps * DT) / 60).toFixed(1), wallS: +wall.toFixed(0), speed: +((steps * DT) / wall).toFixed(0), worstStepMs: +worst.toFixed(1), heapMB: heap, faults, nan: [...nan].filter(([, c]) => c > 0).map(([p, c]) => `${p} ×${c}`), unfinished };
  fs.appendFileSync(out, JSON.stringify(row) + '\n');
}

export function soak(): void {
const jobs: [string, () => void][] = [];
const WINDS = [8, 14, 22, 28];
MARINAS.forEach((m, i) => jobs.push([`cruise ${m.id}`, () => {
  const slip = SLIPS.find(s => s.marina === m.id)!, kt = WINDS[i % 4], boat = { ...DEFAULT_BOAT, slip: slip.id };
  const S = { ...DEFAULT_SETTINGS, mode: 'sail', sailFrom: 'cityfront', sailTo: '', windKind: 'west', windKt: kt, current: 'real', sea: 'real', tideDate: '2026-11-14', traffic: 1, fleet: 0, opponents: [], boats: [boat], boat, boatId: boat.id } as Settings;
  const w = new World(COURSES[0], S, 100 + i, { freeSail: true }), u = w.user;
  const hr = harborRoute(slip), from = hr?.approach ?? hr?.mouth ?? slip.p;
  w.step(DT); u.x = from.x; u.y = from.y; w.step(DT);
  // out to the place nearest 3 km off, on the pilot's Nav; at 25 minutes, home; when the pilot hands her back, sails down
  const to = PLACES.slice().sort((a, b) => Math.abs(Math.hypot(a.p.x - from.x, a.p.y - from.y) - 3000) - Math.abs(Math.hypot(b.p.x - from.x, b.p.y - from.y) - 3000))[0];
  applyCommand(w, { k: 'dest', p: to.p, name: to.name }); applyCommand(w, { k: 'pilot', op: 'engage', mode: 'nav' });
  let home = false, down = false; const t0 = w.t;
  watch(w, `cruise ${m.id} ${kt} kt, out to ${to.id}`, MIN || 60, w => {
    if (!home && w.t - t0 > 25 * 60) { home = true; applyCommand(w, { k: 'sendHome' }); if (w.pilot.mode === 'off') applyCommand(w, { k: 'pilot', op: 'engage', mode: 'nav' }); }
    if (home && !down && w.pilot.mode === 'off' && w.t - t0 > 26 * 60) { down = true; applyCommand(w, { k: 'sail', sail: 'jib', up: false }); applyCommand(w, { k: 'sail', sail: 'main', up: false }); }
  });
}]));
const RC = ['ss2', 'ss10', 'ss1', 'ss5', 'ss16'].map(id => COURSES.find(c => c.id === id)).filter(Boolean) as typeof COURSES;
for (let i = 0; i < 20; i++) jobs.push([`race ${i}`, () => {
  const c = RC[i % RC.length] ?? COURSES[i % COURSES.length], kt = WINDS[i % 4], seed = 201 + i;
  const S = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, current: 'real', sea: 'real', tideDate: '2026-11-14', tideTime: ['09:00', '12:00', '15:00'][i % 3], fleet: 7, opponents: ['stock:1', 'stock:2', 'stock:3', 'stock:4', 'stock:5', 'gen:1', 'gen:2'] } as Settings;
  watch(new World(c, S, seed), `race ${c.id} ${kt} kt seed ${seed} at ${S.tideTime}`, MIN || 110);
}]);
jobs.forEach(([name, run], i) => { if (i % N !== K || (ONLY && !name.startsWith(ONLY))) return; const t = Date.now(); try { run(); } catch (e) { fs.appendFileSync(out, JSON.stringify({ label: name, setupThrew: String((e as Error)?.stack ?? e).slice(0, 1500) }) + '\n'); } proc.stderr.write(`${name}: ${((Date.now() - t) / 1000).toFixed(0)} s\n`); });
}
