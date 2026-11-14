/**
 * The mast's rake: how far it leans aft from square to the deck, shared by the drawing (render/boatMesh.ts) and the
 * physics' sail plan (boat/balance.ts), so both have the same rig.
 *
 * The class leaves rake free (NFIA Class Rules 2025–2028, CR 6.1.5). The setting comes from North Sails' Nordic Folkboat
 * tuning guide (northsails.com, "Nordic Folkboat Tuning Guide", Mast Trim step 2): unhook the forestay at the deck, lay
 * it along the mast and mark it level with the gooseneck mark, hook it back on, and the mark should be 1.31 m from the
 * deck. Taking the gooseneck mark as the lower measurement band (CR 6.1.11: 1.00 m up the mast, where the boom's top
 * sits; the guide doesn't define it, this is the assumption), the forestay is the 5.50 m from the hounds down to the band
 * plus 1.31 m: 6.81 m. With its deck end 2.00 m ahead of the mast's fore side (CR 6.1.7) and 0.19 m higher than the deck at
 * the mast (the sheer rises toward the bow), and the hounds 6.50 m up the mast's front (CR 6.1.11), that length is
 * reached with the mast raked 5.6° aft (upright, the stay would be 6.62 m). tests/rig.test.ts holds the drawn stay to it.
 *
 * This also squares the mainsail with the class: a main cut to fill both bands (P 8.75 m, E 3.38 m, CR 9.25) has a
 * leech, head point to clew point on the flat sail (ERS 2025–2028 G.7.2), of √(P² + E² − 2·P·E·cos(90° − rake)): 9.07 m
 * with the boom square to the deck, inside the class's 9150 mm (Mainsail drawing 8); with no rake it would be 9.38 m.
 */
export const MAST_RAKE_DEG = 5.6;
export const MAST_RAKE = MAST_RAKE_DEG * Math.PI / 180;
