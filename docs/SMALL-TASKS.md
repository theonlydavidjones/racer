# Small tasks for idle sessions

The owner (21 Nov 2026): "If anyone goes idle find small tasks for them to do in the meantime. There tons of cleanup and work to do all over the experience."

Each task is 1 to 3 hours and self-contained. None is one of the big items held for Tuesday 24 Nov, and none touches the parked work (turn drag, the collision changes, the slow-boat keep-clear) or auto-nav (paused).

## How to take one
1. Go to your session's section. Take the first task not already marked taken.
2. Check main first (`git log --grep rNNN`, and the code) so you do not redo shipped work.
3. Put its number (`r286`, `w031`) at the start of every commit, and message the Coordinator that you took it. The Coordinator marks it taken here.
4. A physics task starts with its data; cite it in a comment. Science is prime.
5. A reproducing test comes before each fix. No new buttons; no blocks of copy; US spelling.
6. If your section is empty, take from "UI & Copy" or "Deep Physics", which hold the most.

Numbers: `rNNN` rows are the owner's requests; `wNNN` rows are internal (the Roadmap artifact lists them, band Later).

## UI & Copy

- **r286: Remove "How to sail her" from Keys** (Polish, 1 h). The owner: "this whole section can go away." It is the block of copy under Keys.  
  Files: index.html:441-449; reword the comments at src/ui/sailBand.ts:179 and :301.
- **r026: Tiller, mainsheet and traveler keys follow the tack** (Feature, 3 h). The owner asked twice (15 and 20 Nov): the keys should match the on-screen direction. Add a Keys option (default off); swap only once she is through the tack, never mid-turn.  
  Files: src/ui/keys.ts:75-76.
- **w029: The "Retire to use her motor?" dialog: one short line** (Polish, 1 h). The text is a long RRS 42 citation block on a player screen. Cut to one line; move the citations behind a "Why?" disclosure.  
  Files: index.html:518 (motorAsk).
- **w030: Heading pod tooltip: one line** (Polish, 1 h). The tooltip is about 500 characters of color-coded explanation. Trim to one line and point to the Key.  
  Files: index.html:20.
- **w031: Next card and ensign tooltips: one line each** (Polish, 1 h). Two paragraph-length tooltips (about 400 characters). Cut each to one line.  
  Files: index.html:31 (nextCard), :128 (bEnsign).
- **w032: Crew placement hints: one style** (Polish, 1 h). The hints mix "stbd · heels her", "port side deck" and "port rail · holds her up". Pick one style across them.  
  Files: index.html:145.
- **w033: Key list: shorter labels for "Call the turn" and "Turn to starboard"** (Polish, 1 h). The turnHo label is a whole sentence in a one-line row; steerStbd has a two-clause label. Shorten both; move the detail to a hover.  
  Files: src/ui/keys.ts:17, :20.
- **w034: One wording for the navigator's tacks and jibes** (Polish, 1.5 h). The navigator readout shows "N TACKS/N JIBES" in capitals while the plan chart writes "tacks and jibes". One shared helper with a plural() function, one case.  
  Files: src/ui/hud.ts:715; src/ui/planChart.ts:180; src/ui/tacticsView.ts.
- **w035: "stbd" or "starboard", once** (Polish, 1.5 h). sideWord returns "stbd"/"port" while other screens spell out starboard. Find which strings reach the player and settle one form.  
  Files: src/ui/hud.ts:68; src/ui/crewWords.ts:12.
- **w036: The tactics view's "How it's measured": a short list** (Polish, 2 h). A roughly 2,000-character paragraph behind a disclosure. Split into one short bullet per cause.  
  Files: src/ui/tacticsView.ts:63.
- **w042: Tests for the trim notes and the lines helper** (Polish, 1.5 h). trimNotes.ts maps a setting onto 0 to 1 and has no test; lines.ts likewise.  
  Files: src/ui/trimNotes.ts; src/ui/lines.ts.

## Charts

- **r267: Chart lines: the route looks like the red port layline** (Polish, 2 h). The owner found the chart lines confusing. The key already lists the route and the track; still open: the orange route (PEN.dest) reads like the red port layline, and route and track both start at the boat. Mock-up to the owner first, then the change.  
  Files: src/ui/draw2d.ts:56 (PEN.dest), :109 (drawLaylines); src/ui/legend.ts:44-46.
- **w037: Chart-control rows: shorter, no duplicate label** (Polish, 1.5 h). Four inline blocks of 400-675 characters, and planField and chartField repeat "What the chart colors the water with". Dedupe and shorten. Check with r267 and the chart-menu work first.  
  Files: index.html:44, 48, 54, 59.

## Marinas

- **r282: Home tag and hint do not update until the chart closes** (Bug, 1.5 h). Not in ROADMAP or git; reproduce it first with a test. Start at the place names and the plan chart.  
  Files: src/ui/placeNames.ts:18; src/ui/planChart.ts:27.

## FTUE

- **r293: Boat editor: what is left of the owner's changes** (Polish, 2 h). Club and Skipper rows and "Last cleaned" still show, Change/Done should be arrows with sections collapsed, and a new boat has no Discard. Check what FTUE has built on claude/busy-bohr-fc1mya first.  
  Files: src/ui/boatPanel.ts:256, 269-277, 308.
- **w028: Lesson 11: show the puffs coming** (Feature, 3 h). The owner (15 Nov): the breeze lesson needs "more in-game guidance about when the puffs are coming." Mark the dark patch upwind and fade a short "Puff" cue. Timing comes from the sim's own puffs, never invented.  
  Files: src/sim/lessons.ts (~74-81, 288); src/render/drillGuides.ts; src/environment/wind.ts.  
  Data: The sim's own puff field (src/environment/wind.ts); no new data.
- **w040: Test the screen back-stack** (Polish, 1 h). Nav has subtle rules (going to a place already in the stack pops back to it; reset; backLabel). Add a test.  
  Files: src/ui/nav.ts.

## Crew Figures

- **r292: Zoom in on the boat in the boat editor** (Feature, 2 h). The owner: "let me zoom in on the boat in the boat editor." Wheel zoom within limits; reuse the wheel zoom and distance clamp in src/app/boatLesson.ts:4,15. No new buttons.  
  Files: src/ui/boatPanel.ts; src/app/boatLesson.ts.
- **w027: A tiller-angle needle in the sail band** (Polish, 2 h). The owner (15 Nov): "it might be nice to show the tiller angle." A picture, not words, in the empty slot: how far the tiller is over and where it is lashed. No new button or strip.  
  Files: src/ui/sailBand.ts:278; src/styles/07-band.css:20.

## Crew Model

- **w053: Anchor the crew's call timings** (Accuracy, 1.5 h). CALL_KEEP, TURN_SEEN, CUE_MAX, TURN_HOLD and CALL_WAIT_MAX are each "an estimate." Anchor each (World Sailing Case 54 timing, as HAIL_WAIT does) or rename them ESTIMATE_*.  
  Files: src/boat/calls.ts:30-42.  
  Data: World Sailing Case 54; the RRS hail timings.

## Skipper Model

- **w038: Tests for the logbook** (Polish, 1.5 h). record() (wins, podiums, average place, CXL filter), addLog's cap of 600 and dropLog have no tests. Mock localStorage.  
  Files: src/boat/logbook.ts.

## Rigging

- **r291: Teak options for the coaming and cabin sides** (Polish, 3 h). The owner (20 Nov): coaming and cabin sides in warm or silvered teak, like the deck. Add the same two choices to the boat panel. Later, after the sprint, so only when idle.  
  Files: src/ui/boatPanel.ts; src/render/boatMesh.ts, boatParts.ts, hull.ts.
- **w052: Cite the traveler swing and boom stop** (Accuracy, 2 h). TRAVELLER_SWING = 9.5 and BOOM_STOP = 70 point at a design note but not at the class rules or builder drawings. Cite those directly.  
  Files: src/boat/controls.ts:70, :78.  
  Data: Nordic Folkboat class rules and builder drawings (the researcher agent).

## Bay East

- **w044: Phantom land beside the Berkeley Pier deck** (Bug, 2 h). Two 50 m terrain cells read as land about 20 m either side of a 6.6 m deck, near (10308-10356, 5480-5530) and (10880-10930, 5730-5780). Only the deck should be solid. Write the "water beside the deck is water" test first.  
  Files: src/geo/shore.ts (onLand); src/geo/data/east-piers.json.  
  Data: OpenStreetMap pier geometry already in east-piers.json.

## Debrief

- **w039: Test the race-name replacements** (Polish, 1 h). raceDisplayName applies regex rules from JSON; a bad rule would silently show a wrong race name. Test the rules and the trim.  
  Files: src/club/raceNames.ts.
- **w041: Test the wind lesson's band edges** (Polish, 1 h). roseEdges(beat) gives the lesson's band boundaries. Test that they are strictly increasing for beat angles 35 to 50.  
  Files: src/render/windRose.ts:34.

## Deep Physics

- **w043: Motoring with the sails up: a test** (Accuracy, 2 h). The owner: "motoring speed should account for sails being up." The surge equation already takes the motor force, so the physics is probably right; the tests only cover sails down. Test motor alone against motor plus sails on a reach, close-hauled, and head to wind (flogging sails slow her).  
  Files: src/boat/physics.ts:599; tests/motor.test.ts:79; tests/outboard.test.ts.  
  Data: The sim's own Folkboat drive curve and src/boat/motor.ts thrust curve; hull speed from the class waterline length.
- **w045: Cite the heavy-rain threshold** (Accuracy, 1 h). MODERATE_SPLIT_MM = 4 sits "between light 2 and heavy 8 mm/h" with no source. Cite the NWS/AMS heavy-rain rate (about 7.6 mm/h, 0.3 in/h) or state 4 as a design choice.  
  Files: src/environment/rain.ts:36.  
  Data: NWS and AMS rain-rate classes.
- **w046: Source the puff aspect ratio** (Accuracy, 2 h). PUFF_LONG = 1.5 and PUFF_WIDE = 0.75 have no source. Cite gust-streak length to width observations, or mark them an estimate.  
  Files: src/environment/wind.ts:161.  
  Data: Published gust-structure observations (the researcher agent finds them).
- **w047: Derive the Gate's into-the-bay heading** (Accuracy, 1 h). INTO_BAY = 78 is a bare number. Derive it from the BRIDGE coordinates in the file, or cite the bearing on NOAA chart 18649.  
  Files: src/environment/sea.ts:206.  
  Data: The file's own BRIDGE coordinates; NOAA chart 18649.
- **w048: Cite the fetch limit** (Accuracy, 1.5 h). MAX_FETCH = 20000 is justified only as "the sea breeze itself runs out." Cite a fetch-limited growth source.  
  Files: src/environment/sea.ts:32.  
  Data: USACE Shore Protection Manual fetch-limited growth, or JONSWAP.
- **w049: Fit or cite the open-water wind factor** (Accuracy, 3 h). OPEN_WATER = 1.25 is called an estimate, tied to a 0.8 shore factor. Fit it against buoys (script it like fit-warm-days.mjs) or cite it.  
  Files: src/environment/wind.ts:52.  
  Data: NDBC buoys 46026 and 46237 against the shore stations.
- **w050: Explain or fix the weather cell reach** (Accuracy, 1 h). CELL_REACH = 1800 with 2.5 km cells does not read clearly (half-width would be 1.25 km). Explain it in a line or fix it.  
  Files: src/environment/weather.ts:309.
- **w051: Say why the grid spacings are what they are** (Accuracy, 1 h). FAR_CELL = 200 (wind) and BAY_BIN = 50, BAY_CELL = 25 (tide) have no stated reason. One line each, or tie them to the DEM resolution.  
  Files: src/environment/wind.ts:280; src/environment/tide.ts:284.  
  Data: The DEM resolution the files already use.

## Rules

_Nothing queued; take from another section._

## Not on this list, by design
- Held for Tue 24 Nov: SFBOFS step 2 (w009), the 3D fog (r285), the city front (r296), crew mistakes under load (r297), the racing onboarding and Help Center plans (r289, r290).
- Needs the owner or a mock-up first: r024, r030, r031, r263, r287 (after r272), the Tools tray.
- Already shipped (checked against main at db3807cf): the OSM attribution, Hoist tabs with sails down, the motor mounting time, the start drill's cue card and fleet, the navigator from the inset and the expanded chart, the jumpers' control, the destination pin.
