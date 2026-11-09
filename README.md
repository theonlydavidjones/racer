# Folkboat Racing Sim

A Folkboat racing simulator for learning starting tactics, right of way under the Racing Rules of Sailing, and racing on San Francisco Bay.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # rules + simulation tests
npm run build      # static site in dist/ (relative paths, host anywhere)
npm run data:polar # re-pull Folkboat ORC certificates (behind a proxy: NODE_USE_ENV_PROXY=1)
npm run build:artifact  # single-page build for the claude.ai artifact → artifact/folkboat-racing-sim.html
```

**Playing it:** the claude.ai artifact link is the playable version. It's built for desktop (keyboard plus trackpad or mouse); phone layout is on hold. It's rebuilt with `npm run build:artifact` and republished after changes; three.js loads from jsDelivr, pinned to the version in package.json.

The original single-file prototype is kept, unchanged, at `reference/folkboat-sim.html`.

## Controls (desktop)

Every key can be changed: Setup → **Keyboard settings**, or **K** in the game. Your keys are saved in the browser.

- **Tiller.** Click the water in cockpit or chase view (or press **T** in any view) to take the tiller with the trackpad or mouse; **Esc** lets go. Moving your finger left to right pushes the tiller handle from port to starboard, which turns the boat to port, as on a real boat; right to left turns her to starboard. The tiller stays where you leave it, like a real one. **C** centres it. You can also drag the tiller bar at the bottom, or scroll sideways on the trackpad. **A**/**D** steer while held (port/starboard). There are no tack or gybe buttons: you put the helm over and hold it until she's round.
- **Views.** **1** cockpit, **2** chase, **3** overhead, **V** cycles. The cockpit eye is near the stern, so you see most of the boat.
- **Look around.** Arrow keys (or Q/E/R/F) turn your head; **W** looks ahead again. Looking never steers.
- **Overhead.** **N** switches between north up, bow up and wind up (saved). Scroll or **+**/**−** to zoom, drag to move the map, **B** (or the "Back to boat" chip) recentres on your boat.
- **Sails.** **S** luffs (hold), **O** whisker pole, Z/X and , / . work the sheets when you trim.
- **Other.** **H** hail, **M** course view, **L** message log, **P** pause.
- **Messages.** Notices stay up longer than before, the last few stay in the Messages panel at the right, and **All** (or **L**) opens the whole session's log, including incident explanations.

## Modes

- **Full race:** the start sequence, the course and the fleet.
- **Start practice:** see below.
- **Just sail:** open water, no fleet, no clock. Practise steering with the tiller, trimming, tacking, gybing and poling out. The HUD shows the polar target speed for your wind angle and how close you are to it.

## Layout

```
src/
  core/         math.ts (units, vectors, angles), rng.ts (seeded PRNG)
  geo/          geo.ts (lat/lon → local metres), shore.ts (Cityfront shoreline, grounding, distance to shore)
  environment/  wind.ts (synthetic oscillating breeze), current.ts (presets, shore relief, wind felt on the water)
  boat/         boat.ts (Boat state, fleet), polar.ts (ORC-based polar), dynamics.ts (forces: drive, drag,
                windage, turning), physics.ts (per-step steering, tacking, speed, trim, heel),
                data/nordic-folkboat-orc.json (written by scripts/fetch-orc-polar.mjs)
  rules/        pure RRS engine: rightOfWay.ts, pairs.ts (zone tracking, Rule 15 grace, incidents),
                geometry.ts (overlap, hull gap, CPA), explain.ts (rule text, explanations, banner text)
  ai/           ai.ts (pre-start holding and approach, beating, laylines, marks, shore, rules-based avoidance)
  courses/      data/*.json (one file per course), course.schema.json, course.ts (loader), registry.ts
  sim/          world.ts (World: fixed 60 Hz step, lines, marks, signals, incidents), events.ts
  replay/       recorder.ts (10 Hz snapshots), replayView.ts (overhead wind-up incident replay)
  render/       three.js scene, boat meshes, landscape, floating labels
  ui/           HUD (pods, dial, map, situation banner, line aid), toasts, horn, 2D drawing helpers
  main.ts       wiring: input, setup screen, incident and results panels, the frame loop
scripts/
  fetch-orc-polar.mjs  pulls current ORC certificates for the class and writes the averaged polar
tests/
  diagram.ts    helpers for writing tests like rulebook diagrams
  boat.test.ts  polar vs ORC data, acceleration, slowing, turning, tack loss, wing-on-wing
  rules.test.ts classic rules scenarios
  sim.test.ts   course loading, reproducibility, OCS through the real line logic, AI completes both courses
```

### How the pieces fit

- **World** (`sim/world.ts`) owns all race state and advances it with `step(1/60)`. It never touches the DOM or audio; it emits events (`toast`, `horn`, `incident`, `finished`) that `main.ts` turns into UI.
- **Fixed timestep.** `main.ts` accumulates wall-clock time × sim speed and calls `step` in whole 1/60 s steps. Rendering runs at the display rate. With the same seed and inputs a race replays identically (there's a test for this). All sim randomness comes from `World.rng`; `Math.random` is used only for scenery.
- **Rules engine** (`rules/`) is pure: it gets boats (only the fields it needs), a context (race time, wind, marks) and a per-pair record, and returns who keeps clear, under which rule, and any incident. The pair record is the engine's memory (who was inside at the zone, who just gained right of way) and is passed in explicitly.
- **Courses are data.** Every file in `src/courses/data/` shows up in the course picker. Marks have lat/lon (or an offset from the line centre), legs give the rounding side and `round` or `pass`, the start line is either two fixed ends or a centre, bearing and length, and `obstructions` marks the line as an obstruction once racing. See `course.schema.json`.

### Boat model

- **Polar.** Averaged from four current ORC certificates for Nordic Folkboats (NED 737, NED 923, EST F51, EST F39). In 12 kt: 4.7 kt close-hauled at 40.7°, 5.9 kt on a beam reach. Below the beat angle the curve is shaped so that the ORC beat angle really is the best VMG angle; nothing sails below 25°.
- **No spinnaker.** The certificates assume a 24 m² spinnaker; Folkboats race without one. Jib-only downwind speeds are derived from the certificates' own dead-run data: drive ∝ sail area × apparent wind², with main + poled-out jib (26 m²) instead of main + spinnaker (43 m²). Result: 85% of spinnaker speed in light air, 93% near hull speed; 4.3 kt dead downwind in 12 kt. The spinnaker version is still available (`new Polar(data, { spinnaker: true })`).
- **Speed.** Forces, not a fixed lag: drive is set so the boat settles at its polar speed; hull drag comes from the certificate's wetted surface plus wave drag rising toward hull speed; flogging sails and rig windage slow the boat when it luffs or points too high. Calibration (12 kt): 1 kt → 90% speed in ~12 s; luffing halves speed in ~13 s, then the boat stops and loses steerage; shooting head to wind carries ~3.5 lengths; a tack takes ~7 s, slows to ~58% and costs ~0.9 lengths. `tests/boat.test.ts` pins these ranges. All tuning constants are in `HANDLING` in `src/boat/dynamics.ts`.
- **Downwind: wing-on-wing.** The polar has three sail plans: `jib` (sheeted normally, on the main's side: blanketed by the main when deep), `wing` (poled out to windward with the whisker pole: only fills within ~15–20° of dead downwind, aback on a reach) and `main` (jib not drawing while the crew handles the pole). Each plan's speed comes from the sail area actually drawing, using the same dead-run drag model. In 12 kt dead downwind: 3.95 kt normal, 4.26 kt wing-on-wing; poling out pays from ~153° TWA; best downwind VMG ~168°. The crew takes 8 s to set the pole, 5 s to stow it, and gybes it end-for-end (8 s) when you gybe. Use **Pole** or **O**. The HUD suggests the pole when you run deep without it and warns when it's left out on a reach. AI boats pole out when running deep and stow before rounding marks.
- **Build.** Your boat is fiberglass with an aluminium mast and boom; the AI fleet is wooden. Class rules give both the same minimum weight and they race on equal terms, so build changes looks only (`build` in `FLEET`, `src/boat/boat.ts`).
- **Easing sails to slow down** works upwind and reaching (the sails flog). From a broad reach to a run, eased sails still fill against the shrouds, so it barely slows you: head up first.
- **Turning.** Turn rate = speed / turning radius (9 m), up to 22°/s, down to 4°/s when nearly stopped. Turning bleeds speed.
- **Uses of the polar.** AI close-hauled courses, the dial's no-go zone and the laylines use the polar's beat angle (it changes with wind speed) instead of a fixed 42°. The line aid's "time to line" and the AI's start approach assume you sheet in now and accelerate from your current speed, and the AI allows for coasting when it eases sails.

### Start practice

Setup → Mode → **Start practice**. You begin one minute before the gun, somewhere below the line. Fifteen seconds after the gun the race pauses for a debrief:

- where you were at the gun (distance from the line, speed as a % of full close-hauled speed, position along the line), when you crossed and your place in the order across the line;
- which end was favored and by how much (in metres upwind);
- a grade (great, good, late, slow, over early) with specific tips (how many seconds to turn earlier, when to sheet in, what the current was doing);
- an overhead replay of the last 45 s, with every boat's position at the gun marked.

**Same start again** replays the identical setup (same seed: same boats, wind and positions). **New start** draws a new one; **Keep racing** carries on with the race. The debrief logic is `src/sim/startDebrief.ts`.

### Rules

Implemented: 10, 11, 12, 13, 15, 16.1, 17, 18.2(b), 20, 22.1, 22.2, plus a right-of-way boat forced to swerve (14).

- **16.1:** a right-of-way boat that turned more than 12° toward the other boat in the 3 s before an incident didn't give her room to keep clear, and is the one penalized. Slow, steady course changes are fine; turning away is fine.
- **17:** if a boat clear astern gets an overlap to leeward within two lengths, she may not sail above her proper course while that overlap lasts (after the start signal; there's no proper course before it). "Proper course" is approximated as straight at the next mark if she can lay it, close-hauled if not, and no deeper than the best downwind angle. The situation banner says when Rule 17 restricts you or the other boat.
- **20 and hails:** close-hauled near the shore with a boat on the same tack to windward stopping you tacking, you may hail "Room to tack!" (**Hail** / **H**); the hailed boat must start to tack within 5 s. AI boats pinned against the Cityfront hail you, a banner counts down, and ignoring it is a foul. On starboard with a port boat converging, Hail calls "Starboard!" and she ducks earlier. Hail when you're not entitled to and it explains why not. (The "You tack" reply isn't modelled.)
- **Penalties.** A Part 2 foul (Rules 10–22) costs a two-turns penalty (RRS 44.1): two full turns, each with a tack and a gybe, in the same direction. Turns only count in one direction: wiggling back and forth doesn't finish it. Sailing instructions sometimes reduce this to one turn, so Setup has a **Penalty** setting (two turns, the rulebook default, or one). Touching a mark (Rule 31) is a one-turn penalty in the rules, but mark touches aren't modelled yet. Being on the course side at the start under SI B1.1 is still two turns.
- Incidents before the start signal now count. (In the prototype, a timer started at −1 s, so collisions before the gun were never judged.)

### Sails and trim

- **Trim physics** (`src/boat/trim.ts`). Each sail has a sheet angle. Its angle of attack is the apparent wind angle minus that; each sail drives best at one angle of attack (main 22°, jib 18°). Ease past it and the sail luffs (drive falls fast: gone 12° past); trim past it and it stalls (drive falls slowly, to about half). From a broad reach to a run the sails just want easing right out. Trim efficiency scales the target speed (by its square root, since drive ∝ speed²). Pointing too high luffs the jib even with the sheet hard in.
- **Who trims.** By default the crew trims toward the best angle at a human pace, reacting to the apparent wind with a 0.8 s lag, so quick course changes show on the telltales before they catch up. Switch **Trim** to "you" to work the sheets yourself: Trim/Ease buttons, or Z/X (main) and , / . (jib). The trim panel shows Good / Luffing / Stalled for each sail and what to do about it.
- **Telltales** on your boat: three pairs on the jib luff (red on the port side of the sail, green on starboard, as on real sails), and one on the main leech at each batten. Windward ones lift and dance when you're luffing; leeward ones droop when stalled; leech telltales curl behind the main when it's over-trimmed; downwind they hang. Your sails are slightly see-through so the leeward telltales show through, as on real Dacron.
- **Sail shape.** Live camber, twist that grows as the sheet is eased, a luff bubble when under-trimmed, flogging when let go. The main has three battens and a long, low rectangular window parallel to the boom (1.8 m × 0.35 m, 0.3 m above it).

### Seeing the wind, the course and the laylines

- **Cassette-tape telltales.** Both upper shrouds carry a length of old cassette tape about 1.4 m above the deck, where you can see it from the cockpit. Each streams the way the apparent wind blows, droops when it's light (under ~6 kt apparent) and flutters.
- **Free look.** In cockpit and chase view, the arrow keys (or Q/E and R/F) turn your head. Looking never steers. W or the "Look ahead" chip faces forward again.
- **Course view.** "View the course" on the setup screen, or **Course** / **M** during the race (the race keeps running). It opens on one leg (your current one) with the others faded; step through with ◀ ▶, tap a leg in the list, or show the whole course. Drag to move, scroll or pinch to zoom. It shows every leg in order with numbers, the way round each rounding mark (green clockwise arc = leave to starboard, red counter-clockwise = leave to port), the side to pass each pass mark, the start/finish line, zones, laylines, wind, current and boats, plus a plain-language list of the legs with your current one highlighted.
- **Laylines.** Dashed lines on the water and on both maps for your next rounding mark: green = starboard-tack layline, red = port-tack. On beats they use the polar's beat angle; on runs, the best downwind angle (wing-on-wing). Both allow for the current at the mark. Before your start they point at the first mark. Turned off with the training aids.

### Changes from the prototype

The port keeps the prototype's behaviour. These differences are deliberate:

- Three.js r128 → r187. Colour management is turned off and light intensities are scaled by π so the scene looks the same as before.
- Sub-steps are now exactly 1/60 s (they used to be "up to 1/60 s"), and replay snapshots are exactly every 0.1 s.
- AI decisions and boat placement use a seeded RNG instead of `Math.random`.
- Added `[hidden]{display:none}` and `box-sizing` rules. The prototype relied on its host page for these; standalone, the hidden overlays covered the screen.

## Known gaps

- Acceleration, slowing and turning are calibrated from physics and sailing judgement, not measured on a real Folkboat. If your boat feels different, the constants in `HANDLING` are the place to adjust.
- Above 24 kt the polar is held flat (no depowering model yet). No sail trim beyond automatic.
- AI starts: on the Seaweed Soup line, median 5–11 s after the gun in slack and ebb, ~25 s in flood, almost never over early. On the short training line they're slower (crowding). The AI keeps clear, takes penalties in clear water, won't tack when too slow to make it, and doesn't sail on a broad reach expecting to slow down by easing sails.
- Wind is a synthetic oscillation. Current is uniform, with a simple shore-relief factor.
- The shoreline is hand-traced.
- Rules not modelled yet: 14 (beyond the swerve check), 16.2, 18.3, 19 (room at obstructions other than via the Rule 20 hail), the "You tack" reply. Mark-room is only modelled for same-tack or downwind approaches. These appear as `todo` entries in `tests/rules.test.ts`.
- Fouls between two AI boats are penalized but not explained.
