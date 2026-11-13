# Constants audit

Every named numeric constant in src/boat, src/environment, src/sim, src/ai and src/rules, and what it rests on. The working
list for criterion 3 of docs/VISION-ROADMAP.md ("every physics constant sourced, or flagged as an estimate with what
would settle it"). First pass, 13 Nov 2026 (Bay East). No values were changed by this audit.

## Classes

| Class | Meaning |
|---|---|
| sourced | A citation in the code says where the number comes from (data, a paper, the class rules, a sailmaker's guide), or it is derived from sourced numbers. |
| measured | Measured from the sim's own geometry or runs, by a test or a script. |
| calibrated | Fitted so the sim matches a real result. |
| owner | The owner's own figure (they race these boats). |
| estimate | Not sourced, but flagged as an estimate in the code. Criterion 3 wants "what would settle it" next to each. |
| unsourced | No source and not flagged. The list to work down. |
| standard | Physical constants, unit conversions, positions. |
| numerical | Grid sizes, steps, caches, identity presets: not claims about the world. |
| design | Game or coaching choices (fleet variety, practice presets, thresholds for advice): not physics. |

## Counts

| | sourced | measured | calibrated | owner | estimate | unsourced | standard | numerical | design | total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| src/boat | 77 | 1 | 4 | 3 | 54 | 72 | 14 | 15 | 11 | 251 |
| src/environment | 16 | 0 | 0 | 0 | 7 | 9 | 6 | 26 | 11 | 75 |
| src/sim | 2 | 0 | 0 | 1 | 0 | 32 | 2 | 6 | 7 | 50 |
| src/ai | 0 | 0 | 0 | 0 | 0 | 13 | 0 | 0 | 0 | 13 |
| src/rules | 0 | 0 | 0 | 0 | 2 | 10 | 0 | 0 | 0 | 12 |
| **all** | **95** | **1** | **4** | **4** | **63** | **136** | **22** | **47** | **29** | **401** |

## The ten unsourced that matter most

Ranked by how much each moves race results or what a sailor learns from the sim. The owner of each is the session
that would act on a finding.

| # | Constants | What they do | What would settle it | Owner |
|---|---|---|---|---|
| 1 | trim.ts SAILS.aoa (main 22°, jib 18°), LUFF_START 2, LUFF_SPAN 10, STALL_START 4 | The best angle of attack and how fast trim error costs drive: every boat's speed, every trim lesson | Sail aerodynamics (wind-tunnel or VPP data for a main and jib: angle of best drive, the width of the "groove") | Deep Physics |
| 2 | dynamics.ts HANDLING.turnRadius 9 m, maxTurnRate 22°/s, turnDrag 0.15 | How fast she turns and what a tack or a gybe costs in speed: the cost of every manoeuvre | Tack-loss measurements for long-keel boats (GPS tracks of Folkboats tacking; published tack-loss studies) | Deep Physics |
| 3 | dynamics.ts HANDLING.formFactor 1.15, windageCdA 2.0 m², flogCdA 3 m² | Hull resistance beyond friction, and the rig's windage: speed at every angle, and upwind most | Form factors for full-bodied keelboats (ITTC/Delft series); windage of a rig and hull (Marchaj, ORC VPP windage terms) | Deep Physics |
| 4 | routing.ts MANOEUVRE_S 8 s | The seconds a tack or gybe costs in routing and the committee's course table | Same as 2; should come out of the sim's own tack loss (a test) once 2 is sourced | Deep Physics |
| 5 | polar.ts NO_GO 25° | Below this true wind angle, no drive at all: pinching and luffing behaviour | Folkboat polars (ORC certificates' beat angles) and sail-model stall | Deep Physics |
| 6 | balance.ts RUDDER (area 0.42 m², arm 2.6 m), CHORD (2.4, 2.0 m), IDEAL_HELM 2.5°, FULL_RUDDER 30° | Weather helm, and how much rudder she needs: the feel of the boat, and the rudder's drag | Class plans (rudder dimensions), the ORC rig for chords; sailing texts for ideal helm (2–4° is the usual advice) | Deep Physics |
| 7 | controls.ts CONTROL_RATE (11 lines), trim.ts crewRate/handRate | How fast lines are worked: how quickly a crew answers a puff or rounds a mark | Timed routines (the owner can time them next season); until then published timings for small keelboats | Crew Model |
| 8 | physics.ts HOIST (30/15/15/10 s), POLE (8/5/8 s), CREW_LAG 0.8 s, PENALTY_TURN_RATE 10°/s | Crew timings for the sails and the pole, and the penalty turns | As 7 | Crew Model |
| 9 | rules/pairs.ts RULE15_GRACE 3.5 s, HAIL_RESPONSE 5 s, REPLY_ROOM 25 s, CONTACT_GAP 2.2 m, ROOM_GAP 3.5 m, JUST_TACKED, INCIDENT_COOLDOWN; world.ts SAME_INCIDENT, COMPELLED_WINDOW; ai.ts MARK_ROOM 5 m | When the sim calls a foul. The RRS name the rule, not the number | World Sailing Cases and Calls, judges' manuals and Perry's book: what time and distance a jury takes as "room" and "as soon as possible" | Rules |
| 10 | controls.ts SAIL_WEAR (mid and old rows) | How much an old sail costs: depth, draft aft, twist, drag | Sailmakers' figures on cloth stretch and draft creep with age (Dacron mains) | Deep Physics |

Next, lower: traffic.ts VESSEL and shadows.ts SHIP_AIR (ship particulars, easy to source from AIS and the operators),
ai.ts clearances, world.ts docking speeds, condition.ts WOOD_RIG.


## Method and limits

- Extracted by script: top-level `const NAME = number` (and simple arithmetic), and the numeric fields of top-level
  `const NAME = { … }` tables. **Not covered:** numbers written inline in formulas (e.g. `0.08 * (1 - …)` in
  controls.ts shapeEfficiency, the 0.55 in balance.ts heelFactor), and lower-case or function-local constants. Those
  are the second pass.
- Classified first by the comments around each constant and in its file's header, then corrected by hand. A constant
  counts as sourced only if the citation is for the number: a comment naming "Rule 15" for a 3.5 s grace period is
  unsourced, since the rule gives no number.
- Spot-checked, not proven: a "sourced" row means a citation exists, not that the value matches it. Disagreements found
  while sourcing go to the owning session (Deep Physics, Skipper Model, Crew Model, Rules) as findings, not edits.

## By file


### src/boat/autopilot.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| RAM_RATE | 2/4.5 | 60 | estimate | flagged unconfirmed |
| GAIN | 0.45 | 64 | design | a pilot setting |
| AWA_TAU | 2.5 | 66 | design | a pilot setting |
| AUTO_TACK | 100 | 69 | estimate |  |

### src/boat/balance.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| RHO_AIR | 1.225 | 29 | standard |  |
| RHO_W | 1025 | 29 | standard |  |
| G | 9.81 | 29 | standard |  |
| STAB.crewZ | 0… | 47 | sourced |  |
| DECK_EDGE | 30 | 56 | estimate |  |
| CREW.kg | 240 | 62 | unsourced |  |
| CREW.reach | 1.05 | 62 | estimate |  |
| CE_HEIGHT | 4.78 | 74 | sourced |  |
| CE_ABOVE_WL | 4.29 | 76 | sourced | ORC rig + CR freeboard (CE_HEIGHT block) |
| LEVER.main | -0.538 | 87 | sourced |  |
| LEVER.jib | 1.342 | 87 | sourced |  |
| CHORD.main | 2.4 | 89 | unsourced |  |
| CHORD.jib | 2.0 | 89 | unsourced |  |
| RUDDER.area | 0.42 | 91 | unsourced |  |
| RUDDER.slope | 3.0 | 91 | estimate |  |
| RUDDER.arm | 2.6 | 91 | unsourced |  |
| RUDDER.aspect | 1.4 | 91 | unsourced |  |
| FULL_RUDDER | 30 | 93 | unsourced |  |
| IDEAL_HELM | 2.5 | 95 | unsourced |  |
| MAIN_C.kpp | 0.01379 | 127 | sourced |  |
| JIB_C.kpp | 0.016 | 135 | sourced |  |
| RIG.P | 8.75 | 148 | sourced |  |
| RIG.E | 3.38 | 148 | sourced |  |
| RIG.BAS | 1.0 | 148 | sourced |  |
| RIG.IG | 6.5 | 148 | sourced |  |
| RIG.J | 2.0 | 148 | sourced |  |
| RIG.frac | 6… | 148 | calibrated |  |
| RIG.overlap | 2… | 148 | sourced |  |
| RIG.roach | 0.193 | 148 | sourced |  |
| RIG.zMain | 4.44 | 149 | sourced |  |
| RIG.zJib | 2.2 | 149 | sourced |  |
| RIG.hbi | 0.65 | 149 | sourced |  |
| RIG.rm4 | 0… | 149 | sourced |  |
| RIG.main | 0.145 | 151 | sourced |  |
| RIG.jib | 0.141 | 151 | sourced |  |
| ROLL.gyration | 0… | 318 | sourced | Klaka 2000 (Curtin CMST C2000-21) |
| ROLL.added | 0.3 | 318 | sourced | Klaka 2000 (Curtin CMST C2000-21) |
| ROLL.zetaRest | 0.079 | 318 | sourced | Klaka 2000 (Curtin CMST C2000-21) |
| ROLL.keelArea | 0… | 318 | sourced | ORC VPP doc 2025 eq 4.29 |
| ROLL.keelZ | 0… | 318 | sourced | ORC VPP doc 2025 eq 4.29 |
| CLOTH | 0.25 | 338 | sourced |  |

### src/boat/coach.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| FIX_MIN | 0.004 | 76 | design | coaching/debrief threshold |

### src/boat/condition.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| G | 9.81 | 43 | standard |  |
| WOOD_RIG.kg | 9 | 45 | unsourced |  |
| WOOD_RIG.dz | 5.3 | 45 | unsourced |  |
| MAST_BEND.average | 1 | 53 | estimate |  |
| STATION.transom | 3.45 | 56 | estimate |  |
| STATION.locker | 2.3 | 56 | estimate |  |
| JUMPER_HALF_TURN_S | 4 | 88 | sourced |  |
| PERF_INFO.strokes | 2.5 | 124 | numerical | UI text |

### src/boat/controls.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| CAR_FORE_PINS | 7 | 48 | estimate |  |
| CAR_IN_PINS | 5 | 48 | estimate |  |
| SAIL_WEAR.depth | 0 | 122 | numerical | new sail: no wear |
| SAIL_WEAR.draft | 0 | 122 | numerical | new sail: no wear |
| SAIL_WEAR.stretchDepth | 0 | 122 | numerical | new sail: no wear |
| SAIL_WEAR.stretchDraft | 0 | 122 | numerical | new sail: no wear |
| SAIL_WEAR.headTwist | 0 | 122 | numerical | new sail: no wear |
| SAIL_WEAR.dcd | 0 | 122 | numerical | new sail: no wear |
| SAIL_WEAR.clMul | 1 | 122 | numerical | new sail: no wear |
| SAIL_WEAR.depth | 0.01 | 123 | unsourced | sail wear by age |
| SAIL_WEAR.draft | 0.03 | 123 | unsourced | sail wear by age |
| SAIL_WEAR.stretchDepth | 0.0004 | 123 | unsourced | sail wear by age |
| SAIL_WEAR.stretchDraft | 0.0015 | 123 | unsourced | sail wear by age |
| SAIL_WEAR.headTwist | 0.12 | 123 | unsourced | sail wear by age |
| SAIL_WEAR.dcd | 0.006 | 123 | unsourced | sail wear by age |
| SAIL_WEAR.clMul | 1 | 123 | unsourced | sail wear by age |
| SAIL_WEAR.depth | 0.025 | 124 | unsourced | sail wear by age |
| SAIL_WEAR.draft | 0.06 | 124 | unsourced | sail wear by age |
| SAIL_WEAR.stretchDepth | 0.0008 | 124 | unsourced | sail wear by age |
| SAIL_WEAR.stretchDraft | 0.0035 | 124 | unsourced | sail wear by age |
| SAIL_WEAR.headTwist | 0.3 | 124 | unsourced | sail wear by age |
| SAIL_WEAR.dcd | 0.015 | 124 | unsourced | sail wear by age |
| SAIL_WEAR.clMul | 0.98 | 124 | unsourced | sail wear by age |
| STD_RIG.bend | 1 | 130 | estimate |  |
| CONTROL_RATE.mainsheet | 0.12 | 234 | unsourced | crew timing |
| CONTROL_RATE.traveller | 0… | 234 | unsourced | crew timing |
| CONTROL_RATE.vang | 0.25 | 234 | unsourced | crew timing |
| CONTROL_RATE.outhaul | 0.3 | 234 | unsourced | crew timing |
| CONTROL_RATE.cunningham | 0.3 | 234 | unsourced | crew timing |
| CONTROL_RATE.downhaul | 0.2 | 234 | unsourced | crew timing |
| CONTROL_RATE.backstay | 0.3 | 234 | unsourced | crew timing |
| CONTROL_RATE.jibsheet | 0.16 | 234 | unsourced | crew timing |
| CONTROL_RATE.jibsheetW | 0.16 | 234 | unsourced | crew timing |
| CONTROL_RATE.jibCunningham | 0.3 | 234 | unsourced | crew timing |
| CONTROL_RATE.jibHalyard | 0.2 | 234 | unsourced | crew timing |

### src/boat/crewPhys.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| DEFAULT_SKILL | 0.6 | 65 | design | default crew (anthropometry not cited) |
| DEFAULT_CREW.h | 1.78 | 66 | design | default crew (anthropometry not cited) |
| DEFAULT_CREW.w | 80 | 66 | design | default crew (anthropometry not cited) |
| DEFAULT_CREW.h | 1.75 | 66 | design | default crew (anthropometry not cited) |
| DEFAULT_CREW.w | 78 | 66 | design | default crew (anthropometry not cited) |
| DEFAULT_CREW.h | 1.72 | 66 | design | default crew (anthropometry not cited) |
| DEFAULT_CREW.w | 72 | 66 | design | default crew (anthropometry not cited) |
| Z.helm | 2.95 | 199 | sourced | NFIA CR 3.22, 6.1.7; North Sails guide; owner photos |
| Z.cockpitFwd | 1.35 | 199 | sourced | NFIA CR 3.22, 6.1.7; North Sails guide; owner photos |
| Z.deckFwd | 1.65 | 199 | sourced | NFIA CR 3.22, 6.1.7; North Sails guide; owner photos |
| Z.cockpitAft | 2.5 | 199 | sourced | NFIA CR 3.22, 6.1.7; North Sails guide; owner photos |
| Z.piano | 0.85 | 199 | sourced | NFIA CR 3.22, 6.1.7; North Sails guide; owner photos |
| Z.car | -3… | 199 | sourced | NFIA CR 3.22, 6.1.7; North Sails guide; owner photos |
| Z.mast | -0.95 | 199 | sourced | NFIA CR 3.22, 6.1.7; North Sails guide; owner photos |
| Z.gap | 0.5 | 199 | sourced | NFIA CR 3.22, 6.1.7; North Sails guide; owner photos |
| Z.bow | -3… | 199 | sourced | NFIA CR 3.22, 6.1.7; North Sails guide; owner photos |
| Z.foredeck | -2.0 | 199 | sourced | NFIA CR 3.22, 6.1.7; North Sails guide; owner photos |
| DECK_ARM | 0.5 | 228 | sourced |  |
| CAR_ARM | 0.8 | 245 | owner |  |
| lean | 1 | 254 | numerical |  |
| RECOVER | 60 | 271 | sourced |  |
| ROLL_HOLD | 2 | 323 | owner |  |
| HOLD.heel | 2 | 342 | estimate | coaching practice; the seconds are judgement |
| HOLD.last | 3 | 342 | estimate | coaching practice; the seconds are judgement |
| HOLD.dwell | 10 | 342 | estimate | coaching practice; the seconds are judgement |
| HOLD.urgent | 2 | 342 | estimate | coaching practice; the seconds are judgement |
| HOLD.fore | 0.3 | 342 | estimate | coaching practice; the seconds are judgement |
| HOLD.settle | 4 | 342 | estimate | coaching practice; the seconds are judgement |
| LAYOUT_STAY | 60 | 589 | estimate | coaching practice; the seconds are judgement |

### src/boat/crewWork.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| LINE_TAU | 20 | 45 | estimate | coaching practice; the seconds are judgement |
| PLACED_TRIP | 0.3 | 54 | unsourced |  |
| JIB_HAUL | 0.25 | 62 | estimate |  |
| NOVICE | 0.3 | 70 | owner |  |
| DONE | 1e-4 | 129 | numerical |  |
| CAR.work | 6 | 229 | unsourced |  |

### src/boat/dynamics.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| RHO_WATER | 1025 | 15 | standard |  |
| RHO_AIR | 1.225 | 15 | standard |  |
| NU | 1.19e-6 | 15 | standard |  |
| G | 9.81 | 15 | standard |  |
| HANDLING.formFactor | 1.15 | 27 | unsourced |  |
| HANDLING.windageCdA | 2.0 | 29 | unsourced |  |
| HANDLING.flogCdA | 3 | 32 | unsourced |  |
| HANDLING.turnRadius | 9 | 34 | unsourced |  |
| HANDLING.minTurnRate | 4 | 36 | unsourced |  |
| HANDLING.maxTurnRate | 22 | 38 | unsourced |  |
| HANDLING.turnDrag | 0.15 | 40 | unsourced |  |
| HANDLING.luffFactor | 0.12 | 42 | unsourced |  |
| HANDLING.luffFlog | 1 | 44 | unsourced |  |
| RES_STEP | 0.001 | 76 | numerical |  |
| RES_N | 10001 | 76 | numerical |  |

### src/boat/fouling.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| NU | 1.19e-6 | 26 | standard |  |
| KAPPA | 0.41 | 26 | standard |  |
| LEN | 5.934 | 26 | sourced | ORC sailing length |

### src/boat/hullTrim.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| TRIM.lwl | 6.0 | 44 | sourced | NFIA / folkboat.com |
| TRIM.bwl | 1.85 | 45 | estimate |  |
| TRIM.cIL | 0.04 | 47 | estimate |  |
| TRIM.wsK | -0.037 | 49 | measured | clipping the hull sections (geometry) |
| TRIM.waveK | 0.6 | 51 | estimate |  |
| TRIM.keelL | 5.9 | 53 | sourced | ORC draft, profile |
| TRIM.keelT | 0… | 53 | sourced | ORC draft, profile |
| TRIM.seaK | 0.1 | 57 | estimate |  |
| HULL_BT | 1.85/0.55 | 140 | estimate |  |
| HULL_CM | 0.70 | 140 | estimate |  |
| CANOE_VOL | 1.90 | 140 | estimate |  |

### src/boat/logbook.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| MAX | 600 | 34 | design | coaching/debrief threshold |

### src/boat/motor.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| RHO | 1025 | 21 | standard |  |
| HP | 745.7 | 22 | standard |  |
| OUTBOARDS.hp | 2.5 | 28 | sourced | Tohatsu specs via retailers (6 hp weight: to check) |
| OUTBOARDS.kg | 13 | 28 | sourced | Tohatsu specs via retailers (6 hp weight: to check) |
| OUTBOARDS.propD | 7… | 28 | estimate | 3.5's prop assumed for all |
| OUTBOARDS.pitch | 7… | 28 | estimate | 3.5's prop assumed for all |
| OUTBOARDS.rpm | 5500 | 28 | sourced | Tohatsu specs via retailers (6 hp weight: to check) |
| OUTBOARDS.gear | 2.15 | 28 | sourced | Tohatsu specs via retailers (6 hp weight: to check) |
| OUTBOARDS.hp | 3.5 | 29 | sourced | Tohatsu specs via retailers (6 hp weight: to check) |
| OUTBOARDS.kg | 18.4 | 29 | sourced | Tohatsu specs via retailers (6 hp weight: to check) |
| OUTBOARDS.propD | 7… | 29 | estimate | 3.5's prop assumed for all |
| OUTBOARDS.pitch | 7… | 29 | estimate | 3.5's prop assumed for all |
| OUTBOARDS.rpm | 5500 | 29 | sourced | Tohatsu specs via retailers (6 hp weight: to check) |
| OUTBOARDS.gear | 2.15 | 29 | sourced | Tohatsu specs via retailers (6 hp weight: to check) |
| OUTBOARDS.hp | 6 | 30 | sourced | Tohatsu specs via retailers (6 hp weight: to check) |
| OUTBOARDS.kg | 26 | 30 | sourced | Tohatsu specs via retailers (6 hp weight: to check) |
| OUTBOARDS.propD | 7… | 30 | estimate | 3.5's prop assumed for all |
| OUTBOARDS.pitch | 7… | 30 | estimate | 3.5's prop assumed for all |
| OUTBOARDS.rpm | 5500 | 30 | sourced | Tohatsu specs via retailers (6 hp weight: to check) |
| OUTBOARDS.gear | 2.08 | 30 | sourced | Tohatsu specs via retailers (6 hp weight: to check) |
| FIGURE_OF_MERIT | 0.55 | 33 | estimate |  |
| REVERSE | 0.5 | 35 | estimate |  |
| LEG_CDA | 0.010 | 39 | estimate |  |

### src/boat/physics.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| PENALTY_TURN_RATE | 10 | 22 | unsourced |  |
| SLOW_TACK | 1.3 | 24 | unsourced |  |
| CREW_LAG | 0.8 | 27 | unsourced |  |
| ASTERN_DRAG.c0 | 0.005 | 30 | unsourced |  |
| ASTERN_DRAG.c1 | 0.035 | 30 | unsourced |  |
| POLE.set | 8 | 35 | unsourced |  |
| POLE.stow | 5 | 35 | unsourced |  |
| POLE.gybe | 8 | 35 | unsourced |  |
| HOIST.main | 30 | 49 | unsourced |  |
| HOIST.jib | 15 | 49 | unsourced |  |
| HOIST.strikeMain | 15 | 49 | unsourced |  |
| HOIST.strikeJib | 10 | 49 | unsourced |  |
| HOVE.latArea | 0… | 373 | estimate |  |
| HOVE.wing | 2 | 374 | estimate |  |
| HOVE.crossCd | 1.0 | 377 | sourced | Hoerner, Fluid-Dynamic Drag |
| HOVE.dragAft | 0.3 | 387 | estimate |  |
| HOVE.swayAdded | 0.9 | 389 | estimate |  |
| HOVE.yawAdded | 0.4 | 389 | estimate |  |
| HOVE.gyration | 0.25 | 391 | estimate |  |
| HOVE.windSide | 5.5 | 393 | estimate |  |
| HOVE.windLever | 0.3 | 393 | estimate |  |
| HOVE.rudderFlow | 0.5 | 395 | estimate |  |
| HOVE.Hoerner | 1.17 | 396 | sourced | Hoerner, Fluid-Dynamic Drag |
| HOVE.cnBacked | 1.2 | 397 | sourced | Hoerner, Fluid-Dynamic Drag |
| SLACK_RATE | 0.6 | 804 | estimate |  |

### src/boat/polar.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| NO_GO | 25 | 21 | unsourced |  |

### src/boat/rigTune.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| TUNE_PRESETS.forestayMark | 1.31 | 68 | sourced | North Sails Folkboat tuning guide |
| TUNE_PRESETS.footAft | 22 | 68 | sourced | North Sails Folkboat tuning guide |
| TUNE_PRESETS.shroudTurns | 0 | 68 | sourced | North Sails Folkboat tuning guide |
| TUNE_PRESETS.jumperTurns | 0 | 68 | estimate |  |
| TUNE_PRESETS.forestayMark | 1.31 | 69 | sourced | North Sails Folkboat tuning guide |
| TUNE_PRESETS.footAft | 16 | 69 | sourced | North Sails Folkboat tuning guide |
| TUNE_PRESETS.shroudTurns | 1.5 | 69 | sourced | North Sails Folkboat tuning guide |
| TUNE_PRESETS.jumperTurns | 2.5 | 69 | estimate |  |
| TUNE_PRESETS.forestayMark | 1.31 | 70 | sourced | North Sails Folkboat tuning guide |
| TUNE_PRESETS.footAft | 10 | 70 | sourced | North Sails Folkboat tuning guide |
| TUNE_PRESETS.shroudTurns | 3 | 70 | sourced | North Sails Folkboat tuning guide |
| TUNE_PRESETS.jumperTurns | 0 | 70 | estimate |  |
| STAY.run | 2.0 | 129 | sourced |  |
| STAY.rise | 6.5 | 129 | sourced |  |
| CE_UP.main | 4.44 | 137 | sourced | derived: copies balance.ts |
| CE_UP.jib | 2.2 | 137 | sourced | derived: copies balance.ts |
| CHORD.main | 2.4 | 146 | sourced | derived: copies balance.ts |
| CHORD.jib | 2.0 | 146 | sourced | derived: copies balance.ts |
| GUIDE_SAG | 0.08 | 170 | sourced | North Sails Folkboat tuning guide |
| LIGHT_AWS | 9 | 170 | estimate | apparent wind taken for the guide's bands |
| MEDIUM_AWS | 17 | 170 | estimate | apparent wind taken for the guide's bands |
| JUMPER.twistPerTurn | -0.6 | 218 | estimate |  |
| JUMPER.depthPerTurn | -0.0008 | 218 | estimate |  |
| MAIN_TWIST_PER_M_SAG | 10 | 297 | estimate |  |

### src/boat/seaway.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| RHO | 1025 | 23 | standard |  |
| G | 9.81 | 23 | standard |  |
| BEAM | 2.21 | 23 | sourced | ORC beam |
| C_AW | 0.034 | 25 | calibrated |  |
| CHOP_MEMO | 16 | 77 | numerical |  |
| YAW_DEPTH | 0.6 | 117 | calibrated |  |
| YAW_RATE | 3.24 | 128 | calibrated | kept to the earlier sim's yaw |

### src/boat/spec.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| DEFAULT_BOAT.cleanedWeeks | 0 | 94 | numerical | defaults |
| DEFAULT_BOAT.gearKg | 0 | 94 | numerical | defaults |

### src/boat/trim.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| SAILS.aoa | 22 | 26 | unsourced |  |
| SAILS.min | 2 | 26 | unsourced |  |
| SAILS.max | 85 | 26 | unsourced |  |
| SAILS.crewRate | 9 | 26 | unsourced |  |
| SAILS.handRate | 12 | 26 | unsourced |  |
| SAILS.share | 0.7 | 26 | sourced | derived: sail areas |
| SAILS.aoa | 18 | 27 | unsourced |  |
| SAILS.min | 8 | 27 | unsourced |  |
| SAILS.max | 68 | 27 | unsourced |  |
| SAILS.crewRate | 14 | 27 | unsourced |  |
| SAILS.handRate | 16 | 27 | unsourced |  |
| SAILS.share | 0.3 | 27 | sourced | derived: sail areas |
| LUFF_START | 2 | 31 | unsourced |  |
| LUFF_SPAN | 10 | 31 | unsourced |  |
| STALL_START | 4 | 33 | unsourced |  |

### src/environment/current.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| CURRENTS.set | 0 | 9 | design | practice presets; "real" uses NOAA |
| CURRENTS.kt | 0 | 9 | design | practice presets; "real" uses NOAA |
| CURRENTS.set | 0 | 10 | design | practice presets; "real" uses NOAA |
| CURRENTS.kt | 0 | 10 | design | practice presets; "real" uses NOAA |
| CURRENTS.set | 95 | 11 | design | practice presets; "real" uses NOAA |
| CURRENTS.kt | 1.0 | 11 | design | practice presets; "real" uses NOAA |
| CURRENTS.set | 280 | 12 | design | practice presets; "real" uses NOAA |
| CURRENTS.kt | 1.5 | 12 | design | practice presets; "real" uses NOAA |
| CURRENTS.set | 280 | 13 | design | practice presets; "real" uses NOAA |
| CURRENTS.kt | 2.5 | 13 | design | practice presets; "real" uses NOAA |

### src/environment/gusts.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| GUSTS.kappa | 0.4 | 27 | sourced | Charnock/Smith 1988, Kaimal, IEC 61400-1 |
| GUSTS.charnock | 0.011 | 27 | sourced | Charnock/Smith 1988, Kaimal, IEC 61400-1 |
| GUSTS.z | 10 | 27 | sourced | Charnock/Smith 1988, Kaimal, IEC 61400-1 |
| GUSTS.L | 8… | 27 | sourced | Charnock/Smith 1988, Kaimal, IEC 61400-1 |
| GUSTS.sigmaFloor | 0.35 | 27 | estimate | judgement from NOAA 9414290 gusts |
| GUSTS.vOverU | 0.8 | 27 | sourced | Charnock/Smith 1988, Kaimal, IEC 61400-1 |
| SIG_STEP | 0.05 | 39 | numerical |  |
| WAVES | 16 | 45 | numerical |  |

### src/environment/harmonics.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| P1 | 283.2 | 50 | sourced |  |

### src/environment/pierWakes.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| WAKE.S | 0.09 | 96 | sourced | Pope/Stern; Lyn 1995 via ERCOFTAC |
| WAKE.CD | 2.1 | 96 | sourced | Pope/Stern; Lyn 1995 via ERCOFTAC |
| WAKE.cf | 0.0025 | 96 | sourced | usual tidal-model value, flagged not measured |
| WAKE.St | 0.133 | 96 | sourced | Pope/Stern; Lyn 1995 via ERCOFTAC |
| WAKE.turb | 0.36 | 96 | estimate |  |
| WAKE.reach | 2000 | 96 | estimate | where the Bay's stream curves |
| WAKE.conv | 0.85 | 96 | sourced | Pope/Stern; Lyn 1995 via ERCOFTAC |

### src/environment/sea.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| G | 9.81 | 29 | standard |  |
| MLAT | 111320 | 30 | standard |  |
| MAX_FETCH | 20000 | 32 | estimate |  |
| WALL_CELL | 2 | 62 | numerical |  |
| WALL_TILE | 32 | 62 | numerical |  |
| FINE_PAD | 150 | 62 | numerical |  |
| INTO_BAY | 78 | 205 | unsourced | chart bearing |
| FLAT_SEA.hsW | 0 | 486 | numerical |  |
| FLAT_SEA.tpW | 1 | 486 | numerical |  |
| FLAT_SEA.fromW | 0 | 486 | numerical |  |
| FLAT_SEA.hsS | 0 | 486 | numerical |  |
| FLAT_SEA.tpS | 10 | 486 | numerical |  |
| FLAT_SEA.fromS | 270 | 486 | numerical |  |
| FLAT_SEA.steep | 0 | 486 | numerical |  |
| FLAT_SEA.white | 0 | 486 | numerical |  |
| FLAT_SEA.fetch | 0 | 486 | numerical |  |
| FOAM_DRIFT | 0.03 | 608 | sourced |  |

### src/environment/shadows.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| NO_SHADOW.k | 1 | 33 | numerical | geographic box / identity |
| NO_SHADOW.shift | 0 | 33 | numerical | geographic box / identity |
| BOAT_WAKE.mast | 9.5 | 51 | sourced | derived: rig dimensions |
| BOAT_WAKE.d0 | 5.9 | 51 | sourced | derived: rig dimensions |
| SHIP_AIR.container | 45 | 102 | unsourced | vessel air draft |
| SHIP_AIR.tanker | 30 | 102 | unsourced | vessel air draft |
| SHIP_AIR.ferry | 10 | 102 | unsourced | vessel air draft |
| SHIP_AIR.alcatraz | 9 | 102 | unsourced | vessel air draft |
| SHIP_AIR.tour | 10 | 102 | unsourced | vessel air draft |
| SHIP_AIR.coastguard | 4 | 102 | unsourced | vessel air draft |
| MLAT | 111320 | 131 | standard |  |
| CITYFRONT.south | 37.78 | 133 | numerical | geographic box / identity |
| CITYFRONT.north | 37.8125 | 133 | numerical | geographic box / identity |
| CITYFRONT.west | -122.49 | 133 | numerical | geographic box / identity |
| CITYFRONT.east | -122.40 | 133 | numerical | geographic box / identity |

### src/environment/shifts.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| WAVES | 24 | 49 | numerical |  |
| QUICKEST | 2*60 | 51 | design |  |

### src/environment/sun.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| SF.lat | 37.8075 | 9 | standard | GGYC position |
| SF.lon | -122.443 | 9 | standard | GGYC position |

### src/environment/tide.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| STEP | 6 | 34 | numerical |  |
| D_MLAT | 111320 | 161 | standard |  |
| BAY_BIN | 50 | 248 | numerical |  |
| BAY_CELL | 25 | 248 | numerical |  |

### src/environment/weather.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| NWS_VIS_CAP | 16093 | 285 | sourced |  |
| PIER17_CAP | 10000 | 285 | sourced |  |
| CELL_REACH | 1800 | 306 | numerical |  |

### src/environment/wind.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| OPEN_WATER | 1.25 | 52 | estimate | flagged; set to match the station |
| SLOT_WIDTH | 1300 | 102 | estimate |  |
| SLOT_BOOST | 0.2 | 102 | estimate |  |
| PUFF_LONG | 1.5 | 141 | unsourced |  |
| PUFF_WIDE | 0.75 | 141 | unsourced |  |
| FAR_CELL | 200 | 214 | numerical |  |

### src/sim/debrief.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| EP_GAP | 4 | 37 | design | coaching/debrief threshold |
| EP_MIN | 1 | 37 | design | coaching/debrief threshold |

### src/sim/obstruction.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| SUBSTANTIAL_TURN | 10 | 11 | sourced | Perry, Understanding the Racing Rules |
| HULL_SIDE | 1.8 | 13 | unsourced |  |

### src/sim/routing.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| AS_FORECAST.dFrom | 0 | 25 | numerical |  |
| AS_FORECAST.kMul | 1 | 25 | numerical |  |
| AS_FORECAST.early | 0 | 25 | numerical |  |
| MANOEUVRE_S | 8 | 77 | unsourced | tack/gybe loss |
| DT | 10 | 78 | numerical |  |

### src/sim/signals.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| CANCEL_KT | 23 | 33 | owner |  |
| X_FLAG_MAX | 240 | 76 | sourced | RRS 29.1: four minutes |

### src/sim/traffic.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| VESSEL.len | 300 | 20 | unsourced | vessel particulars |
| VESSEL.beam | 42 | 20 | unsourced | vessel particulars |
| VESSEL.kt | 12 | 20 | unsourced | vessel particulars |
| VESSEL.wakeH | 0.7 | 20 | unsourced | vessel particulars |
| VESSEL.len | 240 | 21 | unsourced | vessel particulars |
| VESSEL.beam | 42 | 21 | unsourced | vessel particulars |
| VESSEL.kt | 11 | 21 | unsourced | vessel particulars |
| VESSEL.wakeH | 0.6 | 21 | unsourced | vessel particulars |
| VESSEL.len | 50 | 22 | unsourced | vessel particulars |
| VESSEL.beam | 13 | 22 | unsourced | vessel particulars |
| VESSEL.kt | 17 | 22 | unsourced | vessel particulars |
| VESSEL.wakeH | 0.5 | 22 | unsourced | vessel particulars |
| VESSEL.len | 40 | 23 | unsourced | vessel particulars |
| VESSEL.beam | 11 | 23 | unsourced | vessel particulars |
| VESSEL.kt | 10 | 23 | unsourced | vessel particulars |
| VESSEL.wakeH | 0.35 | 23 | unsourced | vessel particulars |
| VESSEL.len | 45 | 24 | unsourced | vessel particulars |
| VESSEL.beam | 12 | 24 | unsourced | vessel particulars |
| VESSEL.kt | 11 | 24 | unsourced | vessel particulars |
| VESSEL.wakeH | 0.4 | 24 | unsourced | vessel particulars |
| VESSEL.len | 14 | 25 | unsourced | vessel particulars |
| VESSEL.beam | 4.3 | 25 | unsourced | vessel particulars |
| VESSEL.kt | 20 | 25 | unsourced | vessel particulars |
| VESSEL.wakeH | 0.3 | 25 | unsourced | vessel particulars |

### src/sim/world.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| DT | 1/60 | 50 | numerical |  |
| TWO_TURNS | 720 | 52 | standard |  |
| ONE_TURN | 360 | 60 | standard |  |
| HULL_HALF_BEAM | 0.85 | 62 | unsourced |  |
| SAME_INCIDENT | 8 | 73 | unsourced | RRS names the rule, not the number |
| COMPELLED_WINDOW | 3 | 76 | unsourced | RRS names the rule, not the number |
| SHOVE | 0.5 | 107 | unsourced |  |
| WALK | 0.45 | 109 | unsourced |  |
| CREW_TURN | 2 | 109 | unsourced |  |
| AI_CREW_SKILL.Red | 0.75 | 132 | design | fleet variety |
| AI_CREW_SKILL.Blue | 0.6 | 132 | design | fleet variety |
| AI_CREW_SKILL.Green | 0.5 | 132 | design | fleet variety |
| AI_CREW_SKILL.Black | 0.85 | 132 | design | fleet variety |
| AI_CREW_SKILL.Varnish | 0.45 | 132 | design | fleet variety |
| AI_EVERY | 3 | 160 | numerical |  |

### src/ai/ai.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| BOAT_HAIL_MARGIN | 5 | 28 | unsourced |  |
| BOAT_HAIL_LEAD | 9 | 30 | unsourced |  |
| FLAG_CAUTION.P | 0 | 34 | unsourced |  |
| FLAG_CAUTION.I | 1 | 34 | unsourced |  |
| FLAG_CAUTION.Z | 2 | 34 | unsourced |  |
| FLAG_CAUTION.U | 3 | 34 | unsourced |  |
| FLAG_CAUTION.black | 3.5 | 34 | unsourced |  |
| PENALTY_CLEAR | 25 | 37 | unsourced |  |
| MARK_CLEAR | 20 | 39 | unsourced |  |
| MARK_ROOM | 5 | 41 | unsourced | Rule 31 gives no distance |
| SHORE_TURN | 15 | 44 | unsourced |  |
| HALF_BEAM | 1.1 | 46 | unsourced |  |
| ISLAND_BERTH | 70 | 237 | unsourced |  |

### src/rules/pairs.ts

| Constant | Value | Line | Class | Note |
|---|---:|---:|---|---|
| CONTACT_GAP | 2.2 | 7 | unsourced | RRS names the rule, not the number |
| RULE15_GRACE | 3.5 | 9 | unsourced | RRS names the rule, not the number |
| JUST_TACKED | 2 | 11 | unsourced | RRS names the rule, not the number |
| INCIDENT_COOLDOWN | 6 | 13 | unsourced | RRS names the rule, not the number |
| RULE16_WINDOW | 3 | 16 | unsourced | RRS names the rule, not the number |
| RULE16_MIN_TURN | 12 | 18 | unsourced | RRS names the rule, not the number |
| HAIL_RESPONSE | 5 | 24 | unsourced | RRS names the rule, not the number |
| TACK_BEGUN | 15 | 33 | estimate | modelling threshold, flagged |
| BEGUN_TWA | 30 | 36 | unsourced | RRS names the rule, not the number |
| THROUGH_WIND | 15 | 42 | estimate | modelling threshold, flagged |
| ROOM_GAP | 3.5 | 95 | unsourced | RRS names the rule, not the number |
| REPLY_ROOM | 25 | 130 | unsourced | RRS names the rule, not the number |
