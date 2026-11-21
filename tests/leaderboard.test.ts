import { describe, expect, it } from 'vitest';
import { Leaderboard, placesGained, raceOrder, sailOf, shortRows, toGo, type LbBoat } from '../src/ui/leaderboard';

const boat = (id: number, x: number, y: number, leg: number, o: Partial<LbBoat> = {}): LbBoat =>
  ({ id, isUser: false, name: `B${id}`, leg, x, y, finished: false, finishT: null, ...o });
// a windward-leeward: A 1000 m up, the finish back at the line's middle
const marks = [{ x: 0, y: 1000 }], fin = { x: 0, y: 0 };

describe('the leaderboard (r288)', () => {
  it('the distance to go is to the next mark, round the rest, then to the finish', () => {
    expect(toGo(boat(1, 0, 400, 0), marks, fin)).toBeCloseTo(600 + 1000);
    expect(toGo(boat(1, 0, 400, 1), marks, fin)).toBeCloseTo(400); // (rounded A: home)
  });
  it('orders finished boats by finish time, then by distance to go, retired last', () => {
    const f = raceOrder([boat(1, 0, 900, 0), boat(2, 0, 300, 1), boat(3, 0, 0, 1, { finished: true, finishT: 900 }),
      boat(4, 0, 0, 1, { finished: true, finishT: 880 }), boat(5, 0, 990, 0, { retired: true })], marks, fin);
    expect(f.map(x => x.b.id)).toEqual([4, 3, 2, 1, 5]);
  });
  it('places gained since an earlier order', () => {
    const g = placesGained([3, 1, 2], [1, 2, 3]);
    expect([g.get(3), g.get(1), g.get(2)]).toEqual([2, -1, -1]);
  });
  it('the short board: the top three, then her neighbors, a gap between', () => {
    expect(shortRows(8, 5)).toEqual([0, 1, 2, null, 4, 5, 6]);
    expect(shortRows(5, 3)).toEqual([0, 1, 2, 3, 4]);
    expect(shortRows(3, 0)).toEqual([0, 1, 2]);
  });
  it('sail numbers only where a boat has one: the stock boats go by name', () => {
    expect(sailOf(boat(1, 0, 0, 0, { no: 'US 87' }))).toBe('');
    expect(sailOf(boat(0, 0, 0, 0, { isUser: true, no: 'USA 122' }))).toBe('USA 122');
  });
  it('shows for 12 s after her rounding; Shift+L holds it on or off', () => {
    const el = { hidden: true, innerHTML: '', addEventListener() {} } as unknown as HTMLElement;
    const lb = new Leaderboard(el), me = { ...boat(0, 0, 900, 0), isUser: true }, race = {};
    const w = (t: number, leg: number) => ({ boats: [{ ...me, leg }, boat(1, 0, 950, 0)], user: { ...me, leg }, C: { marks: [{ key: 'A', p: marks[0] }] }, center: fin, t });
    lb.update(w(10, 0), true, race); expect(el.hidden).toBe(true);
    lb.update(w(300, 1), true, race); expect(el.hidden).toBe(false); expect(el.innerHTML).toContain('1st/2');
    lb.update(w(311, 1), true, race); expect(el.hidden).toBe(false);
    lb.update(w(312.5, 1), true, race); expect(el.hidden).toBe(true);
    lb.toggle(); lb.update(w(400, 1), true, race); expect(el.hidden).toBe(false);
    lb.toggle(); lb.update(w(401, 1), true, race); expect(el.hidden).toBe(true);
    lb.toggle(); lb.update(w(402, 1), false, race); expect(el.hidden).toBe(true); // (not racing: never)
  });
});
