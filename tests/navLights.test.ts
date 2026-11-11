import { describe, expect, it } from 'vitest';
import { arcIntensity, overThreshold } from '../src/render/navLights';

const STBD = { from: 0, to: 112.5, aftFrom: false, aftTo: true }, PORT = { from: -112.5, to: 0, aftFrom: true, aftTo: false };
const STERN = { from: 112.5, to: -112.5, aftFrom: true, aftTo: true };

/** Rule 21's arcs and Annex I §9(a)'s edges; Rule 22(c)'s ranges through Annex I §8. */
describe('navigation lights', () => {
  it('lights the whole horizon once: green to starboard, red to port, white astern', () => {
    for (let b = -180; b < 180; b += 7.3) {
      const g = arcIntensity(STBD, b), r = arcIntensity(PORT, b), w = arcIntensity(STERN, b);
      const edge = Math.min(Math.abs(b), Math.abs(Math.abs(b) - 112.5)) < 5.5; // within an edge's spill
      if (!edge) expect([g, r, w].filter(v => v > 0.99).length).toBe(1);
      if (!edge) expect([g, r, w].filter(v => v > 0).length).toBe(1);
    }
    expect(arcIntensity(STBD, 60)).toBe(1); expect(arcIntensity(PORT, -60)).toBe(1); expect(arcIntensity(STERN, 180)).toBe(1);
  });
  it('cuts a sidelight off 1–3° across the bow, and to half at 22.5° abaft the beam, gone 5° past', () => {
    expect(arcIntensity(STBD, -0.9)).toBe(1); expect(arcIntensity(STBD, -2)).toBeCloseTo(0.5, 5); expect(arcIntensity(STBD, -3)).toBe(0);
    expect(arcIntensity(STBD, 112.5)).toBeCloseTo(0.5, 5); expect(arcIntensity(STBD, 117.5)).toBe(0); expect(arcIntensity(STBD, 107.5)).toBe(1);
    expect(arcIntensity(STERN, 112.5)).toBeCloseTo(0.5, 5); expect(arcIntensity(STERN, -112.5)).toBeCloseTo(0.5, 5); expect(arcIntensity(STERN, 100)).toBe(0);
    expect(arcIntensity(PORT, 1)).toBe(1); expect(arcIntensity(PORT, -115)).toBeCloseTo(0.25, 5);
  });
  it('is just at the eye\'s threshold at its rated range: 1 nm for a sidelight, 2 nm astern', () => {
    expect(overThreshold(1, 1852)).toBeCloseTo(1, 5);
    expect(overThreshold(2, 2 * 1852)).toBeCloseTo(1, 5);
    expect(overThreshold(1, 3 * 1852)).toBeLessThan(0.1);
    expect(overThreshold(2, 500)).toBeGreaterThan(50);
  });
});

describe('the lights in use (Rules 25 and 30)', async () => {
  // the lanterns' textures are drawn on canvases: a stand-in 2-D context that draws nothing
  const noop: unknown = new Proxy(() => noop, { get: (_t, k) => (k === 'data' ? new Uint8ClampedArray(64 * 128 * 4) : noop), apply: () => noop });
  const g = globalThis as unknown as { document?: unknown };
  if (!g.document) g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };
  const THREE = await import('three');
  const { buildNavLights, syncNavLights } = await import('../src/render/navLights');
  const { NIGHT } = await import('../src/render/night');
  const build = (kind: 'deck' | 'tricolour') => buildNavLights(new THREE.Group(), { stem: new THREE.Vector3(0, 1, -3.8), stern: new THREE.Vector3(0, 0.6, 3.8), masthead: new THREE.Vector3(0, 10, -1) }, kind, new THREE.MeshPhongMaterial());
  const shown = (nl: ReturnType<typeof build>) => nl.lamps.filter(l => l.glow.visible).map(l => `${l.role}:${l.arc ? 'arc' : 'round'}`).sort();
  it('shows them by day in restricted visibility (Rule 20(c))', async () => {
    const { setRestrictedVisibility } = await import('../src/render/navLights');
    const nl = build('deck'); NIGHT.uOn.value = 0;
    setRestrictedVisibility(true); syncNavLights(nl, 'underway'); expect(shown(nl).length).toBe(3);
    setRestrictedVisibility(false); syncNavLights(nl, 'underway'); expect(shown(nl).length).toBe(0);
  });
  for (const kind of ['deck', 'tricolour'] as const) it(`${kind}: none in the slip or switched off, the arcs under way, one all-round white at anchor; lanterns only while lit`, () => {
    const nl = build(kind);
    NIGHT.uOn.value = 1;
    syncNavLights(nl, 'off'); expect(shown(nl)).toEqual([]); expect(nl.fittings.underway.visible || nl.fittings.anchor.visible).toBe(false);
    syncNavLights(nl, 'underway'); expect(shown(nl)).toEqual(['underway:arc', 'underway:arc', 'underway:arc']); expect([nl.fittings.underway.visible, nl.fittings.anchor.visible]).toEqual([true, false]);
    syncNavLights(nl, 'anchor'); expect(shown(nl)).toEqual(['anchor:round']); expect([nl.fittings.underway.visible, nl.fittings.anchor.visible]).toEqual([false, true]);
    // by day nothing is lit, and no lantern is drawn
    NIGHT.uOn.value = 0; syncNavLights(nl, 'underway'); expect(shown(nl)).toEqual([]); expect(nl.fittings.underway.visible).toBe(false);
  });
});
