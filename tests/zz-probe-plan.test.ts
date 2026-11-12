import { it } from 'vitest';
import { SLIPS, pushOffPlan } from '../src/geo/marina';
it('plan probe', () => {
  const bow = SLIPS.filter(s => s.kind === 'bow-in');
  const tally: Record<string, number> = {};
  for (const s of bow.slice(0, 400)) for (const off of [0, 10, 20, 170, 180]) {
    const p = pushOffPlan(s, (s.heading + off) % 360, 15);
    const key = `${off}:${p.kind}${p.kind === 'swing' ? (p.hold ? ':hold' : '') + ':' + Math.round(Math.abs(p.turn)) : ''}`;
    tally[key] = (tally[key] ?? 0) + 1;
  }
  console.log(JSON.stringify(Object.entries(tally).sort()));
});
