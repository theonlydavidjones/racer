# Touching by the hulls' own outlines

The Rules session's design note, 14 Nov 2026, approved by the Coordinator and built on branch rules-hull. It's internal
geometry: no rule reads differently to a sailor. "As built", at the end, says where the build differs from the plan.

## The problem

`hullGap` (src/rules/geometry.ts) measures between the two hulls' **centerline segments**, bow point to stern point. Every
rules distance is set in that measure, with the beam folded into the threshold:

- `CONTACT_GAP` = 2.2 m is "touching": exact for two boats side by side at their widest (2 × 1.10 m). But a Folkboat's
  half-beam runs from 0 at the stem to 1.10 m amidships and 0.655 m at the transom (render/hull.ts `halfBeam`, from the
  class's construction plan).
- So a bow into a stern, in line, "touches" with about 1.5 m of water between them, and a bow into a side touches with
  about 1.1 m. Deep Physics' contact impulse now separates the boats to `CONTACT_GAP`, so in line they bounce with that
  much water between them.

## The change

1. **The outline.** Her plan-view outline at the sheer, the widest she is above water: a Folkboat's topsides flare, so
   that's where hulls meet. It's `halfBeam(u)` along her length, both sides, about 30 points.
   - Moved from render/hull.ts (which imports three.js) into a pure module, `src/boat/hullPlan.ts`. Render and rules both
     import it, so it's one shape (Boat Detail owns it).
   - Heel narrows the plan view a little (cos 20° = 0.94). Left out at first; easy to add.
2. **`hullGap(A, B)`** becomes the distance between the two outlines, 0 when they overlap. Each outline is convex, a
   polygon, so it's a polygon-to-polygon distance.
   - Cost: a bounding-circle reject first (centers more than LOA + margin apart: the old segment test). Then the full test
     only for the few pairs within a length.
   - perf-pair will be run on it, against the 1.5% gate.
3. **`contactNormal(A, B)`** (rule 14's damage and Deep Physics' impulse) gives the nearest points of the two outlines,
   and the normal there.
4. **Every threshold** keeps its real-world meaning, now measured hull to hull. The table below shows each one.

## The thresholds

"Now" is in the centerline measure; "real" is what that is hull to hull, abeam at the widest (subtract 2.2 m) and bow to
stern in line (subtract 0 to 0.66 m). "Becomes" is the new constant, hull to hull, and why.

| Constant (file) | Now | Real now | Becomes | Why |
|---|---|---|---|---|
| `CONTACT_GAP` (rules/pairs.ts) | 2.2 | 0 abeam; 1.5 in line | **0.15** | Touching. A small tolerance for the step (a boat at 3 m/s moves 5 cm a step) and for booms and crew, which touch first (Cases 7, 49). |
| `KEEP_CLEAR_GAP` (pairs.ts) | 2.7 | 0.5 | **0.65** | Its own definition: half a meter more than touching. |
| `ROOM_GAP` (pairs.ts) | 3.5 | 1.3 | **1.3** | Room to pass between a boat and a mark or obstruction. Its comment's beam plus 1.3 m: Cases 35 and 88. |
| `OPEN_GAP` (ai/ai.ts) | 5.2 | 3.0 abeam | **3.0** | Its own comment: "at least 3 m of water between the hulls", now measured so. |
| Tangle "clear", lastFoulVs (sim/world.ts) | LOA | 5.4 abeam | **LOA** | "A length apart": the definition's own sense, between the hulls. |
| Tangle `parted` (world.ts) | max(g0, 2.2) + 1 | 1 m off touching | **max(g0, 0.15) + 1** | A meter wider than touching. |
| `ENGAGED` (world.ts) | 2 LOA | 13.1 abeam | **2 LOA** | "Within two lengths" of the boat she fouled. |
| `RULE17_RANGE` (pairs.ts) | 2 LOA | 13.1 abeam | **2 LOA** | Rule 17: "within two of her hull lengths". |
| `youTackPays` (world.ts) | 0.6 LOA | 2.4 abeam | **0.6 LOA** | Clear ahead by most of a length, hull to hull. |
| rule 19 `obstUnable` (pairs.ts) | `oi.d + hullGap − 1.1 < ROOM_GAP` | (the 1.1 is a half-beam folded in) | **`oi.d + hullGap < ROOM_GAP`** | The obstruction distance `oi.d` is to her side already. |
| 20.2(e) "avoided" (pairs.ts) | `g > ROOM_GAP` | 1.3 | unchanged | Already room. |
| `escapes()` minGap (boat/arcs.ts) | `≥ CONTACT_GAP` | | follows `CONTACT_GAP` | |

The ones that measure from the hull already (`markDist`, `gapTo` for marks, `clearAstern` and the overlap by bow and stern
points) don't change.

## What moves, and the checks

- In line, boats now touch when they really do. Side by side, nothing changes: 2.2 − 2.2 = 0 and 0.15.
- A bow into a side now touches about 1 m later than today, so there are fewer contacts and more near misses, as on the water.
- The tests set in the old measure need their numbers moved:
  - tests/diagram.ts helpers, which place boats "1 m apart" by center;
  - rule14.test's `meet`;
  - rules-tangle's NEAR and JUST;
  - approx.test's paired fouls (it may move the fleet's incident counts, which is the point).
- Before and after, the census of incidents per race over 48 seeds (approx.test's method). The change should come from
  contacts in line, not from anything else.
- A visual check: two boats bow to stern touching, from both sides, to see that the hulls meet.

## Open

- Booms and crew outboard (Cases 7 and 49 count them as contact). The 0.15 m tolerance covers crew's hands; a boom
  squared out on a run is a meter or more beyond the hull. That's a later addition: the boom as a segment from the
  gooseneck at the trim's angle.
- Heel: left out first (6%).

## As built

- **The outline**: 27 corners, stem to transom and back (rules/geometry.ts `OUTLINE`), from `halfBeam` in the new pure
  module src/boat/hullPlan.ts (render/hull.ts imports it and re-exports it, so the drawn deck line and the touching one
  are the same curve). The deck line is a hair hollow in its first 0.4 m (under a millimeter); the outline leaves that
  out, so it's convex.
- **The distance**: GJK (Gilbert, Johnson and Keerthi 1988), from the outlines' support points, for every pair within
  two lengths plus both half-breadths by the centerlines. It agrees with a brute-force corner-to-edge distance to a tenth
  of a millimeter over 3,000 pairs, overlaps included (tests/hull-contact.test.ts). Beyond that it isn't measured: the
  centerline gap less both half-breadths is under the true gap and over two lengths, more than any distance the rules
  judge by.
- **Cost**: about 1.7 µs a call measured, against 0.5 for the centerline segments. A full fleet asks about 21 times a
  step, under 2 of them within two lengths.
- **`hullContact(A, B)`**: the gap, the nearest point on each, and the normal from A toward B, for rule 14's damage and
  the contact physics.
- **Rule 19, corrected from the table above**: a shore's distance (`obstacle().d`) is from her center, not her side, so
  the room test keeps her half-beam: `oi.d − 1.1 + hullGap < ROOM_GAP`. A boat as the obstruction now gives her distance
  from the center too (her hull gap plus 1.1 m), as a shore does; before, it was a centerline gap, 1.1 m more.
- **Mark-room's "unable"** (`markUnable`) measures from the outside boat's centerline to the mark, so her half-beam
  comes off: the water between her hull and the mark, against the inside boat's beam and room, `gapTo − 1 − 1.1 < 2.2 +
  ROOM_GAP`. (Before, `gapTo − 1 < 3.5` left the inside boat 0.2 m in all.)
- **A squeeze still going on** (world.ts, for 43.1's exoneration) stays `ROOM_GAP` and closing. Its test's hand-made foul
  now also starts the pair's incident cooldown, as a foul the engine calls does.
- **Rule 19's room** includes the inside boat bearing away to pass the obstruction: the outside boat holding on (not
  moving away from it) while the water between them closes fails to give it (19.2(b)), as long as the inside boat moves
  off the obstruction at no more than half her speed (about 30° off its line, a modeling choice). Before, only the
  outside boat moving in faster than the inside boat moved out counted. Case 11 (3.4 m apart, center to center) comes
  out PL's 19.2(b) from 3 to 4 m. From 4.5 m PW touches PL with over 3 m of water still to S, more than room, so it's
  her 11 (tests/rules-cases-data.test.ts).

## Left for later (from the review)

- AI right-of-way boats forced to swerve by an AI boat aren't called (ai/ai.ts: only the user's boat's swerves are).
  The old early "contact" caught some of those near misses by accident; now a pass at 0.15–0.65 m between two AI boats
  goes uncalled.
- `KEEP_CLEAR_GAP` (0.65 m) is the margin rule 16.1's test asks of an escape; bow to side the old figure was about
  1.6 m of water. `ROOM_GAP` may be the better margin there.
- A shore's distance is center to shoreline, so `oi.d − 1.1` is the water at her side only with the shore abeam; bow
  on, it overstates it.
- Rule 21.2 applies from `penalty > 0` (rightOfWay.ts), before her turns begin; 21.2 says a boat *taking* a penalty.
- Booms, heel and the rudder, as above.
