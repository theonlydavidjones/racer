# Coordinator handoff (Folkboat sim)

The Coordinator session merges the parallel sessions' PRs into main, builds and publishes. It writes little code itself.

## Publish
- Test the PR merged with current origin/main: `npx tsc --noEmit -p .` and `npm run test:fast` (full `npm test` only for big physics PRs; the perf test is flaky under load, so rerun it alone).
- Merge (GitHub MCP merge_pull_request with expectedHeadSha; stacked or conflicting PRs: merge locally and push to main).
- `npm run build:artifact`, then `node scripts/check/smoke.cjs <dir>`, then publish artifact/folkboat-racing-sim.html to https://claude.ai/artifact/9svTjdwuUY2oSrZ3GMRy1m **without passing capabilities** (db + user carry over; `{}` would switch saves off).
- Live: v176 (13 Nov 2026 UTC: v176 Crew button back #242, waves phase 1 #225, penalty cascade #239, makeBoat doubles #241, heave-to auto #238, season #240, site map #243; v175 v175 mark-rounding drill #237, air temperature #235; v174 v174 tactical debrief #233, Members two lists #234, stand-off spacing #232, perf units #231 (budget 43.1 main-thread); v173 nav back stack #230, season proposal + burgee note #229; v172 v172 wind shadows combine + AI 16.1 all race + lying spacing #226 (perf: main itself 56–57.6 on this host, Capacity checking); v171 v171 ensign hours + ghost check #223, sheet unverified #222, test pool #224 (suite 23 min); v170 v170 Marin shore rock not sand #221; v169 v169 Yacht Club eases in place #220; v168 v168 setup without rebuilds #215; v167 v167 tack and gybe drill #218, 44.1(a)/43.1(a) causal #219, Tacktick #216; v166 v166 start drill #210, 16.1 room #211, band ▾ #212, flag index scroll #208, sheet sources #209, constants citations #202, host rebuild #213, UI audit doc #214; v165 v165 button feedback #194, flag halyards #203, rule 18.3 #204, map layers #205, penalty estimates #206, ghost races #207; v164 crew react #196, surface calm #194 (597f173), course uncertain #199, cheaper sync #200, rules findings #201; v158 tack loss #184, 23.2 #185; v159 shore tacks #187, inset nav #188, car note #186; v160 perf cut; v161 Layers toggles #190, vs winner #191, real past races #192, rules cases #193; v162 the worker #195. Earlier v157: v154 YC members #178 + seats #179, cruise planner #175, same incident #176; v155 flow view #177, line clash #180; v156 course estimate #181, crew fidget #161; v157 crew figures #182, sim/screen boundary #183 (Capacity step 2)). Earlier v153: wind indicator #172, jib sheets #173, YC members #174. Earlier v152: cabin instrument #170, World independence #168, abandonment AI #169, upwind hysteresis #164, pole and number colours #163, halyards #171; v150 rigging #159 + speed pass #160; v151 #162 #166 #167). Perf: main is over the 54.7 budget (about 55–58); Deep Physics is cutting it. A PR's perf failure within main's own range doesn't block it until then. Coordinator is now session_012Uu5Qi2mdDP9G1EYJvp2S4.

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
- Later: desktop release, cruise start/destination on the chart, "Send her home", showroom conditions, boat card pictures, aluminium spars look like plastic.

## Owner preferences
CLAUDE.md has the standing rules (science is prime, ask before big design changes, desktop only, don't relabel). Refer to sessions by name. Plain, short updates.

## Overnight plan (owner, 13 Nov 2026, late)
1. Crew fidgeting (top): Crew Figures leads with Crew Model and Crew Art; crewsettle extended to cruising and all points of sail; no crew-animation merges until calm; live clips to the owner in the morning. crew-anim (owner-approved look) lands on top after.
2. Skipper Model: clear air downwind (the real Nov 1 race), then the avoidance-redesign design note.
3. Rules: findings 4–6; the gybe-as-tack bug with Deep Physics.
4. Deep Physics: #165 after #196, stand-off spacing, then car-lead, 105–115°, z0.
5. Owner feedback: two mid-air lines at the mast (Rigging); slower streaks, none on the inset, separate wind/current choice (Charts); race-setup buttons' feedback (UI).
6. New tonight: start-line drill (Debrief), tack and gybe drill (Crew Controls), constants audit (Bay East), ghost races (Marinas).
Morning for the owner: the second probe (https://claude.ai/artifact/MrGSH6p7nzwa2M2RV9kWpJ), the crew clips, the band's ▾, the vang.
