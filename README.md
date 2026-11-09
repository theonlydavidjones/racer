# Folkboat Racing Sim

A Folkboat racing simulator for learning starting tactics, right of way under the Racing Rules of Sailing, and racing on San Francisco Bay.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # rules + simulation tests
npm run build      # static site in dist/ (relative paths, host anywhere)
```

The original single-file prototype is kept, unchanged, at `reference/folkboat-sim.html`.

## Layout

```
src/
  core/         math.ts (units, vectors, angles), rng.ts (seeded PRNG)
  geo/          geo.ts (lat/lon → local metres), shore.ts (Cityfront shoreline, grounding, distance to shore)
  environment/  wind.ts (synthetic oscillating breeze), current.ts (presets, shore relief, wind felt on the water)
  boat/         boat.ts (Boat state, fleet), polar.ts (target speeds), physics.ts (steering, tacking, speed, trim, heel)
  rules/        pure RRS engine: rightOfWay.ts, pairs.ts (zone tracking, Rule 15 grace, incidents),
                geometry.ts (overlap, hull gap, CPA), explain.ts (rule text, explanations, banner text)
  ai/           ai.ts (pre-start holding and approach, beating, laylines, marks, shore, rules-based avoidance)
  courses/      data/*.json (one file per course), course.schema.json, course.ts (loader), registry.ts
  sim/          world.ts (World: fixed 60 Hz step, lines, marks, signals, incidents), events.ts
  replay/       recorder.ts (10 Hz snapshots), replayView.ts (overhead wind-up incident replay)
  render/       three.js scene, boat meshes, landscape, floating labels
  ui/           HUD (pods, dial, map, situation banner, line aid), toasts, horn, 2D drawing helpers
  main.ts       wiring: input, setup screen, incident and results panels, the frame loop
tests/
  diagram.ts    helpers for writing tests like rulebook diagrams
  rules.test.ts classic rules scenarios
  sim.test.ts   course loading, reproducibility, OCS through the real line logic, AI completes both courses
```

### How the pieces fit

- **World** (`sim/world.ts`) owns all race state and advances it with `step(1/60)`. It never touches the DOM or audio; it emits events (`toast`, `horn`, `incident`, `finished`) that `main.ts` turns into UI.
- **Fixed timestep.** `main.ts` accumulates wall-clock time × sim speed and calls `step` in whole 1/60 s steps. Rendering runs at the display rate. With the same seed and inputs a race replays identically (there's a test for this). All sim randomness comes from `World.rng`; `Math.random` is used only for scenery.
- **Rules engine** (`rules/`) is pure: it gets boats (only the fields it needs), a context (race time, wind, marks) and a per-pair record, and returns who keeps clear, under which rule, and any incident. The pair record is the engine's memory (who was inside at the zone, who just gained right of way) and is passed in explicitly.
- **Courses are data.** Every file in `src/courses/data/` shows up in the course picker. Marks have lat/lon (or an offset from the line centre), legs give the rounding side and `round` or `pass`, the start line is either two fixed ends or a centre, bearing and length, and `obstructions` marks the line as an obstruction once racing. See `course.schema.json`.

### Changes from the prototype

The port keeps the prototype's behaviour. These differences are deliberate:

- Three.js r128 → r187. Colour management is turned off and light intensities are scaled by π so the scene looks the same as before.
- Sub-steps are now exactly 1/60 s (they used to be "up to 1/60 s"), and replay snapshots are exactly every 0.1 s.
- AI decisions and boat placement use a seeded RNG instead of `Math.random`.
- Added `[hidden]{display:none}` and `box-sizing` rules. The prototype relied on its host page for these; standalone, the hidden overlays covered the screen.

## Known gaps

- The polar is invented. Acceleration and turn rates are rough.
- Wind is a synthetic oscillation. Current is uniform, with a simple shore-relief factor.
- The shoreline is hand-traced.
- Rules not modelled yet: 14 (beyond the swerve check), 16, 17, 18.3, 19, hails. Mark-room is only modelled for same-tack or downwind approaches. These appear as `todo` entries in `tests/rules.test.ts`.
- Fouls between two AI boats are penalized but not explained.
- The Seaweed Soup start/finish line (race deck → X) is an assumption to check against the sailing instructions.
