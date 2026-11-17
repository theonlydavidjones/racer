/**
 * The game's yacht club burgees, drawn on a canvas: a triangular pennant, hoist on the left, fly to the right. Each is the
 * owner's parody of a Bay club's (club/clubs.ts), designed here and unlike the real one in colors and design.
 */

import { CLUB_TABLE } from '../club/clubs';
import { PARODY_BURGEES } from './burgeeArt';

export interface Burgee {
  id: string; club?: string;
  /** Fly length over hoist (3:2 unless the burgee is longer). */
  ratio?: number;
  /** Its cut: a triangular pennant (the default), or a swallowtail (a V cut in the fly): rare, at most one burgee in ten (the owner, 17 Nov 2026). */
  shape?: 'pennant' | 'swallow' | 'blunt';
  draw: (g: CanvasRenderingContext2D, W: number, H: number) => void;
}

/**
 * The burgees that fly: the owner's 20 approved parody designs (the owner, 17 Nov 2026: "the 20 burgees I did with
 * Yacht Clubs are ready to go"; the sheet is docs/clubs/approved.png, plus Brickyard). The other clubs' drawings in
 * burgeeArt.ts stay unflown until the owner approves them; a club with no design shows by name only, as before.
 */
export const APPROVED_BURGEE_IDS: readonly string[] = ['stfyc', 'ggyc', 'sbyc', 'bvbc', 'mhpyc', 'tiyc', 'sfyc', 'cyc', 'tyc', 'pyc',
  'ssyc', 'myc', 'sryc', 'byc', 'csc', 'eyc', 'oyc', 'mbyc', 'slyc', 'ryc'];
let flown: Burgee[] | null = null;
/** The flown burgees, looked up when first drawn (burgeeArt.ts imports from this module, so not at load). */
export function flownBurgees(): Burgee[] {
  return flown ??= PARODY_BURGEES.filter(b => APPROVED_BURGEE_IDS.includes(b.id));
}

/** A burgee's cut: a pennant, or a swallowtail, which as real ones are tapers: the fly is shorter than the hoist and forked. */
export function burgeePath(g: CanvasRenderingContext2D, W: number, H: number, shape?: 'pennant' | 'swallow' | 'blunt'): void {
  g.beginPath();
  if (shape === 'swallow') { g.moveTo(0, 0); g.lineTo(W, H * 0.17); g.lineTo(W * 0.78, H / 2); g.lineTo(W, H * 0.83); g.lineTo(0, H); }
  else if (shape === 'blunt') { g.moveTo(0, 0); g.lineTo(0, H); g.lineTo(W, H * 0.62); g.lineTo(W, H * 0.38); } // a pennant cut off square near the point
  else { g.moveTo(0, 0); g.lineTo(0, H); g.lineTo(W, H / 2); }
  g.closePath();
}

/** A burgee as a texture: the pennant on a transparent canvas. Its aspect is the burgee's own (fly over hoist). */
export function burgeeCanvas(id: string): HTMLCanvasElement | null {
  const b = flownBurgees().find(x => x.id === id); if (!b) return null;
  const H = 128, W = Math.round(H * (b.ratio ?? 1.5)), c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.save(); burgeePath(g, W, H, b.shape);
  g.clip();
  b.draw(g, W, H); g.restore();
  return c;
}

/**
 * Where a flag officer's flag flies on a single-masted boat, by the club's own rule: in place of the burgee, or on the
 * same halyard just below it (some clubs elsewhere, e.g. Plymouth YC). The US rule is "in place": USPS ("on ...
 * single-masted sailboats, ... flown at the masthead in place of the club burgee", usps.org/f_stuff/etiquett.html) and
 * Chapman ("flown in place of the club burgee at the masthead"). None of the Bay Area clubs here publishes a rule of its
 * own (checked Nov 2026: their bylaws and traditions as far as reachable, and Flags of the World), so all follow it;
 * Coyote Point's constitution has its officers fly "the regulation flag of their office", the standard US flags.
 * A club found to differ goes in OFFICER_RULE.
 */
export type OfficerRule = 'replace' | 'below';
const OFFICER_RULE: Record<string, { rule: OfficerRule; source: string }> = {};

/** The clubs a boat can belong to (each with its burgee drawn above). */
export const CLUBS: { id: string; club: string; officer: OfficerRule; officerSource: string }[] = CLUB_TABLE.filter(c => c.burgee).map(c => ({ id: c.id, club: c.name }))
  .map(c => ({ ...c, officer: OFFICER_RULE[c.id]?.rule ?? 'replace', officerSource: OFFICER_RULE[c.id]?.source ?? 'the usual US rule (USPS): in place of the burgee' }))
  .sort((a, b) => a.club.localeCompare(b.club));
export const officerRule = (club: string | undefined): OfficerRule => CLUBS.find(c => c.id === club)?.officer ?? 'replace';
