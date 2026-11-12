import { describe, expect, it } from 'vitest';
import { hullInnerHalf, uAtZ } from '../src/render/hull';
import { cabinInteriorGeometry } from '../src/render/cabinInterior';

describe('the cabin inside', () => {
  it('stays inside the hull below the sheer: nothing of it shows through the planking', () => {
    const P = cabinInteriorGeometry().attributes.position.array as ArrayLike<number>;
    let worst = -1;
    for (let i = 0; i < P.length; i += 3) if (P[i + 1] < 0.4) worst = Math.max(worst, Math.abs(P[i]) - hullInnerHalf(uAtZ(P[i + 2]), P[i + 1]));
    expect(worst).toBeLessThan(-0.005);
  });
});
