// The pilot's tack in heavy air (Crew Habits for Deep Physics, 19 Nov 2026), not part of the suite. To run it:
//   cp scripts/check/crewsoak/tack22.ts tests/zz-tack22.test.ts && PROBE_OUT=tack.txt npx vitest run tests/zz-tack22.test.ts
// KT (22), SEA (real|flat), AWA (the pilot's close-hauled apparent angle, 32 pinches, 38-42 is her polar's), HOLD_MAIN=1
// (the main held at its trim through the tack). A cruise from her slip as the crew soak sails it, then open water east of
// Alcatraz on the pilot's wind angle, tacking every 2 minutes; a line every 0.25 s.
import { it } from 'vitest';
import { writeFileSync } from 'fs';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DEFAULT_BOAT } from '../src/boat/spec';
import { DT, World } from '../src/sim/world';
import { engage } from '../src/boat/autopilot';
import { SLIPS } from '../src/geo/marina';
import { n360 } from '../src/core/math';
import { LL } from '../src/geo/geo';
import { takeLine } from '../src/boat/physics';
it('the pilot tack in heavy air', () => {
  const kt = +(process.env.KT ?? 22);
  const slip = SLIPS[40], boat = { ...DEFAULT_BOAT, slip: slip.id };
  const S: Settings = { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, mode: 'sail', sailFrom: 'slip', sailTo: 'slip', boats: [boat], boat, boatId: boat.id, tideDate: '2026-11-14', current: 'slack', sea: (process.env.SEA ?? 'real') as never };
  const w = new World(COURSES[0], S, 3, { freeSail: true }), u = w.user as any, out: string[] = [];
  const step = (secs: number, each?: () => void) => { const end = w.t + secs; while (w.t < end) { w.step(DT); for (const e of w.drainEvents()) if (e.type === 'toast') out.push(`${w.t.toFixed(2)} TOAST ${(e as any).msg}`); each?.(); } };
  step(5); w.pushOff(); if (u.handled) { step(120); w.pushOff(); step(60); }
  w.setSail('main', true); w.setSail('jib', true); step(30);
  const q = LL(37.835, -122.40); Object.assign(u, { x: q.x, y: q.y, h: n360(w.wind.from + 60), v: 2.5, astern: 0, docked: undefined, handled: undefined }); engage(u, w.pilot, 'wind');
  let next = 0;
  const trace = () => { if (w.t < next) return; next = w.t + 0.25;
    const c = u.crew;
    out.push(`${w.t.toFixed(2)} v ${(u.v * 1.944).toFixed(2)} kt astern ${(u.astern ?? 0).toFixed(2)} rel ${u.rel.toFixed(0)} awa ${(u.arel ?? u.awa ?? 0).toFixed?.(0)} heel ${u.heel.toFixed(0)} yaw ${(u.yawRate ?? 0).toFixed(1)} helm ${(u.helm ?? 0).toFixed(2)} ram ${w.pilot.ram.toFixed(2)} pilot ${w.pilot.mode} ${w.pilot.awa} tack ${u.tack} tacking ${u.tacking} jib ${u.ctl.jibsheet.toFixed(2)}/${u.ctl.jibsheetW.toFixed(2)} main ${u.ctl.mainsheet.toFixed(2)} trav ${u.ctl.traveller.toFixed(2)} drive ${(u.forces?.drive ?? 0).toFixed(0)} heelF ${(u.forces?.heel ?? 0).toFixed(0)} jobs ${c.people.map((a: any) => a.job?.line ?? '-').join(',')} tws ${u.ww.kt.toFixed(1)}`); };
  const A = +(process.env.AWA ?? 40), flips = [A, -A, A, -A];
  for (const a of flips) { w.pilot.awa = a; out.push(`${w.t.toFixed(2)} SET pilot awa ${a}`);
    if (process.env.HOLD_MAIN && a < 0) { const m = u.ctl.mainsheet; takeLine(u, 'mainsheet'); (u.ctlTarget ??= {}).mainsheet = m; out.push(`${w.t.toFixed(2)} HOLD main at ${m.toFixed(2)}`); }
    step(120, trace); if (w.pilot.mode === 'off') { out.push(`${w.t.toFixed(2)} PILOT OFF`); step(60, trace); break; } }
  writeFileSync(process.env.PROBE_OUT!, out.join('\n') + '\n');
}, 900_000);
