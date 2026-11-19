import { ground, underDeck } from '../../src/render/crew';

/**
 * How far a point is into the boat (m): the least of how far it's under ground() straight down and how far it has to
 * move sideways, at its own height, to come out from under it. Straight down alone, a point a centimeter forward of a
 * step face (the cabin's after end, a coaming's side) scored the whole step's height, 50 cm "into" the cabin top for a
 * thigh grazing its after face (the sprint's soak, 18 Nov 2026: the Coordinator's ruling, a measuring fix; the
 * allowances stay). 0 when it isn't under it.
 */
export function trueDepth(x: number, y: number, z: number, allow = 0): number {
  const vert = ground(x, z, y) - y;
  if (vert <= allow) return Math.max(0, vert);
  // (sideways out from under it: rings of 1 cm, 32 directions, as far as the straight-down depth)
  for (let r = 0.01; r < vert; r += 0.01) for (let a = 0; a < 32; a++) {
    const qx = x + r * Math.cos(a * Math.PI / 16), qz = z + r * Math.sin(a * Math.PI / 16);
    if (ground(qx, qz, y) <= y || underDeck(qx, y, qz)) return r;
  }
  return vert;
}
