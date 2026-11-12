# Coordinator handoff (Folkboat sim)

The Coordinator session merges the parallel sessions' PRs into main, builds and publishes. It writes little code itself.

## Publish
- Test the PR merged with current origin/main: `npx tsc --noEmit -p .` and `npm run test:fast` (full `npm test` only for big physics PRs; the perf test is flaky under load, so rerun it alone).
- Merge (GitHub MCP merge_pull_request with expectedHeadSha; stacked or conflicting PRs: merge locally and push to main).
- `npm run build:artifact`, then `node scripts/check/smoke.cjs <dir>`, then publish artifact/folkboat-racing-sim.html to https://claude.ai/artifact/9svTjdwuUY2oSrZ3GMRy1m **without passing capabilities** (db + user carry over; `{}` would switch saves off).
- Live: v132 (12 Nov 2026). Coordinator is now session_012Uu5Qi2mdDP9G1EYJvp2S4.

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

## Queued for idle sessions (see ROADMAP.md)
- Crew Controls: original flag motion + "Strike ensign" button (cruise, high wind).
- Later: desktop release, cruise start/destination on the chart, "Send her home", showroom conditions, boat card pictures, aluminium spars look like plastic.

## Owner preferences
CLAUDE.md has the standing rules (science is prime, ask before big design changes, desktop only, don't relabel). Refer to sessions by name. Plain, short updates.
