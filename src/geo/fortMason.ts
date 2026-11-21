import { inPoly, type Vec } from '../core/math';
import { LL } from './geo';

/**
 * Fort Mason's three piers, as pile fields (ROADMAP 8n; the owner, 13 Nov 2026): each a deck on rows of massive concrete
 * piles (reference/photos/fort-mason-pier-piles-gashouse-exit.jpg), with the long pier shed on top. The water runs under
 * them; a boat doesn't: set in among the piles, in real life, "that means bye bye to your boat; you would just churn
 * around under there in all the decades-old concrete and rebar and barnacles". In the sim, for now, she's stopped dead on
 * them and told so (boat/physics.ts onPiles); what a wreck means is still to be worked out (docs/WRECK-PROPOSAL.md).
 *
 * The outlines are the piers' own, from the OpenStreetMap coastline the sim's Marina shore is drawn from
 * (src/geo/data/marina-coast.json, natural=coastline, fetched 11 Nov 2026), each from the bulkhead along the waterfront
 * (about 37.8070–37.8074 N) out to its end. Pier 3, the westernmost, is the one on the east side of the Gashouse Cove
 * entrance, usually to leeward going out.
 */
const OUTLINES: { name: string; ll: [number, number][] }[] = [
  { name: "Fort Mason's Pier 3", ll: [[37.8069626, -122.4323327], [37.8071203, -122.4323551], [37.8079662, -122.4325217], [37.8085093, -122.4326287], [37.8085464, -122.4323498], [37.8072304, -122.4320829]] },
  { name: "Fort Mason's Pier 2", ll: [[37.8073152, -122.4314016], [37.8089893, -122.4317476], [37.8090264, -122.4317342], [37.8090444, -122.4316913], [37.8090857, -122.4313949], [37.8090751, -122.4313654], [37.8090582, -122.431335], [37.8073703, -122.4309939]] },
  { name: "Fort Mason's Pier 1", ll: [[37.8074572, -122.430318], [37.8091292, -122.4306546], [37.809161, -122.4306425], [37.80918, -122.4306063], [37.809232, -122.4301758], [37.8092192, -122.430141], [37.8091938, -122.430117], [37.8078249, -122.4298406]] }
];
export interface PileField { name: string; pts: Vec[]; box: { x0: number; x1: number; y0: number; y1: number } }
export const FORT_MASON_PILES: PileField[] = OUTLINES.map(o => {
  const pts = o.ll.map(([la, lo]) => LL(la, lo));
  return { name: o.name, pts, box: { x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) } };
});
/** The pier whose piles a point is in among, or null. */
export function underPier(p: Vec): PileField | null {
  for (const f of FORT_MASON_PILES) if (p.x >= f.box.x0 && p.x <= f.box.x1 && p.y >= f.box.y0 && p.y <= f.box.y1 && inPoly(p, f.pts)) return f;
  return null;
}
/**
 * Being set onto a pier: her drift over the ground (the stream's set and the wind's push, with her own way through the
 * water) carried on, the seconds until it puts any of her hull's points (bow, stern, her sides) among a pier's piles,
 * within `ahead` seconds; null if it doesn't.
 */
export function setOntoPier(pts: Vec[], vx: number, vy: number, ahead = 30): { pier: PileField; s: number } | null {
  if (Math.hypot(vx, vy) < 0.03) return null;
  for (let s = 0; s <= ahead; s += 0.5) for (const p of pts) { const f = underPier({ x: p.x + vx * s, y: p.y + vy * s }); if (f) return { pier: f, s }; }
  return null;
}
