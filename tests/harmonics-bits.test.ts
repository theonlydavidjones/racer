// The harmonic prediction is the same to the bit as before its nodal factors were worked out once per call instead of
// at every time (harmonics.ts predict): a fingerprint of every station's predictions over three spans, the
// expected value from the earlier code (main 73917997).
import { describe, expect, it } from 'vitest';
import { predict } from '../src/environment/harmonics';
import raw from '../src/environment/data/sf-currents.json';
import fitted from '../src/environment/data/fitted-currents.json';
import bt from '../src/environment/data/bay-tides.json';

type Def = { id: string; z0: number; hc: [string, number, number][] };
function fingerprint(p: typeof predict): string {
  const st = [...(raw as unknown as { stations: Def[] }).stations, ...(fitted as unknown as { stations: Def[] }).stations, { id: 'bay', z0: (bt as unknown as { refMsl: number }).refMsl, hc: (bt as unknown as Def).hc }].filter(d => d.hc);
  const f = new Float64Array(1), u = new Uint32Array(f.buffer); let h = 0x811c9dc5, n = 0;
  for (const d of st) for (const t0 of [Date.UTC(2026, 10, 14), Date.UTC(2026, 0, 3, 7), Date.UTC(2030, 5, 1)]) {
    for (const v of p(d.z0, d.hc, Array.from({ length: 300 }, (_, i) => t0 + i * 360000))) { f[0] = v; for (const w of u) { h ^= w; h = Math.imul(h, 0x01000193) >>> 0; } n++; }
  }
  return `${n}:${h.toString(16)}`;
}
describe('harmonic predictions', () => {
  it('skip a constituent not known here, in place (the sum otherwise in the same order)', () => {
    const hc: [string, number, number][] = [['M2', 1.2, 40], ['XX', 9, 9], ['K1', 0.4, 120]], ts = [Date.UTC(2026, 10, 14), Date.UTC(2026, 10, 14, 7)];
    expect(predict(0.1, hc, ts)).toEqual(predict(0.1, [hc[0], hc[2]], ts));
  });
  it('are the same to the bit as before', () => { expect(fingerprint(predict)).toBe('27000:179d7787'); });
});
