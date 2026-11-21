# Depowering upwind, 14–25 kt: the guides against the sim's crew (no code)

Rigging, 21 Nov 2026, for the Coordinator, the physics reviewer and the owner, to be judged together with docs/rig/main-aoa.md. Nothing is built until it's approved.

## What the guides say

**North Sails, Nordic Folkboat tuning guide** (northsails.com/sailing/en/resources/nordic-folkboat-tuning-guide; quoted at controls.ts:316–332, rigTune.ts:13–30 and physics.ts:924):
- **Outhaul:** "in more wind than this [5–12 kt] pull the sail all the way to the mark."
- **Cunningham:** "When the wind exceeds 15 knots it is pulled hard."
- **Traveler:** "In higher wind the cars are eased to leeward to decrease heel and thus rudder pressure."
- **Sheet and backstay:** "In heavy winds, sheet tight and pull the backstay until the rudder feels light again." (The backstay half is quoted at physics.ts:924; the whole sentence is as the researcher read the page on 21 Nov.)
- **Vang:** "Never use the kickingstrap upwind in less than 18 knots" (16 in Theis Palm's 2023 talk). Above that it "keeps the boom down when easing in the gusts".
- **Shrouds:** "a further 1½ turns in strong wind, thus tightening the forestay under increased wind pressure."
- **Jumpers:** "relatively loose in light winds and strong winds."
- **The main:** "the top batten is trimmed parallel to the boom in almost all wind strengths."
- **Order:** the guide gives no order between the lines. It ties each to a wind or a symptom: heel and rudder pressure for the traveler, a heavy rudder for the backstay.

**Heikkilä Sailmaker, "Kansanveneen trimmiohje"** (2021; rigTune.ts:33–44):
- **The jib:** cut for 4–6 cm of forestay sag beating in light and medium air. The sag is held by the shrouds and the lines under way. In more wind the backstay keeps it there (rigTune.ts heikkilaFor).
- **Jumpers:** tightened again in a strong wind if the mast bends past the main's luff round, the opposite of North (see the rig audit's notes).
- **Traveler and main sheet:** nothing in the parts quoted in the code.

**The sim's order** (controls.ts depowerLimits, by the crew's depowering 0 to 1):
1. outhaul
2. backstay
3. Cunningham, main halyard and jib halyard
4. vang
5. jib cars aft
6. traveler down, last

Underneath that, the crew's search (physics.ts powerFactor) picks how far to depower for the most speed, as ORC's VPP does. The guide's own settings for the wind (guideLimits) bound each line.

## What the sim's crew does

Her best beat, auto crew, flat water, standard crew, 60 s to settle and 20 s averaged, on 5de4d67c. The sweep was a throwaway test.

| tws | speed | heel ° | helm | depower | outhaul | backstay | Cunningham | vang | traveler | sheet | boom ° | jib car (fore/in) | main depth / twist | main |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 | 4.55 | 8.6 | 0.81 | 0.00 | 0.55 | 0.20 | 0.65 | 0.10 | 0.05 | 0.20 | 7.8 | 3/0 | 0.127 / 13.1 | drawing |
| 14 | 5.09 | 16.4 | 2.01 | 0.00 | 1.00 | **0.09** | 0.51 | 0.00 | **0.69** | 0.11 | 9.5 | 3/3 | 0.122 / 7.3 | drawing |
| 16 | 5.22 | 18.8 | 2.81 | 0.00 | 1.00 | **0.05** | 0.90 | 0.00 | **0.82** | 0.11 | 10.8 | 3/4 | 0.123 / 7.3 | drawing |
| 18 | 5.29 | 20.8 | 3.36 | 0.19 | 1.00 | 0.20 | 0.92 | 0.45 | 0.75 | 0.16 | 12.1 | 3/4 | 0.113 / 7.6 | drawing |
| 20 | 5.35 | 21.3 | 3.84 | 0.50 | 1.00 | 0.67 | 1.00 | 1.00 | **0.00** | **0.30** | 13.4 | 3/4 | 0.103 / 11.6 | drawing |
| 22 | 5.35 | 20.8 | 4.11 | 0.73 | 1.00 | 1.00 | 1.00 | 1.00 | **0.10** | **0.34** | 16.7 | 5/4 | 0.095 / 11.8 | luffing (−2.4°) |
| 25 | 5.35 | 20.8 | 3.44 | 0.87 | 1.00 | 1.00 | 1.00 | 0.90 | 0.60 | 0.33 | 20.6 | 5/4 | 0.095 / 13.1 | luffing (−5.1°) |

## Where they differ

**1. At 14–16 kt the traveler goes down first, with the backstay nearly off.**
- The crew drops the car to 0.69–0.82 with the backstay at 0.05–0.09, so heel 16–19° and helm 2–2.8 are carried on the traveler alone.
- North pulls the backstay "until the rudder feels light again". Heikkilä has the backstay holding 4–6 cm of sag once the shrouds can't.
- The sim's own order puts the backstay second and the traveler last.
- **Cause:** the depowering is still 0 here, so its steps set no floor. The car comes down only because the crew is putting the boom where the main's best angle (22°) wants it: 9.5–10.8°, which the sheet alone can't reach with the leech closed. With the main's best angle at 25° (main-aoa.md) the car stays in the middle at 16 kt (boom 3.9°).

**2. At 20–22 kt the sheet is eased with the vang hard, and the car is back in the middle.**
- Sheet 0.30–0.34, vang 1, traveler 0.00–0.10.
- That's the boom held down by the vang and let out on the sheet: vang sheeting.
- North says "sheet tight" in heavy winds, with the cars eased to leeward. It uses the vang only to keep the boom down "when easing in the gusts".
- The car goes 0.82 → 0.75 → 0.00 → 0.10 → 0.60 from 16 to 25 kt. A crew doesn't do that.
- **Cause:** the depowering step's floor on the traveler (−1 + 1.6 × its share past 0.6 of the depowering) is no ceiling. Above 18 kt the search finds an eased sheet against a hard vang about as fast as the car down.

**3. At 22–25 kt the main is let luff (err −2.4° to −5.1°).**
- A Folkboat's main does back in a blow. The guide gives no figure, and nothing here says it's wrong.
- It's noted because the flow view and the telltales will show it luffing on a well-sailed beat.

**What agrees:**
- the outhaul to the mark from 14 kt;
- the Cunningham hard past 15 kt;
- no vang under 18 kt;
- the jib halyard and Cunningham coming on;
- the jib cars going aft (5 of 7) from 22 kt.

## The proposal, to be judged with main-aoa.md

1. **The main's best angle at 25°** (main-aoa.md). That alone ends difference 1's early traveler: at 16 kt the car stays in the middle.
2. **The backstay before the traveler in the guide's own terms.**
   - Give the backstay a floor from guideLimits as the breeze builds past the medium range (14 kt). North's "heavy winds … pull the backstay" and Heikkilä's sag held "by the backstay" in more wind are both read there.
   - This replaces the depowering's 0.1–0.75 share as the backstay's only floor.
   - The figure for the floor wants the reviewer: neither guide gives a number, only "until the rudder feels light".
3. **In a breeze, the car down before the sheet eases.**
   - Above 18 kt the traveler takes heel first ("eased to leeward to decrease heel"), with the sheet tight.
   - The sheet eases only in the gusts, on the vang ("keeps the boom down when easing in the gusts").
   - In depowerLimits: the traveler's step from depowering 0.3 rather than 0.6, and a ceiling on the mainsheet while the car has travel left.

Each of 2 and 3 changes how every boat beats in a breeze. Neither is built.

**What they'd move and need:**
- the crew's trim and depowering tests;
- the AI's races;
- coach lines on the traveler and backstay;
- the same gates as main-aoa.md: `perf-pair --ai`, `fouls-pair`, perf.test's ten-race budget, the full `npm test` and a physics-reviewer pass.

**The prediction for her polar:** small. The forces read the sails' shapes and angles; the search already finds the fastest depowering, and these change the route more than the end. A sweep before anything is built would settle it, and it's cheap: the throwaway test above, with the limits changed.
