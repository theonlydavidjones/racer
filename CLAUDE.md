# Folkboat Racing Sim — notes for Claude sessions

A Nordic Folkboat racing simulator (Vite + TypeScript + three.js) for learning racing tactics, the Racing Rules of
Sailing 2025–2028, and racing on San Francisco Bay. The owner is learning to race. See README.md for controls and
ROADMAP.md for what's planned.

## The mission (the owner's words, 13 Nov 2026)

We're building a true-to-life sailing simulator. It's meant to help users learn to sail, improve their sailing
techniques, expand their sailing knowledge, and become a better racer. And it's meant to be as good as actually sailing,
to the maximum reasonable extent.

Toward those aims, there are two modes: racing and cruising. Racing makes you a better sailor, and its main focuses are
tactics, seamanship, helmsmanship, teamwork, and knowledge of conditions and one's boat. Cruising also makes you a better
sailor, but it doesn't have the competitive element in the same way. It's you against yourself, or you and your crew
against yourselves, in an effort to improve while also enjoying the beauty and magic of sailing.

And all of this takes place on the San Francisco Bay, because almost anyone who sails will list it at or near the top of
the best, most interesting and most challenging places to sail. There's no place like it, with its complexity and
variability. It's also beautiful, and both racing and cruising should capitalize as much as possible on the sheer
staggering beauty of this place.

All of this takes place on a Folkboat, because it's arguably the most authentic and pure sailing vessel that a normal
human can own: fully analog, durable, single-handleable, versatile, beautiful and storied. It can be a family weekend
cruiser, or it can cross the Pacific single-handed.

Sailors say two things: if you can sail the Bay, you can sail anywhere; and if you can sail a Folkboat, you can sail
anything. That's what this game amounts to. Our mission is to bring those two truths to anyone who wants them.

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
  Don't pass `capabilities` when publishing: the artifact already declares `db` and `user` (players' saves,
  store/cloud.ts), and leaving the field out keeps them. Passing `{}` would switch saves off.
- The plan lives in ROADMAP.md ("Priorities", at the top): work the next item there, and mark it done when it's published.
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
