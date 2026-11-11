import { describe, expect, it } from 'vitest';
import { benchAngles, benchSpeed } from '../src/boat/benchmark';
import { DEFAULT_BOAT, fixSpec, type BoatSpec } from '../src/boat/spec';
import { cfRough, cfSmooth, fouling } from '../src/boat/fouling';
import { KT } from '../src/core/math';

const spec = (perf: Partial<BoatSpec['perf']> = {}, more: Partial<BoatSpec> = {}) => fixSpec({ ...DEFAULT_BOAT, ...more, perf: { ...DEFAULT_BOAT.perf, ...perf } });
const loss = (kt: number, twa: number, perf: Partial<BoatSpec['perf']>, month = 9) => benchSpeed(kt, twa, spec(perf), month).kt / benchSpeed(kt, twa, spec(), month).kt - 1;

describe('the bottom: fouling and skin friction', () => {
  it('fouling grows with time: slime first, barnacles only after copper antifouling gives out (about six weeks)', () => {
    expect(fouling(0).slime).toBe(0);
    expect(fouling(3).slime).toBeGreaterThan(fouling(1).slime);
    expect(fouling(4).calc).toBe(0);
    expect(fouling(12).calc).toBeGreaterThan(1e-3); // barnacles and tubeworms, ~1 mm and up
  });

  it('warm water fouls faster: the same weeks cost more in September than in January', () => {
    expect(fouling(3, 9).slime).toBeGreaterThan(fouling(3, 1).slime);
  });

  it('roughness adds skin friction, by more at higher speed (Schultz: light slime, 100 µm, about +40% at 4 kt)', () => {
    const light = { label: '', slime: 100e-6, calc: 0 };
    const at = (v: number) => cfRough(light, v * KT) / cfSmooth(v * KT) - 1;
    expect(at(4)).toBeGreaterThan(0.3); expect(at(4)).toBeLessThan(0.6);
    expect(at(6)).toBeGreaterThan(at(2));
    expect(cfRough({ label: '', slime: 0, calc: 0 }, 2)).toBeCloseTo(cfSmooth(2), 10);
  });

  it('two weeks of slime costs a few percent; it hurts most in light air, where friction is most of her drag', () => {
    const a5 = benchAngles(5), a16 = benchAngles(16);
    const light = loss(5, a5.up, { cleanedWeeks: 2 }), breeze = loss(16, a16.up, { cleanedWeeks: 2 });
    expect(light).toBeLessThan(-0.03); expect(light).toBeGreaterThan(-0.12); // racers' figures for slime: 5–10%
    expect(breeze).toBeLessThan(0);
    expect(Math.abs(light)).toBeGreaterThan(Math.abs(breeze));
  });

  it('a burnished racing finish is worth a little over an as-rolled antifouling', () => {
    const g = loss(8, benchAngles(8).up, { finish: 'race' });
    expect(g).toBeGreaterThan(0); expect(g).toBeLessThan(0.015);
  });
});

describe('sails: age', () => {
  it('old sails cost more in a breeze than in light air', () => {
    // (the sizes are estimates, controls.ts SAIL_WEAR: a stretched main 3–4% of camber deeper in 20 kt, its draft well
    // aft. The crew can't flatten it back: the outhaul stops at its black band and the backstay's bend is all there is,
    // so she heels more and depowers further: several percent upwind, up to about 15%)
    const old = { mainAge: 'old', jibAge: 'old' } as const;
    const light = loss(6, benchAngles(6).up, old), breeze = loss(20, benchAngles(20).up, old);
    expect(breeze).toBeLessThan(-0.03); expect(breeze).toBeGreaterThan(-0.15);
    expect(Math.abs(light)).toBeLessThan(Math.abs(breeze) / 2);
  });

  it('midlife sails cost less than old ones; an old main means more weather helm', () => {
    const a = benchAngles(18).up;
    expect(loss(18, a, { mainAge: 'mid', jibAge: 'mid' })).toBeGreaterThan(loss(18, a, { mainAge: 'old', jibAge: 'old' }));
    expect(benchSpeed(18, a, spec({ mainAge: 'old' })).helm).toBeGreaterThan(benchSpeed(18, a, spec()).helm + 0.5);
  });
});

describe('equipment the class rules make equal', () => {
  it('hull material and boom material change nothing (the class minimums are the same)', () => {
    const a = benchAngles(12).up, base = benchSpeed(12, a, spec()).kt;
    expect(benchSpeed(12, a, spec({}, { hull: { ...DEFAULT_BOAT.hull, material: 'wood' } })).kt).toBeCloseTo(base, 6);
    expect(benchSpeed(12, a, spec({ boom: 'wood' })).kt).toBeCloseTo(base, 6);
  });

  it('mast stiffness: a soft mast flattens the main under load and depowers by itself in a gust; a stiff one keeps its shape', async () => {
    const { mainShape, defaultControls, SAIL_WEAR } = await import('../src/boat/controls');
    const c = defaultControls(), at = (bend: number, aws: number) => mainShape(c, aws / 1.4, { wear: SAIL_WEAR.new, bend }, aws);
    expect(at(1.16, 28).depth).toBeLessThan(at(1, 28).depth - 0.005); // flatter in a gust
    expect(at(1.16, 28).twist).toBeGreaterThan(at(1, 28).twist + 1.5); // upper leech opens
    expect(at(0.84, 28).depth).toBeGreaterThan(at(1, 28).depth);
    expect(Math.abs(at(1.16, 8).depth - at(1, 8).depth)).toBeLessThan(0.007); // in light air, only the pre-bend differs
    // an aluminium mast and an average wooden one bend alike (the class's intent)
    expect(at(1, 20).depth).toBe(mainShape(c, 20 / 1.4, { wear: SAIL_WEAR.new, bend: 1 }, 20).depth);
  });

  it('a wooden mast is within about a percent: a little heavier aloft', () => {
    // (9 kg about 5.3 m up takes ~160 N·m off her righting moment at 20° of heel, ~2.5% with the crew hiking; in 20 kt,
    // held up by her stability, speed goes roughly with its 0.3–0.5 power: about 1%)
    // (settled: 90 s, as the crew's line settings take a minute to come to rest)
    const a = benchAngles(20).up, settled = (s: BoatSpec) => benchSpeed(20, a, s, 9, 90).kt;
    expect(Math.abs(settled(spec({ mast: 'wood' })) / settled(spec()) - 1)).toBeLessThan(0.0125);
    // (heavier aloft, so less stable: in a breeze, where her stability holds her back, a little slower)
    const wood = benchSpeed(20, a, spec({ mast: 'wood' })), alu = benchSpeed(20, a, spec());
    expect(wood.kt).toBeLessThan(alu.kt);
  });

  it('extra weight: slower in light air, no worse (a little stiffer) in a breeze', () => {
    expect(loss(5, benchAngles(5).up, { gearKg: 100 })).toBeLessThan(-0.003);
    expect(loss(20, benchAngles(20).up, { gearKg: 100 })).toBeGreaterThan(-0.002);
  });
});
