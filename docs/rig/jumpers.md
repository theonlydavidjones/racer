# The jumpers: what they do, and which guide is right (no code)

Rigging, 21 Nov 2026, for the Coordinator and the owner ("No idea what to do with the jumpers. Need a proper physics answer."). Nothing is built until it's approved.

## The answer in short

The jumpers are a diamond of wire round the mast's middle. Tightening them does two things:
- it holds the top of the mast straight against the backstay, so the backstay's pull goes into the forestay instead of into bending the top;
- it pushes the middle of the mast aft against the deck, putting a curve into the lower part.

Loose, the top bends off under the backstay, opening the main's upper leech, and the forestay gets less tension for the same pull.

Which guide is right in a breeze depends on the mainsail's luff round, not on a rule of thumb:
- **North's main** is cut to match the mast's bend. Letting the top bend off in a breeze (jumpers loose) flattens and twists the upper main: depowering that the sail can absorb.
- **Heikkilä's main** is cut for "very little or no pre-bend" (rigTune.ts:41). The same top bend soon exceeds its luff round, and the sail inverts: overbend wrinkles from the clew to the mast, its upper part collapsing rather than flattening. So Heikkilä tightens the jumpers in a breeze "if the mast bends past the main's luff round".

Each guide is right for its own sail. The physics supports both, and the deciding quantity is the main's luff round against the mast's bend.

The sim models neither mechanism; details below.

## The rig, from the class rules

NFIA Nordic Folkboat Class Rules 2025–2028, March 2026 update (https://folkboat.com/wp-content/uploads/2026/03/NORDIC-FOLKBOAT-CLASS-RULES-2025-2028-Update-March-2026.pdf). Heights are above the lower measurement band's upper edge:
- **The stays:** upper end 8500–8750 mm, lower end 2235–2265 mm (7.60), 5 mm wire.
- **The struts** (6.1.12): at 5500 mm ± 20, at least 450 mm long, their bearing points 900 mm ± 10 apart.
- **The forestay** meets the mast at most 5500 mm up; the main shrouds at 5300–5500 mm, "below the jumper struts" (7.60).
- **Adjustment:** "The jumper stays may be adjustable above the deck only" (7.40). The forestay and shrouds may not be adjusted while racing.
- **The backstay** goes to the masthead and is free to adjust (7.70).

So each jumper stay runs from about 8.6 m on the mast, out over its strut's tip at 5.5 m, back to the mast at about 2.25 m. The two of them, one each side, form a diamond spanning the hounds: 3.1 m above them and 3.25 m below.

Jumper struts on a fractional rig are normally angled forward and stay the topmast "not only athwartships but also fore-and-aft" (Seldén, "Hints and advice" rig tuning booklet, as read through a search summary; generic, not Folkboat-specific). The rules give the bearing points 900 mm apart, so the struts also splay sideways. Which way Josephine's point is a photo to check aboard (ABOARD-JOSEPHINE).

## The mechanics

Treat the mast as a beam, held at the deck and the foot, with the forestay and shrouds at the hounds (5.3–5.5 m) and the backstay at the head. Each jumper stay is a tie from 8.6 m to 2.25 m, held off the mast by the strut at 5.5 m.

**Tension T in the stays (struts forward).**
- Each stay bends round its strut's tip. That pushes the strut back into the mast at the hounds: aft, with force about T × (the angles the stay turns through at the tip). With a 0.45 m strut over 3.1 m above and 3.25 m below, that's about 0.14 + 0.14 rad, so about 0.28·T per stay.
- The stay's ends pull the mast forward at 8.6 m and at 2.25 m by about 0.14·T each.
- **The result:** a beam pushed aft in the middle and pulled forward near both ends. The mast bows with its middle aft between 2.25 m and 8.6 m. Against the deck and the foot below 2.25 m, that curves the lower mast.
- This is the guide's "too tight: the mast will curve too much in the bottom and be too straight in the top" (North, quoted at rigTune.ts:24).

**The backstay** pulls the masthead aft. The forestay holds the hounds forward, so the top 4.25 m above the hounds is a cantilever bent aft by the backstay's load. How far it bends depends on the topmast's stiffness, and the jumpers add to it: the stay from 8.6 m over the strut stops the top bending aft without stretching the stay.
- **Tight jumpers:** the top stays straight. The backstay's pull goes to the masthead and from there, through a stiff topmast, into tension at the hounds against the forestay. So the forestay is straighter and the jib flatter, and the main's top stays fuller with its leech closed.
- **Loose jumpers:** the top bends aft. That uses up the backstay's travel in bending, so the forestay gets less tension for the same pull. The main's upper luff is pulled forward of its luff round, which flattens the upper main and lets the head twist open.
- This is the general fractional-rig statement the researcher found: jumpers "limit the amount that the upper portion of the mast can bend and thereby enable tension to be effectively transferred from the backstay to the forestay" (a search-result summary; the page couldn't be opened).

**By wind band:**
- **Light air:** little load. The top barely bends whatever the jumpers do, and the forestay sag is set by the shrouds (North's 8 cm). Loose jumpers cost nothing and let the top fall off a little in the puffs. Both guides agree: loose.
- **Medium air:** the backstay is on and the crew can hold her flat, so the boat wants power and height. Tight jumpers keep the top full and its leech closed, and make the backstay straighten the forestay for pointing. Both guides agree: tighten, North 2–3 turns.
- **A breeze:** the loads are high and the backstay is hard on. Two outcomes depend on the main:
  - The mast's bend stays within the main's luff round. Loose jumpers let the top bend off: the upper main flattens and twists, the masthead's load and the heel come down, and the forestay sags a little more, a fuller jib entry for power through the waves. This is North: "relatively loose in light winds and strong winds".
  - The bend exceeds the luff round. The main overbends and inverts: wrinkles from the clew towards the mast, the upper sail losing shape rather than flattening. Tight jumpers stop the top going past it. This is Heikkilä, whose main is cut with very little luff round.

## Does the sim model it?

Partly. rigTune.ts:217 (`JUMPER`) treats the jumpers as a fixed nudge per turn from North's medium 2.5 turns: −0.6° of twist and −0.08% of camber per turn. It's the same in every wind, and nothing is taken from the guide's tune for the wind.

What it doesn't model:
1. **The interaction with the backstay.** In the sim the backstay flattens the main and straightens the forestay by the same amount whatever the jumpers are (controls.ts mainShape, rigTune.ts forestaySag). Physically, tight jumpers move the backstay's effect from bending the top to tensioning the forestay; loose, the reverse.
2. **The load.** The jumpers' effect grows with the wind's load on the rig. In light air it is near zero; the sim gives the same 0.6° a turn in 4 kt as in 20.
3. **Overbend.** No main in the sim inverts. A mast bent past the luff round costs nothing, so tightening the jumpers in a breeze (Heikkilä) can never pay.
4. **The lower mast's curve.** Tight jumpers pre-bend the lower mast, adding to the foot's pre-bend (PREBEND_DEPTH_PER_MM) and flattening the lower main. The sim's −0.08% of camber per turn stands in for it, but isn't tied to the foot's own pre-bend.

## What would model it, if the owner wants it

1. **The topmast as a cantilever,** its stiffness raised by the jumpers' tension. A share of the backstay's effect goes to masthead bend (main flatter, twist open) and the rest to forestay tension (the jib's sag), split by the jumpers' turns and scaled by the load ((aws/14)², as mainShape's mast bend already is).
2. **The main's luff round as a sail property:** North's cut or Heikkilä's, with the inversion when the mast's bend exceeds it (a fast loss of lift and more drag in the upper sail). This is the only way the sim can say which guide is right for which sail.
3. **Data needed first:** the Folkboat mast section's stiffness (EI) and the topmast's bend per turn. These come from a spar maker (Seldén or Proctor sections for the Folkboat) or a measurement aboard: the masthead's bend under a known backstay load, with the jumpers at 0 and at 3 turns.

## Sources

- **Read (primary):** the NFIA class rules, March 2026 update (6.1.12, 7.40, 7.60, 7.70).
- **Quoted in rigTune.ts:** North Sails' Nordic Folkboat tuning guide, and Heikkilä Sailmaker's "Kansanveneen trimmiohje" (2021).
- **Generic, through search summaries:** Seldén's rig-tuning booklet, and a statement on fractional rigs' jumpers.
- **Not reached:** Larsson & Eliasson, Marchaj, Dedekam, Claughton, Skene's. No rig textbook's figures are used here. The mechanics above is beam statics on the class's geometry, and the per-stay forces are worked out here from it.
