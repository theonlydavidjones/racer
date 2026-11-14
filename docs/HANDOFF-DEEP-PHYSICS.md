# Deep Physics: handoff (updated 14 Nov 2026, early; Fable session)

Supersedes the copy on branch `rudder` (kept there for its "things not to relearn", which still hold).

## Branches

| Branch | State | What's left |
|---|---|---|
| `turning` (no PR; PR note sent to the Coordinator) | The owner-approved force-based turn, with `shore-relief` (windage) and the class rudder inside it. Feature-complete, physics-reviewed (six findings fixed), main 73e8d65 merged. Full suite on 2ff0ab4: every whole-race test passes. test:fast on 071c957: 10 fail, each with an owner (six wait on the owner's helm answer; two are rule 20, fixed on Rules' `rules-turning`; crew flicker; Marinas' docking rule). | The Coordinator batches it after car-lead and the crew fixes. Rules PRs `rules-turning` into it. Rerun the full suite on the head if asked. When the helm answer comes: calibrate the sails' moment (balance.ts sailYaw), re-measure the tables, and the six tests should come back. |
| `shore-relief` (no PR, 2de1c5b) | Inside `turning`. Kept in step with main in case the windage is wanted on main sooner. | Nothing unless the Coordinator asks. |
| `car-lead` (PR #236, a391473, main merged) | Ships inside Boat Detail's combined PR (claude/bow-lines-ship); the Coordinator closes #236. Its yardstick failure was sampling; its every-step fouls equal main's over 64 seeds; perf clear on the Coordinator's host. | Look over Boat Detail's world.ts resolution (dockStep: the jib's line, swallowed by a comment on main too). |
| `red-loop` (fb385c9) | A repro for Skipper Model, not for merging: main at batch 34 + car-lead, where Red orbits the last mark after a penalty (seed 11, SS2 course 2, ebb). | Delete when Skipper Model is done. |
| `mainsheet-point` (PR #165) | Unchanged: waits on Crew Figures' crew-still. | |
| `rudder` | Superseded by `turning`. | Delete once `turning` lands. |

## Turning: what's measured (071c957)

- Turning circle 9.3 m radius at every speed. Crew tack at 12 kt: 3.3 s head to wind, lowest speed 0.63, planner's cost 3.9 s (measured on mirrored courses). Sculled turn 4.4°/s by the standard stroke.
- Weather helm 0.4° at 12 kt, 1.5° at 20 kt: light, flagged.
- Bare poles she lies with the wind near her beam (computed). A 720 on the tiller alone is about 80 s (the reviewer suspects the hard-over drag is high for a keel-hung blade).
- HOVE.rudderFlow 0.4, tuned to the hove-to observations with the class blade (0.4–0.5 hold them).
- Perf: a lone boat's step +0.7 µs on 13.1; the fleet test reads the same as main within its noise on this host.

## Turning: flagged, not settled

- The sails' turning moment (weather helm), the stall angle and post-stall force of a keel-hung blade, the sculling stroke (60°, 1 Hz, 2:1) and a hand's 180°/s, the crew's windage term and lever (the bare-poles lie hangs on it), the keys' half-pace return.
- heaveTo's b.helm is the raw tiller, unslewed. rudderForce books the blade's lift and drag in the boat's axes without turning them through the inflow angle (a few newtons at rudderFlow 0.4).
- The coach's heave-to sequence test sits on a knife edge (the main's luff reads 0.17 against 0.15 on main): it passed at rudderFlow 0.40 and failed at 0.38 and 0.42.

## Queue after turning

- ROADMAP 8n point 4: eddies at the Gashouse Cove entrance, on Bay East's current field (bay-east-15 and their harbor-wall lee). The research is in reference/research/gashouse-entrance-eddies.md. NEXT.
- Audit #23's remainder (see `rudder`'s copy), now including: calAt's clamp (the sail model's raw drive falls short of the polar's need in two cells in five).

## Owner asks out (through the Coordinator)

1. Josephine's weather helm close-hauled in 15–20 kt.
2. The jib car's position.
3. How she lies left alone with her sails down, and how long her bow takes to fall off.
4. (Useful) her own timed 720.

## Things learned this session

- The approx yardstick's penalty check was noise-limited (±7 on a margin of 10 over 16 races); Rules replaced it with a paired per-seed test over 48 races.
- The owner's "drifts to windward under bare poles" was the tidal stream inside Gashouse Cove on main (0.30–0.35 kt), fixed by bay-east-15's basin calm; Bay East has the repro as a test.
- Run perf.test only on a quiet machine; anything beside it taints it. A lone-boat benchmark (cpuUsage over 36,000 steps) resolves 5% where the fleet test can't resolve 3%.
- Scratch tests go in tests/zz-*.test.ts (ignored locally via .git/info/exclude) and write to a file: console output is swallowed.
