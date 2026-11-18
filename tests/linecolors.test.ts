import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT, DEFAULT_ROPES, LINE_COLORS, ROPES, fixSpec, lineColor, lineRope, nearestRope } from '../src/boat/spec';

// Her lines, saved with the boat (owner, 12 Nov 2026), and only ever in real rope colorways (owner, 18 Nov 2026: the
// free colors the band once offered, orange, yellow, pink, teal, purple and rust, are no rope you can buy).
describe('Her lines are real rope', () => {
  it('the usual ropes until you choose: real colorways, every line a different one, none plain red or plain green', () => {
    expect(lineColor(DEFAULT_BOAT, 'mainsheet')).toBe(LINE_COLORS.mainsheet);
    const ids = Object.values(DEFAULT_ROPES);
    for (const id of ids) expect(ROPES.some(r => r.id === id), id).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(['red', 'green'], id).not.toContain(id); // (the band: never mistaken for port or starboard)
    expect(Object.keys(LINE_COLORS).sort()).toEqual(Object.keys(DEFAULT_ROPES).sort());
  });
  it('the band keeps its idea: the jib\'s lines warm, the main\'s cool', () => {
    const warm = (h: string) => { const [r, , b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return r > b; };
    for (const k of ['jibsheet', 'jibCunningham', 'jibHalyard'] as const) expect(warm(lineColor(null, k)), k).toBe(true);
    for (const k of ['mainsheet', 'outhaul', 'vang'] as const) expect(warm(lineColor(null, k)), k).toBe(false);
  });
  it('a chosen rope is hers, kept through a save, and the band shows its color', () => {
    const b = fixSpec({ ...structuredClone(DEFAULT_BOAT), lineRopes: { vang: 'red-fleck' } });
    expect(lineRope(b, 'vang').id).toBe('red-fleck');
    expect(lineColor(b, 'vang')).toBe(ROPES.find(r => r.id === 'red-fleck')!.band);
    expect(lineRope(b, 'outhaul').id).toBe(DEFAULT_ROPES.outhaul);
    expect(JSON.parse(JSON.stringify(b)).lineRopes).toEqual({ vang: 'red-fleck' });
  });
  it('an older save\'s free colors become the nearest colorway, and aren\'t kept', () => {
    const old = { jibsheet: '#ff8a3d', jibCunningham: '#f2c230', cunningham: '#ec6aae', vang: '#9b6bff', outhaul: '#2ec4d6', jibHalyard: '#c0652a', backstay: '#e8edf0', mainsheet: '#3fae5a' };
    const b = fixSpec({ ...structuredClone(DEFAULT_BOAT), lineColors: old });
    expect(b.lineColors).toBeUndefined();
    for (const id of Object.values(b.lineRopes!)) expect(ROPES.some(r => r.id === id)).toBe(true);
    expect(Object.keys(b.lineRopes!).sort()).toEqual(Object.keys(old).sort());
    expect(b.lineRopes!.jibsheet).toBe('gold-fleck'); // (orange: nearest the gold)
    expect(b.lineRopes!.backstay).toBe('white');
    expect(nearestRope('#26282b').id).toBe('black'); // (a colorway's own color is that colorway)
  });
  it('a rope chosen in the editor wins over an older free color for the same line', () => {
    const b = fixSpec({ ...structuredClone(DEFAULT_BOAT), lineColors: { jibsheet: '#c8312f' }, lineRopes: { jibsheet: 'red-tracers' } });
    expect(b.lineRopes).toEqual({ jibsheet: 'red-tracers' });
  });
  it('an old or damaged save keeps only real colorways for real lines', () => {
    const b = fixSpec({ ...structuredClone(DEFAULT_BOAT), lineColors: { vang: 'red', spinnaker: '#ffffff' }, lineRopes: { jibsheet: 'tartan', outhaul: 'navy' } } as never);
    expect(b.lineRopes).toEqual({ outhaul: 'navy' });
    expect(fixSpec({ ...structuredClone(DEFAULT_BOAT), lineColors: { vang: 'nope' } } as never).lineRopes).toBeUndefined();
  });
});
