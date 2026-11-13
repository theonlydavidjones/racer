# The boom and jib-sheet geometry in controls.ts: sources and what the real rig gives

This was asked for by Bay East's audit (#202): `controls.ts` has the boom's 9.5° and 80°·s^1.5, the jib's 70°·s^1.4, and
the jib lead of 8° + 1.25° per pin, with no sources. Below, each is checked against the class rules, North Sails' guide
and Josephine (the owner's photos, as `JOSEPHINE_CAR` in Boat Detail's claude/bow-lines records). The figures are worked
from the drawn rig (render/boatMesh.ts) and the class rules' dimensions. Nothing in the physics is changed here: the
lead is Deep Physics' car-lead work, and the sheet curves are a calibration choice for them and the owner.

## Sources
- **NFIA Nordic Folkboat Class Rules 2025–28.**
  - 7.20: the shrouds meet the deck at least 900 mm from the centreline, 280–360 mm aft of the mast's after edge.
  - 7.60: the shrouds meet the mast 5.30–5.50 m above the band.
  - 8.40: the sheeting arrangement is optional.
- **North Sails, Nordic Folkboat Tuning Guide (aluminium mast).**
  - "The jib-lead track is placed with its centre 58 cm from the boat's centreline."
  - "measure 2.65 m from the pin in the forestay to the centre of the block (if the lead is on the cabin top)."
  - Traveller: cars 15–20 cm to windward in light air, centred in medium, to leeward in a breeze.
- **Josephine** (the owner, via Boat Detail): the car's bar centre 0.66 m off the centreline, its holes 24 mm apart,
  2.65 m aft of the forestay pin.
- **The sim's rig:**
  - the traveller car travels ±0.5 m on the thwart (`TRAV_HALF`, from the photos);
  - the mainsheet is on the boom 2.96 m aft of the gooseneck (`SHEET_ON_BOOM`);
  - the boom is about 0.75 m above the traveller car;
  - the jib's LP is 2.36 m (ORC).

## Each number

| controls.ts | the real rig | verdict |
|---|---|---|
| traveller: ±9.5° of boom | the car runs on a straight track across the thwart, under the sheet's blocks 2.957 m aft of the gooseneck: atan(0.5 / 2.957) = **9.6°** | **sound**: now `TRAVELLER_SWING`, from the drawn figures (a test holds them together) |
| boom max 85° (trim.ts `SAILS.main.max`, "boom on the shroud") | at boom height the shroud is about 0.83 m out and 0.26 m aft of the gooseneck (CR 7.20, 7.60, the drawn chainplate 0.98 m out); the boom's side meets the slanted wire at **≈ 70°** (about 66° at the class's limits, 0.90 m out and 0.36 m aft; less with the vang off, as the boom lifts) | **wrong by 15°**: on a run the drawn boom goes through the shroud, and the main is let further out than a Folkboat's can be |
| jib lead 8° + 1.25°·pin (8°–13°) | North: **12.3°** if its 2.65 m is fore and aft (atan), **12.6°** if it's the straight tape from the forestay pin to the block its wording describes (asin); Josephine: 14.0° / 14.4° the same two ways, her holes 24 mm apart = **0.49° a hole** (±1.0° over five) | **too narrow, and the pins too far apart**: the middle hole should be about 12–14°, not 10.5°, with about 0.5° a pin, not 1.25° (for Deep Physics' car-lead work) |
| jib min 8° (`SAILS.jib.min`) | the lead itself | follows the lead |
| mainsheet: angle = 80°·s^1.5 | the sheet's length is 4 parts, each from the boom's blocks to the car: √(h² + (R sin θ)² + (R(1 − cos θ))²), with h 0.75 m and R 2.96 m. As a share of the ease to the shroud stop: 10° at 6%, 20° at 19%, 45° at 60% | **not geometric**: the sim needs 25% of the sheet for the first 10°, where the real sheet needs 6%. Close-hauled the real boom swings out fast for little rope (with the vang holding it down) |
| jib sheet: angle = lead + 70°·s^1.4 | the sheet from the clew (LP 2.36 m from the tack) to the car, about 0.4 m below it: 20° at 5%, 30° at 22%, 45° at 52% | **not geometric**, in the same way |
| jib max 68° | the clew's that far out with the sheet off | plausible; no source either way |

## What changing them would touch
- **The boom stop (85° → about 70°):**
  - It's a physics change: running speed, the crew's downwind trim, the pole, and the drawn boom.
  - It's true to the class rules.
  - It needs Deep Physics, and the physics tests rerun downwind.
- **The lead:**
  - It shifts every jib trim and the crew solver's car choice.
  - Deep Physics' car-lead work; one change, from JOSEPHINE_CAR / North.
- **The sheet curves:**
  - They're the 0–1 sheet scale the band shows and the crew trims in.
  - Making them geometric changes how far a sheet value moves the sail, not where the crew ends up: their targets go through the inverses `mainsheetFor` and `jibsheetFor`.
  - It does change `CONTROL_RATE` in sheet units a second, the band's markings and any test written in sheet values.
  - It's the owner's call whether the band should read rope eased (true to life) or stay a feel scale.
