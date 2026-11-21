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

**The backstay** pulls the masthead aft. The forestay holds the hounds forward, so the top 3.25 m above the hounds (5.5 m above the lower band, the masthead's band at 8.75 m: CR 6.1.12, the rig's P) is a cantilever bent aft by the backstay's load. How far it bends depends on the topmast's stiffness, and the jumpers add to it: the stay from 8.6 m over the strut stops the top bending aft without stretching the stay.
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

## The plan: a mast-bend model (the owner, 21 Nov 2026: build it after Tue 24 Nov)

### What the sources give

The researcher's search, 21 Nov 2026:
- **The class rules** give the aluminum section's outside size and weight, not its wall or stiffness (NFIA class rules 2025–2028, March 2026 update, 6.2):
  - 100–112 mm both ways from the heel to 600 mm above the lower band; 100–112 by 115–130 mm fore and aft at the boom band; 60–94 by 65–100 mm at the top band;
  - at least 3.10 kg/m untapered (6.2.2); the taper starts 5.5–7.0 m above the lower band (6.2.3);
  - the section is "drawing No. 12", which isn't in the text. The Swedish rules may carry it, but their host is blocked here.
- **No spar maker's EI** and no measured masthead bend were found (Seldén, Proctor and others list nothing Folkboat-specific).
- **Luff round:** North cuts two mains by the mast: "LM-5A Mainsail - To be used for J.M Aluminum mast"; "LM-5 Mainsail - To be used for B.M Aluminum mast and most wooden mast" (Theis Palm, North Sails, Finnish Folkboat association talk, 26 Apr 2023). No figures in mm. Heikkilä's main is cut for "very little or no" pre-bend (rigTune.ts:206). Nothing was found from Hjortø, Elvstrøm or Ullman.
- **No spreaders:** she has none (CR 7.10: main shrouds, forestay, jumper stays and backstay). The model's supports are the deck partner, the foot, the hounds and the jumper struts.

### The stiffness, estimated

A thin-walled ellipse 106 × 120 mm of 6061-type alloy (E 70 GPa, 2700 kg/m³) at the class minimum 3.10 kg/m:
- area 1150 mm², wall about 3.2 mm;
- I about 2.0 × 10⁶ mm⁴ fore and aft and 1.7 × 10⁶ athwartships;
- EI about 140 kN·m² fore and aft and 116 kN·m² athwartships, ±30% (no luff groove, no internal webs, no taper).

Check: the 3.25 m topmast as a uniform cantilever bends 25 mm at the masthead under 300 N aft and 80 mm under 1000 N (PL³/3EI). The taper makes it bendier: I scales about with the cube of the depth, so the top band's 65–100 mm leaves about a third of the base's.

### What's modeled

The mast is a beam in the fore-and-aft plane, about 20 elements from the heel to the masthead, solved for each tune and wind:
- **Supports:**
  - the foot, pressed aft by the tune's footAft;
  - the deck partner, 1.1 m up;
  - the hounds, held aft by the shrouds (280–360 mm aft, CR 7.20) against the forestay;
  - the jumper stays: elastic ties from 8.5–8.75 m to 2.25 m over 0.45 m struts (CR 6.1.12, 7.60), their tension set by the turns.
- **Loads:**
  - the backstay at the masthead;
  - the forestay's pull from the jib's load (the same tension forestaySag uses now);
  - the main's luff load along the mast, from its force at the apparent wind, scaled (aws/14)² as mainShape's bend is now.
- **Outputs:**
  - the masthead's bend aft;
  - the lower mast's bow;
  - the forestay's tension, into forestaySag (replacing the backstay's fixed share);
  - the mast's curve against the main's luff round: the main's depth and twist from the difference, and inversion where the bend passes the round (the upper main's lift falls and its drag rises).
- **The main's luff round** becomes a sail property: North LM-5, North LM-5A and Heikkilä, each with a round curve (estimates until measured).
- **The cost:** solved once when the tune changes and tabulated by aws, backstay and jumper turns; never per step (CLAUDE.md, World.step).
- **What it replaces:** the fixed JUMPER nudge (rigTune.ts:219), the backstay's fixed mast bend in mainShape (controls.ts:232), and PREBEND_DEPTH_PER_MM, which becomes the beam's own answer.

### The tests, written first (each fails today)

1. **Beam statics:** a uniform cantilever's tip under P matches PL³/3EI within 1%. The foot pressed aft bows the span about 0.97 mm per mm, the three-moment figure at rigTune.ts:203.
2. **The jumpers and the backstay:** with the same backstay, tighter jumpers bend the masthead less and tension the forestay more (less sag).
3. **The lower mast:** tighter jumpers bow the lower mast more and leave the top straighter (North: "too much curve in the bottom and ... too straight in the top").
4. **The load:** the jumpers' effect on the main is near zero at 4 kt and grows with the breeze. Today it is the same 0.6° of twist a turn at any speed.
5. **Overbend:** a mast bent past the main's luff round costs the upper main lift.
6. **Which guide:** in 20 kt, loose jumpers make the better VMG with North's main (full round), and tight jumpers with Heikkilä's (little round). In medium air, both are best tightened.
7. **North's tune:** North's own light, medium and strong settings are the best VMG of a sweep with North's main.
8. **The gates:** perf-pair (tabulated, so the step's cost is unchanged), plus perf-pair --ai and fouls-pair, since it changes how boats sail.

### What's an estimate

- EI: from the class's minimum weight and outside size, not drawing No. 12; ±30%.
- The taper's shape and wall.
- Each main's luff round in mm.
- The stays' stretch (1×19 wire at the class minimum, 5 mm jumpers and 7 mm forestay, CR 7.10), and the struts' stiffness.
- How the main's load is spread along the luff.

### What would settle it (for docs/ABOARD-JOSEPHINE.md)

- **Josephine's mast:** the maker, and its section's depth, width and wall, measured at a hatch or the heel.
- **Her main:** the maker and its luff round. Lay it flat, run a string from tack to head, and read the offsets at the quarter heights.
- **The bend:** the masthead's bend under a known backstay pull (a spring balance on the tail, or so many turns), with the jumpers at 0 and at 3 turns. Read it as the main halyard's offset from the luff groove at the boom.
- **An outside source:** the NFIA or the Danish association for drawing No. 12, or J.M. (Jens Mortensen, not confirmed) and Børresen for the section's EI.

## Sources

- **Read (primary):** the NFIA class rules, March 2026 update (6.1.12, 6.2, 7.10, 7.20, 7.40, 7.60, 7.70): https://folkboat.com/wp-content/uploads/2026/03/NORDIC-FOLKBOAT-CLASS-RULES-2025-2028-Update-March-2026.pdf
- **Read:** Theis Palm (North Sails), slides for the Finnish Folkboat association, 26 Apr 2023: https://asiakas.kotisivukone.com/files/folkkariliitto.kotisivukone.com/TheisPalm26042023.pdf
- **Quoted in rigTune.ts:** North Sails' Nordic Folkboat tuning guide, and Heikkilä Sailmaker's "Kansanveneen trimmiohje" (2021).
- **Generic, through search summaries:** Seldén's rig-tuning booklet, and a statement on fractional rigs' jumpers.
- **Not reached:** Larsson & Eliasson, Marchaj, Dedekam, Claughton, Skene's. No rig textbook's figures are used here. The mechanics above is beam statics on the class's geometry, and the per-stay forces are worked out here from it.
