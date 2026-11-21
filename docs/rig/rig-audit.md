# Rig controls audit (v215, 5de4d67c)

Rigging, 21 Nov 2026, for the Coordinator. This audit checks every rig control the player can touch in the sail band against the real boat: the sheets, the traveler, the vang, the outhaul, both Cunninghams, both halyards, the backstay, the jumpers and the jib cars.

**How it was checked:**
- **The physics:** each line was swept from end to end with every line in hand (`trimAll`, `manualTrim`), beating in 12, 16 and 20 kt and on a 100° reach in 12 kt, 40 s each. The sweep recorded speed, heel, weather helm, the boom and jib angles, both sails' shapes, and whether the main was drawing or stalled. The auto crew's own trim was recorded beating from 6 to 25 kt.
- **The drawing:** the crew lab, from both sides on both tacks.
- **The hover tips:** `BAND_TIPS`.

**Stills:** they are on the `stills/rig-audit` branch (PNGs only, 320c0ad9):
- `trav-lee_*`, `trav-wind_*`: the traveler at each end, beating in 16 kt.
- `vang-off_*`, `vang-on_*`: the vang off and on, reaching in 12 kt (the boom level in both, rightly: finding 2).

Each set is from starboard and port, on both tacks.

## What's right

| Control | Moves | Direction and size | Source |
|---|---|---|---|
| Mainsheet | the boom angle, and the leech through the sheet's vertical pull | In closes the leech (twist 18° → 8° beating). Eased out to the shroud at 70°. | CR 7.20, 7.60 (controls.ts BOOM_STOP) |
| Traveler | the boom ±9.5° | Down to leeward spills power at 12 kt (heel 13.2° → 11.1°, helm down). Up to windward keeps the boom central with the leech open. | North Sails Folkboat guide, cited at controls.ts:316 |
| Vang | the leech once the sheet is eased | Reaching, twist 19.9° off → 9.1° on, and faster. Upwind with the sheet in it only flattens the foot a little. | North, "never use the kickingstrap upwind in less than 18 knots" |
| Outhaul | the foot's depth | Depth 13.5% → 12.0% of chord, over North's 3 cm range | North, cited at controls.ts:318 |
| Cunningham and main halyard | the draft position | Tight moves the draft forward (0.51 → 0.45) and flattens a little | North, cited at controls.ts:321 |
| Backstay | the mast's bend and the forestay's sag | Main depth −2.5% of chord, its draft slightly aft and its leech opening; jib depth −3.5%. At 20 kt, heel 27° → 21° and faster. | North, and rigTune.ts |
| Jib halyard and jib Cunningham | the jib's draft | Tight moves it forward (0.44 → 0.38) | North, cited at controls.ts:328 |
| Jib sheet | the jib angle and its leech | In closes the leech (twist 15° → 9°). Let fly, the jib goes to 68° and weather helm climbs. | |
| Jib cars | the lead angle (in and out) and the twist (fore and aft) | Forward: twist 4.7°, fuller. Aft: twist 16.7°, flatter. 7 by 5 pins, 25 mm apart. | North's 58 cm and 2.65 m (controls.ts:105); the pin counts are an estimate (ABOARD-JOSEPHINE 1.1) |
| Jumpers | the upper mast's bend (the rig tune) | On closes the top of the leech | North and Heikkilä, rigTune.ts |

Every hover tip is one line, under 90 characters (tests/bandTips.test.ts), and every tip but the jib car's says what its line does.

## Findings

| # | Size | What | Where | Source that says it's wrong |
|---|---|---|---|---|
| 1 | M | **The main wants about 8° of boom beating in medium air, where North's Folkboat sails with the boom near the centerline.** The auto crew beats with the boom at 7–8° in 9–12 kt and 10° in 16 kt (car in the middle, sheet eased to 0.21). A player who sheets in as the guide says (car in the middle, sheet tight, boom about 2.5°) stalls the main by 6° at 12 kt and by 8–10° at 16–20 kt (`trim.main.err`). So letting the traveler down at 16–20 kt *raises* heel (18.0° → 18.8°) and weather helm, the opposite of the guide. The cause is the main's best angle of attack, 22° from the boom. | src/boat/trim.ts:37 (`aoa: 22`); the boom from controls.ts:87 | North Sails, Nordic Folkboat tuning guide: "In medium winds (6-14 knots) set them [the traveller cars] in the middle"; the sheet "sheeted tight" (both quoted at controls.ts:212 and :323). "In higher wind the cars are eased to leeward to decrease heel." This wants a physics-reviewer pass before anything changes: it moves every boat's beat. It ties into the depowering check against North's guide (Rigging, open). |
| 2 | — | **Withdrawn (21 Nov): the drawn boom's not lifting is right.** The audit first read the level boom with the vang off as missing a lift. A leech of fixed length only slackens to second order as the head twists open: the slack is δ ≈ (E·Δφ)²/(6H), with the foot E 3.38 m, the luff H 8.75 m and Δφ the extra twist at the head (radians), each section turned about the luff and its chord tapering to the head. The physics' 10.8° more twist with the vang off (19.9° against 9.1°) asks the boom end to rise about 8 mm, or 0.15°. The drawn sail already turns its sections about the luff with the clew on the boom (sails.ts:150), so the drawing matches the physics to within a centimeter. A boom seen to sky needs far more twist than the sim's ceiling of 24°, plus the cloth stretching. | src/render/boatMesh.ts:1633 (no change) | the geometry above |
| 3 | S | **The jib car's tip says "out for a wider, fuller slot".** Out only widens the lead angle (controls.ts jibAngle); the jib's depth doesn't change with it (jibShape reads only the car's fore-and-aft hole). "Fuller" is wrong. | src/ui/sailBand.ts:193 | controls.ts:123 and :247 |

## Notes (no change proposed)

- **Jumpers in a breeze: two cited guides disagree.**
  - North's strong setting slacks them to 0 (rigTune.ts:71), and the band's tip follows it ("Off in light air and a breeze").
  - Heikkilä's tune adds a turn in a breeze (3.5 turns, rigTune.ts:84) "against the mast bending past the main's luff round".
  - With Heikkilä's tune the tip tells the player the opposite of what their tune does. The tips may not name either guide (tests/bandTips.test.ts), so this is the owner's call.
- **The boom's floor of −2° is unsourced** (controls.ts:87). With the car hard to windward and the sheet two-blocked, the geometry gives −9.6°. The guide's light-air setting (cars 15–20 cm up) never reaches the floor, so it only matters to a player who pulls the car right up.
- **Already on record:**
  - The sheets' 0–1 scales are feel scales, not rope (reference/design/sheet-geometry.md; the owner's call).
  - The traveler's track (ABOARD-JOSEPHINE 1.14) and the jib car's pin counts (1.1) wait on a tape aboard.
