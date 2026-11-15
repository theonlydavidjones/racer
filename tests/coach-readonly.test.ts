import { describe, it, expect } from 'vitest';
import { TUNE_PRESETS } from '../src/boat/rigTune';
import { lessons, tuneLoss } from '../src/boat/coach';
import { guarded } from '../src/sim/host';
import { testBoat, sail } from './helpers/testBoat';

/* The coach runs on the page, over its copy of the race; with ?simguard that copy refuses writes (sim/host.ts). The rig
 * lesson worked out her tuned rig through mainRig, which keeps it on the boat (b.rigMain): a write to the page's copy
 * whenever that copy hadn't one (simguard, 15 Nov). The coach now only reads (condition.ts rigOf). */
describe('the coach reads the boat, never writes her', () => {
  it('a rig lesson on a write-guarded boat with no kept rig: no write, and the same lesson as on the boat itself', () => {
    const b = testBoat({ heading: 42, kt: 5, windKt: 18 }); b.tune = { ...TUNE_PRESETS.light };
    sail(b, 30);
    const want = lessons(b).list.find(x => x.id === 'rig:soft'), loss = tuneLoss(b);
    expect(want).toBeTruthy();
    b.rigMain = undefined; // (as the page's copy can have it)
    const g = guarded(b, 'w.user');
    expect(tuneLoss(g)).toBeCloseTo(loss, 12);
    const got = lessons(g).list.find(x => x.id === 'rig:soft');
    expect(got?.head).toBe(want!.head);
    expect(b.rigMain).toBeUndefined();
  });
});
