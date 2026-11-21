// r294, phase 1: her bottom on your own clock (boat/care.ts; docs/BOAT-CARE-PROPOSAL.md, the owner's answers 20 Nov 2026).
import { describe, expect, it } from 'vitest';
import { bottomWeeks, careAtSail, daysBetween, weeksBefore, MAX_WEEKS } from '../src/boat/care';
import { DEFAULT_BOAT } from '../src/boat/spec';

const boat = (o: Partial<typeof DEFAULT_BOAT> = {}, weeks = 0) => ({ ...structuredClone(DEFAULT_BOAT), ...o, perf: { ...DEFAULT_BOAT.perf, cleanedWeeks: weeks } });

describe('her bottom on your own clock (r294)', () => {
  it('weeks since the day she was cleaned, whole weeks, to the fouling model\'s 26 at most', () => {
    expect(daysBetween('2026-11-01', '2026-11-21')).toBe(20);
    expect(daysBetween('2026-03-01', '2026-03-15')).toBe(14); // (across the spring's clock change: still whole days)
    expect(bottomWeeks('2026-11-21', '2026-11-21')).toBe(0);
    expect(bottomWeeks('2026-11-15', '2026-11-21')).toBe(0);
    expect(bottomWeeks('2026-11-14', '2026-11-21')).toBe(1);
    expect(bottomWeeks('2026-10-03', '2026-11-21')).toBe(7);
    expect(bottomWeeks('2025-01-01', '2026-11-21')).toBe(MAX_WEEKS);
    expect(bottomWeeks('2026-12-01', '2026-11-21')).toBe(0); // (a day ahead of the clock: clean, not negative)
  });
  it('an older save\'s weeks become a day that many weeks back, so nothing jumps; then they grow between sails', () => {
    const b = boat({}, 5);
    expect(careAtSail(b, '2026-11-21')).toBe(true);
    expect(b.cleanedOn).toBe(weeksBefore('2026-11-21', 5)); expect(b.perf.cleanedWeeks).toBe(5);
    expect(careAtSail(b, '2026-11-21')).toBe(false); // (the same day again: nothing to save)
    careAtSail(b, '2026-12-12'); expect(b.perf.cleanedWeeks).toBe(8); // (three weeks on)
  });
  it('Mike booked: she\'s clean by her next sail, and the booking\'s done', () => {
    const b = boat({ cleanedOn: '2026-08-01' }, 16);
    b.diverBooked = true;
    expect(careAtSail(b, '2026-11-21')).toBe(true);
    expect(b.cleanedOn).toBe('2026-11-21'); expect(b.perf.cleanedWeeks).toBe(0); expect(b.diverBooked).toBeUndefined();
  });
});
