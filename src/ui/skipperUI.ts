import { SKIPPER_ATTRS, type SkipperAttr, type SkipperAttrs } from '../ai/skipper';
import type { Member } from '../club/members';
import { SKIPPER_UI } from './members';

/**
 * The skipper half of the Yacht Club's Members tab (docs/YACHT-CLUB.md; Skipper Model): her seven ratings as bars on her
 * card, and on her page the sliders (yours to set; the club's own are shown, not edited), what you'd hear about her at
 * the club, and her record against you. Ratings are shown: "skippers have reputations that precede them" (the owner).
 */

/** The skipper's attributes in plain words (ai/skipper.ts SKIPPER_ATTRS), and what each does, for the tooltips. */
export const SKIPPER_LABELS: [SkipperAttr, string, string][] = [
  ['start', 'Starts', 'Timing and place on the line at the gun'],
  ['speed', 'Boat speed', 'How well they hold the groove at the helm upwind'],
  ['strategy', 'Reading the wind', 'How small a shift they see, and how soon; how far off they read the wind; how much of the tide they allow for'],
  ['tactics', 'Tactics', 'Laylines by eye, clear air, and choices at crossings'],
  ['rules', 'Rules', 'How well they know who keeps clear, and when'],
  ['consistency', 'Consistency', 'How little their form swings from race to race'],
  ['nerve', 'Nerve', 'How close they sail to other boats in traffic'],
];

/** Her ratings: the member's own where set, the rest mid-fleet (0.5) until the club's generator sets them (phase 4). */
export function skipperOf(m: Member): SkipperAttrs {
  const out = Object.fromEntries(SKIPPER_ATTRS.map(a => [a, 0.5])) as SkipperAttrs;
  for (const a of SKIPPER_ATTRS) { const v = m.skipper?.[a]; if (v != null && Number.isFinite(v)) out[a] = Math.min(1, Math.max(0, v)); }
  return out;
}

const pct = (v: number) => Math.round(v * 100);
const bar = (label: string, v: number) => `<span>${label}</span><div class="mbar"><i style="width:${pct(v)}%"></i></div><span>${pct(v)}</span>`;

/** Her card's seven bars. */
export function skipperBars(m: Member): string {
  const sk = skipperOf(m);
  return `<div class="mbars mbars-sk">${SKIPPER_LABELS.map(([a, l]) => bar(l, sk[a])).join('')}</div>`;
}

/**
 * What you'd hear about her at the club: a line for each rating far from the middle, in a sailor's words. (The
 * strategist's notes on the competition are the same kind of gossip, from her start habits.)
 */
export function skipperGossip(sk: SkipperAttrs): string[] {
  const out: string[] = [];
  const hi = (a: SkipperAttr) => sk[a] >= 0.75, lo = (a: SkipperAttr) => sk[a] <= 0.3;
  if (hi('start')) out.push('Gets off the line well, usually in the front row at the gun.'); else if (lo('start')) out.push('Often late off the line.');
  if (hi('speed')) out.push('Quick upwind: holds the groove.'); else if (lo('speed')) out.push('Struggles for speed upwind.');
  if (hi('strategy')) out.push('Reads the shifts and the tide well.'); else if (lo('strategy')) out.push('Slow to see a shift, and underrates the current.');
  if (hi('tactics')) out.push('Rarely overstands a mark.'); else if (lo('tactics')) out.push('Often overstands the laylines.');
  if (lo('rules')) out.push('Hazy on the rules: give them room at the marks.');
  if (hi('nerve')) out.push('Sails close in traffic and pushes the line.'); else if (lo('nerve')) out.push('Gives the fleet a wide berth.');
  if (hi('consistency')) out.push('Steady: rarely has a bad race.'); else if (lo('consistency')) out.push('Up and down: sharp one race, off the pace the next.');
  return out;
}

/** Her page's skipper section: the sliders (yours to set), what's said of her, and her record against you. */
export function skipperSection(m: Member): string {
  const sk = skipperOf(m), yours = m.origin === 'yours';
  const sliders = SKIPPER_LABELS.map(([a, l, t]) =>
    `<label class="mslider" title="${t}"><span>${l}</span><input type="range" min="0" max="1" step="0.05" value="${sk[a]}" data-m="sk" data-a="${a}"${yours ? '' : ' disabled'}><output>${pct(sk[a])}</output></label>`).join('');
  const gossip = skipperGossip(sk);
  // (her results in your races come with Seasons: the member record has no history yet)
  const record = '<p class="fnote">No races against you yet.</p>';
  return `${sliders}${gossip.length ? `<p class="fnote"><b>At the club:</b> ${gossip.join(' ')}</p>` : ''}${record}`;
}

/** Fill the Members tab's skipper hooks (ui/members.ts SKIPPER_UI). */
export function installSkipperUI(): void { Object.assign(SKIPPER_UI, { bars: skipperBars, section: skipperSection }); }
