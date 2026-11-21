# Crew audit, 21 Nov 2026 (main at v215, 5de4d67c)

Crew Figures, for the Coordinator: every rough edge in how the crew are drawn and move, watched through whole races and
cruises from both sides on both tacks. The arms through bodies in a tack are r010's (built Tue 24 Nov) and are left out
except where they show here.

## How it was watched

A harness (not in the suite: `scripts/check/crewaudit/audit.ts`, run as its header says) drew every figure of the watched boats as the game
does (`syncCrew`) and checked it every 0.05 s:

- **Races:** three AI boats each, at 12 kt (22 min), 20 kt (14 min, hiking) and 4 kt (14 min, light air), covering the start, beats with tacks, roundings and runs with gybes. That is 150 boat-minutes, all on the AI boats.
- **Cruises:** the user's boat at 22 kt, beating and running with tacks and gybes (10 min); and from her slip at 10 kt, out and home, made fast (6 min).

It looked for nine kinds of fault:

- a limb through the boat;
- an arm through a body;
- two people in one place;
- elbows or knees bent the wrong way;
- a hand short of where the pose puts it;
- a foot in the air;
- a joint faster than a person moves it (5.5 m/s);
- the hips well off the physics' place for the person.

For each kind it kept the worst moment and the first run lasting 3 s, as a replay. The stills are those replays drawn in
the crew lab (`scripts/check/crewlab`), as they happened and mirrored onto the other tack, from both sides. They are in
`docs/crew/audit/`, named `<item>_<tack>_from-<side>.jpg`.

Sizes: **S** is under 1 h with its test; **M** is 2–4 h.

## What's clean

- **Limbs through the boat:** one run in 150 boat-minutes, a thigh 4 cm into the bench's edge for 0.1 s. The sprint's work holds.
- **Elbows forward of the shoulder-to-wrist line:** one run of 0.1 s.
- **Nobody stands on the rail** (r010's other half).
- **The start, the roundings and the gybes add nothing** beyond the items below.

## Rough edges, largest first

### 1. Two crew sitting in line on one bench: the aft one's knees go into the forward one's back (M)

`two-crew-in-line_*.jpg`.

- **Where seen:** light and moderate air, both crew sat on the same side, in the races at 4 and 12 kt and at the slip. One run lasts 466 s.
- **Cause:** the pair are spaced 0.48 m apart along the bench (`SEP`, `src/render/crew.ts:320`, applied at `:1783`). Both face forward, so the aft one's 0.43 m thighs reach the forward one's back.
- **At the slip:** the physics has both in the middle (x −0.10), where the figures are drawn on the bench at −0.47.
- **Fix:** sat on a bench they face across the cockpit, knees inboard, as people sit in a Folkboat's cockpit; or they sit farther apart.
- **Size:** M (the seated pose's yaw on the benches; `crewPose`, `src/render/crew.ts:753`).

### 2. The helm drawn sat on the deck's edge while the physics hikes them out (M, needs a ruling)

`helm-hike-short_*.jpg`.

- **The helm:** at 12 kt in the races and at 22 kt, the physics has the helm hiking at x 1.13. They're drawn sat at 0.66, on the side deck inside the toe rail. Runs last up to 92 s.
- **The crew hikers:** the same holds, smaller. The physics has them at 1.28–1.32, drawn at 0.97–0.99 (runs up to 12 s).
- **Cause:** `helmPose` caps the hips at the deck's edge (`src/render/crew.ts:955`, `e - 0.04`). The crew's hiking pose holds them at the edge likewise.
- **Ruling needed:** draw the hips out over the rail where the physics puts the weight, or bring the physics' hiking arm in to the drawn one. That is a physics question, since it changes the righting moment.

### 3. The helm crossing trails the physics by about a second, crouched on the after deck (M)

`helm-crossing-lag_*.jpg`.

- **What it looks like:** in every tack, and whenever she comes through head to wind before a start, the helm is drawn crouched on the after deck. A foot hangs over the side while the physics already has them sitting on the new side, up to 1 m away.
- **Duration:** about 1 s each time.
- **Cause:** `helmCrossing` (`src/render/crew.ts:1033`) follows the figure's own walking pace (`moving`, `:669`), which falls behind the physics' crossing.
- **Fix:** the crossing paced to the physics. (The stills also show the hands off the tiller, but the harness drew a fixed tiller: see item 8.)
- **Overlap with r010:** this sits beside r010's helm item, the stick hand chosen by the nearer shoulder, and could go in the same PR.

### 4. After a tack, a crew member stands upright in the cockpit while the physics has them hiking (M)

`crew-upright-after-tack_*.jpg`.

- **What it looks like:** the forward hand waits in the middle for 1.5–2 s after the main hand has gone across, standing upright with their hands by their sides. Meanwhile the physics already has them out on the new side at full hike. At 12 kt in the race the gap was 1.8 m.
- **Cause:** the crossing order kept between the two (`src/render/crew.ts:1780–1795`, by `slotOf`). The forward one doesn't set off until the other is past.
- **Fix:** they pass each other, one forward of the other, as crews do.

### 5. By the cabin's end: the knees folded back for a moment (M)

`lee-climb-midair_*.jpg`.

- **What it looks like:** turning about on the side deck by the cabin's after end with a foot planted, as the forward hand goes back to the leeward bench (the `lee` pose), a knee bends backward. For 0.1–0.25 s the hips are high and the feet look off the deck: 20 runs in one race at 20 kt, up to 0.35 m behind the line.
- **Knee speed:** the knees snap round at up to 15–17 m/s (56 runs at 20 kt), which reads as a flicker.
- **Cause (confirmed):** `clearLegs` (`src/render/crew.ts:1374`, the v210 sprint's). A knee into the cabin's end is tried in five other ways with the bend's memory cleared (`:1408–1412`). The one that goes least into the boat is taken in a single frame, even when it's bent backward. In the 20 kt replay that was 0.31 m behind the leg, across in a frame (38 m/s).
- **Why it isn't S:** refusing the backward ways (tried) fixes this replay on both tacks, but four of the sprint's replay tests then fail. They are the side deck at 8 kt, the cabin's edge at 20 kt twice, and the foredeck at 8 kt. Each was cleared only by a knee 7–38 cm backward, so the sprint traded a shin through the cabin for a backward knee.
- **Fix:** the foot moved, not the knee reversed. When a leg can't clear the cabin's end with its knee the right way, the foot steps (or the hip comes off it) until it can.
- **Size:** M. Its replay is kept for the test (`scripts/check/crewaudit/replays/lee-climb-20kt.json`: the 20 kt race, Red, 690.5 to 697.6 s, the knee back at 696.42 s; tests/helpers/crewReplay format).

### 6. Sat at the companionway, hands short of the line (M)

`lee-at-companionway_*.jpg`.

- **What it looks like:** in the `lee` pose with the physics' place just aft of the cabin, the figure is drawn sat over the companionway at the cabin's after end. Their legs are over the cabin top and their hands hang 0.6–0.7 m short of their line.
- **Duration:** about 1 s at a time, 40 runs in the 12 kt race.
- **Cause:** the cabin-end seat (`onCabinSide` and `DECK_FWD`, `src/render/crew.ts:796–801`) used for `lee` too.
- **Fix:** to leeward at the cabin's end, the seat on the leeward bench.

### 7. The main hand sitting out: an arm across their own chest (S–M)

`hiker-arm-across-chest_*.jpg`.

- **What it looks like:** hiking with the mainsheet, the main hand's arm nearer the boat reaches across their own chest toward the crew member beside them, its forearm through their torso. This happens outside tacks: 111 runs, up to 9 s, in the races at 4 and 12 kt.
- **Cause:** not yet found. `hikeHold` (`src/render/crew.ts:1138`) already gives each line to the hand on its side (`sideHand`, `:1058`). This is the main hand hiking with no line in hand, where the hands go elsewhere.

### 8. (Withdrawn) The helm's free arm folded into their side

`helm-arm-folded_*.jpg`.

The harness drew the helm against a fixed tiller: like the soak before it, it passes `syncCrew` no tiller, so the tiller is
the default `V(0, 0.8, 2.6)` (`src/render/crew.ts`, in `syncCrew`). In the game the tiller's real place is passed
(`boatMesh.ts`, `tillerJointAt`). The helm's hands, here and below, aren't confirmed until the harness records the tiller.

### 9. Working the cabin-top lines, drawn 0.3 m forward of their weight (S once ruled)

`lee-forward-of-weight_*.jpg`.

- **What it looks like:** in the `lee` pose while working the lines on the cabin's after face, the figure stands at the cabin's face, 0.3 m forward of where the physics has the weight. Runs last up to 64 s, 530 s in all.
- **Is it wrong?** The picture itself looks right: reaching the lines, you stand at them. What's off is the 0.3 m between the drawn figure and the physics' weight.
- **Ruling needed:** a ruling on which is right. The physics' place for the job (`crewPhys.ts` stationFor) or the figure's.

## Measured but not seen as a fault

- **Feet in the air (sat, 0.3–0.4 m):** in the stills the feet are on the benches. The measure reads the sole under a foot resting on a bench's edge.
- **Forearms into their own thighs, hands resting on the knees (up to 8 cm):** not visible at any game distance.
- **Two crew side by side on the windward deck touching at the shoulders:** reads as people sat close.

## r010, where it shows

Arms through bodies in a tack appear in every race at every wind, as the r010 check found. That fix is built Tue 24 Nov.
