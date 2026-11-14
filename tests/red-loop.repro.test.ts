import { it } from 'vitest';
import ss2 from '../src/courses/data/seaweed-soup-2026-course2.json';
import type { CourseFile } from '../src/courses/course';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { KT } from '../src/core/math';
it('red', () => {
  const w = new World(ss2 as unknown as CourseFile, { ...DEFAULT_SETTINGS, windKind: 'west', windKt: 12, tideDate: '2026-11-14', fleet: 3, current: 'ebb' } as Settings, 11);
  const out: string[] = []; const red = w.boats.find(b => b.name === 'Red')!; let lastLeg = -1, n = 0;
  while (w.t < 90 * 60 && !w.boats.slice(1).every(b => b.finished)) {
    w.step(DT); n++;
    if (red.leg !== lastLeg) { out.push(`t ${(w.t / 60).toFixed(1)} min: Red on leg ${red.leg}`); lastLeg = red.leg; }
    if (n % (60 * 120) === 0 && red.leg >= 5) { const m = w.C.marks; const tgt: any = (w as any).targetOf?.(red); out.push(` t${(w.t / 60).toFixed(0)} leg${red.leg} pos ${red.x.toFixed(0)},${red.y.toFixed(0)} h${red.h.toFixed(0)} v${(red.v / KT).toFixed(1)} twa${red.twa.toFixed(0)} tack${red.tack} pen${red.penalty} luff${red.luff} cur${(Math.hypot(red.cur.x, red.cur.y) / KT).toFixed(2)} wind${red.ww.kt.toFixed(1)}@${red.ww.from.toFixed(0)} desired${red.desired.toFixed(0)} boom${red.sheets.main.toFixed(0)} jib${red.sheets.jib.toFixed(0)} trim ${red.trim?.main?.flow}/${red.trim?.jib?.flow} pole ${red.pole} fin ${red.finished} grounded ${(red as any).aground ?? ''} ${tgt ? JSON.stringify(tgt) : ''}`); void m; }
  }
  out.push('finished: ' + w.boats.slice(1).map(b => `${b.name}:${b.finished ? (b.finishT! / 60).toFixed(1) : 'leg' + b.leg}`).join(' '));
  require('fs').writeFileSync(process.env.OUT!, out.join('\n'));
}, 900000);
