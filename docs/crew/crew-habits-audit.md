# Crew habits audit (21 Nov 2026, on 5de4d67c)

What the crew do when you sail your own boat at 4, 12 and 22 kt. r297 (mistakes under load) is left out.

## How it was sailed

`docs/crew/crew-habits-probe.ts.txt` is a vitest file; copy it into tests/ to run it. It uses the player's path:
- your boat in a World (`windKind: 'west'`, `sea: 'real'`, seed 11, cityfront), with the default crew of three;
- steered by the tiller command toward a set angle to the wind (46° in light air, 42° otherwise, 155° on the run);
- each turn called with the `turn` command, the same as the player's key: the call, the crew's "Ready", then the helm puts her over.

Each run is a 600 s beat, tacking every 90 s, then 400 s on a run, jibing every 100 s. That's 9 turns per wind.

The log records:
- every line move over 0.05;
- every change of job and pose;
- every toast;
- the coach as the page sees it: CoachMemory stepped twice a second (sim/coachRun.ts), with its headline, fresh messages and crew line.

The test helm wanders about ±5° to the wind (logged TWA 32–48° at 12 kt). A good human helm holds tighter, so the sheet-hunting counts below are upper bounds.

| Wind | Turns | Pose changes | Toasts | Mainsheet reversals | Jib sheet reversals | Traveler travel | Backstay reversals |
|---|---|---|---|---|---|---|---|
| 4 kt | 9 | 80 | 0 | 225 | 205 | 2.3 | 6 |
| 12 kt | 9 | 62 | 0 | 335 | 307 | 7.0 | 11 |
| 22 kt | 9 | 58 | 0 | 449 | 465 | 3.9 | 6 |

## What's right

- **Calls.** From your call to "Through the tack" took 2.8–3.3 s at every wind, the default crew's getting ready (crewPhys.ts prepTime). No call was late or dropped, and there was no "Not ready".
- **Lines by the guide.**
  - The outhaul and Cunningham match North's guide at each wind. At 4 kt the outhaul is 0.03 and the Cunningham 0.08 then off. At 12 kt the outhaul is on the mark. At 22 kt the outhaul, Cunningham and backstay are all on.
  - The vang upwind is 0 under 18 kt and 0.9 at 22 kt (North Sails, Nordic Folkboat Tuning Guide: "Never use the kickingstrap upwind in less than 18 knots").
  - After the bear-away the outhaul is eased in one trip, within 30 s.
- **Hiking.**
  - 4 kt upwind: the crew sit to leeward or on the bench (lee 41%, sit 54%).
  - 12 kt: they are in and out on the puffs (hike 55%, sit 41%).
  - 22 kt: they hike nearly throughout (95%).
- **The coach.** It is quiet through every turn. Fresh messages on screen were few: 4 at 4 kt, 0 at 12 kt, 5 at 22 kt.

## Rough edges

### S1. The rig note orders "Backstay on hard" while the crew hold it at 0.3 (fixed, 97d2c5c4)

12 kt, light tune. The headline, against the backstay as the helm set it:

```
 116.0 COACH Her rig was set for less wind than this: it costs her about 1.4% of her speed upwind. Backstay on hard.
 117.0 ctl backstay 0.00→0.17
 118.0 ctl ... backstay 0.17→0.46
 119.0 ctl ... backstay 0.46→0.29
 120.0 ctl ... backstay 0.29→0.00
 121.5 COACH Her rig was set for less wind than this: it costs her about 2.5% of her speed upwind. Backstay on hard.
```

- It was the headline 24 times at 12 kt.
- The cost it names is already worked out with the crew's best backstay for each rig (coach.ts tuneLoss: "a soft rig wants more backstay"), so no backstay wins it back. In the model's own terms, the order was wrong.
- The crew own the backstay (crewWork.ts ownerWith: the helm has it). The player read an order the crew then didn't follow.
- **Where:** src/boat/coach.ts:681.
- **Fix:** the note gives the cost only. For a rig set too tight it keeps "Sail a little lower".
- **Test:** tests/rigtune.test.ts, "the rig note tells no one to work the backstay".

### S2. The crew line on the coach's card changes every few seconds in a breeze (fixed, 1b493ab6)

22 kt upwind. Four versions of one line took turns, about 375 changes in 1000 s:

```
114 Crew: depowering: backstay, outhaul, Cunningham and vang on, easing the main to keep her on her feet (the front lifting is deliberate).
112 Crew: depowering: backstay, outhaul, Cunningham and vang on.
 75 Crew: depowering: backstay, outhaul, Cunningham and vang on, traveler down, easing the main to keep her on her feet (the front lifting is deliberate).
 70 Crew: depowering: backstay, outhaul, Cunningham and vang on, traveler down.
```

- "Traveler down" follows the traveler past 0.3, which it crosses with each puff. "Easing the main" follows the main's luff flow.
- **Where:** src/boat/coach.ts:600-605 (crewLine) and CoachMemory.step.
- **Fix:** the line is held HOLD_S (10 s), as the headline is. It changes at once only when what the crew are doing changes in kind: depowering, set for the wind, or downwind.
- **Test:** tests/coach-crewline.test.ts.
- The line is still long at 22 kt (two clauses and a parenthesis). Cutting its words is a copy decision for the owner, not taken here.

### M1. The jib sheet is re-trimmed every 2–3 s upwind

At 22 kt the jib sheet reversed 465 times in 600 s of beating. It follows the apparent wind second by second:

```
 309.8 fine awa=36.5 js=0.155 ms=0.340
 310.3 fine awa=41.6 js=0.180 ms=0.361
 310.8 fine awa=46.7 js=0.259 ms=0.421
 312.5 fine awa=39.3 js=0.246 ms=0.381
 314.8 fine awa=37.7 js=0.215 ms=0.341
```

- **Where:** src/boat/physics.ts:1659 (`wantJib = optimalSheet('jib', b.awaSlow)`, with awaSlow lagged by CREW_LAG only).
- **What the sources say:**
  - North Sails, "Steering Upwind": "With the jib trimmed for a close hauled course, use the lower jib telltales as a steering guide." The helm steers to a set jib.
  - North Sails, "Puff Response Upwind in Heavy Air": "Ideally the jib would be eased in concert with the main but in reality that can be hard to do – and even harder to retrim". The main and traveler carry the puff response.
  - Isler (Sail magazine; read only in a snippet) has the trimmer "play it continuously on an upwind leg", so the sources aren't unanimous.
  - Nothing found supports re-trimming every 2–3 s for ±5° of wander.
- **Size:** M. It needs a held jib setting upwind, with the helm steering to it, which changes how the crew and the AI sail. Partly an artifact of the test helm.

### M2. The helm takes the backstay on and off again within 4 s, puff by puff, at 12 kt

```
  36.0 jobs 0:backstay ...
  37.0 ctl backstay 0.09→0.26
  38.0 ctl backstay 0.26→0.35
  41.0 ctl backstay 0.35→0.18
  42.0 ctl backstay 0.18→0.00
```

This repeats at 116–125 s and 214–220 s.

- **Where:** src/boat/controls.ts:388 (the backstay is a depowering step, `st(0.1, 0.75)` of `depower`, which follows heel puff by puff). The backstay has no trip, so nothing holds it (controls.ts:514).
- **What the sources say:**
  - North Sails' Nordic Folkboat Tuning Guide treats the backstay as a setting for the conditions: "pull the backstay until the rudder feels light again"; marks "every 20 cm, to facilitate finding the right trim after mark roundings".
  - Sailing World ("A Prescription for Better Upwind Speed"; read only in a snippet) describes tensioning it in the puffs on boats with a tensioner.
  - So working it in the puffs is a real technique, but on and off within 4 s isn't what the Folkboat guide describes.
- **Size:** M. It wants the backstay to follow the breeze over a gust-lull cycle (about a minute), not each puff. That is a physics and crew-model change and needs a review.

### M3. On a run at 12 kt both crew sit to leeward

They sat to leeward 94% of the run (TWA ~155°, heel 0–1°):

```
 630.0 pose 0:helm 1:lee 2:piano
 645.0 pose 0:helm 1:lee 2:lee
```

- **Where:** src/boat/crewPhys.ts:357-358 (`crewBestHeel`: 1° past 120° TWA) and :524 (downwind, `want = clamp(needArm, …)`). With little heeling moment on a run, the 1° target puts them to leeward.
- **What the sources say:** North Sails' "J/105 Downwind Tips and Tricks" (a spinnaker boat, not a Folkboat): "In all but very light wind, keep the boat flat (or even slightly heeled to weather)", with the crew to leeward only "in the light spots". No Folkboat source was found.
- **Size:** M. It needs a downwind heel target by wind (to leeward only in light air) and a source for the Folkboat.

### M4. On a run at 22 kt the crew hike with the boat upright

They hiked 92% of the run, at heel −3° to +5°:

```
 621.0 state twa=155 v=6.16kt heel=-3
 625.0 state twa=152 v=6.31kt heel=1
```

- The model's need is right as far as it goes: the 1° target and the main eased out make a heeling moment.
- Legs over the rail on a run is not what the found sources describe. The J/105 tips put the heavy-air crew aft ("The crew slides aft … to keep the bow from digging in"). No Folkboat source was found.
- **Where:** src/boat/crewPhys.ts:524, and the pose rule at :629 (hike beyond sitArm + 0.04).
- **Size:** M. Sitting to windward and aft, not hiking, needs a downwind case in placement.

### M5. The vang at 0.7 on a run in 4 kt

```
 644.0 ctl vang 0.07→0.25
 645.0 ctl vang 0.25→0.50
 646.0 ctl vang 0.50→0.71
```

- The crew line says "the vang holding the boom down".
- North Sails' Nordic Folkboat Tuning Guide: "Downwind the kickingstrap is trimmed so that the top batten is parallel to the boom – on all sailing angles and in all conditions." In 4 kt the leech needs little vang for that.
- Whether 0.7 is what gives a parallel top batten in this model's leech (controls.ts twist) wasn't checked.
- **Size:** M. Check the twist against the guide's rule first; it may be right.

## Not found

- Nothing on the trim coach that is wrong for the crew at 4 kt.
- No wandering outhaul or Cunningham at the three winds (the guide-band work, b5993aaa, holds).
- No turn whose call came late, or calls that came too often.
- r297 doesn't show in these runs: no crew mistakes appeared at 22 kt.

## Sources

The researcher read these through a summarizing fetch. Sailing World, Quantum and the Sail magazine pages were blocked and seen only in search snippets.

- North Sails, Nordic Folkboat Tuning Guide (aluminum masts): https://northsails.com/sailing/en/resources/nordic-folkboat-tuning-guide
- North Sails, "Steering Upwind": https://northsails.com/sailing/en/2016/09/steering-upwind
- North Sails, "Puff Response Upwind in Heavy Air": https://www.northsails.com/blogs/north-sails-blog/puff-response-upwind-in-heavy-air
- North U / Gladstone, "Puff Response Upwind": https://northsails.com/sailing/en/2018/11/puff-response-upwind-northu-bill-gladstone
- North Sails, "J/105 Downwind Tips and Tricks": https://www.northsails.com/blogs/north-sails-blog/j-105-downwind-tips-tricks
- Sailing World, "A Prescription for Better Upwind Speed" (snippet only): https://www.sailingworld.com/?p=69412
