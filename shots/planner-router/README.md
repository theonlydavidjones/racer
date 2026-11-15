# The planner question, for the owner (15 November 2026)

The owner's route: from just inside Horseshoe Bay's entrance to their point NE of Yellow Bluff, 25 Nov 2026 15:00,
westerly turned −20° (from 255°), 10 kt, on the ebb (tests/passage-hairpin).

1. **1-main-227min-54turns.png**: main before the planner fix. The plan loops off Yellow Bluff. The lee's shading
   still shows the 200 m blocks that #419 removes.
2. **2-v198-406+419-230min-63turns.png**: v198's code, #406 (the planner) and #419 (the lee without seams). It
   leaves Horseshoe Bay well, then loops ~100 m off Yellow Bluff in its lee, the ebb setting her back on: 63 jibes,
   ~10 m a cycle. Held apart in the tests.
3. **3-WIP-isochrone-router-64min-6turns.png**: work in progress, the isochrone router (branch isochrone-router), on
   the same day and code. It cheats the ebb up the Marin shore, where the stream is 0.1–0.4 kt against 2–3 kt foul across
   the open water, accepting the lee's lighter air there, then crosses to the mark on one long board: 64 min, 6 jibes.
   (An earlier hand sketch here took her offshore into the breeze: it overlooked that foul tide, and is withdrawn.)

4. **4-isochrone-router-reviewed-65min-5turns.png**: the router after its physics review (branch isochrone-router). The
   lee is now read where she sails, not off 200 m blocks (the work-in-progress plan above was 64 min on paper but 78 by
   the exact wind along its own track; this one is 65 on paper and 65 by the exact wind), and the plan keeps 50 m off the
   shore. It works up the Marin shore past the mark's latitude in the weak stream there, then crosses on one board with
   the ebb's set allowed for: 65 min, 5 jibes.

Cyan is the plan, with its jibes circled. Orange dashes are the straight line. Pale water is under 85% of the breeze
(a snapshot at 15:00; the plan's wind changes over its hours). Made with a script from each tree's own planner and
wind, not the game's chart.
