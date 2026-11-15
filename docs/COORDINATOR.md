# Coordinator handoff (Folkboat sim)

The Coordinator session merges the parallel sessions' PRs into main, builds and publishes. It writes little code itself.

## Publish
- Test the PR merged with current origin/main: `npx tsc --noEmit -p .` and `npm run test:fast` (full `npm test` only for big physics PRs; the perf test is flaky under load, so rerun it alone).
- Merge (GitHub MCP merge_pull_request with expectedHeadSha; stacked or conflicting PRs: merge locally and push to main).
- `npm run build:artifact`, then `node scripts/check/smoke.cjs <dir>`, then publish artifact/folkboat-racing-sim.html to https://claude.ai/artifact/9svTjdwuUY2oSrZ3GMRy1m **without passing capabilities** (db + user carry over; `{}` would switch saves off).
- Live: v178 (13 Nov 2026 UTC). Recent: v178 US spelling #251, 2026–27 season #252; v177 rope ticks #245, dial under map #244, landmarks + Sutro #246, 7 Nov race #247, USA 122 #248, skipper names out #249; v176 Crew button #242, waves phase 1 #225, penalty cascade #239, makeBoat doubles #241, heave-to auto #238, season #240, site map #243; v175 mark-rounding drill #237, air temperature #235; v174 tactical debrief #233, Members #234, stand-off #232, perf units #231 (budget 43.1, main-thread median of 3). Earlier releases are in git log. Perf rule (owner): one rerun on code that doesn't touch the step. Coordinator: session_012Uu5Qi2mdDP9G1EYJvp2S4.

- Only the Coordinator publishes the live artifact, plus the owner's daily real-weather refresh (scheduled task trig_01Jc4kpKT8RFLcqgBnHuBvUC, 04:41 Pacific), which now builds from main and commits its data first. (Before 12 Nov it built an old branch and overwrote the live page.)
- No quiet window. Capacity step 3 (#195, the race in a Web Worker with a mirror World on the page) landed in v162 (13 Nov 07:00 UTC). New per-step World state syncs to the mirror automatically; tests/sync.test.ts names any miss. Page size 9.2 MB (worker 4.1 MB).

## Usage rules (owner)
- Manage the 5-hour window: at most ~3 build sessions working at once; lean reviews (one physics-reviewer round for sim/physics/AI/rules, one visual-checker round for drawn changes); test:fast while iterating.
- Keep the Coordinator's own context small: don't read big diffs or renders; trust the sessions' reviews and the tests.

## Sessions (send_message to their ids)
| Name | id | Owns / doing |
|---|---|---|
| Boat Detail | session_012Uu5QmV9iF1ojR2hFeYX1a | **P0 boat model**: cockpit to the plan (branch claude/cockpit-plan, lands with Crew Figures), then interior that reads as 3D by day + the translucent panel over the companionway at night, then interior true to a real Folkboat, then deck hardware/lines. Screenshots to the owner before each PR. |
| Crew Figures | session_012Uu5QiXrMLFqZYcrUp8g2b | Crew drawing/animation, crewPhys/crewWork. Adapting the crew to the new cockpit (one combined PR with Boat Detail). Skill tiers + "why" status line for the pole-out foredeck move. |
| Deep Physics | session_012Uu5QkwUEDY7sN1x6b1deP | src/boat, src/environment, src/ai, src/rules physics. Next: gusts/turbulence vs records; sails-up sternway/leeway for the AI. |
| Charts | session_012Uu5Qi9YBAXa3joTxFttkc | Map, chart, bridges. Waiting for Bay East's ENC land, then Lime Point render fit (branch claude/lime-point). |
| Bay East | session_012Uu5QjZTdN1JNsYj2wpzVB | Ranked #9: the flags' original motion and Strike ensign (East Bay world done). |
| Crew Controls | session_012Uu5QjU5RR6EcpHKNKPU9j | The sail controls band (ranked #3, from the UI & Experience mock-up), then HUD and controls. |
| Marinas | session_012Uu5QhY7i2pxWmAtAggWhz | Ranked #8: Home button, Move her here, setup chart, conditions mid-sail. |
| Roadmap | session_012Uu5QhnkGorfpUrV4bt4Lt | Takes the owner's feedback, files it in ROADMAP.md, sends "now" bugs to the Coordinator. Builds nothing. |
| UI & Experience | session_012Uu5QhhvZC9XxYh89Bbjtr | Design only: the sail controls band mock-up (ROADMAP Priorities #3), UI vision. No src/ changes until the owner agrees; agreed builds come to the Coordinator. |
| Rules | session_012Uu5QmJbE8BAU8Bo9CJqzC | Ranked #6: finish the racing rules (20.3, 20.2(e), blanketing for Rule 23, a boat as obstruction). |
| Debrief | session_012Uu5QjfJMjn9aQ2ePP43Wo | Ranked #7: the debrief shown on the replay. Layout to the owner first. |
| Rigging | session_012Uu5Qheec6yzUhFvm29AbD | Rig tuning and its physics (rake, shrouds, chocks, backstay, mast bend, forestay sag). Proposal to the owner before the player-facing build. |
| Crew Art | session_012Uu5Qj44Huy8UKbWdRbcmp | The crew figures' bodies and clothing from scratch (owner rejected four rounds as uncanny); design sheets first, animation out of scope. |
| Skipper Model | session_012Uu5QhdsE8mzR3eTig8z6T | The skipper model: calibration from real results, skipper attributes, acting on beliefs, Yacht Club sliders. Proposal first. |
| Capacity | session_012Uu5Qmx1z6ZjLTAghb44YC | Owner (12 Nov): hold the budget, but find more capacity without lowering physics fidelity. Phase 1 is a measured design, docs/CAPACITY.md; building after the owner approves. |
| Crew Model | session_012Uu5QmLu8ikoQmaAM5B6R4 | The crew model: roles and skills driving trim, puff calls, crew work, fatigue. Proposal first. |

## Queued for idle sessions (see ROADMAP.md)
- Crew Controls: original flag motion + "Strike ensign" button (cruise, high wind).
- Later: desktop release, cruise start/destination on the chart, "Send her home", showroom conditions, boat card pictures, aluminum spars look like plastic.

## Owner preferences
CLAUDE.md has the standing rules (science is prime, ask before big design changes, desktop only, don't relabel). Refer to sessions by name. Plain, short updates.

## Overnight plan (15 Nov 2026)
**v197 (batch 42), cut at 10:00 UTC** with whatever has passed its gates; the rest rolls to v198. Already in: rule 31, the
navigator in the big chart (#383), the trim coach (light/medium/heavy air, IDEAL; last copy fixes in), the confetti fix,
the protest flag, #367–#381, #335–#366, the debrief telltale tip. In if they clear tonight: the push-off, the crew chain
(#347 → #348 → seat-swap → #377 bow walk), the Bay East planner, tiller lash, chart expand (top-right), instrument riser.
NOW items, who has them:
- Start drill (cue card, no fleet, results table and copy, restart key): Debrief, one PR, stills to the owner.
- Gashouse push-off: Deep Physics + Marinas, in review. The cove's sudden wind/current edge (8n.5): Bay East, v198.
- Backwards arms: Crew Figures confirms every pose from both sides as part of #377; then the paddling animation.
- Aquatic Park seawall (navigator): #337, in v197. Chart layers: Charts, layer-toggle speed PR. Navigator in the big chart: #383.
- Confetti on the sails: fixed (rope shadows), in v197. Lashing under 13°: Crew Art. Jib cars / boom in the slip: small fixes
  with Rigging after its depower PR. Chart subtitle: Charts after the layers.
- Tools tray (compact, "Tools", Hail stays top level, no F-keys): UI & Experience, stills first.
- Paddle: fatigue by fitness (Crew Model, after the crew chain); ‹ PADDLE › arrows (Crew Controls).
- Fort Mason Center lettering (8n.6): waits on the owner's photo or the photo sites.
Morning for the owner: v197 live, stills for the Tools tray, the start-drill screen, the chart expand.

## Lighter models (owner, 15 Nov 2026: "switch to lighter models for sessions that can still be effective with them")
When one of these finishes its current item, archive it and start its successor on claude-sonnet-5-5 with a handoff
prompt (its branch, its queue, the rules): Crew Art, Boat Detail, Crew Controls, Marinas, Debrief, Charts, Rigging,
UI & Experience, Roadmap. Kept on the strongest model: Deep Physics, Bay East, Rules, Skipper Model, Crew Model,
Crew Figures (rigging the figures), Capacity, the Coordinator. The physics-reviewer agent stays on the strongest.

### Handoffs (retired sessions)
- **Boat Detail** (retired 15 Nov 18:35): #423 Fort Mason for v199. Unopened: claude/outboard-detail (10f8b9a4, the
  cowl and kill cord polish), which needs main merged, the checks and perf-ab. landscape.ts estimates are labeled
  (SHED_H 15.5 m, roof, monitors, arches); the shed widths come from NHL 85002433 via search snippets, to verify when
  npgallery, loc.gov or overpass are reachable. Pier numbering: the NHL numbers Piers 1–3 west to east, opposite to OSM's
  names in geo/fortMason.ts; a researcher should settle which is official before anything is renamed. Watch #416
  (single-pass sail windows) for sort artifacts at grazing angles. Waiting on the owner: the jib car tape measurements;
  ROADMAP 9a (the bow profile, "too full and round") when they say. The coach simguard write is fixed by #418.
- **Crew Art** (retired 15 Nov 14:25): #418 coach no-write fix (pure `rigOf()` for the coach; physics keeps `mainRig()`;
  fingerprints identical, perf-pair 0.9914) for v198, with #409, #410, #412. Unstarted, no PR: branch crew-summer
  (cf066789), the crew dressed for rain and season, after the crew-figure order lands. Stills branch stills/flags-tile
  can be deleted. Tips: headless Chromium runs 1–2 frames/s, so wait on state, not time; perf.test needs --silent=false
  to print its ratio. Bay East wants to hear first if rain ever damps the sea or the wind.
- **UI & Experience** (retired 15 Nov 10:15): #393 trim coach + keys, #400 map expand, #405 Tools tray, all in batch 42.
  Branches ui/trim-coach, ui/map-expand, ui/tools-tray, design/features-tray (mock). Keys: no F-keys (tests/keys.test.ts);
  Shift T Trim Notes, F frame readout, Z/X traveler, P points of sail, R drill restart, J jibe-ho; keydown via keyOf(e).
  Follow-ups: a Points of sail tile in the Tools tray; Capacity's perf-readout words in it; ROADMAP "the trim coach's
  promise in light air". Coach simguard write (coach.ts `{ ...b, tune: undefined, rigMain: undefined }`): since #393 the
  coach runs in the worker; if it fires, look at the guarded proxy's spread and rigTune.ts/condition.ts writes.
- **Crew Controls** (retired 15 Nov 09:20): #401 rounding prep is a draft on rounding-prep bde1024f, held on the crew
  chain's +6.7% (prep alone 0.9904 vs 6009bb9c); once the chain lands, merge main, run npm test + perf-pair --ai.
  #389, #376, #390 in batch 42 (stills on claude/setup-seats-shots). Not started: TACK_SETTLE exemption for the prep
  when drive-blend lands (`&& !prep`); letting a held backed jib sheet fly (Deep Physics' made-fast sheet, branch turning).
