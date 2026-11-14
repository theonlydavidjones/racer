import type { Boat } from './boat';
import type { Vec } from '../core/math';
import { cleatOf, type DockLine } from './dockLines';
import { workPace } from './crewWork';
import { paddler } from './paddle';

/**
 * Anchoring (ROADMAP 8k; the Coordinator approved the design, 14 Nov 2026): the forward hand takes the anchor to the bow,
 * lowers it straight down (never thrown ahead: Perry, Understanding the Racing Rules through 2028, rule 45), pays out the
 * rode as she drops back, and she lies to it, swinging to whichever wins, wind or stream; hauled in, it's broken out and
 * stowed. While it's down she's stepped as a body on a line (boat/dockLines.ts dockStep): the rode is a line from her stem
 * head to the anchor, holding up to what the anchor holds at that scope; pulled harder, the anchor drags.
 *
 * The numbers, with their sources; ESTIMATE marks those no source was found for:
 * - The gear: the class rules' minimum, which every boat racing carries (Nordic Folkboat Class Rules 2025–2028, March 2026
 *   update, 11.10.1–2, folkboat.com): an anchor of at least 12 kg (or a lighter one with chain making 12 kg) and at least
 *   25 m of 12 mm synthetic rope. Taken as a 12 kg fluke (Danforth-type) anchor on 25 m of nylon.
 * - Holding in mud, per weight: HOLD_RATIO 30 (ESTIMATE). Large anchors hold 5–20 times their weight (US Navy NCEL, DTIC
 *   ADA185351, summary); fluke anchors of about 21 lb held about 1,000 lb in soft Chesapeake mud (BoatUS, "The fine art
 *   of anchoring", Oct 2014, on Fortress's 2014 tests: about 50 times). Between them, 30: 12 kg holds about 3.5 kN. The
 *   Bay's bottom is mud almost everywhere (NOAA Coast Pilot 7 ch. 7: Ayala Cove mud; Richardson Bay, loose mud, Danforth
 *   types recommended: RBRA); the chart's seabed marks (NOAA ENC) are to come, mud until then.
 * - Scope: the share of that holding at a scope (rode out over the depth plus her bow's height): 2:1 35%, 3:1 53%,
 *   4:1 67%, 5:1 77%, 6:1 85%, 7:1 91% (ESTIMATE: one chandler's table, method unstated, help.thmarinesupplies.com); under
 *   3:1 an anchor may not set at all (Fortress guide v5, as summarized), so under 1.5:1 nothing.
 * - Her bow's height above the water at the stem head: 0.8 m (ESTIMATE from her freeboard, ORC certificate).
 * - The crew's times (ESTIMATE: no published figures; methods only, WoodenBoat and BoatUS "How to weigh anchor"): to the
 *   bow with the anchor 8 s; paying out 0.6 m/s; hauling in hand over hand 0.25 m/s while the rode's tension is no more
 *   than they can pull (250 N a hand, dockLines HAND_N); breaking it out 6 s; stowing it 10 s. A slower crewmate takes
 *   longer (crewWork workPace).
 */
export const ANCHOR = {
  kg: 12, rodeM: 25, holdRatio: 30, bowH: 0.8,
  /** m forward of her middle: the stem head */
  bow: 3.7,
  /** the scope she's given: 7:1 where the rode allows (the usual guide, 5:1 or more: Fortress) */
  scopeWant: 7,
  fetchS: 8, payOut: 0.6, haul: 0.25, breakS: 6, stowS: 10, pull: 250,
  /** the least scope worth anchoring at: under 3:1 an anchor may not set (Fortress guide v5) */
  minScope: 3,
  /** the least water to anchor in (m): her draft, 1.14 m (ORC), and a margin */
  minDepth: 1.5,
  /** her way through the water (m/s) the forward hand waits for before lowering it: way off her, as it's done */
  wayOff: 0.4
};
/** Scope against the share of the anchor's holding (a chandler's table: an ESTIMATE). */
const SCOPE: [number, number][] = [[1.5, 0], [2, 0.35], [3, 0.53], [4, 0.67], [5, 0.77], [6, 0.85], [7, 0.91], [10, 1]];
export function scopeShare(scope: number): number {
  if (scope <= SCOPE[0][0]) return 0;
  for (let i = 1; i < SCOPE.length; i++) if (scope <= SCOPE[i][0]) { const [a, fa] = SCOPE[i - 1], [b, fb] = SCOPE[i]; return fa + (fb - fa) * (scope - a) / (b - a); }
  return 1;
}
/** What the anchor holds (N) on `out` m of rode in `depth` m of water. */
export const holding = (out: number, depth: number): number => Math.max(ANCHOR.kg * 9.81 * 0.87, ANCHOR.kg * 9.81 * ANCHOR.holdRatio * scopeShare(out / (depth + ANCHOR.bowH))); // (at the least its own weight in water, steel's 0.87, dragged over the mud)

/**
 * The anchor: fetch (the hand going forward with it), paying (lowered and the rode running out), down (lying to it),
 * hauling (the rode coming in), breaking (up and down, breaking it out), stowing. `at`: where it lies on the bottom; `drop`:
 * where she was when it went down (rule 45, Case 5: hauling in may bring her back there, no further); `out`: rode out (m).
 */
export interface AnchorState {
  phase: 'fetch' | 'paying' | 'down' | 'hauling' | 'breaking' | 'stowing';
  t: number; at?: Vec; drop?: Vec; out: number; want: number;
  /** the rode as a line (dockLines.ts), while the anchor's on the bottom */
  line?: DockLine;
  /** the anchor dragging (its holding exceeded) */
  dragging?: boolean;
  /** the depth (m) where it lies, with the tide; and the chart's depth there (m below MLLW) */
  depth?: number; chart?: number;
  /** when it went down (sim time): its spell, for rule 42 */
  t0?: number;
  /** told to take the way off her first */
  waited?: boolean;
  /** where its chart depth was last read (dragged 20 m on, read again) */
  charted?: Vec;
  /** the way the haul pulls her (unit, over the ground: toward the anchor as hauling began), for rule 42 */
  haulDir?: Vec;
}

/** How fast the forward hand works (a slower crewmate takes longer). */
export const anchorPace = (b: Boat): number => Math.max(0.3, workPace(b, paddler(b)));

/** The rode from her stem head to the anchor, its length along the bottom: the rode out, less what goes down (√(out² − d²)). */
export function rodeLine(a: AnchorState): DockLine {
  const d = (a.depth ?? 0) + ANCHOR.bowH, flat = Math.sqrt(Math.max(0, a.out * a.out - d * d));
  const L = a.line ?? { role: 'bow', at: ANCHOR.bow, side: 1, to: a.at!, len: flat, state: 'made' };
  L.to = a.at!; L.len = Math.max(0.3, flat);
  return L;
}
/** Her stem head in the world. */
export const stemHead = (b: Pick<Boat, 'x' | 'y' | 'h'>): Vec => cleatOf(b, { at: ANCHOR.bow, side: 1 });
