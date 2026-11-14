// How much harm a contact does: one measure for the racing rules (RRS 14 and 43.1(c): "damage"; 44.1(b): "serious
// damage") and for the wreck outcome (docs/WRECK-PROPOSAL.md, the owner's answers in section 7). Agreed between Rules and
// Marinas, 14 Nov 2026. Pure: no World, no DOM.
//
// The energy is what the contact takes out of the two hulls' motion toward each other: ½·μ·v², with v the closing speed
// along the contact normal (a glancing touch closes slowly, and scraping along is friction, not a blow) and μ the reduced
// mass, m1·m2/(m1+m2), or her own mass against something fixed. That is standard two-body mechanics for a fully plastic
// blow (with restitution e it is ½·μ·v²·(1−e²)). Left out: the water's added mass (PIANC/BS 6349 C_M, about 1 + 2D/B
// sideways) and the eccentricity of a blow off her center (C_E, 0.3–1.0): refinements if wanted.
//
// What counts as damage: the RRS don't define it; World Sailing Case 19 reads it as harm "impairing the value or
// usefulness" of the boat or her equipment, and US Sailing Q&A 115 (2017) asks of "serious" damage whether it put the
// crew at risk, holed the hull, significantly hurt her sailing, or cost a significant share of her value to repair.
// So: a scrape isn't damage; a stove-in plank or a broken stanchion is; a hole or the rig down is serious.
// https://www.ussailing.org/wp-content/uploads/2018/01/QUESTION-115.pdf
//
// The bands are ESTIMATES (WRECK-PROPOSAL §2): the speeds at which she'd hit something fixed and hard, square on. No
// published data ties a speed or an energy to damage for a 6–10 m wooden or GRP keelboat (the researcher, 14 Nov 2026:
// boat-on-boat, fixed objects and keel groundings alike; BoatUS's claims see keel strikes "usually ... at less than 8
// knots", an observation, not a threshold).

/** What she hit. */
export type Struck = 'boat' | 'ship' | 'concrete' | 'rock' | 'piles' | 'dock' | 'mud';
/** What it did to her. 'serious' is a boat-on-boat grade (RRS 44.1(b)); against something fixed, the top grade is 'wreck'. */
export type DamageLevel = 'none' | 'scrape' | 'damage' | 'serious' | 'wreck';

/** ESTIMATES: the closing speeds (m/s, square on a fixed hard object) where a scrape becomes damage, and damage a wreck
 * (or, between boats, serious damage). WRECK-PROPOSAL §2. */
export const DAMAGE_V = { scrape: 0.5, wreck: 1.5 };

/** The energy of a blow, J: ½·μ·closing², μ the reduced mass (m2 Infinity: something fixed, μ = m1). */
export function impactEnergy(closing: number, m1: number, m2 = Infinity): number {
  const mu = Number.isFinite(m2) ? m1 * m2 / (m1 + m2) : m1;
  return 0.5 * mu * closing * closing;
}

/** The grade of a blow of `energy` J to a boat of `mass` kg, by what she struck: against the bands' energies at her
 * mass (the energy she'd take hitting a fixed hard object square on at DAMAGE_V's speeds). */
export function damageOf(energy: number, struck: Struck, mass: number): DamageLevel {
  if (struck === 'mud' || energy <= 0) return 'none';
  if (struck === 'ship') return 'wreck'; // (at any speed: WRECK-PROPOSAL §1)
  const lo = 0.5 * mass * DAMAGE_V.scrape ** 2, hi = 0.5 * mass * DAMAGE_V.wreck ** 2;
  if (struck === 'dock') return 'scrape'; // (fendered: a hard bump, a note only)
  if (struck === 'piles') return 'wreck'; // (set in under a pier's deck among its piles: the rig comes down on the deck's edge; a bow-first hit on a pier face is 'concrete')
  const band: DamageLevel = energy < lo ? 'scrape' : energy <= hi ? 'damage' : 'wreck';
  return struck === 'boat' && band === 'wreck' ? 'serious' : band;
}
