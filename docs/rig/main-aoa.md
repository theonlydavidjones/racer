# The main's best angle of attack (proposal, no code)

Rigging, 21 Nov 2026, for the Coordinator, the physics reviewer and the owner. This follows rig audit finding 1 (docs/rig/rig-audit.md). Nothing is built until it's approved.

## The question

The main's best angle of attack is `SAILS.main.aoa = 22` (src/boat/trim.ts:37). It is measured from the boat's apparent wind to the boom: the sheet angle that draws best is the apparent wind angle less 22°.

- **Where it comes from:** the file itself calls it an estimate, "Marchaj's 22° for a main is quoted second-hand".
- **What it drives:**
  - where the auto crew and the AI sheet the main (optimalSheet);
  - when the main reads luffing or stalled (sailTrim: stalling starts 4° past it), and so the telltales, the flow view and the coach;
  - the main's share of the trim efficiency.
- **What it does not drive:** the sail forces. sailForces takes the ORC coefficients at the apparent wind angle and doesn't read it.

## The evidence

**North Sails, Nordic Folkboat tuning guide** (https://www.northsails.com/sailing/en/resources/nordic-folkboat-tuning-guide, read 21 Nov; also quoted at controls.ts:316):
- Light, 0–6 kt: "pull the traveller cars 15-20 cm to windward"; "the mainsheet is eased so that the top tell-tale flies straight".
- Medium, 6–14 kt: "set them in the middle". Tight sheeting is for "medium winds and flat water, where the boat can be kept flat by hiking", for pointing, at the cost of rudder pressure.
- Higher winds: "the cars are eased to leeward to decrease heel and thus rudder pressure", and "In heavy winds, sheet tight and pull the backstay until the rudder feels light again."
- In almost all winds: "the top batten is trimmed parallel to the boom".
- The guide gives no boom angle in degrees.

**What that means on her own geometry:** the car in the middle with the sheet tight puts the boom 0–3° off the centerline (boomAngle: 2.5° at the sheet's 0.1, 0.9° at 0.05).

**The sim's apparent wind on a beat** is 27.9–32.3° from 6 to 20 kt (her own polar, measured below).

So the guide's medium-air trim is an angle of attack of about 26–29° from the apparent wind to the boom, where the sim's best is 22°.

**Not found** (the researcher, 21 Nov):
- another Folkboat guide's boom rule (Heikkilä's, Hjortø's and Elvstrøm's were not searched);
- any wind-tunnel or VPP figure for a main's best sheeting angle close-hauled;
- a Folkboat ORC certificate.

A Finnish Folkboat association talk by Theis Palm (2023) is behind a host the network policy blocks.

**Why the main's best angle sits wider than a lone wing's.** The jib's circulation bends the flow ahead of the main, so the main meets it at a smaller angle than the boat's apparent wind. This is Gentry's sail interaction (1971, cited at trim.ts:27 for the jib). Measured from the boat's apparent wind, the main's best angle of attack is therefore larger than its sections' own. That fits the guide's centered boom. It is qualitative: no figure for it was found.

## What she does now, and with 25° or 27°

Each figure is her best beat, from a sweep of true wind angles 34–52°, auto crew, flat water, 50 s to settle and 20 s averaged. The sweep was a throwaway test on 5de4d67c.

| tws | aoa | best twa | speed kt | VMG kt | heel ° | helm | boom ° | traveler | main err |
|---|---|---|---|---|---|---|---|---|---|
| 6 | 22 | 40 | 3.33 | 2.550 | 5.3 | 0.32 | 4.5 | 0.00 | 0.1 |
| 6 | 25 | 40 | 3.32 | 2.546 | 5.3 | 0.29 | 2.0 | 0.00 | −0.3 |
| 6 | 27 | 42 | 3.42 | 2.539 | 5.6 | 0.33 | 2.0 | 0.00 | −1.5 |
| 9 | 22 | 38 | 4.19 | 3.302 | 6.0 | 0.50 | 5.4 | 0.00 | 0.1 |
| 9 | 25 | 38 | 4.19 | 3.303 | 6.0 | 0.44 | 2.3 | 0.00 | 0.2 |
| 9 | 27 | 38 | 4.19 | 3.302 | 6.0 | 0.44 | 2.0 | 0.00 | −1.6 |
| 12 | 22 | 36 | 4.68 | 3.784 | 13.6 | 1.30 | 5.6 | 0.05 | 0.0 |
| 12 | 25 | 36 | 4.68 | 3.789 | 13.7 | 1.23 | 2.7 | 0.00 | 0.0 |
| 12 | 27 | 36 | 4.68 | 3.789 | 13.7 | 1.22 | 2.0 | 0.00 | −1.3 |
| 16 | 22 | 36 | 4.99 | 4.039 | 18.5 | 2.62 | 7.9 | 0.44 | 0.0 |
| 16 | 25 | 34 | 4.87 | 4.034 | 17.6 | 2.36 | 3.9 | 0.00 | −0.1 |
| 16 | 27 | 34 | 4.87 | 4.034 | 17.6 | 2.30 | 2.0 | 0.00 | −0.2 |
| 20 | 22 | 36 | 5.06 | 4.096 | 19.8 | 3.33 | 9.7 | 0.27 | −0.3 |
| 20 | 25 | 36 | 5.06 | 4.092 | 19.6 | 3.15 | 6.7 | 0.00 | −0.2 |
| 20 | 27 | 36 | 5.00 | 4.046 | 17.6 | 2.61 | 4.7 | 0.00 | 0.0 |

Notes on the table:
- "helm" is `helmNeed`.
- The boom's floor is the trim's `min: 2`. At 27° the boom sits on it from 6 to 16 kt, and the main reads slightly under-trimmed there (err to −1.6).

## The proposal

**`SAILS.main.aoa` from 22 to 25**, with a comment citing the guide's centered car and tight sheet, its top batten parallel to the boom, and her measured apparent wind on a beat.

- **Why 25 and not 27:** 25 is the least change that brings her boom where the guide puts it, 2–4° in 6–16 kt with the car in the middle. The guide's own trim then reads drawing, not stalled: boom 2.5° at an apparent wind of 28.7° is 1.2° past best, under the stall's 4°. At 27 the boom sits on its 2° floor and reads under-trimmed through most of the range, and her 20 kt VMG drops 1.2%.
- **What it predicts:**
  - **Polar:** unchanged within 0.2% from 6 to 20 kt (VMG 2.546–4.092 against 2.550–4.096), because the forces don't read the angle.
  - **Heel and helm:** a little less at 16–20 kt (heel −0.2° to −0.9°, helm −7% to −10%), from the crew sheeting the boom in rather than dropping the traveler.
  - **Trim:** the boom sits 3–4° further in through the whole range.
  - **For the player:** following the guide (car in the middle, sheet tight) no longer stalls the main. Easing the traveler in a breeze lowers heel again, as the guide says, instead of raising it.
- **One open point for the reviewer:** at 25 the crew holds the traveler in the middle at 16–20 kt and eases the sheet, where the guide eases the cars to leeward "in higher wind". That's the crew's depowering order (controls.ts depowerLimits, the traveler last), not this angle. It belongs to the depowering check against North's guide (Rigging, open), and the two could land together.

## What it moves

**Tests.** A throwaway test:fast run with 25 was stopped partway for a timing slot, so this list is from the code, not a run:
- the crew's trim tests (sheet, traveler and depowering targets);
- the telltale and flow-view states;
- the coach's main-trim lines;
- the AI's races, through its sheeting.

**Gates:**
- `perf-pair --ai`: the race changes;
- `fouls-pair` (an AI and physics change);
- `perf.test`'s budget on the ten-race mean (`PERF_BUDGET_AI=1`);
- the full `npm test`;
- a physics-reviewer pass before it's opened.

**Owner.** It changes how every boat sails a beat, so the owner sees the before-and-after table first.
