import { describe, expect, it } from 'vitest';
import { Leaderboard, gapText, placesGained, raceOrder, sailOf, shortRows, toGo, type LbBoat } from '../src/ui/leaderboard';

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
  // the owner's stress cases (r288): long sail numbers come out whole, and the gaps with a thousands comma. (Whether
  // they fit the 104 px board is a layout question: measured in the browser, on the stills sheet, not here.)
  it('long sail numbers come out whole', () => {
    const spec = (country: string, number: string) => ({ sails: { country, number } }) as unknown as LbBoat['spec'];
    for (const [c, n] of [['USA', '12345'], ['GBR', '1234'], ['DEN', '1234'], ['SWE', '12345'], ['NZL', '9999'], ['USA', '111']])
      expect(sailOf(boat(1, 0, 0, 0, { spec: spec(c, n), name: 'Kestrel of the Golden Gate' }))).toBe(`${c} ${n}`);
  });
  it('the gap to the leader: whole meters, a comma from 1,000', () => {
    expect([gapText(37.4), gapText(412), gapText(1240.2), gapText(12405)]).toEqual(['+37', '+412', '+1,240', '+12,405']);
  });
  // option (c), the owner (21 Nov 2026): her own row's gap may drop out of sight rather than touch her number. The case
  // that broke at 104 px: USA 12345, 9th of 12, +1,240 behind the leader. (The fit itself is measured in the browser, on
  // the stress sheet: jsdom has no layout. Here, that her gap's in the cell that can drop it, not the fixed column.)
  it('her row: the gap goes with "You", in the cell that can drop it whole', () => {
    const el = { hidden: true, innerHTML: '', addEventListener() {} } as unknown as HTMLElement, lb = new Leaderboard(el);
    const gaps = [0, 11, 23, 36, 57, 140, 412, 690, 1240, 1385, 2210, 3480];
    const spec = { sails: { country: 'USA', number: '12345' } } as unknown as LbBoat['spec'];
    const fleet = (leg: number) => gaps.map((g, i) => boat(i, 0, leg ? g : 4000 - i * 10, leg, i === 8 ? { isUser: true, spec } : {}));
    const w = (t: number, leg: number) => { const boats = fleet(leg); return { boats, user: boats[8], C: { marks: [{ key: 'A', p: { x: 0, y: 5000 } }] }, center: fin, t }; };
    const race = {}; lb.update(w(0, 0), true, race); lb.update(w(1, 1), true, race);
    expect(el.innerHTML).toContain('9th/12');
    const mine = el.innerHTML.split('<div class="lb-r').find(r => r.startsWith(' me'))!;
    expect(mine).toContain('<b>USA 12345</b>');
    expect(mine).toMatch(/class="lb-n you lb-yg">.*<span class="lb-g">\+1,240<\/span><span>You<\/span><\/i><span><\/span>/);
    // (the others keep the gap in its own column)
    expect(el.innerHTML).toContain('<span class="lb-g">+1,385</span></div>');
  });
});
