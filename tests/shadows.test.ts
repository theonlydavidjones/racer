import { describe, expect, it } from 'vitest';
import { WindSum, addBoatWake, addCommitteeWake, addShipWake, BOAT_WAKE } from '../src/environment/shadows';
import { landLee as terrainLee } from '../src/environment/wind';
import { LL } from '../src/geo/geo';
import { V } from '../src/core/math';

// A boat close-hauled on starboard in 12 kt from the north: heading 318°, apparent wind 28° on the bow, ~16 kt apparent.
const caster = { x: 0, y: 0, h: 318, arel: 28, awa: 28, aws: 16 * 0.5144, ww: { kt: 12 } };
const H = BOAT_WAKE.mast, FROM = 0;
const downstream = V(caster.h + caster.arel + 180), leeward = V(caster.h - 90); // her wake runs along her apparent wind
const at = (along: number, side = 0, c = caster) => {
  const s = new WindSum(FROM), p = { x: downstream.x * along + leeward.x * side, y: downstream.y * along + leeward.y * side };
  addBoatWake(s, c, p, 12); return s.result(FROM);
};

describe('dirty air: the wake of a boat\'s sails', () => {
  it('slower air behind her, fading with distance (upwind: ~15–19% at a mast height, 8–12% at two, 4–6% at four)', () => {
    const d1 = 1 - at(H).k, d2 = 1 - at(2 * H).k, d4 = 1 - at(4 * H).k, d10 = 1 - at(10 * H).k;
    expect(d1).toBeGreaterThan(0.12); expect(d1).toBeLessThan(0.3);
    expect(d2).toBeGreaterThan(0.06); expect(d2).toBeLessThan(d1);
    expect(d4).toBeGreaterThan(0.02); expect(d4).toBeLessThan(0.1);
    expect(d10).toBeLessThan(0.03);
  });

  it('the wake lies along her apparent wind, not the true wind: straight downwind of her in the true wind, it\'s weaker', () => {
    const s = new WindSum(FROM); addBoatWake(s, caster, { x: 0, y: -2 * H }, 12); // two mast heights dead downwind (true)
    expect(s.result(FROM).k).toBeGreaterThan(at(2 * H).k);
  });

  it('a header for the boat behind on the same tack (up to ~7°); ~3° in the safe leeward spot; a small lift ahead', () => {
    const behind = at(H).shift, safeLee = at(H, -0.5 * H).shift, ahead = at(-0.5 * H).shift;
    // starboard tack: a header is the wind backing toward her bow (shift negative)
    expect(behind).toBeLessThan(-4); expect(behind).toBeGreaterThan(-12);
    expect(safeLee).toBeLessThan(-1); expect(safeLee).toBeGreaterThan(behind);
    expect(ahead).toBeGreaterThan(0.5);
  });

  it('downwind, a running boat\'s shadow is far stronger (her sails are mostly drag)', () => {
    const run = { ...caster, h: 180 - 10, arel: 170, awa: 170, aws: 6 * 0.5144 };
    const e = V(run.h + run.arel + 180), s = new WindSum(FROM); addBoatWake(s, run, { x: e.x * 2 * H, y: e.y * 2 * H }, 12);
    const sUp = new WindSum(FROM); addBoatWake(sUp, { ...caster, aws: 6 * 0.5144 }, { x: downstream.x * 2 * H, y: downstream.y * 2 * H }, 12);
    expect(1 - s.result(FROM).k).toBeGreaterThan(2 * (1 - sUp.result(FROM).k));
  });

  it('clear air well to windward of her', () => {
    expect(at(H, 4 * H).k).toBeGreaterThan(0.98);
  });
});

describe('ships, the committee boat, and the lee of the land', () => {
  it('a container ship beam-on to the wind: near calm in her lee, ~70–90% of the wind 10–15 heights downwind', () => {
    const ship = { x: 0, y: 0, h: 90, v: 0 }; // stopped, beam-on to a northerly
    const k = (d: number) => { const s = new WindSum(FROM); addShipWake(s, FROM, 12, ship, 45, 300, 42, { x: 0, y: -d }); return s.result(FROM).k; };
    expect(k(150)).toBeLessThan(0.4);
    expect(k(450)).toBeGreaterThan(0.6); expect(k(450)).toBeLessThan(0.9);
    expect(k(1500)).toBeGreaterThan(0.93);
  });

  it('the committee boat only matters a few boat lengths downwind of her', () => {
    const k = (d: number) => { const s = new WindSum(FROM); addCommitteeWake(s, FROM, { x: 0, y: 0 }, { x: 0, y: -d }); return s.result(FROM).k; };
    expect(k(12)).toBeLessThan(0.9); expect(k(60)).toBeGreaterThan(0.97);
  });

  it('the lee of Angel Island in a westerly: about half the wind close downwind (high ground: the air comes down in gusts), still felt 2–3 km away', () => {
    const near = LL(37.866, -122.418), far = LL(37.866, -122.392), clear = LL(37.835, -122.43); // ENE of the island; and out in the middle
    expect(terrainLee(near, 270)).toBeLessThan(0.6);
    expect(terrainLee(far, 270)).toBeLessThan(0.9);
    expect(terrainLee(clear, 270)).toBeGreaterThan(0.9); // Harding Rock: the slot, fed through the gap in the Gate, not from over the Headlands
  });

  it('the cone east of Alcatraz (low and steep): a near-calm right behind it, gone within a kilometre or so', () => {
    const behind = LL(37.8265, -122.4188), wellEast = LL(37.8265, -122.405); // ~150 m behind its east shore; 1.3 km east
    expect(terrainLee(behind, 270)).toBeLessThan(0.5);
    expect(terrainLee(wellEast, 270)).toBeGreaterThan(0.75);
  });

  it('the Cityfront is left to the wind model\'s own shore effect (the station is on it)', () => {
    expect(terrainLee(LL(37.8125, -122.444), 275)).toBe(1); // off the yacht clubs
  });
});
