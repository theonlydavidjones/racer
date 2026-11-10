# Folkboat Racing Sim — notes for Claude sessions

A Nordic Folkboat racing simulator (Vite + TypeScript + three.js) for learning racing tactics, the Racing Rules of
Sailing 2025–2028, and racing on San Francisco Bay. The owner is learning to race. See README.md for controls and
ROADMAP.md for what's planned.

## The owner's standing rules

- **Science is prime. Physics should always be real.** Wind, current, tide and sea state come from real records and
  forecasts (NOAA, NDBC, NWS): don't invent numbers where data exists, and cite the source in a comment.
- Correct sailing behaviour matters more than visual polish. Sails, flags, telltales and heel must all answer the same
  apparent wind.
- Ask before big design changes. Desktop only (no phone layout).
- Keep building through everything they've asked for. Don't install npm packages without asking.
- Don't relabel things they've named (e.g. the S/P labels).

## Workflow

```bash
npm run test:fast        # ~40 s: everything but the whole-race runs; use while iterating
npm test                 # ~4 min: the full suite (run before publishing)
npx tsc --noEmit -p .    # type check
npm run build:artifact   # → artifact/folkboat-racing-sim.html (the published page)
node scripts/check/smoke.cjs <out-dir>        # ~2 min: the built page in headless Chromium, fails on page errors
npm run dev & node scripts/check/sail-views.cjs <out-dir>   # the boat from both sides on both tacks
```

- Publish by republishing artifact/folkboat-racing-sim.html to the existing artifact
  (https://claude.ai/artifact/9svTjdwuUY2oSrZ3GMRy1m), never as a new one.
- Commit and push after each finished piece, on the session's branch.
- Anything that should look the same from either side of the boat (sails, numbers, flags, crew) must be checked from
  both sides on both tacks, not from one view.
- Dev handles on `window` (dev server only): `sim()`, `__look(yaw, pitch, dist)`, `__view`, `__twa(angle)` (showroom tack).

## Helpers (.claude/agents)

Use them; they're cheaper than doing it all yourself and catch what the author misses.

- **researcher** (lighter model, read-only): any "what's true in real life" question before building: data, specs,
  class rules, RRS text, places. It returns facts with sources. Run several in parallel for independent questions.
- **visual-checker** (lighter model): after any change to what's drawn, before publishing. It renders both tacks from
  both sides and checks against a sailor's checklist.
- **physics-reviewer** (strongest model, read-only): before publishing any change under src/boat, src/environment,
  src/sim, src/ai or src/rules. An independent review against the science and the RRS; fix what it confirms.

Keep the core simulation work (physics, world, main loop) in the main session: those files are shared, so splitting
them across agents makes conflicting edits.

## Conventions

- Boat frame: bow toward −z, starboard +x. Traveller: −1 windward … +1 leeward.
- Sail pictures (render/boatMesh.ts `sailTexture`) are in the cloth's own uv (u luff→leech, v foot→head): draw
  everything where it physically is; only the starboard set of figures runs back to front.
- Comments explain the sailing or physics reason, in plain words.
