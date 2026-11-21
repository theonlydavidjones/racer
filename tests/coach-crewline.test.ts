import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/courses/registry';
import { DEFAULT_SETTINGS } from '../src/settings';
import { DT, World } from '../src/sim/world';
import { applyCommand } from '../src/sim/commands';
import { CoachMemory, HOLD_S } from '../src/boat/coach';
import { n360, wrap } from '../src/core/math';

/** Your boat on a beat in a breeze, steered to 40° of the wind, the coach looking twice a second as the page's does
 * (sim/coachRun.ts): each time the crew line on the coach's card says something else. */
function crewLines(kt: number, secs: number): { t: number; line: string }[] {
  const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, windKind: 'west', windKt: kt, mode: 'sail', sailFrom: 'cityfront', sailTo: '', tideDate: '2026-07-11', current: 'slack', sea: 'real' }, 11, { freeSail: true }), u = w.user;
  applyCommand(w, { k: 'running', on: true });
  const side = () => (u.tack === 'S' ? 1 : -1);
  u.h = n360(w.wind.from - side() * 40); u.v = 2;
  const mem = new CoachMemory(), out: { t: number; line: string }[] = [];
  for (let i = 0; i < secs / DT; i++) {
    const e = wrap(n360(w.wind.from - side() * 40) - u.h);
    applyCommand(w, { k: 'tiller', v: Math.max(-1, Math.min(1, -e / 40 + (u.turnRate ?? 0) * 0.08)) });
    w.step(DT);
    if (i % Math.round(0.5 / DT) === 0) { const c = mem.step(u, w.t).view.crew; if (!out.length || out[out.length - 1]!.line !== c) out.push({ t: w.t, line: c }); }
  }
  return out;
}

describe('the crew line on the coach\'s card', () => {
  it('holds a while, as the headline does: not a new clause with each puff', () => {
    // (the audit, 21 Nov 2026: in 22 kt it changed about every 3 s, "traveler down" and "easing the main" coming and
    // going with each puff, four versions of one line)
    const lines = crewLines(22, 300).filter(l => l.t > 30);
    for (let i = 1; i < lines.length; i++) expect(lines[i]!.t - lines[i - 1]!.t, `${lines[i - 1]!.line} → ${lines[i]!.line}`).toBeGreaterThanOrEqual(HOLD_S - 0.5);
    expect(lines.some(l => /depowering/.test(l.line))).toBe(true);
  }, 120_000);
});
