# The main's best angle of attack (proposal, no code)

Rigging, 21 Nov 2026, revised the same day on the physics reviewer's verdict ("build it with changes: 25° is right and the mechanism is sound, but the doc overstated the case"). For the Coordinator and the owner, together with docs/rig/depower.md. Nothing is built until it's approved. This follows rig audit finding 1 (docs/rig/rig-audit.md).

## The defect

The auto crew and the AI boats beat with the boom 4.5–5.6° off the centerline in 6–12 kt, with the traveler in the middle. North's Folkboat guide puts it at 0–3° in medium air: the cars in the middle and the sheet tight. A player learning from the boats around them, or from their own crew, copies the wider boom.

The cause is the main's best angle of attack, `SAILS.main.aoa = 22` (src/boat/trim.ts:37). It is measured from the boat's apparent wind to the boom: the boom angle that draws best is the apparent wind angle less 22°. trim.ts calls it an estimate.

## What the angle drives

- **The crew's sheeting.** Where the auto crew and the AI put the boom (optimalSheet).
- **The trim error, err.** That is the apparent wind less the boom, less aoa. err sets when the main reads luffing or stalled (stalling starts 4° past best), and so the telltales, the flow view and the coach.
- **The forces, through err.**
  - trimK (balance.ts:237) scales each sail's lift by its flow.
  - trimDrive (physics.ts:568) scales the drive by the trim efficiency.
  - sailYaw takes its boom angle from optimalSheet, and its boom-offset term (balance.ts:347) turns her toward the wind as the boom is eased.

The ORC coefficients are the optimally trimmed sail's. aoa decides which boom angle gets them. Her polar holds when aoa changes only because the crew keeps err near 0. For a hand trimmer, every force moves with 3° of boom.

## The evidence

**North Sails, Nordic Folkboat tuning guide** (https://www.northsails.com/sailing/en/resources/nordic-folkboat-tuning-guide, read 21 Nov; also quoted at controls.ts:316):
- Light, 0–6 kt: "pull the traveller cars 15-20 cm to windward"; "the mainsheet is eased so that the top tell-tale flies straight".
- Medium, 6–14 kt: "set them in the middle". Tight sheeting is for "medium winds and flat water, where the boat can be kept flat by hiking", for pointing.
- Higher winds: "the cars are eased to leeward to decrease heel and thus rudder pressure"; "In heavy winds, sheet tight and pull the backstay until the rudder feels light again."
- In almost all winds: "the top batten is trimmed parallel to the boom".
- The guide gives no boom angle in degrees.

**On her own geometry:** the car in the middle with the sheet tight puts the boom at 2.5° (boomAngle at the sheet's 0.1).

**On the sim's own apparent wind** (b.awa, sailWind's wind at sail height), beating at her best angles, the guide's trim is an angle of attack of:

| tws | twa | apparent wind | boom | angle of attack |
|---|---|---|---|---|
| 6 | 40 | 28.1 | 2.5 | 25.5 |
| 9 | 38 | 28.6 | 2.5 | 26.1 |
| 12 | 36 | 28.8 | 2.5 | 26.2 |

The reviewer's figure for the same is 24.1–25.6°, about 1° lower, from another reading of the wind. Either way 25° is central and 27° is not supported.

Nothing else is cited. Wind-tunnel and VPP figures for a main's best sheeting angle (Marchaj, Larsson and Eliasson, the Auckland tunnel) could not be read or verified, and no Folkboat ORC certificate was found (the researcher, 21 Nov).

## What she does now, like for like

Each row holds the true wind angle fixed. Auto crew, flat water, 50 s to settle and 20 s averaged, on 5de4d67c (a throwaway test). "guide" is the guide's own trim held by hand: the car in the middle, the sheet at 0.1, the boom 2.5°, with aoa 22.

| tws | twa | trim | aoa | VMG kt | heel ° | helm | boom ° | traveler | err | flow |
|---|---|---|---|---|---|---|---|---|---|---|
| 6 | 40 | crew | 22 | 2.550 | 5.28 | 0.321 | 4.5 | 0.00 | 0.1 | drawing |
| 6 | 40 | crew | 25 | 2.546 | 5.29 | 0.289 | 2.0 | 0.00 | −0.4 | drawing |
| 6 | 40 | guide | 22 | 2.416 | 2.13 | 0.632 | 2.5 | 0.00 | +2.3 | |
| 9 | 38 | crew | 22 | 3.302 | 6.03 | 0.501 | 5.4 | 0.00 | 0.1 | drawing |
| 9 | 38 | crew | 25 | 3.303 | 6.02 | 0.440 | 2.3 | 0.00 | 0.2 | drawing |
| 9 | 38 | guide | 22 | 3.171 | 4.43 | 0.895 | 2.5 | 0.00 | +3.0 | drawing |
| 12 | 36 | crew | 22 | 3.784 | 13.64 | 1.301 | 5.6 | 0.05 | 0.0 | drawing |
| 12 | 36 | crew | 25 | 3.789 | 13.66 | 1.233 | 2.7 | 0.00 | 0.0 | drawing |
| 12 | 36 | guide | 22 | 3.681 | 11.56 | 1.661 | 2.5 | 0.00 | +3.3 | drawing |
| 16 | 34 | crew | 22 | 4.034 | 17.56 | 2.455 | 6.9 | 0.40 | −0.1 | drawing |
| 16 | 34 | crew | 25 | 4.034 | 17.56 | 2.359 | 3.9 | 0.00 | −0.1 | drawing |
| 16 | 34 | guide | 22 | 3.939 | 16.46 | 2.716 | 2.5 | 0.00 | +4.3 | stalled |
| 20 | 36 | crew | 22 | 4.096 | 19.79 | 3.334 | 9.7 | 0.27 | −0.3 | drawing |
| 20 | 36 | crew | 25 | 4.092 | 19.59 | 3.154 | 6.7 | 0.00 | −0.2 | drawing |
| 20 | 36 | guide | 22 | 4.009 | 16.89 | 2.341 | 2.5 | 0.00 | +7.2 | stalled |

Notes on the table:
- **The 6 kt guide row:** err averages +2.3, but the step it ended on read stalled, from a gust's swing.
- **16 kt at 35° and 36°:** with 25 the crew sets the car at 0.13 there, not 0. At 36° that gives heel −1.07° and helm −10%. That isn't like for like, so it's not quoted as the change's effect.

## What changing it does

**Following the guide today.**
- In 6–12 kt the guide's trim reads err +2.3 to +3.3. That is inside the 4° band, so the flow is fine and the telltales stream. It is no stall.
- From 16 kt it stalls (err +4.3 to +7.2), costing 1–2% of the main's lift.
- The real cost of the 22° is the boats the player learns from: they carry the boom 4.5–5.6° off in 6–12 kt, where the guide has 0–3°.

**With 25°** (the auto crew and the AI):
- **Boom:** 2.0–2.7° in 6–12 kt and 3.9° in 16 kt, the guide's place. In 16–20 kt the car stays in the middle and the sheet does the work.
- **Polar:** within 0.1% at the fixed angles above (VMG 2.546–4.092 against 2.550–4.096), because the crew keeps err near 0.
- **Heel:** unchanged to 16 kt; −0.2° at 20 kt.
- **Helm:** −4% to −12% from 6 to 20 kt (−3.9% at 16 kt and −5.4% at 20 kt, like for like). This is sailYaw's boom-offset term (balance.ts:347): a boom 3° nearer the centerline turns her less toward the wind. It falls at 6–12 kt too, with the traveler at 0 in both. It isn't the traveler.
- **The guide's trim by hand:** err falls by 3°. It reads drawing through 6–12 kt (err −0.7 to +0.3), and only past the stall's 4° from about 20 kt.

## The proposal

**`SAILS.main.aoa` from 22 to 25**, with a comment citing the guide (the car in the middle and the sheet tight in medium air, the top batten parallel to the boom) and its angle on her own apparent wind (25.5–26.2°, the table above).

Fix two stale comments in the same change:
- trim.ts:19 says aoa is measured to "the sail's chord at mid height". It's to the boom (the sheet angle), as trim.ts:27 says.
- controls.ts:101 gives the jib's best angle as "trim.ts's 18°". It's 16.5°.

## A follow-up it exposes, not in this change

**The boom's 2° floor binds in 6–9 kt.**
- With 25 the crew's boom sits on the floor (trim.ts `min: 2`) in light air. So the main luffs about 3° sooner than now when she's pinched, in a lull, shooting a mark or luffing at the start. The jib still luffs first.
- The floor is unsourced. The guide's light-air setting (the car 15–20 cm to windward, the boom on the centerline with the sheet eased) can't be represented above it.
- This wants its own change, gated by fouls-pair and perf-pair --ai.

**The traveler in 16–20 kt.** The guide eases it to leeward in higher wind; with 25 the crew holds it in the middle and eases the sheet. This change exposes the conflict; it doesn't cause it. It's the depowering order's (docs/rig/depower.md), and the reviewer's view is that the two should ship together.

## What it moves

- **Tests:** the crew's trim tests (sheet, traveler and depowering targets), the telltale and flow-view states, the coach's main-trim lines, and the AI's races through its sheeting. A test:fast run with 25 has not been completed: one was stopped partway for a timing slot.
- **Gates:** `perf-pair --ai` (the race changes), `fouls-pair` (an AI and physics change), perf.test's budget on the ten-race mean (`PERF_BUDGET_AI=1`), the full `npm test`, and a physics-reviewer pass of the code.
